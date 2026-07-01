/**
 * Tenant isolation end-to-end test (Task 12, tenant-data-isolation spec).
 *
 * Chứng minh RLS cô lập THẬT trên Postgres bằng role ứng dụng NOSUPERUSER:
 *   - Property 1 (cô lập đọc): context tenant A KHÔNG thấy hàng tenant B.
 *   - Property 2 (cô lập ghi): INSERT sai tenant bị WITH CHECK chặn.
 *   - Property 2b: trigger tự gán tenant_id theo app.current_tenant khi thiếu.
 *   - Property 3 (mặc-định-đóng): thiếu app.current_tenant ⇒ 0 hàng.
 *
 * GATED: chỉ chạy khi RLS_E2E=1 (cần Postgres đã áp Pha B + role zeplao_app). CI thường
 * KHÔNG có DB này → suite tự SKIP (describe.skip) nên không làm đỏ pipeline.
 *
 * Cách chạy thủ công (sau khi flip theo TENANT-RLS-RUNBOOK.md trên DB staging/local):
 *   RLS_E2E=1 RLS_APP_USER=zeplao_app RLS_APP_PWD=... RLS_SU_USER=postgres RLS_SU_PWD=... \
 *   RLS_DB=zeplao_erp npx jest tenant-isolation.e2e --runInBand
 *
 * Validates: Requirements 1.1, 3.1, 3.3, 2.3
 */
import { Client } from 'pg';

const RUN = process.env.RLS_E2E === '1';
const CFG = {
  host: process.env.RLS_DB_HOST || 'localhost',
  port: Number(process.env.RLS_DB_PORT || 5432),
  database: process.env.RLS_DB || 'zeplao_erp',
  appUser: process.env.RLS_APP_USER || 'zeplao_app',
  appPwd: process.env.RLS_APP_PWD || 'zeplao_local_dev',
  suUser: process.env.RLS_SU_USER || 'postgres',
  suPwd: process.env.RLS_SU_PWD || 'postgres',
};

const appClient = () => new Client({ host: CFG.host, port: CFG.port, database: CFG.database, user: CFG.appUser, password: CFG.appPwd });
const suClient = () => new Client({ host: CFG.host, port: CFG.port, database: CFG.database, user: CFG.suUser, password: CFG.suPwd });

async function withTenant<T>(c: Client, tid: number, fn: () => Promise<T>): Promise<T> {
  await c.query('BEGIN');
  await c.query("select set_config('app.current_tenant', $1, true)", [String(tid)]);
  try { return await fn(); } finally { await c.query('COMMIT'); }
}

const suite = RUN ? describe : describe.skip;

suite('Tenant isolation (RLS) e2e — Postgres NOSUPERUSER role', () => {
  let su: Client;
  let app: Client;
  let idA: number;
  let idB: number;
  const PHONES = ['RLSA-111', 'RLSB-222', 'RLS-EVIL', 'RLS-AUTO'];

  beforeAll(async () => {
    su = suClient(); await su.connect();
    app = appClient(); await app.connect();
    await su.query(`insert into tenants (id, name, code) values (2, 'Test Tenant B', 'TESTB') on conflict (id) do nothing`);
    await su.query(`delete from customers where phone = any($1)`, [PHONES]);
    const a = await su.query(`insert into customers (name, phone, tenant_id) values ('RLS A','RLSA-111',1) returning id`);
    const b = await su.query(`insert into customers (name, phone, tenant_id) values ('RLS B','RLSB-222',2) returning id`);
    idA = a.rows[0].id; idB = b.rows[0].id;
  });

  afterAll(async () => {
    if (su) { await su.query(`delete from customers where phone = any($1)`, [PHONES]).catch(() => {}); await su.end(); }
    if (app) await app.end();
  });

  it('Property 1: context tenant 1 KHÔNG thấy hàng tenant 2, nhưng thấy hàng tenant 1', async () => {
    await withTenant(app, 1, async () => {
      const seeB = await app.query('select id from customers where id = $1', [idB]);
      expect(seeB.rows.length).toBe(0);
      const seeA = await app.query('select id from customers where id = $1', [idA]);
      expect(seeA.rows.length).toBe(1);
    });
  });

  it('Property 2: INSERT hàng cho tenant khác bị WITH CHECK chặn', async () => {
    await withTenant(app, 1, async () => {
      await expect(
        app.query(`insert into customers (name, phone, tenant_id) values ('evil','RLS-EVIL',2)`),
      ).rejects.toBeTruthy();
    });
  });

  it('Property 2b: trigger tự gán tenant_id = app.current_tenant khi INSERT thiếu tenant_id', async () => {
    await withTenant(app, 1, async () => {
      const ins = await app.query(`insert into customers (name, phone) values ('auto','RLS-AUTO') returning tenant_id`);
      expect(Number(ins.rows[0].tenant_id)).toBe(1);
    });
  });

  it('Property 3: thiếu app.current_tenant ⇒ 0 hàng (mặc-định-đóng)', async () => {
    const noCtx = await app.query('select count(*)::int as n from customers');
    expect(noCtx.rows[0].n).toBe(0);
  });

  // ── method_capabilities: policy đặc biệt (baseline NULL đọc được bởi mọi tenant) ──
  describe('method_capabilities — cô lập + kế thừa baseline (tenant-method-capability Task 7)', () => {
    beforeAll(async () => {
      // Baseline (tenant_id NULL) + hàng riêng của tenant 2 (offset tắt).
      await su.query(`delete from method_capabilities where unit_id in ('default','tenant:2')`);
      await su.query(`insert into method_capabilities (unit_id, tenant_id, method_id, enabled) values
        ('default', null, 'digital', true), ('default', null, 'offset', true),
        ('tenant:2', 2, 'digital', true), ('tenant:2', 2, 'offset', false)`);
    });

    afterAll(async () => {
      await su.query(`delete from method_capabilities where unit_id in ('default','tenant:2')`).catch(() => {});
    });

    it('tenant 1 (chưa cấu hình) thấy baseline NULL, KHÔNG thấy hàng tenant 2', async () => {
      await withTenant(app, 1, async () => {
        const rows = await app.query('select tenant_id, method_id from method_capabilities');
        // Chỉ thấy 2 hàng baseline (tenant_id NULL); không rò rỉ hàng tenant 2.
        expect(rows.rows.every((r: any) => r.tenant_id === null)).toBe(true);
        expect(rows.rows.length).toBe(2);
      });
    });

    it('tenant 2 thấy baseline NULL + hàng riêng của mình', async () => {
      await withTenant(app, 2, async () => {
        const rows = await app.query('select tenant_id, method_id, enabled from method_capabilities order by tenant_id nulls first');
        const own = rows.rows.filter((r: any) => Number(r.tenant_id) === 2);
        const base = rows.rows.filter((r: any) => r.tenant_id === null);
        expect(base.length).toBe(2);       // baseline vẫn đọc được
        expect(own.length).toBe(2);        // hàng riêng của tenant 2
        const offset = own.find((r: any) => r.method_id === 'offset');
        expect(offset.enabled).toBe(false); // cấu hình riêng: offset tắt
      });
    });

    it('tenant 1 KHÔNG thể ghi hàng cho tenant 2 (WITH CHECK)', async () => {
      await withTenant(app, 1, async () => {
        await expect(
          app.query(`insert into method_capabilities (unit_id, tenant_id, method_id, enabled) values ('tenant:2', 2, 'digital', false)`),
        ).rejects.toBeTruthy();
      });
    });
  });
});
