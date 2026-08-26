import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChannelType } from '../../entities/channel.entity';
import { MessageProcessorService } from './message-processor.service';
import * as attachmentHelper from './outbound-attachment.helper';

describe('MessageProcessorService outbound attachment security', () => {
    const contactRepo = {} as any;
    const channelRepo = {} as any;
    const moduleRef = {} as any;
    const eventsGateway = {
        emitNewMessage: jest.fn(),
        emitMessageStatus: jest.fn(),
    } as any;
    const configService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
            if (key === 'API_BASE_URL') return 'http://localhost:4000';
            if (key === 'PORT') return 4000;
            return defaultValue;
        }),
    } as any;

    let convRepo: any;
    let messageRepo: any;
    let service: MessageProcessorService;

    beforeEach(() => {
        jest.clearAllMocks();
        convRepo = {
            findOne: jest.fn(),
        };
        messageRepo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((value) => ({
                ...value,
                id: 'message-1',
                createdAt: new Date('2026-08-23T00:00:00.000Z'),
            })),
            save: jest.fn(async (value) => value),
        };
        service = new MessageProcessorService(
            contactRepo,
            convRepo,
            messageRepo,
            channelRepo,
            eventsGateway,
            moduleRef,
            configService,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('từ chối conversation tenant khác trước mọi thao tác file', async () => {
        convRepo.findOne.mockResolvedValue(null);
        const loadSpy = jest.spyOn(attachmentHelper, 'loadInternalChatAttachment');

        await expect(service.processOutbound(
            'conversation-a',
            { text: '[Hình ảnh]', attachmentUrl: '/uploads/chat/does-not-exist.png', attachmentType: 'image' },
            'user-b',
            'request-1',
            22,
        )).rejects.toBeInstanceOf(NotFoundException);

        expect(convRepo.findOne).toHaveBeenCalledWith({
            where: { id: 'conversation-a', tenantId: 22 },
            relations: ['channel', 'contact'],
        });
        expect(loadSpy).not.toHaveBeenCalled();
        expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('fail-closed khi auto-reply nền bị mất tenant context', async () => {
        await expect(service.processOutbound(
            'conversation-a',
            { text: 'Auto reply' },
            'ai-auto',
        )).rejects.toBeInstanceOf(ForbiddenException);

        expect(convRepo.findOne).not.toHaveBeenCalled();
        expect(messageRepo.save).not.toHaveBeenCalled();
    });

    it('happy path: chuẩn bị attachment sau tenant check và scope idempotency theo tenant', async () => {
        const conversation = {
            id: 'conversation-7',
            tenantId: 7,
            channel: { type: ChannelType.ZALO_PERSONAL, accessTokenEnc: 'account-1' },
            contact: { externalUserId: 'recipient-1' },
        } as any;
        const prepared = {
            data: Buffer.from('prepared-image'),
            filename: 'safe.png',
            mimeType: 'image/png',
            size: 14,
        };
        convRepo.findOne.mockResolvedValue(conversation);
        const loadSpy = jest.spyOn(attachmentHelper, 'loadInternalChatAttachment').mockResolvedValue(prepared);
        const backgroundSpy = jest.spyOn(service as any, 'executeBackgroundSend').mockResolvedValue(undefined);

        const result = await service.processOutbound(
            'conversation-7',
            { text: '[Hình ảnh]', attachmentUrl: '/uploads/chat/safe.png', attachmentType: 'image' },
            'user-7',
            'request-7',
            7,
        );

        expect(result.id).toBe('message-1');
        expect(convRepo.findOne.mock.invocationCallOrder[0]).toBeLessThan(loadSpy.mock.invocationCallOrder[0]);
        expect(messageRepo.findOne).toHaveBeenCalledWith({
            where: { idempotencyKey: 'request-7', tenantId: 7 },
        });
        expect(messageRepo.create).toHaveBeenCalledWith(expect.objectContaining({
            conversation,
            tenantId: 7,
            idempotencyKey: 'request-7',
        }));
        expect(backgroundSpy).toHaveBeenCalledWith(
            conversation,
            expect.objectContaining({ id: 'message-1' }),
            expect.objectContaining({ attachmentUrl: '/uploads/chat/safe.png' }),
            'user-7',
            prepared,
        );
    });
});
