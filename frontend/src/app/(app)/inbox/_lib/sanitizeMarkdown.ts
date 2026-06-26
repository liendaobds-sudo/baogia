/**
 * Tiện ích render an toàn nội dung gợi ý AI trong Inbox/CSKH.
 *
 * Bối cảnh: `AiSuggestPanel` trước đây render `reply.text` qua
 * `dangerouslySetInnerHTML` với một hàm chỉ chuyển `**đậm**` mà KHÔNG escape
 * HTML — tạo nguy cơ XSS vì văn bản gợi ý do AI sinh ra (có thể chứa nội dung
 * từ tin nhắn khách). Các hàm dưới đây là hàm thuần (pure), không I/O.
 *
 * _Requirements: 3.1, 3.2, 3.3_
 */

/**
 * Escape các ký tự HTML đặc biệt thành thực thể tương ứng.
 * `&` được escape ĐẦU TIÊN để tránh phá hỏng các thực thể sinh sau đó.
 * Kết quả không bao giờ chứa ký tự `<` hoặc `>` thô.
 */
export function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render an toàn cú pháp `**đậm**`:
 * 1. Escape toàn bộ HTML trước (mọi `<`, `>`, `&`, `"`, `'` → thực thể).
 * 2. Chuyển các cặp `**...**` (đã escape) thành `<strong>...</strong>`.
 *
 * Kết quả KHÔNG chứa thẻ HTML thực thi nào ngoài `<strong>`/`</strong>` được
 * sinh từ cú pháp đậm hợp lệ — an toàn để dùng với `dangerouslySetInnerHTML`.
 */
export function renderSafeBold(text: string): string {
    if (!text) return '';
    const escaped = escapeHtml(text);
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

/**
 * Bỏ cú pháp markdown đậm/nghiêng, trả về văn bản thuần.
 * Dùng cho luồng "Sửa & Gửi" (đưa text vào ô soạn thảo).
 */
export function stripMarkdown(text: string): string {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1');
}
