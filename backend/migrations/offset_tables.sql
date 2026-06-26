-- Create Offset tables + seed data
-- 1) offset_machine_config
CREATE TABLE IF NOT EXISTS offset_machine_config (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(30) UNIQUE NOT NULL,
    max_width DECIMAL(10,2) NOT NULL,
    max_height DECIMAL(10,2) NOT NULL,
    gripper_margin DECIMAL(5,2) DEFAULT 10,
    run_price_per_1000 DECIMAL(15,2) DEFAULT 0,
    min_run_charge DECIMAL(15,2) DEFAULT 0,
    makeready_fee DECIMAL(15,2) DEFAULT 200000,
    max_speed_sheets_per_hour INT DEFAULT 8000,
    color_units INT DEFAULT 4,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2) plate_pricing
CREATE TABLE IF NOT EXISTS plate_pricing (
    id SERIAL PRIMARY KEY,
    machine_id INT REFERENCES offset_machine_config(id) ON DELETE SET NULL,
    plate_type VARCHAR(30) DEFAULT 'ctp',
    name VARCHAR(100),
    price_per_plate DECIMAL(15,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3) waste_rules
CREATE TABLE IF NOT EXISTS waste_rules (
    id SERIAL PRIMARY KEY,
    print_method VARCHAR(20) NOT NULL,
    quantity_from INT NOT NULL,
    quantity_to INT,
    waste_percent DECIMAL(5,2) NOT NULL,
    description VARCHAR(200),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- SEED machines
INSERT INTO offset_machine_config (name, code, max_width, max_height, gripper_margin, run_price_per_1000, min_run_charge, makeready_fee, color_units, description) VALUES
('Offset 2M 52x72', 'offset_2m_52x72', 520, 720, 10, 35000, 150000, 200000, 2, '2 color standard'),
('Offset 4M 52x72', 'offset_4m_52x72', 520, 720, 10, 55000, 200000, 300000, 4, '4 color CMYK'),
('Offset 4M 65x86', 'offset_4m_65x86', 650, 860, 12, 70000, 250000, 400000, 4, '4 color large format')
ON CONFLICT (code) DO NOTHING;

-- SEED plates
INSERT INTO plate_pricing (machine_id, plate_type, name, price_per_plate)
SELECT m.id, 'ctp', 'CTP ' || m.code, CASE WHEN m.code LIKE '%65x86%' THEN 120000 ELSE 80000 END
FROM offset_machine_config m
WHERE NOT EXISTS (SELECT 1 FROM plate_pricing pp WHERE pp.machine_id = m.id);

-- SEED waste rules
INSERT INTO waste_rules (print_method, quantity_from, quantity_to, waste_percent, description) VALUES
('offset', 1, 999, 10.00, 'Under 1000: 10%'),
('offset', 1000, 4999, 7.00, '1000-5000: 7%'),
('offset', 5000, NULL, 5.00, 'Over 5000: 5%')
ON CONFLICT DO NOTHING;
