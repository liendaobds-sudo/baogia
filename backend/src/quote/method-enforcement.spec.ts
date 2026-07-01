/**
 * Enforcement per-endpoint (Task 4.7) — Cờ_Năng_Lực chặn đúng ở mọi Đường_Tính_Giá.
 *
 * Feature: tenant-method-capability
 *
 * Phủ (Req 4.1–4.7, 5.4, 10.2–10.4):
 *  - assertMethodEnabled: phương pháp bị tắt → 403 (ForbiddenException); bật → cho qua.
 *  - assertQuoteTypeEnabled: loại KHÔNG nhận dạng → 400 (BadRequest, tách bạch với 403);
 *    loại hợp lệ nhưng method tắt → 403; hợp lệ + bật → trả methodId.
 *  - QuoteService.calculateMiniQuote: digital tắt → requiresManualQuote (KHÔNG ném 403).
 *  - QuoteService.calculateFromParsed (chatbot): digital tắt → requiresManualQuote.
 *
 * Dùng CapabilityService giả lập (resolveEnabledMethods) để cô lập enforcement khỏi DB.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 5.4, 10.2, 10.3, 10.4
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
    assertMethodEnabled,
    assertQuoteTypeEnabled,
} from './assert-method-enabled';
import { CapabilityService } from './capability.service';
import { QuoteService } from '../modules/quote/quote.service';

/** CapabilityService giả lập: resolveEnabledMethods trả tập chỉ định (theo tenant). */
function fakeCapability(enabled: string[]): CapabilityService {
    return {
        resolveEnabledMethods: async () => [...enabled],
    } as unknown as CapabilityService;
}

/** QuoteService dựng trực tiếp: chỉ pricingApi (health) + capability tham gia enforcement. */
function buildQuoteService(enabled: string[]): QuoteService {
    const pricingApi = { isHealthy: async () => true } as any;
    const nullRepo = {} as any;
    return new QuoteService(
        nullRepo, nullRepo, nullRepo, nullRepo, nullRepo,
        nullRepo, nullRepo, nullRepo, nullRepo,
        pricingApi,
        {} as any, // dataSource
        undefined, // tenantCtx
        fakeCapability(enabled),
    );
}

describe('Enforcement per-endpoint (Task 4.7)', () => {
    // ── assertMethodEnabled (facade digital / offset — Req 4.1, 4.2) ──────────
    describe('assertMethodEnabled', () => {
        it('phương pháp bị tắt → ForbiddenException (403), thông báo chỉ nêu method bị chặn', async () => {
            const cap = fakeCapability(['digital']); // offset tắt
            await expect(assertMethodEnabled(cap, 'offset')).rejects.toBeInstanceOf(
                ForbiddenException,
            );
            await expect(assertMethodEnabled(cap, 'offset')).rejects.toThrow(/offset/);
        });

        it('phương pháp đang bật → cho qua (không ném)', async () => {
            const cap = fakeCapability(['digital', 'offset']);
            await expect(assertMethodEnabled(cap, 'offset')).resolves.toBeUndefined();
        });
    });

    // ── assertQuoteTypeEnabled (/pricing/calculate — Req 4.1, 5.4, 10.2) ──────
    describe('assertQuoteTypeEnabled', () => {
        it('loại sản phẩm KHÔNG nhận dạng → BadRequest (400), tách bạch với 403', async () => {
            const cap = fakeCapability(['digital', 'offset']);
            await expect(
                assertQuoteTypeEnabled(cap, 'khong_ton_tai'),
            ).rejects.toBeInstanceOf(BadRequestException);
        });

        it('loại hợp lệ nhưng method bị tắt → ForbiddenException (403)', async () => {
            const cap = fakeCapability(['offset']); // digital tắt; loose → digital
            await expect(assertQuoteTypeEnabled(cap, 'loose')).rejects.toBeInstanceOf(
                ForbiddenException,
            );
        });

        it('loại hợp lệ + method bật → trả methodId', async () => {
            const cap = fakeCapability(['digital', 'offset']);
            await expect(assertQuoteTypeEnabled(cap, 'to_roi')).resolves.toBe('offset');
            await expect(assertQuoteTypeEnabled(cap, 'loose')).resolves.toBe('digital');
        });
    });

    // ── mini (Req 4.3, 10.3, 10.4) ────────────────────────────────────────────
    describe('QuoteService.calculateMiniQuote', () => {
        it('digital tắt → requiresManualQuote (KHÔNG ném 403)', async () => {
            const svc = buildQuoteService(['offset']); // digital tắt
            const res: any = await svc.calculateMiniQuote({ product_type: 'loose', quantity: 100 });
            expect(res.requiresManualQuote).toBe(true);
            expect(String(res.reason)).toMatch(/digital/);
        });

        it('digital bật nhưng thiếu số lượng → vẫn requiresManualQuote (qua enforcement)', async () => {
            const svc = buildQuoteService(['digital', 'offset']);
            const res: any = await svc.calculateMiniQuote({ product_type: 'loose', quantity: 0 });
            expect(res.requiresManualQuote).toBe(true);
            // Lý do KHÔNG phải do capability (digital đang bật) → là validation số lượng.
            expect(String(res.reason)).not.toMatch(/không khả dụng/);
        });
    });

    // ── chatbot (Req 4.4, 10.3, 10.4) ─────────────────────────────────────────
    describe('QuoteService.calculateFromParsed', () => {
        it('digital tắt → requiresManualQuote với source capability_disabled', async () => {
            const svc = buildQuoteService(['offset']); // digital tắt
            const res = await svc.calculateFromParsed({
                type: 'loose',
                quantity: 100,
                isComplete: true,
            } as any);
            expect(res.requiresManualQuote).toBe(true);
            expect(res.source).toBe('capability_disabled');
            expect(String(res.reason)).toMatch(/digital/);
        });
    });
});
