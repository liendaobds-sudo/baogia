/**
 * Khóa hành vi: các nhánh "học" của AI (similar-won, memory few-shot, outcome
 * insights, agent-edit learning) phải CÔ LẬP THEO TENANT ở tầng ứng dụng.
 * Lỗi gốc (audit 2026-08-13): các query WON/EDITED không lọc tenant → câu chốt
 * đơn + giá đã báo của xưởng A bị bơm vào prompt trả lời khách của xưởng B.
 *
 * Quy ước fail-closed: tenantId == null (không xác định được) → KHÔNG học,
 * trả context rỗng, không chạy query nào.
 */
import { ConversationSearchService } from './conversation-search.service';
import { AiMemoryService } from './ai-memory.service';
import { OutcomeLearningService } from './outcome-learning.service';
import { AiLearningService } from './ai-learning.service';

const TENANT_A = 7;

function repoMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
    return {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        findByIds: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        createQueryBuilder: jest.fn(),
        ...overrides,
    } as any;
}

function qbMock(result: any[] = []) {
    const qb: any = {};
    for (const m of ['where', 'andWhere', 'orderBy', 'take', 'limit', 'select', 'addSelect', 'groupBy']) {
        qb[m] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue(result);
    qb.getCount = jest.fn().mockResolvedValue(0);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
}

describe('Cô lập tenant — ConversationSearchService', () => {
    it('tenantId null → trả rỗng, KHÔNG query', async () => {
        const dataSource: any = { options: { type: 'postgres' }, query: jest.fn() };
        const embeddings: any = { generateEmbedding: jest.fn() };
        const svc = new ConversationSearchService(repoMock(), repoMock(), repoMock(), dataSource, embeddings);

        const ctx = await svc.buildSimilarConversationContext('namecard', 'in 500 hộp', undefined, null);
        expect(ctx).toBe('');
        expect(dataSource.query).not.toHaveBeenCalled();
        expect(embeddings.generateEmbedding).not.toHaveBeenCalled();
    });

    it('nhánh vector: SQL lọc tenant_id và truyền đúng tham số tenant', async () => {
        const dataSource: any = { options: { type: 'postgres' }, query: jest.fn().mockResolvedValue([]) };
        const embeddings: any = { generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]) };
        const svc = new ConversationSearchService(repoMock(), repoMock(), repoMock(), dataSource, embeddings);

        await svc.buildSimilarConversationContext('namecard', 'in 500 hộp', undefined, TENANT_A);

        expect(dataSource.query).toHaveBeenCalledTimes(1);
        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/tenant_id = \$2/);
        expect(params[1]).toBe(TENANT_A);
    });

    it('nhánh keyword (fallback): query builder có điều kiện tenant', async () => {
        const qb = qbMock([]);
        const convRepo = repoMock({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
        // Không có customerText → đi thẳng nhánh keyword
        const dataSource: any = { options: { type: 'postgres' }, query: jest.fn() };
        const svc = new ConversationSearchService(convRepo, repoMock(), repoMock(), dataSource, { generateEmbedding: jest.fn() } as any);

        await svc.buildSimilarConversationContext('namecard', undefined, undefined, TENANT_A);

        const tenantCall = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('tenant_id'));
        expect(tenantCall).toBeDefined();
        expect(tenantCall[1]).toEqual({ tenantId: TENANT_A });
    });
});

describe('Cô lập tenant — AiMemoryService', () => {
    it('tenantId null → trả rỗng, KHÔNG query', async () => {
        const dataSource: any = { options: { type: 'postgres' }, query: jest.fn() };
        const svc = new AiMemoryService(repoMock(), repoMock(), repoMock(), dataSource, { generateEmbedding: jest.fn() } as any);

        const ctx = await svc.retrieveMemoryContext('hỏi_giá', 'namecard', null);
        expect(ctx).toBe('');
        expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('nhánh vector: SQL lọc tenant_id đúng tham số', async () => {
        const dataSource: any = { options: { type: 'postgres' }, query: jest.fn().mockResolvedValue([]) };
        const embeddings: any = { generateEmbedding: jest.fn().mockResolvedValue([0.3]) };
        const qb = qbMock([]);
        const convRepo = repoMock({ createQueryBuilder: jest.fn().mockReturnValue(qb) });
        const svc = new AiMemoryService(convRepo, repoMock(), repoMock(), dataSource, embeddings);

        await svc.retrieveMemoryContext('hỏi_giá', 'namecard', TENANT_A);

        const [sql, params] = dataSource.query.mock.calls[0];
        expect(sql).toMatch(/tenant_id = \$2/);
        expect(params[1]).toBe(TENANT_A);
        // Vector rỗng → rơi xuống fallback LIKE, fallback cũng phải lọc tenant
        const tenantCall = qb.andWhere.mock.calls.find((c: any[]) => String(c[0]).includes('tenant_id'));
        expect(tenantCall).toBeDefined();
    });
});

describe('Cô lập tenant — OutcomeLearningService', () => {
    it('tenantId null → trả rỗng, KHÔNG query', async () => {
        const convRepo = repoMock();
        const svc = new OutcomeLearningService(convRepo, repoMock());
        const ctx = await svc.buildOutcomeContext('hỏi_giá', 'namecard', null);
        expect(ctx).toBe('');
        expect(convRepo.find).not.toHaveBeenCalled();
    });

    it('insights tính riêng từng tenant (where có tenantId, cache không trộn)', async () => {
        const convRepo = repoMock();
        const svc = new OutcomeLearningService(convRepo, repoMock());

        await svc.getInsights(TENANT_A);
        expect(convRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) }),
        );

        convRepo.find.mockClear();
        // Tenant khác → không dùng cache của tenant A, phải query lại
        await svc.getInsights(TENANT_A + 1);
        expect(convRepo.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A + 1 }) }),
        );

        convRepo.find.mockClear();
        // Cùng tenant trong TTL → dùng cache, không query
        await svc.getInsights(TENANT_A);
        expect(convRepo.find).not.toHaveBeenCalled();
    });
});

describe('Cô lập tenant — AiLearningService', () => {
    it('tenantId null → trả rỗng, KHÔNG query', async () => {
        const suggestRepo = repoMock();
        const svc = new AiLearningService(suggestRepo);
        const ctx = await svc.buildLearningContext('hỏi_giá', null);
        expect(ctx).toBe('');
        expect(suggestRepo.find).not.toHaveBeenCalled();
    });

    it('lọc bản sửa của agent theo tenant', async () => {
        const suggestRepo = repoMock();
        const svc = new AiLearningService(suggestRepo);
        await svc.buildLearningContext('hỏi_giá', TENANT_A);
        for (const call of suggestRepo.find.mock.calls) {
            expect(call[0].where).toEqual(expect.objectContaining({ tenantId: TENANT_A }));
        }
        expect(suggestRepo.find.mock.calls.length).toBeGreaterThan(0);
    });
});
