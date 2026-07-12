import { Injectable, BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PaperSize, PricingTier, PrintType, Unit, LargeFormatPricing, Material } from '../../../entities';
import { Printer } from '../entities/printers.entity';
import { Scope, ScopeFlags, resourceInScope, validateScopeFlags, deriveScopeLabel } from '../scope/resource-scope-rule';
import { UpdateScopeDto } from '../dto/update-scope.dto';
import { tierPricePerSheet, isCostDrift } from '../lib/tier-cost';
import { deriveTierCost, PrinterCostProfile, InkConfig, TierCostBreakdown, inkSizeFactor, deriveLfCost, LfCostBreakdown } from '../lib/cost-derivation';

/** Toàn bộ Phạm_Vi canonical hợp lệ cho tham số lọc của paper-sizes (offset + 3 loại in nhanh). */
const VALID_SCOPES: Scope[] = ['offset', 'loose', 'bound', 'large_format'];

/**
 * Map một entity `PaperSize` (props camelCase boolean) sang `ScopeFlags` snake_case dùng chung,
 * để lọc qua Quy_Tắc_Phạm_Vi canonical. Quy tắc group-agnostic (Req 1.6) hấp thụ boolean tại `isOn`.
 */
function toPaperSizeScopeFlags(ps: PaperSize): ScopeFlags {
    return {
        scope_loose: ps.scopeLoose,
        scope_bound: ps.scopeBound,
        scope_large_format: ps.scopeLargeFormat,
        scope_offset: ps.scopeOffset,
    };
}

/**
 * Khổ giấy lớn có đọc được kích thước không (2 số dạng "79cm x 109cm" / "79x109").
 * Engine offset (`docKichThuocCm`) cần khổ giấy lớn để dàn khuôn; thiếu → lỗi lúc TÍNH GIÁ.
 * Chặn ngay lúc GHI để không sinh bản ghi khổ offset không dùng được (fail fast, Req dữ liệu sạch).
 */
function khoGiayLonReadable(s: unknown): boolean {
    if (typeof s !== 'string') return false;
    return /([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)/i.test(s);
}

/**
 * Loại kẽm hợp lệ cho khổ offset. Engine (`lookups.ts chiPhiLamKem/chiPhiBinhBai`) so khớp
 * `=== 'Kẽm lớn'`, mọi giá trị khác (kể cả null) âm thầm rơi về nhánh "Kẽm nhỏ" → giá sai
 * không nổ lỗi. Chặn ngay lúc GHI: khổ offset phải chọn đúng một trong hai loại kẽm.
 */
function loaiKemValid(s: unknown): boolean {
    return s === 'Kẽm nhỏ' || s === 'Kẽm lớn';
}

@Injectable()
export class MasterDataService {
    constructor(
        @InjectRepository(PaperSize) private paperRepo: Repository<PaperSize>,
        @InjectRepository(PricingTier) private tierRepo: Repository<PricingTier>,
        @InjectRepository(PrintType) private printRepo: Repository<PrintType>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        @InjectRepository(Printer) private printDeviceRepo: Repository<Printer>,
        @InjectRepository(LargeFormatPricing) private lfTierRepo: Repository<LargeFormatPricing>,
        @InjectRepository(Material) private materialRepo: Repository<Material>,
    ) { }

    // --- Paper Sizes ---
    /**
     * Liệt kê Khổ_Giấy, lọc Phạm_Vi qua Quy_Tắc_Phạm_Vi canonical (`resourceInScope`) —
     * nguồn sự thật duy nhất, thay cho điều kiện `where` rải rác trước đây.
     *
     * - Có `scope` (offset|loose|bound|large_format): chỉ trả khổ giấy thuộc Phạm_Vi đó theo canonical.
     * - `activeOnly`: bảng `paper_sizes` KHÔNG có cột `is_active` → tham số là no-op (mọi khổ giấy coi
     *   như đang hoạt động). Vẫn nhận để đồng nhất ScopeListQuery với các endpoint khác.
     * - Không truyền `scope`: hành vi tương thích ngược — trả TẤT CẢ (không phá nơi gọi cũ).
     *
     * Entity dùng camelCase boolean (scopeLoose…) → map sang ScopeFlags snake_case trước khi gọi
     * canonical; quy tắc group-agnostic (Req 1.6) xử lý boolean đúng tại `isOn`.
     *
     * _Requirements: 1.3, 1.4, 1.6, 3.1, 3.6, 4.1, 4.2_
     */
    async findAllPaperSizes(scope?: string, _activeOnly?: boolean) {
        const all = await this.paperRepo.find({ order: { name: 'ASC' } });

        if (scope && VALID_SCOPES.includes(scope as Scope)) {
            return all.filter((ps) => resourceInScope(toPaperSizeScopeFlags(ps), scope as Scope));
        }

        return all;
    }
    async findPaperSizeById(id: string) { return this.paperRepo.findOne({ where: { id: parseInt(id) } }); }
    async createPaperSize(data: Partial<PaperSize>) {
        // Khổ offset PHẢI có khổ giấy lớn đọc được — nếu không, engine không dàn khuôn được (lỗi lúc tính giá).
        if (data.scopeOffset && !khoGiayLonReadable(data.khoGiayLon)) {
            throw new BadRequestException('Khổ in Offset phải có "Khổ giấy lớn" hợp lệ (VD: 79cm x 109cm).');
        }
        // Khổ offset PHẢI chọn loại kẽm hợp lệ — null/sai chuỗi → engine âm thầm tính theo "Kẽm nhỏ" (giá sai).
        if (data.scopeOffset && !loaiKemValid(data.loaiKem)) {
            throw new BadRequestException('Khổ in Offset phải chọn Loại kẽm ("Kẽm nhỏ" hoặc "Kẽm lớn").');
        }
        return this.paperRepo.save(this.paperRepo.create(data));
    }
    async updatePaperSize(id: string, data: Partial<PaperSize>) {
        const existing = await this.paperRepo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new NotFoundException('Paper size not found');
        // Xác định trạng thái offset SAU cập nhật (payload ghi đè, thiếu → giữ giá trị cũ).
        const willBeOffset = data.scopeOffset ?? existing.scopeOffset;
        const finalKhoGiayLon = data.khoGiayLon ?? existing.khoGiayLon;
        if (willBeOffset && !khoGiayLonReadable(finalKhoGiayLon)) {
            throw new BadRequestException('Khổ in Offset phải có "Khổ giấy lớn" hợp lệ (VD: 79cm x 109cm).');
        }
        const finalLoaiKem = data.loaiKem ?? existing.loaiKem;
        if (willBeOffset && !loaiKemValid(finalLoaiKem)) {
            throw new BadRequestException('Khổ in Offset phải chọn Loại kẽm ("Kẽm nhỏ" hoặc "Kẽm lớn").');
        }
        await this.paperRepo.update(parseInt(id), data);
        return this.paperRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deletePaperSize(id: string) { await this.paperRepo.delete(parseInt(id)); }

    /**
     * Cập nhật Cờ_Phạm_Vi cho một Khổ_Giấy (Màn_Quản_Trị_Phạm_Vi).
     *
     * `paper_sizes` dùng BOOLEAN camelCase (`scopeLoose/scopeBound/scopeLargeFormat/scopeOffset`) ↔
     * DB snake_case. Validate qua `validateScopeFlags` TRƯỚC khi ghi (smallint 0/1, offset bool);
     * không hợp lệ → 422 + `invalidFlags`, KHÔNG ghi (giữ nguyên giá trị cũ — Req 5.8). Cờ smallint
     * 0/1 chuyển sang boolean khi ghi. Trả tài nguyên sau cập nhật + nhãn `deriveScopeLabel`.
     *
     * _Requirements: 5.1, 5.2, 5.5, 5.8, 6.2_
     */
    async updatePaperSizeScope(id: string, dto: UpdateScopeDto) {
        const existing = await this.paperRepo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new NotFoundException('Paper size not found');

        const validation = validateScopeFlags(dto);
        if (!validation.ok) {
            throw new UnprocessableEntityException({ success: false, invalidFlags: validation.invalidFlags });
        }

        // Cột boolean → chuyển smallint 0/1 sang false/true; scope_offset đã là boolean.
        if (dto.scope_loose !== undefined) existing.scopeLoose = !!Number(dto.scope_loose);
        if (dto.scope_bound !== undefined) existing.scopeBound = !!Number(dto.scope_bound);
        if (dto.scope_large_format !== undefined) existing.scopeLargeFormat = !!Number(dto.scope_large_format);
        if (dto.scope_offset !== undefined) existing.scopeOffset = dto.scope_offset;

        // Cùng bất biến với create/update: khổ offset PHẢI có khổ giấy lớn đọc được,
        // nếu không engine dàn khuôn sẽ nổ lúc báo giá. Chặn cả đường vòng qua màn Scope.
        if (existing.scopeOffset && !khoGiayLonReadable(existing.khoGiayLon)) {
            throw new BadRequestException('Khổ in Offset phải có "Khổ giấy lớn" hợp lệ (VD: 79cm x 109cm).');
        }
        if (existing.scopeOffset && !loaiKemValid(existing.loaiKem)) {
            throw new BadRequestException('Khổ in Offset phải chọn Loại kẽm ("Kẽm nhỏ" hoặc "Kẽm lớn").');
        }

        await this.paperRepo.save(existing);
        const updated = (await this.paperRepo.findOne({ where: { id: parseInt(id) } }))!;
        return { data: updated, scopeLabel: deriveScopeLabel(toPaperSizeScopeFlags(updated)) };
    }

    // --- Pricing Tiers ---
    /**
     * Liệt kê định mức in nhanh, kèm cột phái sinh `cost_drift`: giá vốn giấy trong tier
     * (`paper_cost`) đã lệch với `materials.cost_price` hiện tại chưa (nhập lô mới làm cost_price
     * đổi). FE dùng để hiện badge "giá vốn đã đổi" + nút đồng bộ. Không tự đè — tránh phá số nhập tay.
     */
    async findAllTiers(materialId?: string) {
        const qb = this.tierRepo.createQueryBuilder('pt')
            .leftJoin(Material, 'm', 'm.id = pt.materialId')
            .addSelect('m.cost_price', 'current_cost_price')
            .orderBy('pt.quantityFrom', 'ASC');
        if (materialId) qb.where('pt.materialId = :materialId', { materialId: parseInt(materialId) });

        const { entities, raw } = await qb.getRawAndEntities();
        return entities.map((tier, i) => {
            const currentCost = raw[i]?.current_cost_price != null ? Number(raw[i].current_cost_price) : null;
            const costDrift = isCostDrift(currentCost, tier.paperCost);
            return { ...tier, current_cost_price: currentCost, cost_drift: costDrift };
        });
    }
    async findTierById(id: string) { return this.tierRepo.findOne({ where: { id: parseInt(id) } }); }
    async createTier(data: Partial<PricingTier>) {
        this.normalizeTierCost(data);
        await this.checkTierOverlap(data);
        return this.tierRepo.save(this.tierRepo.create(data));
    }
    async updateTier(id: string, data: Partial<PricingTier>) {
        const existing = await this.tierRepo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new BadRequestException('Tier not found');

        this.normalizeTierCost(data, existing);
        await this.checkTierOverlap({ ...existing, ...data }, parseInt(id));
        await this.tierRepo.update(parseInt(id), data);
        return this.tierRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteTier(id: string) { await this.tierRepo.delete(parseInt(id)); }

    /**
     * Chuẩn hoá chi phí tier: giá vốn thuần/tờ = paper + ink + machine + labor + overhead (5 thành phần).
     * - Nếu client gửi bất kỳ thành phần nào → tự tính price_per_sheet = tổng 5 (phần thiếu lấy từ
     *   existing khi update, hoặc 0 khi create).
     * - Nếu chỉ gửi price_per_sheet (đường cũ) → giữ nguyên, không phá tương thích.
     * KHÔNG cộng markup — markup áp một lần ở facade (calculateSellingPrice). Đây là giá vốn thuần.
     * `existing` (update) để lấy phần chưa gửi lại từ bản ghi cũ.
     */
    private normalizeTierCost(data: Partial<PricingTier>, existing?: PricingTier) {
        const touched = data.paperCost != null || data.inkCost != null
            || data.machineCost != null || data.laborCost != null || data.overheadCost != null;
        if (!touched) return; // đường cũ chỉ gửi price_per_sheet
        const paper = Number(data.paperCost ?? existing?.paperCost ?? 0);
        const ink = Number(data.inkCost ?? existing?.inkCost ?? 0);
        const machine = Number(data.machineCost ?? existing?.machineCost ?? 0);
        const labor = Number(data.laborCost ?? existing?.laborCost ?? 0);
        const overhead = Number(data.overheadCost ?? existing?.overheadCost ?? 0);
        data.paperCost = paper;
        data.inkCost = ink;
        data.machineCost = machine;
        data.laborCost = labor;
        data.overheadCost = overhead;
        data.pricePerSheet = tierPricePerSheet(paper, ink, machine, labor, overhead);
    }

    /**
     * Đồng bộ giá vốn giấy từ `materials.cost_price` vào các tier: set paper_cost = cost_price,
     * cập nhật price_per_sheet = paper_cost + ink_cost, ghi cost_synced_at. Chỉ chạy khi người
     * dùng BẤM (không tự động) — tránh đè số nhập tay. Trả số tier đã đồng bộ.
     * @param materialId nếu có → chỉ material đó; không → mọi tier có material cost_price > 0.
     */
    async syncCostFromMaterial(materialId?: string): Promise<{ synced: number }> {
        const where: Record<string, unknown> = {};
        if (materialId) where.materialId = parseInt(materialId);
        const tiers = await this.tierRepo.find({ where });
        let synced = 0;
        const now = new Date();
        // Nạp trước cost_price của mọi material liên quan trong 1 query (tránh N+1 findOne trong vòng lặp).
        const materialIds = [...new Set(tiers.map((t) => t.materialId).filter((id): id is number => id != null))];
        const costById = new Map<number, number>();
        if (materialIds.length) {
            const materials = await this.materialRepo.find({ where: { id: In(materialIds) } });
            for (const m of materials) costById.set(m.id, m.costPrice != null ? Number(m.costPrice) : 0);
        }
        for (const tier of tiers) {
            const cost = costById.get(tier.materialId) ?? 0;
            if (cost <= 0) continue; // không có giá vốn → bỏ qua, không zero-hoá tier
            tier.paperCost = cost;
            // Đồng bộ chỉ đổi phần GIẤY; giữ nguyên mực/máy/công/overhead đã có.
            tier.pricePerSheet = tierPricePerSheet(
                cost,
                Number(tier.inkCost ?? 0),
                Number(tier.machineCost ?? 0),
                Number(tier.laborCost ?? 0),
                Number(tier.overheadCost ?? 0),
            );
            tier.costSyncedAt = now;
            await this.tierRepo.save(tier);
            synced++;
        }
        return { synced };
    }

    /**
     * GỢI Ý giá định mức từ chi phí (tầng 3) — KHÔNG ghi DB, chỉ trả breakdown để FE xem trước.
     * Đọc: giá vốn giấy (materials.cost_price), mực (ink_costs theo print_type), hồ sơ chi phí
     * máy (printers). Trả 5 thành phần + tổng/tờ cho MỖI mốc số lượng. Markup KHÔNG áp ở đây
     * (facade lo) — đây là giá vốn thuần. Người dùng xem, sửa được, rồi mới bấm lưu tạo tier.
     */
    async suggestTierCost(input: {
        material_id: number;
        printer_id?: number;
        print_type?: string;
        sides?: number;
        paper_size_id?: number;
    }): Promise<{ breakdown: TierCostBreakdown; paperSizeName: string | null }> {
        const material = await this.materialRepo.findOne({ where: { id: Number(input.material_id) } });
        if (!material) throw new BadRequestException('Không tìm thấy vật tư.');
        const paperCost = material.costPrice != null ? Number(material.costPrice) : 0;

        // Mực: ink_costs theo print_type (raw SQL — không có entity). Thiếu → null → mực 0.
        let ink: InkConfig | null = null;
        if (input.print_type) {
            const rows = await this.materialRepo.manager.query(
                'SELECT ml_per_sheet, price_per_ml FROM ink_costs WHERE print_type = $1 AND is_active = true LIMIT 1',
                [input.print_type],
            ).catch(() => []);
            if (rows?.length) ink = { mlPerSheet: Number(rows[0].ml_per_sheet), pricePerMl: Number(rows[0].price_per_ml) };
        }

        // Hồ sơ chi phí máy (nếu chọn máy). Không chọn → máy/công/overhead = 0.
        let printer: PrinterCostProfile | null = null;
        if (input.printer_id) {
            const p = await this.printDeviceRepo.findOne({ where: { id: Number(input.printer_id) } });
            if (p) printer = {
                machineValue: p.machineValue, depreciationYears: p.depreciationYears,
                sheetsPerMonth: p.sheetsPerMonth, electricityPerHour: p.electricityPerHour,
                sheetsPerHour: p.sheetsPerHour, staffCount: p.staffCount,
                avgSalaryMonthly: p.avgSalaryMonthly, rentMonthly: p.rentMonthly,
                utilitiesMonthly: p.utilitiesMonthly, otherMonthly: p.otherMonthly,
            };
        }

        // Hệ số khổ cho mực (bảng cứng như generator gốc). Tra theo tên khổ giấy nếu có.
        let sizeFactor = 1;
        let paperSizeName: string | null = null;
        if (input.paper_size_id) {
            const ps = await this.paperRepo.findOne({ where: { id: Number(input.paper_size_id) } });
            if (ps) {
                paperSizeName = ps.name;
                sizeFactor = inkSizeFactor(ps.name);
            }
        }

        const breakdown = deriveTierCost({
            paperCost, ink, printer,
            sizeFactor,
            sides: Number(input.sides) || 1,
        });
        return { breakdown, paperSizeName };
    }

    private async checkTierOverlap(data: Partial<PricingTier>, excludeId: number = 0) {
        if (!data.materialId || !data.paperSizeId) return; // Basic validation would handle this

        const query = this.tierRepo.createQueryBuilder('pt')
            .where('pt.materialId = :materialId', { materialId: data.materialId })
            .andWhere('pt.paperSizeId = :paperSizeId', { paperSizeId: data.paperSizeId })
            .andWhere('pt.printSide = :printSide', { printSide: data.printSide || 'single' })
            .andWhere('pt.printType = :printType', { printType: data.printType || '4c' })
            .andWhere('pt.technology = :technology', { technology: data.technology || 'digital_toner' });
            
        if (excludeId) {
            query.andWhere('pt.id != :excludeId', { excludeId });
        }

        const existingTiers = await query.getMany();
        
        const qFrom = data.quantityFrom || 0;
        const qTo = data.quantityTo !== null && data.quantityTo !== undefined ? data.quantityTo : Number.MAX_SAFE_INTEGER;

        for (const tier of existingTiers) {
            const eFrom = tier.quantityFrom || 0;
            const eTo = tier.quantityTo !== null && tier.quantityTo !== undefined ? tier.quantityTo : Number.MAX_SAFE_INTEGER;
            
            if (qFrom <= eTo && qTo >= eFrom) {
                const rangeStr = `${eFrom} - ${tier.quantityTo !== null ? tier.quantityTo : '∞'}`;
                throw new BadRequestException(`Khoảng số lượng bị trùng với định mức đã có (${rangeStr}). Vui lòng chọn khoảng phân bổ khác.`);
            }
        }
    }

    // --- Print Types ---
    async findAllPrintTypes() { return this.printRepo.find({ order: { name: 'ASC' } }); }
    async findPrintTypeById(id: string) { return this.printRepo.findOne({ where: { id: parseInt(id) } }); }
    async createPrintType(data: Partial<PrintType>) { return this.printRepo.save(this.printRepo.create(data)); }
    async updatePrintType(id: string, data: Partial<PrintType>) {
        await this.printRepo.update(parseInt(id), data);
        return this.printRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deletePrintType(id: string) { await this.printRepo.delete(parseInt(id)); }

    // --- Units ---
    async findAllUnits() { return this.unitRepo.find({ order: { name: 'ASC' } }); }
    async createUnit(data: Partial<Unit>) { return this.unitRepo.save(this.unitRepo.create(data)); }
    async updateUnit(id: string, data: Partial<Unit>) {
        await this.unitRepo.update(parseInt(id), data);
        return this.unitRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteUnit(id: string) { await this.unitRepo.delete(parseInt(id)); }

    // --- Printers ---
    async findAllPrinters() { return this.printDeviceRepo.find({ order: { name: 'ASC' } }); }

    // --- Large Format Pricing Tiers ---
    /**
     * Liệt kê định mức khổ lớn, kèm `current_cost_price` = giá vốn vật liệu/m² (materials.cost_price,
     * sống ở tầng 1). KHÁC in nhanh: giá/m² khổ lớn là giá GỘP (vật liệu + mực + cán + lời), không
     * tách ô riêng như tier in nhanh — nên KHÔNG auto-sync, chỉ trả cost để FE hiện mốc tham chiếu +
     * cảnh báo lỗ khi giá/m² đang set < giá vốn. Không đè, không endpoint sync.
     */
    async findAllLargeFormatTiers(materialId?: string) {
        const qb = this.lfTierRepo.createQueryBuilder('lf')
            .leftJoin(Material, 'm', 'm.id = lf.materialId')
            .addSelect('m.cost_price', 'current_cost_price')
            .orderBy('lf.areaFrom', 'ASC');
        if (materialId) qb.where('lf.materialId = :materialId', { materialId: parseInt(materialId) });

        const { entities, raw } = await qb.getRawAndEntities();
        return entities.map((tier, i) => {
            const currentCost = raw[i]?.current_cost_price != null ? Number(raw[i].current_cost_price) : null;
            return { ...tier, current_cost_price: currentCost };
        });
    }
    async findLargeFormatTierById(id: string) { return this.lfTierRepo.findOne({ where: { id: parseInt(id) } }); }
    async createLargeFormatTier(data: Partial<LargeFormatPricing>) {
        this.normalizeLfCost(data);
        return this.lfTierRepo.save(this.lfTierRepo.create(data));
    }
    async updateLargeFormatTier(id: string, data: Partial<LargeFormatPricing>) {
        const existing = await this.lfTierRepo.findOne({ where: { id: parseInt(id) } });
        this.normalizeLfCost(data, existing ?? undefined);
        await this.lfTierRepo.update(parseInt(id), data);
        return this.lfTierRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteLargeFormatTier(id: string) { await this.lfTierRepo.delete(parseInt(id)); }

    /**
     * Chuẩn hoá chi phí tier khổ lớn: giá vốn thuần/m² = material + machine + labor + overhead (4 thành phần).
     * - Gửi bất kỳ thành phần nào → tự tính price_per_sqm = tổng 4 (phần thiếu lấy existing khi update, 0 khi create).
     * - Chỉ gửi price_per_sqm (đường cũ) → giữ nguyên, không phá tương thích.
     * KHÔNG markup — markup áp một lần ở facade. Đây là giá vốn thuần/m².
     */
    private normalizeLfCost(data: Partial<LargeFormatPricing>, existing?: LargeFormatPricing) {
        const touched = data.materialCost != null || data.machineCost != null
            || data.laborCost != null || data.overheadCost != null;
        if (!touched) return; // đường cũ chỉ gửi price_per_sqm
        const material = Number(data.materialCost ?? existing?.materialCost ?? 0);
        const machine = Number(data.machineCost ?? existing?.machineCost ?? 0);
        const labor = Number(data.laborCost ?? existing?.laborCost ?? 0);
        const overhead = Number(data.overheadCost ?? existing?.overheadCost ?? 0);
        data.materialCost = material;
        data.machineCost = machine;
        data.laborCost = labor;
        data.overheadCost = overhead;
        data.pricePerSqm = tierPricePerSheet(material, machine, labor, overhead);
    }

    /**
     * GỢI Ý giá định mức khổ lớn từ chi phí (tầng 3) — KHÔNG ghi DB, chỉ trả breakdown 4 thành phần/m².
     * Đọc: giá vốn vật liệu/m² (materials.cost_price, base m² cho vật tư cuộn), hồ sơ chi phí máy khổ lớn
     * (printers, cost_basis='sqm'). KHÔNG mực, KHÔNG số mặt, KHÔNG markup (facade lo).
     */
    async suggestLargeFormatCost(input: {
        material_id: number;
        printer_id?: number;
    }): Promise<{ breakdown: LfCostBreakdown }> {
        const material = await this.materialRepo.findOne({ where: { id: Number(input.material_id) } });
        if (!material) throw new BadRequestException('Không tìm thấy vật tư.');
        const materialCost = material.costPrice != null ? Number(material.costPrice) : 0;

        let printer: PrinterCostProfile | null = null;
        if (input.printer_id) {
            const p = await this.printDeviceRepo.findOne({ where: { id: Number(input.printer_id) } });
            if (p) printer = {
                machineValue: p.machineValue, depreciationYears: p.depreciationYears,
                electricityPerHour: p.electricityPerHour, staffCount: p.staffCount,
                avgSalaryMonthly: p.avgSalaryMonthly, rentMonthly: p.rentMonthly,
                utilitiesMonthly: p.utilitiesMonthly, otherMonthly: p.otherMonthly,
                sqmPerMonth: p.sqmPerMonth, sqmPerHour: p.sqmPerHour, costBasis: p.costBasis,
            };
        }

        const breakdown = deriveLfCost({ materialCost, printer });
        return { breakdown };
    }
}
