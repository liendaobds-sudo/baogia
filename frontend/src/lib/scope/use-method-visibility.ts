'use client';

/**
 * useMethodVisibility — cờ hiển thị theo Phương_Pháp_In khả dụng của TENANT hiện hành.
 *
 * Bọc mỏng `useEnabledMethods` để các trang DÙNG CHUNG (finishings, materials…) ẩn
 * phần nội dung gắn một Phương_Pháp_In không khả dụng (vd. tab/nút "In Offset" khi
 * tenant chỉ bật digital). Menu + route đã được lọc ở tầng điều hướng
 * (`filterMenuByCapability` + `MethodRouteGuard`); helper này là lớp lọc BÊN TRONG
 * trang dùng chung — nơi trục method không tách được bằng route.
 *
 * Fail-open: khi CHƯA nạp xong (`loaded === false`), mọi cờ = true → hiển thị đầy đủ
 * để tránh nhấp nháy/ẩn nhầm; trạng thái thật áp dụng ngay khi dữ liệu về.
 */

import { useEnabledMethods } from './use-enabled-methods';

export interface MethodVisibility {
  /** Digital (In Nhanh) có khả dụng cho tenant không. */
  showDigital: boolean;
  /** Offset (In Offset) có khả dụng cho tenant không. */
  showOffset: boolean;
  /** Cả hai Phương_Pháp_In cùng khả dụng (khi đó mới cần tách tab digital/offset). */
  bothMethods: boolean;
  /** Đã nạp xong tập khả dụng chưa (để caller quyết định thời điểm áp dụng). */
  loaded: boolean;
}

export function useMethodVisibility(): MethodVisibility {
  const { enabledMethods, loaded } = useEnabledMethods();
  const showDigital = !loaded || enabledMethods.includes('digital');
  const showOffset = !loaded || enabledMethods.includes('offset');
  return { showDigital, showOffset, bothMethods: showDigital && showOffset, loaded };
}
