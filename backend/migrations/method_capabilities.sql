-- print-method-unification (Phase 1): bảng Cờ Năng lực sản xuất (Capability Flag).
-- Lưu trạng thái bật/tắt từng Phương_Pháp_In cho mỗi Đơn_Vị (unit_id).
-- Idempotent: CREATE TABLE IF NOT EXISTS. Độc lập với multi-tenant (unit_id mặc định 'default').
-- UNIQUE (unit_id, method_id) ⇒ đúng một trạng thái cho mỗi cặp (Req 1.1).
-- Mặc định enabled=false ⇒ Đơn_Vị mới tồn tại với 0 phương pháp được bật (Req 1.7).
-- _Requirements: 1.1, 1.7_

CREATE TABLE IF NOT EXISTS method_capabilities (
    id          SERIAL       PRIMARY KEY,
    unit_id     VARCHAR(50)  NOT NULL DEFAULT 'default',
    method_id   VARCHAR(30)  NOT NULL,            -- 'digital' | 'offset' | ... (mở rộng được)
    enabled     BOOLEAN      NOT NULL DEFAULT false,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    UNIQUE (unit_id, method_id)                   -- đúng một trạng thái / cặp (Req 1.1)
);

-- Seed Đơn_Vị mặc định ('default'): bật sẵn cả 'digital' và 'offset' để giữ hành vi
-- hiện hữu (cả hai phương pháp đang khả dụng trước khi hợp nhất — Req 9.3, 9.4). Quản trị
-- có thể tắt qua PUT /quote/capabilities/:methodId. Idempotent: ON CONFLICT DO NOTHING
-- nên không ghi đè trạng thái admin đã chỉnh.
INSERT INTO method_capabilities (unit_id, method_id, enabled) VALUES
    ('default', 'digital', true),
    ('default', 'offset', true)
ON CONFLICT (unit_id, method_id) DO NOTHING;
