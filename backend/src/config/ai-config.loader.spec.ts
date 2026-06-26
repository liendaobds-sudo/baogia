import { loadAiConfigKeys } from './ai-config.loader';
import * as fs from 'fs';

describe('loadAiConfigKeys', () => {
    const ENV_KEYS = [
        'GEMINI_API_KEY', 'GEMINI_MODEL',
        'OPENAI_API_KEY', 'OPENAI_MODEL',
        'GROQ_API_KEY', 'GROQ_MODEL',
        'AI_PROVIDER_2_KEY',
    ];

    beforeEach(() => {
        for (const k of ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
        jest.restoreAllMocks();
        for (const k of ENV_KEYS) delete process.env[k];
    });

    it('trả về object rỗng khi không có ai-config.json', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        expect(loadAiConfigKeys()).toEqual({});
    });

    it('nạp GEMINI_API_KEY + AI_PROVIDER_2_KEY từ entry gemini enabled', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
            { provider: 'gemini', apiKey: 'AIza-file', model: 'gemini-2.0-flash', enabled: true },
        ]) as any);

        const out = loadAiConfigKeys();
        expect(out.GEMINI_API_KEY).toBe('AIza-file');
        expect(out.GEMINI_MODEL).toBe('gemini-2.0-flash');
        expect(out.AI_PROVIDER_2_KEY).toBe('AIza-file');
    });

    it('bỏ qua entry enabled=false', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
            { provider: 'groq', apiKey: 'gsk_disabled', model: 'x', enabled: false },
        ]) as any);

        expect(loadAiConfigKeys()).toEqual({});
    });

    it('bỏ qua entry thiếu apiKey hoặc provider', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
            { provider: 'openai', enabled: true },
            { apiKey: 'sk-x', enabled: true },
        ]) as any);

        expect(loadAiConfigKeys()).toEqual({});
    });

    it('ENV ưu tiên — không đè key đã có trong process.env', () => {
        process.env.GEMINI_API_KEY = 'AIza-env';
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
            { provider: 'gemini', apiKey: 'AIza-file', model: 'gemini-2.0-flash', enabled: true },
        ]) as any);

        const out = loadAiConfigKeys();
        expect(out.GEMINI_API_KEY).toBeUndefined();
        // AI_PROVIDER_2_KEY vẫn nạp vì env chưa có
        expect(out.AI_PROVIDER_2_KEY).toBe('AIza-file');
    });

    it('nạp nhiều provider cùng lúc', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([
            { provider: 'openai', apiKey: 'sk-x', model: 'gpt-4o', enabled: true },
            { provider: 'groq', apiKey: 'gsk_y', enabled: true },
        ]) as any);

        const out = loadAiConfigKeys();
        expect(out.OPENAI_API_KEY).toBe('sk-x');
        expect(out.OPENAI_MODEL).toBe('gpt-4o');
        expect(out.GROQ_API_KEY).toBe('gsk_y');
    });

    it('file JSON lỗi → trả object rỗng (không ném)', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('{ broken json' as any);

        expect(loadAiConfigKeys()).toEqual({});
    });

    it('JSON không phải mảng → trả object rỗng', () => {
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ provider: 'gemini' }) as any);

        expect(loadAiConfigKeys()).toEqual({});
    });
});
