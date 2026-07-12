'use client';

/**
 * useEnabledApps — nạp tập Trục_Ứng_Dụng khả dụng của TENANT hiện hành từ backend.
 *
 * Gọi `GET /me/app-scope` (KHÔNG truyền tenant); backend phân giải theo tenant của token.
 * Trả `enabledApps` (`'baogia'` luôn có; `'cskh'` theo Cờ_Phạm_Vi) để lọc menu/route theo
 * `axis` của scope-registry (Req 5.1, 5.2).
 *
 * Fail-open: khi chưa nạp xong (`loaded===false`) hoặc lỗi, caller KHÔNG ẩn menu để tránh
 * ẩn nhầm chức năng; backend vẫn fail-closed (Req 5.4).
 *
 * _Requirements: 5.1, 5.2, 5.4, 5.5_
 */

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api';

export type AppKey = 'baogia' | 'cskh';

/** Hình trả về của `GET /me/app-scope`. */
export interface AppScopeResponse {
  success: boolean;
  data: { enabledApps: AppKey[] };
}

export interface UseEnabledAppsResult {
  /** Tập Trục_Ứng_Dụng khả dụng của TENANT; rỗng khi chưa nạp xong. */
  enabledApps: AppKey[];
  loaded: boolean;
  error: boolean;
}

export function useEnabledApps(): UseEnabledAppsResult {
  const { data, isSuccess, isError } = useQuery<AppScopeResponse>({
    queryKey: ['me', 'app-scope'],
    queryFn: () => apiGet<AppScopeResponse>('/me/app-scope'),
    staleTime: 5 * 60 * 1000,
  });

  return {
    enabledApps: data?.data?.enabledApps ?? [],
    loaded: isSuccess,
    error: isError,
  };
}
