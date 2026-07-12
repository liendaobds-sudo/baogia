import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingService } from '../pricing.service';
import { Product, ProductCategory, Material, PaperSize, PrintType, Unit } from '../../../entities';
import { BoundCalculatorService } from './bound-calculator.service';
import {
    ScopeFlags,
    ProductType,
    isOffsetOnly,
    resourceInScope,
} from '../scope/resource-scope-rule';

interface ProcessingInput { id: number; code?: string; side?: string; }
interface AccessoryInput { id: number; qty?: number; }

interface CalculatePriceInput {
    type?: string;
    product_type?: string;
    material_id?: number;
    paper_size_id?: number;
    quantity?: number | string;
    item_width?: number | string;
    item_height?: number | string;
    width?: number | string;
    height?: number | string;
    print_side?: string;
    print_type?: string;
    print_method?: string;
    shape?: string;
    gap_h?: number | string;
    gap_v?: number | string;
    processing?: ProcessingInput[];
    accessories?: AccessoryInput[];
    /** Mã sản phẩm — nếu có, server kiểm tra material/khổ/gia công/phụ kiện phải nằm trong whitelist của sản phẩm. */
    product_code?: string;
    /** VAT (%) — BẮT BUỘC đi theo thông số nhập ở mục thông tin khách hàng lúc báo giá.
     *  Không truyền ⇒ 0 (không áp VAT). Endpoint KHÔNG còn lấy VAT từ pricing_config. */
    vat_rate?: number | string;
}

interface ProcessingDetail { name: string; cost: number; price_type: string; }
interface AccessoryDetail { id: number; qty: number; cost: number; name: string; }

@Injectable()
export class PricingFacadeService {
    private readonly logger = new Logger(PricingFacadeService.name);

    constructor(
        private readonly pricing: PricingService,
        @InjectRepository(Material) private materialRepo: Repository<Material>,
        @InjectRepository(PaperSize) private paperSizeRepo: Repository<PaperSize>,
        @InjectRepository(PrintType) private printTypeRepo: Repository<PrintType>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        @InjectRepository(Product) private productRepo: Repository<Product>,
        @InjectRepository(ProductCategory) private categoryRepo: Repository<ProductCategory>,
        private readonly boundCalculator: BoundCalculatorService,
    ) { }

    async getMasterData(type?: string, scope?: string) {
        try {
            const result: Record<string, unknown> = {};
            const mgr = this.materialRepo.manager;

            if (!type || type === 'all' || type === 'materials') {
                // Only return substrate materials (paper/roll) for the quote configurator
                // Non-substrate items (finishing, ink, prepress, tooling, surface) are managed
                // separately via processing_options and should not appear in paper dropdowns
                const qb = this.materialRepo.createQueryBuilder('m')
                    .where("m.category_tab IN (:...tabs)", { tabs: ['substrate_sheet', 'substrate_roll'] });
                qb.orderBy('m.name', 'ASC');
                const materialsRaw = await qb.getMany();

                // Phân loại Phạm_Vi qua Quy_Tắc_Phạm_Vi canonical (resource-scope-rule), KHÔNG còn raw SQL.
                // - Có scope (loose/bound/large_format): giữ tài nguyên thuộc Phạm_Vi đó (resourceInScope).
                //   resourceInScope đã hàm ý không phải Tài_Nguyên_Chỉ_Offset nên bao trùm điều kiện loại offset-only.
                // - Không scope: chỉ loại Tài_Nguyên_Chỉ_Offset (isOffsetOnly).
                // LƯU Ý: bảng materials KHÔNG có cột is_active (xem material.entity.ts) nên ở đây KHÔNG lọc
                // theo Trạng_Thái_Hoạt_Động — giữ đúng hành vi cũ; vì vậy không dùng filterForProductType.
                const productType = this.toProductType(scope);
                const materialsList = materialsRaw.filter((m) => {
                    const flags = this.toScopeFlags(m);
                    return productType ? resourceInScope(flags, productType) : !isOffsetOnly(flags);
                });

                // Group valid paper sizes from pricing_tiers
                const validSizesRaw = await mgr.query('SELECT DISTINCT material_id, paper_size_id FROM pricing_tiers WHERE paper_size_id IS NOT NULL');
                const validSizesMap = new Map<number, number[]>();
                for (const row of validSizesRaw) {
                    const mId = parseInt(row.material_id);
                    const psId = parseInt(row.paper_size_id);
                    if (!validSizesMap.has(mId)) validSizesMap.set(mId, []);
                    validSizesMap.get(mId)!.push(psId);
                }

                // Cờ "đã có định mức": vật tư xuất hiện trong pricing_tiers (KỂ CẢ tier có paper_size_id NULL,
                // nên KHÔNG lọc như validSizesMap). Frontend cảnh báo "chưa có định mức" khi cờ này false;
                // backend cũng chặn tính giá (hasAnyTier) — cờ đây chỉ để hiển thị.
                const tierMatRaw = await mgr.query('SELECT DISTINCT material_id FROM pricing_tiers');
                const hasTierSet = new Set<number>(tierMatRaw.map((r: any) => parseInt(r.material_id)));

                result.materials = materialsList.map(m => {
                    const mapped = { ...m } as any;
                    mapped.valid_paper_size_ids = validSizesMap.get(m.id) || [];
                    mapped.has_pricing_tier = hasTierSet.has(m.id);
                    return mapped;
                });
            }

            if (!type || type === 'all' || type === 'paper_sizes') {
                // Loại khổ CHỈ dành cho Offset khỏi dropdown in nhanh — qua Quy_Tắc_Phạm_Vi canonical (isOffsetOnly).
                // paper_sizes không có cột is_active và không lọc theo scope ở master-data (giữ hành vi cũ).
                const paperSizesRaw = await this.paperSizeRepo.createQueryBuilder('p')
                    .orderBy('p.name', 'ASC')
                    .getMany();
                result.paper_sizes = paperSizesRaw.filter((p) => !isOffsetOnly(this.toScopeFlags(p)));
            }

            if (!type || type === 'all' || type === 'processing_options') {
                // Giữ điều kiện is_active = 1 (smallint) ở SQL; phần loại Tài_Nguyên_Chỉ_Offset chuyển sang
                // Quy_Tắc_Phạm_Vi canonical (isOffsetOnly) thay cho raw SQL NOT (scope_offset = true AND ...).
                // Hàng raw đã có sẵn các cờ snake_case scope_* khớp shape ScopeFlags.
                const processingRaw: ScopeFlags[] = await mgr.query(
                    `SELECT * FROM processing_options WHERE is_active = 1 ORDER BY id`,
                ).catch((e) => { this.logger.error(e); return []; });
                result.processing_options = processingRaw.filter((p) => !isOffsetOnly(p));
            }

            if (!type || type === 'all' || type === 'print_types') {
                try {
                    result.print_types = await this.printTypeRepo.find({ order: { name: 'ASC' } });
                } catch { result.print_types = []; }
            }

            if (!type || type === 'all' || type === 'accessories') {
                result.accessories = await mgr.query('SELECT * FROM accessories WHERE is_active = 1 ORDER BY id').catch((e) => { this.logger.error(e); return []; });
            }

            if (!type || type === 'all' || type === 'products') {
                try {
                    result.products = await this.productRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
                } catch { result.products = []; }
            }

            return { success: true, data: result };
        } catch (error) {
            this.logger.error('Master data error', error);
            return { success: false, error: 'Failed to load master data' };
        }
    }

    /**
     * Map cờ scope camelCase của entity (Material/PaperSize) sang shape ScopeFlags snake_case
     * mà Quy_Tắc_Phạm_Vi canonical sử dụng. Hàng raw của processing_options đã là snake_case nên
     * không cần đi qua hàm này.
     */
    private toScopeFlags(r: {
        scopeLoose?: boolean | number | null;
        scopeBound?: boolean | number | null;
        scopeLargeFormat?: boolean | number | null;
        scopeOffset?: boolean | number | null;
    }): ScopeFlags {
        return {
            scope_loose: r.scopeLoose,
            scope_bound: r.scopeBound,
            scope_large_format: r.scopeLargeFormat,
            scope_offset: r.scopeOffset,
        };
    }

    /** Chuẩn hoá tham số `scope` của master-data về ProductType in nhanh hợp lệ, hoặc undefined. */
    private toProductType(scope?: string): ProductType | undefined {
        return scope === 'loose' || scope === 'bound' || scope === 'large_format' ? scope : undefined;
    }

    async calculatePrice(input: CalculatePriceInput) {
        try {
            const type = input.type || input.product_type || 'loose';

            // Chặn rò rỉ engine: facade digital CHỈ phục vụ loose/bound/large_format.
            // Trước đây mọi `type` lạ (kể cả loại offset to_roi/hop_giay/…) rơi vào nhánh `else`
            // và bị tính NHẦM như 'loose' → sai giá âm thầm. Endpoint /pricing/calculate là public,
            // nên phải từ chối tường minh (đối xứng với `default:` của EngineOffset) thay vì đoán.
            // Sản phẩm offset đi qua POST /pricing/offset/calculate (EngineOffset).
            if (type !== 'loose' && type !== 'bound' && type !== 'large_format') {
                return {
                    success: false,
                    error: `Loại '${type}' không thuộc báo giá in nhanh (loose/bound/large_format). Sản phẩm offset dùng endpoint /pricing/offset/calculate.`,
                };
            }

            const config = await this.pricing.getPricingConfig();

            // Server-side whitelist guard: nếu request kèm product_code, mọi material/khổ/gia công/
            // phụ kiện phải nằm trong cấu hình sản phẩm (chống lách qua API/chatbot, không chỉ ẩn UI).
            const whitelistError = await this.validateAgainstProductWhitelist(input);
            if (whitelistError) {
                return { success: false, error: whitelistError };
            }

            let result: any;
            if (type === 'large_format') {
                result = await this.calculateLargeFormat(input);
            } else if (type === 'bound') {
                result = await this.calculateBound(input);
            } else {
                result = await this.calculateLoose(input);
            }

            // Apply selling price + VAT if calculation succeeded
            if (result.success && result.data) {
                const costSubtotal = result.data.subtotal || 0;
                const quantity = parseInt(String(input.quantity)) || 1;

                // Calculate selling price using markup/margin config
                const sellingSubtotal = this.pricing.calculateSellingPrice(costSubtotal, {
                    pricing_method: config.pricing_method || 'markup',
                    default_markup: config.default_markup || '50',
                    min_margin: config.min_margin || '20',
                    price_rounding: config.price_rounding || '100',
                });

                // VAT: BẮT BUỘC theo % nhập ở thông tin khách hàng (truyền qua request `vat_rate`).
                // KHÔNG còn đọc từ pricing_config — thiếu/không hợp lệ ⇒ 0 (không áp VAT), để VAT
                // chỉ có một nguồn duy nhất (mục khách hàng) và không "chui" từ cấu hình hệ thống.
                const parsedVat = parseFloat(String(input.vat_rate));
                const vatRate = Number.isFinite(parsedVat) && parsedVat > 0 ? parsedVat : 0;
                const vatAmount = Math.round(sellingSubtotal * vatRate / 100);
                const grandTotal = sellingSubtotal + vatAmount;

                result.data.cost_subtotal = Math.round(costSubtotal);
                result.data.selling_subtotal = sellingSubtotal;
                result.data.selling_price_per_item = quantity > 0 ? Math.round(sellingSubtotal / quantity) : 0;
                result.data.vat_rate = vatRate;
                result.data.vat_amount = vatAmount;
                result.data.grand_total = grandTotal;
                result.data.grand_total_per_item = quantity > 0 ? Math.round(grandTotal / quantity) : 0;
                result.data.markup_method = config.pricing_method || 'markup';
                result.data.markup_percent = parseFloat(config.default_markup || '50');
            }

            return result;
        } catch (error: unknown) {
            this.logger.error('Calculate price error', error);
            return { success: false, error: error instanceof Error ? error.message : 'Có lỗi xảy ra khi tính giá' };
        }
    }

    /**
     * Kiểm tra material/khổ/gia công/phụ kiện có nằm trong whitelist của sản phẩm không.
     * Chỉ chạy khi request kèm `product_code`. Trả về thông báo lỗi nếu vi phạm, null nếu hợp lệ.
     * STRICT: whitelist rỗng = không cho mục nào (đồng nhất với hành vi frontend).
     */
    private async validateAgainstProductWhitelist(input: CalculatePriceInput): Promise<string | null> {
        const code = input.product_code;
        if (!code) return null; // không có ngữ cảnh sản phẩm → bỏ qua (giữ tương thích chatbot/legacy)
        let rows: any[];
        try {
            rows = await this.materialRepo.manager.query(
                `SELECT allowed_materials, allowed_paper_sizes, allowed_processing, allowed_accessories
                 FROM unified_products WHERE code = $1 LIMIT 1`, [code],
            );
        } catch {
            return null; // không tra được → không chặn (tránh chặn nhầm do lỗi hạ tầng)
        }
        if (!rows?.length) return null; // mã sản phẩm lạ → bỏ qua

        const parse = (v: any): string[] => {
            try {
                const arr = Array.isArray(v) ? v : (v ? JSON.parse(v) : []);
                return (arr || []).map((x: any) => String(x));
            } catch { return []; }
        };
        const mats = parse(rows[0].allowed_materials);
        const papers = parse(rows[0].allowed_paper_sizes);
        const procs = parse(rows[0].allowed_processing);
        const accs = parse(rows[0].allowed_accessories);

        if (input.material_id != null && input.material_id !== undefined && !mats.includes(String(input.material_id)))
            return `Vật liệu (id=${input.material_id}) không nằm trong cấu hình sản phẩm "${code}".`;
        if (input.paper_size_id != null && input.paper_size_id !== undefined && !papers.includes(String(input.paper_size_id)))
            return `Khổ giấy (id=${input.paper_size_id}) không nằm trong cấu hình sản phẩm "${code}".`;
        for (const p of (input.processing || [])) {
            if (p?.id != null && !procs.includes(String(p.id)))
                return `Gia công (id=${p.id}) không nằm trong cấu hình sản phẩm "${code}".`;
        }
        for (const a of (input.accessories || [])) {
            if (a?.id != null && !accs.includes(String(a.id)))
                return `Phụ kiện (id=${a.id}) không nằm trong cấu hình sản phẩm "${code}".`;
        }

        // ─── Hàng cuốn: kiểm cả bìa (cover) và ruột (inner[]) ───
        // Engine bound nhận material/khổ/gia công ở các nhánh con, không ở cấp trên,
        // nên phải soát riêng để whitelist không bị lách qua bìa/ruột.
        const checkSection = (sec: any, label: string): string | null => {
            if (!sec) return null;
            if (sec.material_id != null && !mats.includes(String(sec.material_id)))
                return `Vật liệu ${label} (id=${sec.material_id}) không nằm trong cấu hình sản phẩm "${code}".`;
            if (sec.paper_size_id != null && !papers.includes(String(sec.paper_size_id)))
                return `Khổ giấy ${label} (id=${sec.paper_size_id}) không nằm trong cấu hình sản phẩm "${code}".`;
            for (const p of (sec.processing || [])) {
                if (p?.id != null && !procs.includes(String(p.id)))
                    return `Gia công ${label} (id=${p.id}) không nằm trong cấu hình sản phẩm "${code}".`;
            }
            return null;
        };
        const coverErr = checkSection((input as any).cover, 'bìa');
        if (coverErr) return coverErr;
        const innerList = Array.isArray((input as any).inner) ? (input as any).inner : ((input as any).inner ? [(input as any).inner] : []);
        for (const innerSec of innerList) {
            const innerErr = checkSection(innerSec, 'ruột');
            if (innerErr) return innerErr;
        }
        return null;
    }

    private async calculateLoose(input: CalculatePriceInput) {
        const materialId = input.material_id;
        const paperSizeId = input.paper_size_id;
        const quantity = parseInt(String(input.quantity)) || 1;
        const itemWidth = parseFloat(String(input.item_width)) || 0;
        const itemHeight = parseFloat(String(input.item_height)) || 0;
        const printSide = input.print_side || 'double';
        const printType = input.print_type || '4c';
        const printMethod = input.print_method || 'digital';
        const shape = input.shape || 'rectangle';
        const gapH = parseFloat(String(input.gap_h)) || 2;
        const gapV = parseFloat(String(input.gap_v)) || 2;

        const paperSize = await this.paperSizeRepo.findOne({ where: { id: paperSizeId } });
        if (!paperSize) return { success: false, error: 'Paper size not found' };

        // DB decimal columns may return strings — force parseFloat
        const psW = parseFloat(paperSize.widthMm as any) || 0;
        const psH = parseFloat(paperSize.heightMm as any) || 0;
        const mL = parseFloat(paperSize.marginLeft as any) || 0;
        const mR = parseFloat(paperSize.marginRight as any) || 0;
        const mT = parseFloat(paperSize.marginTop as any) || 0;
        const mB = parseFloat(paperSize.marginBottom as any) || 0;

        const printableW = psW - mL - mR;
        const printableH = psH - mT - mB;

        const layout = (shape === 'round' || shape === 'circle') ? this.pricing.calculateStaggeredLayout(printableW, printableH, itemWidth, itemHeight, gapH, gapV)
            : this.pricing.calculateGridLayout(printableW, printableH, itemWidth, itemHeight, gapH, gapV);

        if (layout.itemsPerSheet <= 0) {
            return { success: false, error: 'Kích thước sản phẩm quá lớn cho khổ giấy này' };
        }

        const sheetsNeeded = Math.ceil(quantity / layout.itemsPerSheet);

        // ─── WASTE SHEETS (bù hao) — khớp PHP calculateWasteSheets() ───
        const config = await this.pricing.getPricingConfig();
        // Quy đổi gia công → token loại bù hao. Ưu tiên bản đồ cấu hình (mã tùy biến của
        // nhà in); fallback mã/loại có sẵn để calculateWasteSheets nhận diện (lamination/die_cut/binding).
        const wasteCatMap = await this.pricing.getWasteCategoryMap();
        const procIds = (input.processing || []).map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
        let idToCode = new Map<number, string>();
        if (procIds.length) {
            const ph = procIds.map((_, i) => `$${i + 1}`).join(',');
            const rows = await this.materialRepo.manager
                .query(`SELECT id, code FROM processing_options WHERE id IN (${ph})`, procIds)
                .catch(() => [] as any[]);
            idToCode = new Map(rows.map((r: any) => [Number(r.id), r.code as string]));
        }
        const processingCodes = (input.processing || []).map((p) => {
            const code = p.code || idToCode.get(Number(p.id)) || String(p.id || '');
            return wasteCatMap[code] || code;
        });
        const totalSheets = this.pricing.calculateWasteSheets(sheetsNeeded, config, printMethod as 'digital' | 'offset', processingCodes);
        const wasteSheets = totalSheets - sheetsNeeded;

        // Vật tư giấy chưa cấu hình định mức nào → chặn thay vì âm thầm tính giá giấy = 0
        // (getPricingTierByMaterial trả 0 khi hết đường fallback, dễ ra báo giá thiếu tiền giấy).
        if (!(await this.pricing.hasAnyTier(materialId as number))) {
            const mat = await this.materialRepo.findOne({ where: { id: materialId as number } });
            return { success: false, error: `Vật tư "${mat?.name ?? `#${materialId}`}" chưa có định mức giá — vào Định mức in nhanh để cấu hình.` };
        }

        // ─── PRICING TIER — dùng totalSheets (đã bao gồm bù hao) như PHP ───
        const pricePerSheet = await this.pricing.getPricingTierByMaterial(materialId as number, paperSizeId as number, printSide, printType, totalSheets);
        const materialCost = pricePerSheet * totalSheets;

        let processingCost = 0;
        const processingDetails: ProcessingDetail[] = [];
        if (input.processing && Array.isArray(input.processing)) {
            // Chạy song song thay vì tuần tự (trước đây N+1 await nối tiếp).
            const procResults = await Promise.all(
                input.processing.map((proc) =>
                    this.pricing.getProcessingCost(proc.id as number, proc.side || 'single', paperSizeId as number, quantity, totalSheets),
                ),
            );
            for (const result of procResults) {
                processingCost += result.cost;
                processingDetails.push(result as unknown as ProcessingDetail);
            }
        }

        let accessoriesCost = 0;
        const accessoriesDetails: AccessoryDetail[] = [];
        if (input.accessories && Array.isArray(input.accessories)) {
            const accResults = await Promise.all(
                input.accessories.map(async (acc): Promise<AccessoryDetail | null> => {
                    const dbAcc = await this.materialRepo.manager.query('SELECT price, name FROM accessories WHERE id = $1', [acc.id]).catch((e: unknown) => {
                        // Trước đây nuốt lỗi âm thầm (.catch(() => [])) → lỗi DB biến thành "bỏ phụ kiện",
                        // làm giá thấp hơn thực tế mà không ai biết. Nay log rõ rồi mới fallback.
                        this.logger.error(`Accessory lookup failed (id=${acc.id})`, e as any);
                        return [];
                    });
                    if (dbAcc.length > 0) {
                        const price = parseFloat(dbAcc[0].price);
                        const qty = parseInt(String(acc.qty)) || 1;
                        return { id: acc.id, qty, cost: price * qty, name: dbAcc[0].name };
                    }
                    return null;
                }),
            );
            for (const r of accResults) {
                if (r) {
                    accessoriesCost += r.cost;
                    accessoriesDetails.push(r);
                }
            }
        }

        const subtotal = materialCost + processingCost + accessoriesCost;
        return {
            success: true,
            data: {
                type: 'loose',
                material_cost: Math.round(materialCost),
                processing_cost: Math.round(processingCost),
                accessories_cost: Math.round(accessoriesCost),
                subtotal: Math.round(subtotal),
                total: Math.round(subtotal),
                price_per_item: quantity > 0 ? Math.round(subtotal / quantity) : 0,
                breakdown: {
                    items_per_sheet: layout.itemsPerSheet,
                    efficiency: layout.efficiency,
                    sheets_needed: sheetsNeeded,
                    waste_sheets: wasteSheets,
                    total_sheets: totalSheets,
                    price_per_sheet: pricePerSheet,
                },
                processing_details: processingDetails,
                accessories_details: accessoriesDetails,
            },
        };
    }

    private async calculateBound(input: CalculatePriceInput) {
        try {
            const result = await this.boundCalculator.calculate(input as any);
            return {
                success: true,
                data: result,
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Lỗi khi tính giá sổ tay',
            };
        }
    }

    private async calculateLargeFormat(input: CalculatePriceInput) {
        // LƯU Ý CHỦ ĐÍCH: nhánh khổ lớn (cuộn) KHÔNG áp bù hao tờ, processing & accessories
        // như nhánh `loose`. Khổ lớn tính theo m² và (nếu cần) dùng LargeFormatCalculatorService
        // cho luồng nâng cao (processing per_m2). Giữ tối giản tại đây để khớp engine PHP gốc.
        const materialId = input.material_id;
        // parseFloat (không parseInt) để không cắt phần thập phân mm (vd 2400.5mm).
        const width = parseFloat(String(input.width)) || 0;
        const height = parseFloat(String(input.height)) || 0;
        const quantity = parseInt(String(input.quantity)) || 1;
        const printType = input.print_type || 'uv';

        if (!materialId || width <= 0 || height <= 0) {
            return { success: false, error: 'Missing: material_id, width, height' };
        }

        const material = await this.materialRepo.findOne({ where: { id: materialId } });
        if (!material) return { success: false, error: 'Material not found' };

        const areaM2 = (width * height) / 1_000_000;
        let chargeAreaM2 = areaM2 * quantity;

        if (material.chargeFullWidth && material.rollWidth && material.rollWidth > 0) {
            // CONTRACT: rollWidth tính bằng MILIMÉT (mm), KHỚP đơn vị width/height (mm).
            // Nếu giá trị < 10 gần như chắc chắn bị nhập nhầm theo mét (vd 1.6 thay vì 1600)
            // → sai 1000 lần. Cảnh báo để phát hiện dữ liệu lỗi thay vì im lặng trả giá sai.
            if (material.rollWidth < 10) {
                this.logger.warn(`Material #${materialId} rollWidth=${material.rollWidth} nghi nhập theo MÉT; phải lưu mm (vd 1600). Giá khổ lớn có thể sai 1000 lần.`);
            }
            chargeAreaM2 = (material.rollWidth * height / 1_000_000) * quantity;
        }

        let pricePerSqm = material.pricePerSqm || 0;
        if (pricePerSqm <= 0) {
            const lfp = await this.materialRepo.manager.query(
                'SELECT price_per_sqm FROM large_format_pricing WHERE material_id = $1 AND print_type = $2 LIMIT 1',
                [materialId, printType],
            ).catch((e: unknown) => {
                this.logger.error(`large_format_pricing lookup failed (material=${materialId}, printType=${printType})`, e as any);
                return [];
            });
            if (lfp.length > 0) pricePerSqm = parseFloat(lfp[0].price_per_sqm);
        }

        // Không có đơn giá m² → KHÔNG trả giá 0đ âm thầm (báo giá sai cho khách).
        // Yêu cầu báo giá thủ công thay vì subtotal = areaM2 × 0.
        if (!(pricePerSqm > 0)) {
            return { success: false, error: `Chưa có đơn giá m² cho vật liệu #${materialId} (print_type=${printType})` };
        }

        let materialCost = chargeAreaM2 * pricePerSqm;
        if ((material.minChargeArea || 0) > 0 && chargeAreaM2 < material.minChargeArea) {
            materialCost = material.minChargeArea * pricePerSqm;
        }

        const subtotal = materialCost;
        return {
            success: true,
            data: {
                type: 'large_format',
                material_cost: Math.round(materialCost),
                subtotal: Math.round(subtotal),
                total: Math.round(subtotal),
                price_per_item: quantity > 0 ? Math.round(subtotal / quantity) : 0,
                breakdown: {
                    width_mm: width, height_mm: height, quantity,
                    area_m2: Math.round(areaM2 * 100) / 100,
                    charge_area_m2: Math.round(chargeAreaM2 * 100) / 100,
                    price_per_sqm: Math.round(pricePerSqm),
                },
            },
        };
    }
}
