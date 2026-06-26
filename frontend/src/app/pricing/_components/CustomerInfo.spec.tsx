/**
 * Component test cho CustomerInfo (task 8.3).
 *
 * Kiểm:
 *  1. Render đủ field (ô tên khách hàng hiển thị).
 *  2. getPayload() trả object có đủ khóa CustomerInfoPayload.
 *  3. getDraftState() phản ánh customerName sau setCustomerData({ customer_name: 'X' }).
 *
 * useQuoteCart là zustand store dùng được không cần provider.
 * token=null để bỏ qua fetch company-info; vẫn mock global fetch như no-op an toàn.
 *
 * _Requirements: 6.3_
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';

import { CustomerInfo, type CustomerInfoHandle, type CustomerInfoPayload } from './CustomerInfo';

// Mock fetch như no-op (token=null nên effect company-info không gọi, nhưng giữ an toàn).
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: false }),
    } as unknown as Response),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllMocks();
});

/** Tất cả khóa của CustomerInfoPayload phải có mặt trong getPayload(). */
const EXPECTED_PAYLOAD_KEYS: (keyof CustomerInfoPayload)[] = [
  'customer_name',
  'customer_code',
  'customer_type',
  'customer_phone',
  'customer_address',
  'customer_unit',
  'customer_email',
  'customer_tax_code',
  'customer_contact',
  'notes',
  'vat_rate',
  'shipping_fee',
];

function renderWithRef() {
  const ref = React.createRef<CustomerInfoHandle>();
  render(
    <CustomerInfo
      ref={ref}
      token={null}
      isSidebarCollapsed={false}
      setIsSidebarCollapsed={() => {}}
    />,
  );
  return ref;
}

describe('CustomerInfo', () => {
  it('render đủ field — ô nhập tên khách hàng hiển thị', () => {
    renderWithRef();
    // Ô tên khách hàng (placeholder "VD: Anh Minh").
    expect(screen.getByPlaceholderText('VD: Anh Minh')).toBeInTheDocument();
    // Một vài field cốt lõi khác cũng có mặt.
    expect(screen.getByPlaceholderText('09xx...')).toBeInTheDocument();
    expect(screen.getByText('Phân loại')).toBeInTheDocument();
    expect(screen.getByText('Mã KH')).toBeInTheDocument();
  });

  it('getPayload() trả object có đủ khóa CustomerInfoPayload', () => {
    const ref = renderWithRef();
    const payload = ref.current!.getPayload();
    expect(payload).toBeDefined();
    for (const key of EXPECTED_PAYLOAD_KEYS) {
      expect(payload).toHaveProperty(key);
    }
    // Không thừa khóa lạ ngoài contract.
    expect(Object.keys(payload).sort()).toEqual([...EXPECTED_PAYLOAD_KEYS].sort());
  });

  it("getDraftState() phản ánh customerName sau setCustomerData({ customer_name: 'X' })", () => {
    const ref = renderWithRef();
    act(() => {
      ref.current!.setCustomerData({ customer_name: 'X' });
    });
    expect(ref.current!.getDraftState()).toEqual({ customerName: 'X' });
    // getPayload cũng phản ánh giá trị vừa nạp.
    expect(ref.current!.getPayload().customer_name).toBe('X');
  });
});
