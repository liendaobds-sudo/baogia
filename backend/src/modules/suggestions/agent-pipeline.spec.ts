/**
 * AgentPipelineService — test cac chot RESILIENCE (early-return, KHONG cham mang).
 * Run: npx jest agent-pipeline
 */
import { AgentPipelineService } from './agent-pipeline.service';

const mockTool = (name: string): any => ({
    name, description: 'desc', parameters: { type: 'object', properties: {} }, execute: jest.fn(),
});

function build(providerCfg: { getProviders: any; getCircuitStatus: any }) {
    const configService: any = { get: jest.fn() };
    const eventsGateway: any = {
        server: { emit: jest.fn() },
        emitAgentThought: jest.fn(),
    };
    const aiProviderService: any = providerCfg;
    return new AgentPipelineService(
        configService, eventsGateway, aiProviderService,
        mockTool('search_kb'), mockTool('product_info'), mockTool('missing_info'),
        mockTool('similar_conv'), mockTool('outcome_insights'),
    );
}

describe('AgentPipelineService — resilience guards', () => {
    afterEach(() => jest.restoreAllMocks());

    it('không có Gemini provider → fallback (usedAgent=false), không chạm mạng', async () => {
        const svc = build({
            getProviders: jest.fn().mockReturnValue([]),
            getCircuitStatus: jest.fn().mockReturnValue({}),
        });
        const r = await svc.runAgentPipeline('conv1', 'sys', 'user', {});
        expect(r.usedAgent).toBe(false);
        expect(r.steps).toBe(0);
        expect(r.response).toBe('');
    });

    it('circuit Gemini OPEN → bỏ agent pipeline (usedAgent=false), không chạm mạng', async () => {
        const svc = build({
            getProviders: jest.fn().mockReturnValue([
                { name: 'gemini', apiKey: 'k', model: 'm', endpoint: 'https://x' },
            ]),
            getCircuitStatus: jest.fn().mockReturnValue({ gemini: { state: 'open', failures: 3, lastFailure: Date.now() } }),
        });
        const r = await svc.runAgentPipeline('conv1', 'sys', 'user', {});
        expect(r.usedAgent).toBe(false);
        expect(r.steps).toBe(0);
    });

    it('đăng ký đủ 5 tool động', () => {
        const svc: any = build({
            getProviders: jest.fn().mockReturnValue([]),
            getCircuitStatus: jest.fn().mockReturnValue({}),
        });
        expect(svc.toolsMap.size).toBe(5);
    });

    it('agent_thought có tenant đi qua helper tenant-scoped; thiếu tenant bị drop', () => {
        const svc: any = build({
            getProviders: jest.fn().mockReturnValue([]),
            getCircuitStatus: jest.fn().mockReturnValue({}),
        });
        const event = {
            conversationId: 'conv1',
            status: 'thinking',
            tool: 'search_kb',
            message: 'Đang tìm',
        };

        svc.emitAgentThought(7, event);
        svc.emitAgentThought(null, event);

        expect(svc.eventsGateway.emitAgentThought).toHaveBeenCalledTimes(1);
        expect(svc.eventsGateway.emitAgentThought).toHaveBeenCalledWith(7, event);
        expect(svc.eventsGateway.server.emit).not.toHaveBeenCalled();
    });

    it('không log giá trị tool args do LLM tạo ra', async () => {
        const svc: any = build({
            getProviders: jest.fn().mockReturnValue([
                { name: 'gemini', apiKey: 'k', model: 'm', endpoint: 'https://provider.test' },
            ]),
            getCircuitStatus: jest.fn().mockReturnValue({}),
        });
        const canary = 'Lan 0901234567 lan@example.test sk-live-SECRET';
        svc.toolsMap.get('search_kb').execute.mockResolvedValue('safe tool result');
        const log = jest.spyOn(svc.logger, 'log').mockImplementation(() => undefined);
        jest.spyOn(global, 'fetch')
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    candidates: [{ content: { parts: [{ functionCall: { name: 'search_kb', args: { query: canary } } }] } }],
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({
                    candidates: [{ content: { parts: [{ text: 'done' }] } }],
                }),
            } as any);

        const result = await svc.runAgentPipeline('conv1', 'system', 'user', { tenantId: 7 });

        expect(result.usedAgent).toBe(true);
        const logged = log.mock.calls.flat().join(' ');
        expect(logged).toContain('argCount=1');
        expect(logged).not.toContain(canary);
        expect(logged).not.toContain('0901234567');
    });
});
