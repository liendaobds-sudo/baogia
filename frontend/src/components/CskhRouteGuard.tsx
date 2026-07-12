'use client';

/**
 * CskhRouteGuard — route guard theo Trục_Ứng_Dụng CSKH (tenant-app-scope).
 *
 * Song song với `MethodRouteGuard` (guard theo Phương_Pháp_In). Khi tenant đã TẮT
 * Trục CSKH mà người dùng điều hướng trực tiếp (gõ URL) tới một route thuộc Trục CSKH
 * (Inbox, AI & Kiến thức, Test Chat…), guard chặn hiển thị và chuyển hướng về Trang
 * Báo_Giá (`/pricing` — Trục lõi luôn bật). Route Báo_Giá/shared luôn được phép.
 *
 * Menu đã ẩn các mục CSKH khi tắt (fail-open UI ở sidebar), nhưng ẩn menu KHÔNG chặn
 * gõ URL trực tiếp — guard này là lớp redirect để nhất quán với trục Phương_Pháp_In.
 * Backend (`CskhScopeGuard`) vẫn là lớp chặn quyền uy tín (fail-closed); guard FE chỉ
 * để UX không kẹt ở trang trống.
 *
 * Ngữ nghĩa fail-open: khi tập Trục_Ứng_Dụng CHƯA nạp xong (`loaded === false`), guard
 * cho hiển thị bình thường để tránh redirect sớm/nhấp nháy.
 */

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { guardCskhRoute } from '@/lib/scope/ia-resolver';
import type { ScopeRegistry } from '@/lib/scope/types';

/** Thông báo hiển thị trong lúc chuyển hướng khỏi route CSKH không khả dụng. */
export const CSKH_UNAVAILABLE_MESSAGE =
  'Tính năng CSKH hiện không khả dụng cho đơn vị của bạn';

export interface CskhRouteGuardProps {
  /** Đăng_Ký_Phạm_Vi — nguồn ánh xạ route → Trục_Ứng_Dụng. */
  registry: ScopeRegistry;
  /** Nội dung được bảo vệ; render khi route được phép. */
  children: React.ReactNode;
  /** Trục CSKH có đang bật cho tenant hiện hành không. */
  cskhEnabled: boolean;
  /**
   * Đã nạp xong tập Trục_Ứng_Dụng chưa. Khi `false`, guard fail-open (không chặn).
   * Mặc định `true`.
   */
  loaded?: boolean;
  /** Path tường minh (chủ yếu cho kiểm thử). Mặc định lấy từ `usePathname()`. */
  pathname?: string;
  /** Route đích khi chặn truy cập (Trang Báo_Giá). */
  quoteHome?: string;
  /** Nội dung thay thế khi đang chặn/redirect. Mặc định: thông báo chuẩn. */
  fallback?: React.ReactNode;
}

/** Khối thông báo mặc định trong lúc chuyển hướng. */
function CskhUnavailableNotice() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="cskh-route-notice"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        color: '#64748b',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 15 }}>{CSKH_UNAVAILABLE_MESSAGE}</div>
      <div style={{ fontSize: 13 }}>Đang chuyển về trang Báo giá…</div>
    </div>
  );
}

/**
 * Bọc nội dung và chặn route Trục CSKH khi tenant đã tắt CSKH.
 *
 * Hành vi:
 * - Đã nạp xong & route thuộc Trục CSKH & CSKH tắt ⇒ `router.replace` về `quoteHome`
 *   và render `fallback` trong lúc chuyển.
 * - Ngược lại (route Báo_Giá/shared, CSKH bật, hoặc chưa nạp xong) ⇒ render `children`.
 */
export function CskhRouteGuard({
  registry,
  children,
  cskhEnabled,
  loaded = true,
  pathname,
  quoteHome,
  fallback,
}: CskhRouteGuardProps): React.ReactElement {
  const router = useRouter();
  const currentPath = usePathname();
  const resolvedPath = pathname ?? currentPath ?? '';

  // Quyết định thuần. Bọc try/catch để không crash cây React khi registry bất thường.
  let decision = { allowed: true, redirectTo: null as string | null };
  try {
    decision = guardCskhRoute(
      registry,
      resolvedPath,
      cskhEnabled,
      quoteHome ? { quoteHome } : {},
    );
  } catch {
    decision = { allowed: true, redirectTo: null };
  }

  // Chỉ chặn khi đã nạp xong (fail-open trong lúc tải).
  const blocked = loaded && !decision.allowed && !!decision.redirectTo;

  useEffect(() => {
    if (blocked && decision.redirectTo) {
      router.replace(decision.redirectTo);
    }
  }, [blocked, decision.redirectTo, router]);

  if (blocked) {
    return <>{fallback ?? <CskhUnavailableNotice />}</>;
  }

  return <>{children}</>;
}

export default CskhRouteGuard;
