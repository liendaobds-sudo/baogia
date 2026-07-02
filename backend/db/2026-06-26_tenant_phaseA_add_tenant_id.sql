-- Tenant Data Isolation — Pha A (additive). Spec: .kiro/specs/tenant-data-isolation
-- Thêm cột tenant_id (nullable) + index + backfill về tenant gốc (id=1) cho các bảng org-scoped.
-- Idempotent (ADD COLUMN IF NOT EXISTS). Rollback: ALTER TABLE <t> DROP COLUMN tenant_id;
-- Đã áp lần đầu qua script node+pg ngày 2026-06-26 (4353 hàng backfill).
-- 2026-06-28: bổ sung 'daily_stats' + 'production_cost_configs' (org-scoped, phát hiện bởi
--   rls-coverage guard — xem src/common/tenant/rls-coverage.guard.spec.ts). Chạy lại file này
--   (idempotent) để thêm cột cho 2 bảng mới TRƯỚC khi chạy Pha B.
-- KHÔNG đụng các bảng global: tenants, subscription_plans, system_settings, payments,
-- roles, role_permissions, users, migrations.

BEGIN;

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
    -- Bỏ qua bảng KHÔNG tồn tại trong deployment này (mỗi môi trường có thể thiếu vài bảng
    -- do entity chưa tạo bảng). Tránh vỡ cả transaction chỉ vì 1 bảng vắng mặt.
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE '[phaseA] bỏ qua bảng không tồn tại: %', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id INTEGER', t);
    EXECUTE format('UPDATE %I SET tenant_id = 1 WHERE tenant_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(tenant_id)', 'idx_' || t || '_tenant', t);
  END LOOP;
END $$;

COMMIT;
