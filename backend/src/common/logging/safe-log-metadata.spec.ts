import { safeErrorMetadata, sensitiveTextMetadata } from './safe-log-metadata';

describe('safe log metadata', () => {
    const canary = 'Lan 0901234567 lan@example.test sk-live-SECRET prompt-rieng-tu';

    it('không đưa error.message chứa PII/secret vào log metadata', () => {
        const error = Object.assign(new Error(`Gemini agent API 429: ${canary}`), {
            code: 'ETIMEDOUT',
        });

        const metadata = safeErrorMetadata(error);

        expect(metadata).toBe('type=Error status=429 code=ETIMEDOUT');
        expect(metadata).not.toContain(canary);
        expect(metadata).not.toContain('0901234567');
        expect(metadata).not.toContain('sk-live-SECRET');
    });

    it('chỉ trả độ dài của text nhạy cảm', () => {
        const metadata = sensitiveTextMetadata('query', canary);

        expect(metadata).toBe(`queryChars=${canary.length}`);
        expect(metadata).not.toContain(canary);
    });
});
