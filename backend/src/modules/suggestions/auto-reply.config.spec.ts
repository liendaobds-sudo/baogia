/**
 * Khóa hành vi: automation-config.json phải THẬT SỰ điều khiển auto-reply.
 * Lỗi gốc (audit 2026-08-13): AutoReplyService dùng hằng cứng, admin tắt
 * auto-reply trên UI Settings nhưng bot vẫn tự gửi.
 */
import { AutoReplyService } from './auto-reply.service';
import { automationDefaults, sanitizeAutomationConfig } from './automation-config';
import { AUTO_REPLY_INTENTS, Intent } from './intents';
import * as fs from 'fs';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

function makeService(): AutoReplyService {
    const convRepo: any = { findOne: jest.fn(), save: jest.fn() };
    return new AutoReplyService(convRepo);
}

function mockConfigFile(config: object | null): void {
    if (config === null) {
        mockedFs.existsSync.mockReturnValue(false);
        return;
    }
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(config) as any);
}

describe('AutoReplyService + automation-config', () => {
    beforeEach(() => jest.resetAllMocks());

    const eligibleArgs = (intent = Intent.CHAO_HOI): Parameters<AutoReplyService['checkAutoReplyEligibility']> =>
        ['conv-12345678', intent, 0.95, false, 'gemini', null];

    it('mặc định (không có file) — intent xã giao đủ điều kiện như hành vi cũ', () => {
        mockConfigFile(null);
        const svc = makeService();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(true);
    });

    it('autoReplyEnabled=false chặn MỌI auto-gửi, kể cả canned response gắn cờ autoReply', () => {
        mockConfigFile({ autoReplyEnabled: false });
        const svc = makeService();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(false);
        expect(
            svc.checkAutoReplyEligibility('conv-12345678', Intent.CHUNG, 0.1, false, 'template', { autoReply: true }),
        ).toBe(false);
    });

    it('tôn trọng whitelist intent do admin lưu', () => {
        mockConfigFile({ autoReplyEnabled: true, autoReplyIntents: [Intent.CAM_ON] });
        const svc = makeService();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs(Intent.CAM_ON))).toBe(true);
        expect(svc.checkAutoReplyEligibility(...eligibleArgs(Intent.CHAO_HOI))).toBe(false);
    });

    it('tôn trọng ngưỡng confidence do admin lưu', () => {
        mockConfigFile({ autoReplyEnabled: true, autoReplyMinConfidence: 0.99 });
        const svc = makeService();
        // confidence 0.95 < 0.99 → không đủ điều kiện
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(false);
    });

    it('cache config 10s — đổi file rồi clear cache mới nhận giá trị mới', () => {
        mockConfigFile({ autoReplyEnabled: true });
        const svc = makeService();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(true);

        mockConfigFile({ autoReplyEnabled: false });
        // còn cache → vẫn giá trị cũ
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(true);
        svc.testOnly_clearConfigCache();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(false);
    });

    it('file hỏng (JSON lỗi) → rơi về mặc định an toàn (enabled + whitelist chuẩn)', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue('{không phải json' as any);
        const svc = makeService();
        expect(svc.checkAutoReplyEligibility(...eligibleArgs())).toBe(true);
    });
});

describe('sanitizeAutomationConfig', () => {
    const defaults = automationDefaults(10);

    it('loại intent lạ thay vì quy về `chung` (tránh mở rộng auto-reply ngoài ý muốn)', () => {
        const cfg = sanitizeAutomationConfig(
            { autoReplyIntents: ['chào_hỏi', 'intent_không_tồn_tại', 'khiếu_nại'] },
            defaults,
        );
        // 'khiếu_nại' là alias hợp lệ → normalize về 'phàn_nàn'; token lạ bị loại
        expect(cfg.autoReplyIntents).toEqual([Intent.CHAO_HOI, Intent.PHAN_NAN]);
    });

    it('giữ `chung` khi admin chọn tường minh', () => {
        const cfg = sanitizeAutomationConfig({ autoReplyIntents: ['chung'] }, defaults);
        expect(cfg.autoReplyIntents).toEqual([Intent.CHUNG]);
    });

    it('kẹp minConfidence vào [0..1], slaMinutes nguyên dương', () => {
        const cfg = sanitizeAutomationConfig(
            { autoReplyMinConfidence: 7, slaMinutes: -3 } as any,
            defaults,
        );
        expect(cfg.autoReplyMinConfidence).toBe(1);
        expect(cfg.slaMinutes).toBe(10);
    });

    it('mặc định whitelist = AUTO_REPLY_INTENTS (UI và runtime cùng nguồn sự thật)', () => {
        expect(defaults.autoReplyIntents).toEqual(AUTO_REPLY_INTENTS);
    });
});
