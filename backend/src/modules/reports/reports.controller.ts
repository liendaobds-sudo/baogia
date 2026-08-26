import { Controller, Get, Query, UseGuards, Res, Optional, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus, Message, AiSuggestion, User, SenderType } from '../../entities';
import { Response } from 'express';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private sugRepo: Repository<AiSuggestion>,
        @InjectRepository(User) private userRepo: Repository<User>,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    private currentTenantId(req?: any): number | null {
        const fromCtx = this.tenantCtx?.get?.();
        if (fromCtx && !fromCtx.bypass && fromCtx.tenantId != null) return fromCtx.tenantId;
        const fromUser = req?.user?.tenantId;
        return fromUser != null ? Number(fromUser) : null;
    }

    @Get('agents')
    async agentPerformance(@Query('days') days?: number, @Req() req?: any) {
        const d = Math.min(days || 7, 90);
        const since = new Date(Date.now() - d * 24 * 3600_000);
        const tid = this.currentTenantId(req);

        const users = tid != null
            ? await this.userRepo.find({ where: { tenantId: tid } as any })
            : await this.userRepo.find();
        const userIds = users.map(u => u.id);

        // Fix audit 2026-08-13: `since` được tính nhưng KHÔNG áp vào query nào —
        // nhãn báo cáo ghi "7 ngày" nhưng số liệu là all-time. Nay áp cho cả 3 query.
        const convQb = this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .andWhere('c.created_at >= :since', { since });
        if (tid != null) convQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
        const convCountsRaw = await convQb.groupBy('c.assignee_id').getRawMany();
        const convCounts = new Map<string, number>(convCountsRaw.map(r => [r.assigneeId, parseInt(r.count, 10)]));

        const msgQb = this.msgRepo
            .createQueryBuilder('m')
            .select('m.sender_id', 'senderId')
            .addSelect('COUNT(*)', 'count')
            .where('m.sender_type = :st', { st: SenderType.AGENT })
            .andWhere('m.sender_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .andWhere('m.created_at >= :since', { since });
        if (tid != null) msgQb.andWhere('(m.tenant_id = :tid OR m.tenant_id IS NULL)', { tid });
        const msgCountsRaw = await msgQb.groupBy('m.sender_id').getRawMany();
        const msgCounts = new Map<string, number>(msgCountsRaw.map(r => [r.senderId, parseInt(r.count, 10)]));

        // Trước đây getMany() KHÔNG LIMIT — nạp toàn bộ bảng conversations vào RAM
        // rồi mới cắt 20/agent bằng JS. Nay lọc theo kỳ + trần 2000 dòng gần nhất.
        const recentQb = this.convRepo
            .createQueryBuilder('c')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .andWhere('c.updated_at >= :since', { since })
            .orderBy('c.updated_at', 'DESC')
            .take(2000);
        if (tid != null) recentQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
        const recentConvs = await recentQb.getMany();

        const convsByAssignee = new Map<string, Conversation[]>();
        for (const c of recentConvs) {
            if (!c.assigneeId) continue;
            const list = convsByAssignee.get(c.assigneeId) || [];
            if (list.length < 20) list.push(c);
            convsByAssignee.set(c.assigneeId, list);
        }

        const report = users.map(user => {
            const recent = convsByAssignee.get(user.id) || [];
            const slaBreached = recent.filter(c => c.slaBreached).length;
            const resolved = recent.filter(c => c.status === ConversationStatus.CLOSED || c.status === ConversationStatus.WON).length;

            return {
                agent: {
                    id: user.id,
                    fullName: user.fullName,
                    email: user.email,
                    role: user.role,
                    avatarUrl: user.avatarUrl,
                },
                metrics: {
                    conversationsAssigned: convCounts.get(user.id) || 0,
                    messagesSent: msgCounts.get(user.id) || 0,
                    resolved,
                    slaBreached,
                    slaCompliance: recent.length > 0
                        ? Math.round(((recent.length - slaBreached) / recent.length) * 100)
                        : 100,
                },
            };
        });

        return {
            period: `${d} ngày`,
            since: since.toISOString(),
            agents: report.sort((a, b) => b.metrics.conversationsAssigned - a.metrics.conversationsAssigned),
        };
    }

    @Get('summary')
    async summary(@Req() req?: any) {
        const tid = this.currentTenantId(req);
        const convWhere: any = tid != null ? [{ tenantId: tid }, { tenantId: null as any }] : undefined;
        // TypeORM count with OR is awkward — use query builder
        const convQb = this.convRepo.createQueryBuilder('c');
        const msgQb = this.msgRepo.createQueryBuilder('m');
        if (tid != null) {
            convQb.where('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
            msgQb.where('(m.tenant_id = :tid OR m.tenant_id IS NULL)', { tid });
        }
        const totalConvs = await convQb.getCount();
        const totalMsgs = await msgQb.getCount();
        const totalSugs = await this.sugRepo.count();
        const breachedQb = this.convRepo.createQueryBuilder('c').where('c.sla_breached = :b', { b: true });
        const resolvedQb = this.convRepo.createQueryBuilder('c').where('c.status = :s', { s: ConversationStatus.CLOSED });
        if (tid != null) {
            breachedQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
            resolvedQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
        }
        const breached = await breachedQb.getCount();
        const resolved = await resolvedQb.getCount();

        return {
            conversations: { total: totalConvs, resolved, breached },
            messages: totalMsgs,
            suggestions: totalSugs,
            slaCompliance: totalConvs > 0 ? Math.round(((totalConvs - breached) / totalConvs) * 100) : 100,
        };
    }

    @Get('export/csv')
    async exportCSV(@Res() res: Response, @Req() req?: any) {
        const tid = this.currentTenantId(req);
        const users = tid != null
            ? await this.userRepo.find({ where: { tenantId: tid } as any })
            : await this.userRepo.find();
        const userIds = users.map(u => u.id);

        const convQb = this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] });
        if (tid != null) convQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
        const convCountsRaw = await convQb.groupBy('c.assignee_id').getRawMany();
        const convCounts = new Map<string, number>(convCountsRaw.map(r => [r.assigneeId, parseInt(r.count, 10)]));

        const msgQb = this.msgRepo
            .createQueryBuilder('m')
            .select('m.sender_id', 'senderId')
            .addSelect('COUNT(*)', 'count')
            .where('m.sender_type = :st', { st: SenderType.AGENT })
            .andWhere('m.sender_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] });
        if (tid != null) msgQb.andWhere('(m.tenant_id = :tid OR m.tenant_id IS NULL)', { tid });
        const msgCountsRaw = await msgQb.groupBy('m.sender_id').getRawMany();
        const msgCounts = new Map<string, number>(msgCountsRaw.map(r => [r.senderId, parseInt(r.count, 10)]));

        const slaQb = this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .andWhere('c.sla_breached = :b', { b: true });
        if (tid != null) slaQb.andWhere('(c.tenant_id = :tid OR c.tenant_id IS NULL)', { tid });
        const slaCountsRaw = await slaQb.groupBy('c.assignee_id').getRawMany();
        const slaCounts = new Map<string, number>(slaCountsRaw.map(r => [r.assigneeId, parseInt(r.count, 10)]));

        const header = 'Agent,Email,Hội thoại,Tin nhắn,SLA vi phạm\n';
        const rows: string[] = [];
        for (const user of users) {
            const convCount = convCounts.get(user.id) || 0;
            const msgCount = msgCounts.get(user.id) || 0;
            const slaBreached = slaCounts.get(user.id) || 0;
            rows.push([user.fullName, user.email, convCount, msgCount, slaBreached]
                .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        }
        const bom = '\uFEFF';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=agent-report.csv');
        res.send(bom + header + rows.join('\n'));
    }
}
