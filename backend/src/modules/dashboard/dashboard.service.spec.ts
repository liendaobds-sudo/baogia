/**
 * DashboardService — Unit Tests (mocked TypeORM and dependencies)
 *
 * Tests KPI calculations, AI analytics, and health checks.
 * Run: npx jest --testPathPattern=dashboard.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { Conversation, AiSuggestion, Message, KbDocument, KbChunk } from '../../entities';
import { EventsGateway } from '../gateway/events.gateway';
import { AiProviderService } from '../suggestions/ai-provider.service';

// ─── Mock helpers ───

const mockQueryBuilder = () => {
    const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        getCount: jest.fn().mockResolvedValue(0),
    };
    return qb;
};

const createMockRepo = () => ({
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder()),
    query: jest.fn().mockResolvedValue([{ 1: 1 }]),
    // DashboardService.getActivityHourly đọc manager.connection.options.type để
    // chọn biểu thức giờ (Postgres TO_CHAR vs SQLite strftime). Mock cần có đường
    // dẫn này, nếu không service sẽ ném và rơi vào nhánh catch (trả toàn 0).
    manager: { connection: { options: { type: 'sqlite' } } },
});

const mockGateway = {
    getOnlineCount: jest.fn().mockResolvedValue(5),
};

const mockAiProvider = {
    getProviders: jest.fn().mockReturnValue([
        { name: 'gemini', model: 'gemini-1.5-flash' },
    ]),
    getCircuitStatus: jest.fn().mockReturnValue({
        gemini: { state: 'closed', failures: 0 },
    }),
};

describe('DashboardService', () => {
    let service: DashboardService;
    let convRepo: ReturnType<typeof createMockRepo>;
    let sugRepo: ReturnType<typeof createMockRepo>;
    let msgRepo: ReturnType<typeof createMockRepo>;

    beforeEach(async () => {
        convRepo = createMockRepo();
        sugRepo = createMockRepo();
        msgRepo = createMockRepo();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardService,
                { provide: getRepositoryToken(Conversation), useValue: convRepo },
                { provide: getRepositoryToken(AiSuggestion), useValue: sugRepo },
                { provide: getRepositoryToken(Message), useValue: msgRepo },
                { provide: getRepositoryToken(KbDocument), useValue: createMockRepo() },
                { provide: getRepositoryToken(KbChunk), useValue: createMockRepo() },
                { provide: EventsGateway, useValue: mockGateway },
                { provide: AiProviderService, useValue: mockAiProvider },
            ],
        }).compile();

        service = module.get<DashboardService>(DashboardService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ================================================================
    // getKpi
    // ================================================================

    describe('getKpi', () => {
        it('should calculate KPI statistics correctly', async () => {
            // Mock conv status grouping
            const convQb = mockQueryBuilder();
            convQb.getRawMany.mockResolvedValue([
                { status: 'new', count: '10' },
                { status: 'closed', count: '5' },
            ]);
            convRepo.createQueryBuilder.mockReturnValue(convQb);
            convRepo.count.mockResolvedValue(2); // slaBreached

            // Mock suggestion grouping
            const sugQb = mockQueryBuilder();
            sugQb.getRawMany.mockResolvedValue([
                { status: 'sent', count: '20' },
                { status: 'edited', count: '5' },
                { status: 'rejected', count: '5' },
            ]);
            sugRepo.createQueryBuilder.mockReturnValue(sugQb);

            msgRepo.count.mockResolvedValue(100);

            const result = await service.getKpi();

            expect(result.conversations.total).toBe(15);
            expect(result.conversations.open).toBe(10);
            expect(result.messages.total).toBe(100);
            expect(result.suggestionUsage.total).toBe(30);
            expect(result.suggestionUsage.acceptRate).toBe(83); // (20+5)/30 * 100
            expect(result.sla.complianceRate).toBe(87); // (15-2)/15 * 100
            expect(result.system.onlineAgents).toBe(5);
        });

        it('should handle errors gracefully and return default values', async () => {
            convRepo.createQueryBuilder.mockImplementation(() => {
                throw new Error('DB Error');
            });

            const result = await service.getKpi();
            expect(result.conversations.total).toBe(0);
            expect(result.suggestionUsage.acceptRate).toBe(0);
        });
    });

    // ================================================================
    // getAiAnalytics
    // ================================================================

    describe('getAiAnalytics', () => {
        it('should return aggregated AI analytics', async () => {
            const sugQb = mockQueryBuilder();
            sugQb.getRawMany
                .mockResolvedValueOnce([{ intent: 'greeting', count: '50' }]) // Top intents
                .mockResolvedValueOnce([{ model: 'gemini-1.5-flash', count: '100' }]); // Model usage
            sugRepo.createQueryBuilder.mockReturnValue(sugQb);

            sugRepo.find
                .mockResolvedValueOnce([{ quoteResult: { productType: 'namecard' } }]) // Products
                .mockResolvedValueOnce([{ confidence: 0.9 }, { confidence: 0.6 }]) // Confidence
                .mockResolvedValueOnce([{ latencyMs: 1000 }, { latencyMs: 2000 }, { latencyMs: null }]); // Latency
            // Mock token stats find
            sugRepo.find.mockResolvedValueOnce([
                { tokenUsage: { prompt_tokens: 100, completion_tokens: 50 }, model: 'gemini/flash' }
            ]);

            sugRepo.count
                .mockResolvedValueOnce(100) // total
                .mockResolvedValueOnce(60)  // sent
                .mockResolvedValueOnce(20)  // edited
                .mockResolvedValueOnce(20)  // rejected
                .mockResolvedValueOnce(30); // autoReplied

            const result = await service.getAiAnalytics();

            expect(result.topIntents).toEqual([{ intent: 'greeting', count: 50 }]);
            expect(result.topProducts).toEqual([{ product: 'namecard', count: 1 }]);
            expect(result.modelUsage).toEqual([{ model: 'gemini-1.5-flash', count: 100 }]);
            expect(result.confidenceDistribution).toEqual({ high: 1, medium: 1, low: 0 });
            expect(result.usage.acceptRate).toBe(80); // (60+20)/100 * 100
            expect(result.performance.avgLatencyMs).toBe(1500);
            expect(result.tokenUsage.totalTokens).toBe(150);
        });
    });

    // ================================================================
    // getHealthCheck
    // ================================================================

    describe('getHealthCheck', () => {
        it('should return healthy status when DB and providers are up', async () => {
            const result = await service.getHealthCheck();
            expect(result.status).toBe('healthy');
            expect(result.services.aiProviders[0].status).toBe('online');
            expect(result.services.database.status).toBe('online');
        });

        it('should return degraded status if DB fails', async () => {
            convRepo.query.mockRejectedValue(new Error('Connection lost'));
            const result = await service.getHealthCheck();
            expect(result.status).toBe('degraded');
            expect(result.services.database.status).toBe('offline');
        });

        it('should return degraded status if AI provider is offline', async () => {
            mockAiProvider.getCircuitStatus.mockReturnValue({
                gemini: { state: 'open', failures: 5 },
            });
            const result = await service.getHealthCheck();
            expect(result.status).toBe('degraded');
            expect(result.services.aiProviders[0].status).toBe('offline');
        });
    });

    // ================================================================
    // getActivityHourly
    // ================================================================

    describe('getActivityHourly', () => {
        it('should return 24 items with counts filled', async () => {
            const qb = mockQueryBuilder();
            qb.getRawMany.mockResolvedValue([
                { hour: '09', count: '10' },
                { hour: '14', count: '20' },
            ]);
            msgRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.getActivityHourly();
            expect(result).toHaveLength(24);
            expect(result.find(r => r.hour === '09')?.count).toBe(10);
            expect(result.find(r => r.hour === '14')?.count).toBe(20);
            expect(result.find(r => r.hour === '00')?.count).toBe(0);
        });
    });

    // ================================================================
    // getTrends
    // ================================================================

    describe('getTrends', () => {
        it('should calculate trends correctly', async () => {
            const qbThis = mockQueryBuilder();
            qbThis.getCount.mockResolvedValue(100);
            const qbLast = mockQueryBuilder();
            qbLast.getCount.mockResolvedValue(50);
            
            convRepo.createQueryBuilder
                .mockReturnValueOnce(qbThis)
                .mockReturnValueOnce(qbLast);

            msgRepo.createQueryBuilder
                .mockReturnValueOnce(qbLast) // This week = 50
                .mockReturnValueOnce(qbThis); // Last week = 100

            sugRepo.createQueryBuilder
                .mockReturnValueOnce(qbThis) // This week = 100
                .mockReturnValueOnce(qbThis); // Last week = 100

            const result = await service.getTrends();
            expect(result.conversations.trend).toBe('up');
            expect(result.messages.trend).toBe('down');
            expect(result.suggestions.trend).toBe('flat');
        });
    });
});
