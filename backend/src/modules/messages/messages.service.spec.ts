/**
 * MessagesService — Unit Tests (mocked TypeORM + dependencies)
 *
 * Tests message CRUD, idempotency, recall/pin/star/delete, and search.
 * Run: npx jest --testPathPattern=messages.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { MessagesService } from './messages.service';
import { Message, MessageStatus, SenderType, Conversation, ChannelType } from '../../entities';
import { EventsGateway } from '../gateway/events.gateway';

// ─── Mock helpers ───

const mockQueryBuilder = () => {
    const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getOne: jest.fn().mockResolvedValue(null),
    };
    return qb;
};

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 'msg-1', ...data })),
    save: jest.fn((entity) => Promise.resolve({ id: 'msg-1', ...entity })),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder()),
});

const createMockGateway = () => ({
    server: {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        emit: jest.fn(),
    },
    emitMessageReacted: jest.fn(),
    emitConversationScopedEvent: jest.fn(),
});

const createMockQueue = () => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
});

describe('MessagesService', () => {
    let service: MessagesService;
    let msgRepo: ReturnType<typeof createMockRepo>;
    let convRepo: ReturnType<typeof createMockRepo>;
    let gateway: ReturnType<typeof createMockGateway>;
    let queue: ReturnType<typeof createMockQueue>;

    beforeEach(async () => {
        msgRepo = createMockRepo();
        convRepo = createMockRepo();
        gateway = createMockGateway();
        queue = createMockQueue();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MessagesService,
                { provide: getRepositoryToken(Message), useValue: msgRepo },
                { provide: getRepositoryToken(Conversation), useValue: convRepo },
                { provide: EventsGateway, useValue: gateway },
                { provide: getQueueToken('outbound_messages'), useValue: queue },
                { provide: ModuleRef, useValue: { get: jest.fn() } },
            ],
        }).compile();

        service = module.get<MessagesService>(MessagesService);
    });

    // ================================================================
    // findByConversation
    // ================================================================

    describe('findByConversation', () => {
        it('should return empty data when no messages', async () => {
            const result = await service.findByConversation('conv-1');
            expect(result.data).toEqual([]);
            expect(result.hasMore).toBe(false);
        });

        it('should respect limit and set hasMore', async () => {
            const messages = Array.from({ length: 50 }, (_, i) => ({
                id: `msg-${i}`,
                content: `Message ${i}`,
            }));
            const qb = mockQueryBuilder();
            qb.getMany.mockResolvedValue(messages);
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.findByConversation('conv-1', undefined, 50);
            expect(result.hasMore).toBe(true);
            expect(result.data).toHaveLength(50);
        });

        it('should add before filter when provided', async () => {
            const qb = mockQueryBuilder();
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            await service.findByConversation('conv-1', '2026-01-01');
            expect(qb.andWhere).toHaveBeenCalledWith(
                'msg.created_at < :before',
                { before: '2026-01-01' },
            );
        });

        it('should cap limit at 100', async () => {
            const qb = mockQueryBuilder();
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            await service.findByConversation('conv-1', undefined, 999);
            expect(qb.take).toHaveBeenCalledWith(100);
        });
    });

    // ================================================================
    // send
    // ================================================================

    describe('send', () => {
        it('should create message and enqueue to BullMQ', async () => {
            msgRepo.findOne.mockResolvedValue(null); // no dup
            const result = await service.send({
                conversationId: 'conv-1',
                content: 'Hello!',
                senderId: 'user-1',
            });
            expect(result.messageId).toBeDefined();
            expect(msgRepo.create).toHaveBeenCalled();
            expect(msgRepo.save).toHaveBeenCalled();
            expect(queue.add).toHaveBeenCalledWith(
                'send_message',
                expect.objectContaining({ conversationId: 'conv-1' }),
                expect.objectContaining({ attempts: 3 }),
            );
        });

        it('should throw ConflictException on duplicate idempotencyKey', async () => {
            msgRepo.findOne.mockResolvedValue({ id: 'existing-msg' });
            await expect(
                service.send({
                    conversationId: 'conv-1',
                    content: 'Duplicate',
                    senderId: 'user-1',
                    idempotencyKey: 'key-123',
                }),
            ).rejects.toThrow(ConflictException);
        });

        it('should set senderType as AGENT', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await service.send({
                conversationId: 'conv-1',
                content: 'Hi',
                senderId: 'user-1',
            });
            const createCall = msgRepo.create.mock.calls[0][0];
            expect(createCall.senderType).toBe(SenderType.AGENT);
            expect(createCall.status).toBe(MessageStatus.SENDING);
        });

        it('should default contentType to text', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await service.send({
                conversationId: 'conv-1',
                content: 'Hello',
                senderId: 'user-1',
            });
            const createCall = msgRepo.create.mock.calls[0][0];
            expect(createCall.contentType).toBe('text');
        });
    });

    // ================================================================
    // togglePinMessage
    // ================================================================

    describe('togglePinMessage', () => {
        it('should throw NotFoundException when message not found', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await expect(
                service.togglePinMessage('conv-1', 'msg-999'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should toggle pin from false to true', async () => {
            const msg = { id: 'msg-1', conversationId: 'conv-1', isPinned: false };
            msgRepo.findOne.mockResolvedValue(msg);

            const result = await service.togglePinMessage('conv-1', 'msg-1');
            expect(result.isPinned).toBe(true);
            expect(gateway.emitConversationScopedEvent).toHaveBeenCalledWith(
                undefined,
                'conv-1',
                'messagePinned',
                expect.objectContaining({ messageId: 'msg-1', isPinned: true }),
            );
        });

        it('should toggle pin from true to false', async () => {
            const msg = { id: 'msg-1', conversationId: 'conv-1', isPinned: true };
            msgRepo.findOne.mockResolvedValue(msg);

            const result = await service.togglePinMessage('conv-1', 'msg-1');
            expect(result.isPinned).toBe(false);
        });
    });

    // ================================================================
    // toggleStarMessage
    // ================================================================

    describe('toggleStarMessage', () => {
        it('should throw NotFoundException when message not found', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await expect(
                service.toggleStarMessage('conv-1', 'msg-999'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should toggle star from false to true', async () => {
            const msg = { id: 'msg-1', conversationId: 'conv-1', isStarred: false };
            msgRepo.findOne.mockResolvedValue(msg);

            const result = await service.toggleStarMessage('conv-1', 'msg-1');
            expect(result.isStarred).toBe(true);
        });
    });

    // ================================================================
    // deleteMessageLocal
    // ================================================================

    describe('deleteMessageLocal', () => {
        it('should throw NotFoundException when message not found', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await expect(
                service.deleteMessageLocal('conv-1', 'msg-999'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should soft-delete by setting isLocalDeleted', async () => {
            const msg = { id: 'msg-1', conversationId: 'conv-1', isLocalDeleted: false };
            msgRepo.findOne.mockResolvedValue(msg);

            await service.deleteMessageLocal('conv-1', 'msg-1');
            expect(msg.isLocalDeleted).toBe(true);
            expect(msgRepo.save).toHaveBeenCalledWith(msg);
            expect(gateway.emitConversationScopedEvent).toHaveBeenCalledWith(
                undefined,
                'conv-1',
                'messageLocalDeleted',
                expect.objectContaining({ messageId: 'msg-1' }),
            );
        });
    });

    // ================================================================
    // recallMessage
    // ================================================================

    describe('recallMessage', () => {
        it('should throw NotFoundException when message not found', async () => {
            msgRepo.findOne.mockResolvedValue(null);
            await expect(
                service.recallMessage('conv-1', 'msg-999'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw ConflictException for customer messages', async () => {
            msgRepo.findOne.mockResolvedValue({
                id: 'msg-1',
                senderType: SenderType.CUSTOMER,
            });
            await expect(
                service.recallMessage('conv-1', 'msg-1'),
            ).rejects.toThrow(ConflictException);
        });

        it('should set status to RECALLED for agent messages', async () => {
            const msg = {
                id: 'msg-1',
                senderType: SenderType.AGENT,
                externalMsgId: 'ext-1',
                status: MessageStatus.SENT,
            };
            msgRepo.findOne.mockResolvedValue(msg);
            convRepo.findOne.mockResolvedValue({
                id: 'conv-1',
                channel: { type: ChannelType.FACEBOOK_PAGE },
                contact: { externalUserId: 'user-1' },
            });

            const result = await service.recallMessage('conv-1', 'msg-1');
            expect(result.status).toBe(MessageStatus.RECALLED);
            expect(gateway.emitConversationScopedEvent).toHaveBeenCalledWith(
                undefined,
                'conv-1',
                'messageRecalled',
                expect.objectContaining({ messageId: 'msg-1', status: MessageStatus.RECALLED }),
            );
        });
    });

    // ================================================================
    // searchMessages
    // ================================================================

    describe('searchMessages', () => {
        it('should return empty for short queries', async () => {
            const result = await service.searchMessages('conv-1', 'a');
            expect(result).toEqual([]);
        });

        it('should return empty for empty query', async () => {
            const result = await service.searchMessages('conv-1', '');
            expect(result).toEqual([]);
        });

        it('should search with LIKE filter', async () => {
            const qb = mockQueryBuilder();
            qb.getMany.mockResolvedValue([{ id: 'msg-1', content: 'Hello World' }]);
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.searchMessages('conv-1', 'hello');
            expect(result).toHaveLength(1);
            expect(qb.andWhere).toHaveBeenCalledWith(
                'LOWER(msg.content) LIKE :q',
                { q: '%hello%' },
            );
        });

        it('should cap limit at 50', async () => {
            const qb = mockQueryBuilder();
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            await service.searchMessages('conv-1', 'test', 999);
            expect(qb.take).toHaveBeenCalledWith(50);
        });
    });
});
