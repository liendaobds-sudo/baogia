import { AiProviderService } from './ai-provider.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

describe('AiProviderService', () => {
    let service: AiProviderService;
    let mockConfigService: Partial<ConfigService>;

    beforeEach(() => {
        mockConfigService = {
            get: jest.fn((key: string, defaultValue?: any) => {
                return process.env[key] !== undefined ? process.env[key] : defaultValue;
            }),
        };
        service = new AiProviderService(mockConfigService as ConfigService);
        // Clear env for clean tests
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_MODEL;
        delete process.env.OPENAI_ENDPOINT;
        delete process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_MODEL;
        delete process.env.GROQ_API_KEY;
        delete process.env.GROQ_MODEL;
        delete process.env.AI_CUSTOM_NAME;
        delete process.env.AI_CUSTOM_KEY;
        delete process.env.AI_CUSTOM_ENDPOINT;
        delete process.env.AI_CUSTOM_MODEL;
        delete process.env.AI_CUSTOM_TYPE;
        // Mặc định: không có ai-config.json để các test env-only giữ nguyên ý nghĩa
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // ─── getProviders ───

    describe('getProviders', () => {
        it('should return empty array when no API keys set', () => {
            expect(service.getProviders()).toHaveLength(0);
        });

        it('should include OpenAI when API key is set', () => {
            process.env.OPENAI_API_KEY = 'sk-test123';
            const providers = service.getProviders();

            expect(providers).toHaveLength(1);
            expect(providers[0].name).toBe('openai');
            expect(providers[0].apiKey).toBe('sk-test123');
        });

        it('should skip placeholder API keys', () => {
            process.env.OPENAI_API_KEY = 'sk-placeholder';
            expect(service.getProviders()).toHaveLength(0);
        });

        it('should include Gemini when API key is set', () => {
            process.env.GEMINI_API_KEY = 'AIza-test';
            const providers = service.getProviders();

            expect(providers).toHaveLength(1);
            expect(providers[0].name).toBe('gemini');
        });

        it('should skip Gemini placeholder keys', () => {
            process.env.GEMINI_API_KEY = 'your-gemini-api-key';
            expect(service.getProviders()).toHaveLength(0);
        });

        it('should return multiple providers in order', () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            process.env.GEMINI_API_KEY = 'AIza-test';
            process.env.GROQ_API_KEY = 'gsk_test';

            const providers = service.getProviders();
            expect(providers).toHaveLength(3);
            expect(providers.map(p => p.name)).toEqual(['openai', 'gemini', 'groq']);
        });

        it('should use custom model from env', () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            process.env.OPENAI_MODEL = 'gpt-4o';

            const providers = service.getProviders();
            expect(providers[0].model).toBe('gpt-4o');
        });

        it('should load provider from ai-config.json when env empty (sau restart)', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'gemini', apiKey: 'AIza-from-file', model: 'gemini-2.0-flash', enabled: true },
                { provider: 'groq', apiKey: 'gsk_disabled', model: 'x', enabled: false },
            ]) as any);

            const providers = service.getProviders();
            expect(providers.map(p => p.name)).toContain('gemini');
            expect(providers.find(p => p.name === 'gemini')!.apiKey).toBe('AIza-from-file');
            // entry enabled=false bị bỏ qua
            expect(providers.map(p => p.name)).not.toContain('groq');
        });

        it('env ưu tiên hơn ai-config.json cho cùng provider', () => {
            process.env.GEMINI_API_KEY = 'AIza-env';
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'gemini', apiKey: 'AIza-file', model: 'gemini-2.0-flash', enabled: true },
            ]) as any);

            const gem = service.getProviders().filter(p => p.name === 'gemini');
            expect(gem).toHaveLength(1);
            expect(gem[0].apiKey).toBe('AIza-env');
        });

        it('should use default model when not specified', () => {
            process.env.OPENAI_API_KEY = 'sk-test';

            const providers = service.getProviders();
            expect(providers[0].model).toBe('gpt-4o-mini');
        });

        // ─── Provider tùy ý (mở rộng) ───

        it('gắn provider preset mới (deepseek) chỉ bằng apiKey', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'deepseek', apiKey: 'sk-deep', enabled: true },
            ]) as any);

            const p = service.getProviders().find(x => x.name === 'deepseek');
            expect(p).toBeDefined();
            expect(p!.apiType).toBe('openai');
            expect(p!.endpoint).toContain('deepseek.com');
            expect(p!.model).toBe('deepseek-chat');
        });

        it('gắn provider LẠ qua ai-config.json với endpoint riêng', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'mycorp-llm', apiKey: 'key-123', model: 'corp-7b', endpoint: 'https://llm.mycorp.vn/v1/chat/completions', enabled: true },
            ]) as any);

            const p = service.getProviders().find(x => x.name === 'mycorp-llm');
            expect(p).toBeDefined();
            expect(p!.endpoint).toBe('https://llm.mycorp.vn/v1/chat/completions');
            expect(p!.apiType).toBe('openai');
            expect(p!.model).toBe('corp-7b');
        });

        it('provider lạ KHÔNG có endpoint → bị bỏ qua', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'unknown-x', apiKey: 'key', enabled: true },
            ]) as any);

            expect(service.getProviders().find(x => x.name === 'unknown-x')).toBeUndefined();
        });

        it('provider lạ với apiType=gemini được tôn trọng', () => {
            jest.spyOn(fs, 'existsSync').mockReturnValue(true);
            jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
                { provider: 'gemini-proxy', apiKey: 'k', endpoint: 'https://proxy.vn/v1beta', apiType: 'gemini', model: 'gemini-1.5-pro', enabled: true },
            ]) as any);

            const p = service.getProviders().find(x => x.name === 'gemini-proxy');
            expect(p!.apiType).toBe('gemini');
        });

        it('gắn provider tùy ý qua ENV (AI_CUSTOM_*)', () => {
            process.env.AI_CUSTOM_NAME = 'my-vllm';
            process.env.AI_CUSTOM_KEY = 'tok';
            process.env.AI_CUSTOM_ENDPOINT = 'http://10.0.0.5:8000/v1/chat/completions';
            process.env.AI_CUSTOM_MODEL = 'qwen2.5-32b';

            const p = service.getProviders().find(x => x.name === 'my-vllm');
            expect(p).toBeDefined();
            expect(p!.endpoint).toBe('http://10.0.0.5:8000/v1/chat/completions');
            expect(p!.model).toBe('qwen2.5-32b');

            delete process.env.AI_CUSTOM_NAME;
            delete process.env.AI_CUSTOM_KEY;
            delete process.env.AI_CUSTOM_ENDPOINT;
            delete process.env.AI_CUSTOM_MODEL;
        });

        it('preset known providers có apiType đúng', () => {
            process.env.OPENAI_API_KEY = 'sk-x';
            process.env.GEMINI_API_KEY = 'AIza-x';
            const providers = service.getProviders();
            expect(providers.find(p => p.name === 'openai')!.apiType).toBe('openai');
            expect(providers.find(p => p.name === 'gemini')!.apiType).toBe('gemini');
        });
    });

    // ─── parseJsonResponse ───

    describe('parseJsonResponse', () => {
        it('should parse valid JSON string', () => {
            const result = service.parseJsonResponse('{"replies": [{"text": "hello"}]}', 'test');
            expect(result.replies[0].text).toBe('hello');
        });

        it('should parse JSON wrapped in markdown code blocks', () => {
            const text = '```json\n{"replies": [{"text": "world"}]}\n```';
            const result = service.parseJsonResponse(text, 'test');
            expect(result.replies[0].text).toBe('world');
        });

        it('should parse JSON wrapped in generic code blocks', () => {
            const text = '```\n{"replies": [{"text": "test"}]}\n```';
            const result = service.parseJsonResponse(text, 'test');
            expect(result.replies[0].text).toBe('test');
        });

        it('should extract JSON object from mixed text', () => {
            const text = 'Here is the response: {"replies": [{"text": "foo"}]} done';
            const result = service.parseJsonResponse(text, 'test');
            expect(result.replies[0].text).toBe('foo');
        });

        it('should throw for completely invalid text', () => {
            expect(() => service.parseJsonResponse('not json at all', 'test')).toThrow();
        });

        it('không log raw provider response khi JSON lỗi', () => {
            const canary = 'Lan 0901234567 lan@example.test sk-live-SECRET';
            const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

            expect(() => service.parseJsonResponse(`not-json ${canary}`, 'test')).toThrow('invalid JSON response');

            const logged = warn.mock.calls.flat().join(' ');
            expect(logged).toContain('responseChars=');
            expect(logged).not.toContain(canary);
            expect(logged).not.toContain('sk-live-SECRET');
        });
    });

    describe('provider error redaction', () => {
        it('không đưa HTTP error body vào Error mà fallback logger có thể ghi', async () => {
            process.env.OPENAI_API_KEY = 'sk-test';
            const provider = service.getProviders().find((item) => item.name === 'openai')!;
            const canary = 'provider echoed prompt Lan 0901234567 sk-live-SECRET';
            jest.spyOn(global, 'fetch').mockResolvedValue({
                ok: false,
                status: 400,
                text: jest.fn().mockResolvedValue(canary),
            } as any);

            await expect(
                (service as any).callOpenAICompatible(provider, 'system prompt', 'user prompt'),
            ).rejects.toThrow('openai API 400');

            try {
                await (service as any).callOpenAICompatible(provider, 'system prompt', 'user prompt');
            } catch (error) {
                expect((error as Error).message).not.toContain(canary);
                expect((error as Error).message).not.toContain('sk-live-SECRET');
            }
        });
    });

    // ─── Circuit Breaker ───

    describe('circuit breaker', () => {
        it('should start with empty circuit status', () => {
            const status = service.getCircuitStatus();
            expect(Object.keys(status)).toHaveLength(0);
        });

        it('should allow calls when circuit is closed (no failures yet)', () => {
            // Initially no circuits are tracked — all providers are available
            const status = service.getCircuitStatus();
            expect(Object.keys(status)).toHaveLength(0); // No circuits = all available
        });
    });

    // ─── callWithFallback ───

    describe('callWithFallback', () => {
        it('should return null when no providers are available', async () => {
            const result = await service.callWithFallback('system', 'user');
            expect(result).toBeNull();
        });
    });
});
