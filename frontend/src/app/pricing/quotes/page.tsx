'use client';

import QuoteOrderListView from '@/app/pricing/_components/QuoteOrderListView';
import RouteAccessGuard from '@/components/RouteAccessGuard';

/**
 * Trang "Báo giá" (route /pricing/quotes).
 *
 * Đây chỉ là wrapper mỏng: toàn bộ logic list + detail đã được tách ra
 * component dùng chung `QuoteOrderListView` (Task 11.2). Trang này khởi tạo
 * khung nhìn mặc định là 'quote' để giữ nguyên hành vi cũ — danh sách Báo giá
 * mặc định lọc theo khung nhìn "Báo giá" (Requirement 8).
 *
 * Route được bọc bởi `RouteAccessGuard` với capability placeholder ĐỘC LẬP
 * `'quote:create'` (Task 11.6 — Req 8.8). Guard hiện permissive nên hành vi
 * không đổi; đây là seam DUY NHẤT để cắm policy RBAC sau này.
 *
 * Thứ tự compose theo design: `FrozenRouteGuard` (ngoài) → `RouteAccessGuard`
 * (trong). Hiện `FrozenRouteGuard` chưa được áp dụng ở cấp layout pricing nên
 * task này KHÔNG tự ý thêm frozen-guarding toàn app (ngoài phạm vi). Khi
 * `FrozenRouteGuard` được áp dụng ở layout sau này, thứ tự layout→page sẽ tự
 * bảo toàn frozen-guard-ngoài / access-guard-trong.
 */
export default function QuoteListPage() {
    return (
        <RouteAccessGuard requiredCapability="quote.view">
            <QuoteOrderListView defaultView="quote" />
        </RouteAccessGuard>
    );
}
