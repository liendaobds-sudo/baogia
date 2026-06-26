import { Controller, Get, Post, Put, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AiSuggestService } from './ai-suggest.service';
import { AiLearningService } from './ai-learning.service';
import * as fs from 'fs';
import * as path from 'path';

const AI_CONFIG_PATH = path.join(process.cwd(), 'ai-config.json');
const AUTOMATION_CONFIG_PATH = path.join(process.cwd(), 'automation-config.json');

interface AutomationConfig {
    slaMinutes: number;
    autoReplyEnabled: boolean;
    autoReplyIntents: string[];
    autoReplyMinConfidence: number;
}

interface AiProviderEntry {
    provider: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    endpoint?: string;   // tùy chọn — provider tùy ý (OpenAI-compatible) khai báo endpoint riêng
    apiType?: string;    // 'openai' (mặc định) | 'gemini'
}

@Controller('suggestions')
@UseGuards(AuthGuard('jwt'))
export class SuggestionsController {
    constructor(
        private aiService: AiSuggestService,
        private learningService: AiLearningService,
        private configService: ConfigService,
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
    saveAiConfig(@Body() body: { providers: AiProviderEntry[] }) {
        const existing = this.loadConfig();

        // For each provider, if the new key is all dots (masked), keep the old key
        const merged = body.providers.map(p => {
            const old = existing.find(e => e.provider === p.provider);
            const isMasked = /^•+.{0,4}$/.test(p.apiKey);
            return {
                provider: p.provider,
                apiKey: isMasked && old ? old.apiKey : p.apiKey,
                model: p.model,
                enabled: p.enabled,
                // Giữ endpoint/apiType cho provider tùy ý (OpenAI-compatible / Gemini-proxy)
                ...(p.endpoint ? { endpoint: p.endpoint } : (old?.endpoint ? { endpoint: old.endpoint } : {})),
                ...(p.apiType ? { apiType: p.apiType } : (old?.apiType ? { apiType: old.apiType } : {})),
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

    // ═══ Automation Config (SLA + Auto-Reply) ═══

    @Get('automation-config')
    getAutomationConfig() {
        return this.loadAutomationConfig();
    }

    @Put('automation-config')
    saveAutomationConfig(@Body() body: Partial<AutomationConfig>) {
        const existing = this.loadAutomationConfig();
        const merged: AutomationConfig = { ...existing, ...body };

        fs.writeFileSync(AUTOMATION_CONFIG_PATH, JSON.stringify(merged, null, 2));

        // Apply immediately
        process.env.SLA_MINUTES = String(merged.slaMinutes);

        return { success: true, config: merged };
    }

    private loadAutomationConfig(): AutomationConfig {
        if (fs.existsSync(AUTOMATION_CONFIG_PATH)) {
            try {
                return JSON.parse(fs.readFileSync(AUTOMATION_CONFIG_PATH, 'utf-8'));
            } catch { /* fallthrough */ }
        }
        return {
            slaMinutes: parseInt(this.configService.get<string>('SLA_MINUTES') || '10', 10),
            autoReplyEnabled: true,
            autoReplyIntents: ['chào_hỏi'],
            autoReplyMinConfidence: 0.8,
        };
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
