import { QuotePdfService } from '../quote-pdf.service';

/**
 * Audit 2026-08-29 — PDF báo giá đọc `SELECT key, value FROM site_settings` KHÔNG có WHERE,
 * rồi gán vào cùng một object ⇒ hàng của tenant nào đọc sau thì THẮNG. Hệ quả: chứng từ gửi
 * khách có thể mang tên/địa chỉ/MST/logo của tenant KHÁC (rò dữ liệu + sai chứng từ), và
 * `.catch(() => [])` che mất lỗi.
 *
 * Bất biến sau khi sửa:
 *  1. Query có mệnh đề lọc tenant.
 *  2. Tenant lấy từ `quote.tenant_id` (nguồn chính xác), không phải context của người bấm in.
 *  3. Hàng đúng tenant GHI ĐÈ hàng NULL dùng chung (thứ tự nạp tất định, không phụ thuộc
 *     thứ tự row DB trả về).
 */
describe('QuotePdfService — site_settings theo tenant', () => {
    type Captured = { sql: string; params: unknown[] };

    const build = (rows: any[], ctxTenantId: number | null = null) => {
        const calls: Captured[] = [];
        const dataSource = {
            query: jest.fn((sql: string, params: unknown[] = []) => {
                calls.push({ sql, params });
                return Promise.resolve(rows);
            }),
        };
        const tenantCtx = { currentTenantId: () => ctxTenantId } as any;
        const svc = new QuotePdfService(dataSource as never, tenantCtx);
        return { svc, calls, load: (q: unknown) => (svc as any).loadSiteSettings(q) };
    };

    it('lọc theo tenant của BÁO GIÁ, không phải tenant của người in', async () => {
        const { calls, load } = build([], 99);
        await load(7);
        expect(calls[0].sql).toContain('tenant_id');
        expect(calls[0].params).toEqual([7]);
    });

    it('thiếu tenant ở báo giá ⇒ dùng tenant context', async () => {
        const { calls, load } = build([], 5);
        await load(undefined);
        expect(calls[0].params).toEqual([5]);
    });

    it('không xác định được tenant ⇒ CHỈ đọc hàng dùng chung, không trộn tenant khác', async () => {
        const { calls, load } = build([], null);
        await load(undefined);
        expect(calls[0].sql).toContain('tenant_id IS NULL');
        expect(calls[0].sql).not.toContain('tenant_id = $1');
        expect(calls[0].params).toEqual([]);
    });

    it('hàng đúng tenant ghi đè hàng NULL bất kể thứ tự DB trả về', async () => {
        const tenantRow = { key: 'company_name', value: 'Cty Đúng', tenant_id: 7 };
        const sharedRow = { key: 'company_name', value: 'Mặc định', tenant_id: null };

        const a = build([tenantRow, sharedRow], null);
        expect((await a.load(7))['company_name']).toBe('Cty Đúng');

        const b = build([sharedRow, tenantRow], null);
        expect((await b.load(7))['company_name']).toBe('Cty Đúng');
    });

    it('khoá chỉ có ở hàng dùng chung vẫn được nạp (fallback)', async () => {
        const { load } = build([
            { key: 'company_name', value: 'Cty Đúng', tenant_id: 7 },
            { key: 'hotline', value: '1900', tenant_id: null },
        ]);
        const site = await load(7);
        expect(site['company_name']).toBe('Cty Đúng');
        expect(site['hotline']).toBe('1900');
    });

    it('DB chưa có cột tenant_id ⇒ thoái về truy vấn cũ thay vì vỡ PDF', async () => {
        const calls: Captured[] = [];
        let first = true;
        const dataSource = {
            query: jest.fn((sql: string, params: unknown[] = []) => {
                calls.push({ sql, params });
                if (first) {
                    first = false;
                    return Promise.reject(new Error('column "tenant_id" does not exist'));
                }
                return Promise.resolve([{ key: 'company_name', value: 'Legacy' }]);
            }),
        };
        const svc = new QuotePdfService(dataSource as never, { currentTenantId: () => 1 } as any);
        const site = await (svc as any).loadSiteSettings(1);
        expect(site['company_name']).toBe('Legacy');
        expect(calls).toHaveLength(2);
    });

    it('generateHtml dùng đúng tenant của quote (đường chạy thật)', async () => {
        const { calls, svc } = build([], null);
        await svc.generateHtml({ tenant_id: 3, items: [], code: 'BG-1' });
        expect(calls[0].params).toEqual([3]);
    });
});
