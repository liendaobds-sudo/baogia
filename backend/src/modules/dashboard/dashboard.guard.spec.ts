import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DashboardController } from './dashboard.controller';

/**
 * Audit 2026-08-29 — `/api/v1/dashboard/kpi`, `/activity-hourly`, `/trends` trước đây
 * KHÔNG có guard nào (comment cũ: "Public endpoint — called by PricingPrint dashboard
 * (no JWT needed)", tàn dư app PHP đã decommission). Guard toàn cục duy nhất của app là
 * ThrottlerGuard, KHÔNG phải auth ⇒ người chưa đăng nhập đọc được số liệu vận hành gộp
 * của MỌI tenant (hội thoại, tin nhắn, gợi ý AI, SLA, KB, agent online).
 *
 * Khoá guard ở CẤP CLASS để handler mới thêm vào controller được bảo vệ mặc định, không
 * phụ thuộc người viết nhớ gắn `@UseGuards`.
 */
describe('DashboardController — auth guard', () => {
    const classGuards = (): unknown[] =>
        (Reflect.getMetadata(GUARDS_METADATA, DashboardController) as unknown[]) ?? [];

    /** Guard do `AuthGuard('jwt')` sinh ra là class mixin có phương thức `canActivate`. */
    const isGuardClass = (g: unknown): boolean =>
        typeof g === 'function' && typeof (g as any).prototype?.canActivate === 'function';

    it('có guard ở CẤP CLASS (mọi route đều được bảo vệ mặc định)', () => {
        expect(classGuards().length).toBeGreaterThan(0);
    });

    it('guard cấp class là một guard hợp lệ (có canActivate)', () => {
        expect(classGuards().every(isGuardClass)).toBe(true);
    });

    it('mọi handler public trước đây giờ nằm dưới guard cấp class', () => {
        // 3 route từng không guard + 2 route vốn đã có RolesGuard riêng.
        for (const method of ['getKpi', 'getActivityHourly', 'getTrends', 'getAiAnalytics', 'getHealth']) {
            expect(typeof (DashboardController.prototype as any)[method]).toBe('function');
        }
        // Guard cấp handler (nếu có) là BỔ SUNG chứ không thay thế guard class.
        expect(classGuards().length).toBeGreaterThan(0);
    });
});
