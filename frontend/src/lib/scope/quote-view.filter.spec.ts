/**
 * Property test cho lọc khung nhìn Báo giá/Đơn hàng (Property 14).
 *
 * Feature: product-rescope-cskh-quote, Property 14: Lọc khung nhìn vừa đúng vừa không mất dữ liệu
 * Validates: Requirements 8.4, 8.6
 *
 * Properties:
 *  - (soundness, Req 8.4) với view 'quote' hoặc 'order', MỌI bản ghi trong
 *    filterByView(records, view, getStatus) có statusGroup(status) === view.
 *  - (lossless cho 'all', Req 8.6) view 'all' trả về ĐÚNG mọi bản ghi gốc:
 *    cùng độ dài, cùng phần tử, giữ nguyên thứ tự.
 *  - (lossless toàn cục, Req 8.6) hợp của filterByView cho 'quote', 'order' và
 *    nhóm 'all'-chưa-ánh-xạ phủ kín mọi bản ghi — không bản ghi nào biến mất khi
 *    chuyển giữa các khung nhìn.
 */

import fc from 'fast-check';
import { QUOTE_STATUSES, ORDER_STATUSES, statusGroup, filterByView } from './quote-view';
import type { ViewKey } from './types';

const RUNS = 200;

/** Bản ghi tối thiểu phục vụ test: chỉ cần trường trạng thái + một id để phân biệt phần tử. */
interface TestRecord {
  id: number;
  status: string;
}

const getStatus = (r: TestRecord): string => r.status;

/**
 * Generator trạng thái: trộn các trạng thái thuộc nhóm 'quote', 'order' và các
 * trạng thái KHÔNG ánh xạ (cancelled, expired, rejected, chuỗi rỗng, giá trị lạ)
 * để bao phủ cả nhánh fallback 'all'.
 */
const UNMAPPED_STATUSES = ['cancelled', 'expired', 'rejected', '', 'weird', 'unknown_state'];

const statusArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom<string>(...QUOTE_STATUSES),
  fc.constantFrom<string>(...ORDER_STATUSES),
  fc.constantFrom<string>(...UNMAPPED_STATUSES),
  fc.string(), // chuỗi tuỳ ý — đảm bảo không gian đầu vào rộng
);

/** Generator mảng bản ghi có id duy nhất (để so khớp đẳng thức phần tử/thứ tự). */
const recordsArb: fc.Arbitrary<TestRecord[]> = fc
  .array(statusArb, { maxLength: 40 })
  .map((statuses) => statuses.map((status, id) => ({ id, status })));

describe('Feature: product-rescope-cskh-quote, Property 14: Lọc khung nhìn vừa đúng vừa không mất dữ liệu', () => {
  it('soundness: mọi bản ghi trong view quote/order đều có statusGroup === view (Req 8.4)', () => {
    fc.assert(
      fc.property(recordsArb, fc.constantFrom<ViewKey>('quote', 'order'), (records, view) => {
        const filtered = filterByView(records, view, getStatus);
        for (const record of filtered) {
          expect(statusGroup(getStatus(record))).toBe(view);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it('lossless: view "all" trả về đúng mọi bản ghi gốc, giữ nguyên thứ tự (Req 8.6)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const filtered = filterByView(records, 'all', getStatus);
        expect(filtered).toHaveLength(records.length);
        expect(filtered).toEqual(records);
      }),
      { numRuns: RUNS },
    );
  });

  it('lossless toàn cục: hợp của quote + order + (all-chưa-ánh-xạ) phủ kín mọi bản ghi (Req 8.6)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const quoteIds = new Set(filterByView(records, 'quote', getStatus).map((r) => r.id));
        const orderIds = new Set(filterByView(records, 'order', getStatus).map((r) => r.id));
        // Nhóm fallback 'all': các bản ghi mà statusGroup không phải quote/order.
        const unmappedIds = new Set(
          filterByView(records, 'all', getStatus)
            .filter((r) => statusGroup(getStatus(r)) === 'all')
            .map((r) => r.id),
        );

        // Mỗi bản ghi gốc phải xuất hiện trong đúng một trong ba nhóm — không biến mất.
        for (const record of records) {
          const inQuote = quoteIds.has(record.id);
          const inOrder = orderIds.has(record.id);
          const inUnmapped = unmappedIds.has(record.id);
          const coverageCount = Number(inQuote) + Number(inOrder) + Number(inUnmapped);
          expect(coverageCount).toBe(1);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
