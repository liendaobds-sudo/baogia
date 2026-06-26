-- Migration: Sales Pipeline & Customer Lifecycle
-- Run this against the erp_print database

-- Add pipeline columns to customers table (if not exist)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifecycle_stage VARCHAR(20) DEFAULT 'lead';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS follow_up_date DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS product_interest TEXT;

-- Create customer_interactions table
CREATE TABLE IF NOT EXISTS customer_interactions (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    type VARCHAR(30) DEFAULT 'note',
    content TEXT,
    lost_reason VARCHAR(100),
    product_interest TEXT,
    follow_up_date DATE,
    quote_id INT,
    created_by INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON customer_interactions(type);
CREATE INDEX IF NOT EXISTS idx_customers_lifecycle ON customers(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_customers_follow_up ON customers(follow_up_date);
