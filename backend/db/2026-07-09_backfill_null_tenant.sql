-- Backfill tenant_id còn NULL → tenant gốc (id=1) cho các bảng org-scoped.
-- Bối cảnh (điều tra 2026-07-09): chỉ tenant 1 có dữ liệu thật; tenants 4/5/6/7 là TEST
-- (mỗi tenant chỉ 1 user, không có dữ liệu nghiệp vụ). Mọi dòng NULL đều thuộc tenant 1
-- (truy từ channel/material hoặc mặc định). An toàn, idempotent (chỉ chạm dòng NULL).
--
-- Mục đích: gỡ blocker cho Pha B (ALTER COLUMN tenant_id SET NOT NULL) — nếu còn NULL,
-- migration NOT NULL sẽ FAIL và/hoặc RLS ẩn mất các dòng đó.
-- KHÔNG bật RLS ở đây; chỉ vá dữ liệu. Rollback: không cần (giá trị đúng).

BEGIN;

DO $$
DECLARE
  t text;
  n bigint;
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
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      CONTINUE; -- bảng không tồn tại ở deployment này
    END IF;
    -- chỉ chạy nếu có cột tenant_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = t AND column_name = 'tenant_id'
    ) THEN CONTINUE; END IF;

    EXECUTE format('UPDATE %I SET tenant_id = 1 WHERE tenant_id IS NULL', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'backfill %: % hàng', t, n; END IF;
  END LOOP;
END $$;

COMMIT;
