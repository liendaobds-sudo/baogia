-- offset-pricebook-revamp: bảng cấu hình bảng giá Offset mới (EngineOffset).
-- Idempotent: CREATE TABLE IF NOT EXISTS. KHÔNG xóa bảng engine cũ
-- (offset_machine_config, plate_pricing, waste_rules) — chỉ gỡ ở bước cuối (Req 21).
-- Seed dữ liệu được thực hiện theo lập trình từ data/*.json đóng gói (ConfigStore.seedDefaults),
-- để tránh viết tay hàng trăm INSERT và giữ đồng bộ với golden test.
-- _Requirements: 1.1, 1.2, 1.3, 1.4_

-- VẬT TƯ OFFSET KHÔNG có bảng riêng: dùng chung bảng `materials` với cờ `scope_offset`
-- (tab "Offset" trong màn Vật tư), tách khỏi "in nhanh". Định mức offset mới để riêng ở dưới.
ALTER TABLE materials ADD COLUMN IF NOT EXISTS scope_offset BOOLEAN DEFAULT false;

-- GIA CÔNG OFFSET dùng chung `processing_options` + `processing_pricing` (màn "Định mức gia công").
-- Thêm cờ scope_offset + metadata tính giá offset (billing_mode/MOQ) — additive, an toàn cho digital.
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS scope_offset BOOLEAN DEFAULT false;
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(30);
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS moq_param VARCHAR(60);
ALTER TABLE processing_options ADD COLUMN IF NOT EXISTS min_charge_param VARCHAR(60);

-- 1) (ĐÃ BỎ) offset_cfg_material — giấy in offset nay nằm ở bảng `materials` (scope_offset=true).
-- 4) (ĐÃ BỎ) offset_cfg_gia_cong — gia công offset nay nằm ở `processing_options`+`processing_pricing`.

-- 2) Khổ in
CREATE TABLE IF NOT EXISTS offset_cfg_kho_in (
    kho_in            VARCHAR(80) PRIMARY KEY,
    chia_to           VARCHAR(80),
    so_con_bai_in     INT          NOT NULL DEFAULT 0,
    so_con_to_lon     INT          NOT NULL DEFAULT 0,
    kho_giay_lon      VARCHAR(80),
    dien_tich_m2      DECIMAL(12,5) NOT NULL DEFAULT 0,
    loai_kem          VARCHAR(40),
    updated_at        TIMESTAMP     DEFAULT NOW()
);

-- 3) Kích thước cố định (tờ rơi + bì thư/folder)
CREATE TABLE IF NOT EXISTS offset_cfg_fixed_size (
    id                  SERIAL PRIMARY KEY,
    nhom                VARCHAR(40) NOT NULL,           -- 'to_roi' | 'bi_thu_folder'
    kich_thuoc          VARCHAR(80) NOT NULL,
    kho_in              VARCHAR(80),
    kho_giay_lon        VARCHAR(80),
    so_con_bai_in       INT,
    so_con_to_lon       INT,
    so_con_kho_giay_lon INT,
    loai                VARCHAR(40),                    -- 'bithu' | 'folder' (chỉ nhóm bi_thu_folder)
    UNIQUE (nhom, kich_thuoc, loai)
);

-- 4) Công đoạn gia công
CREATE TABLE IF NOT EXISTS offset_cfg_gia_cong (
    code             VARCHAR(60) PRIMARY KEY,
    cong_doan        VARCHAR(200),
    ghi_chu          TEXT,
    tiers            JSONB        NOT NULL DEFAULT '[]'::jsonb,
    billing_mode     VARCHAR(30)  NOT NULL DEFAULT 'perUnit',
    min_charge_param VARCHAR(60),
    moq_param        VARCHAR(60),
    updated_at       TIMESTAMP    DEFAULT NOW()
);

-- 4) (đã bỏ ở trên) Công đoạn gia công → dùng processing_options/processing_pricing.

-- 5) Kẽm (bình bài) nhỏ/lớn
CREATE TABLE IF NOT EXISTS offset_cfg_kem (
    id        SERIAL PRIMARY KEY,
    bang      VARCHAR(20) NOT NULL,    -- 'kemNho' | 'kemLon'
    so_kem    INT          NOT NULL,
    don_gia   DECIMAL(15,2) NOT NULL DEFAULT 0,
    UNIQUE (bang, so_kem)
);

-- 6) Vật tư bề mặt (cán màng)
CREATE TABLE IF NOT EXISTS offset_cfg_vat_tu_be_mat (
    ten         VARCHAR(120) PRIMARY KEY,
    don_gia_kg  DECIMAL(15,4) NOT NULL DEFAULT 0,
    so_mat      VARCHAR(20)
);

-- 7) Ép kim
CREATE TABLE IF NOT EXISTS offset_cfg_ep_kim (
    vi_tri      VARCHAR(60) PRIMARY KEY,
    duoi100     DECIMAL(15,4) NOT NULL DEFAULT 0,
    tu100_499   DECIMAL(15,4) NOT NULL DEFAULT 0,
    tu500_999   DECIMAL(15,4) NOT NULL DEFAULT 0,
    tren1000    DECIMAL(15,4) NOT NULL DEFAULT 0
);

-- 8) (ĐÃ BỎ) offset_cfg_hao_hut → hao hụt offset nằm ở `waste_rules` (print_method='offset', description='pricebook').

-- 9) (ĐÃ BỎ) offset_cfg_param + offset_cfg_moc_so_luong → tham số offset nằm ở `pricing_config` (key 'offset.*').

-- 10) (ĐÃ BỎ) offset_cfg_phi_co_dinh → phí cố định offset nằm ở `setup_fees` (category='offset').
