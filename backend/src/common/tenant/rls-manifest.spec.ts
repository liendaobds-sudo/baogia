import * as fs from 'node:fs';
import * as path from 'node:path';
import { TENANT_RLS_MANIFEST, TENANT_RLS_TABLES } from './rls-manifest';

const PHASE_B_SQL = path.resolve(__dirname, '../../../db/2026-06-26_tenant_phaseB_enable_rls.sql');

function parseCommonTables(sql: string): string[] {
  const match = sql.match(/org_tables\s+text\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/i);
  if (!match) throw new Error('Không tìm thấy org_tables trong SQL Pha B');
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

describe('TENANT_RLS_MANIFEST parity với SQL Pha B', () => {
  const sql = fs.readFileSync(PHASE_B_SQL, 'utf8');

  it('commonTables khớp chính xác mảng org_tables, không thiếu/thừa/trùng', () => {
    const fromSql = parseCommonTables(sql);
    expect(new Set(fromSql).size).toBe(fromSql.length);
    expect(new Set(TENANT_RLS_MANIFEST.commonTables).size).toBe(TENANT_RLS_MANIFEST.commonTables.length);
    expect([...TENANT_RLS_MANIFEST.commonTables].sort()).toEqual([...fromSql].sort());
  });

  it('mỗi baseline table có đúng policy tên trong manifest và bật cả RLS/FORCE', () => {
    for (const [table, policies] of Object.entries(TENANT_RLS_MANIFEST.baselineTables)) {
      for (const policy of policies) {
        expect(sql).toMatch(new RegExp(`CREATE\\s+POLICY\\s+${policy}\\s+ON\\s+${table}`, 'i'));
      }
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'));
    }
  });

  it('tập runtime gồm common + baseline, không trùng tên', () => {
    const expected = [
      ...TENANT_RLS_MANIFEST.commonTables,
      ...Object.keys(TENANT_RLS_MANIFEST.baselineTables),
    ];
    expect([...TENANT_RLS_TABLES]).toEqual(expected);
    expect(new Set(TENANT_RLS_TABLES).size).toBe(TENANT_RLS_TABLES.length);
  });
});
