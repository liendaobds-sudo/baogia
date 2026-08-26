/**
 * rls-preflight — Cổng tiền kiểm BA LỚP của cô lập tenant (spec tenant-data-isolation, Req 7).
 *
 * VẤN ĐỀ: "RLS đang bật" không phải một công tắc mà là hợp của BA điều kiện độc lập:
 *   1. Cờ ứng dụng `TENANT_RLS_ENABLED=true`  → `TenantConnectionInterceptor` mới mở transaction
 *      và `set_config('app.current_tenant', ...)`.
 *   2. Role DB KHÔNG phải superuser và KHÔNG có `BYPASSRLS` → PostgreSQL mới thực sự áp policy.
 *   3. Pha B đã áp → mới tồn tại policy để áp.
 *
 * Trạng thái nguy hiểm nhất KHÔNG phải "tắt hết" mà là **LỆCH**: bật cờ trong khi vẫn nối DB bằng
 * superuser. Khi đó app tưởng đã cô lập, log không có gì bất thường, nhưng Postgres bỏ qua toàn bộ
 * policy ⇒ cô lập là ẢO. Đây chính là tình trạng đã phát hiện trong audit 2026-07-25
 * (`backend/.env` có `DB_USERNAME=postgres`).
 *
 * Hàm dưới là THUẦN (không I/O) để test được toàn bộ bảng quyết định mà không cần DB; phần truy vấn
 * `pg_roles`/`pg_policies` nằm ở caller (`main.ts`).
 */

import {
    TENANT_POLICY_NAMES,
    TENANT_RLS_MANIFEST,
    TENANT_RLS_TABLES,
    TenantRlsManifest,
} from './rls-manifest';

export { TENANT_POLICY_NAMES, TENANT_RLS_MANIFEST, TENANT_RLS_TABLES };

export interface RlsCatalogRow {
    table_name: string;
    table_exists: boolean;
    rls_enabled: boolean;
    rls_forced: boolean;
    tenant_not_null: boolean;
    has_tenant_trigger: boolean;
    policy_names: string[];
}

/** Flag RLS chỉ hợp lệ với PostgreSQL; trả false để caller bỏ catalog check khi flag tắt ở DB dev khác. */
export function requirePostgresForRls(flagOn: boolean, dbType: unknown): boolean {
    const isPostgres = String(dbType ?? '').trim().toLowerCase() === 'postgres';
    if (flagOn && !isPostgres) {
        throw new Error(
            '[RLS preflight] TENANT_RLS_ENABLED=true nhưng DB_TYPE khác postgres — ' +
            'RLS không tồn tại; từ chối khởi động.',
        );
    }
    return isPostgres;
}

/**
 * So từng bảng catalog thật với manifest Pha B. Common table phải có NOT NULL + trigger;
 * hai bảng baseline phải giữ tenant_id nullable, không có trigger và dùng cặp policy riêng.
 */
export function inspectRlsCatalog(
    rows: RlsCatalogRow[],
    manifest: TenantRlsManifest = TENANT_RLS_MANIFEST,
): string[] {
    const issues: string[] = [];
    const byTable = new Map(rows.map((row) => [row.table_name, row]));

    const inspectBase = (table: string, expectedPolicies: readonly string[]) => {
        const row = byTable.get(table);
        if (!row?.table_exists) {
            issues.push(`${table}: bảng không tồn tại`);
            return null;
        }
        if (!row.rls_enabled) issues.push(`${table}: chưa ENABLE ROW LEVEL SECURITY`);
        if (!row.rls_forced) issues.push(`${table}: chưa FORCE ROW LEVEL SECURITY`);
        const actualPolicies = new Set(Array.isArray(row.policy_names) ? row.policy_names : []);
        for (const policy of expectedPolicies) {
            if (!actualPolicies.has(policy)) issues.push(`${table}: thiếu policy ${policy}`);
        }
        return row;
    };

    for (const table of manifest.commonTables) {
        const row = inspectBase(table, ['tenant_isolation']);
        if (!row) continue;
        if (!row.tenant_not_null) issues.push(`${table}: tenant_id chưa NOT NULL`);
        if (!row.has_tenant_trigger) issues.push(`${table}: thiếu trigger trg_set_tenant`);
    }

    for (const [table, policies] of Object.entries(manifest.baselineTables)) {
        const row = inspectBase(table, policies);
        if (!row) continue;
        if (row.tenant_not_null) issues.push(`${table}: tenant_id phải nullable để giữ baseline`);
        if (row.has_tenant_trigger) issues.push(`${table}: không được có trigger trg_set_tenant`);
    }

    return issues;
}

export interface RlsPreflightInput {
    /** Kết quả `tenantRlsEnabled()` — chỉ đúng khi biến môi trường bằng chuỗi 'true'. */
    flagOn: boolean;
    /** `pg_roles.rolsuper` của `current_user`. Superuser BỎ QUA RLS. */
    isSuperuser: boolean;
    /** `pg_roles.rolbypassrls` của `current_user`. Cũng bỏ qua RLS dù không phải superuser. */
    canBypassRls: boolean;
    /** Sai lệch từng bảng giữa catalog PostgreSQL thật và manifest Pha B. */
    catalogIssues: string[];
}

export type RlsPreflightVerdict =
    /** Ba lớp cùng bật, đúng trạng thái mong đợi. */
    | { level: 'ok'; reason: string }
    /** Cô lập ẢO hoặc không xác định được ⇒ KHÔNG được phục vụ request. */
    | { level: 'fatal'; reason: string }
    /** Mức log lỗi không chặn, giữ cho caller tương thích; trạng thái RLS bật bị lệch luôn là fatal. */
    | { level: 'error'; reason: string }
    /** Cờ tắt — trạng thái hợp lệ, hành vi như trước khi có RLS. */
    | { level: 'info'; reason: string };

/**
 * Bảng quyết định (Req 7.3, 7.4, 7.5):
 *
 * | flagOn | isSuperuser \|\| canBypassRls | catalogIssues | verdict |
 * |--------|------------------------------|---------------|---------|
 * | false  | —                            | —             | info    |
 * | true   | true                         | —             | fatal   |
 * | true   | false                        | có lỗi        | fatal   |
 * | true   | false                        | rỗng          | ok      |
 *
 * BẤT BIẾN (Property 6): không bao giờ trả `ok` khi role bỏ qua RLS hoặc bất kỳ bảng nào lệch manifest.
 */
export function evaluateRlsPreflight(input: RlsPreflightInput): RlsPreflightVerdict {
    const { flagOn, isSuperuser, canBypassRls, catalogIssues } = input;

    if (!flagOn) {
        return {
            level: 'info',
            reason:
                'TENANT_RLS_ENABLED không bật — cô lập tenant ở tầng DB đang TẮT có chủ đích. ' +
                'Ứng dụng chạy với hành vi trước khi có RLS (guard app-level vẫn hoạt động).',
        };
    }

    if (isSuperuser || canBypassRls) {
        const which = isSuperuser ? 'SUPERUSER' : 'BYPASSRLS';
        return {
            level: 'fatal',
            reason:
                `TENANT_RLS_ENABLED=true nhưng role DB đang dùng có ${which} ⇒ PostgreSQL BỎ QUA mọi ` +
                'policy RLS. Cô lập tenant sẽ là ẢO (app tưởng đã cô lập, thực tế không). ' +
                'Tạo role ứng dụng NOSUPERUSER (db/2026-06-26_tenant_app_role.sql) rồi đổi DB_USERNAME/' +
                'DB_PASSWORD, hoặc tắt TENANT_RLS_ENABLED.',
        };
    }

    if (catalogIssues.length > 0) {
        const preview = catalogIssues.slice(0, 8).join('; ');
        const remaining = catalogIssues.length > 8 ? `; ... và ${catalogIssues.length - 8} lỗi khác` : '';
        return {
            level: 'fatal',
            reason:
                `TENANT_RLS_ENABLED=true nhưng catalog RLS lệch manifest: ${preview}${remaining}. ` +
                'Từ chối khởi động; kiểm tra Pha B trên staging/bản sao trước khi mở traffic.',
        };
    }

    return {
        level: 'ok',
        reason:
            `Cô lập tenant đang có hiệu lực: role không bỏ qua RLS và đủ ${TENANT_RLS_TABLES.length} ` +
            'bảng khớp manifest policy/RLS/FORCE/tenant column.',
    };
}

/**
 * Xử lý verdict theo hợp đồng ở Req 7.3/7.4: `fatal` ⇒ ném lỗi (caller không được mở cổng HTTP),
 * `error` ⇒ log mức error, `info`/`ok` ⇒ log mức log. Tách riêng để test được mà không cần Logger thật.
 *
 * @throws Error khi verdict là `fatal`
 */
export function assertRlsPreflight(
    verdict: RlsPreflightVerdict,
    log: { log: (msg: string) => void; error: (msg: string) => void },
): void {
    switch (verdict.level) {
        case 'fatal':
            throw new Error(`[RLS preflight] ${verdict.reason}`);
        case 'error':
            log.error(`[RLS preflight] ${verdict.reason}`);
            return;
        default:
            log.log(`[RLS preflight] ${verdict.reason}`);
            return;
    }
}
