'use client';

import QuoteOrderListView from '../_components/QuoteOrderListView';
import RouteAccessGuard from '@/components/RouteAccessGuard';

/**
 * Trang Đơn hàng thật tại `/pricing/orders` (Task 11.4 — Requirement 8).
 *
 * Wrapper mỏng: chỉ render component dùng chung `QuoteOrderListView` với
 * `defaultView='order'`. Dữ liệu nạp qua `GET /erp/orders` bên trong component —
 * KHÔNG thêm bảng/route/endpoint backend mới. Nhất quán với trang Báo giá
 * (`/pricing/quotes`) vốn dùng cùng component với `defaultView='quote'`.
 *
 * Route được bọc bởi `RouteAccessGuard` với capability placeholder ĐỘC LẬP
 * `'order:view'` (Task 11.6 — Req 8.8), tách biệt với capability của trang Báo
 * giá để quyền xem đơn hàng kiểm soát riêng trong tương lai. Guard hiện
 * permissive nên hành vi không đổi.
 *
 * Thứ tự compose theo design: `FrozenRouteGuard` (ngoài) → `RouteAccessGuard`
 * (trong). Hiện `FrozenRouteGuard` chưa được áp dụng ở cấp layout pricing nên
 * task này KHÔNG tự ý thêm frozen-guarding toàn app (ngoài phạm vi). Khi
 * `FrozenRouteGuard` được áp dụng ở layout sau này, thứ tự layout→page sẽ tự
 * bảo toàn frozen-guard-ngoài / access-guard-trong.
 */
export default function OrderListPage() {
    return (
        <RouteAccessGuard requiredCapability="order.view">
            <QuoteOrderListView defaultView="order" title="Danh sách Đơn hàng" />
        </RouteAccessGuard>
    );
}
