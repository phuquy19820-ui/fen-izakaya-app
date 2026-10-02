-- BẢNG DANH MỤC CHI NHÁNH
CREATE TABLE IF NOT EXISTS branches (
    branch_id VARCHAR(50) PRIMARY KEY,
    branch_name VARCHAR(255) NOT NULL,
    cukcuk_company_code VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG MASTER NGUYÊN VẬT LIỆU
CREATE TABLE IF NOT EXISTS raw_materials (
    material_id VARCHAR(50) PRIMARY KEY,
    material_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    category_group VARCHAR(50) DEFAULT 'DRY_SPICE', -- 'MEAT', 'SEAFOOD', 'VEGETABLE', 'DRY_SPICE'
    purchase_cycle VARCHAR(20) DEFAULT 'WEEKLY_7DAYS', -- 'FRESH_3DAYS' hoặc 'WEEKLY_7DAYS'
    unit_recipe VARCHAR(20) NOT NULL,
    unit_purchase VARCHAR(20) NOT NULL,
    conversion_rate NUMERIC(12, 4) DEFAULT 1000,
    safety_stock NUMERIC(12, 2) DEFAULT 0,
    waste_rate NUMERIC(5, 2) DEFAULT 0,
    is_auto_created BOOLEAN DEFAULT FALSE,
    is_merged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG MÃ ÁNH XẠ (ALIAS / FUZZY MATCHING)
CREATE TABLE IF NOT EXISTS material_aliases (
    id SERIAL PRIMARY KEY,
    master_material_id VARCHAR(50) REFERENCES raw_materials(material_id) ON DELETE CASCADE,
    alias_code VARCHAR(50) NOT NULL UNIQUE,
    alias_name VARCHAR(255),
    source VARCHAR(50) DEFAULT 'CUKCUK',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG ĐỊNH LƯỢNG MÓN ĂN (BOM) THEO CHI NHÁNH
CREATE TABLE IF NOT EXISTS bill_of_materials (
    id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    dish_id VARCHAR(50) NOT NULL,
    dish_name VARCHAR(255) NOT NULL,
    dish_unit VARCHAR(20) DEFAULT 'Phần',
    dish_price NUMERIC(12, 2) DEFAULT 0,
    material_id VARCHAR(50) REFERENCES raw_materials(material_id) ON DELETE CASCADE,
    quantity_per_dish NUMERIC(12, 4) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG THEO DÕI BAN HÀNG VÀ TỒN KHO CUKCUK THEO CHI NHÁNH
CREATE TABLE IF NOT EXISTS cukcuk_daily_sales (
    id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    dish_id VARCHAR(50) NOT NULL,
    dish_name VARCHAR(255),
    quantity_sold NUMERIC(12, 2) DEFAULT 0,
    sale_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_tracking (
    id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    material_id VARCHAR(50) REFERENCES raw_materials(material_id) ON DELETE CASCADE,
    period_date DATE NOT NULL,
    closing_stock NUMERIC(12, 2) DEFAULT 0,
    UNIQUE(branch_id, material_id, period_date)
);

-- BẢNG KẾ HOẠCH MUA HÀNG
CREATE TABLE IF NOT EXISTS purchase_plans (
    plan_id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    plan_name VARCHAR(255) NOT NULL,
    cycle_type VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_plan_details (
    id SERIAL PRIMARY KEY,
    plan_id INT REFERENCES purchase_plans(plan_id) ON DELETE CASCADE,
    material_id VARCHAR(50) REFERENCES raw_materials(material_id),
    opening_stock NUMERIC(12, 2) DEFAULT 0,
    sales_forecast_qty NUMERIC(12, 2) DEFAULT 0,
    suggested_qty NUMERIC(12, 2) DEFAULT 0,
    final_purchase_qty NUMERIC(12, 2) DEFAULT 0,
    note TEXT
);
