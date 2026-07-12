/**
 * Property-based test cho isOn — chuẩn hoá Bật/Tắt của Cờ_Phạm_Vi.
 *
 * Feature: resource-scope-config, Property 1: Chuẩn hoá Bật/Tắt của Cờ_Phạm_Vi
 *
 * Property 1 (Design — Correctness Properties):
 *   For any giá trị cờ, `isOn(value)` trả về true KHI VÀ CHỈ KHI value === 1 hoặc
 *   value === true; mọi giá trị còn lại (0, false, null, undefined, số ngoài {0,1},
 *   kiểu khác) trả về false.
 *
 * Validates: Requirements 2.1, 6.2
 *
 * Chạy >= 200 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { isOn } from './resource-scope-rule';

const NUM_RUNS = 300;

describe('isOn — chuẩn hoá Bật/Tắt của Cờ_Phạm_Vi (property)', () => {
    // Feature: resource-scope-config, Property 1: Chuẩn hoá Bật/Tắt của Cờ_Phạm_Vi

    it('Property 1: isOn(v) === true ⇔ v === 1 hoặc v === true; còn lại false — phủ tập giá trị Bật/Tắt hợp lệ (Req 2.1, 6.2)', () => {
        // Tập giá trị mà chữ ký hàm hỗ trợ: number | boolean | null | undefined.
        const flagArb = fc.constantFrom<number | boolean | null | undefined>(
            1,
            0,
            true,
            false,
            null,
            undefined,
        );

        fc.assert(
            fc.property(flagArb, (value) => {
                const expected = value === 1 || value === true;
                expect(isOn(value)).toBe(expected);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 1: số ngoài {0,1} (âm, lớn, thập phân, NaN) luôn Tắt (Req 2.1, 6.2)', () => {
        const outOfRangeNumberArb = fc
            .oneof(
                fc.integer(),
                fc.double({ noNaN: false }),
                fc.constantFrom(NaN, Infinity, -Infinity, 2, -1, 0.5, 1.0000001),
            )
            // Loại đúng giá trị Bật hợp lệ (1) để chỉ còn các số phải cho ra Tắt.
            .filter((n) => n !== 1);

        fc.assert(
            fc.property(outOfRangeNumberArb, (value) => {
                expect(isOn(value)).toBe(false);
            }),
            { numRuns: NUM_RUNS },
        );
    });

    it('Property 1: giá trị kiểu khác (chuỗi, object, array, "1", "true") luôn Tắt (Req 2.1, 6.2)', () => {
        // Ép kiểu khi gọi để mô phỏng dữ liệu DB/đầu vào không sạch — KCK của == lỏng.
        const otherTypeArb = fc.oneof(
            fc.string(),
            fc.constantFrom('1', 'true', 'on', 'yes', ''),
            fc.object(),
            fc.array(fc.anything()),
            fc.constantFrom({}, [], [1]),
        );

        fc.assert(
            fc.property(otherTypeArb, (value) => {
                expect(isOn(value as unknown as number | boolean)).toBe(false);
            }),
            { numRuns: NUM_RUNS },
        );
    });
});
