'use client';

/**
 * MethodRouteGuard — route guard theo Phương_Pháp_In (Req 2.4, 2.5).
 *
 * Khi NV_Báo_Giá điều hướng trực tiếp tới route của một Phương_Pháp_In KHÔNG thuộc
 * tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành, guard chặn hiển thị và chuyển hướng
 * về Cổng_Tạo_Báo_Giá hợp nhất (Req 2.4). Route dùng chung (không gắn phương pháp)
 * luôn được phép — guard chỉ chặn tại điểm sử dụng một Phương_Pháp_In cụ thể (Req 2.5).
 *
 * Thành phần này là lớp WIRING mỏng quanh hàm thuần `guardMethodRoute` (Task 4.4):
 * - Quyết định cho phép/redirect hoàn toàn do `guardMethodRoute` tính (đã có property
 *   test ở Task 4.5).
 * - Ở đây chỉ làm side-effect điều hướng (`router.replace`) và chọn nội dung render.
 *
 * Ngữ nghĩa fail-open: khi tập Phương_Pháp_Khả_Dụng CHƯA nạp xong (`loaded === false`)
 * hoặc không truyền vào, guard cho hiển thị bình thường để tránh redirect sớm/nhấp
 * nháy. Trạng thái thật áp dụng ngay khi dữ liệu về.
 *
 * Path mặc định lấy từ `usePathname()`; có thể truyền `pathname` tường minh để kiểm
 * thử mà không cần mock router.
 *
 * Cách dùng (trong layout điều hướng):
 * ```tsx
 * <MethodRouteGuard
 *   registry={scopeRegistry}
 *   enabledMethods={enabledMethods}
 *   loaded={loaded}
 *   quoteEntryPoint="/pricing"
 * >
 *   {children}
 * </MethodRouteGuard>
 * ```
 *
 * _Requirements: 2.4, 2.5_
 */

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { guardMethodRoute } from '@/lib/scope/ia-resolver';
import type { MethodId, ScopeRegistry } from '@/lib/scope/types';

/** Thông báo hiển thị trong lúc chuyển hướng khỏi route phương pháp không khả dụng. */
export const METHOD_UNAVAILABLE_MESSAGE =
  'Phương pháp in này hiện không khả dụng cho đơn vị của bạn';

/** Props của {@link MethodRouteGuard}. */
export interface MethodRouteGuardProps {
  /** Đăng_Ký_Phạm_Vi — nguồn ánh xạ route → Phương_Pháp_In. */
  registry: ScopeRegistry;
  /** Nội dung được bảo vệ; render khi route được phép. */
  children: React.ReactNode;
  /** Tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành. */
  enabledMethods: readonly MethodId[];
  /**
   * Đã nạp xong tập khả dụng chưa. Khi `false`, guard fail-open (không chặn) để
   * tránh redirect sớm trong lúc dữ liệu đang về. Mặc định `true`.
   */
  loaded?: boolean;
  /** Path tường minh (chủ yếu cho kiểm thử). Mặc định lấy từ `usePathname()`. */
  pathname?: string;
  /** Route đích khi chặn truy cập (Cổng_Tạo_Báo_Giá). */
  quoteEntryPoint?: string;
  /** Nội dung thay thế khi đang chặn/redirect. Mặc định: thông báo chuẩn. */
  fallback?: React.ReactNode;
}

/** Khối thông báo mặc định trong lúc chuyển hướng. */
function MethodUnavailableNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="method-route-notice"
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
        {METHOD_UNAVAILABLE_MESSAGE}
      </p>
      <p style={{ fontSize: '0.875rem', margin: 0 }}>
        Đang chuyển bạn về cổng tạo báo giá…
      </p>
    </div>
  );
}

/**
 * Bọc nội dung và chặn route của Phương_Pháp_In không khả dụng.
 *
 * Hành vi:
 * - Đã nạp xong & route gắn phương pháp ngoài tập khả dụng ⇒ `router.replace` về
 *   `quoteEntryPoint` và render `fallback` (mặc định: thông báo) trong lúc chuyển.
 * - Ngược lại (route dùng chung, phương pháp khả dụng, hoặc chưa nạp xong) ⇒ render
 *   `children`.
 *
 * _Requirements: 2.4, 2.5_
 */
export function MethodRouteGuard({
  registry,
  children,
  enabledMethods,
  loaded = true,
  pathname,
  quoteEntryPoint,
  fallback,
}: MethodRouteGuardProps): React.ReactElement {
  const router = useRouter();
  const currentPath = usePathname();
  const resolvedPath = pathname ?? currentPath ?? '';

  // Quyết định thuần (đã có property test ở Task 4.5). Bọc try/catch để không bao
  // giờ làm crash cây React khi registry bất thường (fail-open).
  let decision = { allowed: true, redirectTo: null as string | null };
  try {
    decision = guardMethodRoute(
      registry,
      resolvedPath,
      enabledMethods ?? [],
      quoteEntryPoint ? { quoteEntryPoint } : {},
    );
  } catch {
    decision = { allowed: true, redirectTo: null };
  }

  // Chỉ chặn khi đã nạp xong tập khả dụng (fail-open trong lúc tải).
  const blocked = loaded && !decision.allowed && !!decision.redirectTo;

  useEffect(() => {
    if (blocked && decision.redirectTo) {
      router.replace(decision.redirectTo);
    }
  }, [blocked, decision.redirectTo, router]);

  if (blocked) {
    return <>{fallback ?? <MethodUnavailableNotice />}</>;
  }

  return <>{children}</>;
}

export default MethodRouteGuard;
