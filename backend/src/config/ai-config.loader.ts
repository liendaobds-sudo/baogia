/**
 * AI Config Loader — nạp key AI từ ai-config.json vào ConfigService lúc khởi động.
 *
 * VẤN ĐỀ: UI Settings lưu key AI vào ai-config.json và set process.env NGAY LÚC LƯU,
 * nhưng sau khi RESTART server, không ai nạp lại → env trống → mọi chỗ đọc
 * `configService.get('GEMINI_API_KEY' | 'AI_PROVIDER_2_KEY' | ...)` (embeddings, rerank,
 * query-expansion, getProviders) đều KHÔNG thấy key → tính năng AI tê liệt / rơi template.
 *
 * GIẢI PHÁP: ConfigModule.forRoot({ load: [loadAiConfigKeys] }) → key có sẵn cho ConfigService.
 * ENV vẫn ƯU TIÊN: chỉ điền key khi process.env chưa có.
 */
import * as fs from 'fs';
import * as path from 'path';

interface AiCfgEntry { provider?: string; apiKey?: string; model?: string; enabled?: boolean; }

export function loadAiConfigKeys(cwd: string = process.cwd()): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        const p = path.join(cwd, 'ai-config.json');
        if (!fs.existsSync(p)) return out;
        const arr = JSON.parse(fs.readFileSync(p, 'utf-8')) as AiCfgEntry[];
        for (const e of Array.isArray(arr) ? arr : []) {
            if (!e?.enabled || !e?.apiKey || !e?.provider) continue;
            const P = String(e.provider).toUpperCase();
            if (!process.env[`${P}_API_KEY`]) out[`${P}_API_KEY`] = e.apiKey;          // env ưu tiên
            if (e.model && !process.env[`${P}_MODEL`]) out[`${P}_MODEL`] = e.model;
            // AI_PROVIDER_2_KEY: key phụ dùng cho embeddings/rerank/query-expansion (Gemini)
            if (e.provider === 'gemini' && !process.env['AI_PROVIDER_2_KEY']) {
                out['AI_PROVIDER_2_KEY'] = e.apiKey;
            }
        }
    } catch { /* file lỗi → bỏ qua, dùng env */ }
    return out;
}
