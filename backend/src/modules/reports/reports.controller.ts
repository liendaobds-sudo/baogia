import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus, Message, AiSuggestion, User, SenderType, SuggestionStatus } from '../../entities';
import { Response } from 'express';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private sugRepo: Repository<AiSuggestion>,
        @InjectRepository(User) private userRepo: Repository<User>,
    ) { }

    @Get('agents')
    async agentPerformance(@Query('days') days?: number) {
        const d = Math.min(days || 7, 90);
        const since = new Date(Date.now() - d * 24 * 3600_000);

        // Get all agents
        const users = await this.userRepo.find();
        const userIds = users.map(u => u.id);

        // --- Batch aggregate queries instead of N+1 per user ---

        // 1. Conversations assigned per user (single query)
        const convCountsRaw = await this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .groupBy('c.assignee_id')
            .getRawMany();
        const convCounts = new Map<string, number>(convCountsRaw.map(r => [r.assigneeId, parseInt(r.count, 10)]));

        // 2. Messages sent per agent (single query)
        const msgCountsRaw = await this.msgRepo
            .createQueryBuilder('m')
            .select('m.sender_id', 'senderId')
            .addSelect('COUNT(*)', 'count')
            .where('m.sender_type = :st', { st: SenderType.AGENT })
            .andWhere('m.sender_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .groupBy('m.sender_id')
            .getRawMany();
        const msgCounts = new Map<string, number>(msgCountsRaw.map(r => [r.senderId, parseInt(r.count, 10)]));

        // 3. SLA breached per user — recent 20 conversations each
        //    Use a single query to get recent conversations for all users
        const recentConvs = await this.convRepo
            .createQueryBuilder('c')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .orderBy('c.updated_at', 'DESC')
            .getMany();

        // Group by assignee, take top 20 each
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
    async summary() {
        const totalConvs = await this.convRepo.count();
        const totalMsgs = await this.msgRepo.count();
        const totalSugs = await this.sugRepo.count();
        const breached = await this.convRepo.count({ where: { slaBreached: true } });
        const resolved = await this.convRepo.count({ where: { status: ConversationStatus.CLOSED } });

        return {
            conversations: { total: totalConvs, resolved, breached },
            messages: totalMsgs,
            suggestions: totalSugs,
            slaCompliance: totalConvs > 0 ? Math.round(((totalConvs - breached) / totalConvs) * 100) : 100,
        };
    }

    @Get('export/csv')
    async exportCSV(@Res() res: Response) {
        const users = await this.userRepo.find();
        const userIds = users.map(u => u.id);

        // --- Batch aggregate queries instead of N+1 per user ---

        const convCountsRaw = await this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .groupBy('c.assignee_id')
            .getRawMany();
        const convCounts = new Map<string, number>(convCountsRaw.map(r => [r.assigneeId, parseInt(r.count, 10)]));

        const msgCountsRaw = await this.msgRepo
            .createQueryBuilder('m')
            .select('m.sender_id', 'senderId')
            .addSelect('COUNT(*)', 'count')
            .where('m.sender_type = :st', { st: SenderType.AGENT })
            .andWhere('m.sender_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .groupBy('m.sender_id')
            .getRawMany();
        const msgCounts = new Map<string, number>(msgCountsRaw.map(r => [r.senderId, parseInt(r.count, 10)]));

        const slaCountsRaw = await this.convRepo
            .createQueryBuilder('c')
            .select('c.assignee_id', 'assigneeId')
            .addSelect('COUNT(*)', 'count')
            .where('c.assignee_id IN (:...ids)', { ids: userIds.length ? userIds : ['__none__'] })
            .andWhere('c.sla_breached = :b', { b: true })
            .groupBy('c.assignee_id')
            .getRawMany();
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
