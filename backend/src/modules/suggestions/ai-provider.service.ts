/**
 * AI Provider Service
 * Manages multi-provider AI calls with circuit breaker pattern.
 * Supports: Gemini, OpenAI, Groq (OpenAI-compatible), Ollama.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ALL_INTENTS } from './intents';
import { safeErrorMetadata, sensitiveTextMetadata } from '../../common/logging/safe-log-metadata';

// ── Multi-provider AI config ──
// `name` là chuỗi tự do: ngoài preset bên dưới, có thể gắn BẤT KỲ provider nào
// (OpenAI-compatible hoặc Gemini-native) qua ai-config.json bằng cách khai báo endpoint riêng.
export type AiProvider = string;

// Cách gọi API: 'openai' = chuẩn /chat/completions (đa số) | 'gemini' = Google native generateContent
export type AiApiType = 'openai' | 'gemini';

export interface ProviderConfig {
    name: AiProvider;
    apiKey: string;
    model: string;
    endpoint: string;
    apiType: AiApiType;
}

// Preset cho các nhà cung cấp phổ biến — chỉ cần apiKey là chạy.
// Provider KHÔNG có trong danh sách này vẫn dùng được nếu khai báo `endpoint` trong ai-config.json.
export const PROVIDER_DEFAULTS: Record<string, { model: string; endpoint: string; apiType: AiApiType }> = {
    openai:     { model: 'gpt-4o-mini',                              endpoint: 'https://api.openai.com/v1/chat/completions',          apiType: 'openai' },
    gemini:     { model: 'gemini-2.0-flash',                         endpoint: 'https://generativelanguage.googleapis.com/v1beta',    apiType: 'gemini' },
    groq:       { model: 'llama-3.3-70b-versatile',                  endpoint: 'https://api.groq.com/openai/v1/chat/completions',     apiType: 'openai' },
    openrouter: { model: 'meta-llama/llama-3.3-70b-instruct',        endpoint: 'https://openrouter.ai/api/v1/chat/completions',       apiType: 'openai' },
    together:   { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',  endpoint: 'https://api.together.xyz/v1/chat/completions',        apiType: 'openai' },
    deepseek:   { model: 'deepseek-chat',                            endpoint: 'https://api.deepseek.com/v1/chat/completions',        apiType: 'openai' },
    mistral:    { model: 'mistral-small-latest',                     endpoint: 'https://api.mistral.ai/v1/chat/completions',          apiType: 'openai' },
    xai:        { model: 'grok-2-latest',                            endpoint: 'https://api.x.ai/v1/chat/completions',                apiType: 'openai' },
    ollama:     { model: 'qwen2.5:7b',                               endpoint: 'http://localhost:11434/v1/chat/completions',          apiType: 'openai' },
};

const DEFAULT_API_TYPE: AiApiType = 'openai';
const DEFAULT_MODEL = 'gpt-4o-mini';

// ── Circuit Breaker State ──
interface CircuitState {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
}

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class AiProviderService {
    private readonly logger = new Logger(AiProviderService.name);
    private circuits = new Map<string, CircuitState>();
    // Cache cho ai-config.json (key luu qua UI Settings) — tranh doc file moi lan goi.
    private fileProvidersCache: { at: number; data: ProviderConfig[] } | null = null;
    private readonly FILE_CACHE_TTL = 10_000;

    constructor(private configService: ConfigService) {}

    /**
     * Doc provider tu ai-config.json (mang {provider, apiKey, model, enabled}).
     * Day la noi UI Settings luu key. Doc o day de sau khi RESTART server, LLM van
     * duoc dung ngay — khong phai vao UI luu lai (truoc day env trong => roi xuong template).
     */
    private getFileProviders(): ProviderConfig[] {
        const now = Date.now();
        if (this.fileProvidersCache && now - this.fileProvidersCache.at < this.FILE_CACHE_TTL) {
            return this.fileProvidersCache.data;
        }
        let data: ProviderConfig[] = [];
        try {
            const p = path.join(process.cwd(), 'ai-config.json');
            if (fs.existsSync(p)) {
                const arr = JSON.parse(fs.readFileSync(p, 'utf-8'));
                for (const e of Array.isArray(arr) ? arr : []) {
                    if (!e?.enabled || !e?.apiKey || !e?.provider) continue;
                    const def = PROVIDER_DEFAULTS[e.provider];
                    // Provider lạ vẫn dùng được nếu khai báo endpoint riêng; ngược lại phải có preset.
                    const endpoint = e.endpoint || def?.endpoint;
                    if (!endpoint) {
                        this.logger.warn(`⚠️ Provider "${e.provider}" không có preset và thiếu "endpoint" → bỏ qua`);
                        continue;
                    }
                    const apiType: AiApiType = e.apiType || e.type || def?.apiType || DEFAULT_API_TYPE;
                    const model = e.model || def?.model || DEFAULT_MODEL;
                    data.push({ name: e.provider, apiKey: e.apiKey, model, endpoint, apiType });
                }
            }
        } catch (err: any) {
            this.logger.warn(`⚠️ Không đọc được ai-config.json: ${err.message}`);
        }
        this.fileProvidersCache = { at: now, data };
        return data;
    }

    /**
     * Get ordered list of available AI providers from env (ưu tiên) + ai-config.json (fallback)
     */
    getProviders(): ProviderConfig[] {
        const providers: ProviderConfig[] = [];
        const seen = new Set<string>();
        const add = (name: AiProvider, apiKey?: string, model?: string, endpoint?: string, apiType?: AiApiType) => {
            if (!apiKey || seen.has(name)) return;
            const def = PROVIDER_DEFAULTS[name];
            const ep = endpoint || def?.endpoint;
            if (!ep) return; // provider lạ qua env phải có endpoint
            providers.push({
                name,
                apiKey,
                model: model || def?.model || DEFAULT_MODEL,
                endpoint: ep,
                apiType: apiType || def?.apiType || DEFAULT_API_TYPE,
            });
            seen.add(name);
        };

        // 1) ENV (nguồn ưu tiên)
        const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (openaiKey && openaiKey !== 'sk-placeholder') {
            add('openai', openaiKey, this.configService.get<string>('OPENAI_MODEL'), this.configService.get<string>('OPENAI_ENDPOINT'));
        }
        const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
        if (geminiKey && geminiKey !== 'placeholder' && geminiKey !== 'your-gemini-api-key') {
            add('gemini', geminiKey, this.configService.get<string>('GEMINI_MODEL'));
        }
        const groqKey = this.configService.get<string>('GROQ_API_KEY');
        if (groqKey && groqKey !== 'placeholder' && groqKey !== 'gsk_your-groq-key') {
            add('groq', groqKey, this.configService.get<string>('GROQ_MODEL'));
        }

        // 1b) Provider TÙY Ý qua ENV: AI_CUSTOM_NAME + AI_CUSTOM_KEY (+ AI_CUSTOM_ENDPOINT/MODEL/TYPE)
        // Cho phép gắn nhanh một API bất kỳ mà không cần sửa code.
        const customName = this.configService.get<string>('AI_CUSTOM_NAME');
        const customKey = this.configService.get<string>('AI_CUSTOM_KEY');
        if (customName && customKey) {
            add(
                customName,
                customKey,
                this.configService.get<string>('AI_CUSTOM_MODEL'),
                this.configService.get<string>('AI_CUSTOM_ENDPOINT'),
                this.configService.get<string>('AI_CUSTOM_TYPE') as AiApiType,
            );
        }

        // 2) ai-config.json (fallback — key lưu qua UI, còn sau restart; hỗ trợ provider tùy ý có endpoint riêng)
        for (const fp of this.getFileProviders()) {
            add(fp.name, fp.apiKey, fp.model, fp.endpoint, fp.apiType);
        }

        return providers;
    }

    /**
     * Call AI with provider fallback chain + circuit breaker
     * Returns { result, usedModel } or null if all fail
     */
    async callWithFallback(
        systemPrompt: string,
        userPrompt: string,
    ): Promise<{ result: any; usedModel: string; tokenUsage?: { prompt_tokens: number; completion_tokens: number } } | null> {
        const providers = this.getProviders();
        this.logger.log(`📡 Available providers: ${providers.map(p => p.name).join(', ') || 'NONE'}`);

        for (const provider of providers) {
            // Circuit breaker check
            if (!this.isProviderAvailable(provider.name)) {
                this.logger.warn(`⚡ Circuit OPEN for ${provider.name} — skipping`);
                continue;
            }

            let currentPrompt = userPrompt;
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const { result, tokenUsage } = await this.callAI(provider, systemPrompt, currentPrompt);
                    this.recordSuccess(provider.name);
                    this.logger.log(`✅ AI call succeeded with ${provider.name} (${provider.model}) on attempt ${attempt}` +
                        (tokenUsage ? ` [tokens: ${tokenUsage.prompt_tokens}+${tokenUsage.completion_tokens}]` : ''));
                    return { result, usedModel: `${provider.name}/${provider.model}`, tokenUsage };
                } catch (err: any) {
                    this.logger.warn(
                        `⚠️ ${provider.name} attempt ${attempt} failed (${safeErrorMetadata(err)})` +
                        `${attempt < 2 ? ', retrying...' : ', trying next provider...'}`,
                    );
                    
                    // claw-code pattern: Adjust prompt on structured output failure
                    if (err.message.includes('invalid JSON response') || err.message.includes('could not parse JSON')) {
                        currentPrompt = `${userPrompt}\n\n[System Warning]: Dữ liệu trả về lần trước bị lỗi cấu trúc JSON. Bắt buộc bỏ Markdown, chỉ trả về chuỗi JSON hợp lệ.`;
                    }
                    
                    this.recordFailure(provider.name);
                    if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
                }
            }
        }

        return null;
    }

    // ── Circuit Breaker ──

    private isProviderAvailable(providerName: string): boolean {
        const circuit = this.circuits.get(providerName);
        if (!circuit) return true;

        if (circuit.state === 'closed') return true;

        if (circuit.state === 'open') {
            // Check if cooldown has passed
            if (Date.now() - circuit.lastFailure >= CIRCUIT_COOLDOWN_MS) {
                circuit.state = 'half-open';
                this.logger.log(`🔄 Circuit HALF-OPEN for ${providerName} — allowing test request`);
                return true;
            }
            return false;
        }

        // half-open: allow one request
        return true;
    }

    private recordSuccess(providerName: string): void {
        const circuit = this.circuits.get(providerName);
        if (circuit) {
            circuit.failures = 0;
            circuit.state = 'closed';
        }
    }

    private recordFailure(providerName: string): void {
        let circuit = this.circuits.get(providerName);
        if (!circuit) {
            circuit = { failures: 0, lastFailure: 0, state: 'closed' };
            this.circuits.set(providerName, circuit);
        }

        circuit.failures++;
        circuit.lastFailure = Date.now();

        if (circuit.state === 'half-open') {
            // Half-open test failed → back to open
            circuit.state = 'open';
            this.logger.warn(`🔴 Circuit re-OPENED for ${providerName} (half-open test failed)`);
        } else if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD) {
            circuit.state = 'open';
            this.logger.warn(`🔴 Circuit OPENED for ${providerName} (${circuit.failures} consecutive failures)`);
        }
    }

    /**
     * Get circuit breaker status (for diagnostics)
     */
    getCircuitStatus(): Record<string, CircuitState> {
        const result: Record<string, CircuitState> = {};
        this.circuits.forEach((v, k) => result[k] = { ...v });
        return result;
    }

    // ── Provider-specific API calls ──

    private async callAI(provider: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<{ result: any; tokenUsage?: { prompt_tokens: number; completion_tokens: number } }> {
        // Định tuyến theo apiType, KHÔNG theo tên — nhờ vậy mọi provider mới chỉ cần khai báo apiType.
        if (provider.apiType === 'gemini') {
            return this.callGemini(provider, systemPrompt, userPrompt);
        }
        return this.callOpenAICompatible(provider, systemPrompt, userPrompt);
    }

    /**
     * OpenAI-compatible API call (works for OpenAI, Groq, Together, etc.)
     */
    private async callOpenAICompatible(provider: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<{ result: any; tokenUsage?: { prompt_tokens: number; completion_tokens: number } }> {
        const isOllama = provider.endpoint.includes('11434') || provider.apiKey === 'ollama';
        const isQwen = provider.model.includes('qwen');
        const systemContent = (isQwen ? '/no_think\n' : '') + systemPrompt;

        const body: any = {
            model: provider.model,
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 1000,
        };

        if (!isOllama) {
            body.response_format = { type: 'json_object' };
        }

        const response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(isOllama ? 60000 : 30000),
        });

        if (!response.ok) {
            // Drain body nhưng không đưa provider response vào Error/log: response có thể echo prompt/PII.
            await response.text().catch(() => '');
            throw new Error(`${provider.name} API ${response.status}`);
        }

        let data: any;
        try {
            data = await response.json();
        } catch {
            throw new Error(`${provider.name}: invalid response envelope`);
        }
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(`${provider.name}: empty response`);

        // Extract token usage
        const tokenUsage = data.usage ? {
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
        } : undefined;

        return { result: this.parseJsonResponse(content, provider.name), tokenUsage };
    }

    /**
     * Google Gemini API call (different format from OpenAI)
     */
    private async callGemini(provider: ProviderConfig, systemPrompt: string, userPrompt: string): Promise<{ result: any; tokenUsage?: { prompt_tokens: number; completion_tokens: number } }> {
        const url = `${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [
                    { role: 'user', parts: [{ text: userPrompt }] },
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 800,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            replies: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string' },
                                        label: { type: 'string' },
                                    },
                                    required: ['text', 'label'],
                                },
                            },
                            sources: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        doc: { type: 'string' },
                                        section: { type: 'string' },
                                    },
                                },
                            },
                            missing_info: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        slot: { type: 'string' },
                                        question: { type: 'string' },
                                    },
                                },
                            },
                            intent: { type: 'string', enum: ALL_INTENTS },
                            sentiment: { type: 'integer' },
                            confidence: { type: 'number' },
                            parsed_quote: {
                                type: 'object',
                                properties: {
                                    material_id: { type: 'integer' },
                                    paper_size_id: { type: 'integer' },
                                    quantity: { type: 'integer' },
                                    width: { type: 'number' },
                                    height: { type: 'number' },
                                    print_side: { type: 'string' },
                                    processing_ids: {
                                        type: 'array',
                                        items: { type: 'integer' }
                                    }
                                }
                            }
                        },
                        required: ['replies', 'intent', 'confidence'],
                    },
                },
            }),
            signal: AbortSignal.timeout(45000),
        });

        if (!response.ok) {
            // Không log body lỗi vì provider/proxy có thể trả lại prompt, API key hoặc PII.
            await response.text().catch(() => '');
            this.logger.warn(`⚠️ Gemini API failed: status=${response.status}`);
            throw new Error(`Gemini API ${response.status}`);
        }

        let data: any;
        try {
            data = await response.json();
        } catch {
            throw new Error('Gemini: invalid response envelope');
        }

        // Extract Gemini token usage BEFORE safety check (safety-filtered calls still consume tokens)
        const usage = data.usageMetadata;
        const tokenUsage = usage ? {
            prompt_tokens: usage.promptTokenCount || 0,
            completion_tokens: usage.candidatesTokenCount || 0,
        } : undefined;

        // Safety-filtered response → graceful escalation
        if (data.candidates?.[0]?.finishReason === 'SAFETY') {
            this.logger.warn('⚠️ Gemini: response blocked by safety filter — returning escalation');
            return {
                result: {
                    replies: [{ text: 'Dạ em ghi nhận ý kiến của bạn. Em sẽ chuyển thông tin để quản lý xem xét và phản hồi bạn sớm nhất ạ. 🙏', label: '🚨 Chuyển quản lý' }],
                    missing_info: [],
                    intent: 'phàn_nàn',
                    sentiment: 1,
                    confidence: 0.9,
                    warnings: ['⚠️ Tin nhắn chứa nội dung mạnh — đã tự động chuyển quản lý.'],
                },
                tokenUsage,
            };
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            const candidateCount = Array.isArray(data?.candidates) ? data.candidates.length : 0;
            this.logger.warn(`⚠️ Gemini: empty response (candidateCount=${candidateCount})`);
            throw new Error('Gemini: empty response');
        }

        return { result: this.parseJsonResponse(text, 'gemini'), tokenUsage };
    }

    /**
     * Parse JSON from AI response text (handles markdown code blocks)
     */
    parseJsonResponse(text: string, provider: string): any {
        // Try direct JSON parse first
        try { return JSON.parse(text); } catch { /* continue */ }

        // Extract JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
            text.match(/(\{[\s\S]*\})/);
        if (jsonMatch?.[1]) {
            try { return JSON.parse(jsonMatch[1].trim()); } catch { /* continue */ }
        }
        this.logger.warn(
            `⚠️ ${provider}: could not parse JSON from response (${sensitiveTextMetadata('response', text)})`,
        );
        throw new Error(`${provider}: invalid JSON response`);
    }

    /**
     * Test một provider có sống không: ping nhẹ (1 token) để xác thực key + endpoint
     * TRƯỚC khi lưu. Trả { ok, message } thay vì ném — caller (UI) hiển thị trực tiếp.
     * KHÔNG đi qua pipeline JSON/parse — chỉ cần HTTP 2xx là coi như key hợp lệ.
     */
    async testProvider(cfg: { provider: string; apiKey: string; model?: string; endpoint?: string; apiType?: AiApiType }): Promise<{ ok: boolean; message: string }> {
        if (!cfg.apiKey) return { ok: false, message: 'Thiếu API key' };
        const def = PROVIDER_DEFAULTS[cfg.provider];
        const endpoint = cfg.endpoint || def?.endpoint;
        if (!endpoint) return { ok: false, message: 'Provider lạ cần khai báo endpoint' };
        const apiType: AiApiType = cfg.apiType || def?.apiType || DEFAULT_API_TYPE;
        const model = cfg.model || def?.model || DEFAULT_MODEL;

        try {
            if (apiType === 'gemini') {
                const url = `${endpoint}/models/${model}:generateContent?key=${cfg.apiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                        generationConfig: { maxOutputTokens: 1 },
                    }),
                    signal: AbortSignal.timeout(10000),
                });
                if (!res.ok) {
                    const t = await res.text();
                    return { ok: false, message: `HTTP ${res.status}: ${t.substring(0, 120)}` };
                }
                return { ok: true, message: `✅ ${cfg.provider} (${model}) phản hồi tốt` };
            }

            // OpenAI-compatible
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) {
                const t = await res.text();
                return { ok: false, message: `HTTP ${res.status}: ${t.substring(0, 120)}` };
            }
            return { ok: true, message: `✅ ${cfg.provider} (${model}) phản hồi tốt` };
        } catch (err: any) {
            const msg = err?.name === 'TimeoutError' ? 'Hết thời gian chờ (10s)' : (err?.message || 'Lỗi kết nối');
            return { ok: false, message: `❌ ${msg}` };
        }
    }
}
