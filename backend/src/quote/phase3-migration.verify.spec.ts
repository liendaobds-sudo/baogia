/**
 * Phase 3 — Xác minh di trú mô hình sản phẩm (Task 9.2).
 *
 * Feature: print-method-unification
 *
 * Hai mệnh đề kiểm chứng:
 *  (1) DI TRÚ: migration `backend/migrations/unified_products_offset.sql` (Task 9.1) đưa
 *      ĐỦ 5 loại offset vào `unified_products` với đúng `quote_type` tương ứng
 *      (Req 9.6: thiếu 1 loại ⇒ coi như chưa hoàn tất). Test ÁP migration thật vào một
 *      DB SQLite in-memory rồi SELECT ra để khẳng định — không hardcode kết quả.
 *  (2) BẢO TOÀN GIÁ QUA CATALOG: với mỗi loại offset đã vào catalog, giá lấy bằng cách
 *      ĐỊNH TUYẾN qua tầng method-agnostic (`OffsetMethodPlugin` bọc `EngineOffsetService`)
 *      — dùng chính `code`/`quote_type` đọc TỪ catalog — khớp ĐÚNG golden offset
 *      (`tongChuaVAT` của engine gọi trực tiếp), dung sai bằng KHÔNG (Req 9.5, Req 6.2).
 *
 * Tái dùng cách tiếp cận golden của `plugins/__tests__/price-preservation.golden.spec.ts`.
 *
 * Validates: Requirements 9.5, 9.6
 */
import * as fs from 'fs';
import * as path from 'path';
import * as DatabaseCtor from 'better-sqlite3';
import { EngineOffsetService } from '../modules/pricing/offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../modules/pricing/offset-engine/default-data';
import {
    TUI_NEST_OPTIONS,
    buildTuiOptions,
} from '../modules/pricing/offset-engine/products/tui-giay';
import { OffsetMethodPlugin } from './plugins/offset-method.plugin';
import { MethodRegistry } from './method-registry.service';
import { ProductRef, Specification } from './types/method-plugin.types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Database: any = DatabaseCtor;

const MIGRATION_PATH = path.resolve(
    __dirname,
    '../../migrations/unified_products_offset.sql',
);

/** Bản đồ mong đợi: code (catalog) → quote_type (gợi ý định tuyến plugin). */
const EXPECTED: Record<string, string> = {
    offset_to_roi: 'to_roi',
    offset_bi_thu_folder: 'bi_thu_folder',
    offset_sp_khac: 'sp_khac',
    offset_hop_giay: 'hop_giay',
    offset_tui_giay: 'tui_giay',
};

/**
 * Tạo DB SQLite in-memory với lược đồ `unified_products` tối thiểu (đủ cột mà migration
 * chèn) rồi ÁP migration thật. `code` UNIQUE để mệnh đề `ON CONFLICT (code)` của migration
 * hoạt động đúng (xác minh tính idempotent).
 */
function applyMigration() {
    const db = new Database(':memory:');
    db.exec(`
        CREATE TABLE unified_products (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            code                 TEXT UNIQUE NOT NULL,
            name_vi              TEXT,
            name_en              TEXT,
            quote_type           TEXT,
            unit                 TEXT,
            parent_category_code TEXT,
            ai_keywords          TEXT,
            icon                 TEXT,
            description_vi       TEXT,
            is_active            INTEGER,
            has_auto_pricing     INTEGER,
            allowed_materials    TEXT,
            allowed_paper_sizes  TEXT,
            allowed_processing   TEXT,
            sort_order           INTEGER
        );
    `);
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    db.exec(sql);
    return db;
}

// --- Golden fixtures (đồng bộ với price-preservation.golden.spec.ts) ---
const D = loadDefaultPricingData();
const MAT = D.materials[0].code;
const KHO = D.khoIn[0].khoIn;
const VTBM = 'Không';
const TUI_BAI = (buildTuiOptions(D)[0] ?? TUI_NEST_OPTIONS[0]).label;

/** 5 golden fixture đại diện cho 5 loại offset, khoá theo `quote_type`. */
function goldenOffsetInputs(): Record<string, any> {
    return {
        to_roi: {
            type: 'to_roi',
            kichThuoc: D.fixedSizes.toRoi[0].kichThuoc,
            materialCode: MAT,
            soMatIn: 2,
            soLuong: 5000,
            kemType: 'Kẽm lớn',
            soKemIn: 4,
            vatTuBeMat: 'Màng bóng 2m',
            khuon: true,
            be: true,
            thanhPhamGap: 'may',
            catXen: true,
            dongGoi: true,
            thietKe: 0,
        },
        bi_thu_folder: {
            type: 'bi_thu_folder',
            kichThuoc: D.fixedSizes.biThuFolder[0].kichThuoc,
            materialCode: MAT,
            soMatIn: 1,
            soLuong: 5000,
            kemType: 'Kẽm lớn',
            soKemIn: 4,
            vatTuBeMat: VTBM,
            khuon: true,
            be: true,
            thanhPhamDan: 'khong',
            dongGoi: true,
            thietKe: 0,
        },
        sp_khac: {
            type: 'sp_khac',
            khoIn: KHO,
            materialCode: MAT,
            soMatIn: 2,
            soLuong: 5000,
            soBoKem: 1,
            soMau: 4,
            vatTuBeMat: VTBM,
            khuon: 0,
            be: false,
            thanhPham: 'khong',
            catXen: true,
            dongGoi: true,
            epKimViTri: 'Không',
            thietKe: 0,
        },
        hop_giay: {
            type: 'hop_giay',
            boxType: 'rte',
            cao: 10,
            rong: 8,
            hong: 4,
            khoIn: KHO,
            materialCode: MAT,
            soMatIn: 2,
            soLuong: 5000,
            soBoKem: 1,
            soMau: 4,
            vatTuBeMat: VTBM,
            be: true,
            danHop: 'khong',
            boi2Lop: false,
            dongGoi: true,
            epKimViTri: 'Không',
            thietKe: 0,
        },
        tui_giay: {
            type: 'tui_giay',
            soLuong: 5000,
            cao: 30,
            rong: 25,
            hong: 10,
            mi: 4,
            materialCode: MAT,
            baiIn: TUI_BAI,
            soKem: 4,
            vatTuBeMat: VTBM,
            dayXach: { loai: 'khong', donGia: 0 },
            thungCaton: { sl: 0, donGia: 0 },
            dongGoi: true,
            thietKe: 0,
        },
    };
}

/** Tách `soLuong` ra `quantity`; phần còn lại vào `attributes` để plugin tái dựng input. */
function toSpec(input: any): Specification {
    const { soLuong, ...rest } = input;
    return { quantity: soLuong, attributes: { ...rest } };
}

describe('Phase 3 — di trú 5 loại offset vào unified_products (Task 9.2)', () => {
    describe('(1) Di trú: catalog method-agnostic chứa đủ 5 loại offset', () => {
        it('migration đưa đúng 5 loại offset với quote_type tương ứng (Req 9.6)', () => {
            const db = applyMigration();
            try {
                const rows = db
                    .prepare(
                        `SELECT code, quote_type FROM unified_products
                         WHERE code LIKE 'offset\\_%' ESCAPE '\\'
                         ORDER BY code`,
                    )
                    .all() as { code: string; quote_type: string }[];

                const actual: Record<string, string> = {};
                for (const r of rows) actual[r.code] = r.quote_type;

                // Đủ 5 loại, không thiếu, không dư (Req 9.6).
                expect(actual).toEqual(EXPECTED);
            } finally {
                db.close();
            }
        });

        it('sản phẩm KHÔNG mang trường khoá-engine; quote_type chỉ là gợi ý định tuyến (Req 3.1, 3.4)', () => {
            const db = applyMigration();
            try {
                const row = db
                    .prepare(
                        `SELECT name_vi, allowed_materials, allowed_paper_sizes, allowed_processing
                         FROM unified_products WHERE code = ?`,
                    )
                    .get('offset_to_roi') as Record<string, unknown>;

                // Tên sản phẩm method-agnostic: không nhắc tới "offset"/"digital".
                expect(String(row.name_vi).toLowerCase()).not.toContain('offset');
                // Tài nguyên dùng chung quản ở 1 nguồn (materials.scope_offset...), không nhân đôi xuống SP.
                expect(row.allowed_materials).toBeNull();
                expect(row.allowed_paper_sizes).toBeNull();
                expect(row.allowed_processing).toBeNull();
            } finally {
                db.close();
            }
        });

        it('migration idempotent: chạy lại không tạo bản ghi trùng (ON CONFLICT DO NOTHING)', () => {
            const db = applyMigration();
            try {
                // Áp lại migration lần hai.
                db.exec(fs.readFileSync(MIGRATION_PATH, 'utf8'));
                const { n } = db
                    .prepare(
                        `SELECT COUNT(*) AS n FROM unified_products
                         WHERE code LIKE 'offset\\_%' ESCAPE '\\'`,
                    )
                    .get() as { n: number };
                expect(n).toBe(5);
            } finally {
                db.close();
            }
        });
    });

    describe('(2) Bảo toàn giá: định tuyến qua catalog khớp golden offset (zero-tolerance)', () => {
        const engine = new EngineOffsetService();
        const registry = new MethodRegistry();
        const plugin = new OffsetMethodPlugin(engine, registry);

        it('mọi loại offset trong catalog: priceBeforeVat (qua plugin) === tongChuaVAT (engine), dung sai = 0', async () => {
            const db = applyMigration();
            try {
                const rows = db
                    .prepare(
                        `SELECT code, quote_type FROM unified_products
                         WHERE code LIKE 'offset\\_%' ESCAPE '\\'
                         ORDER BY sort_order`,
                    )
                    .all() as { code: string; quote_type: string }[];

                expect(rows).toHaveLength(5);

                const fixtures = goldenOffsetInputs();
                for (const { code, quote_type } of rows) {
                    const input = fixtures[quote_type];
                    expect(input).toBeDefined();

                    // Golden trực tiếp từ engine.
                    const direct = engine.calculate(input);
                    expect(direct.success).toBe(true);

                    // Định tuyến qua catalog: ProductRef lấy code + quoteType TỪ unified_products.
                    const product: ProductRef = { code, quoteType: quote_type };
                    const viaCatalog = await plugin.calculate(product, toSpec(input), {});

                    expect(viaCatalog.ok).toBe(true);
                    // Zero tolerance: bằng nhau tuyệt đối.
                    expect(viaCatalog.priceBeforeVat).toBe(direct.data!.tongChuaVAT);
                }
            } finally {
                db.close();
            }
        });
    });
});
