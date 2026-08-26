import { BadRequestException, Controller, Get, Post, Put, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { ConfigService } from '@nestjs/config';
import { AiSuggestService } from './ai-suggest.service';
import { AiLearningService } from './ai-learning.service';
import { AiProviderService, PROVIDER_DEFAULTS } from './ai-provider.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import * as fs from 'fs';
import * as path from 'path';
import {
    AUTOMATION_CONFIG_PATH,
    AutomationConfig,
    automationDefaults,
    loadAutomationConfig,
    sanitizeAutomationConfig,
} from './automation-config';

const AI_CONFIG_PATH = path.join(process.cwd(), 'ai-config.json');

interface AiProviderEntry {
    provider: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    endpoint?: string;   // tùy chọn — provider tùy ý (OpenAI-compatible) khai báo endpoint riêng
    apiType?: string;    // 'openai' (mặc định) | 'gemini'
}

@Controller('suggestions')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class SuggestionsController {
    constructor(
        private aiService: AiSuggestService,
        private learningService: AiLearningService,
        private configService: ConfigService,
        private aiProvider: AiProviderService,
    ) { }

    @Get('conversation/:conversationId')
    getForConversation(@Param('conversationId') conversationId: string) {
        return this.aiService.getForConversation(conversationId);
    }

    @Post('generate')
    generate(@Body() body: { conversationId: string }) {
        return this.aiService.generateSuggestion(body.conversationId);
    }

    @Patch(':id/accept')
    accept(@Param('id') id: string) {
        return this.aiService.acceptSuggestion(id);
    }

    @Patch(':id/reject')
    reject(@Param('id') id: string, @Body() body: { reason?: string }) {
        return this.aiService.rejectSuggestion(id, body.reason);
    }

    @Patch(':id/accept-edited')
    acceptEdited(
        @Param('id') id: string,
        @Body() body: { editedText: string; replyIndex: number },
    ) {
        return this.learningService.recordEdit(id, body.editedText, body.replyIndex);
    }

    @Patch(':id/feedback')
    submitFeedback(
        @Param('id') id: string,
        @Body() body: { feedback: 'up' | 'down' },
    ) {
        return this.learningService.recordFeedback(id, body.feedback);
    }

    @Get('learning-stats')
    getLearningStats() {
        return this.learningService.getStats();
    }

    // ═══ AI Config Management ═══

    @Get('ai-config')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    getAiConfig() {
        const config = this.loadConfig();
        // Mask keys for security — only show last 4 chars
        return config.map(p => ({
            ...p,
            apiKey: p.apiKey ? `${'•'.repeat(Math.max(0, p.apiKey.length - 4))}${p.apiKey.slice(-4)}` : '',
            hasKey: !!p.apiKey,
        }));
    }

    @Put('ai-config')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    saveAiConfig(@Body() body: { providers: AiProviderEntry[] }) {
        // Validate cứng: `providers` phải là mảng — tránh crash ở .map khi body thiếu/sai kiểu.
        if (!body || !Array.isArray(body.providers)) {
            throw new BadRequestException('Body phải có "providers" là mảng.');
        }
        for (const p of body.providers) {
            if (!p || typeof p.provider !== 'string' || !p.provider.trim()) {
                throw new BadRequestException('Mỗi provider phải có trường "provider" hợp lệ.');
            }
        }

        const existing = this.loadConfig();

        // Chặn SSRF/exfil: endpoint tuỳ ý được dùng để dựng URL fetch (kèm Authorization
        // Bearer <apiKey> + nội dung hội thoại). Chỉ cho http/https hợp lệ; từ chối scheme
        // khác (file:/gopher:/…), giá trị không parse được, và host nội bộ.
        for (const p of body.providers) {
            if (p.endpoint) this.assertSafeEndpoint(p.endpoint, p.provider, p.apiType);
        }

        // Chỉ tái sử dụng key đã mask khi toàn bộ identity đích vẫn giữ nguyên.
        // Nếu đổi provider/endpoint/apiType/model thì caller phải gửi key mới để
        // không thể lợi dụng key đang lưu và chuyển nó sang một đích khác.
        const merged = body.providers.map(p => {
            const old = existing.find(e => e.provider === p.provider);
            const isMasked = this.isMaskedKey(p.apiKey);
            const candidate: AiProviderEntry = {
                ...p,
                model: p.model === undefined ? (old?.model || '') : p.model,
                endpoint: p.endpoint || old?.endpoint,
                apiType: p.apiType || old?.apiType,
            };

            if (isMasked) {
                this.assertMaskedKeyCanBeReused(candidate, old);
            } else if (
                old
                && !this.hasSameDestination(candidate, old)
                && (typeof p.apiKey !== 'string' || !p.apiKey.trim())
            ) {
                throw this.freshKeyRequired();
            }

            return {
                provider: p.provider,
                apiKey: isMasked ? old!.apiKey : p.apiKey,
                model: candidate.model,
                enabled: p.enabled,
                // Giữ endpoint/apiType cho provider tùy ý (OpenAI-compatible / Gemini-proxy)
                ...(candidate.endpoint ? { endpoint: candidate.endpoint } : {}),
                ...(candidate.apiType ? { apiType: candidate.apiType } : {}),
            };
        });

        fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(merged, null, 2));

        // Update process.env so AiSuggestService picks up changes immediately
        for (const p of merged) {
            const envKey = `${p.provider.toUpperCase()}_API_KEY`;
            const envModel = `${p.provider.toUpperCase()}_MODEL`;
            if (p.enabled && p.apiKey) {
                process.env[envKey] = p.apiKey;
                if (p.model) process.env[envModel] = p.model;
            } else {
                delete process.env[envKey];
            }
        }

        return { success: true, message: 'AI config updated' };
    }

    /**
     * Test một provider TRƯỚC khi lưu: ping nhẹ để xác thực key + endpoint sống/chết.
     * UI gửi key đã mask (chuỗi bullet) → chỉ dùng lại key và destination đã lưu
     * khi provider/endpoint/apiType/model không đổi.
     */
    @Post('ai-config/test')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    async testAiProvider(@Body() body: AiProviderEntry) {
        if (!body || typeof body.provider !== 'string' || !body.provider.trim()) {
            throw new BadRequestException('Thiếu "provider".');
        }

        if (this.isMaskedKey(body.apiKey)) {
            const stored = this.loadConfig().find(e => e.provider === body.provider);
            const requestedDestination: AiProviderEntry = {
                ...body,
                model: body.model === undefined ? (stored?.model || '') : body.model,
                endpoint: body.endpoint === undefined ? stored?.endpoint : body.endpoint,
                apiType: body.apiType === undefined ? stored?.apiType : body.apiType,
            };
            this.assertMaskedKeyCanBeReused(requestedDestination, stored);

            // Không ghép key thật với bất kỳ trường destination nào do caller gửi.
            // Guard SSRF vẫn được áp trên endpoint đã lưu trước khi gọi provider.
            if (stored!.endpoint) {
                this.assertSafeEndpoint(stored!.endpoint, stored!.provider, stored!.apiType);
            }
            return this.aiProvider.testProvider({
                provider: stored!.provider,
                apiKey: stored!.apiKey,
                model: stored!.model,
                endpoint: stored!.endpoint,
                apiType: stored!.apiType as any,
            });
        }

        if (body.endpoint) this.assertSafeEndpoint(body.endpoint, body.provider, body.apiType);

        return this.aiProvider.testProvider({
            provider: body.provider,
            apiKey: body.apiKey || '',
            model: body.model,
            endpoint: body.endpoint,
            apiType: body.apiType as any,
        });
    }

    // ═══ Automation Config (SLA + Auto-Reply) ═══

    /**
     * Chỉ cho phép endpoint http/https parse được VÀ trỏ tới host công khai.
     * Chặn loopback/private/link-local (SSRF: endpoint được fetch kèm Authorization
     * Bearer <apiKey> + nội dung hội thoại → không được trỏ vào nội bộ/metadata).
     * NGOẠI LỆ: preset `ollama` chạy nội bộ (localhost:11434) là hợp lệ → cho qua.
     */
    private assertSafeEndpoint(endpoint: string, provider?: string, apiType?: string): void {
        let url: URL;
        try {
            url = new URL(endpoint);
        } catch {
            throw new BadRequestException(`Endpoint không hợp lệ: ${endpoint}`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new BadRequestException(`Endpoint chỉ chấp nhận http/https: ${endpoint}`);
        }

        const host = url.hostname.toLowerCase();

        // Ollama chạy cục bộ là hợp lệ — chừa loopback CHỈ cho provider này.
        const isOllama = provider === 'ollama' || apiType === 'ollama';
        if (isOllama && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
            return;
        }

        if (this.isInternalHost(host)) {
            throw new BadRequestException(`Endpoint không được trỏ tới địa chỉ nội bộ: ${endpoint}`);
        }
    }

    /** Nhận diện host nội bộ/riêng tư/metadata cần chặn cho SSRF. */
    private isInternalHost(host: string): boolean {
        if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
            return true;
        }
        // IPv6 loopback / unspecified
        if (host === '::1' || host === '::' || host === '[::1]' || host === '[::]') return true;
        // IPv4 dạng chấm — kiểm dải riêng/loopback/link-local
        const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (m) {
            const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
            if (a === 127) return true;                       // 127.0.0.0/8 loopback
            if (a === 10) return true;                        // 10.0.0.0/8 private
            if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
            if (a === 192 && b === 168) return true;          // 192.168.0.0/16 private
            if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local (metadata 169.254.169.254)
            if (a === 0) return true;                         // 0.0.0.0/8
        }
        return false;
    }

    @Get('automation-config')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    getAutomationConfig() {
        return this.loadAutomationConfig();
    }

    @Put('automation-config')
    @UseGuards(RolesGuard)
    @Roles(UserRole.SUPER_ADMIN)
    saveAutomationConfig(@Body() body: Partial<AutomationConfig>) {
        const existing = this.loadAutomationConfig();
        // Sanitize trước khi ghi — AutoReplyService đọc trực tiếp file này (runtime).
        const merged = sanitizeAutomationConfig(
            { ...existing, ...body },
            automationDefaults(this.defaultSlaMinutes()),
        );

        fs.writeFileSync(AUTOMATION_CONFIG_PATH, JSON.stringify(merged, null, 2));

        // Apply immediately
        process.env.SLA_MINUTES = String(merged.slaMinutes);

        return { success: true, config: merged };
    }

    private defaultSlaMinutes(): number {
        return parseInt(this.configService.get<string>('SLA_MINUTES') || '10', 10);
    }

    // Dùng chung loader với AutoReplyService (automation-config.ts) — UI Settings và
    // runtime auto-reply luôn nhìn cùng một cấu hình, kể cả giá trị mặc định.
    private loadAutomationConfig(): AutomationConfig {
        return loadAutomationConfig(this.defaultSlaMinutes());
    }

    private isMaskedKey(value: unknown): boolean {
        return typeof value === 'string' && /^•+.{0,4}$/.test(value);
    }

    private destinationIdentity(entry: AiProviderEntry): string {
        const defaults = PROVIDER_DEFAULTS[entry.provider];
        return JSON.stringify([
            entry.provider,
            entry.endpoint || defaults?.endpoint || '',
            entry.apiType || defaults?.apiType || 'openai',
            entry.model || defaults?.model || 'gpt-4o-mini',
        ]);
    }

    private hasSameDestination(incoming: AiProviderEntry, stored: AiProviderEntry): boolean {
        return this.destinationIdentity(incoming) === this.destinationIdentity(stored);
    }

    private assertMaskedKeyCanBeReused(
        incoming: AiProviderEntry,
        stored: AiProviderEntry | undefined,
    ): asserts stored is AiProviderEntry {
        if (!stored?.apiKey || !this.hasSameDestination(incoming, stored)) {
            throw this.freshKeyRequired();
        }
    }

    private freshKeyRequired(): BadRequestException {
        return new BadRequestException(
            'Khi thay đổi provider, endpoint, apiType hoặc model, hãy nhập API key mới.',
        );
    }

    private loadConfig(): AiProviderEntry[] {
        // Build from env vars first (source of truth) — các preset phổ biến
        const envProviders: AiProviderEntry[] = [
            { provider: 'openai', apiKey: this.configService.get<string>('OPENAI_API_KEY') || '', model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini', enabled: !!this.configService.get<string>('OPENAI_API_KEY') },
            { provider: 'gemini', apiKey: this.configService.get<string>('GEMINI_API_KEY') || '', model: this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash', enabled: !!this.configService.get<string>('GEMINI_API_KEY') },
            { provider: 'groq', apiKey: this.configService.get<string>('GROQ_API_KEY') || '', model: this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile', enabled: !!this.configService.get<string>('GROQ_API_KEY') },
        ];

        // If file config exists, merge: file overrides env, but if file has no key and env does → use env
        if (fs.existsSync(AI_CONFIG_PATH)) {
            try {
                const fileConfig: AiProviderEntry[] = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf-8'));
                const merged = envProviders.map(envP => {
                    const fileP = fileConfig.find(f => f.provider === envP.provider);
                    if (!fileP) return envP;
                    return {
                        provider: envP.provider,
                        // Use file key if present, otherwise fallback to env key
                        apiKey: fileP.apiKey || envP.apiKey,
                        model: fileP.model || envP.model,
                        // Enabled: if file has key → use file's enabled flag; if only env has key → auto-enable
                        enabled: fileP.apiKey ? fileP.enabled : (!!envP.apiKey),
                        ...(fileP.endpoint ? { endpoint: fileP.endpoint } : {}),
                        ...(fileP.apiType ? { apiType: fileP.apiType } : {}),
                    };
                });
                // Giữ lại provider TÙY Ý chỉ có trong file (không thuộc preset env) → UI vẫn thấy & sửa được
                const extra = fileConfig.filter(f => !envProviders.some(e => e.provider === f.provider));
                return [...merged, ...extra];
            } catch { /* fallthrough */ }
        }

        return envProviders;
    }
}
