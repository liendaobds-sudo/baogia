import { EngineOffsetService } from '../engine-offset.service';
import type { PricingData } from '../pricing-data';

/**
 * Feature: tenant-data-isolation — Requirement 11.1 (chống hồi quy cô lập cache giá).
 *
 * BỐI CẢNH: bảng giá offset (`offset_cfg_*`, `pricing_config`, vật tư) là dữ liệu org-scoped, nhưng
 * `EngineOffsetService` cache nó trong bộ nhớ. Trước đợt vá 2026-07-25, cache là MỘT field singleton
 * nạp một lần lúc boot ⇒ khi bật `TENANT_RLS_ENABLED`, mọi tenant dùng chung bảng giá của lần nạp
 * đầu tiên ⇒ SAI TIỀN cho tenant thứ hai. Test này khoá hành vi đã vá.
 *
 * Bất biến cần giữ (Property 11):
 *  - Cờ TẮT (mặc định) ⇒ một ô cache duy nhất `'default'`, hành vi byte-for-byte như trước.
 *  - Cờ BẬT + có tenant context ⇒ mỗi tenant một ô riêng, không thấy dữ liệu của nhau.
 */
describe('EngineOffsetService — cô lập cache bảng giá theo tenant', () => {
    const ORIGINAL_FLAG = process.env.TENANT_RLS_ENABLED;

    /** PricingData tối thiểu, chỉ cần phân biệt được hai tenant qua một giá trị mốc. */
    const makeData = (vat: number): PricingData =>
        ({ tyLe: { params: { TyLe_VAT: vat } } } as unknown as PricingData);

    /** TenantContextService giả: chỉ cần `currentTenantId()` như engine dùng. */
    const makeCtx = (tenantIdRef: { value: number | null }) =>
        ({ currentTenantId: () => tenantIdRef.value } as any);

    afterEach(() => {
        if (ORIGINAL_FLAG === undefined) delete process.env.TENANT_RLS_ENABLED;
        else process.env.TENANT_RLS_ENABLED = ORIGINAL_FLAG;
    });

    describe('cờ TẮT — hành vi cũ, một ô dùng chung', () => {
        beforeEach(() => { delete process.env.TENANT_RLS_ENABLED; });

        it('mọi tenant đọc CÙNG một bảng giá đã nạp (không đổi hành vi)', () => {
            const tenant = { value: 1 as number | null };
            const engine = new EngineOffsetService(undefined, makeCtx(tenant));

            engine.setPricingData(makeData(0.08));
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.08);

            // Đổi tenant nhưng cờ tắt ⇒ vẫn ô 'default' ⇒ vẫn thấy dữ liệu đã nạp.
            tenant.value = 2;
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.08);
        });
    });

    describe('cờ BẬT — mỗi tenant một ô cache', () => {
        beforeEach(() => { process.env.TENANT_RLS_ENABLED = 'true'; });

        it('tenant B KHÔNG nhận bảng giá đã cache của tenant A', () => {
            const tenant = { value: 1 as number | null };
            const engine = new EngineOffsetService(undefined, makeCtx(tenant));

            engine.setPricingData(makeData(0.08)); // ô của tenant 1
            tenant.value = 2;
            engine.setPricingData(makeData(0.05)); // ô của tenant 2

            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.05);
            tenant.value = 1;
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.08);
        });

        it('tenant chưa nạp ⇒ tự nạp mặc định JSON, KHÔNG mượn ô của tenant khác', () => {
            const tenant = { value: 1 as number | null };
            const engine = new EngineOffsetService(undefined, makeCtx(tenant));

            engine.setPricingData(makeData(0.99)); // giá trị mốc không thể là mặc định

            tenant.value = 2;
            const forTenant2 = engine.getPricingData();
            expect(forTenant2.tyLe.params.TyLe_VAT).not.toBe(0.99);
            // Và ô tenant 1 không bị ghi đè bởi lần nạp mặc định của tenant 2.
            tenant.value = 1;
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.99);
        });

        it('không có tenant context ⇒ rơi về ô "default" (đường nền/boot)', () => {
            const tenant = { value: null as number | null };
            const engine = new EngineOffsetService(undefined, makeCtx(tenant));

            // Mốc 0.4242 chọn cố ý để KHÔNG trùng VAT mặc định của pricebook JSON (0.08) —
            // nếu dùng 0.08 thì assertion "không thấy ô default" sẽ dương tính giả.
            engine.setPricingData(makeData(0.4242));
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.4242);

            tenant.value = 7; // tenant thật không thấy ô default
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).not.toBe(0.4242);
        });

        it('invalidateAllPricingData() xoá ô của MỌI tenant', () => {
            const tenant = { value: 1 as number | null };
            const engine = new EngineOffsetService(undefined, makeCtx(tenant));

            engine.setPricingData(makeData(0.11));
            tenant.value = 2;
            engine.setPricingData(makeData(0.22));

            engine.invalidateAllPricingData();

            tenant.value = 1;
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).not.toBe(0.11);
            tenant.value = 2;
            expect(engine.getPricingData().tyLe.params.TyLe_VAT).not.toBe(0.22);
        });
    });

    it('không có TenantContextService (test thuần / DI thiếu) ⇒ vẫn chạy, dùng ô default', () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const engine = new EngineOffsetService();
        engine.setPricingData(makeData(0.08));
        expect(engine.getPricingData().tyLe.params.TyLe_VAT).toBe(0.08);
    });
});
