import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, IsNull } from 'typeorm';
import { Conversation, ConversationStatus, ConversationPriority } from '../../entities/conversation.entity';
import { ConversationParticipant, ParticipantRole } from '../../entities/conversation-participant.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion } from '../../entities/ai-suggestion.entity';
import { FollowUp } from '../../entities/follow-up.entity';
import { InternalNote } from '../../entities/internal-note.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { ConversationOutcomeService } from '../suggestions/conversation-outcome.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
    [ConversationStatus.NEW]: ['in_progress', 'closed'],
    [ConversationStatus.IN_PROGRESS]: ['waiting_customer', 'waiting_file', 'quoted', 'closed'],
    [ConversationStatus.WAITING_CUSTOMER]: ['in_progress', 'closed'],
    [ConversationStatus.WAITING_FILE]: ['in_progress', 'closed'],
    [ConversationStatus.QUOTED]: ['won', 'lost', 'in_progress', 'closed'],
    [ConversationStatus.WON]: ['closed'],
    [ConversationStatus.LOST]: ['in_progress', 'closed'],
    [ConversationStatus.CLOSED]: ['in_progress'],
};

@Injectable()
export class ConversationsService {
    private readonly logger = new Logger(ConversationsService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(ConversationParticipant) private participantRepo: Repository<ConversationParticipant>,
        private gateway: EventsGateway,
        private outcomeService: ConversationOutcomeService,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /** App-level tenant filter (defense-in-depth before/alongside RLS). */
    private applyTenantFilter(qb: ReturnType<Repository<Conversation>['createQueryBuilder']>, alias = 'c'): void {
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null) {
            qb.andWhere(`(${alias}.tenantId = :_tid OR ${alias}.tenantId IS NULL)`, { _tid: ctx.tenantId });
        }
    }

    async findAll(query: {
        status?: string; assigneeId?: string; priority?: string;
        tag?: string;
        page?: number; limit?: number;
    }) {
        const page = query.page || 1;
        const limit = Math.min(query.limit || 20, 50);

        const qb = this.convRepo.createQueryBuilder('c')
            .leftJoinAndSelect('c.contact', 'contact')
            .leftJoinAndSelect('c.channel', 'channel')
            .leftJoinAndSelect('c.assignee', 'assignee')
            .orderBy('c.isPinned', 'DESC')
            .addOrderBy('c.lastMessageAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);

        this.applyTenantFilter(qb, 'c');

        if (query.status) qb.andWhere('c.status = :status', { status: query.status });
        if (query.priority) qb.andWhere('c.priority = :priority', { priority: query.priority });
        if (query.assigneeId) qb.andWhere('c.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
        if (query.tag) {
            // Revert back to LIKE for SQLite compatibility, removing the aggressive \\_ escaping 
            // that broke exact matching when ESCAPE clause was omitted contextually.
            qb.andWhere('c.tags LIKE :tag', { tag: `%"${query.tag}"%` });
        }

        const [data, total] = await qb.getManyAndCount();

        return {
            data: data.map(c => ({
                id: c.id,
                channel: c.channel ? { id: c.channel.id, type: c.channel.type, name: c.channel.name } : null,
                contact: c.contact ? { id: c.contact.id, displayName: c.contact.displayName, avatarUrl: c.contact.avatarUrl, externalUserId: c.contact.externalUserId } : null,
                assignee: c.assignee ? { id: c.assignee.id, fullName: c.assignee.fullName } : null,
                status: c.status,
                priority: c.priority,
                subject: c.subject,
                productType: c.productType,
                tags: c.tags || [],
                unreadCount: c.unreadCount,
                slaBreached: c.slaBreached,
                slaDeadline: c.slaDeadline,
                lastMessageAt: c.lastMessageAt,
                createdAt: c.createdAt,
            })),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async findOne(id: string) {
        const conv = await this.convRepo.findOne({
            where: { id },
            relations: ['contact', 'channel', 'assignee'],
        });
        if (!conv) throw new NotFoundException('Hội thoại không tồn tại');
        // Defense-in-depth: hide cross-tenant rows when context is set
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null) {
            if (conv.tenantId != null && conv.tenantId !== ctx.tenantId) {
                throw new NotFoundException('Hội thoại không tồn tại');
            }
        }
        return conv;
    }

    async assign(id: string, assigneeId: string) {
        const conv = await this.findOne(id);
        conv.assigneeId = assigneeId;
        if (conv.status === ConversationStatus.NEW) {
            conv.status = ConversationStatus.IN_PROGRESS;
        }
        const saved = await this.convRepo.save(conv);
        this.logger.log(`📋 Conversation ${id} assigned to ${assigneeId}`);

        // Reload with relations for WS event
        const updated = await this.findOne(id);
        this.gateway.emitConversationUpdated({
            id: updated.id, status: updated.status, assigneeId: updated.assigneeId,
            assignee: updated.assignee ? { id: updated.assignee.id, fullName: updated.assignee.fullName } : null,
        }, updated.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined);
        return updated;
    }

    async updateStatus(id: string, newStatus: string) {
        const conv = await this.findOne(id);
        const allowed = VALID_TRANSITIONS[conv.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(
                `Không thể chuyển từ "${conv.status}" sang "${newStatus}". Cho phép: ${allowed.join(', ')}`,
            );
        }
        conv.status = newStatus as ConversationStatus;
        if (newStatus === ConversationStatus.CLOSED) {
            conv.closedAt = new Date();
        }
        await this.convRepo.save(conv);
        this.logger.log(`📋 Conversation ${id} status → ${newStatus}`);

        // Fire-and-forget: capture outcome analytics for terminal statuses
        const terminalStatuses = [ConversationStatus.WON, ConversationStatus.LOST, ConversationStatus.CLOSED];
        if (terminalStatuses.includes(newStatus as ConversationStatus)) {
            this.outcomeService.captureOutcome(id).catch(err =>
                this.logger.warn(`⚠️ Outcome capture failed: ${err.message}`),
            );
        }

        this.gateway.emitConversationUpdated(
            { id, status: newStatus },
            conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
        );
        return this.findOne(id);
    }

    async updatePriority(id: string, priority: string) {
        const conv = await this.findOne(id);
        if (!Object.values(ConversationPriority).includes(priority as ConversationPriority)) {
            throw new BadRequestException(`Priority không hợp lệ: ${priority}`);
        }
        conv.priority = priority as ConversationPriority;
        await this.convRepo.save(conv);
        this.logger.log(`📋 Conversation ${id} priority → ${priority}`);

        this.gateway.emitConversationUpdated(
            { id, priority },
            conv.tenantId ?? this.tenantCtx?.currentTenantId() ?? undefined,
        );
        return this.findOne(id);
    }

    async update(id: string, data: Partial<Conversation>) {
        const conv = await this.findOne(id);
        Object.assign(conv, data);
        return this.convRepo.save(conv);
    }

    async remove(id: string) {
        const conv = await this.findOne(id);
        
        await this.convRepo.manager.transaction(async (manager) => {
            // Sử dụng TypeORM manager.delete thay vì raw query để đảm bảo tương thích an toàn 100%
            await manager.delete(AiSuggestion, { conversationId: id });
            await manager.delete(Message, { conversationId: id });
            await manager.delete(FollowUp, { conversationId: id });
            await manager.delete(InternalNote, { conversationId: id });
            await manager.delete(ConversationParticipant, { conversationId: id });

            await manager.remove(conv);
        });

        this.logger.log(`🗑️ Conversation ${id} deleted safely`);
        return { success: true };
    }

    /** Find conversations with breached SLA */
    async findBreachedSla(): Promise<Conversation[]> {
        const now = new Date();
        const qb = this.convRepo
            .createQueryBuilder('c')
            .where('c.sla_breached = :breached', { breached: false })
            .andWhere('c.sla_deadline IS NOT NULL')
            .andWhere('c.sla_deadline < :now', { now });
        this.applyTenantFilter(qb, 'c');
        return qb.getMany();
    }

    // ═══ Participant Management ═══

    async addParticipant(conversationId: string, userId: string, role: ParticipantRole, addedByUserId: string) {
        // Verify conversation exists
        await this.findOne(conversationId);

        // Check duplicate
        const existing = await this.participantRepo.findOne({
            where: { conversationId, userId },
        });
        if (existing) {
            throw new BadRequestException('Người này đã tham gia hội thoại');
        }

        const participant = this.participantRepo.create({
            conversationId,
            userId,
            role,
            canViewCustomerInfo: role === ParticipantRole.OWNER, // Owner sees all, collaborator doesn't
            addedBy: addedByUserId,
        });
        const saved = await this.participantRepo.save(participant);
        this.logger.log(`👥 Added participant ${userId} (${role}) to conversation ${conversationId}`);

        // Reload with user relation
        return this.participantRepo.findOne({ where: { id: saved.id }, relations: ['user'] });
    }

    async removeParticipant(conversationId: string, userId: string) {
        const participant = await this.participantRepo.findOne({
            where: { conversationId, userId },
        });
        if (!participant) {
            throw new NotFoundException('Participant không tồn tại');
        }
        await this.participantRepo.remove(participant);
        this.logger.log(`👥 Removed participant ${userId} from conversation ${conversationId}`);
        return { success: true };
    }

    async getParticipants(conversationId: string) {
        return this.participantRepo.find({
            where: { conversationId },
            relations: ['user'],
            order: { addedAt: 'ASC' },
        });
    }

    async getParticipantRole(conversationId: string, userId: string): Promise<ConversationParticipant | null> {
        return this.participantRepo.findOne({
            where: { conversationId, userId },
        });
    }

    async toggleCustomerInfoAccess(conversationId: string, userId: string, canView: boolean) {
        const participant = await this.participantRepo.findOne({
            where: { conversationId, userId },
        });
        if (!participant) throw new NotFoundException('Participant không tồn tại');
        participant.canViewCustomerInfo = canView;
        return this.participantRepo.save(participant);
    }

    /** Get conversation with masked contact info for collaborators */
    async findOneForUser(id: string, userId: string) {
        const conv = await this.findOne(id);
        const participant = await this.getParticipantRole(id, userId);

        // If user is a collaborator without customer info access, mask contact
        if (participant && participant.role === ParticipantRole.COLLABORATOR && !participant.canViewCustomerInfo) {
            const shortId = conv.contact?.id?.slice(-6) || '???';
            return {
                ...conv,
                contact: conv.contact ? {
                    id: conv.contact.id,
                    displayName: `Khách hàng #${shortId}`,
                    avatarUrl: null,
                    phone: null,
                    email: null,
                    tags: [],
                    metadata: {},
                } : null,
                _participantRole: participant.role,
                _canViewCustomerInfo: participant.canViewCustomerInfo,
            };
        }

        return {
            ...conv,
            _participantRole: participant?.role || 'owner',
            _canViewCustomerInfo: true,
        };
    }
    /** Add tag to conversation (deduped) */
    async addTag(id: string, tag: string) {
        const conv = await this.findOne(id);
        const tags = new Set<string>(conv.tags || []);
        tags.add(tag.toLowerCase().trim());
        conv.tags = Array.from(tags);
        await this.convRepo.save(conv);
        this.logger.log(`🏷️ Tag "${tag}" added to ${id}`);
        return { tags: conv.tags };
    }

    /** Remove tag from conversation */
    async removeTag(id: string, tag: string) {
        const conv = await this.findOne(id);
        const normalized = tag.toLowerCase().trim();
        conv.tags = (conv.tags || []).filter(t => t !== normalized);
        await this.convRepo.save(conv);
        this.logger.log(`🏷️ Tag "${tag}" removed from ${id}`);
        return { tags: conv.tags };
    }

    /** Get all unique tags across all conversations (for filter dropdown) */
    async getAllTags(): Promise<{ tag: string; count: number }[]> {
        // Load only tags column with a reasonable limit to avoid unbounded memory usage.
        // For very large datasets (>5000 open convs), consider migrating tags to a
        // separate junction table with SQL-level aggregation.
        // Lọc tenant (audit 2026-08-13): dropdown tag không được lộ tag của tenant khác.
        const baseWhere: any = { status: Not(In([ConversationStatus.CLOSED])) };
        const ctx = this.tenantCtx?.get?.();
        const where = (ctx && !ctx.bypass && ctx.tenantId != null)
            ? [{ ...baseWhere, tenantId: ctx.tenantId }, { ...baseWhere, tenantId: IsNull() }]
            : baseWhere;
        const convs = await this.convRepo.find({
            where,
            select: ['tags'],
            take: 5000,
        });

        const tagCounts = new Map<string, number>();
        for (const conv of convs) {
            const tags = conv.tags || [];
            for (const tag of tags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }

        return Array.from(tagCounts.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count);
    }

    /** Mark all conversations as read (reset unreadCount to 0) — bulk UPDATE */
    async markAllRead(): Promise<{ count: number }> {
        // Single bulk UPDATE instead of loading all convs + loop save.
        // Lọc tenant (audit 2026-08-13): UPDATE hàng loạt không được chạm hội thoại
        // của tenant khác (hàng NULL legacy vẫn nhận — nhất quán filter đọc, gỡ sau flip).
        const qb = this.convRepo
            .createQueryBuilder()
            .update(Conversation)
            .set({ unreadCount: 0 })
            .where('unread_count > 0');
        const ctx = this.tenantCtx?.get?.();
        if (ctx && !ctx.bypass && ctx.tenantId != null) {
            qb.andWhere('(tenant_id = :_tid OR tenant_id IS NULL)', { _tid: ctx.tenantId });
        }
        const result = await qb.execute();

        const count = result.affected || 0;

        // Broadcast update to all connected clients
        if (count > 0) {
            this.gateway.emitConversationUpdated(
                { _bulkMarkRead: true, unreadCount: 0 },
                ctx && !ctx.bypass ? ctx.tenantId : undefined,
            );
        }

        this.logger.log(`✅ Marked ${count} conversations as read (bulk UPDATE)`);
        return { count };
    }
}

