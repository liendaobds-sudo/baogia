import { runInTransaction } from 'typeorm-transactional';
import type { TenantContextService } from './tenant-context.service';

/**
 * Tiện ích bọc tenant cho ĐƯỜNG CHẠY NỀN (cron / BullMQ / zca-js listener / socket).
 *
 * Nguyên tắc AN TOÀN nhất: mọi thứ ở đây GATED sau `TENANT_RLS_ENABLED`. Khi flag TẮT
 * (mặc định) → KHÔNG mở transaction, KHÔNG set biến phiên, chạy thẳng logic gốc ⇒ hành
 * vi byte-for-byte như cũ, không overhead. Khi flag BẬT → bọc `withTenant` +
 * `runInTransaction` + `set_config('app.current_tenant', ...)` để insert/đọc nền gắn
 * đúng tenant và đi qua connection có biến phiên (Postgres RLS lọc đúng tenant).
 *
 * _Requirements: 2.2, 4.1, 4.2_
 */

/** RLS có đang bật không (mặc định TẮT → giữ nguyên hành vi hiện tại). */
export function tenantRlsEnabled(): boolean {
    return process.env.TENANT_RLS_ENABLED === 'true';
}

type Queryable = { query: (sql: string, params?: any[]) => Promise<any> };

/**
 * Chạy `fn` trong tenant scope cho MỘT job nền có tenant đã biết (BullMQ consumer,
 * zca-js callback). Flag TẮT / thiếu tenantCtx → chạy `fn()` thẳng (không đổi hành vi).
 */
export function runInTenant<T>(
    tenantCtx: TenantContextService | undefined | null,
    manager: Queryable,
    tenantId: number,
    fn: () => Promise<T>,
): Promise<T> {
    if (!tenantRlsEnabled() || !tenantCtx) return fn();
    return tenantCtx.withTenant(tenantId, () =>
        runInTransaction(async () => {
            await manager.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(tenantId)]);
            return fn();
        }),
    ) as Promise<T>;
}

/**
 * Lặp một cron QUÉT-NHIỀU-TENANT: phân giải danh sách tenant rồi chạy `fn` từng tenant,
 * mỗi vòng bọc `withTenant` + `runInTransaction` + `set_config`. Bên trong `fn`, mọi
 * repo (đã được typeorm-transactional vá) dùng đúng connection của transaction nên RLS
 * tự lọc → cùng một truy vấn quét-tất-cả sẽ chỉ thấy dữ liệu tenant hiện hành.
 *
 * Danh sách tenant lấy từ bảng GLOBAL `tenants` (KHÔNG bị RLS) → tránh "mặc-định-đóng"
 * khi truy vấn distinct ngoài context.
 *
 * Flag TẮT / thiếu tenantCtx → chạy `fn()` MỘT lần ngoài scope ⇒ hành vi gốc bất biến.
 */
export async function forEachTenant(
    tenantCtx: TenantContextService | undefined | null,
    manager: Queryable,
    fn: () => Promise<void>,
): Promise<void> {
    if (!tenantRlsEnabled() || !tenantCtx) {
        await fn();
        return;
    }
    const rows: Array<{ id: number | string }> = await manager.query('SELECT id FROM tenants');
    const tenantIds = rows
        .map((r) => Number(r.id))
        .filter((n) => Number.isInteger(n) && n > 0);
    for (const tenantId of tenantIds) {
        await tenantCtx.withTenant(tenantId, () =>
            runInTransaction(async () => {
                await manager.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(tenantId)]);
                await fn();
            }),
        );
    }
}
