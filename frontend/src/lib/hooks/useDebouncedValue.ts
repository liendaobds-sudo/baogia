'use client';

import { useEffect, useState } from 'react';

/**
 * Trả về một bản sao "trễ" (debounced) của `value`.
 *
 * Mỗi khi `value` (hoặc `delay`) đổi, hook đặt một timer; chỉ khi giá trị
 * ổn định đủ `delay` mili-giây thì giá trị trễ mới được cập nhật. Timer được
 * dọn dẹp khi `value`/`delay` đổi hoặc khi component unmount, nên không có
 * cập nhật thừa hay rò rỉ timer.
 *
 * Dùng cho ô tìm kiếm để chỉ gọi API sau khi người dùng ngừng gõ.
 *
 * _Requirements: 8.1, 8.2_
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
