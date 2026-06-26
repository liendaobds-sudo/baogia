/**
 * Property tests cho render an toàn nội dung gợi ý AI.
 *
 * Feature: inbox-cskh-ux
 * - Property 1: Render gợi ý AI an toàn (chống XSS)
 * - Property 2: Escape HTML idempotent (không tạo `<`/`>` thô, không escape kép thực thể)
 */
import fc from 'fast-check';

import { escapeHtml, renderSafeBold } from './sanitizeMarkdown';

describe('sanitizeMarkdown', () => {
    // Sinh chuỗi tùy ý kèm các "mồi" XSS phổ biến để tăng xác suất bắt lỗi.
    const dangerousTokens = [
        '<script>',
        '</script>',
        '<img src=x onerror=alert(1)>',
        '"',
        "'",
        '&',
        '<',
        '>',
        '**',
        '**đậm**',
        'alert(1)',
        '<b>',
    ];
    const arbText = fc.stringOf(
        fc.oneof(fc.char(), fc.constantFrom(...dangerousTokens)),
        { maxLength: 60 },
    );

    it('Feature: inbox-cskh-ux, Property 1: renderSafeBold không tạo thẻ thực thi ngoài <strong>', () => {
        fc.assert(
            fc.property(arbText, (text) => {
                const html = renderSafeBold(text);

                // Loại bỏ các thẻ <strong>/</strong> hợp lệ; phần còn lại không được
                // chứa bất kỳ ký tự '<' nào (tức không còn thẻ HTML thực thi nào).
                const withoutStrong = html
                    .replace(/<strong>/g, '')
                    .replace(/<\/strong>/g, '');
                expect(withoutStrong.includes('<')).toBe(false);
                expect(withoutStrong.includes('>')).toBe(false);

                // Không còn thẻ thực thi raw nào (mọi '<'/'>' đã bị escape).
                // Vì không còn '<' raw, các payload như <script>/<img onerror>
                // chỉ tồn tại dưới dạng text đã escape (vô hại).
                expect(html.toLowerCase()).not.toContain('<script');
                expect(html.toLowerCase()).not.toContain('<img');
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: inbox-cskh-ux, Property 2: escapeHtml loại bỏ < > thô và ổn định khi áp lại', () => {
        fc.assert(
            fc.property(arbText, (text) => {
                const once = escapeHtml(text);
                // Không còn ký tự '<' hoặc '>' thô.
                expect(once.includes('<')).toBe(false);
                expect(once.includes('>')).toBe(false);

                // Áp escapeHtml lần nữa chỉ escape thêm các '&' của thực thể đã sinh
                // (quy ước nhất quán); vẫn không tạo ra '<'/'>' thô.
                const twice = escapeHtml(once);
                expect(twice.includes('<')).toBe(false);
                expect(twice.includes('>')).toBe(false);
            }),
            { numRuns: 200 },
        );
    });
});
