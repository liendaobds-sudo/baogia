import { MIN_SECRET_LENGTH, looksLikePlaceholderSecret, requireSecret } from './secret-validation';

/**
 * Audit 2026-07-25 — chặn secret yếu/placeholder ở production.
 *
 * Bất biến cần khoá:
 *  • thiếu secret ⇒ lỗi ở MỌI môi trường (hành vi fail-fast cũ, không được nới).
 *  • production: secret ngắn hoặc giống mẫu ".env.example" ⇒ TỪ CHỐI khởi động.
 *  • dev/test: KHÔNG siết (giữ nguyên môi trường làm việc hiện tại).
 *  • thông báo lỗi KHÔNG được chứa giá trị secret.
 */
describe('requireSecret', () => {
    const strong = 'k7Qb2v9RtY4pL0sZ8xW3nM6jH1gF5dA2cE9uB4iO7yT0'; // 44 ký tự, không chứa từ mẫu

    describe('thiếu secret ⇒ lỗi ở mọi môi trường', () => {
        it.each([true, false])('isProduction=%s', (isProd) => {
            expect(() => requireSecret('JWT_SECRET', undefined, isProd)).toThrow(/JWT_SECRET must be set/);
            expect(() => requireSecret('JWT_SECRET', '', isProd)).toThrow(/JWT_SECRET must be set/);
            expect(() => requireSecret('JWT_SECRET', null, isProd)).toThrow(/JWT_SECRET must be set/);
        });
    });

    describe('production', () => {
        it('secret mạnh ⇒ trả về nguyên giá trị', () => {
            expect(requireSecret('JWT_SECRET', strong, true)).toBe(strong);
        });

        it(`ngắn hơn ${MIN_SECRET_LENGTH} ký tự ⇒ lỗi`, () => {
            expect(() => requireSecret('JWT_SECRET', 'a'.repeat(MIN_SECRET_LENGTH - 1), true))
                .toThrow(/quá ngắn cho production/);
            // Đúng ngưỡng thì hợp lệ (biên).
            expect(requireSecret('JWT_SECRET', 'a'.repeat(MIN_SECRET_LENGTH), true))
                .toBe('a'.repeat(MIN_SECRET_LENGTH));
        });

        it.each([
            'your-super-secret-jwt-key-change-this-please',
            'CHANGE_ME_to_a_real_secret_value_1234567890',
            'example-secret-do-not-use-in-production-x',
            'placeholder_value_for_local_development_1234',
        ])('giống placeholder ⇒ lỗi: %s', (value) => {
            expect(() => requireSecret('JWT_REFRESH_SECRET', value, true))
                .toThrow(/placeholder/i);
        });

        it('thông báo lỗi KHÔNG chứa giá trị secret', () => {
            const leaky = 'your-secret-value-that-must-not-be-logged-01';
            try {
                requireSecret('JWT_SECRET', leaky, true);
                fail('phải ném lỗi');
            } catch (e) {
                expect((e as Error).message).not.toContain(leaky);
            }
        });
    });

    describe('dev/test — không siết', () => {
        it('secret ngắn và giống placeholder vẫn được chấp nhận', () => {
            expect(requireSecret('JWT_SECRET', 'your-secret', false)).toBe('your-secret');
            expect(requireSecret('JWT_SECRET', 'abc', false)).toBe('abc');
        });
    });
});

describe('looksLikePlaceholderSecret', () => {
    it('nhận diện không phân biệt hoa/thường', () => {
        expect(looksLikePlaceholderSecret('YOUR_SECRET')).toBe(true);
        expect(looksLikePlaceholderSecret('Insecure-Default')).toBe(true);
    });

    it('secret ngẫu nhiên không bị nhận diện sai', () => {
        expect(looksLikePlaceholderSecret('k7Qb2v9RtY4pL0sZ8xW3nM6jH1gF5dA2')).toBe(false);
    });
});
