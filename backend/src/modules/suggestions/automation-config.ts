/**
 * NGUỒN SỰ THẬT DUY NHẤT cho cấu hình automation (auto-reply, SLA).
 *
 * Trước đây `automation-config.json` chỉ được đọc/ghi ở suggestions.controller
 * (phục vụ UI Settings) nhưng KHÔNG được nối vào AutoReplyService — service dùng
 * hằng cứng, nên admin tắt auto-reply trên UI mà bot vẫn tự gửi. File này gom
 * loader + sanitize về một chỗ để controller (UI) và AutoReplyService (runtime)
 * luôn nhìn cùng một cấu hình.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ALL_INTENTS, AUTO_REPLY_INTENTS, Intent, normalizeIntent } from './intents';

export const AUTOMATION_CONFIG_PATH = path.join(process.cwd(), 'automation-config.json');

export interface AutomationConfig {
    slaMinutes: number;
    autoReplyEnabled: boolean;
    autoReplyIntents: string[];
    autoReplyMinConfidence: number;
}

/** Mặc định = hành vi runtime hiện hành (whitelist 5 intent xã giao, ngưỡng 0.8). */
export function automationDefaults(defaultSlaMinutes = 10): AutomationConfig {
    return {
        slaMinutes: defaultSlaMinutes,
        autoReplyEnabled: true,
        autoReplyIntents: [...AUTO_REPLY_INTENTS],
        autoReplyMinConfidence: 0.8,
    };
}

/**
 * Ép cấu hình thô (file/body PUT) về dạng an toàn:
 * - intent lạ bị loại (không âm thầm quy về `chung` — tránh mở rộng auto-reply ngoài ý muốn);
 * - minConfidence kẹp [0..1]; slaMinutes nguyên dương.
 */
export function sanitizeAutomationConfig(
    raw: Partial<AutomationConfig> | undefined,
    defaults: AutomationConfig,
): AutomationConfig {
    const cfg = { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) };

    const sla = Number(cfg.slaMinutes);
    cfg.slaMinutes = Number.isFinite(sla) && sla > 0 ? Math.floor(sla) : defaults.slaMinutes;

    cfg.autoReplyEnabled = cfg.autoReplyEnabled !== false;

    const conf = Number(cfg.autoReplyMinConfidence);
    cfg.autoReplyMinConfidence = Number.isFinite(conf)
        ? Math.min(1, Math.max(0, conf))
        : defaults.autoReplyMinConfidence;

    if (Array.isArray(cfg.autoReplyIntents)) {
        const canonical = new Set<string>(ALL_INTENTS);
        cfg.autoReplyIntents = cfg.autoReplyIntents
            .filter((i): i is string => typeof i === 'string')
            .map(i => (canonical.has(i.trim()) ? i.trim() : normalizeIntent(i)))
            .filter((i, idx, arr) => arr.indexOf(i) === idx)
            // normalizeIntent trả `chung` cho token lạ → chỉ giữ khi admin chọn đúng 'chung'
            .filter((i, _idx, _arr) => i !== Intent.CHUNG || (raw?.autoReplyIntents || []).includes(Intent.CHUNG));
    } else {
        cfg.autoReplyIntents = [...defaults.autoReplyIntents];
    }

    return cfg;
}

/** Đọc file config (nếu có) + sanitize. Lỗi đọc/parse → trả defaults. */
export function loadAutomationConfig(defaultSlaMinutes = 10): AutomationConfig {
    const defaults = automationDefaults(defaultSlaMinutes);
    if (!fs.existsSync(AUTOMATION_CONFIG_PATH)) return defaults;
    try {
        const raw = JSON.parse(fs.readFileSync(AUTOMATION_CONFIG_PATH, 'utf-8'));
        return sanitizeAutomationConfig(raw, defaults);
    } catch {
        return defaults;
    }
}
