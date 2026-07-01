/**
 * RLS Coverage Guard (CI anti-drift check) — Task 13, tenant-data-isolation spec.
 *
 * Goal (Requirement 6.3): khi một entity/bảng org-scoped MỚI được thêm sau này,
 * test này FAIL nếu bảng đó chưa được cô lập — tức chưa có trong danh sách
 * `org_tables` của migration RLS (Pha B) VÀ cũng chưa được khai báo tường minh
 * là GLOBAL (nền tảng, cố ý KHÔNG RLS). Nhờ vậy không ai lỡ ship một bảng
 * org-scoped mà thiếu tenant isolation.
 *
 * DB-free & side-effect-free: chỉ quét mã nguồn bằng fs + regex, KHÔNG import
 * entity (tránh decorator/DB side effects), KHÔNG kết nối DB.
 *
 * Hướng kiểm tra quan trọng: entity → PHẢI được phân loại (org-scoped hoặc global).
 * Chiều ngược lại (org_tables có mục không có entity, ví dụ bảng legacy
 * offset_cfg_*, ink_costs, printers, accessories, binding_types) là CHẤP NHẬN
 * được và KHÔNG làm fail.
 *
 * Validates: Requirements 6.3
 */
import * as fs from 'fs';
import * as path from 'path';

// backend/src/common/tenant → backend/src
const SRC_DIR = path.resolve(__dirname, '../..');
// backend/src → backend/db
const PHASE_B_SQL = path.resolve(SRC_DIR, '../db/2026-06-26_tenant_phaseB_enable_rls.sql');

/**
 * GLOBAL_TABLES — allowlist các bảng nền tảng/toàn cục CỐ Ý không có RLS.
 * Căn cứ: design §"Phân loại bảng" (nhóm "Global / nền tảng — KHÔNG RLS") và
 * header migration Pha A. Mỗi mục kèm lý do.
 *
 * ⚠️ Chỉ thêm bảng vào đây nếu design phân loại là GLOBAL. Nếu bảng là
 * org-scoped, hãy thêm vào `org_tables` trong Pha B thay vì vào đây.
 */
const GLOBAL_TABLES: ReadonlySet<string> = new Set([
  'tenants', // Bản thân danh mục tenant — super-admin quản lý, không tự-tham-chiếu tenant_id.
  'subscription_plans', // Gói cước nền tảng, dùng chung mọi tenant.
  'payments', // Billing nền tảng — super-admin quản lý (Pha A header: global).
  'system_settings', // Cấu hình toàn hệ thống (khác site_settings vốn per-tenant).
  'users', // Đã có tenantId riêng; cross-tenant qua super_admin (Pha A header: global).
  'roles', // Role hệ thống (template chung); role tuỳ biến xử lý riêng (Pha A header: global).
  'role_permissions', // Ánh xạ quyền của role hệ thống (Pha A header: global).
]);

/** Đệ quy thu thập mọi file *.entity.ts dưới một thư mục. */
function collectEntityFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...collectEntityFiles(full));
    } else if (name.endsWith('.entity.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Trích tên bảng từ `@Entity('<name>')` (chỉ nhận entity có tên chuỗi tường minh).
 * Bỏ qua `@Entity()` không tên (derive-from-class) và view/embedded.
 */
function extractTableName(source: string): string | null {
  const m = source.match(/@Entity\(\s*['"]([^'"]+)['"]/);
  return m ? m[1].trim() : null;
}

/** Đọc mảng `org_tables text[] := ARRAY[ ... ]` từ file SQL Pha B. */
function parseOrgTablesFromSql(sqlPath: string): Set<string> {
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const arrMatch = sql.match(/org_tables\s+text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/i);
  if (!arrMatch) {
    throw new Error(
      `Không tìm thấy khai báo "org_tables text[] := ARRAY[...]" trong ${sqlPath}. ` +
        `Guard RLS không thể xác định tập bảng có policy.`,
    );
  }
  const literals = arrMatch[1].match(/'([^']+)'/g) ?? [];
  return new Set(literals.map((s) => s.replace(/'/g, '').trim()));
}

describe('RLS coverage guard (anti-drift entity → tenant isolation)', () => {
  const entityFiles = [
    ...collectEntityFiles(path.join(SRC_DIR, 'entities')),
    ...collectEntityFiles(path.join(SRC_DIR, 'modules')),
  ];

  // Map: tableName -> file (chỉ entity có tên chuỗi tường minh).
  const entityTables = new Map<string, string>();
  for (const file of entityFiles) {
    const name = extractTableName(fs.readFileSync(file, 'utf8'));
    if (name) entityTables.set(name, path.relative(SRC_DIR, file));
  }

  const orgTables = parseOrgTablesFromSql(PHASE_B_SQL);

  it('phát hiện được entity và danh sách org_tables (sanity)', () => {
    // Bảo đảm cơ chế quét hoạt động — nếu 0 thì regex/đường dẫn sai.
    expect(entityTables.size).toBeGreaterThan(0);
    expect(orgTables.size).toBeGreaterThan(0);
  });

  it('org_tables và GLOBAL_TABLES KHÔNG được chồng lấn (một bảng không thể vừa RLS vừa global)', () => {
    const overlap = [...orgTables].filter((t) => GLOBAL_TABLES.has(t));
    expect(overlap).toEqual([]);
  });

  it('MỌI entity org-scoped phải có RLS policy (nằm trong org_tables) HOẶC được khai báo GLOBAL', () => {
    const unclassified: string[] = [];
    for (const [table, file] of entityTables) {
      if (orgTables.has(table) || GLOBAL_TABLES.has(table)) continue;
      unclassified.push(`${table}  (${file})`);
    }

    if (unclassified.length > 0) {
      const lines = unclassified.map((u) => `  - ${u}`).join('\n');
      throw new Error(
        `Phát hiện ${unclassified.length} bảng entity CHƯA được cô lập tenant:\n${lines}\n\n` +
          `Mỗi bảng trên chưa có RLS policy và cũng không nằm trong GLOBAL_TABLES.\n` +
          `→ Nếu bảng thuộc về tenant (org-scoped): thêm tên bảng vào mảng org_tables trong\n` +
          `   db/2026-06-26_tenant_phaseB_enable_rls.sql (và Pha A để thêm cột tenant_id).\n` +
          `→ Nếu bảng là nền tảng/toàn cục (cố ý KHÔNG RLS): thêm vào GLOBAL_TABLES trong\n` +
          `   src/common/tenant/rls-coverage.guard.spec.ts kèm lý do.\n` +
          `Đây là hàng rào chống bỏ sót (Requirement 6.3) — đừng bỏ qua bằng cách xoá test.`,
      );
    }

    expect(unclassified).toEqual([]);
  });
});
