/**
 * Hằng số dùng chung cho module Inbox/CSKH — tách khỏi giá trị hardcode nội tuyến
 * để dễ đọc và bảo trì.
 *
 * _Requirements: 10.1, 10.2, 10.3_
 */

/**
 * Danh sách URL sticker hiển thị trong bộ chọn sticker của Chat_Area.
 * (Trước đây là mảng nội tuyến trong JSX của `ChatArea.tsx`.)
 */
export const STICKER_URLS: readonly string[] = [
    '/images/reactions/like.png',
    '/images/reactions/heart.png',
    '/images/reactions/haha.png',
    '/images/reactions/wow.png',
    '/images/reactions/cry.png',
    '/images/reactions/angry.png',
    '/images/stickers/cat4.gif',
    '/images/stickers/cat5.gif',
    '/images/stickers/cat7.gif',
    '/images/stickers/cat8.gif',
];

/**
 * Thời gian tự ẩn (ms) cho các thông báo tạm thời cục bộ trong Inbox
 * (ví dụ `agentThought`). Toast dùng chung có hằng số tự-ẩn riêng trong
 * `lib/ui/toast.tsx` (không export); hằng số này dành cho phần Inbox.
 */
export const AGENT_THOUGHT_DISMISS_MS = 10000;

/** Thời gian giữ trạng thái "đang soạn tin" trước khi tự ẩn (ms). */
export const TYPING_INDICATOR_TIMEOUT_MS = 5000;
