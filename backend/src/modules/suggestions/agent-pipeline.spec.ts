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
    const eventsGateway: any = { server: { emit: jest.fn() } };
    const aiProviderService: any = providerCfg;
    return new AgentPipelineService(
        configService, eventsGateway, aiProviderService,
        mockTool('search_kb'), mockTool('product_info'), mockTool('missing_info'),
        mockTool('similar_conv'), mockTool('outcome_insights'),
    );
}

describe('AgentPipelineService — resilience guards', () => {
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
});
