'use client';

/**
 * RouteAccessGuard — seam kiểm soát truy cập RBAC ở cấp route (NAY THỰC THI THẬT).
 *
 * Đây là điểm DUY NHẤT để cắm policy RBAC cấp route cho các route `core`. Guard dùng
 * cùng một lõi quyết định thuần (`canAccess` + `normalizeCapability` từ
 * `@/lib/access-decision`) mà backend dùng để thực thi, nên quyết định hiển thị ở
 * frontend trùng với quyết định chặn ở backend (giảm 403 bất ngờ).
 *
 * Hành vi:
 * - Không truyền `requiredCapability` → **permissive**: luôn render `children` (giữ
 *   tương thích cho các route chưa nối dây quyền).
 * - Có `requiredCapability` → cho phép khi
 *   `canAccess(permissions, [normalizeCapability(requiredCapability)])`. Thiếu quyền
 *   → render thông báo "Không đủ quyền truy cập" (KHÔNG ném lỗi).
 *
 * Lưu ý bảo mật: đây CHỈ là lớp UX. Ranh giới bảo mật thật nằm ở backend
 * (`PermissionsGuard`); ẩn/chặn ở frontend chỉ để tránh người dùng thao tác rồi nhận 403.
 *
 * Quan hệ với {@link FrozenRouteGuard} (`frontend/src/components/FrozenRouteGuard.tsx`):
 * hai guard tách biệt và bổ sung nhau.
 * - `FrozenRouteGuard` chặn route thuộc tính năng `frozen` (Req 4.6).
 * - `RouteAccessGuard` là seam RBAC cấp route cho các route `core`.
 *
 * Thứ tự compose đề xuất: `FrozenRouteGuard` (ngoài) → `RouteAccessGuard` (trong):
 * ```tsx
 * <FrozenRouteGuard registry={scopeRegistry}>
 *   <RouteAccessGuard requiredCapability="order.view">
 *     {children}
 *   </RouteAccessGuard>
 * </FrozenRouteGuard>
 * ```
 *
 * Tài liệu thiết kế: `.kiro/specs/rbac-quote-order-access/design.md` (mục 7).
 *
 * _Requirements: 5.4, 5.5, 5.8_
 */

import React from 'react';
import { usePermissions } from '@/lib/auth-context';
import { canAccess, normalizeCapability } from '@/lib/access-decision';

/** Props của {@link RouteAccessGuard}. */
export interface RouteAccessGuardProps {
  /**
   * Năng lực (capability) yêu cầu để truy cập route, ví dụ `'order.view'`,
   * `'quote.create'`. Guard tự chuẩn hoá ':' → '.'. Không truyền = permissive.
   */
  requiredCapability?: string;
  /**
   * Vai trò (role) yêu cầu để truy cập route. Placeholder cho mở rộng tương lai;
   * HIỆN CHƯA được kiểm tra.
   */
  requiredRole?: string;
  /** Nội dung được bảo vệ; chỉ render khi đủ quyền (hoặc khi không yêu cầu quyền). */
  children: React.ReactNode;
}

/**
 * Bọc nội dung route làm seam kiểm soát truy cập RBAC, thực thi quyền thật ở lớp UX.
 *
 * _Requirements: 5.4, 5.5, 5.8_
 */
export function RouteAccessGuard({
  requiredCapability,
  children,
}: RouteAccessGuardProps): React.ReactElement {
  const { permissions } = usePermissions();

  // Không yêu cầu capability → permissive (giữ tương thích các route chưa nối dây).
  if (!requiredCapability) return <>{children}</>;

  const allowed = canAccess(permissions, [normalizeCapability(requiredCapability)]);
  if (!allowed) {
    return (
      <div className="p-10 text-center text-slate-500">
        <h2 className="text-lg font-bold mb-2">Không đủ quyền truy cập</h2>
        <p>Bạn không có quyền xem nội dung này. Liên hệ chủ shop nếu cần.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default RouteAccessGuard;
