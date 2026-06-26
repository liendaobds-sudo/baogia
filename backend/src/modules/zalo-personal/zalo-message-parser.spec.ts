import { parseZaloMessageContent, isZaloReactionCode } from './zalo-message-parser';

describe('ZaloMessageParser', () => {
    describe('parseZaloMessageContent', () => {
        it('should return plain text content as-is', () => {
            const result = parseZaloMessageContent('Hello world');
            expect(result.content).toBe('Hello world');
            expect(result.attachments).toHaveLength(0);
        });

        it('should handle null/undefined', () => {
            expect(parseZaloMessageContent(null).content).toBe('');
            expect(parseZaloMessageContent(undefined).content).toBe('');
        });

        // ── Group System Events ──
        it('should parse group member added event (actionType 0)', () => {
            const result = parseZaloMessageContent([{ actionType: 0 }]);
            expect(result.content).toContain('Thành viên mới');
        });

        it('should parse group member left event (actionType 1)', () => {
            const result = parseZaloMessageContent([{ actionType: 1 }]);
            expect(result.content).toContain('rời nhóm');
        });

        it('should parse group name change (actionType 4)', () => {
            const result = parseZaloMessageContent([{ actionType: 4 }]);
            expect(result.content).toContain('Tên nhóm');
        });

        it('should handle unknown group event type', () => {
            const result = parseZaloMessageContent([{ actionType: 999 }]);
            expect(result.content).toContain('cài đặt nhóm');
        });

        it('should handle empty array as group event', () => {
            const result = parseZaloMessageContent([]);
            expect(result.content).toBe('[Sự kiện nhóm Zalo]');
        });

        // ── Sticker ──
        it('should detect sticker by id + catId', () => {
            const result = parseZaloMessageContent({ id: 123, catId: 5 });
            expect(result.content).toBe('[Sticker Zalo]');
        });

        // ── File Attachment ──
        it('should detect file by extension (.pdf)', () => {
            const result = parseZaloMessageContent({ title: 'document.pdf', href: 'https://example.com/doc.pdf' });
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].type).toBe('file');
            expect(result.attachments[0].name).toBe('document.pdf');
        });

        it('should detect file by type=2', () => {
            const result = parseZaloMessageContent({ type: 2, title: 'archive', href: 'https://x.com/f' });
            expect(result.attachments[0].type).toBe('file');
        });

        it('should detect file by fileSize presence', () => {
            const result = parseZaloMessageContent({ title: 'data', fileSize: 1024, href: 'https://x.com/f' });
            expect(result.attachments[0].type).toBe('file');
            expect(result.attachments[0].size).toBe(1024);
        });

        it('should detect .ai design file', () => {
            const result = parseZaloMessageContent({ title: 'design.ai', href: 'https://x.com/f' });
            expect(result.attachments[0].type).toBe('file');
        });

        // ── Link Share ──
        it('should parse link share (href only, no normalUrl/hdUrl)', () => {
            const result = parseZaloMessageContent({
                title: 'YouTube Video',
                description: 'A cool video',
                href: 'https://youtube.com/watch?v=abc',
                thumb: 'https://img.youtube.com/thumb.jpg',
            });
            expect(result.content).toContain('YouTube Video');
            expect(result.content).toContain('https://youtube.com');
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].type).toBe('image');
        });

        // ── Image Attachment ──
        it('should parse image with normalUrl', () => {
            const result = parseZaloMessageContent({ normalUrl: 'https://img.com/photo.jpg' });
            expect(result.attachments).toHaveLength(1);
            expect(result.attachments[0].type).toBe('image');
            expect(result.attachments[0].url).toBe('https://img.com/photo.jpg');
        });

        it('should parse image with hdUrl fallback', () => {
            const result = parseZaloMessageContent({ hdUrl: 'https://img.com/hd.jpg' });
            expect(result.attachments[0].url).toBe('https://img.com/hd.jpg');
        });

        // ── Unknown Object ──
        it('should JSON.stringify unknown objects', () => {
            const result = parseZaloMessageContent({ unknownField: 'value' });
            expect(result.content).toContain('unknownField');
        });
    });

    describe('isZaloReactionCode', () => {
        it('should detect /-strong (thumbs up)', () => {
            expect(isZaloReactionCode('/-strong')).toBe(true);
        });

        it('should detect /-heart', () => {
            expect(isZaloReactionCode('/-heart')).toBe(true);
        });

        it('should detect :> smiley', () => {
            expect(isZaloReactionCode(':>')).toBe(true);
        });

        it('should detect <3 heart', () => {
            expect(isZaloReactionCode('<3')).toBe(true);
        });

        it('should detect :v face', () => {
            expect(isZaloReactionCode(':v')).toBe(true);
        });

        it('should NOT flag normal text', () => {
            expect(isZaloReactionCode('Hello')).toBe(false);
            expect(isZaloReactionCode('Xin chào bạn')).toBe(false);
        });

        it('should NOT flag numbers', () => {
            expect(isZaloReactionCode('12345')).toBe(false);
        });

        it('should handle non-string input', () => {
            expect(isZaloReactionCode(null)).toBe(false);
            expect(isZaloReactionCode(123)).toBe(false);
            expect(isZaloReactionCode({})).toBe(false);
        });

        it('should detect emoticon with whitespace', () => {
            expect(isZaloReactionCode(' /-strong ')).toBe(true);
        });
    });
});
