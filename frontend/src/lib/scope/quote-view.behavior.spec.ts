/**
 * Unit test cho HÀNH VI khung nhìn "Danh sách BG" (Task 9.5).
 *
 * Validates: Requirements 8.1, 8.2
 *
 * Bối cảnh: việc chuyển khung nhìn (Báo giá | Đơn hàng | Tất cả) trên
 * `frontend/src/app/pricing/quotes/page.tsx` được hiện thực hoàn toàn bằng
 * `filterByView`/`statusGroup` (trong `quote-view.ts`) trên dữ liệu ĐÃ TẢI sẵn từ
 * `GET /erp/orders`. Đây là bài kiểm thử đơn vị xác nhận hợp đồng hành vi đứng sau
 * trang đó — kiểm chứng tất định trên một tập dữ liệu cố định, không phải property test.
 *
 * Hai bảo đảm chính của Req 8.1/8.2:
 *  - (Req 8.2) Chuyển khung nhìn chỉ là biến đổi thuần phía client trên cùng mảng đã
 *    tải; `filterByView` KHÔNG thực hiện lời gọi mạng nào (không chạm `globalThis.fetch`).
 *  - (Req 8.1) Khung "Tất cả" giữ MỌI bản ghi đã tải, kể cả trạng thái không ánh xạ;
 *    khung "Báo giá"/"Đơn hàng" là tập con mà hợp với phần dư chưa-ánh-xạ bằng đúng
 *    toàn bộ tập gốc (không bản ghi nào biến mất khi chuyển view).
 */

import { filterByView, statusGroup } from './quote-view';
import type { ViewKey } from './types';

/** Bản ghi tối thiểu mô phỏng QuoteItem: chỉ cần id (phân biệt) + status (phân nhóm). */
interface TestRecord {
  id: number;
  status: string;
}

const getStatus = (r: TestRecord): string => r.status;

/**
 * Tập dữ liệu cố định, đại diện: mỗi trạng thái vòng đời xuất hiện đúng một lần.
 * - quote-group: draft, sent (+ pending_approval, approved để đủ đầu vòng đời)
 * - order-group: accepted, completed
 * - chưa ánh xạ → 'all': cancelled, expired
 */
const DATASET: TestRecord[] = [
  { id: 1, status: 'draft' },
  { id: 2, status: 'pending_approval' },
  { id: 3, status: 'approved' },
  { id: 4, status: 'sent' },
  { id: 5, status: 'accepted' },
  { id: 6, status: 'completed' },
  { id: 7, status: 'cancelled' },
  { id: 8, status: 'expired' },
];

describe('Quote view behavior (Task 9.5) — Requirements 8.1, 8.2', () => {
  describe('Req 8.2 — chuyển khung nhìn là biến đổi thuần phía client, không gọi endpoint mới', () => {
    const globalWithFetch = globalThis as unknown as { fetch?: typeof fetch };
    let originalFetch: typeof fetch | undefined;
    let fetchMock: jest.Mock;

    beforeEach(() => {
      // Đặt một fetch giả lên global rồi theo dõi: nếu filterByView gọi mạng, mock sẽ ghi nhận.
      // (jsdom không định nghĩa sẵn fetch, nên gán trực tiếp thay vì spyOn.)
      originalFetch = globalWithFetch.fetch;
      fetchMock = jest.fn(() => {
        throw new Error('Khung nhìn KHÔNG được phép gọi fetch');
      });
      globalWithFetch.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
      globalWithFetch.fetch = originalFetch;
    });

    it('chuyển quote -> order -> all không kích hoạt bất kỳ lời gọi fetch nào', () => {
      const sequence: ViewKey[] = ['quote', 'order', 'all'];
      for (const view of sequence) {
        // Mỗi lần chuyển view chỉ lọc lại trên CÙNG mảng đã tải.
        const result = filterByView(DATASET, view, getStatus);
        expect(Array.isArray(result)).toBe(true);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('statusGroup phân loại trạng thái mà không gọi fetch', () => {
      DATASET.forEach((r) => statusGroup(getStatus(r)));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('chuyển view không đột biến (mutate) mảng dữ liệu gốc đã tải', () => {
      const snapshot = DATASET.map((r) => ({ ...r }));
      filterByView(DATASET, 'quote', getStatus);
      filterByView(DATASET, 'order', getStatus);
      filterByView(DATASET, 'all', getStatus);
      // Mảng gốc và phần tử của nó giữ nguyên — chỉ trả về mảng mới.
      expect(DATASET).toEqual(snapshot);
    });

    it('mọi view thao tác trên cùng nguồn dữ liệu (không tự nạp thêm bản ghi)', () => {
      const all = filterByView(DATASET, 'all', getStatus);
      const quote = filterByView(DATASET, 'quote', getStatus);
      const order = filterByView(DATASET, 'order', getStatus);
      // Không view nào tạo ra bản ghi ngoài tập đã tải.
      const ids = new Set(DATASET.map((r) => r.id));
      [...all, ...quote, ...order].forEach((r) => expect(ids.has(r.id)).toBe(true));
    });
  });

  describe('Req 8.1 — view "Tất cả" giữ mọi bản ghi; quote/order là tập con không mất dữ liệu', () => {
    it('view "all" trả về đúng toàn bộ bản ghi đã tải, giữ nguyên thứ tự (gồm trạng thái chưa ánh xạ)', () => {
      const all = filterByView(DATASET, 'all', getStatus);
      expect(all).toHaveLength(DATASET.length);
      expect(all).toEqual(DATASET);
      // Bản ghi trạng thái không ánh xạ (cancelled, expired) vẫn hiện diện.
      expect(all.some((r) => r.status === 'cancelled')).toBe(true);
      expect(all.some((r) => r.status === 'expired')).toBe(true);
    });

    it('view "quote" chỉ chứa các trạng thái đầu vòng đời', () => {
      const quote = filterByView(DATASET, 'quote', getStatus);
      expect(quote.map((r) => r.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
      quote.forEach((r) => expect(statusGroup(r.status)).toBe('quote'));
    });

    it('view "order" chỉ chứa các trạng thái đã chốt', () => {
      const order = filterByView(DATASET, 'order', getStatus);
      expect(order.map((r) => r.id).sort((a, b) => a - b)).toEqual([5, 6]);
      order.forEach((r) => expect(statusGroup(r.status)).toBe('order'));
    });

    it('hợp của quote + order + (phần dư chưa ánh xạ) bằng đúng toàn bộ tập gốc', () => {
      const quoteIds = filterByView(DATASET, 'quote', getStatus).map((r) => r.id);
      const orderIds = filterByView(DATASET, 'order', getStatus).map((r) => r.id);
      const unmappedIds = filterByView(DATASET, 'all', getStatus)
        .filter((r) => statusGroup(r.status) === 'all')
        .map((r) => r.id);

      const unionIds = new Set([...quoteIds, ...orderIds, ...unmappedIds]);
      // Phủ kín: mọi id gốc đều xuất hiện.
      expect(unionIds.size).toBe(DATASET.length);
      DATASET.forEach((r) => expect(unionIds.has(r.id)).toBe(true));

      // Rời nhau: quote và order không giao nhau (mỗi bản ghi thuộc tối đa một nhóm mặc định).
      const intersection = quoteIds.filter((id) => orderIds.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('không bản ghi nào biến mất khi lần lượt chuyển qua mọi khung nhìn', () => {
      const seenAcrossDefaultViews = new Set<number>([
        ...filterByView(DATASET, 'quote', getStatus).map((r) => r.id),
        ...filterByView(DATASET, 'order', getStatus).map((r) => r.id),
      ]);
      // Bản ghi chưa ánh xạ không nằm trong quote/order nhưng luôn xuất hiện ở "all".
      const unmapped = DATASET.filter((r) => !seenAcrossDefaultViews.has(r.id));
      const allIds = new Set(filterByView(DATASET, 'all', getStatus).map((r) => r.id));
      unmapped.forEach((r) => expect(allIds.has(r.id)).toBe(true));
    });
  });
});
