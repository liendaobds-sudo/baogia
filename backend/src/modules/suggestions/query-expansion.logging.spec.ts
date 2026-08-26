import { QueryExpansionService } from './query-expansion.service';

describe('QueryExpansionService safe logging', () => {
    let service: QueryExpansionService;
    let logger: { log: jest.Mock; warn: jest.Mock };

    beforeEach(() => {
        service = new QueryExpansionService(
            { getKnowledgeData: () => ({ products: {} }) } as any,
            { get: () => 'fake-gemini-key' } as any,
        );
        logger = { log: jest.fn(), warn: jest.fn() };
        (service as any).logger = logger;
    });

    afterEach(() => jest.restoreAllMocks());

    it('không log raw customer query khi synonym expansion chạy', () => {
        const canary = 'Lan 0901234567 lan@example.test cần in tem nhãn';

        const queries = service.expandQuery(canary);

        expect(queries.length).toBeGreaterThan(1);
        const logged = logger.log.mock.calls.flat().join(' ');
        expect(logged).toContain(`customerTextChars=${canary.length}`);
        expect(logged).not.toContain(canary);
        expect(logged).not.toContain('0901234567');
    });

    it('không log raw provider reformulation', async () => {
        const input = 'Khách Lan 0901234567 cần tư vấn in tem nhãn số lượng lớn và giao gấp trong tuần này';
        const providerText = 'in tem nhãn cho Lan 0901234567';
        jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                candidates: [{ content: { parts: [{ text: providerText }] } }],
            }),
        } as any);

        const result = await service.reformulateWithLLM(input);

        expect(result).toBe(providerText);
        const logged = logger.log.mock.calls.flat().join(' ');
        expect(logged).toContain(`queryChars=${providerText.length}`);
        expect(logged).not.toContain(providerText);
        expect(logged).not.toContain('0901234567');
    });
});
