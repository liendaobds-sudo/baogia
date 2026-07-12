import { api } from './apiClient';

/**
 * fetchQuoteMaterials — nguồn DUY NHẤT để nạp vật tư cho DROPDOWN BÁO GIÁ / ĐỊNH MỨC.
 *
 * Vì sao tồn tại: endpoint `/erp/materials` KHÔNG mặc định lọc `category_tab`, nên gọi
 * `?scope=loose` trần vẫn kéo cả mực/kẽm/keo/gia công (những thứ bị bật cờ scope rộng tay
 * trong DB). Lọc ĐÚNG cho dropdown = scope (hệ in) + category_tab (chỉ vật liệu in). Trước
 * đây mỗi màn tự ghép scope+category+dedupe → dễ quên, sinh lớp bug "dropdown lẫn rác".
 * Helper này gom một chỗ: mọi màn định mức/báo giá gọi qua đây thay vì tự nhớ.
 *
 * KHÔNG dùng cho màn Quản lý kho (`/pricing/materials`) hay ProductModal — chúng CẦN thấy
 * mọi loại vật tư (mực, kẽm...), nên gọi `/erp/materials` trần là đúng.
 *
 * API chỉ nhận 1 `scope` + 1 `category` mỗi request → gọi tổ hợp rồi hợp nhất theo id.
 */

export interface QuoteMaterial {
    id: number;
    [key: string]: unknown;
}

/** Hệ in cần lấy vật tư (khớp cột materials.scope_*). */
export type MaterialScope = 'loose' | 'bound' | 'large_format' | 'offset';

/** Nhóm vật liệu in (khớp materials.category_tab). Mặc định cả tấm phẳng + cuộn. */
export type SubstrateCategory = 'substrate_sheet' | 'substrate_roll';

const DEFAULT_CATEGORIES: SubstrateCategory[] = ['substrate_sheet', 'substrate_roll'];

function dedupeById<T extends { id: number }>(...lists: (T[] | undefined)[]): T[] {
    const byId = new Map<number, T>();
    for (const list of lists) for (const item of list || []) byId.set(item.id, item);
    return Array.from(byId.values());
}

/**
 * Nạp vật tư cho dropdown báo giá: chỉ vật liệu in thuộc các hệ in yêu cầu.
 * @param scopes  hệ in cần lấy (VD ['loose','bound'] cho định mức in nhanh).
 * @param categories nhóm vật liệu (mặc định tấm phẳng + cuộn; định mức in nhanh thường chỉ ['substrate_sheet']).
 */
export async function fetchQuoteMaterials(
    scopes: MaterialScope[],
    categories: SubstrateCategory[] = DEFAULT_CATEGORIES,
): Promise<QuoteMaterial[]> {
    const combos = scopes.flatMap((scope) => categories.map((cat) => ({ scope, cat })));
    const results = await Promise.all(
        combos.map(({ scope, cat }) =>
            api.get<QuoteMaterial[]>(`/erp/materials?scope=${scope}&category=${cat}`),
        ),
    );
    return dedupeById(...results.map((r) => r.data));
}
