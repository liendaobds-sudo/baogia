import { deliverSuggestionReply } from './suggestionDelivery';

describe('deliverSuggestionReply', () => {
    it('không đánh dấu sent khi API gửi tin trả non-2xx/null', async () => {
        const markSent = jest.fn();
        await expect(deliverSuggestionReply(
            async () => null,
            markSent,
        )).resolves.toBe(false);
        expect(markSent).not.toHaveBeenCalled();
    });

    it('chỉ đánh dấu sau khi gửi thành công', async () => {
        const order: string[] = [];
        await expect(deliverSuggestionReply(
            async () => { order.push('send'); return { id: 'message-1' }; },
            async () => { order.push('mark'); },
        )).resolves.toBe(true);
        expect(order).toEqual(['send', 'mark']);
    });
});
