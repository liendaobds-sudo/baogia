/**
 * Logic khớp tìm kiếm hội thoại trong Conversation_List.
 *
 * Mở rộng tìm kiếm từ chỗ chỉ khớp tên hiển thị sang khớp đa trường: tên hiển
 * thị, nội dung tin nhắn cuối, số điện thoại và định danh ngoài (externalId).
 * Hàm thuần, chỉ làm việc trên dữ liệu đã tải về client (Loaded_Conversations),
 * KHÔNG gọi API — không thay đổi hành vi máy chủ.
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
 */

/**
 * Tập con đủ dùng của `Conversation` cho việc khớp tìm kiếm.
 * - `lastMessage` trong kiểu thật là `string`, nhưng vẫn chấp nhận dạng object
 *   `{ content }` để phòng thủ trước dữ liệu khác cấu trúc.
 * - Số điện thoại nằm ở `metadata.phone` (kiểu `Conversation` không có
 *   `contact.phone`).
 */
export interface SearchableConversation {
    contact?: { displayName?: string; externalUserId?: string } | null;
    lastMessage?: { content?: string } | string | null;
    externalId?: string | null;
    metadata?: { phone?: string } | Record<string, unknown> | null;
}

function lastMessageText(lastMessage: SearchableConversation['lastMessage']): string {
    if (!lastMessage) return '';
    if (typeof lastMessage === 'string') return lastMessage;
    return lastMessage.content ?? '';
}

/**
 * Trả về true nếu `query` (không phân biệt hoa thường) là chuỗi con của bất kỳ
 * trường tìm kiếm nào: tên hiển thị, nội dung tin nhắn cuối, số điện thoại,
 * externalId / externalUserId. Query rỗng (hoặc chỉ khoảng trắng) → true.
 */
export function matchesSearch(conv: SearchableConversation, query: string): boolean {
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return true;

    const phone =
        conv.metadata && typeof (conv.metadata as { phone?: unknown }).phone === 'string'
            ? ((conv.metadata as { phone?: string }).phone as string)
            : '';

    const fields = [
        conv.contact?.displayName ?? '',
        lastMessageText(conv.lastMessage),
        phone,
        conv.contact?.externalUserId ?? '',
        conv.externalId ?? '',
    ];

    return fields.some((f) => f.toLowerCase().includes(q));
}
