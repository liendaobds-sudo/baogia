-- Tenant Data Isolation — Pha B (ENFORCE). Spec: .kiro/specs/tenant-data-isolation
-- ⚠️ CHƯA CHẠY. Chỉ áp trong phiên có kiểm soát (xem checklist dưới).
--
-- ⚠️⚠️ GOTCHA SỐNG CÒN: PostgreSQL SUPERUSER (vd role `postgres`) BỎ QUA RLS.
--   App hiện kết nối bằng `postgres` → RLS sẽ KHÔNG có tác dụng.
--   BẮT BUỘC trước khi bật: tạo role ứng dụng KHÔNG superuser và đổi DB_USERNAME:
--     CREATE ROLE zeplao_app LOGIN PASSWORD '...' NOSUPERUSER;
--     GRANT USAGE ON SCHEMA public TO zeplao_app;
--     GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO zeplao_app;
--     GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO zeplao_app;
--   (FORCE ROW LEVEL SECURITY chỉ ép chủ-bảng; superuser vẫn bypass.)
--
-- CHECKLIST trước khi chạy:
--   1. Backup DB (pg_dump / snapshot).
--   2. Task 7 đã wire: MỌI đọc/ghi org-scoped chạy trong tenantTransaction() (set_config).
--      Nếu chưa wire mà bật RLS → app trả 0 hàng → trắng dữ liệu.
--   3. Tạm dừng backend (nest watch) hoặc chạy trên DB staging/bản sao.
--   4. Dùng role ứng dụng NOSUPERUSER (gotcha trên).
-- Rollback: DISABLE ROW LEVEL SECURITY + DROP POLICY + (tuỳ chọn) DROP NOT NULL.

BEGIN;

-- Trigger tự gán tenant_id khi INSERT (lấy từ biến phiên do tenantTransaction set).
CREATE OR REPLACE FUNCTION app_set_tenant_id() RETURNS trigger AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := nullif(current_setting('app.current_tenant', true), '')::int;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
  org_tables text[] := ARRAY[
    'accessories','ai_conversations','ai_suggestions','appointments','audit_logs',
    'binding_types','canned_responses','channels','contacts','conversation_participants',
    'conversations','customer_interactions','customer_price_groups','customers','daily_stats',
    'follow_ups','ink_costs','internal_notes','inventory_slip_items','inventory_slips','kb_chunks',
    'kb_documents','large_format_pricing','material_categories','material_types','materials',
    'messages','notifications','offset_cfg_ep_kim','offset_cfg_fixed_size',
    'offset_cfg_gia_cong','offset_cfg_kem','offset_cfg_kho_in','offset_cfg_vat_tu_be_mat',
    'offset_machine_config','paper_sizes','plate_pricing','pricing_config','pricing_tiers',
    'print_types','printers','processing_options','processing_pricing','product_ai_fields',
    'product_categories','product_quote_configs','production_cost_configs','production_costs','products','quick_prices',
    'quote_items','quote_rules','quote_versions','quotes','setup_fees','site_settings',
    'unified_product_categories','unified_products','units','waste_rules','webhook_settings',
    'zalo_accounts'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    -- Bỏ qua bảng KHÔNG tồn tại trong deployment này (tránh vỡ cả transaction chỉ vì 1 bảng vắng).
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE '[phaseB] bỏ qua bảng không tồn tại: %', t;
      CONTINUE;
    END IF;
    -- 1) Khoá NOT NULL (đã backfill ở Pha A)
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', t);
    -- 2) Trigger auto-set tenant_id khi INSERT
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_set_tenant BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION app_set_tenant_id()', t);
    -- 3) Policy cô lập (mặc-định-đóng): thiếu app.current_tenant ⇒ 0 hàng
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
      WITH CHECK (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
    $f$, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- method_capabilities — RLS ĐẶC BIỆT (tenant-method-capability, Task 7).
--
-- KHÁC bảng org-scoped thường:
--   • Hàng BASELINE (tenant_id IS NULL, unit_id='default') = mặc định nền, PHẢI đọc
--     được bởi MỌI tenant (CapabilityService kế thừa baseline khi tenant chưa cấu hình).
--     → KHÔNG SET NOT NULL, KHÔNG gắn trigger auto-set (sẽ phá hàng baseline).
--   • Hàng THEO TENANT (tenant_id = <id>) chỉ tenant đó thấy.
--
-- TÁCH đọc/ghi (2 policy) — KHÁC bảng thường (1 policy FOR ALL):
--   • mc_read (FOR SELECT): bypass HOẶC tenant_id IS NULL (baseline) HOẶC tenant_id = current.
--   • mc_write (FOR ALL): bypass HOẶC tenant_id = current — tenant chỉ ghi hàng CỦA MÌNH.
-- Vì sao tách: nếu gộp 1 policy FOR ALL có `tenant_id IS NULL` trong USING thì UPDATE/DELETE
--   của tenant sẽ KHỚP hàng baseline (USING pass) rồi bị WITH CHECK từ chối → NÉM lỗi
--   "row violates row-level security policy". Tách ra: baseline nằm ngoài USING của mc_write
--   → UPDATE/DELETE của tenant không đụng baseline (0 hàng, KHÔNG lỗi). Ghi/sửa baseline
--   (tenant_id NULL) CHỈ qua bypass (super-admin). Phát hiện qua dry-run RLS.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.method_capabilities') IS NULL THEN
    RAISE NOTICE '[phaseB] bỏ qua method_capabilities (không tồn tại)';
  ELSE
    DROP POLICY IF EXISTS tenant_isolation ON method_capabilities;
    DROP POLICY IF EXISTS mc_read ON method_capabilities;
    DROP POLICY IF EXISTS mc_write ON method_capabilities;
    CREATE POLICY mc_read ON method_capabilities FOR SELECT
      USING (current_setting('app.bypass', true) = 'on'
             OR tenant_id IS NULL
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
    CREATE POLICY mc_write ON method_capabilities FOR ALL
      USING (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
      WITH CHECK (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
    ALTER TABLE method_capabilities ENABLE ROW LEVEL SECURITY;
    ALTER TABLE method_capabilities FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- tenant_app_scopes — RLS ĐẶC BIỆT (tenant-app-scope, Task 7).
--
-- Giống method_capabilities: hàng BASELINE (tenant_id IS NULL) = mặc-định-nền, PHẢI đọc
-- được bởi MỌI tenant (AppScopeService kế thừa baseline khi tenant chưa cấu hình).
-- → KHÔNG SET NOT NULL, KHÔNG trigger auto-set. TÁCH đọc/ghi để tenant UPDATE không đụng
--   baseline (tránh "row violates row-level security policy" — xem ghi chú mc_read/mc_write).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.tenant_app_scopes') IS NULL THEN
    RAISE NOTICE '[phaseB] bỏ qua tenant_app_scopes (không tồn tại)';
  ELSE
    DROP POLICY IF EXISTS app_scope_read ON tenant_app_scopes;
    DROP POLICY IF EXISTS app_scope_write ON tenant_app_scopes;
    CREATE POLICY app_scope_read ON tenant_app_scopes FOR SELECT
      USING (current_setting('app.bypass', true) = 'on'
             OR tenant_id IS NULL
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
    CREATE POLICY app_scope_write ON tenant_app_scopes FOR ALL
      USING (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
      WITH CHECK (current_setting('app.bypass', true) = 'on'
             OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
    ALTER TABLE tenant_app_scopes ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_app_scopes FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

COMMIT;
