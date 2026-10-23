import { AiSuggestService, parseAgentJsonResponse } from './ai-suggest.service';
import { isNonRetryableProviderError, AiProviderService } from './ai-provider.service';

/**
 * Các fix từ audit 2026-08-29 cho đường AI. Mỗi describe khoá đúng một lỗ hổng đã đo được.
 */
describe('Anti-hallucination — số tiền viết TRẦN (không hậu tố tiền)', () => {
    let service: AiSuggestService;

    beforeEach(() => {
        service = Object.create(AiSuggestService.prototype);
        (service as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
    });

    const strip = (text: string): string => {
        const out = (service as any).validateAiResult(
            { replies: [{ text }], missing_info: [], intent: 'hỏi_giá', confidence: 0.9 },
            null,
            [],
        );
        return out.replies[0].text as string;
    };

    /**
     * Đo trên chính bảng giá KB (`kb-docs/01-bang-gia-tham-khao.md`): nếu bỏ ký tự tiền thì
     * 85/85 dòng có số LỌT qua 5 pattern cũ. Các ca dưới là mẫu thật từ file đó.
     */
    it.each([
        'Couche 300gsm cán mờ 2 mặt: ~150.000/hộp 200 cái',
        'A5 Couche 150gsm 2 mặt: ~1.500/tờ (từ 100 tờ)',
        'Namecard 200 cái: 150.000/hộp',
        'Túi giấy: 12.500/túi',
        'Sổ tay: 85.000 mỗi cuốn',
    ])('gỡ số tiền viết trần: %s', (text) => {
        const out = strip(text);
        expect(out).toContain('[giá]');
        expect(out).not.toMatch(/\d{1,3}[.,]\d{3}/);
    });

    it.each([
        'Giấy Couche 300gsm, khổ 65x86 cm',
        'Định lượng 1.200 gsm cho bìa cứng',
        'Kích thước 21x29.7 cm',
        'Diện tích 1.500 m2 kho xưởng',
    ])('KHÔNG gỡ thông số kỹ thuật: %s', (text) => {
        expect(strip(text)).toBe(text);
    });

    it('vẫn gỡ như cũ với số có hậu tố tiền', () => {
        expect(strip('Giá khoảng 150.000đ')).toContain('[giá]');
    });
});

describe('parseAgentJsonResponse — tái dùng lượt sinh text của agent', () => {
    it('parse JSON thuần có replies', () => {
        const r = parseAgentJsonResponse('{"replies":[{"text":"Dạ em kiểm tra ngay ạ"}],"intent":"chung"}');
        expect(r?.replies?.[0]?.text).toBe('Dạ em kiểm tra ngay ạ');
    });

    it('parse JSON trong code fence ```json', () => {
        const raw = '```json\n{"replies":[{"text":"Xin chào"}]}\n```';
        expect(parseAgentJsonResponse(raw)?.replies).toHaveLength(1);
    });

    it('parse JSON có lời dẫn phía trước', () => {
        const raw = 'Đây là kết quả:\n{"replies":[{"text":"ok"}]}\nCảm ơn.';
        expect(parseAgentJsonResponse(raw)?.replies).toHaveLength(1);
    });

    it.each([
        ['text thuần', 'Dạ em sẽ kiểm tra và phản hồi ạ'],
        ['JSON không có replies', '{"intent":"chung","confidence":0.5}'],
        ['replies rỗng', '{"replies":[]}'],
        ['replies không có text', '{"replies":[{"label":"x"}]}'],
        ['JSON hỏng', '{"replies":[{"text":'],
        ['rỗng', ''],
        ['null', null],
    ])('trả null khi không dùng lại được (%s)', (_label, raw) => {
        expect(parseAgentJsonResponse(raw as any)).toBeNull();
    });

    it('không nhận mảng ở gốc (hình dạng downstream cần là object)', () => {
        expect(parseAgentJsonResponse('[{"text":"x"}]')).toBeNull();
    });
});

describe('isNonRetryableProviderError — không retry lỗi cấu hình', () => {
    it.each([400, 401, 403, 404, 422])('KHÔNG retry HTTP %s (lỗi cấu hình)', (status) => {
        expect(isNonRetryableProviderError(new Error(`gemini API ${status}`))).toBe(true);
    });

    it.each([429, 408, 500, 502, 503])('VẪN retry HTTP %s (lỗi tạm thời)', (status) => {
        expect(isNonRetryableProviderError(new Error(`gemini API ${status}`))).toBe(false);
    });

    it('lỗi không có mã HTTP (timeout/abort) ⇒ vẫn retry', () => {
        expect(isNonRetryableProviderError(new Error('The operation was aborted'))).toBe(false);
        expect(isNonRetryableProviderError(new Error('invalid JSON response'))).toBe(false);
    });

    it('có deadline tổng cho chuỗi fallback (không để chạy 3–4 phút)', () => {
        expect(AiProviderService.FALLBACK_DEADLINE_MS).toBeGreaterThan(0);
        expect(AiProviderService.FALLBACK_DEADLINE_MS).toBeLessThanOrEqual(120_000);
    });
});

describe('Cache KB — key gồm nội dung truy vấn', () => {
    let service: AiSuggestService;
    beforeEach(() => {
        service = Object.create(AiSuggestService.prototype);
    });
    const key = (conv: string, product: any, text: string) =>
        (service as any).kbCacheKey(conv, product, text);

    it('cùng hội thoại nhưng câu hỏi KHÁC ⇒ key khác (không trả lại chunk câu trước)', () => {
        expect(key('c1', null, 'giá namecard bao nhiêu')).not.toBe(key('c1', null, 'thời gian giao hàng'));
    });

    it('cùng câu hỏi (chỉ khác khoảng trắng/hoa thường) ⇒ cùng key (vẫn tận dụng cache)', () => {
        expect(key('c1', null, 'Giá  Namecard')).toBe(key('c1', null, 'giá namecard'));
    });

    it('hội thoại khác ⇒ key khác (không rò chéo hội thoại/tenant)', () => {
        expect(key('c1', null, 'x')).not.toBe(key('c2', null, 'x'));
    });

    it('productMatch khác ⇒ key khác', () => {
        expect(key('c1', { code: 'NC' }, 'x')).not.toBe(key('c1', { code: 'TUI' }, 'x'));
    });
});
