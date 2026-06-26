import { Logger } from '@nestjs/common';

const logger = new Logger('ZaloMessageParser');

/**
 * Parse raw Zalo message content into structured format.
 * Pure function — no side effects, no `this` binding.
 * Extracted from ZaloPoolService.attachListener() message handler.
 */
export function parseZaloMessageContent(
    rawContent: any,
    getStickersDetail?: (id: number) => Promise<any[]>,
): { content: string; attachments: any[] } {
    let content = typeof rawContent === 'string' ? rawContent : '';
    const attachments: any[] = [];

    if (typeof rawContent === 'string') {
        return { content, attachments };
    }

    if (typeof rawContent !== 'object' || rawContent === null) {
        return { content, attachments };
    }

    // Array → Group system event
    if (Array.isArray(rawContent)) {
        content = '[Sự kiện nhóm Zalo]';
        if (rawContent.length > 0 && typeof rawContent[0] === 'object' && 'actionType' in rawContent[0]) {
            const action = rawContent[0];
            switch (action.actionType) {
                case 0: content = '[Hệ thống] Thành viên mới đã được thêm vào nhóm'; break;
                case 1: content = '[Hệ thống] Thành viên đã rời nhóm'; break;
                case 4: content = '[Hệ thống] Tên nhóm đã thay đổi'; break;
                case 6: content = '[Hệ thống] Đã ghim tin nhắn'; break;
                case 7: content = '[Hệ thống] Ảnh đại diện nhóm đã thay đổi'; break;
                case 8: content = '[Hệ thống] Đã tạo bình chọn'; break;
                case 14: content = '[Hệ thống] Đã thay đổi thông tin nhóm'; break;
                default: content = '[Hệ thống] Thay đổi cài đặt nhóm'; break;
            }
        }
        return { content, attachments };
    }

    // Sticker
    if (rawContent.id && typeof rawContent.catId !== 'undefined') {
        content = '[Sticker Zalo]';
        // Note: sticker URL resolution is async and done by caller
        return { content, attachments };
    }

    // File attachment detection
    const fileTitle = rawContent.title || rawContent.fileName || '';
    const fileHref = rawContent.href || rawContent.url || '';
    const fileExts = ['.ai', '.psd', '.eps', '.cdr', '.svg', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.7z', '.txt', '.csv', '.pptx', '.ppt', '.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const titleExt = fileTitle.includes('.') ? '.' + fileTitle.split('.').pop()?.toLowerCase() : '';
    const isFileAttachment = rawContent.type === 2 || rawContent.fileSize || fileExts.includes(titleExt);

    if (isFileAttachment) {
        content = '';
        attachments.push({
            type: 'file',
            url: fileHref || rawContent.normalUrl || rawContent.hdUrl,
            name: fileTitle || 'file',
            size: rawContent.fileSize || rawContent.params?.fileSize || 0,
        });
    } else if (rawContent.href && !rawContent.normalUrl && !rawContent.hdUrl) {
        // Link / Share preview
        content = (rawContent.title ? rawContent.title + '\n' : '') +
            (rawContent.description ? rawContent.description + '\n' : '') +
            rawContent.href;
        if (rawContent.thumb) {
            attachments.push({ type: 'image', url: rawContent.thumb, name: rawContent.title || 'thumb.jpg' });
        }
    } else if (rawContent.normalUrl || rawContent.thumb || rawContent.hdUrl || rawContent.href) {
        // Normal image
        content = rawContent.title || '[Hình ảnh đính kèm]';
        attachments.push({
            type: 'image',
            url: rawContent.normalUrl || rawContent.hdUrl || rawContent.href || rawContent.thumb,
            name: rawContent.title || 'image.jpg',
        });
    } else {
        content = JSON.stringify(rawContent);
    }

    return { content, attachments };
}

/**
 * Check if a raw string content is a Zalo emoticon/reaction code that should be filtered.
 */
export function isZaloReactionCode(rawContent: any): boolean {
    if (typeof rawContent !== 'string') return false;
    const trimmed = rawContent.trim();
    return (
        /^\/-\w+$/.test(trimmed) ||
        /^:-?[)(>|PpDdOoSs\\/]$/.test(trimmed) ||
        /^>\.?<$/.test(trimmed) ||
        /^B-?\)$/.test(trimmed) ||
        /^:-?\($/.test(trimmed) ||
        /^:-?\(\($/.test(trimmed) ||
        /^:'\($/.test(trimmed) ||
        /^<3$/.test(trimmed) ||
        /^:v$/.test(trimmed) ||
        /^=\)$/.test(trimmed) ||
        /^:-?\|$/.test(trimmed) ||
        /^o\.O$/i.test(trimmed) ||
        (trimmed.length <= 6 && /^[:\-\/\(\)\*><|=';^~]+$/.test(trimmed))
    );
}
