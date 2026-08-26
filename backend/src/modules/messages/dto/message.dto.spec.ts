import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendMessageDto } from './message.dto';

describe('SendMessageDto runtime validation', () => {
    const validateBody = (body: Record<string, unknown>) =>
        validate(plainToInstance(SendMessageDto, body), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it('chấp nhận payload gửi một attachment đã upload', async () => {
        const errors = await validateBody({
            text: '[Hình ảnh]',
            contentType: 'image',
            attachments: [{
                url: 'http://localhost:4000/uploads/chat/123-safe.png',
                type: 'image',
                name: 'safe.png',
            }],
            idempotencyKey: 'client-1',
            replyToId: 'message-1',
        });

        expect(errors).toHaveLength(0);
    });

    it('từ chối nested attachment sai kiểu và field lạ', async () => {
        const errors = await validateBody({
            text: 'x',
            attachments: [{ url: 123, type: 'video', attackerField: true }],
        });

        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some((error) => error.property === 'attachments')).toBe(true);
    });

    it('từ chối nhiều hơn một attachment và contentType ngoài allowlist', async () => {
        const errors = await validateBody({
            text: 'x',
            contentType: 'video',
            attachments: [
                { url: '/uploads/chat/a.png', type: 'image' },
                { url: '/uploads/chat/b.png', type: 'image' },
            ],
        });

        expect(errors.some((error) => error.property === 'contentType')).toBe(true);
        expect(errors.some((error) => error.property === 'attachments')).toBe(true);
    });
});
