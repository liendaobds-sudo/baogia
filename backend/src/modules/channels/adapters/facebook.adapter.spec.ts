/**
 * Khóa hành vi FacebookAdapter (fix audit 2026-08-13):
 *  1. parseInboundMessages đọc ĐỦ batch entry[]/messaging[] — bản cũ chỉ đọc
 *     entry[0].messaging[0] nên rớt tin khi Facebook gộp nhiều event một lần gọi.
 *  2. verifyWebhook tính HMAC trên RAW BODY (Buffer) — stringify body đã parse
 *     có thể lệch byte với bản gốc làm chữ ký hợp lệ bị từ chối.
 */
import * as crypto from 'crypto';
import { FacebookAdapter } from './facebook.adapter';

const SECRET = 'fb-app-secret';

function sign(payload: Buffer | string): string {
    return 'sha256=' + crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
}

function msgEvent(senderId: string, mid: string, text: string, extra: object = {}) {
    return {
        sender: { id: senderId },
        timestamp: 1700000000000,
        message: { mid, text, ...extra },
    };
}

describe('FacebookAdapter.parseInboundMessages — batch', () => {
    const adapter = new FacebookAdapter();

    it('đọc đủ nhiều entry × nhiều messaging (không chỉ event đầu)', () => {
        const body = {
            object: 'page',
            entry: [
                { messaging: [msgEvent('u1', 'm1', 'tin 1'), msgEvent('u1', 'm2', 'tin 2')] },
                { messaging: [msgEvent('u2', 'm3', 'tin 3')] },
            ],
        };

        const all = adapter.parseInboundMessages(body);
        expect(all.map(m => m.externalMessageId)).toEqual(['m1', 'm2', 'm3']);
        expect(all.map(m => m.text)).toEqual(['tin 1', 'tin 2', 'tin 3']);
        expect(all.map(m => m.externalUserId)).toEqual(['u1', 'u1', 'u2']);
    });

    it('bỏ qua echo và event không phải tin người dùng, giữ các tin còn lại', () => {
        const body = {
            object: 'page',
            entry: [
                {
                    messaging: [
                        msgEvent('u1', 'm1', 'tin thật'),
                        msgEvent('u1', 'm2', 'echo', { is_echo: true }),
                        { sender: { id: 'u1' }, delivery: { mids: ['m1'] } }, // không có message
                    ],
                },
            ],
        };

        const all = adapter.parseInboundMessages(body);
        expect(all).toHaveLength(1);
        expect(all[0].externalMessageId).toBe('m1');
    });

    it('object không phải page → mảng rỗng; parseInboundMessage giữ tương thích (event đầu)', () => {
        expect(adapter.parseInboundMessages({ object: 'user' })).toEqual([]);

        const body = {
            object: 'page',
            entry: [{ messaging: [msgEvent('u1', 'm1', 'a'), msgEvent('u1', 'm2', 'b')] }],
        };
        expect(adapter.parseInboundMessage(body)?.externalMessageId).toBe('m1');
    });
});

describe('FacebookAdapter.verifyWebhook — HMAC trên raw body', () => {
    const adapter = new FacebookAdapter();

    it('chấp nhận chữ ký tính trên bytes gốc (Buffer) kể cả khi stringify sẽ lệch byte', () => {
        // Raw body có khoảng trắng + unicode escape — JSON.stringify(parse(raw)) ≠ raw.
        const raw = Buffer.from('{ "object": "page", "entry": [], "note": "kh\\u00e1ch" }', 'utf8');
        const signature = sign(raw);

        // Đúng chuẩn: verify trên raw body → hợp lệ
        expect(adapter.verifyWebhook(raw, signature, SECRET)).toBe(true);
        // Sai chuẩn (bản cũ): verify trên object đã parse → tự từ chối webhook hợp lệ
        expect(adapter.verifyWebhook(JSON.parse(raw.toString()), signature, SECRET)).toBe(false);
    });

    it('fallback object vẫn hoạt động khi chữ ký được tính trên stringify (môi trường test)', () => {
        const body = { object: 'page', entry: [] };
        const signature = sign(JSON.stringify(body));
        expect(adapter.verifyWebhook(body, signature, SECRET)).toBe(true);
    });

    it('từ chối: thiếu prefix sha256=, sai secret, chữ ký lệch độ dài', () => {
        const raw = Buffer.from('{"object":"page"}');
        expect(adapter.verifyWebhook(raw, sign(raw).slice(7), SECRET)).toBe(false);
        expect(adapter.verifyWebhook(raw, sign(raw), 'secret-khác')).toBe(false);
        expect(adapter.verifyWebhook(raw, 'sha256=abc', SECRET)).toBe(false);
    });
});
