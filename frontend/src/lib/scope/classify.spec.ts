/**
 * Property test cho classifier soundness (Property 2).
 *
 * Feature: product-rescope-cskh-quote, Property 2: Classification rule soundness
 * Validates: Requirements 2.2, 2.3
 *
 * Property: với mọi bề mặt lấy từ CSKH_CORE_SURFACES hoặc BAOGIA_CORE_SURFACES,
 * classify(surface).scope === 'core' với rule '2.2' và trục đúng; với bề mặt từ
 * ERP_ADVANCED_SURFACES, scope === 'frozen' rule '2.3'; với SAAS_SURFACES,
 * scope === 'frozen' rule '2.4'; với chuỗi tuỳ ý không thuộc tập nào, classify trả null.
 */

import fc from 'fast-check';
import {
  BAOGIA_CORE_SURFACES,
  CSKH_CORE_SURFACES,
  ERP_ADVANCED_SURFACES,
  SAAS_SURFACES,
  classify,
} from './classify';

const RUNS = 200;

/** Tập mọi bề mặt classifier nhận diện được — để loại khỏi generator chuỗi tuỳ ý. */
const KNOWN_SURFACES = new Set<string>([
  ...CSKH_CORE_SURFACES,
  ...BAOGIA_CORE_SURFACES,
  ...ERP_ADVANCED_SURFACES,
  ...SAAS_SURFACES,
]);

describe('Feature: product-rescope-cskh-quote, Property 2: Classification rule soundness', () => {
  it('gán scope=core, rule=2.2, axis=cskh cho mọi bề mặt Lõi CSKH (Req 2.2)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...CSKH_CORE_SURFACES), (surface) => {
        const result = classify(surface);
        expect(result).not.toBeNull();
        expect(result).toEqual({ scope: 'core', rule: '2.2', axis: 'cskh' });
      }),
      { numRuns: RUNS },
    );
  });

  it('gán scope=core, rule=2.2, axis=baogia cho mọi bề mặt Lõi Báo giá (Req 2.2)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BAOGIA_CORE_SURFACES), (surface) => {
        const result = classify(surface);
        expect(result).not.toBeNull();
        expect(result).toEqual({ scope: 'core', rule: '2.2', axis: 'baogia' });
      }),
      { numRuns: RUNS },
    );
  });

  it('gán scope=frozen, rule=2.3 cho mọi bề mặt ERP nâng cao (Req 2.3)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ERP_ADVANCED_SURFACES), (surface) => {
        const result = classify(surface);
        expect(result).not.toBeNull();
        expect(result).toEqual({ scope: 'frozen', rule: '2.3', axis: 'none' });
      }),
      { numRuns: RUNS },
    );
  });

  it('gán scope=frozen, rule=2.4 cho mọi bề mặt SaaS (Req 2.3)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...SAAS_SURFACES), (surface) => {
        const result = classify(surface);
        expect(result).not.toBeNull();
        expect(result).toEqual({ scope: 'frozen', rule: '2.4', axis: 'none' });
      }),
      { numRuns: RUNS },
    );
  });

  it('trả null cho mọi chuỗi tuỳ ý không thuộc bất kỳ tập bề mặt đã biết nào', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !KNOWN_SURFACES.has(s)),
        (surface) => {
          expect(classify(surface)).toBeNull();
        },
      ),
      { numRuns: RUNS },
    );
  });
});
