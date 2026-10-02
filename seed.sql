-- ============================================================
-- DỮLIỆU MẪU CHO TESTING
-- ============================================================

-- Xóa dữ liệu cũ (nếu có)
DELETE FROM purchase_plan_details;
DELETE FROM purchase_plans;
DELETE FROM inventory_tracking;
DELETE FROM cukcuk_daily_sales;
DELETE FROM bill_of_materials;
DELETE FROM material_aliases;
DELETE FROM raw_materials;
DELETE FROM branches;

-- ============================================================
-- 1. BẢNG BRANCHES - CHI NHÁNH
-- ============================================================

INSERT INTO branches (branch_id, branch_name, cukcuk_company_code) VALUES
('CN_GOVAP', 'Fen Izakaya - Gò Vấp', 'FEN001'),
('CN_BD', 'Fen Izakaya - Bình Dương', 'FEN002'),
('CN_CTH', 'Fen Izakaya - Cộng Hòa', 'FEN003');

-- ============================================================
-- 2. BẢNG RAW_MATERIALS - MASTER NGUYÊN VẬT LIỆU
-- ============================================================

INSERT INTO raw_materials (material_id, material_name, normalized_name, category_group, purchase_cycle, unit_recipe, unit_purchase, conversion_rate, safety_stock, waste_rate) VALUES

-- THỊT (MEAT)
('TH00001', 'Thịt Bò Tươi', 'thit bo tuoi', 'MEAT', 'FRESH_3DAYS', 'gr', 'kg', 1000, 500, 5),
('TH00002', 'Thịt ba chỉ bò Mỹ lát', 'thit ba chi bo my lat', 'MEAT', 'FRESH_3DAYS', 'gr', 'kg', 1000, 1000, 8),
('TH00003', 'Thịt Gà Tươi', 'thit ga tuoi', 'MEAT', 'FRESH_3DAYS', 'gr', 'kg', 1000, 300, 6),

-- HẢI SẢN (SEAFOOD)
('HS00001', 'Cá Hồi Tươi', 'ca hoi tuoi', 'SEAFOOD', 'FRESH_3DAYS', 'gr', 'kg', 1000, 800, 10),
('HS00002', 'Tôm Sú Tươi', 'tom su tuoi', 'SEAFOOD', 'FRESH_3DAYS', 'gr', 'kg', 1000, 600, 7),

-- RAU CỦ (VEGETABLE)
('RC00001', 'Hành Tây', 'hanh tay', 'VEGETABLE', 'FRESH_3DAYS', 'gr', 'kg', 1000, 200, 3),
('RC00002', 'Tỏi Tươi', 'toi tuoi', 'VEGETABLE', 'FRESH_3DAYS', 'gr', 'kg', 1000, 100, 2),
('RC00003', 'Hành Lá Tươi', 'hanh la tuoi', 'VEGETABLE', 'FRESH_3DAYS', 'gr', 'kg', 1000, 150, 4),
('RC00004', 'Gừng Tươi', 'gung tuoi', 'VEGETABLE', 'FRESH_3DAYS', 'gr', 'kg', 1000, 200, 5),

-- GIA VỊ KHÔ (DRY_SPICE)
('GBB00001', 'Bột Ớt Togarashi 300G', 'bot ot togarashi 300g', 'DRY_SPICE', 'WEEKLY_7DAYS', 'gr', 'gói', 300, 0, 0),
('GBB00002', 'Mirin Nhật (500ml)', 'mirin nhat 500ml', 'DRY_SPICE', 'WEEKLY_7DAYS', 'ml', 'chai', 500, 0, 1),
('GBB00003', 'Sake (750ml)', 'sake 750ml', 'DRY_SPICE', 'WEEKLY_7DAYS', 'ml', 'chai', 750, 0, 1),
('GBB00004', 'Nước Tương Hondashi', 'nuoc tuong hondashi', 'DRY_SPICE', 'WEEKLY_7DAYS', 'ml', 'chai', 500, 0, 2);

-- ============================================================
-- 3. BẢNG BILL_OF_MATERIALS - ĐỊNH LƯỢNG MÓN ĂN
-- ============================================================

-- Chi nhánh Gò Vấp
INSERT INTO bill_of_materials (branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish) VALUES
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 'Phần', 450000, 'TH00002', 250),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 'Phần', 450000, 'RC00001', 30),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 'Phần', 450000, 'RC00003', 20),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 'Phần', 380000, 'HS00001', 150),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 'Phần', 380000, 'HS00002', 100),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 'Phần', 280000, 'TH00003', 180),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 'Phần', 280000, 'RC00003', 15),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 'Phần', 280000, 'GBB00002', 50);

-- ============================================================
-- 4. BẢNG CUKCUK_DAILY_SALES - DỮ LIỆU BÁN HÀNG
-- ============================================================

INSERT INTO cukcuk_daily_sales (branch_id, dish_id, dish_name, quantity_sold, sale_date) VALUES
-- Tuần trước
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 15, '2026-09-26'),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 18, '2026-09-27'),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 22, '2026-09-28'),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 25, '2026-09-29'),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 30, '2026-09-30'),

('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 8, '2026-09-26'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 10, '2026-09-27'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 12, '2026-09-28'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 14, '2026-09-29'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 16, '2026-09-30'),

('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 12, '2026-09-26'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 14, '2026-09-27'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 16, '2026-09-28'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 18, '2026-09-29'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 20, '2026-09-30'),

-- Tuần này (mới nhất)
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 28, '2026-10-01'),
('CN_GOVAP', 'SUKIYAKI_001', 'Sukiyaki Bò Hoa', 32, '2026-10-02'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 18, '2026-10-01'),
('CN_GOVAP', 'SASHIMI_001', 'Sashimi Hải Sản', 20, '2026-10-02'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 22, '2026-10-01'),
('CN_GOVAP', 'YAKITORI_001', 'Yakitori Gà', 24, '2026-10-02');

-- ============================================================
-- 5. BẢNG INVENTORY_TRACKING - TỒN KHO
-- ============================================================

INSERT INTO inventory_tracking (branch_id, material_id, period_date, closing_stock) VALUES
-- Tồn kho hiện tại
('CN_GOVAP', 'TH00002', '2026-10-02', 2500),   -- Thịt ba chỉ bò
('CN_GOVAP', 'RC00001', '2026-10-02', 1200),   -- Hành Tây
('CN_GOVAP', 'RC00003', '2026-10-02', 800),    -- Hành Lá
('CN_GOVAP', 'HS00001', '2026-10-02', 3000),   -- Cá Hồi
('CN_GOVAP', 'HS00002', '2026-10-02', 2000),   -- Tôm Sú
('CN_GOVAP', 'TH00003', '2026-10-02', 1800),   -- Thịt Gà
('CN_GOVAP', 'GBB00002', '2026-10-02', 2),     -- Mirin
('CN_GOVAP', 'GBB00001', '2026-10-02', 1);     -- Bột Ớt

-- ============================================================
-- KIỂM TRA DỮ LIỆU
-- ============================================================

SELECT '=== BRANCHES ===' as info;
SELECT * FROM branches;

SELECT '=== RAW MATERIALS ===' as info;
SELECT material_id, material_name, category_group, purchase_cycle FROM raw_materials LIMIT 5;

SELECT '=== BILL OF MATERIALS ===' as info;
SELECT * FROM bill_of_materials WHERE branch_id = 'CN_GOVAP' LIMIT 5;

SELECT '=== LATEST SALES ===' as info;
SELECT dish_id, dish_name, SUM(quantity_sold) as total_7days
FROM cukcuk_daily_sales
WHERE branch_id = 'CN_GOVAP'
GROUP BY dish_id, dish_name;

SELECT '=== CURRENT INVENTORY ===' as info;
SELECT i.material_id, r.material_name, i.closing_stock, r.unit_purchase
FROM inventory_tracking i
JOIN raw_materials r ON i.material_id = r.material_id
WHERE i.branch_id = 'CN_GOVAP'
ORDER BY i.period_date DESC;
