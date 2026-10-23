import { tenantQbCondition, tenantSqlScope } from './tenant-sql';
import type { TenantContext } from './tenant-context.service';

/**
 * Hợp đồng fail-closed của mệnh đề tenant cho raw SQL (audit 2026-08-29).
 *
 * Trước đây mỗi service tự viết `if (!ctx || ctx.bypass) return { clause: '' }` — gộp
 * "bypass có chủ đích" với "không biết tenant là ai" vào cùng một nhánh KHÔNG LỌC GÌ.
 * Helper này tách hai trường hợp đó; test dưới khoá đúng ranh giới ấy.
 */
describe('tenantSqlScope', () => {
    const ctx = (over: Partial<TenantContext> = {}): TenantContext => ({
        tenantId: 7,
        userId: 'u1',
        role: 'agent',
        ...over,
    });

    it('có tenant ⇒ lọc theo tenant + cho phép hàng NULL di sản', () => {
        const s = tenantSqlScope(ctx(), 3);
        expect(s.clause).toBe(' AND (tenant_id = $3 OR tenant_id IS NULL)');
        expect(s.params).toEqual([7]);
        expect(s.denied).toBe(false);
    });

    it('allowLegacyNull=false ⇒ chỉ đúng tenant, KHÔNG nhận hàng NULL', () => {
        const s = tenantSqlScope(ctx(), 1, 'tenant_id', { allowLegacyNull: false });
        expect(s.clause).toBe(' AND tenant_id = $1');
        expect(s.clause).not.toContain('IS NULL');
    });

    it('bypass tường minh ⇒ không lọc (super-admin/system có chủ đích)', () => {
        const s = tenantSqlScope(ctx({ bypass: true }), 1);
        expect(s.clause).toBe('');
        expect(s.params).toEqual([]);
        expect(s.denied).toBe(false);
    });

    it('KHÔNG có context ⇒ FAIL-CLOSED, không phải "không lọc"', () => {
        const s = tenantSqlScope(undefined, 1);
        expect(s.clause).toBe(' AND 1 = 0');
        expect(s.denied).toBe(true);
    });

    it('context có nhưng tenantId null ⇒ vẫn FAIL-CLOSED', () => {
        const s = tenantSqlScope({ tenantId: null as unknown as number, userId: 'u', role: 'agent' }, 1);
        expect(s.denied).toBe(true);
        expect(s.clause).toBe(' AND 1 = 0');
    });

    it('không có tổ hợp nào vừa "không denied" vừa "clause rỗng" ngoài bypass', () => {
        const cases: (TenantContext | undefined)[] = [
            undefined,
            ctx(),
            ctx({ bypass: true }),
            { tenantId: null as unknown as number, userId: 'u', role: 'agent' },
        ];
        for (const c of cases) {
            const s = tenantSqlScope(c, 1);
            if (s.clause === '' && !s.denied) expect(c?.bypass).toBe(true);
        }
    });

    it('cột tuỳ biến được tôn trọng (alias raw SQL)', () => {
        const s = tenantSqlScope(ctx(), 5, 'q.tenant_id');
        expect(s.clause).toBe(' AND (q.tenant_id = $5 OR q.tenant_id IS NULL)');
    });
});

describe('tenantQbCondition', () => {
    const ctx: TenantContext = { tenantId: 42, userId: 'u1', role: 'agent' };

    it('có tenant ⇒ điều kiện QueryBuilder + tham số đặt tên', () => {
        const c = tenantQbCondition(ctx, 'c');
        expect(c).toEqual({
            condition: '(c.tenantId = :tenantScopeId OR c.tenantId IS NULL)',
            params: { tenantScopeId: 42 },
        });
    });

    it('bypass ⇒ null (caller không thêm điều kiện)', () => {
        expect(tenantQbCondition({ ...ctx, bypass: true }, 'c')).toBeNull();
    });

    it('thiếu context ⇒ điều kiện chặn sạch 1 = 0', () => {
        expect(tenantQbCondition(undefined, 'c')).toEqual({ condition: '1 = 0', params: {} });
    });
});
