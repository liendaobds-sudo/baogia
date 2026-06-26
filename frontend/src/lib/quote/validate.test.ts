// Feature: quote-page-ux, Property 2: validateQuoteDraft hợp lệ ⇔ không trường bắt buộc trống
import fc from 'fast-check';
import { validateQuoteDraft, isQuoteDraftValid, type QuoteDraft } from './validate';

const NUM_RUNS = 100;

/**
 * Generator cho `customerName`: trộn chuỗi tùy ý với các chuỗi toàn whitespace
 * (kể cả rỗng) để phủ cả nhánh hợp lệ lẫn nhánh "trống sau khi trim".
 */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v', '\u00a0'), { maxLength: 8 })
  .map((parts) => parts.join(''));

const customerNameArb = fc.oneof(
  fc.string(),
  whitespaceOnlyArb,
);

/**
 * Generator cho `itemsCount`: số nguyên ≥ 0 là phổ biến, kèm một số âm để
 * kiểm tra ranh giới `itemsCount <= 0`.
 */
const itemsCountArb = fc.oneof(
  fc.integer({ min: 0, max: 10_000 }),
  fc.integer({ min: -50, max: 0 }),
);

const draftArb: fc.Arbitrary<QuoteDraft> = fc.record({
  customerName: customerNameArb,
  itemsCount: itemsCountArb,
});

describe('validateQuoteDraft — Property 2', () => {
  // Property 2: hợp lệ (object lỗi rỗng) ⇔ tên khách (trim) khác rỗng VÀ itemsCount > 0.
  // **Validates: Requirements 5.1, 5.3, 5.4**
  it('rỗng (valid) khi và chỉ khi customerName.trim() khác rỗng VÀ itemsCount > 0', () => {
    fc.assert(
      fc.property(draftArb, (draft) => {
        const errors = validateQuoteDraft(draft);
        const isEmpty = Object.keys(errors).length === 0;

        const nameOk = draft.customerName.trim().length > 0;
        const itemsOk = draft.itemsCount > 0;
        const expectedValid = nameOk && itemsOk;

        // iff: valid (no errors) ⇔ cả hai điều kiện bắt buộc thỏa.
        expect(isEmpty).toBe(expectedValid);
        // isQuoteDraftValid phải nhất quán với object lỗi.
        expect(isQuoteDraftValid(draft)).toBe(expectedValid);

        // Khi vi phạm, đúng khóa lỗi cho từng trường vi phạm.
        if (!nameOk) {
          expect(errors.customerName).toBeDefined();
        } else {
          expect(errors.customerName).toBeUndefined();
        }
        if (!itemsOk) {
          expect(errors.items).toBeDefined();
        } else {
          expect(errors.items).toBeUndefined();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('không mutate đầu vào (pure)', () => {
    fc.assert(
      fc.property(draftArb, (draft) => {
        const snapshot = { ...draft };
        validateQuoteDraft(draft);
        expect(draft).toEqual(snapshot);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
