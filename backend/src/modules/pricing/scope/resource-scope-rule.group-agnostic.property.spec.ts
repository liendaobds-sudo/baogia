/**
 * Property-based test cho tính group-agnostic của Quy_Tắc_Phạm_Vi (canonical backend).
 *
 * Feature: resource-scope-config, Property 7: Quy_Tắc_Phạm_Vi bất biến theo kiểu cờ (smallint vs boolean)
 *
 * Property 7 (Design — Correctness Properties):
 *   For any tập cờ logic ngẫu nhiên (4 giá trị Bật/Tắt), khi biểu diễn dưới dạng smallint
 *   (0/1, như `processing_options`) và dưới dạng boolean (false/true, như `materials`/`paper_sizes`),
 *   `classifyResource` cho ra kết quả phân loại trùng khớp hoàn toàn. Tính bất biến này là điểm
 *   mấu chốt giúp một Quy_Tắc_Phạm_Vi duy nhất dùng chung cho cả ba nhóm tài nguyên dù khác kiểu cờ.
 *
 * Validates: Requirements 1.6
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import {
    classifyResource,
    isOffsetOnly,
    ScopeFlags,
} from './resource-scope-rule';

const NUM_RUNS = 200;

/** Vector logic Bật/Tắt cho 4 phạm vi (offset + ba loại in nhanh). */
interface LogicalVector {
    offset: boolean;
    loose: boolean;
    bound: boolean;
    large_format: boolean;
}

/** Sinh vector logic ngẫu nhiên: mỗi phạm vi Bật/Tắt độc lập. */
const logicalVectorArb: fc.Arbitrary<LogicalVector> = fc.record({
    offset: fc.boolean(),
    loose: fc.boolean(),
    bound: fc.boolean(),
    large_format: fc.boolean(),
});

/** Biểu diễn smallint 0/1 (như `processing_options`). */
function asSmallint(v: LogicalVector): ScopeFlags {
    return {
        // scope_offset luôn diễn giải boolean (Req 6.2) — giữ nguyên boolean cho cả hai biểu diễn.
        scope_offset: v.offset,
        scope_loose: v.loose ? 1 : 0,
        scope_bound: v.bound ? 1 : 0,
        scope_large_format: v.large_format ? 1 : 0,
    };
}

/** Biểu diễn boolean false/true (như `materials`/`paper_sizes`). */
function asBoolean(v: LogicalVector): ScopeFlags {
    return {
        scope_offset: v.offset,
        scope_loose: v.loose,
        scope_bound: v.bound,
        scope_large_format: v.large_format,
    };
}

describe('Quy_Tắc_Phạm_Vi group-agnostic — smallint vs boolean (property)', () => {
    // Feature: resource-scope-config, Property 7: Quy_Tắc_Phạm_Vi bất biến theo kiểu cờ (smallint vs boolean)
    it('Property 7: classifyResource trùng khớp giữa biểu diễn smallint(0/1) và boolean(false/true) (Req 1.6)', () => {
        fc.assert(
            fc.property(logicalVectorArb, (vector) => {
                const smallintFlags = asSmallint(vector);
                const booleanFlags = asBoolean(vector);

                // Phân loại phải trùng khớp hoàn toàn (cùng phần tử, cùng thứ tự).
                expect(classifyResource(smallintFlags)).toEqual(
                    classifyResource(booleanFlags),
                );
            }),
            { numRuns: NUM_RUNS },
        );
    });

    // Feature: resource-scope-config, Property 7: Quy_Tắc_Phạm_Vi bất biến theo kiểu cờ (smallint vs boolean)
    it('Property 7: isOffsetOnly trùng khớp giữa biểu diễn smallint(0/1) và boolean(false/true) (Req 1.6)', () => {
        fc.assert(
            fc.property(logicalVectorArb, (vector) => {
                const smallintFlags = asSmallint(vector);
                const booleanFlags = asBoolean(vector);

                expect(isOffsetOnly(smallintFlags)).toBe(
                    isOffsetOnly(booleanFlags),
                );
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
