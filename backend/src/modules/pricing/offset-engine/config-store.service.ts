import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
    PricingData, OffsetMaterial, KhoIn, GiaCong, KemRow, VatTuBeMat, EpKimRow,
    HaoHutRow, PhiCoDinh, Params, FixedSizeToRoi, FixedSizeBiThu, LoaiKem, BillingMode, WasteStageConfig, OffsetProductConfig,
} from './pricing-data';
import { loadDefaultPricingData } from './default-data';
import { pressPerParent } from './sheet-imposition';

/**
 * ConfigStore — adapter đọc/ghi bảng cấu hình offset (`offset_cfg_*`) trong PostgreSQL,
 * dựng `PricingData` cho EngineOffset lúc chạy.
 *
 * Nguyên tắc:
 * - DB là nguồn chân lý lúc chạy; `data/*.json` (qua `loadDefaultPricingData`) là nguồn mặc định để
 *   seed và để FALLBACK khi bảng chưa tồn tại / rỗng / lỗi truy vấn (vd. chạy trên SQLite dev).
 * - Mỗi nhóm cấu hình fallback ĐỘC LẬP: nhóm nào DB rỗng thì lấy mặc định nhóm đó.
 * - `seedDefaults()` idempotent (INSERT ... ON CONFLICT DO NOTHING) — chỉ chạy được trên Postgres.
 *
 * _Requirements: 1.2, 1.3, 1.5, 18.2, 18.3_
 */
@Injectable()
export class ConfigStore {
    private readonly logger = new Logger(ConfigStore.name);

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    private get isPostgres(): boolean {
        return this.dataSource?.options?.type === 'postgres';
    }

    private num(v: any, fallback = 0): number {
        if (v === null || v === undefined || v === '') return fallback;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    private numOrNull(v: any): number | null {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /** JSONB có thể đã được driver parse (Postgres) hoặc còn là chuỗi (lưu text). */
    private json<T>(v: any, fallback: T): T {
        if (v === null || v === undefined) return fallback;
        if (typeof v === 'string') {
            try { return JSON.parse(v) as T; } catch { return fallback; }
        }
        return v as T;
    }

    /** Tách "43cm x 65cm" → {w:430,h:650} (mm). Dùng khi seed/ghi paper_sizes (width/height tính bằng mm). */
    private parseKhoMm(s: string): { w: number; h: number } {
        const m = (s || '').match(/([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)/i);
        if (!m) return { w: 0, h: 0 };
        return { w: Math.round(parseFloat(m[1]) * 10), h: Math.round(parseFloat(m[2]) * 10) };
    }

    private async safeQuery(sql: string, params?: any[]): Promise<any[]> {
        try {
            const rows = await this.dataSource.query(sql, params);
            return Array.isArray(rows) ? rows : [];
        } catch (err) {
            // Bảng chưa tồn tại / DB không hỗ trợ → coi như rỗng để fallback.
            return [];
        }
    }

    // ═══ Load PricingData ═══

    /**
     * Dựng `PricingData` từ DB, fallback mặc định theo từng nhóm khi DB rỗng/lỗi.
     * _Requirements: 1.5, 18.3_
     */
    async loadPricingData(): Promise<PricingData> {
        const def = loadDefaultPricingData();

        const [
            matRows, khoRows, fixedRows, gcOptRows, gcPriceRows, kemRows, vtbmRows, epRows, hhRows, paramRows, phiRows, grRows,
        ] = await Promise.all([
            // Giấy in offset dùng CHUNG bảng `materials` (cờ scope_offset), không có bảng riêng.
            this.safeQuery('SELECT id, code, name, type, gsm, "pricePerSheet" AS price_vat, unit_price, width, height, sheet_role, parent_material_id FROM materials WHERE scope_offset = true'),
            this.safeQuery('SELECT code as kho_in, width as widthMm, height as heightMm, margin_top, margin_bottom, margin_left, margin_right, kho_giay_lon, chia_to, so_con_bai_in, so_con_to_lon, loai_kem FROM paper_sizes WHERE scope_offset = true'),
            this.safeQuery('SELECT * FROM offset_cfg_fixed_size'),
            // Gia công offset dùng CHUNG processing_options + processing_pricing (màn Định mức gia công).
            // Audit 2026-08-29: thêm `is_active = 1` — `processing_options.is_active` là SMALLINT
            // (xem STRUCTURE.md "Quy ước cột is_active"), so bằng `= 1` chứ KHÔNG `= true`.
            // Thiếu điều kiện này thì công đoạn admin ĐÃ TẮT vẫn được nạp thành bậc giá offset.
            this.safeQuery('SELECT id, code, name, ghi_chu, billing_mode, moq_param, min_charge_param FROM processing_options WHERE scope_offset = true AND is_active = 1'),
            // Chỉ lấy định mức của các công đoạn offset đang bật (JOIN thay vì quét cả bảng):
            // trước đây nạp MỌI row `processing_pricing`, kể cả row của công đoạn in nhanh hoặc
            // công đoạn đã tắt → dựng sai số bậc ⇒ `pickRate` chọn sai đơn giá.
            this.safeQuery(
                'SELECT p.processing_option_id, p.quantity_from, p.quantity_to, p.unit_price ' +
                'FROM processing_pricing p ' +
                'JOIN processing_options o ON o.id = p.processing_option_id ' +
                'WHERE o.scope_offset = true AND o.is_active = 1 ' +
                'ORDER BY p.processing_option_id, p.quantity_from',
            ),
            this.safeQuery('SELECT * FROM offset_cfg_kem'),
            this.safeQuery('SELECT * FROM offset_cfg_vat_tu_be_mat'),
            this.safeQuery('SELECT * FROM offset_cfg_ep_kim'),
            // Hao hụt offset dùng CHUNG waste_rules (print_method='offset', bản ghi tag 'pricebook').
            this.safeQuery("SELECT quantity_from, waste_percent FROM waste_rules WHERE print_method = 'offset' AND description = 'pricebook' ORDER BY quantity_from"),
            // Tham số (VAT/chiết khấu/MOQ/GiaMin/DonGia1Kem) dùng CHUNG pricing_config, key tiền tố 'offset.'.
            this.safeQuery("SELECT config_key, config_value FROM pricing_config WHERE config_key LIKE 'offset.%'"),
            // Phí cố định (khuôn/thiết kế) dùng CHUNG setup_fees (category='offset').
            this.safeQuery("SELECT code, name, price_fixed FROM setup_fees WHERE category = 'offset'"),
            // Gripper/gutter theo từng khổ in (cột MỚI `gripper_cm`/`gutter_cm`, đơn vị cm).
            // Cột có thể CHƯA tồn tại trên DB cũ/SQLite → safeQuery trả [] để fallback an toàn về
            // params.Gripper_Cm/Gutter_Cm trong resolveMarginConfig (Req 1.3). Tách query riêng để
            // cột thiếu KHÔNG làm vỡ toàn bộ khối nạp khổ in.
            this.safeQuery('SELECT code, gripper_cm, gutter_cm FROM paper_sizes WHERE scope_offset = true'),
        ]);

        // Hợp nhất: bắt đầu từ danh mục mặc định (JSON), DB scope_offset ghi đè/bổ sung theo `code`.
        // Nhờ vậy luôn đủ danh mục giấy mặc định, admin sửa trong màn Vật tư là phản ánh ngay, không vỡ khi seed thiếu.
        const matByCode = new Map<string, OffsetMaterial>();
        for (const m of def.materials) matByCode.set(m.code, m);
        // Bản ghi DB theo id — để vật tư con (khổ xả) tra vật tư cha (khổ nhập) qua parent_material_id.
        // Giữ kích thước tờ + giá gốc của cha để dẫn giá con (giá xả = giá nhập / số bài in cắt được).
        const rowById = new Map<number, { code: string; widthMm: number; heightMm: number; priceNoVAT: number }>();
        for (const r of matRows) {
            if (!r.code) continue;
            const prev = matByCode.get(r.code);
            const id = this.numOrNull(r.id);
            const parentId = this.numOrNull(r.parent_material_id);
            matByCode.set(r.code, {
                code: r.code,
                aliases: prev?.aliases ?? [],
                materialName: r.name ?? prev?.materialName ?? r.code,
                type: r.type ?? prev?.type ?? '',
                gsm: this.numOrNull(r.gsm) ?? prev?.gsm ?? null,
                priceVAT: this.num(r.price_vat, prev?.priceVAT ?? 0),
                priceNoVAT: this.num(r.unit_price, prev?.priceNoVAT ?? 0),
                sheetWidth: this.num(r.width, prev?.sheetWidth ?? 0),
                sheetHeight: this.num(r.height, prev?.sheetHeight ?? 0),
                sheetRole: (r.sheet_role as OffsetMaterial['sheetRole']) ?? null,
                parentMaterialId: parentId,
            });
            if (id != null) {
                rowById.set(id, {
                    code: r.code,
                    widthMm: this.num(r.width, 0),
                    heightMm: this.num(r.height, 0),
                    priceNoVAT: this.num(r.unit_price, 0),
                });
            }
        }
        const materials: OffsetMaterial[] = Array.from(matByCode.values());

        // DẪN GIÁ khổ xả (con) từ giá khổ nhập (cha) — R3-c: "giá tự chia từ giá khổ nhập".
        // Đơn giá con = giá cha / số bài in cắt được từ 1 tờ nhập (pressPerParent, thuần hình học).
        // Chỉ dẫn khi con có giá gốc = 0 (chưa nhập tay) + tra được cha + hệ số > 0; ngược lại giữ nguyên.
        for (const m of materials) {
            if (m.sheetRole !== 'child' || m.parentMaterialId == null) continue;
            const parent = rowById.get(m.parentMaterialId);
            if (!parent || parent.priceNoVAT <= 0) continue;
            const n = pressPerParent(m.sheetWidth, m.sheetHeight, parent.widthMm, parent.heightMm);
            if (n <= 0) continue;
            m.priceNoVAT = parent.priceNoVAT / n;
        }

        // Gripper/gutter (cm) theo khổ in từ cột mới (nếu có). Khóa theo `code` = giá trị `kho_in`.
        // Thiếu cột/bản ghi → undefined ⇒ resolveMarginConfig dùng params.Gripper_Cm/Gutter_Cm (Req 1.3).
        const grByCode = new Map<string, { gripperCm?: number; gutterCm?: number }>();
        for (const r of grRows) {
            if (!r.code) continue;
            grByCode.set(r.code, {
                gripperCm: this.numOrNull(r.gripper_cm) ?? undefined,
                gutterCm: this.numOrNull(r.gutter_cm) ?? undefined,
            });
        }

        const khoIn: KhoIn[] = khoRows.length
            ? khoRows.map((r) => ({
                khoIn: r.kho_in,
                chiaTo: r.chia_to,
                soConBaiIn: this.num(r.so_con_bai_in),
                soConToLon: this.num(r.so_con_to_lon),
                khoGiayLon: r.kho_giay_lon,
                dienTichM2: (this.num(r.widthmm) * this.num(r.heightmm)) / 1_000_000,
                loaiKem: r.loai_kem as LoaiKem,
                // Lề DB (mm) → cm để khớp hình học khổ (chuỗi cm). Thiếu → 0.
                marginLeft: this.num(r.margin_left) / 10,
                marginRight: this.num(r.margin_right) / 10,
                marginTop: this.num(r.margin_top) / 10,
                marginBottom: this.num(r.margin_bottom) / 10,
                // Gripper/gutter (cm) từ cột mới nếu có; thiếu → undefined (fallback params trong resolveMarginConfig).
                gripperCm: grByCode.get(r.kho_in)?.gripperCm,
                gutterCm: grByCode.get(r.kho_in)?.gutterCm,
            }))
            : def.khoIn;

        let fixedSizes = def.fixedSizes;
        if (fixedRows.length) {
            const toRoi: FixedSizeToRoi[] = fixedRows
                .filter((r) => r.nhom === 'to_roi')
                .map((r) => ({
                    kichThuoc: r.kich_thuoc,
                    khoIn: r.kho_in,
                    khoGiayLon: r.kho_giay_lon,
                    soConBaiIn: this.num(r.so_con_bai_in),
                    soConToLon: this.num(r.so_con_to_lon),
                }));
            const biThuFolder: FixedSizeBiThu[] = fixedRows
                .filter((r) => r.nhom === 'bi_thu_folder')
                .map((r) => ({
                    kichThuoc: r.kich_thuoc,
                    khoIn: r.kho_in,
                    khoGiayLon: r.kho_giay_lon,
                    soConBaiIn: this.num(r.so_con_bai_in),
                    soConKhoGiayLon: this.num(r.so_con_kho_giay_lon),
                    loai: r.loai as 'bithu' | 'folder',
                }));
            fixedSizes = {
                toRoi: toRoi.length ? toRoi : def.fixedSizes.toRoi,
                biThuFolder: biThuFolder.length ? biThuFolder : def.fixedSizes.biThuFolder,
            };
        }

        // Gia công offset: dựng từ processing_options(scope_offset) + processing_pricing.
        // Hợp nhất với mặc định JSON theo `code` (DB ưu tiên), để luôn đủ công đoạn + admin sửa phản ánh ngay.
        const gcByCode = new Map<string, GiaCong>();
        for (const g of def.giaCong) gcByCode.set(g.code, g);
        if (gcOptRows.length) {
            const priceByOpt = new Map<number, { quantity_from: any; quantity_to: any; unit_price: any }[]>();
            for (const p of gcPriceRows) {
                const arr = priceByOpt.get(p.processing_option_id) ?? [];
                arr.push(p);
                priceByOpt.set(p.processing_option_id, arr);
            }
            for (const o of gcOptRows) {
                const rows = (priceByOpt.get(o.id) ?? []).slice()
                    .sort((a, b) => this.num(a.quantity_from) - this.num(b.quantity_from));
                const prev = gcByCode.get(o.code);
                const tiers = rows.length
                    ? rows.map((r) => ({
                        min: this.num(r.quantity_from),
                        max: r.quantity_to == null ? null : this.num(r.quantity_to),
                        price: this.num(r.unit_price),
                    }))
                    : (prev?.tiers ?? []);
                gcByCode.set(o.code, {
                    code: o.code,
                    congDoan: o.name ?? prev?.congDoan ?? o.code,
                    ghiChu: o.ghi_chu ?? prev?.ghiChu ?? null,
                    tiers,
                    billingMode: (o.billing_mode as BillingMode) ?? prev?.billingMode ?? 'perUnit',
                    minChargeParam: o.min_charge_param ?? prev?.minChargeParam ?? null,
                    moqParam: o.moq_param ?? prev?.moqParam ?? 'MOQ_GiaCong',
                });
            }
        }
        const giaCong: GiaCong[] = Array.from(gcByCode.values());

        // Kẽm: tách theo cột `bang`.
        let kemNho: KemRow[] = def.kem.kemNho;
        let kemLon: KemRow[] = def.kem.kemLon;
        if (kemRows.length) {
            const mapKem = (bang: string): KemRow[] =>
                kemRows.filter((r) => r.bang === bang)
                    .map((r) => ({ soKem: this.num(r.so_kem), donGia: this.num(r.don_gia) }))
                    .sort((a, b) => a.soKem - b.soKem);
            const kn = mapKem('kemNho');
            const kl = mapKem('kemLon');
            kemNho = kn.length ? kn : def.kem.kemNho;
            kemLon = kl.length ? kl : def.kem.kemLon;
        }

        const vatTuBeMat: VatTuBeMat[] = vtbmRows.length
            ? vtbmRows.map((r) => ({
                ten: r.ten,
                donGiaKg: this.num(r.don_gia_kg),
                soMat: (r.so_mat ?? null) as VatTuBeMat['soMat'],
            }))
            : def.kem.vatTuBeMat;

        const epKimRows: EpKimRow[] = epRows.length
            ? epRows.map((r) => ({
                viTri: r.vi_tri,
                duoi100: this.num(r.duoi100),
                tu100_499: this.num(r.tu100_499),
                tu500_999: this.num(r.tu500_999),
                tren1000: this.num(r.tren1000),
            }))
            : def.epKim.rows;

        const haoHut: HaoHutRow[] = hhRows.length
            ? hhRows.map((r) => ({ mocSoLuong: this.num(r.quantity_from), tyLe: this.num(r.waste_percent) / 100 }))
            : def.tyLe.haoHut;

        // Params: ghép DB (pricing_config key 'offset.<ten>') lên mặc định JSON.
        const params: Params = { ...def.tyLe.params };
        let wasteStages: Record<string, WasteStageConfig> | undefined;
        let productConfig: Record<string, OffsetProductConfig> | undefined;
        let mocSoLuongOverride: number[] | undefined;
        for (const r of paramRows) {
            const key = typeof r.config_key === 'string' ? r.config_key.replace(/^offset\./, '') : '';
            if (!key) continue;
            // Định mức hao theo công đoạn lưu dạng JSON (mỗi công đoạn 1 bảng mốc riêng).
            if (key === 'WasteStages') {
                wasteStages = this.json<Record<string, WasteStageConfig>>(r.config_value, undefined as any);
                continue;
            }
            // Cấu hình form theo loại sản phẩm (whitelist/mặc định/ẩn/khoá) lưu dạng JSON.
            if (key === 'ProductConfig') {
                productConfig = this.json<Record<string, OffsetProductConfig>>(r.config_value, undefined as any);
                continue;
            }
            // Mốc số lượng bậc giá (mảng) — cấu hình được, lưu dạng JSON. Trống → mặc định.
            if (key === 'MocSoLuong') {
                const arr = this.json<number[]>(r.config_value, undefined as any);
                if (Array.isArray(arr) && arr.length) mocSoLuongOverride = arr.map((x) => this.num(x)).sort((a, b) => a - b);
                continue;
            }
            // Nguồn imposition mặc định — lưu CHUỖI ('legacy' | 'unified') trong config_value TEXT.
            // Tách khỏi nhánh số (giống WasteStages/ProductConfig) để không bị ép về số mất giá trị.
            // Giá trị lạ được giữ nguyên ở đây; impositionSelector mới là nơi chuẩn hóa về 'legacy'
            // an toàn + cảnh báo log (Req 6.1), tránh nhân đôi logic ở config-store.
            if (key === 'ImpositionSource') {
                const raw = typeof r.config_value === 'string'
                    ? r.config_value.trim()
                    : String(r.config_value ?? '').trim();
                if (raw) params.ImpositionSource = raw as Params['ImpositionSource'];
                continue;
            }
            // ShadowMode / Gripper_Cm / Gutter_Cm là tham số SỐ → đi theo nhánh số mặc định bên dưới.
            params[key] = this.num(r.config_value);
        }

        // mocSoLuong: mặc định 17 mốc từ JSON; nhà in có thể ghi đè qua pricing_config 'offset.MocSoLuong'.
        const mocSoLuong: number[] = mocSoLuongOverride ?? def.tyLe.mocSoLuong;

        // donGia1Kem: cho phép override qua param keys, mặc định từ JSON.
        const donGia1Kem = {
            kemNho: params.DonGia1Kem_KemNho != null ? this.num(params.DonGia1Kem_KemNho) : def.kem.donGia1Kem.kemNho,
            kemLon: params.DonGia1Kem_KemLon != null ? this.num(params.DonGia1Kem_KemLon) : def.kem.donGia1Kem.kemLon,
        };

        const phiCoDinh: PhiCoDinh[] = (() => {
            const byCode = new Map<string, PhiCoDinh>();
            for (const p of def.phiCoDinh) byCode.set(p.code, p);
            for (const r of phiRows) {
                if (!r.code) continue;
                const prev = byCode.get(r.code);
                byCode.set(r.code, { code: r.code, ten: r.name ?? prev?.ten ?? r.code, giaTri: this.num(r.price_fixed), ghiChu: prev?.ghiChu ?? null });
            }
            return Array.from(byCode.values());
        })();

        return {
            materials,
            khoIn,
            fixedSizes,
            giaCong,
            kem: { kemNho, kemLon, vatTuBeMat, donGia1Kem },
            epKim: { tiers: def.epKim.tiers, rows: epKimRows },
            tyLe: { haoHut, params, mocSoLuong },
            phiCoDinh,
            wasteStages,
            productConfig,
        };
    }

    // ═══ Seed (idempotent) ═══

    /**
     * Seed toàn bộ bảng `offset_cfg_*` từ dữ liệu mặc định JSON. Idempotent qua ON CONFLICT DO NOTHING.
     * Chỉ chạy trên Postgres; bỏ qua êm trên SQLite/dev.
     * _Requirements: 1.2, 1.3, 1.4_
     */
    async seedDefaults(): Promise<{ seeded: boolean; reason?: string }> {
        if (!this.isPostgres) {
            return { seeded: false, reason: 'not-postgres' };
        }
        const d = loadDefaultPricingData();
        try {
            // (A2) Đảm bảo cột offset của `paper_sizes` tồn tại trước khi seed/đọc (idempotent).
            // Nguồn sự thật là entity PaperSize; ALTER IF NOT EXISTS để không vỡ khi DB dựng từ schema cũ.
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS scope_offset boolean DEFAULT false`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS kho_giay_lon varchar(80)`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS chia_to varchar(80)`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS so_con_bai_in int`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS so_con_to_lon int`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS loai_kem varchar(40)`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS gripper_cm decimal(10,2)`);
            await this.dataSource.query(`ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS gutter_cm decimal(10,2)`);

            // Giấy in offset → bảng `materials` (scope_offset=true). KHÔNG ghi đè bản ghi sẵn có
            // (ON CONFLICT DO NOTHING) để không đụng giá vật tư "in nhanh" cùng mã.
            for (const m of d.materials) {
                await this.dataSource.query(
                    `INSERT INTO materials
                        (code, name, type, gsm, "pricePerSheet", unit_price, width, height,
                         unit, category, category_tab, material_format, price_unit,
                         scope_loose, scope_bound, scope_large_format, scope_offset, status, stock, min_stock)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'tờ','printing','substrate_sheet','sheet','sheet',false,false,false,true,'normal',0,0)
                     ON CONFLICT (code) DO NOTHING`,
                    [m.code, m.materialName, m.type, m.gsm, m.priceVAT, m.priceNoVAT, m.sheetWidth, m.sheetHeight],
                );
            }
            for (const k of d.khoIn) {
                // SỬA SPLIT-BRAIN (A1): khổ in offset ghi vào `paper_sizes` (scope_offset) — ĐÚNG nguồn engine đọc,
                // KHÔNG ghi `offset_cfg_kho_in` (bảng engine không đọc). Đảm bảo cột offset tồn tại (A2) trước khi seed.
                const dim = this.parseKhoMm(k.khoIn);
                await this.dataSource.query(
                    `INSERT INTO paper_sizes
                        (code, name, width, height, is_standard, scope_loose, scope_bound, scope_large_format, scope_offset,
                         kho_giay_lon, chia_to, so_con_bai_in, so_con_to_lon, loai_kem, charge_full_width)
                     VALUES ($1,$1,$2,$3,false,false,false,false,true,$4,$5,$6,$7,$8,true)
                     ON CONFLICT (code) DO UPDATE SET
                       scope_offset = true,
                       kho_giay_lon = COALESCE(paper_sizes.kho_giay_lon, EXCLUDED.kho_giay_lon),
                       chia_to = COALESCE(paper_sizes.chia_to, EXCLUDED.chia_to),
                       so_con_bai_in = COALESCE(paper_sizes.so_con_bai_in, EXCLUDED.so_con_bai_in),
                       so_con_to_lon = COALESCE(paper_sizes.so_con_to_lon, EXCLUDED.so_con_to_lon),
                       loai_kem = COALESCE(paper_sizes.loai_kem, EXCLUDED.loai_kem)`,
                    [k.khoIn, dim.w, dim.h, k.khoGiayLon, k.chiaTo, k.soConBaiIn, k.soConToLon, k.loaiKem],
                );
            }

            for (const f of d.fixedSizes.toRoi) {
                await this.dataSource.query(
                    `INSERT INTO offset_cfg_fixed_size (nhom, kich_thuoc, kho_in, kho_giay_lon, so_con_bai_in, so_con_to_lon, loai)
                     VALUES ('to_roi',$1,$2,$3,$4,$5,'') ON CONFLICT (nhom, kich_thuoc, loai) DO NOTHING`,
                    [f.kichThuoc, f.khoIn, f.khoGiayLon, f.soConBaiIn, f.soConToLon],
                );
            }
            for (const f of d.fixedSizes.biThuFolder) {
                await this.dataSource.query(
                    `INSERT INTO offset_cfg_fixed_size (nhom, kich_thuoc, kho_in, kho_giay_lon, so_con_bai_in, so_con_kho_giay_lon, loai)
                     VALUES ('bi_thu_folder',$1,$2,$3,$4,$5,$6) ON CONFLICT (nhom, kich_thuoc, loai) DO NOTHING`,
                    [f.kichThuoc, f.khoIn, f.khoGiayLon, f.soConBaiIn, f.soConKhoGiayLon, f.loai],
                );
            }
            for (const g of d.giaCong) {
                // Gia công offset → processing_options (scope_offset) + processing_pricing (tiers).
                await this.dataSource.query(
                    `INSERT INTO processing_options (code, name, type, price, is_active, scope_loose, scope_bound, scope_large_format, scope_offset, billing_mode, moq_param, min_charge_param)
                     VALUES ($1,$2,'finishing',0,1,0,0,0,true,$3,$4,$5)
                     ON CONFLICT (code) DO NOTHING`,
                    [g.code, g.congDoan, g.billingMode, g.moqParam, g.minChargeParam],
                );
                const optRow = await this.dataSource.query('SELECT id FROM processing_options WHERE code = $1', [g.code]);
                const optId = optRow?.[0]?.id;
                if (optId) {
                    const existing = await this.dataSource.query(
                        'SELECT COUNT(*)::int AS cnt FROM processing_pricing WHERE processing_option_id = $1', [optId],
                    );
                    const cnt = existing?.[0]?.cnt ?? 0;
                    if (!cnt) {
                        for (const t of g.tiers) {
                            await this.dataSource.query(
                                `INSERT INTO processing_pricing (processing_option_id, pricing_method, quantity_from, quantity_to, unit_price, min_charge, is_active)
                                 VALUES ($1,'offset_tier',$2,$3,$4,0,true)`,
                                [optId, t.min, t.max, t.price ?? 0],
                            );
                        }
                    }
                }
            }
            for (const [bang, rows] of [['kemNho', d.kem.kemNho], ['kemLon', d.kem.kemLon]] as const) {
                for (const r of rows) {
                    await this.dataSource.query(
                        `INSERT INTO offset_cfg_kem (bang, so_kem, don_gia) VALUES ($1,$2,$3)
                         ON CONFLICT (bang, so_kem) DO NOTHING`,
                        [bang, r.soKem, r.donGia],
                    );
                }
            }
            for (const v of d.kem.vatTuBeMat) {
                await this.dataSource.query(
                    `INSERT INTO offset_cfg_vat_tu_be_mat (ten, don_gia_kg, so_mat) VALUES ($1,$2,$3)
                     ON CONFLICT (ten) DO NOTHING`,
                    [v.ten, v.donGiaKg, v.soMat],
                );
            }
            for (const e of d.epKim.rows) {
                await this.dataSource.query(
                    `INSERT INTO offset_cfg_ep_kim (vi_tri, duoi100, tu100_499, tu500_999, tren1000)
                     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (vi_tri) DO NOTHING`,
                    [e.viTri, e.duoi100, e.tu100_499, e.tu500_999, e.tren1000],
                );
            }
            // Hao hụt offset → waste_rules (print_method='offset', tag 'pricebook'), idempotent: chỉ seed khi chưa có.
            const hhExisting = await this.dataSource.query(
                "SELECT COUNT(*)::int AS cnt FROM waste_rules WHERE print_method = 'offset' AND description = 'pricebook'",
            );
            if (!(hhExisting?.[0]?.cnt)) {
                for (const h of d.tyLe.haoHut) {
                    await this.dataSource.query(
                        `INSERT INTO waste_rules (print_method, quantity_from, quantity_to, waste_percent, description, is_active)
                         VALUES ('offset',$1,NULL,$2,'pricebook',true)`,
                        [h.mocSoLuong, h.tyLe * 100],
                    );
                }
            }
            // Tham số offset → pricing_config (key tiền tố 'offset.'), idempotent qua unique config_key.
            const paramEntries: [string, number][] = [
                ...Object.entries(d.tyLe.params).map(([k, v]) => [k, v] as [string, number]),
                ['DonGia1Kem_KemNho', d.kem.donGia1Kem.kemNho],
                ['DonGia1Kem_KemLon', d.kem.donGia1Kem.kemLon],
            ];
            for (const [ten, giaTri] of paramEntries) {
                await this.dataSource.query(
                    `INSERT INTO pricing_config (config_key, config_value, description)
                     VALUES ($1,$2,'offset pricebook') ON CONFLICT (config_key) DO NOTHING`,
                    [`offset.${ten}`, String(giaTri)],
                );
            }
            // Phí cố định offset → setup_fees (category='offset'), idempotent qua unique code.
            for (const p of d.phiCoDinh) {
                await this.dataSource.query(
                    `INSERT INTO setup_fees (code, name, fee_type, category, price_fixed, is_active)
                     VALUES ($1,$2,'offset_fixed','offset',$3,true) ON CONFLICT (code) DO NOTHING`,
                    [p.code, p.ten, p.giaTri],
                );
            }
            return { seeded: true };
        } catch (err: any) {
            this.logger.error(`seedDefaults failed: ${err?.message}`);
            return { seeded: false, reason: err?.message };
        }
    }

    // ═══ CRUD admin theo nhóm (Req 18.2, 18.3) ═══
    // Mỗi upsert dùng INSERT ... ON CONFLICT ... DO UPDATE để vừa tạo vừa sửa.
    // LƯU Ý: Giấy in offset KHÔNG có CRUD riêng ở đây — quản lý tại màn Vật tư chung
    // (bảng `materials`, tab Offset). ConfigStore chỉ ĐỌC giấy in từ đó.

    // LƯU Ý (A1): khổ in offset là `paper_sizes` (scope_offset) — KHÔNG dùng `offset_cfg_kho_in` (engine không đọc).
    async upsertKhoIn(k: KhoIn): Promise<void> {
        const dim = this.parseKhoMm(k.khoIn);
        await this.dataSource.query(
            `INSERT INTO paper_sizes
                (code, name, width, height, is_standard, scope_loose, scope_bound, scope_large_format, scope_offset,
                 kho_giay_lon, chia_to, so_con_bai_in, so_con_to_lon, loai_kem, charge_full_width, updated_at)
             VALUES ($1,$1,$2,$3,false,false,false,false,true,$4,$5,$6,$7,$8,true,NOW())
             ON CONFLICT (code) DO UPDATE SET
               scope_offset=true, width=EXCLUDED.width, height=EXCLUDED.height,
               kho_giay_lon=EXCLUDED.kho_giay_lon, chia_to=EXCLUDED.chia_to,
               so_con_bai_in=EXCLUDED.so_con_bai_in, so_con_to_lon=EXCLUDED.so_con_to_lon,
               loai_kem=EXCLUDED.loai_kem, updated_at=NOW()`,
            [k.khoIn, dim.w, dim.h, k.khoGiayLon, k.chiaTo, k.soConBaiIn, k.soConToLon, k.loaiKem],
        );
    }
    async deleteKhoIn(khoIn: string): Promise<void> {
        // Bỏ cờ offset thay vì XÓA — khổ giấy có thể đang dùng cho in nhanh.
        await this.dataSource.query('UPDATE paper_sizes SET scope_offset = false WHERE code = $1', [khoIn]);
    }

    async upsertVatTuBeMat(v: VatTuBeMat): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO offset_cfg_vat_tu_be_mat (ten, don_gia_kg, so_mat) VALUES ($1,$2,$3)
             ON CONFLICT (ten) DO UPDATE SET don_gia_kg=EXCLUDED.don_gia_kg, so_mat=EXCLUDED.so_mat`,
            [v.ten, v.donGiaKg, v.soMat],
        );
    }
    async deleteVatTuBeMat(ten: string): Promise<void> {
        await this.dataSource.query('DELETE FROM offset_cfg_vat_tu_be_mat WHERE ten = $1', [ten]);
    }

    async upsertEpKim(e: EpKimRow): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO offset_cfg_ep_kim (vi_tri, duoi100, tu100_499, tu500_999, tren1000) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (vi_tri) DO UPDATE SET duoi100=EXCLUDED.duoi100, tu100_499=EXCLUDED.tu100_499,
               tu500_999=EXCLUDED.tu500_999, tren1000=EXCLUDED.tren1000`,
            [e.viTri, e.duoi100, e.tu100_499, e.tu500_999, e.tren1000],
        );
    }
    async deleteEpKim(viTri: string): Promise<void> {
        await this.dataSource.query('DELETE FROM offset_cfg_ep_kim WHERE vi_tri = $1', [viTri]);
    }

    async upsertFixedSize(nhom: 'to_roi' | 'bi_thu_folder', row: any): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO offset_cfg_fixed_size (nhom, kich_thuoc, kho_in, kho_giay_lon, so_con_bai_in, so_con_to_lon, so_con_kho_giay_lon, loai)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (nhom, kich_thuoc, loai) DO UPDATE SET
               kho_in=EXCLUDED.kho_in, kho_giay_lon=EXCLUDED.kho_giay_lon, so_con_bai_in=EXCLUDED.so_con_bai_in,
               so_con_to_lon=EXCLUDED.so_con_to_lon, so_con_kho_giay_lon=EXCLUDED.so_con_kho_giay_lon`,
            [nhom, row.kichThuoc, row.khoIn ?? null, row.khoGiayLon ?? null,
             row.soConBaiIn ?? null, row.soConToLon ?? null, row.soConKhoGiayLon ?? null, row.loai ?? ''],
        );
    }
    async deleteFixedSize(id: number): Promise<void> {
        await this.dataSource.query('DELETE FROM offset_cfg_fixed_size WHERE id = $1', [id]);
    }

    async upsertKem(bang: 'kemNho' | 'kemLon', soKem: number, donGia: number): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO offset_cfg_kem (bang, so_kem, don_gia) VALUES ($1,$2,$3)
             ON CONFLICT (bang, so_kem) DO UPDATE SET don_gia=EXCLUDED.don_gia`,
            [bang, soKem, donGia],
        );
    }
    async deleteKem(bang: 'kemNho' | 'kemLon', soKem: number): Promise<void> {
        await this.dataSource.query('DELETE FROM offset_cfg_kem WHERE bang = $1 AND so_kem = $2', [bang, soKem]);
    }

    // ═══ Tham số offset (pricing_config key 'offset.<key>') — gồm định mức hao công đoạn ═══

    /** Ghi/sửa một tham số offset (vd 'Hao_Be_Rate'). Lưu pricing_config key 'offset.<key>'. */
    async upsertParam(key: string, value: number): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO pricing_config (config_key, config_value, description)
             VALUES ($1, $2, 'offset pricebook param')
             ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
            [`offset.${key}`, String(value)],
        );
    }

    /** Xóa tham số offset → engine quay về mặc định/đường cong cho key đó. */
    async deleteParam(key: string): Promise<void> {
        await this.dataSource.query('DELETE FROM pricing_config WHERE config_key = $1', [`offset.${key}`]);
    }

    /**
     * Lưu định mức BÙ HAO THEO CÔNG ĐOẠN (mỗi công đoạn 1 bảng mốc riêng) dạng JSON.
     * Lưu pricing_config key 'offset.WasteStages'. Engine đọc qua loadPricingData().wasteStages.
     */
    async saveWasteStages(stages: Record<string, WasteStageConfig>): Promise<void> {
        const json = JSON.stringify(stages ?? {});
        await this.dataSource.query(
            `INSERT INTO pricing_config (config_key, config_value, description)
             VALUES ('offset.WasteStages', $1, 'offset waste stages (per-stage tiers)')
             ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
            [json],
        );
    }

    /**
     * Lưu cấu hình form THEO LOẠI SẢN PHẨM (whitelist tài nguyên + mặc định + ẩn/khoá field) dạng JSON.
     * Lưu pricing_config key 'offset.ProductConfig'. Engine bỏ qua; chỉ frontend dùng qua pricebook.
     */
    async saveProductConfig(config: Record<string, OffsetProductConfig>): Promise<void> {
        const json = JSON.stringify(config ?? {});
        await this.dataSource.query(
            `INSERT INTO pricing_config (config_key, config_value, description)
             VALUES ('offset.ProductConfig', $1, 'offset per-product form config')
             ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
            [json],
        );
    }

    /**
     * Lưu MỐC SỐ LƯỢNG bậc giá (mảng số) dạng JSON vào pricing_config 'offset.MocSoLuong'.
     * Engine đọc qua loadPricingData().tyLe.mocSoLuong. Trống → quay về mặc định 17 mốc.
     */
    async saveMocSoLuong(moc: number[]): Promise<void> {
        const clean = (moc || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
        const json = JSON.stringify(clean);
        await this.dataSource.query(
            `INSERT INTO pricing_config (config_key, config_value, description)
             VALUES ('offset.MocSoLuong', $1, 'offset quantity tier breakpoints')
             ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
            [json],
        );
    }

    /**
     * Ghi/sửa một PHÍ CỐ ĐỊNH offset (khuôn/thiết kế...) vào `setup_fees` (category='offset').
     * Engine đọc qua loadPricingData().phiCoDinh.
     */
    async upsertPhiCoDinh(code: string, ten: string, giaTri: number): Promise<void> {
        await this.dataSource.query(
            `INSERT INTO setup_fees (code, name, fee_type, category, price_fixed, is_active)
             VALUES ($1, $2, 'offset_fixed', 'offset', $3, true)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price_fixed = EXCLUDED.price_fixed`,
            [code, ten, giaTri],
        );
    }

    // ═══ Đường cong hao theo MỐC SỐ LƯỢNG (waste_rules, print_method='offset', tag 'pricebook') ═══

    /**
     * Thay toàn bộ bảng mốc số lượng của đường cong hao offset.
     * @param rows danh sách { mocSoLuong, percent } (percent = % hao tại mốc đó).
     * Dùng transaction: xóa rồi chèn lại — tránh mất dữ liệu nếu lỗi giữa chừng.
     */
    async saveHaoHutCurve(rows: { mocSoLuong: number; percent: number }[]): Promise<void> {
        const clean = (rows || [])
            .filter((r) => Number.isFinite(r.mocSoLuong) && Number.isFinite(r.percent) && r.mocSoLuong > 0)
            .sort((a, b) => a.mocSoLuong - b.mocSoLuong);
        if (clean.length === 0) return;
        await this.dataSource.transaction(async (mgr) => {
            await mgr.query("DELETE FROM waste_rules WHERE print_method = 'offset' AND description = 'pricebook'");
            for (const r of clean) {
                await mgr.query(
                    `INSERT INTO waste_rules (print_method, quantity_from, quantity_to, waste_percent, description, is_active)
                     VALUES ('offset', $1, NULL, $2, 'pricebook', true)`,
                    [Math.round(r.mocSoLuong), r.percent],
                );
            }
        });
    }
}
