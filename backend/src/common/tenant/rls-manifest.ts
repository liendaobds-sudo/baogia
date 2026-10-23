/**
 * Manifest runtime của Pha B RLS. Danh sách này PHẢI parity với
 * `db/2026-06-26_tenant_phaseB_enable_rls.sql`; test anti-drift sẽ fail nếu lệch.
 */
export const TENANT_RLS_MANIFEST = {
  schema: 'public',
  commonTables: [
    'accessories',
    'ai_conversations',
    'ai_suggestions',
    'appointments',
    'audit_logs',
    'binding_types',
    'canned_responses',
    'channels',
    'contacts',
    'conversation_participants',
    'conversations',
    'customer_interactions',
    'customer_price_groups',
    'customers',
    // 'daily_stats' — ĐÃ GỠ (audit 2026-08-29): bảng chưa bao giờ tồn tại trên PostgreSQL
    // (chỉ có trong migration legacy SQLite chưa từng chạy) và entity `DailyStat` là code
    // chết đã xoá. Để lại trong manifest khiến `inspectRlsCatalog` báo "bảng không tồn tại"
    // ⇒ preflight verdict `fatal` ⇒ app KHÔNG listen ngay lần bật TENANT_RLS_ENABLED đầu tiên.
    'follow_ups',
    'ink_costs',
    'internal_notes',
    'inventory_slip_items',
    'inventory_slips',
    'kb_chunks',
    'kb_documents',
    'large_format_pricing',
    'material_categories',
    'material_types',
    'materials',
    'messages',
    'notifications',
    'offset_cfg_ep_kim',
    'offset_cfg_fixed_size',
    'offset_cfg_gia_cong',
    'offset_cfg_kem',
    'offset_cfg_kho_in',
    'offset_cfg_vat_tu_be_mat',
    'offset_machine_config',
    'paper_sizes',
    'plate_pricing',
    'pricing_config',
    'pricing_tiers',
    'print_types',
    'printers',
    'processing_options',
    'processing_pricing',
    'product_ai_fields',
    'product_categories',
    'product_quote_configs',
    // 'production_cost_configs' — ĐÃ GỠ (audit 2026-08-29): không entity, không CREATE TABLE
    // trong db/*.sql lẫn migrations/*.sql; chỉ xuất hiện ở migration legacy SQLite.
    // Cùng lý do fatal-preflight như `daily_stats`. Bảng thật đang dùng là `production_costs`.
    'production_costs',
    'products',
    'quick_prices',
    'quote_items',
    'quote_rules',
    'quote_versions',
    'quotes',
    'setup_fees',
    'site_settings',
    'unified_product_categories',
    'unified_products',
    'units',
    'waste_rules',
    'webhook_settings',
    'zalo_accounts',
  ],
  baselineTables: {
    method_capabilities: ['mc_read', 'mc_write'],
    tenant_app_scopes: ['app_scope_read', 'app_scope_write'],
  },
} as const;

export type TenantRlsManifest = typeof TENANT_RLS_MANIFEST;

export const TENANT_RLS_TABLES = [
  ...TENANT_RLS_MANIFEST.commonTables,
  ...Object.keys(TENANT_RLS_MANIFEST.baselineTables),
] as const;

export const TENANT_POLICY_NAMES = [
  'tenant_isolation',
  ...new Set(Object.values(TENANT_RLS_MANIFEST.baselineTables).flat()),
] as const;
