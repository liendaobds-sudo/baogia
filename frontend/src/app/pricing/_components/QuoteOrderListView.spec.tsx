/**
 * Component tests cho `QuoteOrderListView` (task 5.9, quote-page-ux).
 *
 * Phủ một tập trọng tâm (giữ robust, tránh phụ thuộc quá sâu vào markup):
 *  - Phân trang: footer hiện tổng số bản ghi; nút "Trang sau" enabled khi `has_next`,
 *    "Trang trước" disabled khi `!has_prev`; bấm "Trang sau" → phát sinh fetch với `page=2`.
 *  - Ẩn/hiện lối "Tạo mới" theo `hasPermission('quote.create')` (Req 3.4).
 *  - Accessible name: ô tìm kiếm có `aria-label`; nút phân trang có `aria-label`.
 *  - Badge trạng thái render text (ví dụ 'Nháp').
 *
 * _Requirements: 1.1, 2.1, 2.3, 2.4, 3.4, 9.1, 9.2, 9.3_
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

import { ToastProvider } from '@/lib/ui/toast';

// --- Mock auth-context: token cố định + quyền điều khiển được qua biến `mock*`. ---
// (Tên biến có tiền tố `mock` để được phép tham chiếu trong factory của jest.mock.)
let mockHasPermission: (cap: string) => boolean = () => true;

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ token: 't' }),
  usePermissions: () => ({
    permissions: [] as string[],
    hasPermission: (cap: string) => mockHasPermission(cap),
  }),
}));

import QuoteOrderListView from './QuoteOrderListView';

/** Payload phân trang chuẩn: total 60 > limit 30 ⇒ có 2 trang, còn trang sau. */
const PAGINATED_PAYLOAD = {
  success: true,
  data: {
    data: [
      {
        id: 1,
        code: 'BG-0001',
        customer_name: 'Nguyễn Văn A',
        customer_phone: '0900000000',
        grand_total: 1500000,
        status: 'draft',
        created_at: '2024-01-15T00:00:00.000Z',
        type: 'In KTS',
      },
      {
        id: 2,
        code: 'BG-0002',
        customer_name: 'Trần Thị B',
        customer_phone: '0911111111',
        grand_total: 2500000,
        status: 'sent',
        created_at: '2024-01-16T00:00:00.000Z',
        type: 'In Offset',
      },
    ],
    pagination: { total: 60, total_pages: 2, has_prev: false, has_next: true },
  },
};

/** Thu thập mọi URL fetch để khẳng định phân trang gọi `page=2`. */
let fetchUrls: string[] = [];

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(() => {
  fetchUrls = [];
  mockHasPermission = () => true;
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    fetchUrls.push(url);
    if (url.includes('/erp/company-info')) {
      return Promise.resolve(jsonResponse({ success: true, data: null }));
    }
    // GET /erp/orders?... (danh sách)
    return Promise.resolve(jsonResponse(PAGINATED_PAYLOAD));
  }) as unknown as typeof fetch;
});

afterEach(() => {
  jest.clearAllMocks();
});

function renderView(view: 'quote' | 'order' | 'all' = 'all') {
  return render(
    <ToastProvider>
      <QuoteOrderListView defaultView={view} />
    </ToastProvider>,
  );
}

describe('QuoteOrderListView — phân trang', () => {
  it('hiện tổng số bản ghi và trạng thái nút Trước/Sau theo pagination', async () => {
    renderView('all');

    // Footer hiển thị tổng số bản ghi (range / total).
    expect(await screen.findByText(/60 bản ghi/)).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: 'Trang trước' });
    const nextBtn = screen.getByRole('button', { name: 'Trang sau' });

    // has_prev=false ⇒ Prev disabled; has_next=true ⇒ Next enabled.
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();
  });

  it('bấm "Trang sau" phát sinh fetch với page=2 trong URL', async () => {
    renderView('all');

    const nextBtn = await screen.findByRole('button', { name: 'Trang sau' });
    // Chờ lần nạp đầu (page=1) hoàn tất.
    await waitFor(() => expect(fetchUrls.some((u) => /\/erp\/orders\?.*page=1/.test(u))).toBe(true));

    fireEvent.click(nextBtn);

    // Sau khi đổi trang, fetchQuotes được gọi lại với page=2.
    await waitFor(() =>
      expect(fetchUrls.some((u) => /\/erp\/orders\?.*page=2/.test(u))).toBe(true),
    );
  });
});

describe('QuoteOrderListView — ẩn lối tạo theo quyền (Req 3.4)', () => {
  it('ẩn "Tạo mới" khi hasPermission("quote.create") = false', async () => {
    mockHasPermission = (cap) => cap !== 'quote.create';
    renderView('all');

    // Chờ danh sách nạp xong để chắc chắn component đã render đầy đủ.
    await screen.findByText(/60 bản ghi/);
    expect(screen.queryByRole('link', { name: /Tạo mới/ })).not.toBeInTheDocument();
  });

  it('hiện "Tạo mới" khi hasPermission("quote.create") = true', async () => {
    mockHasPermission = () => true;
    renderView('all');

    expect(await screen.findByRole('link', { name: /Tạo mới/ })).toBeInTheDocument();
  });
});

describe('QuoteOrderListView — accessibility & badge', () => {
  it('ô tìm kiếm có aria-label', async () => {
    renderView('all');
    expect(
      await screen.findByLabelText(
        'Tìm kiếm báo giá theo mã, tên khách hoặc số điện thoại',
      ),
    ).toBeInTheDocument();
  });

  it('badge trạng thái render text (ví dụ "Nháp")', async () => {
    renderView('all');
    // Quote id=1 có status 'draft' ⇒ badge text 'Nháp'.
    expect(await screen.findByText('Nháp')).toBeInTheDocument();
  });
});

describe('QuoteOrderListView — không còn bộ tab khung nhìn nội bộ (đã tách menu top-level)', () => {
  it('KHÔNG render nút tab Báo giá / Đơn hàng / Tất cả — việc tách do menu top-level lo', async () => {
    renderView('quote');
    await screen.findByText(/60 bản ghi/);
    expect(screen.queryByRole('button', { name: 'Báo giá' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đơn hàng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tất cả' })).not.toBeInTheDocument();
  });

  it('vẫn còn dropdown lọc trạng thái (truy cập đơn từ chối/huỷ/hết hạn)', async () => {
    renderView('order');
    await screen.findByText(/60 bản ghi/);
    expect(screen.getByLabelText('Lọc theo trạng thái')).toBeInTheDocument();
  });
});
