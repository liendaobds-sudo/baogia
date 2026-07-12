/**
 * ConfigStore.loadPricingData — DẪN GIÁ khổ xả (con) từ giá khổ nhập (cha). GĐ L.
 *
 * Mô hình self-ref (RE-SCOPE 3): mọi khổ giấy là VẬT TƯ. Khổ nhập (`sheet_role='parent'`)
 * có giá `unit_price`; khổ xả (`sheet_role='child'`, `parent_material_id` → cha) KHÔNG nhập
 * giá — engine tự chia: đơn giá con = giá cha / số bài in cắt được từ 1 tờ nhập (pressPerParent).
 *
 * Test dùng fake DataSource trả đúng cấu trúc `materials` (id, sheet_role, parent_material_id,
 * width, height, unit_price). Khẳng định:
 *  1. Con trỏ cha hợp lệ → priceNoVAT = giá cha / N (N từ hình học khổ).
 *  2. Con khổ ≡ cha (in thẳng, N=1) → priceNoVAT = giá cha (không chia).
 *  3. Cha (parent) giữ nguyên giá nhập tay.
 *  4. Con mồ côi (parent_material_id trỏ id không tồn tại) → giữ nguyên (không vỡ).
 */
import { ConfigStore } from '../config-store.service';

interface MatRow {
    id: number;
    code: string;
    name: string;
    type: string;
    gsm: number | null;
    price_vat: number;
    unit_price: number;
    width: number;
    height: number;
    sheet_role: 'parent' | 'child' | null;
    parent_material_id: number | null;
}

// Fake DataSource: chỉ cần trả materials cho SELECT ... FROM materials; mọi bảng khác trả [].
function fakeDataSource(matRows: MatRow[]) {
    return {
        options: { type: 'postgres' as const },
        query: jest.fn(async (sql: string) => {
            if (/FROM materials WHERE scope_offset/i.test(sql)) return matRows.map((r) => ({ ...r }));
            return [];
        }),
    } as any;
}

const BASE = { name: 'Giấy', type: 'paper', gsm: 300, price_vat: 0 };

async function loadMaterials(matRows: MatRow[]) {
    const store = new ConfigStore(fakeDataSource(matRows));
    const data = await store.loadPricingData();
    return data.materials;
}

describe('ConfigStore — dẫn giá khổ xả từ khổ nhập (GĐ L)', () => {
    it('con trỏ cha hợp lệ → priceNoVAT = giá cha / số bài in cắt được (pressPerParent)', async () => {
        // Cha 790×1090mm giá 10000. Con 390×540mm → 1 tờ nhập cắt được 4 bài (790/390≈2 × 1090/540≈2).
        const mats = await loadMaterials([
            { ...BASE, id: 1, code: 'C300-79x109', unit_price: 10000, width: 790, height: 1090, sheet_role: 'parent', parent_material_id: null },
            { ...BASE, id: 2, code: 'C300-39x54', unit_price: 0, width: 390, height: 540, sheet_role: 'child', parent_material_id: 1 },
        ]);
        const child = mats.find((m) => m.code === 'C300-39x54')!;
        expect(child.priceNoVAT).toBeCloseTo(10000 / 4, 6);
    });

    it('con khổ ≡ cha (in thẳng, N=1) → priceNoVAT = giá cha', async () => {
        const mats = await loadMaterials([
            { ...BASE, id: 1, code: 'C300-79x109', unit_price: 10000, width: 790, height: 1090, sheet_role: 'parent', parent_material_id: null },
            { ...BASE, id: 2, code: 'C300-full', unit_price: 0, width: 790, height: 1090, sheet_role: 'child', parent_material_id: 1 },
        ]);
        const child = mats.find((m) => m.code === 'C300-full')!;
        expect(child.priceNoVAT).toBeCloseTo(10000, 6);
    });

    it('cha (parent) giữ nguyên giá nhập tay', async () => {
        const mats = await loadMaterials([
            { ...BASE, id: 1, code: 'C300-79x109', unit_price: 10000, width: 790, height: 1090, sheet_role: 'parent', parent_material_id: null },
        ]);
        const parent = mats.find((m) => m.code === 'C300-79x109')!;
        expect(parent.priceNoVAT).toBe(10000);
    });

    it('con mồ côi (cha không tồn tại) → giữ nguyên giá 0, không vỡ', async () => {
        const mats = await loadMaterials([
            { ...BASE, id: 2, code: 'C300-39x54', unit_price: 0, width: 390, height: 540, sheet_role: 'child', parent_material_id: 999 },
        ]);
        const child = mats.find((m) => m.code === 'C300-39x54')!;
        expect(child.priceNoVAT).toBe(0);
    });
});
