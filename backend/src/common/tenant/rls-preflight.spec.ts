import {
    assertRlsPreflight,
    evaluateRlsPreflight,
    inspectRlsCatalog,
    requirePostgresForRls,
    RlsCatalogRow,
    RlsPreflightInput,
    TENANT_POLICY_NAMES,
    TENANT_RLS_MANIFEST,
    TENANT_RLS_TABLES,
} from './rls-preflight';

describe('requirePostgresForRls', () => {
    it('flag bật trên SQLite ⇒ fatal thay vì chỉ log rồi mở cổng', () => {
        expect(() => requirePostgresForRls(true, 'sqlite')).toThrow(/từ chối khởi động/);
    });

    it('flag tắt trên SQLite ⇒ caller được bỏ catalog check', () => {
        expect(requirePostgresForRls(false, 'sqlite')).toBe(false);
    });

    it('PostgreSQL ⇒ chạy catalog preflight', () => {
        expect(requirePostgresForRls(true, 'postgres')).toBe(true);
    });
});

/**
 * Feature: tenant-data-isolation — Requirement 7 (ba lớp bật RLS phải cùng bật).
 *
 * Property 6 (design): KHÔNG bao giờ trả `ok` khi cờ bật mà role bỏ qua được RLS hoặc chưa có policy.
 * Đây là chốt chống trạng thái "cô lập ẢO" — trạng thái nguy hiểm nhất vì log trông bình thường.
 */
describe('evaluateRlsPreflight', () => {
    const base: RlsPreflightInput = {
        flagOn: false,
        isSuperuser: false,
        canBypassRls: false,
        catalogIssues: [],
    };

    describe('cờ TẮT ⇒ info (trạng thái hợp lệ, không chặn)', () => {
        it.each([
            ['role thường, catalog lệch', { isSuperuser: false, canBypassRls: false, catalogIssues: ['quotes: thiếu policy'] }],
            ['superuser, catalog lệch', { isSuperuser: true, canBypassRls: false, catalogIssues: ['quotes: thiếu policy'] }],
            ['superuser, catalog đúng', { isSuperuser: true, canBypassRls: false, catalogIssues: [] }],
        ])('%s', (_label, patch) => {
            const v = evaluateRlsPreflight({ ...base, flagOn: false, ...patch });
            expect(v.level).toBe('info');
        });
    });

    describe('cờ BẬT + role bỏ qua RLS ⇒ fatal (cô lập ảo)', () => {
        it('superuser ⇒ fatal, thông báo nêu SUPERUSER', () => {
            const v = evaluateRlsPreflight({ ...base, flagOn: true, isSuperuser: true });
            expect(v.level).toBe('fatal');
            expect(v.reason).toContain('SUPERUSER');
        });

        it('BYPASSRLS (không phải superuser) ⇒ fatal, thông báo nêu BYPASSRLS', () => {
            const v = evaluateRlsPreflight({ ...base, flagOn: true, canBypassRls: true });
            expect(v.level).toBe('fatal');
            expect(v.reason).toContain('BYPASSRLS');
        });

        it('fatal thắng cả khi policy chưa áp (ưu tiên lỗi nghiêm trọng hơn)', () => {
            const v = evaluateRlsPreflight({
                ...base,
                flagOn: true,
                isSuperuser: true,
                catalogIssues: ['quotes: thiếu policy'],
            });
            expect(v.level).toBe('fatal');
        });
    });

    describe('cờ BẬT + role đúng', () => {
        it('bất kỳ bảng nào lệch manifest ⇒ fatal (không mở cổng HTTP)', () => {
            const v = evaluateRlsPreflight({
                ...base,
                flagOn: true,
                catalogIssues: ['quotes: thiếu policy tenant_isolation'],
            });
            expect(v.level).toBe('fatal');
            expect(v.reason).toContain('quotes');
        });

        it('thông báo chỉ preview tối đa 8 lỗi để log boot không bùng nổ', () => {
            const catalogIssues = Array.from({ length: 10 }, (_, i) => `table_${i}: lỗi`);
            const v = evaluateRlsPreflight({ ...base, flagOn: true, catalogIssues });
            expect(v.level).toBe('fatal');
            expect(v.reason).toContain('và 2 lỗi khác');
        });

        it('toàn bộ catalog khớp manifest ⇒ ok', () => {
            const v = evaluateRlsPreflight({ ...base, flagOn: true, catalogIssues: [] });
            expect(v.level).toBe('ok');
            // Số bảng DẪN XUẤT từ manifest, không hardcode: audit 2026-08-29 đã gỡ 2 bảng
            // phantom (`daily_stats`, `production_cost_configs`) nên con số cũ (64) sai và
            // sẽ còn đổi khi thêm bảng org-scoped mới.
            expect(v.reason).toContain(String(TENANT_RLS_TABLES.length));
        });
    });

    it('Property 6: không tổ hợp nào cho `ok` khi role bypass hoặc catalog lệch', () => {
        for (const isSuperuser of [true, false]) {
            for (const canBypassRls of [true, false]) {
                for (const catalogIssues of [[], ['quotes: lỗi']]) {
                    const v = evaluateRlsPreflight({ flagOn: true, isSuperuser, canBypassRls, catalogIssues });
                    const shouldBeOk = !isSuperuser && !canBypassRls && catalogIssues.length === 0;
                    expect(v.level === 'ok').toBe(shouldBeOk);
                }
            }
        }
    });

    it('danh sách policy phủ cả khuôn A và khuôn B (baseline tách đọc/ghi)', () => {
        expect(TENANT_POLICY_NAMES).toContain('tenant_isolation');
        expect(TENANT_POLICY_NAMES).toContain('mc_read');
        expect(TENANT_POLICY_NAMES).toContain('mc_write');
        expect(TENANT_POLICY_NAMES).toContain('app_scope_read');
        expect(TENANT_POLICY_NAMES).toContain('app_scope_write');
    });
});

describe('inspectRlsCatalog', () => {
    const compliantRows = (): RlsCatalogRow[] => [
        ...TENANT_RLS_MANIFEST.commonTables.map((table_name) => ({
            table_name,
            table_exists: true,
            rls_enabled: true,
            rls_forced: true,
            tenant_not_null: true,
            has_tenant_trigger: true,
            policy_names: ['tenant_isolation'],
        })),
        ...Object.entries(TENANT_RLS_MANIFEST.baselineTables).map(([table_name, policy_names]) => ({
            table_name,
            table_exists: true,
            rls_enabled: true,
            rls_forced: true,
            tenant_not_null: false,
            has_tenant_trigger: false,
            policy_names: [...policy_names],
        })),
    ];

    it('catalog đủ 64 bảng đúng shape ⇒ không có issue', () => {
        expect(inspectRlsCatalog(compliantRows())).toEqual([]);
    });

    it('phát hiện table/policy/RLS/FORCE/NOT NULL/trigger bị thiếu', () => {
        const rows = compliantRows();
        const quote = rows.find((row) => row.table_name === 'quotes')!;
        quote.rls_enabled = false;
        quote.rls_forced = false;
        quote.tenant_not_null = false;
        quote.has_tenant_trigger = false;
        quote.policy_names = [];

        const issues = inspectRlsCatalog(rows);
        expect(issues).toEqual(expect.arrayContaining([
            'quotes: chưa ENABLE ROW LEVEL SECURITY',
            'quotes: chưa FORCE ROW LEVEL SECURITY',
            'quotes: thiếu policy tenant_isolation',
            'quotes: tenant_id chưa NOT NULL',
            'quotes: thiếu trigger trg_set_tenant',
        ]));
    });

    it('khóa shape riêng của baseline: nullable, không trigger, đủ read/write policy', () => {
        const rows = compliantRows();
        const baseline = rows.find((row) => row.table_name === 'method_capabilities')!;
        baseline.tenant_not_null = true;
        baseline.has_tenant_trigger = true;
        baseline.policy_names = ['mc_read'];

        expect(inspectRlsCatalog(rows)).toEqual(expect.arrayContaining([
            'method_capabilities: thiếu policy mc_write',
            'method_capabilities: tenant_id phải nullable để giữ baseline',
            'method_capabilities: không được có trigger trg_set_tenant',
        ]));
    });

    it('bảng manifest không có row catalog ⇒ fail-closed', () => {
        const rows = compliantRows().filter((row) => row.table_name !== 'messages');
        expect(inspectRlsCatalog(rows)).toContain('messages: bảng không tồn tại');
    });
});

describe('assertRlsPreflight', () => {
    const makeLog = () => ({ log: jest.fn(), error: jest.fn() });

    it('fatal ⇒ ném lỗi (caller KHÔNG được mở cổng HTTP)', () => {
        const log = makeLog();
        expect(() => assertRlsPreflight({ level: 'fatal', reason: 'x' }, log)).toThrow(/RLS preflight/);
        expect(log.error).not.toHaveBeenCalled();
    });

    it('error ⇒ log mức error, KHÔNG ném', () => {
        const log = makeLog();
        expect(() => assertRlsPreflight({ level: 'error', reason: 'chưa áp Pha B' }, log)).not.toThrow();
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('chưa áp Pha B'));
    });

    it.each(['ok', 'info'] as const)('%s ⇒ log thường', (level) => {
        const log = makeLog();
        assertRlsPreflight({ level, reason: 'r' }, log);
        expect(log.log).toHaveBeenCalled();
        expect(log.error).not.toHaveBeenCalled();
    });
});
