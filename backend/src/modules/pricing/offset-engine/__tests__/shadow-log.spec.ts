/**
 * Smoke / example test cho Shadow_Mode log (mock logger).
 *
 * Xác nhận hành vi quan sát được của Shadow_Mode ở `resolveSoCon`:
 *   - Khi `ShadowMode` BẬT: selector tính CẢ HAI nguồn (Legacy_Grid + Imposition_Service),
 *     đính `meta.shadow` chứa số con của cả hai phương pháp (legacy/unified) và `deltaToLon`,
 *     đồng thời GHI LOG so sánh qua `Logger` để phân tích chênh lệch.
 *   - Khi `ShadowMode` TẮT: KHÔNG đính `shadow` và KHÔNG ghi log so sánh.
 *
 * Đây là ca CỤ THỂ (example-based), bổ trợ Property 9 (shadow không đổi giá): ở đây ta mock
 * `Logger` để kiểm tra trực tiếp Req 5.1 (tính cả hai nguồn) và Req 5.3 (ghi log so sánh).
 *
 * _Requirements: 5.1, 5.3_
 */
import { Logger } from '@nestjs/common';

import { resolveSoCon, SoConRequest } from '../imposition-selector';
import { KhoIn, PricingData } from '../pricing-data';
import { makePricingData } from './fixture';

/** Tìm bản ghi khổ in trong fixture theo nhãn `khoIn`. */
function khoByLabel(d: PricingData, label: string): KhoIn {
    const k = d.khoIn.find((x) => x.khoIn === label);
    if (!k) throw new Error(`fixture thiếu khổ in: ${label}`);
    return k;
}

describe('Shadow_Mode log (mock logger) — shadow-log smoke', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        // Mock `Logger.log` (impl rỗng) để không in ra console và để theo dõi lời gọi.
        logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    // Con 10×10cm lọt thoải mái khổ giấy lớn 79×109cm ⇒ cả hai nguồn cho số con > 0.
    const ITEM_WCM = 10;
    const ITEM_HCM = 10;
    const KHO_LABEL = '52cm x 72cm'; // khoGiayLon = '79cm x 109cm'

    it('ShadowMode BẬT: tính cả hai nguồn (legacy + unified) và ghi log so sánh', () => {
        const data = makePricingData();
        data.tyLe.params.ShadowMode = 1; // bật shadow (nguồn mặc định = 'legacy')
        const kho = khoByLabel(data, KHO_LABEL);
        const req: SoConRequest = { itemWcm: ITEM_WCM, itemHcm: ITEM_HCM, kho, data };

        const outcome = resolveSoCon(req);

        // (1) Req 5.1 — cả hai nguồn được tính và đính kèm trong meta.shadow.
        expect(outcome.shadow).toBeDefined();
        const shadow = outcome.shadow!;
        expect(shadow.legacyToLon).toBeGreaterThan(0);
        expect(shadow.unifiedToLon).toBeGreaterThan(0);
        // delta = unified − legacy (đúng định nghĩa chênh lệch số con/tờ).
        expect(shadow.deltaToLon).toBe(shadow.unifiedToLon - shadow.legacyToLon);

        // Nguồn mặc định = legacy ⇒ giá lấy theo legacy (shadow không đổi giá).
        expect(outcome.source).toBe('legacy');
        expect(outcome.soConToLon).toBe(shadow.legacyToLon);

        // (2) Req 5.3 — ghi log so sánh đúng một lần, chứa số liệu của CẢ HAI nguồn.
        expect(logSpy).toHaveBeenCalledTimes(1);
        const msg = String(logSpy.mock.calls[0][0]);
        expect(msg).toContain('Shadow[source=legacy]');
        expect(msg).toContain(`kho=${KHO_LABEL}`);
        expect(msg).toContain(`legacyToLon=${shadow.legacyToLon}`);
        expect(msg).toContain(`unifiedToLon=${shadow.unifiedToLon}`);
        expect(msg).toContain(`deltaToLon=${shadow.deltaToLon}`);
        expect(msg).toContain(`legacyBaiIn=${shadow.legacyBaiIn}`);
        expect(msg).toContain(`unifiedBaiIn=${shadow.unifiedBaiIn}`);
    });

    it('ShadowMode BẬT với nguồn unified: giá theo unified, vẫn ghi log đối chiếu cả hai nguồn', () => {
        const data = makePricingData();
        data.tyLe.params.ImpositionSource = 'unified';
        data.tyLe.params.ShadowMode = 1;
        const kho = khoByLabel(data, KHO_LABEL);
        const req: SoConRequest = { itemWcm: ITEM_WCM, itemHcm: ITEM_HCM, kho, data };

        const outcome = resolveSoCon(req);

        expect(outcome.source).toBe('unified');
        expect(outcome.shadow).toBeDefined();
        const shadow = outcome.shadow!;
        expect(shadow.legacyToLon).toBeGreaterThan(0);
        expect(shadow.unifiedToLon).toBeGreaterThan(0);
        // Giá theo unified ⇒ So_Con xuất ra khớp nhánh unified của số liệu shadow.
        expect(outcome.soConToLon).toBe(shadow.unifiedToLon);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const msg = String(logSpy.mock.calls[0][0]);
        expect(msg).toContain('Shadow[source=unified]');
        expect(msg).toContain(`unifiedToLon=${shadow.unifiedToLon}`);
        expect(msg).toContain(`legacyToLon=${shadow.legacyToLon}`);
    });

    it('ShadowMode TẮT: KHÔNG đính shadow và KHÔNG ghi log so sánh', () => {
        const data = makePricingData();
        data.tyLe.params.ShadowMode = 0; // tắt shadow
        const kho = khoByLabel(data, KHO_LABEL);
        const req: SoConRequest = { itemWcm: ITEM_WCM, itemHcm: ITEM_HCM, kho, data };

        const outcome = resolveSoCon(req);

        expect(outcome.shadow).toBeUndefined();
        expect(logSpy).not.toHaveBeenCalled();
    });
});
