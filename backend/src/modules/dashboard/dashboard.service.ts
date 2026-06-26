import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, AiSuggestion, Message, SuggestionStatus, KbDocument, KbChunk } from '../../entities';
import { ConversationStatus } from '../../entities/conversation.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { AiProviderService } from '../suggestions/ai-provider.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(AiSuggestion) private sugRepo: Repository<AiSuggestion>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(KbDocument) private kbDocRepo: Repository<KbDocument>,
        @InjectRepository(KbChunk) private kbChunkRepo: Repository<KbChunk>,
        private gateway: EventsGateway,
        private aiProvider: AiProviderService,
    ) { }

    async getKpi(from?: string, to?: string) {
        try {
            // Batch conversation stats with single query
            const convStatusRaw = await this.convRepo
                .createQueryBuilder('c')
                .select('c.status', 'status')
                .addSelect('COUNT(*)', 'count')
                .groupBy('c.status')
                .getRawMany();

            const statusCounts: Record<string, number> = {};
            let totalConversations = 0;
            let openConversations = 0;
            const openStatuses = ['new', 'in_progress', 'waiting_customer'];
            for (const row of convStatusRaw) {
                const cnt = parseInt(row.count, 10);
                statusCounts[row.status] = cnt;
                totalConversations += cnt;
                if (openStatuses.includes(row.status)) openConversations += cnt;
            }

            // Batch message & suggestion counts
            const totalMessages = await this.msgRepo.count();

            // Batch suggestion stats with single query
            const sugStatusRaw = await this.sugRepo
                .createQueryBuilder('s')
                .select('s.status', 'status')
                .addSelect('COUNT(*)', 'count')
                .groupBy('s.status')
                .getRawMany();

            let totalSuggestions = 0;
            let sentAsIs = 0;
            let edited = 0;
            let rejected = 0;
            for (const row of sugStatusRaw) {
                const cnt = parseInt(row.count, 10);
                totalSuggestions += cnt;
                if (row.status === 'sent') sentAsIs = cnt;
                else if (row.status === 'edited') edited = cnt;
                else if (row.status === 'rejected') rejected = cnt;
            }

            let slaBreached = 0;
            try { slaBreached = await this.convRepo.count({ where: { slaBreached: true } }); } catch (e) { /* ignore missing column */ }

            // KB stats
            let kbDocs = 0, kbChunks = 0;
            try {
                kbDocs = await this.kbDocRepo.count();
                kbChunks = await this.kbChunkRepo.count({ where: { isActive: true } });
            } catch (e) {}

            // Avg suggestion latency
            let avgLatency = 0;
            try {
                const latencySugs = await this.sugRepo.find({ select: ['latencyMs'], take: 100, order: { createdAt: 'DESC' } });
                const latencyValid = latencySugs.filter(s => s.latencyMs);
                avgLatency = latencyValid.length > 0
                    ? Math.round(latencyValid.reduce((a, s) => a + (s.latencyMs || 0), 0) / latencyValid.length)
                    : 0;
            } catch (e) {}

            return {
                period: { from: from || 'all', to: to || 'now' },
                conversations: {
                    total: totalConversations,
                    open: openConversations,
                    byStatus: statusCounts,
                },
                messages: { total: totalMessages },
                suggestionUsage: {
                    total: totalSuggestions,
                    sentAsIs,
                    edited,
                    rejected,
                    acceptRate: totalSuggestions ? Math.round(((sentAsIs + edited) / totalSuggestions) * 100) : 0,
                    avgLatencyMs: avgLatency,
                },
                sla: {
                    totalBreaches: slaBreached,
                    complianceRate: totalConversations
                        ? Math.round(((totalConversations - slaBreached) / totalConversations) * 100) : 100,
                },
                knowledgeBase: {
                    documents: kbDocs,
                    chunks: kbChunks,
                },
                system: {
                    onlineAgents: await this.gateway.getOnlineCount(),
                },
            };
        } catch (e: any) {
            this.logger.error(`getKpi error: ${e?.message}`, e?.stack);
            return {
                period: { from: from || 'all', to: to || 'now' },
                conversations: { total: 0, open: 0, byStatus: {} },
                messages: { total: 0 },
                suggestionUsage: { total: 0, sentAsIs: 0, edited: 0, rejected: 0, acceptRate: 0, avgLatencyMs: 0 },
                sla: { totalBreaches: 0, complianceRate: 100 },
                knowledgeBase: { documents: 0, chunks: 0 },
                system: { onlineAgents: 0 },
            };
        }
    }

    async getAiAnalytics() {
        // Top intents
        const intentRaw = await this.sugRepo
            .createQueryBuilder('s')
            .select('s.intent', 'intent')
            .addSelect('COUNT(*)', 'count')
            .where('s.intent IS NOT NULL')
            .groupBy('s.intent')
            .orderBy('count', 'DESC')
            .take(10)
            .getRawMany();

        // Top products from quote results
        const allSugsWithQuotes = await this.sugRepo.find({
            where: {},
            select: ['quoteResult'],
            take: 500,
            order: { createdAt: 'DESC' },
        });
        const productCounts: Record<string, number> = {};
        for (const s of allSugsWithQuotes) {
            const pt = s.quoteResult?.productType;
            if (pt) productCounts[pt] = (productCounts[pt] || 0) + 1;
        }
        const topProducts = Object.entries(productCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([product, count]) => ({ product, count }));

        // Model usage
        const modelRaw = await this.sugRepo
            .createQueryBuilder('s')
            .select('s.model', 'model')
            .addSelect('COUNT(*)', 'count')
            .groupBy('s.model')
            .orderBy('count', 'DESC')
            .getRawMany();

        // Confidence distribution
        const allSugsConf = await this.sugRepo.find({
            select: ['confidence'],
            take: 200,
            order: { createdAt: 'DESC' },
        });
        const confBuckets = { high: 0, medium: 0, low: 0 };
        for (const s of allSugsConf) {
            const c = s.confidence || 0;
            if (c >= 0.8) confBuckets.high++;
            else if (c >= 0.5) confBuckets.medium++;
            else confBuckets.low++;
        }

        // Accept/Reject rates
        const total = await this.sugRepo.count();
        const sent = await this.sugRepo.count({ where: { status: 'sent' as any } });
        const edited = await this.sugRepo.count({ where: { status: 'edited' as any } });
        const rejected = await this.sugRepo.count({ where: { status: 'rejected' as any } });
        const autoReplied = await this.sugRepo.count({ where: { autoReplyEligible: true } });

        // Average response time
        const latencySugs = await this.sugRepo.find({ select: ['latencyMs'], take: 100, order: { createdAt: 'DESC' } });
        const validLatency = latencySugs.filter(s => s.latencyMs);
        const avgLatency = validLatency.length > 0
            ? Math.round(validLatency.reduce((a, s) => a + (s.latencyMs || 0), 0) / validLatency.length)
            : 0;

        return {
            topIntents: intentRaw.map(r => ({ intent: r.intent, count: parseInt(r.count, 10) })),
            topProducts,
            modelUsage: modelRaw.map(r => ({ model: r.model, count: parseInt(r.count, 10) })),
            confidenceDistribution: confBuckets,
            usage: {
                total,
                sent,
                edited,
                rejected,
                autoReplied,
                acceptRate: total ? Math.round(((sent + edited) / total) * 100) : 0,
            },
            performance: {
                avgLatencyMs: avgLatency,
            },
            tokenUsage: await this.getTokenStats(),
        };
    }

    /** Aggregate token usage stats */
    private async getTokenStats() {
        const COST_PER_1M_TOKENS: Record<string, { input: number; output: number }> = {
            'gemini': { input: 0, output: 0 }, // Gemini Flash is free tier
            'openai': { input: 0.15, output: 0.6 }, // GPT-4o-mini pricing (USD per 1M tokens)
            'groq': { input: 0, output: 0 }, // Free tier
            'template': { input: 0, output: 0 },
        };

        const recentSugs = await this.sugRepo.find({
            select: ['tokenUsage', 'model', 'createdAt'],
            take: 500,
            order: { createdAt: 'DESC' },
        });

        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const byModel: Record<string, { prompt: number; completion: number; calls: number }> = {};

        for (const s of recentSugs) {
            if (!s.tokenUsage) continue;
            const p = s.tokenUsage.prompt_tokens || 0;
            const c = s.tokenUsage.completion_tokens || 0;
            totalPromptTokens += p;
            totalCompletionTokens += c;

            const modelKey = (s.model || 'unknown').split('/')[0];
            if (!byModel[modelKey]) byModel[modelKey] = { prompt: 0, completion: 0, calls: 0 };
            byModel[modelKey].prompt += p;
            byModel[modelKey].completion += c;
            byModel[modelKey].calls++;
        }

        // Estimate costs
        let estimatedCostUSD = 0;
        for (const [model, usage] of Object.entries(byModel)) {
            const rates = COST_PER_1M_TOKENS[model] || { input: 0.1, output: 0.3 };
            estimatedCostUSD += (usage.prompt / 1_000_000) * rates.input + (usage.completion / 1_000_000) * rates.output;
        }

        return {
            totalPromptTokens,
            totalCompletionTokens,
            totalTokens: totalPromptTokens + totalCompletionTokens,
            estimatedCostUSD: Math.round(estimatedCostUSD * 10000) / 10000,
            byModel,
        };
    }

    /** System health check — AI providers, DB, real-time status */
    async getHealthCheck() {
        const providers = this.aiProvider.getProviders();
        const circuits = this.aiProvider.getCircuitStatus();

        const providerStatus = providers.map(p => {
            const circuit = circuits[p.name];
            return {
                name: p.name,
                model: p.model,
                status: !circuit || circuit.state === 'closed' ? 'online'
                    : circuit.state === 'half-open' ? 'degraded' : 'offline',
                failures: circuit?.failures || 0,
            };
        });

        // DB check
        let dbStatus = 'online';
        try {
            await this.convRepo.query('SELECT 1');
        } catch {
            dbStatus = 'offline';
        }

        return {
            status: providerStatus.every(p => p.status === 'online') && dbStatus === 'online' ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            services: {
                database: { status: dbStatus },
                aiProviders: providerStatus,
                websocket: {
                    status: 'online',
                    onlineAgents: await this.gateway.getOnlineCount(),
                },
            },
        };
    }

    /** Real hourly message activity for today — compatible with both Postgres and SQLite */
    async getActivityHourly(): Promise<{ hour: string; count: number }[]> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Detect DB type: Postgres uses TO_CHAR, SQLite uses strftime
            const dbType = this.msgRepo.manager.connection.options.type;
            const hourExpr = dbType === 'postgres'
                ? "TO_CHAR(m.created_at, 'HH24')"
                : "strftime('%H', m.created_at)";

            const raw = await this.msgRepo
                .createQueryBuilder('m')
                .select(hourExpr, 'hour')
                .addSelect('COUNT(*)', 'count')
                .where('m.createdAt >= :today', { today: today.toISOString() })
                .groupBy('hour')
                .orderBy('hour', 'ASC')
                .getRawMany();

            // Fill all 24 hours
            const hourMap: Record<string, number> = {};
            for (let h = 0; h < 24; h++) {
                hourMap[String(h).padStart(2, '0')] = 0;
            }
            for (const r of raw) {
                if (r.hour) hourMap[r.hour] = parseInt(r.count, 10);
            }
            return Object.entries(hourMap).map(([hour, count]) => ({ hour, count }));
        } catch (e: unknown) {
            this.logger.error(`getActivityHourly error: ${e instanceof Error ? e.message : e}`);
            return Array.from({ length: 24 }, (_, i) => ({ hour: String(i).padStart(2, '0'), count: 0 }));
        }
    }

    /** KPI trend comparison: this week vs last week */
    async getTrends(): Promise<Record<string, { current: number; previous: number; trend: 'up' | 'down' | 'flat' }>> {
        try {
            const now = new Date();
            const thisWeekStart = new Date(now);
            thisWeekStart.setDate(now.getDate() - 7);
            const lastWeekStart = new Date(now);
            lastWeekStart.setDate(now.getDate() - 14);

            const [convThis, convLast, msgThis, msgLast, sugThis, sugLast] = await Promise.all([
                this.convRepo.createQueryBuilder('c').where('c.createdAt >= :d', { d: thisWeekStart.toISOString() }).getCount(),
                this.convRepo.createQueryBuilder('c').where('c.createdAt >= :d1 AND c.createdAt < :d2', { d1: lastWeekStart.toISOString(), d2: thisWeekStart.toISOString() }).getCount(),
                this.msgRepo.createQueryBuilder('m').where('m.createdAt >= :d', { d: thisWeekStart.toISOString() }).getCount(),
                this.msgRepo.createQueryBuilder('m').where('m.createdAt >= :d1 AND m.createdAt < :d2', { d1: lastWeekStart.toISOString(), d2: thisWeekStart.toISOString() }).getCount(),
                this.sugRepo.createQueryBuilder('s').where('s.createdAt >= :d', { d: thisWeekStart.toISOString() }).getCount(),
                this.sugRepo.createQueryBuilder('s').where('s.createdAt >= :d1 AND s.createdAt < :d2', { d1: lastWeekStart.toISOString(), d2: thisWeekStart.toISOString() }).getCount(),
            ]);

            const calcTrend = (cur: number, prev: number): 'up' | 'down' | 'flat' =>
                cur > prev ? 'up' : cur < prev ? 'down' : 'flat';

            return {
                conversations: { current: convThis, previous: convLast, trend: calcTrend(convThis, convLast) },
                messages: { current: msgThis, previous: msgLast, trend: calcTrend(msgThis, msgLast) },
                suggestions: { current: sugThis, previous: sugLast, trend: calcTrend(sugThis, sugLast) },
            };
        } catch (e: unknown) {
            this.logger.error(`getTrends error: ${e instanceof Error ? e.message : e}`);
            return {
                conversations: { current: 0, previous: 0, trend: 'flat' },
                messages: { current: 0, previous: 0, trend: 'flat' },
                suggestions: { current: 0, previous: 0, trend: 'flat' },
            };
        }
    }
}
