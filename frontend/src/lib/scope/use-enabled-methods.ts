'use client';

/**
 * useEnabledMethods — nạp tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành từ backend.
 *
 * Gọi `GET /quote/capabilities` (QuoteController — Task 3.1) và trả về `enabledMethods`
 * để tầng điều hướng frontend lọc menu (`filterMenuByCapability`) và chặn route
 * (`guardMethodRoute`) phản ứng theo Cờ_Năng_Lực (Req 2.1, 2.2, 2.6).
 *
 * Dùng React Query (đã cấu hình ở `@/lib/QueryProvider`, mount ở root layout) để
 * cache + chia sẻ kết quả giữa các thành phần điều hướng, đồng nhất với mẫu nạp dữ
 * liệu hiện hữu của hệ (vd. `useInboxLogic`).
 *
 * Ngữ nghĩa fail-open: trong khi chưa nạp xong (`loaded === false`) hoặc khi lỗi,
 * caller nên KHÔNG ẩn menu / KHÔNG chặn route để tránh nhấp nháy và redirect sớm —
 * trạng thái thật sẽ áp dụng ngay khi dữ liệu về.
 *
 * _Requirements: 2.1, 2.2, 2.6_
 */

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api';
import type { MethodId } from './types';

/** Hình trả về của `GET /quote/capabilities` (khớp QuoteController). */
export interface CapabilitiesResponse {
  unitId: string;
  enabledMethods: MethodId[];
  registeredMethods: MethodId[];
  flags: { methodId: MethodId; enabled: boolean; updatedAt: string }[];
}

/** Kết quả của hook — tập khả dụng kèm cờ trạng thái nạp. */
export interface UseEnabledMethodsResult {
  /** Tập Phương_Pháp_Khả_Dụng của Đơn_Vị; rỗng khi chưa nạp xong. */
  enabledMethods: MethodId[];
  /** `true` khi đã nạp thành công (chỉ khi đó mới nên áp dụng lọc/chặn). */
  loaded: boolean;
  /** `true` khi nạp lỗi (caller fail-open: không ẩn/không chặn). */
  error: boolean;
}

/**
 * Nạp `enabledMethods` của Đơn_Vị.
 *
 * @param unitId Đơn_Vị cần tra; bỏ trống ⇒ dùng Đơn_Vị mặc định của backend.
 */
export function useEnabledMethods(unitId?: string): UseEnabledMethodsResult {
  const resolvedUnit = unitId?.trim() || 'default';

  const { data, isSuccess, isError } = useQuery<CapabilitiesResponse>({
    queryKey: ['quote', 'capabilities', resolvedUnit],
    queryFn: () => {
      const query = unitId?.trim()
        ? `?unitId=${encodeURIComponent(unitId.trim())}`
        : '';
      return apiGet<CapabilitiesResponse>(`/quote-tool/capabilities${query}`);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    enabledMethods: data?.enabledMethods ?? [],
    loaded: isSuccess,
    error: isError,
  };
}
