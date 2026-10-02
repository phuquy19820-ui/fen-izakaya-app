-- BẢNG DANH MỤC CHI NHÁNH
CREATE TABLE IF NOT EXISTS branches (
    branch_id VARCHAR(50) PRIMARY KEY,
    branch_name VARCHAR(255) NOT NULL,
    cukcuk_company_code VARCHAR(100),
    cukcuk_domain VARCHAR(255),
    cukcuk_auth_token TEXT,
    cukcuk_token_expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG MASTER NGUYÊN VẬT LIỆU
CREATE TABLE IF NOT EXISTS raw_materials (
    material_id VARCHAR(50) PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    material_name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- FRESH_MEAT, SEAFOOD, VEGETABLE, SPICE, DRY_GOODS, FROZEN
    purchase_cycle VARCHAR(20) DEFAULT 'WEEKLY_7DAYS',
    unit_recipe VARCHAR(20) NOT NULL,
    unit_purchase VARCHAR(20) NOT NULL,
    conversion_rate NUMERIC(12, 4) DEFAULT 1,
    unit_cost NUMERIC(12, 2) DEFAULT 0,
    safety_stock NUMERIC(12, 2) DEFAULT 0,
    min_stock NUMERIC(12, 2) DEFAULT 0,
    max_stock NUMERIC(12, 2) DEFAULT 0,
    lead_time_days INT DEFAULT 1,
    waste_rate NUMERIC(5, 2) DEFAULT 0,
    shelf_life_days INT DEFAULT 30,
    is_auto_created BOOLEAN DEFAULT FALSE,
    is_merged BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, material_id)
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
    material_id VARCHAR(50) NOT NULL,
    period_date DATE NOT NULL,
    opening_stock NUMERIC(12, 2) DEFAULT 0,
    purchases_qty NUMERIC(12, 2) DEFAULT 0,
    sales_usage_qty NUMERIC(12, 2) DEFAULT 0,
    waste_loss_qty NUMERIC(12, 2) DEFAULT 0,
    closing_stock NUMERIC(12, 2) DEFAULT 0,
    stock_value NUMERIC(15, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    material_id VARCHAR(50) NOT NULL,
    material_name VARCHAR(255),
    category VARCHAR(50),
    unit_purchase VARCHAR(20),
    opening_stock NUMERIC(12, 2) DEFAULT 0,
    avg_daily_sales NUMERIC(12, 2) DEFAULT 0,
    forecast_days INT DEFAULT 3,
    forecasted_demand NUMERIC(12, 2) DEFAULT 0,
    safety_stock NUMERIC(12, 2) DEFAULT 0,
    reorder_point NUMERIC(12, 2) DEFAULT 0,
    suggested_qty NUMERIC(12, 2) DEFAULT 0,
    adjusted_qty NUMERIC(12, 2),
    unit_cost NUMERIC(12, 2) DEFAULT 0,
    estimated_cost NUMERIC(15, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG CÔNG THỨC / MÓN ĂN
CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    dish_code VARCHAR(50) NOT NULL,
    dish_name VARCHAR(255) NOT NULL,
    dish_type VARCHAR(50),
    unit_of_measure VARCHAR(20) DEFAULT 'Phần',
    selling_price NUMERIC(12, 2) DEFAULT 0,
    cost_price NUMERIC(12, 2) DEFAULT 0,
    profit_margin NUMERIC(5, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(branch_id, dish_code)
);

-- BẢNG CHI TIẾT CÔNG THỨC (NGUYÊN LIỆU TRONG MÓN)
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(id) ON DELETE CASCADE,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    material_id VARCHAR(50) NOT NULL,
    quantity_per_dish NUMERIC(12, 4) NOT NULL,
    unit VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BẢNG LOGS SYNC CUKCUK
CREATE TABLE IF NOT EXISTS cukcuk_sync_logs (
    id SERIAL PRIMARY KEY,
    branch_id VARCHAR(50) REFERENCES branches(branch_id) ON DELETE CASCADE,
    sync_type VARCHAR(50),
    status VARCHAR(20),
    records_imported INT DEFAULT 0,
    records_failed INT DEFAULT 0,
    error_message TEXT,
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
