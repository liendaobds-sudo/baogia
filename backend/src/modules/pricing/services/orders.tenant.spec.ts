import { OrdersService } from './orders.service';

/**
 * Audit /pricing/quotes (finding → fix): cô lập tenant ở tầng app cho các đường ĐỌC
 * và mutation-theo-id của báo giá — lưới an toàn khi RLS chưa flip (app nối superuser).
 *
 * Kiểm bằng cách bắt SQL + params thật service dựng, KHÔNG cần Postgres.
 */
describe('OrdersService — tenant scoping (quotes)', () => {
    type Captured = { sql: string; params: unknown[] };

    function build(tenant?: { tenantId: number; bypass?: boolean }) {
        const calls: Captured[] = [];
        const dataSource = {
            query: jest.fn((sql: string, params: unknown[] = []) => {
                calls.push({ sql, params });
                // trả 1 dòng để các UPDATE ... RETURNING không ném "trạng thái"
                return Promise.resolve([{ id: 1, customer_id: null }]);
            }),
        };
        const tenantCtx = tenant ? { get: () => tenant } : undefined;
        const svc = new OrdersService(
            dataSource as never,
            {} as never, // QuotePdfService
            {} as never, // CustomersService
            {} as never, // EngineOffsetService
            tenantCtx as never,
        );
        return { svc, calls };
    }

    it('findAllQuotes lọc theo tenant hiện hành (+ NULL dùng chung)', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.findAllQuotes({});
        expect(calls[0].sql).toContain('q.tenant_id =');
        expect(calls[0].sql).toContain('q.tenant_id IS NULL');
        expect(calls[0].params).toContain(7);
    });

    it('findAllQuotes bỏ lọc khi bypass', async () => {
        const { svc, calls } = build({ tenantId: 7, bypass: true });
        await svc.findAllQuotes({});
        expect(calls[0].sql).not.toContain('q.tenant_id');
    });

    /**
     * Audit 2026-08-29 — ĐẢO NGƯỢC hành vi cũ có chủ đích.
     *
     * Trước: thiếu tenant context ⇒ `tenantGuard` trả mệnh đề RỖNG ⇒ query đọc báo giá của
     * MỌI tenant (fail-open). Đường này với tới được thật: user có `users.tenant_id = NULL`
     * (cột nullable, login không chặn) và `super_admin` không gửi `x-tenant-id`.
     *
     * Sau: fail-closed bằng `AND 1 = 0`. `OrdersService` chỉ được gọi từ HTTP controller
     * (không cron/BullMQ nào dùng — đã grep), nên không làm chết job nền. Super admin muốn
     * xem dữ liệu tenant phải impersonate tường minh (xem `resolveRequestTenantContext`).
     */
    it('findAllQuotes FAIL-CLOSED khi KHÔNG có context (không đọc chéo tenant)', async () => {
        const { svc, calls } = build(undefined);
        await svc.findAllQuotes({});
        expect(calls[0].sql).toContain('AND 1 = 0');
        expect(calls[0].sql).not.toContain('q.tenant_id =');
    });

    it('findQuoteById FAIL-CLOSED khi KHÔNG có context', async () => {
        const { svc, calls } = build(undefined);
        await svc.findQuoteById('123');
        expect(calls[0].sql).toContain('AND 1 = 0');
    });

    it('findQuoteById chặn đọc chéo tenant (clause + param)', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.findQuoteById('123');
        expect(calls[0].sql).toContain('q.tenant_id =');
        expect(calls[0].params).toEqual([123, 7]);
    });

    it('cancelQuote thêm ràng buộc tenant vào UPDATE', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.cancelQuote('123');
        expect(calls[0].sql).toContain("SET status = 'cancelled'");
        expect(calls[0].sql).toContain('tenant_id =');
        expect(calls[0].params).toEqual(['123', 7]);
    });

    it('approveQuote thêm ràng buộc tenant vào UPDATE', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.approveQuote('123');
        expect(calls[0].sql).toContain("SET status = 'approved'");
        expect(calls[0].sql).toContain('tenant_id =');
        expect(calls[0].params).toEqual(['123', 7]);
    });

    it('findVersionsByQuote lọc theo tenant', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.findVersionsByQuote('55');
        expect(calls[0].sql).toContain('quote_versions');
        expect(calls[0].sql).toContain('tenant_id =');
        expect(calls[0].params).toEqual(['55', 7]);
    });

    it('findVersionById chặn đọc chéo tenant', async () => {
        const { svc, calls } = build({ tenantId: 7 });
        await svc.findVersionById('99');
        expect(calls[0].sql).toContain('quote_versions');
        expect(calls[0].sql).toContain('tenant_id =');
        expect(calls[0].params).toEqual(['99', 7]);
    });
});
