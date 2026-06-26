'use client';

/**
 * FrozenRouteGuard — route guard cho tính năng đang ở Trạng_Thái_Đóng_Băng (frozen).
 *
 * Khi người dùng điều hướng trực tiếp tới route của một tính năng đã bị đóng băng
 * (ẩn khỏi menu nhưng route vẫn tồn tại), guard hiển thị thông báo thân thiện
 * "Tính năng hiện không khả dụng" thay cho nội dung trang, đồng thời:
 *
 * - GIỮ NGUYÊN session: guard không đụng tới auth/localStorage, không logout, không
 *   chuyển hướng — phiên đăng nhập được bảo toàn (Req 4.6, 3.3).
 * - KHÔNG ném lỗi chưa xử lý: việc kiểm tra `isFrozenRoute` được bọc an toàn; mọi
 *   trường hợp bất thường đều fail-open (render nội dung) thay vì crash (Req 4.6).
 *
 * Guard là hàm thuần theo input: kết quả chỉ phụ thuộc vào `registry` và path hiện
 * tại. Path mặc định lấy từ `usePathname()` (Next.js App Router); có thể truyền
 * `pathname` tường minh để thuận tiện kiểm thử (task 7.4) mà không cần mock router.
 *
 * Cách dùng (trong layout của App_CSKH / App_BaoGia):
 * ```tsx
 * <FrozenRouteGuard registry={scopeRegistry}>
 *   {children}
 * </FrozenRouteGuard>
 * ```
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * _Requirements: 4.6_
 */

import React from 'react';
import { usePathname } from 'next/navigation';

import { isFrozenRoute } from '@/lib/scope/ia-resolver';
import type { ScopeRegistry } from '@/lib/scope/types';

/** Thông báo mặc định khi truy cập route đã đóng băng (Req 4.6). */
export const FROZEN_FEATURE_MESSAGE = 'Tính năng hiện không khả dụng';

/**
 * Kiểm tra một path có thuộc tính năng đóng băng không, đảm bảo KHÔNG ném lỗi.
 *
 * Bọc `isFrozenRoute` trong try/catch để thoả ràng buộc "không ném lỗi chưa xử lý"
 * (Req 4.6): nếu bất kỳ điều bất thường nào xảy ra (registry hỏng, v.v.) thì coi như
 * route không bị đóng băng (fail-open) thay vì làm crash cây React.
 */
function safeIsFrozenRoute(
  registry: ScopeRegistry | null | undefined,
  path: string | null | undefined,
): boolean {
  if (!registry || typeof path !== 'string' || path.length === 0) return false;
  try {
    return isFrozenRoute(registry, path);
  } catch {
    return false;
  }
}

/**
 * Hook: path hiện tại có trỏ tới một tính năng đang đóng băng không.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param pathname Path tường minh; nếu bỏ trống sẽ lấy từ `usePathname()`.
 * @returns `true` nếu route hiện tại bị đóng băng.
 *
 * _Requirements: 4.6_
 */
export function useFrozenRoute(
  registry: ScopeRegistry,
  pathname?: string,
): boolean {
  // usePathname luôn được gọi (tuân thủ Rules of Hooks); ưu tiên path truyền vào.
  const currentPath = usePathname();
  const resolvedPath = pathname ?? currentPath ?? '';
  return safeIsFrozenRoute(registry, resolvedPath);
}

/** Props của {@link FrozenRouteGuard}. */
export interface FrozenRouteGuardProps {
  /** Đăng_Ký_Phạm_Vi — nguồn sự thật để xác định route đóng băng. */
  registry: ScopeRegistry;
  /** Nội dung trang được bảo vệ; chỉ render khi route KHÔNG bị đóng băng. */
  children: React.ReactNode;
  /** Path tường minh (chủ yếu cho kiểm thử). Mặc định lấy từ `usePathname()`. */
  pathname?: string;
  /** Nội dung thay thế tuỳ biến khi route bị đóng băng. Mặc định: thông báo chuẩn. */
  fallback?: React.ReactNode;
}

/** Khối thông báo mặc định hiển thị khi route bị đóng băng. */
function FrozenNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="frozen-route-notice"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: '#475569',
      }}
    >
      <p style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
        {FROZEN_FEATURE_MESSAGE}
      </p>
      <p style={{ fontSize: '0.875rem', margin: 0 }}>
        Tính năng này đã được tạm ẩn. Vui lòng quay lại trang trước hoặc liên hệ
        quản trị viên nếu cần.
      </p>
    </div>
  );
}

/**
 * Bọc nội dung trang và chặn hiển thị khi route hiện tại thuộc tính năng đóng băng.
 *
 * Hành vi:
 * - Route bị đóng băng ⇒ render `fallback` (mặc định: {@link FrozenNotice} với thông
 *   báo "Tính năng hiện không khả dụng"). Không logout, không redirect ⇒ giữ session.
 * - Ngược lại ⇒ render `children` như bình thường.
 *
 * _Requirements: 4.6_
 */
export function FrozenRouteGuard({
  registry,
  children,
  pathname,
  fallback,
}: FrozenRouteGuardProps): React.ReactElement {
  const frozen = useFrozenRoute(registry, pathname);

  if (frozen) {
    return <>{fallback ?? <FrozenNotice />}</>;
  }

  return <>{children}</>;
}

export default FrozenRouteGuard;
