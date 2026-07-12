/**
 * tier-cost — logic thuần cho định mức in nhanh (tầng 2): tách chi phí giấy/mực + phát hiện lệch giá vốn.
 *
 * Giá bán/tờ của một tier = paper_cost (giá vốn giấy, dẫn từ materials.cost_price) + ink_cost
 * (mực, nhập tay). Đây là NGUỒN PHÁI SINH: khi cost_price đổi (nhập lô mới ở tầng 1), tier lệch
 * → FE hiện badge, người dùng bấm đồng bộ. Tách ra helper thuần để test không cần TypeORM.
 */

/**
 * Tổng giá vốn thuần/tờ = cộng mọi thành phần chi phí truyền vào.
 * Tầng 2: paper + ink. Tầng 3 mở rộng: paper + ink + machine + labor + overhead.
 * Variadic để tương thích ngược (gọi 2 tham số vẫn đúng). KHÔNG cộng markup — facade lo.
 */
export function tierPricePerSheet(...components: (number | null | undefined)[]): number {
    return components.reduce<number>((sum, c) => sum + (Number(c) || 0), 0);
}

/**
 * Giá vốn giấy trong tier (paper_cost) đã lệch với cost_price hiện tại của vật tư chưa.
 * Lệch = có giá vốn hiện tại > 0 VÀ khác paper_cost (so ở mức 2 chữ số thập phân, khớp cách
 * làm tròn của weighted-avg tầng 1). currentCost/paperCost null → coi như KHÔNG lệch (chưa đủ dữ liệu).
 */
export function isCostDrift(currentCost: number | null | undefined, paperCost: number | null | undefined): boolean {
    if (currentCost == null || paperCost == null) return false;
    const cur = Number(currentCost);
    const paper = Number(paperCost);
    if (!(cur > 0)) return false;
    return Math.round(cur * 100) !== Math.round(paper * 100);
}
