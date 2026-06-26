-- ============================================================
-- PostgreSQL schema snapshot (public) — ZeplaoPrint ERP
-- Sinh bởi backend/db/dump-schema.js (introspection từ DB thật).
-- NGUỒN SỰ THẬT = TypeORM entities; file này là bản chụp tái lập của
-- những gì `synchronize` đã tạo. Regenerate sau khi đổi entity.
-- Generated at: 2026-06-25T08:52:12.339Z
-- ============================================================

SET search_path TO public;

-- ─── Sequences ───
CREATE SEQUENCE IF NOT EXISTS "accessories_id_seq";
CREATE SEQUENCE IF NOT EXISTS "ai_conversations_id_seq";
CREATE SEQUENCE IF NOT EXISTS "binding_types_id_seq";
CREATE SEQUENCE IF NOT EXISTS "customer_interactions_id_seq";
CREATE SEQUENCE IF NOT EXISTS "customer_price_groups_id_seq";
CREATE SEQUENCE IF NOT EXISTS "customers_id_seq";
CREATE SEQUENCE IF NOT EXISTS "ink_costs_id_seq";
CREATE SEQUENCE IF NOT EXISTS "inventory_slip_items_id_seq";
CREATE SEQUENCE IF NOT EXISTS "inventory_slips_id_seq";
CREATE SEQUENCE IF NOT EXISTS "large_format_pricing_id_seq";
CREATE SEQUENCE IF NOT EXISTS "material_categories_id_seq";
CREATE SEQUENCE IF NOT EXISTS "material_types_id_seq";
CREATE SEQUENCE IF NOT EXISTS "materials_id_seq";
CREATE SEQUENCE IF NOT EXISTS "method_capabilities_id_seq";
CREATE SEQUENCE IF NOT EXISTS "migrations_id_seq";
CREATE SEQUENCE IF NOT EXISTS "offset_cfg_fixed_size_id_seq";
CREATE SEQUENCE IF NOT EXISTS "offset_cfg_kem_id_seq";
CREATE SEQUENCE IF NOT EXISTS "offset_machine_config_id_seq";
CREATE SEQUENCE IF NOT EXISTS "paper_sizes_id_seq";
CREATE SEQUENCE IF NOT EXISTS "payments_id_seq";
CREATE SEQUENCE IF NOT EXISTS "plate_pricing_id_seq";
CREATE SEQUENCE IF NOT EXISTS "pricing_config_id_seq";
CREATE SEQUENCE IF NOT EXISTS "pricing_tiers_id_seq";
CREATE SEQUENCE IF NOT EXISTS "print_types_id_seq";
CREATE SEQUENCE IF NOT EXISTS "printers_id_seq";
CREATE SEQUENCE IF NOT EXISTS "processing_options_id_seq";
CREATE SEQUENCE IF NOT EXISTS "processing_pricing_id_seq";
CREATE SEQUENCE IF NOT EXISTS "product_ai_fields_id_seq";
CREATE SEQUENCE IF NOT EXISTS "product_categories_id_seq";
CREATE SEQUENCE IF NOT EXISTS "product_quote_configs_id_seq";
CREATE SEQUENCE IF NOT EXISTS "production_costs_id_seq";
CREATE SEQUENCE IF NOT EXISTS "products_id_seq";
CREATE SEQUENCE IF NOT EXISTS "quote_items_id_seq";
CREATE SEQUENCE IF NOT EXISTS "quote_versions_id_seq";
CREATE SEQUENCE IF NOT EXISTS "quotes_id_seq";
CREATE SEQUENCE IF NOT EXISTS "role_permissions_id_seq";
CREATE SEQUENCE IF NOT EXISTS "roles_id_seq";
CREATE SEQUENCE IF NOT EXISTS "setup_fees_id_seq";
CREATE SEQUENCE IF NOT EXISTS "site_settings_id_seq";
CREATE SEQUENCE IF NOT EXISTS "subscription_plans_id_seq";
CREATE SEQUENCE IF NOT EXISTS "tenants_id_seq";
CREATE SEQUENCE IF NOT EXISTS "unified_product_categories_id_seq";
CREATE SEQUENCE IF NOT EXISTS "unified_products_id_seq";
CREATE SEQUENCE IF NOT EXISTS "units_id_seq";
CREATE SEQUENCE IF NOT EXISTS "waste_rules_id_seq";

-- ─── Table: accessories ───
CREATE TABLE IF NOT EXISTS "accessories" (
  "id" integer DEFAULT nextval('accessories_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(200) NOT NULL,
  "price" numeric(15,2) DEFAULT 0,
  "unit" character varying(20) DEFAULT 'cái'::character varying,
  "is_active" integer DEFAULT 1,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: ai_conversations ───
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" integer DEFAULT nextval('ai_conversations_id_seq'::regclass) NOT NULL,
  "session_id" character varying(100) NOT NULL,
  "customer_id" integer,
  "quote_id" integer,
  "source" character varying(50) DEFAULT 'website'::character varying NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: ai_suggestions ───
CREATE TABLE IF NOT EXISTS "ai_suggestions" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "trigger_message_id" character varying,
  "replies" text NOT NULL,
  "missing_info" text DEFAULT '[]'::text NOT NULL,
  "sources" text DEFAULT '[]'::text NOT NULL,
  "confidence" real,
  "warnings" text DEFAULT '[]'::text NOT NULL,
  "quote_result" text,
  "intent" character varying(50),
  "prompt_version" character varying(20) DEFAULT 'v1.0'::character varying NOT NULL,
  "model" character varying(50) DEFAULT 'gpt-4o'::character varying NOT NULL,
  "latency_ms" integer,
  "token_usage" text,
  "auto_reply_eligible" boolean DEFAULT false NOT NULL,
  "edited_text" text,
  "edited_at" timestamp without time zone,
  "used_reply_index" integer,
  "status" character varying DEFAULT 'generated'::character varying NOT NULL,
  "rejection_reason" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "agent_feedback" character varying
);

-- ─── Table: appointments ───
CREATE TABLE IF NOT EXISTS "appointments" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "contact_id" uuid NOT NULL,
  "assigned_user_id" uuid,
  "appointment_date" timestamp without time zone NOT NULL,
  "appointment_time" character varying(10),
  "type" character varying(50),
  "status" character varying DEFAULT 'scheduled'::character varying NOT NULL,
  "notes" text,
  "reminder_sent" boolean DEFAULT false NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: audit_logs ───
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid,
  "action" character varying(50) NOT NULL,
  "entity_type" character varying(50) NOT NULL,
  "entity_id" character varying NOT NULL,
  "old_value" text,
  "new_value" text,
  "metadata" text DEFAULT '{}'::text NOT NULL,
  "ip_address" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: binding_types ───
CREATE TABLE IF NOT EXISTS "binding_types" (
  "id" integer DEFAULT nextval('binding_types_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "name_en" character varying(100),
  "min_pages" integer DEFAULT 0,
  "max_pages" integer,
  "price_per_book" numeric(15,2) DEFAULT 0 NOT NULL,
  "price_per_page" numeric(15,2) DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: canned_responses ───
CREATE TABLE IF NOT EXISTS "canned_responses" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "title" character varying(100) NOT NULL,
  "content" text NOT NULL,
  "category" character varying(50) NOT NULL,
  "shortcut" character varying(20) DEFAULT '/'::character varying NOT NULL,
  "use_count" integer DEFAULT 0 NOT NULL,
  "is_global" boolean DEFAULT true NOT NULL,
  "trigger_keywords" text DEFAULT ''::text NOT NULL,
  "auto_reply" boolean DEFAULT false NOT NULL,
  "created_by" uuid,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: channels ───
CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "type" character varying NOT NULL,
  "name" character varying(100) NOT NULL,
  "external_id" character varying NOT NULL,
  "access_token_enc" text,
  "refresh_token_enc" text,
  "token_expires_at" timestamp without time zone,
  "webhook_secret" character varying,
  "config" text DEFAULT '{}'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: contacts ───
CREATE TABLE IF NOT EXISTS "contacts" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "channel_id" uuid NOT NULL,
  "external_user_id" character varying NOT NULL,
  "display_name" character varying,
  "avatar_url" character varying,
  "phone" character varying(20),
  "email" character varying,
  "tags" text DEFAULT '[]'::text NOT NULL,
  "memory_facts" text DEFAULT '[]'::text NOT NULL,
  "customer_profile" text DEFAULT '{}'::text NOT NULL,
  "metadata" text DEFAULT '{}'::text NOT NULL,
  "first_contact_at" timestamp without time zone,
  "last_contact_at" timestamp without time zone,
  "pipeline_status" character varying DEFAULT 'new'::character varying NOT NULL,
  "source" character varying(20),
  "source_date" timestamp without time zone,
  "notes" text,
  "next_appointment" timestamp without time zone,
  "assigned_user_id" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: conversation_participants ───
CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" character varying DEFAULT 'collaborator'::character varying NOT NULL,
  "can_view_customer_info" boolean DEFAULT false NOT NULL,
  "added_by" character varying,
  "added_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: conversations ───
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "channel_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "assignee_id" uuid,
  "status" character varying DEFAULT 'new'::character varying NOT NULL,
  "priority" character varying DEFAULT 'normal'::character varying NOT NULL,
  "subject" character varying,
  "product_type" character varying(50),
  "last_message_at" timestamp without time zone,
  "last_customer_message_at" timestamp without time zone,
  "sla_deadline" timestamp without time zone,
  "sla_breached" boolean DEFAULT false NOT NULL,
  "unread_count" integer DEFAULT 0 NOT NULL,
  "tags" text DEFAULT '[]'::text NOT NULL,
  "metadata" text DEFAULT '{}'::text NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "ai_summary" text,
  "ai_summary_at" timestamp without time zone,
  "ai_summary_msg_count" integer DEFAULT 0 NOT NULL,
  "outcome_data" text DEFAULT '{}'::text NOT NULL,
  "closed_at" timestamp without time zone,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "linked_order_id" character varying
);

-- ─── Table: customer_interactions ───
CREATE TABLE IF NOT EXISTS "customer_interactions" (
  "id" integer DEFAULT nextval('customer_interactions_id_seq'::regclass) NOT NULL,
  "customer_id" integer NOT NULL,
  "type" character varying(30) DEFAULT 'note'::character varying,
  "content" text,
  "lost_reason" character varying(100),
  "product_interest" text,
  "follow_up_date" date,
  "quote_id" integer,
  "created_by" integer,
  "created_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: customer_price_groups ───
CREATE TABLE IF NOT EXISTS "customer_price_groups" (
  "id" integer DEFAULT nextval('customer_price_groups_id_seq'::regclass) NOT NULL,
  "code" character varying(20) NOT NULL,
  "name" character varying(100) NOT NULL,
  "discount_percent" numeric(5,2) DEFAULT '0'::numeric,
  "min_order_value" numeric(15,2) DEFAULT '0'::numeric,
  "description" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: customers ───
CREATE TABLE IF NOT EXISTS "customers" (
  "id" integer DEFAULT nextval('customers_id_seq'::regclass) NOT NULL,
  "supabase_uid" character varying(255),
  "code" character varying(20),
  "name" character varying(100) NOT NULL,
  "customer_type" character varying(20) DEFAULT 'individual'::character varying NOT NULL,
  "phone" character varying(20),
  "email" character varying(100),
  "address" text,
  "billing_address" text,
  "contact_person" character varying(255),
  "contact_phone" character varying(20),
  "company" character varying(255),
  "organization_name" character varying(255),
  "representative" character varying(255),
  "position" character varying(100),
  "tax_code" character varying(50),
  "bank_account" character varying(50),
  "bank_name" character varying(100),
  "notes" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "credit_limit" numeric(15,2) DEFAULT '0'::numeric,
  "current_debt" numeric(15,2) DEFAULT '0'::numeric,
  "source" character varying(50) DEFAULT 'web'::character varying,
  "preferences" text,
  "tags" text,
  "rfm_r" integer DEFAULT 0,
  "rfm_f" integer DEFAULT 0,
  "rfm_m" integer DEFAULT 0,
  "rfm_score" integer DEFAULT 0,
  "rfm_segment" character varying(50),
  "rfm_calculated_at" timestamp without time zone,
  "last_order_at" timestamp without time zone,
  "price_group_id" integer,
  "lifecycle_stage" character varying(20) DEFAULT 'lead'::character varying,
  "lost_reason" character varying(100),
  "follow_up_date" date,
  "product_interest" text
);

-- ─── Table: follow_ups ───
CREATE TABLE IF NOT EXISTS "follow_ups" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "message" text NOT NULL,
  "status" character varying DEFAULT 'pending'::character varying NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "scheduled_at" timestamp without time zone NOT NULL,
  "sent_at" timestamp without time zone,
  "context" character varying(50),
  "rejection_reason" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: ink_costs ───
CREATE TABLE IF NOT EXISTS "ink_costs" (
  "id" integer DEFAULT nextval('ink_costs_id_seq'::regclass) NOT NULL,
  "print_type" character varying(50) NOT NULL,
  "print_type_name" character varying(100),
  "ml_per_sheet" numeric(10,4) DEFAULT 0 NOT NULL,
  "price_per_ml" numeric(10,2) DEFAULT 0 NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: internal_notes ───
CREATE TABLE IF NOT EXISTS "internal_notes" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "scope" character varying(20) DEFAULT 'conversation'::character varying NOT NULL,
  "contact_id" uuid,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: inventory_slip_items ───
CREATE TABLE IF NOT EXISTS "inventory_slip_items" (
  "id" integer DEFAULT nextval('inventory_slip_items_id_seq'::regclass) NOT NULL,
  "slip_id" integer NOT NULL,
  "material_id" integer NOT NULL,
  "quantity" numeric(15,2) DEFAULT '0'::numeric NOT NULL,
  "unit_price" numeric(15,2) DEFAULT '0'::numeric,
  "notes" text
);

-- ─── Table: inventory_slips ───
CREATE TABLE IF NOT EXISTS "inventory_slips" (
  "id" integer DEFAULT nextval('inventory_slips_id_seq'::regclass) NOT NULL,
  "type" character varying(50) NOT NULL,
  "status" character varying(50) DEFAULT 'confirmed'::character varying NOT NULL,
  "reason" character varying(100),
  "notes" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: kb_chunks ───
CREATE TABLE IF NOT EXISTS "kb_chunks" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "document_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "token_count" integer,
  "embedding" text,
  "tags" text DEFAULT '[]'::text NOT NULL,
  "metadata" text DEFAULT '{}'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "chunk_type" character varying,
  "parent_chunk_id" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: kb_documents ───
CREATE TABLE IF NOT EXISTS "kb_documents" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "title" character varying NOT NULL,
  "file_url" text NOT NULL,
  "file_type" character varying(20) NOT NULL,
  "file_size" integer,
  "tags" text DEFAULT '[]'::text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "parent_id" character varying,
  "status" character varying DEFAULT 'processing'::character varying NOT NULL,
  "chunk_count" integer DEFAULT 0 NOT NULL,
  "error_message" character varying,
  "uploaded_by_id" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "uploaded_by" uuid
);

-- ─── Table: large_format_pricing ───
CREATE TABLE IF NOT EXISTS "large_format_pricing" (
  "id" integer DEFAULT nextval('large_format_pricing_id_seq'::regclass) NOT NULL,
  "material_id" integer,
  "material_code" character varying(50),
  "material_name" character varying(200),
  "area_from" double precision NOT NULL,
  "area_to" double precision,
  "price_per_sqm" double precision NOT NULL,
  "min_charge" double precision DEFAULT '0'::double precision NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: material_categories ───
CREATE TABLE IF NOT EXISTS "material_categories" (
  "id" integer DEFAULT nextval('material_categories_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "icon" character varying(50),
  "color" character varying(20),
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" smallint DEFAULT '1'::smallint NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: material_types ───
CREATE TABLE IF NOT EXISTS "material_types" (
  "id" integer DEFAULT nextval('material_types_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "tab_scope" character varying(30) DEFAULT 'sheet'::character varying NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: materials ───
CREATE TABLE IF NOT EXISTS "materials" (
  "id" integer DEFAULT nextval('materials_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(200) NOT NULL,
  "type" character varying(50) NOT NULL,
  "category" character varying(50) DEFAULT 'printing'::character varying NOT NULL,
  "category_tab" character varying(50),
  "paper_size_id" integer,
  "unit_id" integer,
  "unit" character varying(20),
  "gsm" integer,
  "unit_price" double precision DEFAULT '0'::double precision NOT NULL,
  "cost_price" double precision DEFAULT '0'::double precision NOT NULL,
  "pricePerSheet" numeric(15,2),
  "setupFee" numeric(15,2) DEFAULT '0'::numeric,
  "material_format" character varying(20) DEFAULT 'sheet'::character varying NOT NULL,
  "price_unit" character varying(20) DEFAULT 'sheet'::character varying NOT NULL,
  "scope_loose" boolean DEFAULT true NOT NULL,
  "scope_bound" boolean DEFAULT false NOT NULL,
  "scope_large_format" boolean DEFAULT false NOT NULL,
  "stock" double precision DEFAULT '100'::double precision NOT NULL,
  "min_stock" double precision DEFAULT '10'::double precision NOT NULL,
  "status" character varying(20) DEFAULT 'normal'::character varying NOT NULL,
  "width" double precision,
  "height" double precision,
  "roll_width" double precision,
  "roll_length" double precision,
  "charge_full_width" boolean DEFAULT false NOT NULL,
  "min_charge_area" double precision,
  "price_per_sqm" double precision,
  "waste_percent" double precision,
  "notes" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "scope_offset" boolean DEFAULT false NOT NULL
);

-- ─── Table: messages ───
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "sender_type" character varying NOT NULL,
  "sender_id" character varying,
  "sender_name" character varying,
  "sender_avatar_url" character varying,
  "content" text,
  "content_type" character varying DEFAULT 'text'::character varying NOT NULL,
  "attachments" text DEFAULT '[]'::text NOT NULL,
  "reactions" text DEFAULT '{}'::text NOT NULL,
  "external_msg_id" character varying,
  "external_cli_msg_id" character varying,
  "idempotency_key" character varying,
  "status" character varying DEFAULT 'received'::character varying NOT NULL,
  "suggestion_id" character varying,
  "suggestion_action" character varying,
  "error_detail" character varying,
  "quote_id" character varying,
  "quote_data" text,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "is_starred" boolean DEFAULT false NOT NULL,
  "is_local_deleted" boolean DEFAULT false NOT NULL,
  "is_media_backed_up" boolean DEFAULT false NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: method_capabilities ───
CREATE TABLE IF NOT EXISTS "method_capabilities" (
  "id" integer DEFAULT nextval('method_capabilities_id_seq'::regclass) NOT NULL,
  "unit_id" character varying(50) DEFAULT 'default'::character varying NOT NULL,
  "method_id" character varying(30) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: migrations ───
CREATE TABLE IF NOT EXISTS "migrations" (
  "id" integer DEFAULT nextval('migrations_id_seq'::regclass) NOT NULL,
  "timestamp" bigint NOT NULL,
  "name" character varying NOT NULL
);

-- ─── Table: notifications ───
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" character varying(50) NOT NULL,
  "title" character varying NOT NULL,
  "body" text,
  "link" character varying,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: offset_cfg_ep_kim ───
CREATE TABLE IF NOT EXISTS "offset_cfg_ep_kim" (
  "vi_tri" character varying(60) NOT NULL,
  "duoi100" numeric(15,4) DEFAULT 0 NOT NULL,
  "tu100_499" numeric(15,4) DEFAULT 0 NOT NULL,
  "tu500_999" numeric(15,4) DEFAULT 0 NOT NULL,
  "tren1000" numeric(15,4) DEFAULT 0 NOT NULL
);

-- ─── Table: offset_cfg_fixed_size ───
CREATE TABLE IF NOT EXISTS "offset_cfg_fixed_size" (
  "id" integer DEFAULT nextval('offset_cfg_fixed_size_id_seq'::regclass) NOT NULL,
  "nhom" character varying(40) NOT NULL,
  "kich_thuoc" character varying(80) NOT NULL,
  "kho_in" character varying(80),
  "kho_giay_lon" character varying(80),
  "so_con_bai_in" integer,
  "so_con_to_lon" integer,
  "so_con_kho_giay_lon" integer,
  "loai" character varying(40)
);

-- ─── Table: offset_cfg_gia_cong ───
CREATE TABLE IF NOT EXISTS "offset_cfg_gia_cong" (
  "code" character varying(60) NOT NULL,
  "cong_doan" character varying(200),
  "ghi_chu" text,
  "tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "billing_mode" character varying(30) DEFAULT 'perUnit'::character varying NOT NULL,
  "min_charge_param" character varying(60),
  "moq_param" character varying(60),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: offset_cfg_kem ───
CREATE TABLE IF NOT EXISTS "offset_cfg_kem" (
  "id" integer DEFAULT nextval('offset_cfg_kem_id_seq'::regclass) NOT NULL,
  "bang" character varying(20) NOT NULL,
  "so_kem" integer NOT NULL,
  "don_gia" numeric(15,2) DEFAULT 0 NOT NULL
);

-- ─── Table: offset_cfg_kho_in ───
CREATE TABLE IF NOT EXISTS "offset_cfg_kho_in" (
  "kho_in" character varying(80) NOT NULL,
  "chia_to" character varying(80),
  "so_con_bai_in" integer DEFAULT 0 NOT NULL,
  "so_con_to_lon" integer DEFAULT 0 NOT NULL,
  "kho_giay_lon" character varying(80),
  "dien_tich_m2" numeric(12,5) DEFAULT 0 NOT NULL,
  "loai_kem" character varying(40),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: offset_cfg_vat_tu_be_mat ───
CREATE TABLE IF NOT EXISTS "offset_cfg_vat_tu_be_mat" (
  "ten" character varying(120) NOT NULL,
  "don_gia_kg" numeric(15,4) DEFAULT 0 NOT NULL,
  "so_mat" character varying(20)
);

-- ─── Table: offset_machine_config ───
CREATE TABLE IF NOT EXISTS "offset_machine_config" (
  "id" integer DEFAULT nextval('offset_machine_config_id_seq'::regclass) NOT NULL,
  "name" character varying(100) NOT NULL,
  "code" character varying(30) NOT NULL,
  "max_width" numeric(10,2) NOT NULL,
  "max_height" numeric(10,2) NOT NULL,
  "gripper_margin" numeric(5,2) DEFAULT 10,
  "run_price_per_1000" numeric(15,2) DEFAULT 0,
  "min_run_charge" numeric(15,2) DEFAULT 0,
  "makeready_fee" numeric(15,2) DEFAULT 200000,
  "max_speed_sheets_per_hour" integer DEFAULT 8000,
  "color_units" integer DEFAULT 4,
  "description" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: paper_sizes ───
CREATE TABLE IF NOT EXISTS "paper_sizes" (
  "id" integer DEFAULT nextval('paper_sizes_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "width" numeric(10,2) NOT NULL,
  "height" numeric(10,2) NOT NULL,
  "is_standard" boolean DEFAULT false NOT NULL,
  "margin_top" integer DEFAULT 0,
  "margin_bottom" integer DEFAULT 0,
  "margin_left" integer DEFAULT 0,
  "margin_right" integer DEFAULT 0,
  "roll_length" numeric(10,2),
  "charge_full_width" boolean DEFAULT true NOT NULL,
  "scope_loose" boolean DEFAULT true NOT NULL,
  "scope_bound" boolean DEFAULT true NOT NULL,
  "scope_large_format" boolean DEFAULT false NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "scope_offset" boolean DEFAULT false,
  "kho_giay_lon" character varying(50),
  "chia_to" character varying(50),
  "so_con_bai_in" integer,
  "so_con_to_lon" integer,
  "loai_kem" character varying(50)
);

-- ─── Table: payments ───
CREATE TABLE IF NOT EXISTS "payments" (
  "id" integer DEFAULT nextval('payments_id_seq'::regclass) NOT NULL,
  "tenant_id" integer NOT NULL,
  "plan_id" integer,
  "amount" numeric(12,0) NOT NULL,
  "payment_method" character varying(50) DEFAULT 'bank_transfer'::character varying NOT NULL,
  "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
  "billing_period" character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
  "period_start" timestamp without time zone,
  "period_end" timestamp without time zone,
  "invoice_number" character varying(50),
  "notes" text,
  "paid_at" timestamp without time zone,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: plate_pricing ───
CREATE TABLE IF NOT EXISTS "plate_pricing" (
  "id" integer DEFAULT nextval('plate_pricing_id_seq'::regclass) NOT NULL,
  "machine_id" integer,
  "plate_type" character varying(30) DEFAULT 'ctp'::character varying,
  "name" character varying(100),
  "price_per_plate" numeric(15,2) NOT NULL,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: pricing_config ───
CREATE TABLE IF NOT EXISTS "pricing_config" (
  "id" integer DEFAULT nextval('pricing_config_id_seq'::regclass) NOT NULL,
  "config_key" character varying(50) NOT NULL,
  "config_value" character varying(255) NOT NULL,
  "description" text,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: pricing_tiers ───
CREATE TABLE IF NOT EXISTS "pricing_tiers" (
  "id" integer DEFAULT nextval('pricing_tiers_id_seq'::regclass) NOT NULL,
  "material_id" integer NOT NULL,
  "paper_size_id" integer,
  "technology" character varying(50) DEFAULT 'digital_toner'::character varying NOT NULL,
  "print_side" character varying(10) DEFAULT 'single'::character varying NOT NULL,
  "print_type" character varying(10) DEFAULT '4c'::character varying NOT NULL,
  "quantity_from" integer NOT NULL,
  "quantity_to" integer,
  "price_per_sheet" double precision NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: print_types ───
CREATE TABLE IF NOT EXISTS "print_types" (
  "id" integer DEFAULT nextval('print_types_id_seq'::regclass) NOT NULL,
  "code" character varying(20) NOT NULL,
  "name" character varying(100) NOT NULL,
  "short_name" character varying(50),
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: printers ───
CREATE TABLE IF NOT EXISTS "printers" (
  "id" integer DEFAULT nextval('printers_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "resolution" character varying(50),
  "multiplier" numeric(4,2) DEFAULT '1'::numeric NOT NULL,
  "is_active" smallint DEFAULT '1'::smallint NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: processing_options ───
CREATE TABLE IF NOT EXISTS "processing_options" (
  "id" integer DEFAULT nextval('processing_options_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(200) NOT NULL,
  "keywords" text,
  "category" character varying(50),
  "type" character varying,
  "priceType" character varying(50),
  "price" numeric(15,2) DEFAULT '0'::numeric NOT NULL,
  "material_id" integer,
  "description" text,
  "is_active" smallint DEFAULT '1'::smallint NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now(),
  "width" numeric(10,2),
  "height" numeric(10,2),
  "quantity" integer,
  "paper_size_id" integer,
  "quantity_from" integer,
  "quantity_to" integer,
  "sides" integer,
  "scope_loose" smallint,
  "scope_bound" smallint,
  "scope_large_format" smallint,
  "scope_offset" boolean DEFAULT false,
  "billing_mode" character varying(30),
  "moq_param" character varying(60),
  "min_charge_param" character varying(60),
  "ghi_chu" text
);

-- ─── Table: processing_pricing ───
CREATE TABLE IF NOT EXISTS "processing_pricing" (
  "id" integer DEFAULT nextval('processing_pricing_id_seq'::regclass) NOT NULL,
  "processing_option_id" integer NOT NULL,
  "pricing_method" character varying(20) DEFAULT 'per_sqm'::character varying NOT NULL,
  "size_spec" character varying(100),
  "quantity_from" integer DEFAULT 1 NOT NULL,
  "quantity_to" integer,
  "unit_price" double precision NOT NULL,
  "min_charge" double precision DEFAULT '0'::double precision NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: product_ai_fields ───
CREATE TABLE IF NOT EXISTS "product_ai_fields" (
  "id" integer DEFAULT nextval('product_ai_fields_id_seq'::regclass) NOT NULL,
  "product_id" integer NOT NULL,
  "field_code" character varying(50) NOT NULL,
  "field_name" character varying(100) NOT NULL,
  "field_type" character varying(20) DEFAULT 'text'::character varying NOT NULL,
  "is_required" boolean DEFAULT true NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "default_value" text,
  "ai_question" text,
  "ai_keywords" text,
  "answer_patterns" text,
  "source_table" character varying(50),
  "source_filter" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: product_categories ───
CREATE TABLE IF NOT EXISTS "product_categories" (
  "id" integer DEFAULT nextval('product_categories_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "description" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: product_quote_configs ───
CREATE TABLE IF NOT EXISTS "product_quote_configs" (
  "id" integer DEFAULT nextval('product_quote_configs_id_seq'::regclass) NOT NULL,
  "product_id" integer NOT NULL,
  "allowed_materials" text,
  "allowed_paper_sizes" text,
  "allowed_processing" text,
  "allowed_accessories" text,
  "default_material_id" integer,
  "default_paper_size_id" integer,
  "default_print_side" character varying(10) DEFAULT 'double'::character varying NOT NULL,
  "default_print_type" character varying(10) DEFAULT '4c'::character varying NOT NULL,
  "default_quantity" integer DEFAULT 500 NOT NULL,
  "lock_print_side" boolean DEFAULT false NOT NULL,
  "lock_print_type" boolean DEFAULT false NOT NULL,
  "min_quantity" integer DEFAULT 1 NOT NULL,
  "max_quantity" integer DEFAULT 999999 NOT NULL,
  "default_width" integer,
  "default_height" integer,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: production_costs ───
CREATE TABLE IF NOT EXISTS "production_costs" (
  "id" integer DEFAULT nextval('production_costs_id_seq'::regclass) NOT NULL,
  "machine_name" character varying(100) DEFAULT 'Máy in chính'::character varying,
  "machine_value" numeric(15,2) DEFAULT '0'::numeric,
  "machine_depreciation_years" integer DEFAULT 5,
  "sheets_per_month" integer DEFAULT 50000,
  "electricity_per_hour" numeric(10,2) DEFAULT '50000'::numeric,
  "sheets_per_hour" integer DEFAULT 1000,
  "production_staff_count" integer DEFAULT 3,
  "avg_salary_monthly" numeric(12,2) DEFAULT '12000000'::numeric,
  "rent_monthly" numeric(12,2) DEFAULT '20000000'::numeric,
  "utilities_monthly" numeric(12,2) DEFAULT '5000000'::numeric,
  "other_monthly" numeric(12,2) DEFAULT '5000000'::numeric,
  "default_markup_percent" numeric(5,2) DEFAULT '30'::numeric,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: products ───
CREATE TABLE IF NOT EXISTS "products" (
  "id" integer DEFAULT nextval('products_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name_vi" character varying(200) NOT NULL,
  "name_en" character varying(200),
  "slug_vi" character varying(200),
  "slug_en" character varying(200),
  "category_id" integer,
  "quote_type" character varying(20) DEFAULT 'loose'::character varying NOT NULL,
  "description_vi" text,
  "description_en" text,
  "short_description_vi" character varying(500),
  "short_description_en" character varying(500),
  "images" text,
  "icon" character varying(50) DEFAULT 'fa-box'::character varying NOT NULL,
  "base_price" double precision DEFAULT '0'::double precision NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "is_best_seller" boolean DEFAULT false NOT NULL,
  "has_auto_pricing" boolean DEFAULT true NOT NULL,
  "requires_rfq" boolean DEFAULT false NOT NULL,
  "ai_keywords" text,
  "ai_enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: quick_prices ───
CREATE TABLE IF NOT EXISTS "quick_prices" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "name" character varying(200) NOT NULL,
  "keywords" text DEFAULT '[]'::text NOT NULL,
  "unit" character varying(20) DEFAULT 'tờ'::character varying NOT NULL,
  "tiers" text DEFAULT '[]'::text NOT NULL,
  "notes" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: quote_items ───
CREATE TABLE IF NOT EXISTS "quote_items" (
  "id" integer DEFAULT nextval('quote_items_id_seq'::regclass) NOT NULL,
  "quote_id" integer NOT NULL,
  "product_id" integer,
  "product_name" character varying(255),
  "product_type" character varying(50),
  "item_type" character varying(20) DEFAULT 'loose'::character varying,
  "quantity" integer DEFAULT 0,
  "unit" character varying(50) DEFAULT 'tờ'::character varying,
  "item_width" numeric(10,2) DEFAULT '0'::numeric,
  "item_height" numeric(10,2) DEFAULT '0'::numeric,
  "material_id" integer,
  "material_name" character varying(100),
  "paper_size_id" integer,
  "paper_size_name" character varying(100),
  "print_side" character varying(20),
  "print_type" character varying(50),
  "shape" character varying(50),
  "items_per_sheet" integer DEFAULT 0,
  "sheets_needed" integer DEFAULT 0,
  "processing_details" text,
  "item_total" numeric(15,2) DEFAULT '0'::numeric,
  "bound_size" character varying(50),
  "page_count" integer DEFAULT 0,
  "binding_type" character varying(50),
  "cover_material_id" integer,
  "inner_material_id" integer,
  "cover_material_name" character varying(255),
  "inner_material_name" character varying(255),
  "cover_print" character varying(50),
  "inner_print" character varying(50),
  "cover_finishing" text,
  "cover_sheets_needed" integer DEFAULT 0,
  "inner_sheets_needed" integer DEFAULT 0,
  "extra_services" text,
  "printing_detail" text,
  "parent_id" integer
);

-- ─── Table: quote_rules ───
CREATE TABLE IF NOT EXISTS "quote_rules" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "product_type" character varying(50) NOT NULL,
  "rule_name" character varying(100) NOT NULL,
  "required_slots" text NOT NULL,
  "pricing_formula" text NOT NULL,
  "leadtime_rules" text DEFAULT '{}'::text NOT NULL,
  "tech_notes" text,
  "min_quantity" integer DEFAULT 1 NOT NULL,
  "max_quantity" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "effective_from" character varying NOT NULL,
  "effective_to" character varying,
  "created_by_id" character varying,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

-- ─── Table: quote_versions ───
CREATE TABLE IF NOT EXISTS "quote_versions" (
  "id" integer DEFAULT nextval('quote_versions_id_seq'::regclass) NOT NULL,
  "quote_id" integer NOT NULL,
  "version_number" integer NOT NULL,
  "quote_data" text NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "created_by" integer,
  "note" text
);

-- ─── Table: quotes ───
CREATE TABLE IF NOT EXISTS "quotes" (
  "id" integer DEFAULT nextval('quotes_id_seq'::regclass) NOT NULL,
  "customer_id" integer,
  "code" character varying(50) NOT NULL,
  "quote_hash" character varying(64),
  "type" character varying(50) DEFAULT 'In nhanh'::character varying,
  "customer_name" character varying(100) DEFAULT 'Khách lẻ'::character varying,
  "customer_phone" character varying(20),
  "customer_unit" character varying(100),
  "tax_code" character varying(20),
  "customer_address" character varying(255),
  "customer_note" text,
  "material_id" integer,
  "material_name" character varying(100),
  "paper_size_id" integer,
  "paper_size_name" character varying(100),
  "quantity" integer DEFAULT 0,
  "print_side" character varying(20),
  "total" numeric(15,2) DEFAULT '0'::numeric,
  "items_per_sheet" integer DEFAULT 0,
  "sheets_needed" integer DEFAULT 0,
  "created_by" integer,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "status" character varying(20) DEFAULT 'new'::character varying,
  "source" character varying(50) DEFAULT 'manual'::character varying,
  "validity_days" integer DEFAULT 7,
  "discount_type" character varying(10),
  "discount_value" numeric(10,2) DEFAULT '0'::numeric,
  "discount_amount" numeric(15,2) DEFAULT '0'::numeric,
  "vat_rate" numeric(5,2) DEFAULT 0,
  "vat_amount" numeric(15,2) DEFAULT 0,
  "shipping_fee" numeric(15,2) DEFAULT 0,
  "grand_total" numeric(15,2) DEFAULT 0
);

-- ─── Table: role_permissions ───
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id" integer DEFAULT nextval('role_permissions_id_seq'::regclass) NOT NULL,
  "role_id" integer NOT NULL,
  "permission" character varying(100) NOT NULL
);

-- ─── Table: roles ───
CREATE TABLE IF NOT EXISTS "roles" (
  "id" integer DEFAULT nextval('roles_id_seq'::regclass) NOT NULL,
  "name" character varying(50) NOT NULL,
  "display_name" character varying(100) NOT NULL,
  "description" text,
  "tenant_id" integer,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: setup_fees ───
CREATE TABLE IF NOT EXISTS "setup_fees" (
  "id" integer DEFAULT nextval('setup_fees_id_seq'::regclass) NOT NULL,
  "code" character varying(30) NOT NULL,
  "name" character varying(100) NOT NULL,
  "fee_type" character varying(20) NOT NULL,
  "category" character varying(20) DEFAULT 'all'::character varying,
  "price_per_unit" numeric(15,2) DEFAULT '0'::numeric,
  "price_per_side" numeric(15,2) DEFAULT '0'::numeric,
  "price_fixed" numeric(15,2) DEFAULT '0'::numeric,
  "paper_size_id" integer,
  "min_sheets" integer DEFAULT 0,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: site_settings ───
CREATE TABLE IF NOT EXISTS "site_settings" (
  "id" integer DEFAULT nextval('site_settings_id_seq'::regclass) NOT NULL,
  "key" character varying(100) NOT NULL,
  "value" text,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: subscription_plans ───
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" integer DEFAULT nextval('subscription_plans_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "price" numeric(12,0) DEFAULT '0'::numeric NOT NULL,
  "yearly_price" numeric(12,0),
  "max_users" integer DEFAULT 5 NOT NULL,
  "max_quotes_per_month" integer DEFAULT 500 NOT NULL,
  "max_storage_mb" integer DEFAULT 500 NOT NULL,
  "features" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: system_settings ───
CREATE TABLE IF NOT EXISTS "system_settings" (
  "setting_key" character varying(50) NOT NULL,
  "setting_value" text,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: tenants ───
CREATE TABLE IF NOT EXISTS "tenants" (
  "id" integer DEFAULT nextval('tenants_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name" character varying(255) NOT NULL,
  "slug" character varying(100),
  "email" character varying(255),
  "phone" character varying(20),
  "address" text,
  "tax_code" character varying(50),
  "logo_url" character varying(500),
  "plan_id" integer,
  "status" character varying(20) DEFAULT 'trial'::character varying NOT NULL,
  "schema_name" character varying(100),
  "subscription_ends_at" timestamp without time zone,
  "max_users" integer DEFAULT 5 NOT NULL,
  "settings" jsonb,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: unified_product_categories ───
CREATE TABLE IF NOT EXISTS "unified_product_categories" (
  "id" integer DEFAULT nextval('unified_product_categories_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name_vi" character varying(100) NOT NULL,
  "name_en" character varying(100),
  "icon" character varying(50),
  "parent_id" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: unified_products ───
CREATE TABLE IF NOT EXISTS "unified_products" (
  "id" integer DEFAULT nextval('unified_products_id_seq'::regclass) NOT NULL,
  "code" character varying(50) NOT NULL,
  "name_vi" character varying(200) NOT NULL,
  "name_en" character varying(200),
  "quote_type" character varying DEFAULT 'loose'::character varying NOT NULL,
  "unit" character varying(20),
  "parent_category_code" character varying(50),
  "ai_keywords" text,
  "default_materials" text,
  "default_finishing" text,
  "form_config" text,
  "icon" character varying(50) DEFAULT 'fa-box'::character varying NOT NULL,
  "description_vi" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "mini_quote_fields" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "allowed_materials" text,
  "allowed_paper_sizes" text,
  "allowed_processing" text,
  "has_auto_pricing" boolean DEFAULT true NOT NULL,
  "allowed_accessories" jsonb
);

-- ─── Table: units ───
CREATE TABLE IF NOT EXISTS "units" (
  "id" integer DEFAULT nextval('units_id_seq'::regclass) NOT NULL,
  "code" character varying(20) NOT NULL,
  "name" character varying(50) NOT NULL,
  "symbol" character varying(10) NOT NULL,
  "type" character varying(20) DEFAULT 'count'::character varying NOT NULL,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: users ───
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "email" character varying NOT NULL,
  "password_hash" character varying NOT NULL,
  "full_name" character varying(100) NOT NULL,
  "role" character varying DEFAULT 'agent'::character varying NOT NULL,
  "avatar_url" character varying,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_login_at" timestamp without time zone,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL,
  "tenant_id" integer
);

-- ─── Table: waste_rules ───
CREATE TABLE IF NOT EXISTS "waste_rules" (
  "id" integer DEFAULT nextval('waste_rules_id_seq'::regclass) NOT NULL,
  "print_method" character varying(20) NOT NULL,
  "quantity_from" integer NOT NULL,
  "quantity_to" integer,
  "waste_percent" numeric(5,2) NOT NULL,
  "description" character varying(200),
  "is_active" boolean DEFAULT true,
  "created_at" timestamp without time zone DEFAULT now(),
  "updated_at" timestamp without time zone DEFAULT now()
);

-- ─── Table: webhook_settings ───
CREATE TABLE IF NOT EXISTS "webhook_settings" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "name" character varying(100) NOT NULL,
  "webhook_url" character varying NOT NULL,
  "webhook_secret" character varying,
  "events" text DEFAULT '["*"]'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_failure_at" timestamp without time zone,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Table: zalo_accounts ───
CREATE TABLE IF NOT EXISTS "zalo_accounts" (
  "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "zalo_uid" character varying,
  "display_name" character varying,
  "avatar_url" character varying,
  "phone" character varying(20),
  "status" character varying DEFAULT 'disconnected'::character varying NOT NULL,
  "session_data" text,
  "last_connected_at" timestamp without time zone,
  "daily_send_count" integer DEFAULT 0 NOT NULL,
  "daily_send_date" character varying(10),
  "channel_id" uuid,
  "created_at" timestamp without time zone DEFAULT now() NOT NULL
);

-- ─── Constraints (PK / UNIQUE / CHECK / FK) ───
ALTER TABLE accessories ADD CONSTRAINT "accessories_pkey" PRIMARY KEY (id);
ALTER TABLE ai_conversations ADD CONSTRAINT "PK_60db12765b82858ba00c8aa4ae2" PRIMARY KEY (id);
ALTER TABLE ai_suggestions ADD CONSTRAINT "PK_5c769622a5d4b1e17e34983f75d" PRIMARY KEY (id);
ALTER TABLE appointments ADD CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY (id);
ALTER TABLE audit_logs ADD CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY (id);
ALTER TABLE binding_types ADD CONSTRAINT "binding_types_pkey" PRIMARY KEY (id);
ALTER TABLE canned_responses ADD CONSTRAINT "PK_1df87c74d99c463b1c7fb30dc14" PRIMARY KEY (id);
ALTER TABLE channels ADD CONSTRAINT "PK_bc603823f3f741359c2339389f9" PRIMARY KEY (id);
ALTER TABLE contacts ADD CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY (id);
ALTER TABLE conversation_participants ADD CONSTRAINT "PK_61b51428ad9453f5921369fbe94" PRIMARY KEY (id);
ALTER TABLE conversations ADD CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY (id);
ALTER TABLE customer_interactions ADD CONSTRAINT "customer_interactions_pkey" PRIMARY KEY (id);
ALTER TABLE customer_price_groups ADD CONSTRAINT "PK_261137264421338170572f2e633" PRIMARY KEY (id);
ALTER TABLE customers ADD CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY (id);
ALTER TABLE follow_ups ADD CONSTRAINT "PK_d510aabdff2ec7fdc67a1092157" PRIMARY KEY (id);
ALTER TABLE ink_costs ADD CONSTRAINT "ink_costs_pkey" PRIMARY KEY (id);
ALTER TABLE internal_notes ADD CONSTRAINT "PK_0e55e6e560cb954a17babf4ba1e" PRIMARY KEY (id);
ALTER TABLE inventory_slip_items ADD CONSTRAINT "PK_dc545e02c82d3987cf2e04508bd" PRIMARY KEY (id);
ALTER TABLE inventory_slips ADD CONSTRAINT "PK_887846ae9f076c06f083e21908c" PRIMARY KEY (id);
ALTER TABLE kb_chunks ADD CONSTRAINT "PK_de84c3fce0c1a29928e98441cd3" PRIMARY KEY (id);
ALTER TABLE kb_documents ADD CONSTRAINT "PK_14ad41415f09ecb8f042d78422a" PRIMARY KEY (id);
ALTER TABLE large_format_pricing ADD CONSTRAINT "PK_1ebf9af9033e5d1b6fd8e167583" PRIMARY KEY (id);
ALTER TABLE material_categories ADD CONSTRAINT "PK_b4a74f17ff7d126f627e0f5879b" PRIMARY KEY (id);
ALTER TABLE material_types ADD CONSTRAINT "PK_201f7626a396dc21baf168a6e1b" PRIMARY KEY (id);
ALTER TABLE materials ADD CONSTRAINT "PK_2fd1a93ecb222a28bef28663fa0" PRIMARY KEY (id);
ALTER TABLE messages ADD CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id);
ALTER TABLE method_capabilities ADD CONSTRAINT "method_capabilities_pkey" PRIMARY KEY (id);
ALTER TABLE migrations ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY (id);
ALTER TABLE offset_cfg_ep_kim ADD CONSTRAINT "offset_cfg_ep_kim_pkey" PRIMARY KEY (vi_tri);
ALTER TABLE offset_cfg_fixed_size ADD CONSTRAINT "offset_cfg_fixed_size_pkey" PRIMARY KEY (id);
ALTER TABLE offset_cfg_gia_cong ADD CONSTRAINT "offset_cfg_gia_cong_pkey" PRIMARY KEY (code);
ALTER TABLE offset_cfg_kem ADD CONSTRAINT "offset_cfg_kem_pkey" PRIMARY KEY (id);
ALTER TABLE offset_cfg_kho_in ADD CONSTRAINT "offset_cfg_kho_in_pkey" PRIMARY KEY (kho_in);
ALTER TABLE offset_cfg_vat_tu_be_mat ADD CONSTRAINT "offset_cfg_vat_tu_be_mat_pkey" PRIMARY KEY (ten);
ALTER TABLE offset_machine_config ADD CONSTRAINT "offset_machine_config_pkey" PRIMARY KEY (id);
ALTER TABLE paper_sizes ADD CONSTRAINT "PK_eab0624282bd50485fb5df4dc01" PRIMARY KEY (id);
ALTER TABLE payments ADD CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id);
ALTER TABLE plate_pricing ADD CONSTRAINT "plate_pricing_pkey" PRIMARY KEY (id);
ALTER TABLE pricing_config ADD CONSTRAINT "PK_c3f963f5e2fa3c451241283e883" PRIMARY KEY (id);
ALTER TABLE pricing_tiers ADD CONSTRAINT "PK_f5f75ade45fc37142b2cdbaa2f5" PRIMARY KEY (id);
ALTER TABLE print_types ADD CONSTRAINT "PK_68c234d18520d1e0d4179f1f6cd" PRIMARY KEY (id);
ALTER TABLE printers ADD CONSTRAINT "PK_036bb976f205339f632e2eb0642" PRIMARY KEY (id);
ALTER TABLE processing_options ADD CONSTRAINT "PK_ed2902f86f9586a6f2d3e20f262" PRIMARY KEY (id);
ALTER TABLE processing_pricing ADD CONSTRAINT "PK_6b1907e28db6a857637ab982a39" PRIMARY KEY (id);
ALTER TABLE product_ai_fields ADD CONSTRAINT "PK_cd7acf14164fba3a7bc123e816f" PRIMARY KEY (id);
ALTER TABLE product_categories ADD CONSTRAINT "PK_7069dac60d88408eca56fdc9e0c" PRIMARY KEY (id);
ALTER TABLE product_quote_configs ADD CONSTRAINT "PK_a0449f56a435b385c6f45c3ba24" PRIMARY KEY (id);
ALTER TABLE production_costs ADD CONSTRAINT "PK_990de3275b75e14b9e07d1f35db" PRIMARY KEY (id);
ALTER TABLE products ADD CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY (id);
ALTER TABLE quick_prices ADD CONSTRAINT "PK_404281e903e1f324ef08c8229f6" PRIMARY KEY (id);
ALTER TABLE quote_items ADD CONSTRAINT "PK_135ad3f02b5abcf65fb5cb20ad2" PRIMARY KEY (id);
ALTER TABLE quote_rules ADD CONSTRAINT "PK_bc7e0d4ffd6d215801c6d85c0ad" PRIMARY KEY (id);
ALTER TABLE quote_versions ADD CONSTRAINT "PK_e31734ca3062b078c8b94634254" PRIMARY KEY (id);
ALTER TABLE quotes ADD CONSTRAINT "PK_99a0e8bcbcd8719d3a41f23c263" PRIMARY KEY (id);
ALTER TABLE role_permissions ADD CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY (id);
ALTER TABLE roles ADD CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY (id);
ALTER TABLE setup_fees ADD CONSTRAINT "PK_a5c56ca94df68caa63731016cec" PRIMARY KEY (id);
ALTER TABLE site_settings ADD CONSTRAINT "PK_e4290e8371a166d7e066d131f6e" PRIMARY KEY (id);
ALTER TABLE subscription_plans ADD CONSTRAINT "PK_9ab8fe6918451ab3d0a4fb6bb0c" PRIMARY KEY (id);
ALTER TABLE system_settings ADD CONSTRAINT "PK_9037e7dec102dfdfb0c5343807f" PRIMARY KEY (setting_key);
ALTER TABLE tenants ADD CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY (id);
ALTER TABLE unified_product_categories ADD CONSTRAINT "PK_0ca8a23aa3ad82a7ccf5e5a59b5" PRIMARY KEY (id);
ALTER TABLE unified_products ADD CONSTRAINT "PK_31fbfd2ad9eb3742c7da6b16d24" PRIMARY KEY (id);
ALTER TABLE units ADD CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);
ALTER TABLE waste_rules ADD CONSTRAINT "waste_rules_pkey" PRIMARY KEY (id);
ALTER TABLE webhook_settings ADD CONSTRAINT "PK_4a7b8b4920b26a2714e933dcc20" PRIMARY KEY (id);
ALTER TABLE zalo_accounts ADD CONSTRAINT "PK_ba8c0525e3eb69ae0958f0357b6" PRIMARY KEY (id);
ALTER TABLE accessories ADD CONSTRAINT "accessories_code_key" UNIQUE (code);
ALTER TABLE ai_conversations ADD CONSTRAINT "UQ_024eeb5c4d17a5121e8afe173b8" UNIQUE (session_id);
ALTER TABLE binding_types ADD CONSTRAINT "binding_types_code_key" UNIQUE (code);
ALTER TABLE contacts ADD CONSTRAINT "UQ_98856c8be8cf5bbaf4d9066873e" UNIQUE (channel_id, external_user_id);
ALTER TABLE conversation_participants ADD CONSTRAINT "UQ_fdcd6405d74e797f10fa8360338" UNIQUE (conversation_id, user_id);
ALTER TABLE customer_price_groups ADD CONSTRAINT "UQ_9c1f3940819f11c3315d6380c4d" UNIQUE (code);
ALTER TABLE customers ADD CONSTRAINT "UQ_88acd889fbe17d0e16cc4bc9174" UNIQUE (phone);
ALTER TABLE customers ADD CONSTRAINT "UQ_999eaf1823e97c66404a576a572" UNIQUE (supabase_uid);
ALTER TABLE customers ADD CONSTRAINT "UQ_f2eee14aa1fe3e956fe193c142f" UNIQUE (code);
ALTER TABLE ink_costs ADD CONSTRAINT "ink_costs_print_type_key" UNIQUE (print_type);
ALTER TABLE material_categories ADD CONSTRAINT "UQ_4282a8f78a9204bc7f6c2708314" UNIQUE (code);
ALTER TABLE material_types ADD CONSTRAINT "UQ_7ae83cf35bd0b2a96971c05cff5" UNIQUE (code);
ALTER TABLE materials ADD CONSTRAINT "UQ_5f59d61b51ffcb1db9942862215" UNIQUE (code);
ALTER TABLE messages ADD CONSTRAINT "UQ_7158a8327b43a447faaae094aef" UNIQUE (external_msg_id);
ALTER TABLE messages ADD CONSTRAINT "UQ_1d19cb26bb137edd49d85fa62a9" UNIQUE (idempotency_key);
ALTER TABLE method_capabilities ADD CONSTRAINT "method_capabilities_unit_id_method_id_key" UNIQUE (unit_id, method_id);
ALTER TABLE offset_cfg_fixed_size ADD CONSTRAINT "offset_cfg_fixed_size_nhom_kich_thuoc_loai_key" UNIQUE (nhom, kich_thuoc, loai);
ALTER TABLE offset_cfg_kem ADD CONSTRAINT "offset_cfg_kem_bang_so_kem_key" UNIQUE (bang, so_kem);
ALTER TABLE offset_machine_config ADD CONSTRAINT "offset_machine_config_code_key" UNIQUE (code);
ALTER TABLE paper_sizes ADD CONSTRAINT "UQ_05e2c9c92701f4ae00e39694825" UNIQUE (code);
ALTER TABLE pricing_config ADD CONSTRAINT "UQ_34912455038befc149de20e2a56" UNIQUE (config_key);
ALTER TABLE print_types ADD CONSTRAINT "UQ_d3b82b8f340c7597c630724571c" UNIQUE (code);
ALTER TABLE printers ADD CONSTRAINT "UQ_8d06c314c33eebb0269009a93c8" UNIQUE (code);
ALTER TABLE processing_options ADD CONSTRAINT "UQ_d05191ecb67223b12f321106d1d" UNIQUE (code);
ALTER TABLE product_categories ADD CONSTRAINT "UQ_03fac833e3bd77ac88846805305" UNIQUE (code);
ALTER TABLE product_quote_configs ADD CONSTRAINT "UQ_ac09ca2a949582fa164bcd8e3a5" UNIQUE (product_id);
ALTER TABLE products ADD CONSTRAINT "UQ_7cfc24d6c24f0ec91294003d6b8" UNIQUE (code);
ALTER TABLE roles ADD CONSTRAINT "UQ_648e3f5447f725579d7d4ffdfb7" UNIQUE (name);
ALTER TABLE setup_fees ADD CONSTRAINT "UQ_ac6f178a435b2f5dbd32c0594d8" UNIQUE (code);
ALTER TABLE site_settings ADD CONSTRAINT "UQ_e71167433328a5afb90dda43da0" UNIQUE (key);
ALTER TABLE subscription_plans ADD CONSTRAINT "UQ_2d2df70a81d37c893ef216caf8a" UNIQUE (code);
ALTER TABLE tenants ADD CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE (slug);
ALTER TABLE tenants ADD CONSTRAINT "UQ_3021c18db2b363ae9324c826c5a" UNIQUE (code);
ALTER TABLE unified_product_categories ADD CONSTRAINT "UQ_368bc72045d55578caea2f67eef" UNIQUE (code);
ALTER TABLE unified_products ADD CONSTRAINT "UQ_34fb3e391abddc52eea23c19aae" UNIQUE (code);
ALTER TABLE units ADD CONSTRAINT "UQ_47635c1ab22d02fc3ebae3608b8" UNIQUE (code);
ALTER TABLE users ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);
ALTER TABLE ai_suggestions ADD CONSTRAINT "FK_f9d168bf58c66915c2226489150" FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE appointments ADD CONSTRAINT "FK_f54ed2fd8932561dbfae0e8a48b" FOREIGN KEY (assigned_user_id) REFERENCES users(id);
ALTER TABLE appointments ADD CONSTRAINT "FK_ba5b2709e550a32c815bc6d82e0" FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE canned_responses ADD CONSTRAINT "FK_3e9a18ccdb5f4a32d9214904f15" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE contacts ADD CONSTRAINT "FK_6f30bbff987a60cea2ec877f59a" FOREIGN KEY (channel_id) REFERENCES channels(id);
ALTER TABLE conversation_participants ADD CONSTRAINT "FK_1559e8a16b828f2e836a2312800" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE conversation_participants ADD CONSTRAINT "FK_377d4041a495b81ee1a85ae026f" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE conversations ADD CONSTRAINT "FK_3e605129623b629ddd0583740db" FOREIGN KEY (contact_id) REFERENCES contacts(id);
ALTER TABLE conversations ADD CONSTRAINT "FK_1a99838ee2e2e940ad98ed2e9d8" FOREIGN KEY (channel_id) REFERENCES channels(id);
ALTER TABLE conversations ADD CONSTRAINT "FK_eb33c4841a61e998a8c906fbcf1" FOREIGN KEY (assignee_id) REFERENCES users(id);
ALTER TABLE customer_interactions ADD CONSTRAINT "customer_interactions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE follow_ups ADD CONSTRAINT "FK_e3881b08c2e9e157eba140d5794" FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE internal_notes ADD CONSTRAINT "FK_3d374c078a7c242bed3de038891" FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE internal_notes ADD CONSTRAINT "FK_1c02bea1afabb8e6efb89b6bb98" FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE inventory_slip_items ADD CONSTRAINT "FK_b5c163e2eac10f093c4c8dc7c20" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE inventory_slip_items ADD CONSTRAINT "FK_8b1c2aa7352d18bd001c23bf2d3" FOREIGN KEY (slip_id) REFERENCES inventory_slips(id) ON DELETE CASCADE;
ALTER TABLE kb_chunks ADD CONSTRAINT "FK_06f082ac79ac86cbb475e1a8d57" FOREIGN KEY (document_id) REFERENCES kb_documents(id) ON DELETE CASCADE;
ALTER TABLE kb_documents ADD CONSTRAINT "FK_439403da6a170a482e48d0851ed" FOREIGN KEY (uploaded_by) REFERENCES users(id);
ALTER TABLE large_format_pricing ADD CONSTRAINT "FK_26523f1232fe7a30a0fff81b089" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE materials ADD CONSTRAINT "FK_67bf324047a2d89c121f74dd401" FOREIGN KEY (unit_id) REFERENCES units(id);
ALTER TABLE materials ADD CONSTRAINT "FK_7bb055e5bd935f37ff94240320f" FOREIGN KEY (paper_size_id) REFERENCES paper_sizes(id);
ALTER TABLE messages ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY (conversation_id) REFERENCES conversations(id);
ALTER TABLE notifications ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE plate_pricing ADD CONSTRAINT "plate_pricing_machine_id_fkey" FOREIGN KEY (machine_id) REFERENCES offset_machine_config(id) ON DELETE SET NULL;
ALTER TABLE pricing_tiers ADD CONSTRAINT "FK_e8349596e1b12b056c508b49ad5" FOREIGN KEY (paper_size_id) REFERENCES paper_sizes(id);
ALTER TABLE pricing_tiers ADD CONSTRAINT "FK_777f2933802c0d335637bb2c228" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE processing_pricing ADD CONSTRAINT "fk_processing_option" FOREIGN KEY (processing_option_id) REFERENCES processing_options(id) ON DELETE CASCADE;
ALTER TABLE product_ai_fields ADD CONSTRAINT "FK_81d5a35c6098dbd2ff2a6343468" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE product_quote_configs ADD CONSTRAINT "FK_ac09ca2a949582fa164bcd8e3a5" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE products ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY (category_id) REFERENCES product_categories(id);
ALTER TABLE quote_items ADD CONSTRAINT "FK_c11d594b8cf436caaee20122fd8" FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;
ALTER TABLE quote_rules ADD CONSTRAINT "FK_e4ea04b44c95d5855d9a4ce4f6f" FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE quote_versions ADD CONSTRAINT "FK_c737d8cd5c6d5fa8744dbec2123" FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE;
ALTER TABLE role_permissions ADD CONSTRAINT "FK_178199805b901ccd220ab7740ec" FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
ALTER TABLE zalo_accounts ADD CONSTRAINT "FK_aead670450ccaab5b8d15321724" FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE zalo_accounts ADD CONSTRAINT "FK_085c573a0c4a043ff5c6ccad3b7" FOREIGN KEY (owner_user_id) REFERENCES users(id);

-- ─── Indexes ───
CREATE INDEX "IDX_7704509aba7d92bd3322452572" ON public.ai_suggestions USING btree (status);
CREATE INDEX "IDX_7ccdcb19e16898e4a4f51cc0c3" ON public.ai_suggestions USING btree (created_at);
CREATE INDEX "IDX_f9d168bf58c66915c222648915" ON public.ai_suggestions USING btree (conversation_id);
CREATE INDEX "IDX_ba5b2709e550a32c815bc6d82e" ON public.appointments USING btree (contact_id);
CREATE INDEX "IDX_e44a44b3eec38bb354c8425945" ON public.appointments USING btree (appointment_date);
CREATE INDEX "IDX_1964019581c5fb97552dfe9a72" ON public.contacts USING btree (pipeline_status);
CREATE INDEX "IDX_6f30bbff987a60cea2ec877f59" ON public.contacts USING btree (channel_id);
CREATE INDEX "IDX_752866c5247ddd34fd05559537" ON public.contacts USING btree (email);
CREATE INDEX "IDX_84cae51c485079bdd8cdf1d828" ON public.contacts USING btree (phone);
CREATE INDEX "IDX_1559e8a16b828f2e836a231280" ON public.conversation_participants USING btree (conversation_id);
CREATE INDEX "IDX_377d4041a495b81ee1a85ae026" ON public.conversation_participants USING btree (user_id);
CREATE INDEX "IDX_1a99838ee2e2e940ad98ed2e9d" ON public.conversations USING btree (channel_id);
CREATE INDEX "IDX_3e605129623b629ddd0583740d" ON public.conversations USING btree (contact_id);
CREATE INDEX "IDX_517acf7e04a7232adb0c760c4b" ON public.conversations USING btree (status);
CREATE INDEX "IDX_9185e4a10f53167d15f23e1720" ON public.conversations USING btree (last_message_at);
CREATE INDEX "IDX_a19de0fb46b8749f13fe921c21" ON public.conversations USING btree (priority);
CREATE INDEX "IDX_a9cf44f4260445b7dcf38c2e6e" ON public.conversations USING btree (sla_deadline);
CREATE INDEX "IDX_eb33c4841a61e998a8c906fbcf" ON public.conversations USING btree (assignee_id);
CREATE INDEX "IDX_f0bb90db8338e6dc6c349ece99" ON public.conversations USING btree (created_at);
CREATE INDEX idx_interactions_customer ON public.customer_interactions USING btree (customer_id);
CREATE INDEX idx_interactions_type ON public.customer_interactions USING btree (type);
CREATE INDEX idx_customers_follow_up ON public.customers USING btree (follow_up_date);
CREATE INDEX idx_customers_lifecycle ON public.customers USING btree (lifecycle_stage);
CREATE INDEX "IDX_0777b63da90c27d6ed993dc60b" ON public.messages USING btree (created_at);
CREATE INDEX "IDX_3bc55a7c3f9ed54b520bb5cfe2" ON public.messages USING btree (conversation_id);
CREATE INDEX "IDX_777f2933802c0d335637bb2c22" ON public.pricing_tiers USING btree (material_id);
CREATE INDEX "IDX_0adc0a8834ea0f252e96d154de" ON public.users USING btree (full_name);
CREATE INDEX "IDX_109638590074998bb72a2f2cf0" ON public.users USING btree (tenant_id);
CREATE INDEX "IDX_20c7aea6112bef71528210f631" ON public.users USING btree (is_active);
CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON public.users USING btree (role);
CREATE UNIQUE INDEX "IDX_cec4806da6e0aa278c20184645" ON public.zalo_accounts USING btree (zalo_uid);
