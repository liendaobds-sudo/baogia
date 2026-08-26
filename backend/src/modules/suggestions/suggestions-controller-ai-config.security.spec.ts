import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { SuggestionsController } from './suggestions.controller';

interface ProviderEntry {
    provider: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    endpoint?: string;
    apiType?: string;
}

describe('SuggestionsController - bảo vệ key AI đã mask', () => {
    const storedKey = 'sk-stored-secret';
    const storedOpenAi: ProviderEntry = {
        provider: 'openai',
        apiKey: storedKey,
        model: 'gpt-4o-mini',
        enabled: true,
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiType: 'openai',
    };

    let storedProviders: ProviderEntry[];
    let testProvider: jest.Mock;
    let controller: SuggestionsController;
    let writeFileSync: jest.SpyInstance;

    beforeEach(() => {
        storedProviders = [{ ...storedOpenAi }];
        testProvider = jest.fn().mockResolvedValue({ ok: true, message: 'ok' });

        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockImplementation(() => (
            JSON.stringify(storedProviders) as any
        ));
        writeFileSync = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        const configService = {
            get: jest.fn(() => ''),
        } as unknown as ConfigService;

        controller = new SuggestionsController(
            {} as any,
            {} as any,
            configService,
            { testProvider } as any,
        );
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_MODEL;
        jest.restoreAllMocks();
    });

    const maskedRequest = (overrides: Partial<ProviderEntry> = {}): ProviderEntry => ({
        ...storedOpenAi,
        apiKey: '••••cret',
        ...overrides,
    });

    it.each([
        ['endpoint', { endpoint: 'https://attacker.example/v1/chat/completions' }],
        ['model', { model: 'gpt-4o' }],
        ['apiType', { apiType: 'gemini' }],
    ])('test từ chối key mask khi %s thay đổi và không gọi provider', async (_field, change) => {
        await expect(controller.testAiProvider(maskedRequest(change))).rejects.toThrow(BadRequestException);
        expect(testProvider).not.toHaveBeenCalled();
    });

    it('test từ chối key mask khi provider không có key đã lưu', async () => {
        await expect(controller.testAiProvider(maskedRequest({ provider: 'unknown-provider' })))
            .rejects.toThrow(BadRequestException);
        expect(testProvider).not.toHaveBeenCalled();
    });

    it('test key mask không bao giờ ghép key đã lưu với endpoint do caller thay đổi', async () => {
        const callerEndpoint = 'https://collector.example/v1/chat/completions';

        await expect(controller.testAiProvider(maskedRequest({ endpoint: callerEndpoint })))
            .rejects.toThrow('hãy nhập API key mới');

        expect(testProvider).not.toHaveBeenCalled();
        expect(testProvider).not.toHaveBeenCalledWith(expect.objectContaining({
            apiKey: storedKey,
            endpoint: callerEndpoint,
        }));
    });

    it('test key mask với identity không đổi dùng nguyên destination đã lưu', async () => {
        await expect(controller.testAiProvider(maskedRequest())).resolves.toEqual({ ok: true, message: 'ok' });

        expect(testProvider).toHaveBeenCalledTimes(1);
        expect(testProvider).toHaveBeenCalledWith({
            provider: storedOpenAi.provider,
            apiKey: storedKey,
            model: storedOpenAi.model,
            endpoint: storedOpenAi.endpoint,
            apiType: storedOpenAi.apiType,
        });
    });

    it('coi preset tường minh và preset bị lược bỏ là cùng destination hiệu dụng', async () => {
        storedProviders = [{
            provider: 'openai',
            apiKey: storedKey,
            model: 'gpt-4o-mini',
            enabled: true,
        }];

        await expect(controller.testAiProvider(maskedRequest())).resolves.toEqual({ ok: true, message: 'ok' });
        expect(testProvider).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: storedKey,
            endpoint: undefined,
            apiType: undefined,
        }));
    });

    it('key mới được phép test destination đã thay đổi', async () => {
        const endpoint = 'https://new-provider.example/v1/chat/completions';

        await expect(controller.testAiProvider(maskedRequest({
            apiKey: 'sk-fresh-key',
            endpoint,
        }))).resolves.toEqual({ ok: true, message: 'ok' });

        expect(testProvider).toHaveBeenCalledWith(expect.objectContaining({
            apiKey: 'sk-fresh-key',
            endpoint,
        }));
    });

    it.each([
        ['endpoint', { endpoint: 'https://attacker.example/v1/chat/completions' }],
        ['model', { model: 'gpt-4o' }],
        ['apiType', { apiType: 'gemini' }],
    ])('save từ chối key mask khi %s thay đổi và không ghi file', (_field, change) => {
        expect(() => controller.saveAiConfig({ providers: [maskedRequest(change)] }))
            .toThrow(BadRequestException);
        expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('save từ chối key mask khi provider không có key đã lưu', () => {
        expect(() => controller.saveAiConfig({ providers: [maskedRequest({
            provider: 'unknown-provider',
        })] })).toThrow(BadRequestException);
        expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('save key mask với identity không đổi giữ nguyên key đã lưu', () => {
        expect(controller.saveAiConfig({ providers: [maskedRequest()] }))
            .toEqual({ success: true, message: 'AI config updated' });

        const saved = JSON.parse(writeFileSync.mock.calls[0][1] as string);
        expect(saved[0]).toEqual(expect.objectContaining({
            provider: storedOpenAi.provider,
            apiKey: storedKey,
            model: storedOpenAi.model,
            endpoint: storedOpenAi.endpoint,
            apiType: storedOpenAi.apiType,
        }));
    });

    it('save từ chối đổi destination nếu không có key mới', () => {
        expect(() => controller.saveAiConfig({ providers: [maskedRequest({
            apiKey: '',
            model: 'gpt-4o',
        })] })).toThrow('hãy nhập API key mới');
        expect(writeFileSync).not.toHaveBeenCalled();
    });

    it('key mới được phép lưu destination đã thay đổi', () => {
        const endpoint = 'https://new-provider.example/v1/chat/completions';

        expect(controller.saveAiConfig({ providers: [maskedRequest({
            apiKey: 'sk-fresh-key',
            endpoint,
        })] })).toEqual({ success: true, message: 'AI config updated' });

        expect(writeFileSync).toHaveBeenCalledTimes(1);
        const saved = JSON.parse(writeFileSync.mock.calls[0][1] as string);
        expect(saved[0]).toEqual(expect.objectContaining({
            apiKey: 'sk-fresh-key',
            endpoint,
        }));
    });
});
