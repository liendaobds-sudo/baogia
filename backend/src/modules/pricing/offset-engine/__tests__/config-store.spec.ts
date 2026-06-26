import { ConfigStore } from '../config-store.service';
import { loadDefaultPricingData } from '../default-data';

/**
 * Integration nhẹ cho ConfigStore với DataSource giả lập (in-memory).
 *
 * Kiểm:
 * 1. Khi DB rỗng/lỗi truy vấn → loadPricingData fallback đủ 8 nhóm khớp JSON gốc.
 * 2. seedDefaults idempotent (chạy 2 lần không nhân bản ghi) trên store giả lập Postgres.
 * 3. Sau khi seed, loadPricingData dựng lại đúng số bản ghi từ DB.
 *
 * _Requirements: 1.2, 1.3, 1.5_
 */

/** Bảng in-memory mô phỏng Postgres với ON CONFLICT DO NOTHING / DO UPDATE. */
function createFakePostgres() {
    const tables: Record<string, any[]> = {
        materials: [],
        offset_cfg_kho_in: [],
        offset_cfg_fixed_size: [],
        offset_cfg_gia_cong: [],
        offset_cfg_kem: [],
        offset_cfg_vat_tu_be_mat: [],
        offset_cfg_ep_kim: [],
        offset_cfg_hao_hut: [],
        offset_cfg_param: [],
        offset_cfg_moc_so_luong: [],
        offset_cfg_phi_co_dinh: [],
    };

    // Khóa chính của từng bảng để mô phỏng ON CONFLICT.
    const pk: Record<string, string[]> = {
        materials: ['code'],
        offset_cfg_kho_in: ['kho_in'],
        offset_cfg_fixed_size: ['nhom', 'kich_thuoc', 'loai'],
        offset_cfg_gia_cong: ['code'],
        offset_cfg_kem: ['bang', 'so_kem'],
        offset_cfg_vat_tu_be_mat: ['ten'],
        offset_cfg_ep_kim: ['vi_tri'],
        offset_cfg_hao_hut: ['moc_so_luong'],
        offset_cfg_param: ['ten'],
        offset_cfg_moc_so_luong: ['idx'],
        offset_cfg_phi_co_dinh: ['code'],
    };

    // Thứ tự cột tương ứng với INSERT trong ConfigStore.seedDefaults.
    const cols: Record<string, string[]> = {
        // materials: chỉ các cột TRUYỀN QUA PARAM ($1..$8); các cột scope/unit là literal trong SQL.
        materials: ['code', 'name', 'type', 'gsm', 'pricePerSheet', 'unit_price', 'width', 'height'],
        offset_cfg_kho_in: ['kho_in', 'chia_to', 'so_con_bai_in', 'so_con_to_lon', 'kho_giay_lon', 'dien_tich_m2', 'loai_kem'],
        offset_cfg_gia_cong: ['code', 'cong_doan', 'ghi_chu', 'tiers', 'billing_mode', 'min_charge_param', 'moq_param'],
        offset_cfg_kem: ['bang', 'so_kem', 'don_gia'],
        offset_cfg_vat_tu_be_mat: ['ten', 'don_gia_kg', 'so_mat'],
        offset_cfg_ep_kim: ['vi_tri', 'duoi100', 'tu100_499', 'tu500_999', 'tren1000'],
        offset_cfg_hao_hut: ['moc_so_luong', 'ty_le'],
        offset_cfg_param: ['ten', 'gia_tri'],
        offset_cfg_moc_so_luong: ['idx', 'gia_tri'],
        offset_cfg_phi_co_dinh: ['code', 'ten', 'gia_tri', 'ghi_chu'],
    };

    function matchTable(sql: string): string | null {
        for (const t of Object.keys(tables)) if (sql.includes(t)) return t;
        return null;
    }

    const query = jest.fn(async (sql: string, params: any[] = []) => {
        const t = matchTable(sql);
        if (!t) return [];
        if (/^\s*SELECT/i.test(sql)) {
            return tables[t].map((r) => ({ ...r }));
        }
        if (/^\s*INSERT/i.test(sql)) {
            // fixed_size dùng cột động (toRoi vs biThu); xác định theo SQL.
            let columns = cols[t];
            if (t === 'offset_cfg_fixed_size') {
                columns = sql.includes('so_con_kho_giay_lon')
                    ? ['nhom', 'kich_thuoc', 'kho_in', 'kho_giay_lon', 'so_con_bai_in', 'so_con_kho_giay_lon', 'loai']
                    : ['nhom', 'kich_thuoc', 'kho_in', 'kho_giay_lon', 'so_con_bai_in', 'so_con_to_lon', 'loai'];
                // nhom là literal 'to_roi'/'bi_thu_folder' trong SQL, không phải param
                const nhom = sql.includes("'to_roi'") ? 'to_roi' : 'bi_thu_folder';
                const rest = columns.slice(1); // bỏ 'nhom'
                const row: any = { nhom };
                rest.forEach((c, i) => { row[c] = params[i]; });
                if (!('loai' in row)) row.loai = '';
                upsert(t, row);
                return [];
            }
            const row: any = {};
            columns.forEach((c, i) => { row[c] = params[i]; });
            upsert(t, row);
            return [];
        }
        if (/^\s*DELETE/i.test(sql)) {
            return [];
        }
        return [];
    });

    function upsert(t: string, row: any) {
        const keys = pk[t];
        const exists = tables[t].find((r) => keys.every((k) => String(r[k]) === String(row[k])));
        if (!exists) tables[t].push(row);
        // ON CONFLICT DO NOTHING: nếu tồn tại thì bỏ qua.
    }

    return {
        options: { type: 'postgres' as const },
        query,
        _tables: tables,
    };
}

describe('ConfigStore (Feature: offset-pricebook-revamp)', () => {
    it('fallback đủ 8 nhóm khớp JSON gốc khi DB rỗng/lỗi', async () => {
        const ds: any = {
            options: { type: 'sqlite' },
            query: jest.fn().mockRejectedValue(new Error('no such table')),
        };
        const store = new ConfigStore(ds);
        const data = await store.loadPricingData();
        const def = loadDefaultPricingData();

        expect(data.materials.length).toBe(def.materials.length);
        expect(data.khoIn.length).toBe(def.khoIn.length);
        expect(data.giaCong.length).toBe(def.giaCong.length);
        expect(data.tyLe.mocSoLuong).toEqual(def.tyLe.mocSoLuong);
        expect(data.tyLe.params.TyLe_VAT).toBe(def.tyLe.params.TyLe_VAT);
        expect(data.kem.donGia1Kem).toEqual(def.kem.donGia1Kem);
        expect(data.epKim.rows.length).toBe(def.epKim.rows.length);
        expect(data.phiCoDinh.length).toBe(def.phiCoDinh.length);
    });

    it('seedDefaults idempotent: chạy 2 lần không nhân bản ghi', async () => {
        const fake = createFakePostgres();
        const store = new ConfigStore(fake as any);

        const r1 = await store.seedDefaults();
        expect(r1.seeded).toBe(true);
        const def = loadDefaultPricingData();
        expect(fake._tables.materials.length).toBe(def.materials.length);
        const countAfterFirst = Object.fromEntries(
            Object.entries(fake._tables).map(([k, v]) => [k, (v as any[]).length]),
        );

        await store.seedDefaults(); // lần 2
        for (const [k, v] of Object.entries(fake._tables)) {
            expect((v as any[]).length).toBe(countAfterFirst[k]);
        }
    });

    it('sau seed, loadPricingData dựng lại đúng số bản ghi từ DB', async () => {
        const fake = createFakePostgres();
        const store = new ConfigStore(fake as any);
        await store.seedDefaults();

        const data = await store.loadPricingData();
        const def = loadDefaultPricingData();
        expect(data.materials.length).toBe(def.materials.length);
        expect(data.khoIn.length).toBe(def.khoIn.length);
        expect(data.giaCong.length).toBe(def.giaCong.length);
        expect(data.kem.kemNho.length).toBe(def.kem.kemNho.length);
        expect(data.kem.kemLon.length).toBe(def.kem.kemLon.length);
        expect(data.tyLe.mocSoLuong.length).toBe(def.tyLe.mocSoLuong.length);
        // param override donGia1Kem khớp mặc định
        expect(data.kem.donGia1Kem.kemNho).toBe(def.kem.donGia1Kem.kemNho);
    });

    it('gia công offset dựng lại từ processing_options/processing_pricing (override JSON theo code)', async () => {
        const ds: any = {
            options: { type: 'postgres' },
            query: jest.fn(async (sql: string) => {
                if (/FROM processing_options WHERE scope_offset/i.test(sql)) {
                    return [{ id: 1, code: 'BE', name: 'BẾ (custom)', ghi_chu: null, billing_mode: 'minCharge', moq_param: 'MOQ_GiaCong', min_charge_param: 'GiaMin_Be' }];
                }
                if (/FROM processing_pricing/i.test(sql)) {
                    return [
                        { processing_option_id: 1, quantity_from: 0, quantity_to: 300, unit_price: 999000 },
                        { processing_option_id: 1, quantity_from: 1000, quantity_to: 2000, unit_price: 777 },
                    ];
                }
                return [];
            }),
        };
        const store = new ConfigStore(ds);
        const data = await store.loadPricingData();
        const be = data.giaCong.find((g) => g.code === 'BE')!;
        expect(be).toBeDefined();
        expect(be.congDoan).toBe('BẾ (custom)');         // tên từ processing_options (DB ưu tiên)
        expect(be.billingMode).toBe('minCharge');
        expect(be.minChargeParam).toBe('GiaMin_Be');
        expect(be.tiers[0]).toEqual({ min: 0, max: 300, price: 999000 });
        expect(be.tiers[1]).toEqual({ min: 1000, max: 2000, price: 777 });
        // Công đoạn không có trong DB vẫn còn từ mặc định JSON (union).
        expect(data.giaCong.find((g) => g.code === 'XLBM')).toBeDefined();
    });

    it('hao hụt/tham số/phí dựng lại từ waste_rules / pricing_config / setup_fees', async () => {
        const ds: any = {
            options: { type: 'postgres' },
            query: jest.fn(async (sql: string) => {
                if (/FROM waste_rules WHERE print_method = 'offset'/i.test(sql)) {
                    return [
                        { quantity_from: 1000, waste_percent: 9 },
                        { quantity_from: 5000, waste_percent: 5 },
                    ];
                }
                if (/FROM pricing_config WHERE config_key LIKE 'offset\.%'/i.test(sql)) {
                    return [
                        { config_key: 'offset.TyLe_VAT', config_value: '0.1' },
                        { config_key: 'offset.DonGia1Kem_KemNho', config_value: '55000' },
                    ];
                }
                if (/FROM setup_fees WHERE category = 'offset'/i.test(sql)) {
                    return [{ code: 'Gia_ThietKe', name: 'Thiết kế (custom)', price_fixed: 700000 }];
                }
                return [];
            }),
        };
        const store = new ConfigStore(ds);
        const data = await store.loadPricingData();

        // Hao hụt: mocSoLuong=quantity_from, tyLe=waste_percent/100.
        expect(data.tyLe.haoHut[0]).toEqual({ mocSoLuong: 1000, tyLe: 0.09 });
        expect(data.tyLe.haoHut[1]).toEqual({ mocSoLuong: 5000, tyLe: 0.05 });
        // Tham số: key bỏ tiền tố 'offset.', override JSON.
        expect(data.tyLe.params.TyLe_VAT).toBe(0.1);
        expect(data.kem.donGia1Kem.kemNho).toBe(55000);
        // Phí cố định: override theo code từ setup_fees.
        expect(data.phiCoDinh.find((p) => p.code === 'Gia_ThietKe')!.giaTri).toBe(700000);
    });

    it('parse productConfig (whitelist/ẩn/khoá) từ pricing_config JSON', async () => {
        const pc = { to_roi: { allowedMaterials: ['C150'], hidden: ['catXen'], defaults: { soLuong: 500 } } };
        const ds: any = {
            options: { type: 'postgres' },
            query: jest.fn(async (sql: string) => {
                if (/FROM pricing_config WHERE config_key LIKE 'offset\.%'/i.test(sql)) {
                    return [{ config_key: 'offset.ProductConfig', config_value: JSON.stringify(pc) }];
                }
                return [];
            }),
        };
        const store = new ConfigStore(ds);
        const data = await store.loadPricingData();
        expect(data.productConfig).toEqual(pc);
        // ProductConfig KHÔNG bị lẫn vào params (vẫn là JSON tách riêng).
        expect((data.tyLe.params as any).ProductConfig).toBeUndefined();
    });

    it('(A1) khổ in offset ĐỌC từ paper_sizes (kèm loai_kem/so_con)', async () => {
        const ds: any = {
            options: { type: 'postgres' },
            query: jest.fn(async (sql: string) => {
                if (/FROM paper_sizes WHERE scope_offset/i.test(sql)) {
                    return [{
                        kho_in: '43cm x 65cm', widthmm: 430, heightmm: 650,
                        kho_giay_lon: '65cm x 86cm', chia_to: 'Chia 2',
                        so_con_bai_in: 2, so_con_to_lon: 4, loai_kem: 'Kẽm nhỏ',
                        margin_left: 0, margin_right: 0, margin_top: 0, margin_bottom: 0,
                    }];
                }
                return [];
            }),
        };
        const store = new ConfigStore(ds);
        const data = await store.loadPricingData();
        const k = data.khoIn.find((x) => x.khoIn === '43cm x 65cm')!;
        expect(k).toBeDefined();
        expect(k.loaiKem).toBe('Kẽm nhỏ');
        expect(k.soConToLon).toBe(4);
        expect(k.soConBaiIn).toBe(2);
    });

    it('(A1) seedDefaults GHI khổ in vào paper_sizes, KHÔNG ghi offset_cfg_kho_in (hết split-brain)', async () => {
        const calls: string[] = [];
        const ds: any = {
            options: { type: 'postgres' },
            query: jest.fn(async (sql: string) => {
                calls.push(sql);
                if (/SELECT id FROM processing_options/i.test(sql)) return [{ id: 1 }];
                if (/COUNT/i.test(sql)) return [{ cnt: 0 }];
                return [];
            }),
        };
        const store = new ConfigStore(ds);
        const res = await store.seedDefaults();
        expect(res.seeded).toBe(true);
        expect(calls.some((s) => /INSERT INTO paper_sizes/i.test(s) && /scope_offset/i.test(s))).toBe(true);
        expect(calls.some((s) => /INSERT INTO offset_cfg_kho_in/i.test(s))).toBe(false);
        // Vẫn đảm bảo cột offset tồn tại (A2).
        expect(calls.some((s) => /ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS loai_kem/i.test(s))).toBe(true);
    });
});
