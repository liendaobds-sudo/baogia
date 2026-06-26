import { DataSource, EntityManager } from 'typeorm';
import type { TenantContextService } from './tenant-context.service';

/**
 * Chạy `fn` trong MỘT transaction có `SET LOCAL app.current_tenant` = tenant hiện hành,
 * để Postgres RLS lọc đúng theo tenant trên CÙNG connection của transaction đó.
 *
 * `SET LOCAL` chỉ sống trong transaction ⇒ tự reset khi commit/rollback ⇒ an toàn với
 * connection pool (không rò context sang request khác — khác hẳn `SET search_path` session).
 *
 * G2 (chưa bật ở phiên hiện tại): RLS policy đọc `app.current_tenant`/`app.bypass`.
 * Trước khi bật RLS, helper này vẫn vô hại (chỉ set biến phiên, không bảng nào dùng).
 *
 * _Requirements: 3.2, 2.4_
 */
export async function tenantTransaction<T>(
    dataSource: DataSource,
    tenant: TenantContextService,
    fn: (em: EntityManager) => Promise<T>,
): Promise<T> {
    const ctx = tenant.require(); // fail-loud nếu thiếu context (Req 2.3)
    return dataSource.transaction(async (em) => {
        if (ctx.bypass) {
            // System/cross-tenant hợp lệ: bật cờ bypass cho policy RLS.
            await em.query(`SET LOCAL app.bypass = 'on'`);
        } else {
            // Tham số hoá an toàn qua set_config (tránh nội suy chuỗi vào SQL).
            await em.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(ctx.tenantId)]);
        }
        return fn(em);
    });
}

/**
 * Áp tenant context lên connection của một transaction/queryRunner ĐÃ MỞ
 * (cho các service vốn đã dùng `createQueryRunner()` riêng).
 *
 * GUARDED + NO-OP an toàn: nếu không có tenant context → không làm gì (giữ nguyên
 * hành vi hiện tại khi RLS chưa bật). Khi RLS bật, biến phiên này khiến policy lọc đúng.
 *
 * `runner.query` phải chạy trên CÙNG connection của transaction (đúng với QueryRunner
 * và EntityManager trong `dataSource.transaction`).
 *
 * _Requirements: 3.2, 2.4_
 */
export async function applyTenantToConnection(
    runner: { query: (sql: string, params?: any[]) => Promise<any> },
    tenant: { get: () => { tenantId: number; bypass?: boolean } | undefined } | undefined | null,
): Promise<void> {
    if (!tenant) return; // service không có TenantContextService (vd unit test) → no-op
    const ctx = tenant.get();
    if (!ctx) return; // ngoài context (vd job chưa wrap) → no-op, không phá hành vi cũ
    if (ctx.bypass) {
        await runner.query(`SET LOCAL app.bypass = 'on'`);
    } else {
        await runner.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(ctx.tenantId)]);
    }
}
