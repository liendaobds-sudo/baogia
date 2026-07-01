'use client';

/**
 * useEnabledMethods — nạp tập Phương_Pháp_Khả_Dụng của TENANT hiện hành từ backend.
 *
 * Gọi `GET /quote-tool/capabilities` (KHÔNG truyền `unitId`) và trả về `enabledMethods`;
 * backend phân giải theo tenant của token (Req 9.1). Dùng cho tầng điều hướng frontend
 * lọc menu (`filterMenuByCapability`) và chặn route (`guardMethodRoute`) phản ứng theo
 * Cờ_Năng_Lực (Req 9.2, 9.3).
 *
 * Dùng React Query (đã cấu hình ở `@/lib/QueryProvider`, mount ở root layout) để
 * cache + chia sẻ kết quả giữa các thành phần điều hướng, đồng nhất với mẫu nạp dữ
 * liệu hiện hữu của hệ (vd. `useInboxLogic`).
 *
 * Ngữ nghĩa fail-open: trong khi chưa nạp xong (`loaded === false`) hoặc khi lỗi,
 * caller nên KHÔNG ẩn menu / KHÔNG chặn route để tránh nhấp nháy và redirect sớm —
 * trạng thái thật sẽ áp dụng ngay khi dữ liệu về (Req 9.4).
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4_
 */

import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/lib/api';
import type { MethodId } from './types';

/** Hình trả về của `GET /quote-tool/capabilities` (khớp QuoteController). */
export interface CapabilitiesResponse {
  unitId: string;
  enabledMethods: MethodId[];
  registeredMethods: MethodId[];
  flags: { methodId: MethodId; enabled: boolean; updatedAt: string }[];
}

/** Kết quả của hook — tập khả dụng kèm cờ trạng thái nạp. */
export interface UseEnabledMethodsResult {
  /** Tập Phương_Pháp_Khả_Dụng của TENANT hiện hành; rỗng khi chưa nạp xong. */
  enabledMethods: MethodId[];
  /** `true` khi đã nạp thành công (chỉ khi đó mới nên áp dụng lọc/chặn). */
  loaded: boolean;
  /** `true` khi nạp lỗi (caller fail-open: không ẩn/không chặn). */
  error: boolean;
}

/**
 * Nạp `enabledMethods` của TENANT hiện hành.
 *
 * KHÔNG nhận `unitId`: backend phân giải theo tenant của token (Req 9.1).
 */
export function useEnabledMethods(): UseEnabledMethodsResult {
  const { data, isSuccess, isError } = useQuery<CapabilitiesResponse>({
    queryKey: ['quote', 'capabilities'],
    queryFn: () => apiGet<CapabilitiesResponse>('/quote-tool/capabilities'),
    staleTime: 5 * 60 * 1000,
  });

  return {
    enabledMethods: data?.enabledMethods ?? [],
    loaded: isSuccess,
    error: isError,
  };
}
