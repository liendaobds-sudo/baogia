import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { Conversation, ConversationStatus, ConversationPriority } from '../../entities/conversation.entity';
import { ConversationParticipant, ParticipantRole } from '../../entities/conversation-participant.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { ConversationOutcomeService } from '../suggestions/conversation-outcome.service';

describe('ConversationsService', () => {
    let service: ConversationsService;
    let convRepo: any;
    let participantRepo: any;
    let gateway: any;
    let outcomeService: any;

    const mockConversation = {
        id: 'conv-uuid-1',
        status: ConversationStatus.NEW,
        priority: ConversationPriority.NORMAL,
        assigneeId: null as string | null,
        contact: { id: 'contact-1', displayName: 'Khách hàng A', avatarUrl: null } as any,
        channel: { id: 'channel-1', type: 'zalo', name: 'Zalo OA' } as any,
        assignee: null as any,
        unreadCount: 2,
        slaBreached: false,
        closedAt: null as Date | null,
        lastMessageAt: new Date(),
        createdAt: new Date(),
    };

    beforeEach(async () => {
        const mockQueryBuilder = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
            getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        };
        convRepo = {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            save: jest.fn().mockImplementation((conv) => Promise.resolve(conv)),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
        };
        participantRepo = {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn().mockImplementation((data) => ({ ...data, id: 'part-uuid' })),
            save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
            remove: jest.fn().mockResolvedValue(undefined),
        };
        gateway = {
            emitConversationUpdated: jest.fn(),
        };
        outcomeService = {
            captureOutcome: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ConversationsService,
                { provide: getRepositoryToken(Conversation), useValue: convRepo },
                { provide: getRepositoryToken(ConversationParticipant), useValue: participantRepo },
                { provide: EventsGateway, useValue: gateway },
                { provide: ConversationOutcomeService, useValue: outcomeService },
            ],
        }).compile();

        service = module.get<ConversationsService>(ConversationsService);
    });

    // ============================================================
    // findAll Tests
    // ============================================================

    describe('findAll', () => {
        it('should return paginated results', async () => {
            const qb = convRepo.createQueryBuilder();
            qb.getManyAndCount.mockResolvedValue([[mockConversation], 1]);

            const result = await service.findAll({ page: 1, limit: 10 });

            expect(result.data).toHaveLength(1);
            expect(result.pagination.total).toBe(1);
            expect(result.pagination.page).toBe(1);
        });

        it('should cap limit at 50', async () => {
            const qb = convRepo.createQueryBuilder();
            qb.getManyAndCount.mockResolvedValue([[], 0]);

            await service.findAll({ limit: 100 });

            expect(qb.take).toHaveBeenCalledWith(50);
        });

        it('should filter by status', async () => {
            const qb = convRepo.createQueryBuilder();
            qb.getManyAndCount.mockResolvedValue([[], 0]);

            await service.findAll({ status: 'new' });

            expect(qb.andWhere).toHaveBeenCalledWith(
                'c.status = :status', { status: 'new' },
            );
        });

        it('should default to page 1 and limit 20', async () => {
            const qb = convRepo.createQueryBuilder();
            qb.getManyAndCount.mockResolvedValue([[], 0]);

            await service.findAll({});

            expect(qb.skip).toHaveBeenCalledWith(0);
            expect(qb.take).toHaveBeenCalledWith(20);
        });
    });

    // ============================================================
    // findOne Tests
    // ============================================================

    describe('findOne', () => {
        it('should return conversation with relations', async () => {
            convRepo.findOne.mockResolvedValue(mockConversation);

            const result = await service.findOne('conv-uuid-1');
            expect(result.id).toBe('conv-uuid-1');
        });

        it('should throw NotFoundException for missing conversation', async () => {
            convRepo.findOne.mockResolvedValue(null);

            await expect(service.findOne('non-existent'))
                .rejects.toThrow(NotFoundException);
        });
    });

    // ============================================================
    // Status Transitions (State Machine)
    // ============================================================

    describe('updateStatus', () => {
        it('should allow valid transition: new → in_progress', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.NEW };
            convRepo.findOne.mockResolvedValue(conv);

            await service.updateStatus('conv-uuid-1', 'in_progress');

            expect(convRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'in_progress' }),
            );
            expect(gateway.emitConversationUpdated).toHaveBeenCalled();
        });

        it('should allow valid transition: in_progress → quoted', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.IN_PROGRESS };
            convRepo.findOne.mockResolvedValue(conv);

            await service.updateStatus('conv-uuid-1', 'quoted');

            expect(convRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'quoted' }),
            );
        });

        it('should reject invalid transition: new → won', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.NEW };
            convRepo.findOne.mockResolvedValue(conv);

            await expect(service.updateStatus('conv-uuid-1', 'won'))
                .rejects.toThrow(BadRequestException);
        });

        it('should reject invalid transition: closed → quoted', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.CLOSED };
            convRepo.findOne.mockResolvedValue(conv);

            await expect(service.updateStatus('conv-uuid-1', 'quoted'))
                .rejects.toThrow(BadRequestException);
        });

        it('should set closedAt when closing', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.NEW, closedAt: null };
            convRepo.findOne.mockResolvedValue(conv);

            await service.updateStatus('conv-uuid-1', 'closed');

            expect(conv.closedAt).toBeInstanceOf(Date);
        });

        it('should allow reopening: closed → in_progress', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.CLOSED };
            convRepo.findOne.mockResolvedValue(conv);

            await service.updateStatus('conv-uuid-1', 'in_progress');

            expect(convRepo.save).toHaveBeenCalled();
        });
    });

    // ============================================================
    // Priority Tests
    // ============================================================

    describe('updatePriority', () => {
        it('should accept valid priority', async () => {
            convRepo.findOne.mockResolvedValue({ ...mockConversation });

            await service.updatePriority('conv-uuid-1', 'urgent');

            expect(convRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ priority: 'urgent' }),
            );
        });

        it('should reject invalid priority', async () => {
            convRepo.findOne.mockResolvedValue({ ...mockConversation });

            await expect(service.updatePriority('conv-uuid-1', 'mega-ultra'))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ============================================================
    // Assign Tests
    // ============================================================

    describe('assign', () => {
        it('should assign and auto-transition NEW → IN_PROGRESS', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.NEW };
            convRepo.findOne.mockResolvedValue(conv);

            await service.assign('conv-uuid-1', 'agent-uuid-1');

            expect(conv.assigneeId).toBe('agent-uuid-1');
            expect(conv.status).toBe(ConversationStatus.IN_PROGRESS);
            expect(gateway.emitConversationUpdated).toHaveBeenCalled();
        });

        it('should not change status when already IN_PROGRESS', async () => {
            const conv = { ...mockConversation, status: ConversationStatus.IN_PROGRESS };
            convRepo.findOne.mockResolvedValue(conv);

            await service.assign('conv-uuid-1', 'agent-uuid-2');

            expect(conv.status).toBe(ConversationStatus.IN_PROGRESS);
        });
    });

    // ============================================================
    // Participant Tests
    // ============================================================

    describe('addParticipant', () => {
        it('should add a new participant', async () => {
            convRepo.findOne.mockResolvedValue(mockConversation);
            participantRepo.findOne
                .mockResolvedValueOnce(null) // duplicate check
                .mockResolvedValueOnce({ id: 'part-uuid', userId: 'user-1', role: 'collaborator' }); // reload

            const result = await service.addParticipant('conv-uuid-1', 'user-1', ParticipantRole.COLLABORATOR, 'admin-1');

            expect(participantRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    conversationId: 'conv-uuid-1',
                    userId: 'user-1',
                    role: ParticipantRole.COLLABORATOR,
                    canViewCustomerInfo: false, // collaborator can't view by default
                }),
            );
        });

        it('should reject duplicate participant', async () => {
            convRepo.findOne.mockResolvedValue(mockConversation);
            participantRepo.findOne.mockResolvedValue({ id: 'existing' });

            await expect(service.addParticipant('conv-uuid-1', 'user-1', ParticipantRole.COLLABORATOR, 'admin-1'))
                .rejects.toThrow(BadRequestException);
        });

        it('should grant customer info access to owner role', async () => {
            convRepo.findOne.mockResolvedValue(mockConversation);
            participantRepo.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 'part-uuid' });

            await service.addParticipant('conv-uuid-1', 'user-1', ParticipantRole.OWNER, 'admin-1');

            expect(participantRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ canViewCustomerInfo: true }),
            );
        });
    });

    // ============================================================
    // Contact Masking Tests
    // ============================================================

    describe('findOneForUser', () => {
        it('should mask contact info for collaborators without access', async () => {
            convRepo.findOne.mockResolvedValue({
                ...mockConversation,
                contact: { id: 'contact-abc123', displayName: 'Nguyễn Văn A', phone: '0901234567', email: 'a@test.com', avatarUrl: 'url', tags: ['vip'], metadata: { source: 'zalo' } },
            });
            participantRepo.findOne.mockResolvedValue({
                role: ParticipantRole.COLLABORATOR,
                canViewCustomerInfo: false,
            });

            const result = await service.findOneForUser('conv-uuid-1', 'collab-user') as any;

            expect(result.contact.displayName).toMatch(/^Khách hàng #/);
            expect(result.contact.phone).toBeNull();
            expect(result.contact.email).toBeNull();
            expect(result._canViewCustomerInfo).toBe(false);
        });

        it('should show full contact info for owner', async () => {
            convRepo.findOne.mockResolvedValue({
                ...mockConversation,
                contact: { id: 'contact-1', displayName: 'Nguyễn Văn A', phone: '0901234567' },
            });
            participantRepo.findOne.mockResolvedValue({
                role: ParticipantRole.OWNER,
                canViewCustomerInfo: true,
            });

            const result = await service.findOneForUser('conv-uuid-1', 'owner-user') as any;

            expect(result._canViewCustomerInfo).toBe(true);
            expect(result.contact.displayName).toBe('Nguyễn Văn A');
        });
    });
});
