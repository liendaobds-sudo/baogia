/**
 * Property test cho khớp tìm kiếm hội thoại đa trường.
 *
 * Feature: inbox-cskh-ux
 * - Property 4: Khớp tìm kiếm đa trường, không phân biệt hoa thường
 */
import fc from 'fast-check';

import { matchesSearch, type SearchableConversation } from './conversationSearch';

describe('conversationSearch', () => {
    // Sinh giá trị trường không chứa khoảng-trắng-only và đủ dài để lấy substring.
    const arbField = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

    const arbConv = fc.record({
        displayName: arbField,
        lastMessage: arbField,
        phone: arbField,
        externalUserId: arbField,
        externalId: arbField,
    });

    function build(parts: {
        displayName: string;
        lastMessage: string;
        phone: string;
        externalUserId: string;
        externalId: string;
    }): SearchableConversation {
        return {
            contact: { displayName: parts.displayName, externalUserId: parts.externalUserId },
            lastMessage: parts.lastMessage,
            externalId: parts.externalId,
            metadata: { phone: parts.phone },
        };
    }

    it('Feature: inbox-cskh-ux, Property 4: mọi substring (đổi hoa thường) của bất kỳ trường nào đều khớp', () => {
        fc.assert(
            fc.property(
                arbConv,
                fc.constantFrom<'displayName' | 'lastMessage' | 'phone' | 'externalUserId' | 'externalId'>(
                    'displayName',
                    'lastMessage',
                    'phone',
                    'externalUserId',
                    'externalId',
                ),
                fc.double({ min: 0, max: 1, noNaN: true }),
                fc.double({ min: 0, max: 1, noNaN: true }),
                (parts, field, startFrac, lenFrac) => {
                    const conv = build(parts);
                    const value = parts[field];
                    const start = Math.floor(startFrac * (value.length - 1));
                    const len = Math.max(1, Math.floor(lenFrac * (value.length - start)));
                    const sub = value.slice(start, start + len);
                    // Đảo hoa thường để kiểm tra không phân biệt hoa thường.
                    const query = sub
                        .split('')
                        .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                        .join('');
                    if (!query.trim()) return; // bỏ qua query rỗng sau khi trim
                    expect(matchesSearch(conv, query)).toBe(true);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('Feature: inbox-cskh-ux, Property 4: query rỗng luôn khớp', () => {
        fc.assert(
            fc.property(arbConv, (parts) => {
                expect(matchesSearch(build(parts), '')).toBe(true);
                expect(matchesSearch(build(parts), '   ')).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('Feature: inbox-cskh-ux, Property 4: query không phải substring của trường nào → không khớp', () => {
        fc.assert(
            fc.property(arbConv, (parts) => {
                const conv = build(parts);
                // Token chắc chắn không xuất hiện trong bất kỳ trường nào.
                const sentinel = 'zzqq_NO_MATCH_SENTINEL_9137';
                const joined = Object.values(parts).join('|').toLowerCase();
                fc.pre(!joined.includes(sentinel.toLowerCase()));
                expect(matchesSearch(conv, sentinel)).toBe(false);
            }),
            { numRuns: 100 },
        );
    });
});
