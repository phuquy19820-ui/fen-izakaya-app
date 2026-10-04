const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Pool, types } = require('pg');
types.setTypeParser(1700, (v) => parseFloat(v));
const next = require('next');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { matchDish, suggest, similarity } = require('./services/dishMatchService');
const { categorize, subGroupOf, normalizeString } = require('./services/bomService');
const { beverageDefaults, MODE_LABELS } = require('./services/beverageService');
const { defaultConversion } = require('./services/unitService');
const { parseAndSaveBOM } = require('./services/bomService');
const { classifyMaterial } = require('./services/materialClassificationService');
const PurchasePlanService = require('./services/purchasePlanService');

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Initialize database schema
async function initializeDatabase() {
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      const statements = schema.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await pool.query(statement);
          } catch (err) {
            // Table already exists or other expected errors - ignore
            if (!err.message.includes('already exists')) {
              console.warn('Statement error (may be expected):', err.message.substring(0, 100));
            }
          }
        }
      }
      const addCols = {
        branches: ['buyer_company VARCHAR(255)', 'cukcuk_company_code VARCHAR(100)', 'cukcuk_domain VARCHAR(255)', 'cukcuk_auth_token TEXT',
          'cukcuk_token_expires_at TIMESTAMP', 'is_active BOOLEAN DEFAULT TRUE',
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
        raw_materials: ['branch_id VARCHAR(50)', 'category VARCHAR(50)', 'category_group VARCHAR(50)',
          'unit_cost NUMERIC(14,2) DEFAULT 0', 'min_stock NUMERIC(12,2) DEFAULT 0', 'max_stock NUMERIC(12,2) DEFAULT 0',
          'lead_time_days INT DEFAULT 1', 'waste_rate NUMERIC(5,2) DEFAULT 0', 'shelf_life_days INT DEFAULT 30',
          'safety_stock NUMERIC(12,2) DEFAULT 0', 'price_source VARCHAR(20)', 'sub_group VARCHAR(60)', 'is_merged BOOLEAN DEFAULT FALSE', 'is_active BOOLEAN DEFAULT TRUE',
          'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
        inventory_tracking: ['opening_stock NUMERIC(12,2) DEFAULT 0', 'purchases_qty NUMERIC(12,2) DEFAULT 0',
          'sales_usage_qty NUMERIC(12,2) DEFAULT 0', 'waste_loss_qty NUMERIC(12,2) DEFAULT 0',
          'closing_stock NUMERIC(12,2) DEFAULT 0', 'stock_value NUMERIC(15,2) DEFAULT 0', 'notes TEXT',
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
        purchase_plan_details: ['branch_id VARCHAR(50)', 'material_name VARCHAR(255)', 'category VARCHAR(50)',
          'purchase_cycle VARCHAR(20)', 'sub_group VARCHAR(60)', 'unit_purchase VARCHAR(20)', 'avg_daily_sales NUMERIC(14,4) DEFAULT 0',
          'forecast_days INT DEFAULT 3', 'forecasted_demand NUMERIC(14,2) DEFAULT 0', 'safety_stock NUMERIC(14,2) DEFAULT 0',
          'reorder_point NUMERIC(14,2) DEFAULT 0', 'adjusted_qty NUMERIC(14,2)', 'unit_cost NUMERIC(14,2) DEFAULT 0',
          'estimated_cost NUMERIC(16,2) DEFAULT 0', "status VARCHAR(20) DEFAULT 'PENDING'",
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP']
      };
      const migrations = [];
      for (const [table, cols] of Object.entries(addCols)) {
        for (const col of cols) migrations.push(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col}`);
      }
      migrations.push(`CREATE TABLE IF NOT EXISTS dish_code_map (
        branch_id VARCHAR(50) NOT NULL,
        cukcuk_code VARCHAR(100) NOT NULL,
        cukcuk_name VARCHAR(255),
        cukcuk_kind VARCHAR(50),
        bom_dish_id VARCHAR(50),
        match_type VARCHAR(20) DEFAULT 'NONE',
        match_score NUMERIC(4,3) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, cukcuk_code)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS cukcuk_menu (
        branch_id VARCHAR(50) NOT NULL,
        item_code VARCHAR(100) NOT NULL,
        item_name VARCHAR(255) NOT NULL,
        item_type VARCHAR(60),
        category_name VARCHAR(100),
        inactive BOOLEAN DEFAULT FALSE,
        hidden BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, item_code)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS bom_deleted (
        id INT, branch_id VARCHAR(50), dish_id VARCHAR(50), dish_name VARCHAR(255), dish_unit VARCHAR(20),
        dish_price NUMERIC(12,2), material_id VARCHAR(50), quantity_per_dish NUMERIC(12,4), updated_at TIMESTAMP,
        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS beverage_buy_items (
        branch_id VARCHAR(50) NOT NULL, buy_name VARCHAR(255) NOT NULL, category VARCHAR(60), buy_unit VARCHAR(30) DEFAULT 'chai',
        size_ml NUMERIC(12,2) DEFAULT 0, unit_cost NUMERIC(14,2) DEFAULT 0, stock_qty NUMERIC(14,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, buy_name)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS beverage_config (
        branch_id VARCHAR(50) NOT NULL, item_code VARCHAR(100) NOT NULL, item_name VARCHAR(255), menu_type VARCHAR(60),
        mode VARCHAR(10) DEFAULT 'UNIT', ml_per_sale NUMERIC(12,2) DEFAULT 0, buy_name VARCHAR(255),
        PRIMARY KEY (branch_id, item_code)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS cukcuk_stock_daily (
        branch_id VARCHAR(50) NOT NULL, stock_date DATE NOT NULL, item_code VARCHAR(100) NOT NULL, item_name VARCHAR(255),
        category_name VARCHAR(100), unit_name VARCHAR(30), opening NUMERIC(18,4) DEFAULT 0, qty_in NUMERIC(18,4) DEFAULT 0,
        qty_out NUMERIC(18,4) DEFAULT 0, closing NUMERIC(18,4) DEFAULT 0, closing_amount NUMERIC(18,2) DEFAULT 0,
        PRIMARY KEY (branch_id, stock_date, item_code)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS stock_code_map (
        branch_id VARCHAR(50) NOT NULL, cukcuk_code VARCHAR(100) NOT NULL, cukcuk_name VARCHAR(255), unit_name VARCHAR(30),
        material_id VARCHAR(50), match_type VARCHAR(20) DEFAULT 'NONE', match_score NUMERIC(4,3) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, cukcuk_code)
      )`);
      for (const col of ['opening_stock', 'purchases_qty', 'sales_usage_qty', 'waste_loss_qty', 'closing_stock']) {
        migrations.push(`ALTER TABLE inventory_tracking ALTER COLUMN ${col} TYPE NUMERIC(18,4)`);
      }
      migrations.push(`CREATE TABLE IF NOT EXISTS suppliers (
        branch_id VARCHAR(50) NOT NULL, code VARCHAR(60) NOT NULL, name VARCHAR(255), phone VARCHAR(60), address VARCHAR(500),
        tax_code VARCHAR(60), contact VARCHAR(255), category VARCHAR(120), inactive BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, code)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS supplier_purchases (
        branch_id VARCHAR(50) NOT NULL, detail_id VARCHAR(80) NOT NULL, ref_no VARCHAR(60), purchase_date DATE NOT NULL,
        supplier_code VARCHAR(60), supplier_name VARCHAR(255), item_code VARCHAR(100) NOT NULL, item_name VARCHAR(255),
        unit_name VARCHAR(30), qty NUMERIC(18,4) DEFAULT 0, unit_price NUMERIC(18,4) DEFAULT 0, amount NUMERIC(18,2) DEFAULT 0,
        PRIMARY KEY (branch_id, detail_id)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id SERIAL PRIMARY KEY, branch_id VARCHAR(50) NOT NULL, order_year INT NOT NULL, order_month INT NOT NULL, seq INT NOT NULL,
        order_no VARCHAR(20) NOT NULL, buyer_company VARCHAR(255), supplier_code VARCHAR(60), supplier_name VARCHAR(255),
        total_amount NUMERIC(18,2) DEFAULT 0, line_count INT DEFAULT 0, payload JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (branch_id, order_year, order_month, seq)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS unit_conversions (
        branch_id VARCHAR(50) NOT NULL, item_code VARCHAR(100) NOT NULL, item_name VARCHAR(255), base_unit VARCHAR(30),
        small_unit VARCHAR(30), large_unit VARCHAR(30), ratio NUMERIC(18,4) DEFAULT 1, source VARCHAR(10) DEFAULT 'DEFAULT',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, item_code)
      )`);
      migrations.push('ALTER TABLE supplier_purchases ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(6,2) DEFAULT 0');
      migrations.push('ALTER TABLE supplier_purchases ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(18,2) DEFAULT 0');
      migrations.push('ALTER TABLE supplier_purchases ADD COLUMN IF NOT EXISTS total_amount NUMERIC(18,2) DEFAULT 0');
      migrations.push(`CREATE TABLE IF NOT EXISTS supplier_payments (
        branch_id VARCHAR(50) NOT NULL, ref_id VARCHAR(80) NOT NULL, ref_no VARCHAR(60), pay_date DATE NOT NULL,
        source VARCHAR(10), type_name VARCHAR(80), amount NUMERIC(18,2) DEFAULT 0, reason TEXT, budget_item TEXT,
        manual_supplier_code VARCHAR(60), ignored BOOLEAN DEFAULT FALSE, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, ref_id)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS supplier_opening_debt (
        branch_id VARCHAR(50) NOT NULL, name_key VARCHAR(255) NOT NULL, name VARCHAR(255), amount NUMERIC(18,2) DEFAULT 0,
        as_of DATE NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, name_key)
      )`);
      migrations.push(`CREATE TABLE IF NOT EXISTS supplier_debt_snapshot (
        branch_id VARCHAR(50) NOT NULL, vendor_code VARCHAR(60) NOT NULL, vendor_name VARCHAR(255),
        first_amount NUMERIC(18,2) DEFAULT 0, increase_amount NUMERIC(18,2) DEFAULT 0, decrease_amount NUMERIC(18,2) DEFAULT 0,
        last_amount NUMERIC(18,2) DEFAULT 0, from_date DATE, to_date DATE, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, vendor_code)
      )`);
      migrations.push('ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP');
      migrations.push('ALTER TABLE cukcuk_daily_sales ADD COLUMN IF NOT EXISTS revenue NUMERIC(16,2) DEFAULT 0');
      migrations.push('CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON cukcuk_daily_sales (branch_id, sale_date)');
      migrations.push('ALTER TABLE raw_materials ALTER COLUMN category DROP NOT NULL');
      migrations.push('CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_branch_mat_date ON inventory_tracking (branch_id, material_id, period_date)');
      for (const m of migrations) {
        try {
          await pool.query(m);
        } catch (err) {
          console.warn('Migration error:', m, err.message);
        }
      }
      try {
        const missing = await pool.query('SELECT material_id, material_name, category FROM raw_materials WHERE sub_group IS NULL OR is_auto_created = TRUE');
        for (const m of missing.rows) {
          await pool.query('UPDATE raw_materials SET sub_group = $2 WHERE material_id = $1', [m.material_id, subGroupOf(m.category, m.material_name)]);
        }
        await pool.query("UPDATE raw_materials SET is_active = FALSE WHERE sub_group = 'Vật tư & khác'");
        if (missing.rows.length) console.log('✅ Đã phân nhóm chi tiết cho ' + missing.rows.length + ' NVL');
      } catch (err) {
        console.warn('Backfill sub_group error:', err.message);
      }
      console.log('✅ Database schema initialized successfully.');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
  }
}

// 1. API Lấy danh sách chi nhánh
app.get('/api/branches', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM branches WHERE is_active = TRUE ORDER BY branch_name');
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ GET /api/branches error:', error.message, error.stack);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. API Lấy chi tiết chi nhánh
app.get('/api/branches/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM branches WHERE branch_id = $1', [branchId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Chi nhánh không tìm thấy' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 3. API Tạo chi nhánh mới
app.post('/api/branches/create', async (req, res) => {
  const { branchId, branchName, cukcukCompanyCode, cukcukDomain } = req.body;
  if (!branchId || !branchName) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin chi nhánh' });
  }
  try {
    await pool.query(`
      INSERT INTO branches (branch_id, branch_name, cukcuk_company_code, cukcuk_domain, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (branch_id) DO UPDATE SET
        branch_name = $2, cukcuk_company_code = $3, cukcuk_domain = $4, is_active = TRUE
    `, [branchId, branchName, cukcukCompanyCode || '', cukcukDomain || '']);
    return res.json({ success: true, message: `Đã tạo/cập nhật chi nhánh ${branchName}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. API Upload BOM (Định lượng)
app.post('/api/bom/upload', upload.single('file'), async (req, res) => {
  const { branchId } = req.body;
  if (!req.file || !branchId) {
    return res.status(400).json({ success: false, message: 'Thiếu file hoặc Chi nhánh' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary = await parseAndSaveBOM(req.file.buffer, branchId, client, req.file.originalname);
    summary.rematched = (await rematchBranch(client, branchId)).matched;
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Tải định lượng thành công!', data: summary });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('BOM upload error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 5. API Lấy danh sách NVL theo chi nhánh
app.get('/api/materials/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const result = await pool.query(`
      SELECT * FROM raw_materials rm
      WHERE rm.is_active IS NOT FALSE
        AND EXISTS (SELECT 1 FROM bill_of_materials b WHERE b.material_id = rm.material_id AND b.branch_id = $1)
      ORDER BY rm.category, rm.material_name
    `, [branchId]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Ghép lại tự động các món CUKCUK chưa có món định lượng (giữ nguyên ghép tay)
async function rematchBranch(db, branchId) {
  const bom = (await db.query('SELECT DISTINCT dish_id, dish_name FROM bill_of_materials WHERE branch_id = $1', [branchId])).rows;
  const pending = (await db.query(
    "SELECT cukcuk_code, cukcuk_name FROM dish_code_map WHERE branch_id = $1 AND bom_dish_id IS NULL AND match_type <> 'MANUAL'", [branchId])).rows;
  let matched = 0;
  for (const m of pending) {
    const r = matchDish(m.cukcuk_name, bom);
    if (!r) continue;
    await db.query(
      'UPDATE dish_code_map SET bom_dish_id = $3, match_type = $4, match_score = $5, updated_at = NOW() WHERE branch_id = $1 AND cukcuk_code = $2',
      [branchId, m.cukcuk_code, r.dishId, r.type, r.score]);
    matched++;
  }
  return { pending: pending.length, matched };
}

app.post('/api/sales/rematch/:branchId', async (req, res) => {
  try {
    return res.json({ success: true, data: await rematchBranch(pool, req.params.branchId) });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Doanh số từ báo cáo CUKCUK "Chi tiết doanh thu theo hóa đơn và mặt hàng"
// Doanh số lưu theo MÃ MÓN CUKCUK; bảng dish_code_map ghép sang mã món trong file định lượng (BOM).
app.post('/api/sales/import', async (req, res) => {
  const { branchId, rows, source } = req.body;
  if (!branchId || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dữ liệu doanh số' });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const clean = rows
    .map(r => ({ date: String(r.date || ''), code: String(r.code || '').trim(), name: String(r.name || '').trim(), kind: String(r.kind || '').trim(), qty: Number(r.qty), amount: Number(r.amount) || 0 }))
    .filter(r => dateRe.test(r.date) && r.code && Number.isFinite(r.qty) && r.qty !== 0);
  if (clean.length === 0) {
    return res.status(400).json({ success: false, message: 'Không có dòng doanh số hợp lệ (cần date YYYY-MM-DD, code, qty)' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const bomRes = await client.query('SELECT DISTINCT dish_id, dish_name FROM bill_of_materials WHERE branch_id = $1', [branchId]);
    const bomDishes = bomRes.rows;

    const existingRes = await client.query('SELECT cukcuk_code, bom_dish_id, match_type FROM dish_code_map WHERE branch_id = $1', [branchId]);
    const existing = new Map(existingRes.rows.map(r => [r.cukcuk_code, r]));

    const seen = new Map();
    clean.forEach(r => { if (!seen.has(r.code)) seen.set(r.code, r); });
    for (const r of seen.values()) {
      const cur = existing.get(r.code);
      if (cur && (cur.bom_dish_id || cur.match_type === 'MANUAL')) {
        await client.query('UPDATE dish_code_map SET cukcuk_name = $3, cukcuk_kind = $4, updated_at = NOW() WHERE branch_id = $1 AND cukcuk_code = $2', [branchId, r.code, r.name, r.kind]);
        continue;
      }
      const m = matchDish(r.name, bomDishes);
      await client.query(`
        INSERT INTO dish_code_map (branch_id, cukcuk_code, cukcuk_name, cukcuk_kind, bom_dish_id, match_type, match_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (branch_id, cukcuk_code) DO UPDATE SET
          cukcuk_name = EXCLUDED.cukcuk_name, cukcuk_kind = EXCLUDED.cukcuk_kind,
          bom_dish_id = EXCLUDED.bom_dish_id, match_type = EXCLUDED.match_type,
          match_score = EXCLUDED.match_score, updated_at = NOW()
      `, [branchId, r.code, r.name, r.kind, m ? m.dishId : null, m ? m.type : 'NONE', m ? m.score : 0]);
    }

    const agg = new Map();
    for (const r of clean) {
      const k = r.date + '|' + r.code;
      const cur = agg.get(k) || { ...r, qty: 0, amount: 0 };
      cur.qty += r.qty;
      cur.amount += r.amount;
      agg.set(k, cur);
    }
    const dates = clean.map(r => r.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    await client.query('DELETE FROM cukcuk_daily_sales WHERE branch_id = $1 AND sale_date BETWEEN $2 AND $3', [branchId, minDate, maxDate]);
    for (const r of agg.values()) {
      await client.query(
        'INSERT INTO cukcuk_daily_sales (branch_id, dish_id, dish_name, quantity_sold, sale_date, revenue) VALUES ($1,$2,$3,$4,$5,$6)',
        [branchId, r.code, r.name.substring(0, 255), r.qty, r.date, r.amount]);
    }
    await client.query(
      "INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported) VALUES ($1, $2, 'SUCCESS', $3)",
      [branchId, source || 'SALES_REPORT', agg.size]);
    await client.query('COMMIT');

    const stat = await pool.query(`
      SELECT COUNT(*) FILTER (WHERE m.bom_dish_id IS NOT NULL) AS matched_codes,
             COUNT(*) AS total_codes,
             COALESCE(SUM(t.qty) FILTER (WHERE m.bom_dish_id IS NOT NULL), 0) AS matched_qty,
             COALESCE(SUM(t.qty), 0) AS total_qty
      FROM dish_code_map m
      JOIN (SELECT dish_id, SUM(quantity_sold) AS qty FROM cukcuk_daily_sales WHERE branch_id = $1 GROUP BY dish_id) t
        ON t.dish_id = m.cukcuk_code
      WHERE m.branch_id = $1
    `, [branchId]);
    return res.json({
      success: true,
      message: 'Đã nhập doanh số CUKCUK!',
      data: { fromDate: minDate, toDate: maxDate, salesRecords: agg.size, ...stat.rows[0] }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Sales import error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Trạng thái doanh số + danh sách món CUKCUK chưa ghép được với định lượng
app.get('/api/sales/status/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const range = await pool.query(
      'SELECT MIN(sale_date) AS from_date, MAX(sale_date) AS to_date, COUNT(*) AS records FROM cukcuk_daily_sales WHERE branch_id = $1', [branchId]);
    const maps = await pool.query(`
      SELECT m.cukcuk_code, m.cukcuk_name, m.cukcuk_kind, m.bom_dish_id, m.match_type, m.match_score,
             COALESCE(t.qty, 0) AS qty
      FROM dish_code_map m
      LEFT JOIN (SELECT dish_id, SUM(quantity_sold) AS qty FROM cukcuk_daily_sales WHERE branch_id = $1 GROUP BY dish_id) t
        ON t.dish_id = m.cukcuk_code
      WHERE m.branch_id = $1
      ORDER BY (m.bom_dish_id IS NULL) DESC, COALESCE(t.qty, 0) DESC
    `, [branchId]);
    const dishes = await pool.query(
      'SELECT DISTINCT dish_id, dish_name FROM bill_of_materials WHERE branch_id = $1 ORDER BY dish_name', [branchId]);
    const mappings = maps.rows.map(m => {
      if (m.bom_dish_id || m.cukcuk_kind !== 'Món ăn') return m;
      const s = suggest(m.cukcuk_name, dishes.rows, 1)[0];
      return { ...m, suggestion: s && s.score >= 0.5 ? { dish_id: s.dish_id, dish_name: s.dish_name, score: Math.round(s.score * 100) / 100 } : null };
    });
    return res.json({ success: true, data: { range: range.rows[0], mappings, bomDishes: dishes.rows } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Ghép tay một món CUKCUK với món trong định lượng (bomDishId = null để bỏ qua món đó)
app.post('/api/sales/map', async (req, res) => {
  const { branchId, cukcukCode, bomDishId } = req.body;
  if (!branchId || !cukcukCode) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin ghép món' });
  }
  try {
    const r = await pool.query(`
      UPDATE dish_code_map SET bom_dish_id = $3, match_type = 'MANUAL', match_score = 1, updated_at = NOW()
      WHERE branch_id = $1 AND cukcuk_code = $2
    `, [branchId, cukcukCode, bomDishId || null]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy món CUKCUK' });
    return res.json({ success: true, message: 'Đã lưu ghép món' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});


// Báo cáo doanh thu theo món / theo ngày
app.get('/api/sales/report/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = dateRe.test(req.query.from || '') ? req.query.from : '1970-01-01';
  const to = dateRe.test(req.query.to || '') ? req.query.to : '2999-12-31';
  try {
    const range = await pool.query(
      'SELECT MIN(sale_date) AS min_date, MAX(sale_date) AS max_date FROM cukcuk_daily_sales WHERE branch_id = $1', [branchId]);
    const byDish = await pool.query(`
      SELECT s.dish_id AS code, COALESCE(MAX(m.cukcuk_name), MAX(s.dish_name)) AS name,
             COALESCE(MAX(m.cukcuk_kind), '') AS kind,
             BOOL_OR(m.bom_dish_id IS NOT NULL) AS matched,
             SUM(s.quantity_sold) AS qty, SUM(s.revenue) AS revenue, COUNT(DISTINCT s.sale_date) AS days
      FROM cukcuk_daily_sales s
      LEFT JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id
      WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3
      GROUP BY s.dish_id
      ORDER BY SUM(s.revenue) DESC, SUM(s.quantity_sold) DESC
    `, [branchId, from, to]);
    const byDay = await pool.query(`
      SELECT s.sale_date AS date, SUM(s.quantity_sold) AS qty, SUM(s.revenue) AS revenue,
             SUM(s.revenue) FILTER (WHERE m.cukcuk_kind = 'Món ăn') AS food_revenue,
             SUM(s.revenue) FILTER (WHERE m.cukcuk_kind = 'Đồ uống') AS drink_revenue,
             SUM(s.quantity_sold) FILTER (WHERE m.cukcuk_kind = 'Món ăn') AS food_qty
      FROM cukcuk_daily_sales s
      LEFT JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id
      WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3
      GROUP BY s.sale_date ORDER BY s.sale_date
    `, [branchId, from, to]);
    return res.json({ success: true, data: { range: range.rows[0], byDish: byDish.rows, byDay: byDay.rows } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Danh sách toàn bộ NVL (để tìm và chọn khi tạo món mới)
app.get('/api/material-list', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT material_id, material_name, unit_recipe, unit_purchase, category, sub_group, unit_cost
      FROM raw_materials WHERE is_active IS NOT FALSE ORDER BY material_name`);
    return res.json({ success: true, data: r.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Tạo NVL mới: nhóm hàng tự phân loại theo tên
app.post('/api/materials/create', async (req, res) => {
  const { name, recipeUnit, unitCost } = req.body;
  const cleanName = String(name || '').trim();
  if (!cleanName) return res.status(400).json({ success: false, message: 'Thiếu tên NVL' });
  const unit = String(recipeUnit || 'gr').trim() || 'gr';
  const lower = unit.toLowerCase();
  const isWeight = ['gr', 'g', 'gram'].includes(lower);
  const isVolume = ['ml'].includes(lower);
  const purchaseUnit = isWeight ? 'kg' : (isVolume ? 'lít' : unit);
  const conv = (isWeight || isVolume) ? 1000 : 1;
  const cost = Math.max(0, Number(unitCost) || 0);
  try {
    const normName = normalizeString(cleanName);
    const dup = await pool.query('SELECT material_id, material_name FROM raw_materials WHERE normalized_name = $1 LIMIT 1', [normName]);
    if (dup.rows.length) {
      return res.status(409).json({ success: false, message: 'NVL này đã có: ' + dup.rows[0].material_name, data: dup.rows[0] });
    }
    const cat = categorize('', cleanName);
    const sub = subGroupOf(cat.code, cleanName);
    const id = ('NEW_' + normName.substring(0, 18).toUpperCase() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase()).substring(0, 50);
    await pool.query(`
      INSERT INTO raw_materials (material_id, material_name, normalized_name, category, category_group, purchase_cycle,
        unit_recipe, unit_purchase, conversion_rate, unit_cost, lead_time_days, waste_rate, shelf_life_days,
        is_auto_created, is_active, sub_group, price_source)
      VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,FALSE,TRUE,$13,$14)
    `, [id, cleanName.substring(0, 255), normName.substring(0, 255), cat.code, cat.purchase_cycle, unit.substring(0, 20),
      purchaseUnit.substring(0, 20), conv, cost, cat.purchase_cycle === 'FRESH_3DAYS' ? 1 : 3, cat.waste_percentage,
      cat.shelf_life_days, sub, cost > 0 ? 'FILE' : 'MISSING']);
    return res.json({
      success: true, message: 'Đã tạo NVL mới',
      data: { material_id: id, material_name: cleanName, unit_recipe: unit, unit_purchase: purchaseUnit, category: cat.code, sub_group: sub, unit_cost: cost }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Tạo món mới kèm định lượng; nếu có cukcukCode thì ghép luôn món CUKCUK đó với món vừa tạo
app.post('/api/dishes/create', async (req, res) => {
  const { branchId, dishName, cukcukCode, ingredients } = req.body;
  const name = String(dishName || '').trim();
  if (!branchId || !name) return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc tên món' });
  const items = (Array.isArray(ingredients) ? ingredients : [])
    .map(i => ({ materialId: String(i.materialId || ''), qty: Number(i.quantity) }))
    .filter(i => i.materialId && Number.isFinite(i.qty) && i.qty > 0);
  if (items.length === 0) return res.status(400).json({ success: false, message: 'Món cần ít nhất 1 NVL với số lượng > 0' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dup = await client.query('SELECT 1 FROM bill_of_materials WHERE branch_id = $1 AND LOWER(dish_name) = LOWER($2) LIMIT 1', [branchId, name]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Đã có món trùng tên trong định lượng. Hãy chọn món đó ở ô tìm kiếm thay vì tạo mới.' });
    }
    const ids = await client.query('SELECT material_id FROM raw_materials WHERE material_id = ANY($1)', [items.map(i => i.materialId)]);
    const known = new Set(ids.rows.map(r => r.material_id));
    const unknown = items.filter(i => !known.has(i.materialId));
    if (unknown.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Có NVL không tồn tại: ' + unknown.map(u => u.materialId).join(', ') });
    }
    const dishId = ('NEW_' + normalizeString(name).substring(0, 20).toUpperCase() + '_' + Math.random().toString(36).slice(2, 6).toUpperCase()).substring(0, 50);
    for (const i of items) {
      await client.query(
        'INSERT INTO bill_of_materials (branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish) VALUES ($1,$2,$3,$4,0,$5,$6)',
        [branchId, dishId, name.substring(0, 255), 'Phần', i.materialId, i.qty]);
    }
    if (cukcukCode) {
      await client.query(
        "UPDATE dish_code_map SET bom_dish_id = $3, match_type = 'MANUAL', match_score = 1, updated_at = NOW() WHERE branch_id = $1 AND cukcuk_code = $2",
        [branchId, cukcukCode, dishId]);
    }
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã tạo món mới', data: { dish_id: dishId, dish_name: name } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Thực đơn CUKCUK (Danh mục → Thực đơn) của từng chi nhánh
app.post('/api/menu/import', async (req, res) => {
  const { branchId, items } = req.body;
  if (!branchId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc danh sách thực đơn' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cukcuk_menu WHERE branch_id = $1', [branchId]);
    let n = 0;
    for (const it of items) {
      const code = String(it.code || '').trim();
      const name = String(it.name || '').trim();
      if (!code || !name) continue;
      await client.query(
        `INSERT INTO cukcuk_menu (branch_id, item_code, item_name, item_type, category_name, inactive, hidden)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (branch_id, item_code) DO NOTHING`,
        [branchId, code.substring(0, 100), name.substring(0, 255), String(it.type || '').substring(0, 60),
          String(it.category || '').substring(0, 100), !!it.inactive, !!it.hidden]);
      n++;
    }
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã lưu thực đơn CUKCUK', data: { items: n } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

const SAUCE_WORDS = [' sốt ', ' sauce ', ' sot ', ' nước chấm ', ' dressing ', ' mayo '];
const isSauceName = (name) => {
  const t = ' ' + String(name || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  return SAUCE_WORDS.some(w => t.includes(w));
};

// Phân loại từng món trong định lượng so với thực đơn: giữ / cần xem lại / xóa
async function classifyBomForMenu(db, branchId) {
  const menu = (await db.query('SELECT item_code, item_name, item_type FROM cukcuk_menu WHERE branch_id = $1', [branchId])).rows;
  if (menu.length === 0) throw new Error('Chưa có thực đơn CUKCUK của chi nhánh này. Hãy lấy thực đơn trước.');
  const dishes = (await db.query(
    'SELECT dish_id, MIN(dish_name) AS dish_name, COUNT(*) AS ingredient_rows FROM bill_of_materials WHERE branch_id = $1 GROUP BY dish_id ORDER BY MIN(dish_name)', [branchId])).rows;
  const mapped = new Set((await db.query(
    'SELECT DISTINCT bom_dish_id FROM dish_code_map WHERE branch_id = $1 AND bom_dish_id IS NOT NULL', [branchId])).rows.map(r => r.bom_dish_id));

  return dishes.map(d => {
    const base = { dish_id: d.dish_id, dish_name: d.dish_name, ingredient_rows: Number(d.ingredient_rows) };
    if (d.dish_id.startsWith('NEW_')) return { ...base, status: 'KEEP', reason: 'Món do bạn tạo trong app' };
    const exact = menu.find(m => normalizeString(m.item_name) === normalizeString(d.dish_name));
    let best = exact ? { item: exact, score: 1 } : null;
    if (!best) {
      for (const m of menu) {
        const score = similarity(d.dish_name, m.item_name);
        if (!best || score > best.score) best = { item: m, score };
      }
    }
    const near = best ? { menu_name: best.item.item_name, score: Math.round(best.score * 100) / 100 } : null;
    if (mapped.has(d.dish_id)) return { ...base, status: 'KEEP', reason: 'Đã ghép với món đang bán', near };
    if (best && best.score >= 0.85) return { ...base, status: 'KEEP', reason: 'Có trong thực đơn', near };
    if (isSauceName(d.dish_name)) return { ...base, status: 'KEEP', reason: 'Định lượng sốt (giữ lại)', near };
    if (best && best.score >= 0.6) return { ...base, status: 'REVIEW', reason: 'Tên gần giống một món thực đơn (giữ lại, bạn kiểm tra)', near };
    return { ...base, status: 'DELETE', reason: 'Không có trong thực đơn', near };
  });
}

app.get('/api/menu/cleanup-preview/:branchId', async (req, res) => {
  try {
    const rows = await classifyBomForMenu(pool, req.params.branchId);
    const count = (s) => rows.filter(r => r.status === s).length;
    return res.json({
      success: true,
      data: {
        totalDishes: rows.length, keep: count('KEEP'), review: count('REVIEW'), delete: count('DELETE'),
        deleteRows: rows.filter(r => r.status === 'DELETE').reduce((s, r) => s + r.ingredient_rows, 0),
        dishes: rows
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Xóa định lượng không có trong thực đơn. Lưu bản sao vào bom_deleted để khôi phục khi cần.
app.post('/api/menu/cleanup', async (req, res) => {
  const { branchId, confirm } = req.body;
  if (!branchId || confirm !== true) {
    return res.status(400).json({ success: false, message: 'Cần branchId và confirm: true' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await classifyBomForMenu(client, branchId);
    const ids = rows.filter(r => r.status === 'DELETE').map(r => r.dish_id);
    if (ids.length === 0) {
      await client.query('ROLLBACK');
      return res.json({ success: true, message: 'Không có định lượng nào cần xóa', data: { deletedDishes: 0, deletedRows: 0 } });
    }
    await client.query(`
      INSERT INTO bom_deleted (id, branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish, updated_at)
      SELECT id, branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish, updated_at
      FROM bill_of_materials WHERE branch_id = $1 AND dish_id = ANY($2)
    `, [branchId, ids]);
    const del = await client.query('DELETE FROM bill_of_materials WHERE branch_id = $1 AND dish_id = ANY($2)', [branchId, ids]);
    await client.query('COMMIT');
    return res.json({
      success: true, message: 'Đã xóa định lượng không có trong thực đơn',
      data: { deletedDishes: ids.length, deletedRows: del.rowCount, kept: rows.length - ids.length }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Ghi nhớ tên công ty mua theo từng chi nhánh
app.put('/api/branches/:branchId/buyer', async (req, res) => {
  const company = String(req.body.buyerCompany || '').trim().substring(0, 255);
  try {
    const r = await pool.query('UPDATE branches SET buyer_company = $2, updated_at = NOW() WHERE branch_id = $1', [req.params.branchId, company || null]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy chi nhánh' });
    return res.json({ success: true, message: 'Đã lưu tên công ty mua' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Xuất đơn mua hàng ra Excel để gửi nhà cung cấp
app.post('/api/purchase-plans/export-xlsx', async (req, res) => {
  const { buyerCompany, branchName, supplier, supplierPhone, supplierAddress, orderNo, deliveryDate, note, cycleLabel, showPrice = true, lines } = req.body;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 3000) {
    return res.status(400).json({ success: false, message: 'Không có dòng hàng để xuất' });
  }
  try {
    const items = lines
      .map(l => ({
        code: String(l.code || ''), name: String(l.name || ''), group: String(l.group || 'Khác'), unit: String(l.unit || ''),
        qty: Number(l.qty) || 0, price: Number(l.price) || 0
      }))
      .filter(l => l.qty > 0)
      .sort((a, b) => a.group.localeCompare(b.group, 'vi') || a.name.localeCompare(b.name, 'vi'));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Đơn mua hàng', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
    });
    const cols = showPrice
      ? [['STT', 6], ['Mã NVL', 18], ['Tên nguyên vật liệu', 46], ['ĐVT', 8], ['Số lượng', 12], ['Đơn giá (đ)', 14], ['Thành tiền (đ)', 16]]
      : [['STT', 6], ['Mã NVL', 18], ['Tên nguyên vật liệu', 54], ['ĐVT', 10], ['Số lượng', 14]];
    ws.columns = cols.map(([, w]) => ({ width: w }));
    const lastCol = cols.length;

    const thin = { style: 'thin', color: { argb: 'FFBBBBBB' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const addText = (text, opts = {}) => {
      const row = ws.addRow([text]);
      ws.mergeCells(row.number, 1, row.number, lastCol);
      row.getCell(1).font = { name: 'Arial', size: opts.size || 10, bold: !!opts.bold };
      row.getCell(1).alignment = { horizontal: opts.center ? 'center' : 'left', vertical: 'middle' };
      return row;
    };

    addText('ĐƠN ĐẶT MUA NGUYÊN VẬT LIỆU', { size: 16, bold: true, center: true }).height = 28;
    if (orderNo) addText('Số: ' + orderNo, { size: 12, bold: true, center: true });
    if (cycleLabel) addText(cycleLabel, { center: true });
    ws.addRow([]);
    addText('Công ty mua: ' + (buyerCompany || ''), { bold: true });
    if (branchName) addText('Chi nhánh: ' + branchName);
    if (supplier) addText('Nhà cung cấp: ' + supplier);
    if (supplierPhone) addText('Điện thoại NCC: ' + supplierPhone);
    if (supplierAddress) addText('Địa chỉ NCC: ' + supplierAddress);
    addText('Ngày lập: ' + new Date().toLocaleDateString('vi-VN'));
    if (deliveryDate) addText('Ngày giao hàng yêu cầu: ' + String(deliveryDate).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'));
    if (note) addText('Ghi chú: ' + note);
    ws.addRow([]);

    const header = ws.addRow(cols.map(([label]) => label));
    header.eachCell(c => {
      c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0073C5' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = border;
    });
    header.height = 22;

    let stt = 0;
    let grand = 0;
    let currentGroup = null;
    let groupTotal = 0;
    const flushGroup = () => {
      if (currentGroup === null || !showPrice) return;
      const r = ws.addRow([]);
      r.getCell(lastCol - 1).value = 'Cộng nhóm:';
      r.getCell(lastCol - 1).font = { name: 'Arial', size: 10, italic: true };
      r.getCell(lastCol - 1).alignment = { horizontal: 'right' };
      r.getCell(lastCol).value = Math.round(groupTotal);
      r.getCell(lastCol).numFmt = '#,##0';
      r.getCell(lastCol).font = { name: 'Arial', size: 10, italic: true };
    };
    for (const it of items) {
      if (it.group !== currentGroup) {
        flushGroup();
        currentGroup = it.group;
        groupTotal = 0;
        const g = ws.addRow([it.group.toUpperCase()]);
        ws.mergeCells(g.number, 1, g.number, lastCol);
        g.getCell(1).font = { name: 'Arial', size: 10, bold: true };
        g.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FA' } };
      }
      stt++;
      const amount = Math.round(it.qty * it.price);
      groupTotal += amount;
      grand += amount;
      const values = showPrice
        ? [stt, it.code, it.name, it.unit, it.qty, it.price, amount]
        : [stt, it.code, it.name, it.unit, it.qty];
      const r = ws.addRow(values);
      r.eachCell((c, n) => {
        c.font = { name: 'Arial', size: 10 };
        c.border = border;
        if (n === 1 || n === 4) c.alignment = { horizontal: 'center' };
        if (n === 5) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; }
        if (showPrice && n >= 6) { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right' }; }
      });
    }
    flushGroup();

    if (showPrice) {
      const t = ws.addRow([]);
      t.getCell(lastCol - 1).value = 'TỔNG CỘNG:';
      t.getCell(lastCol - 1).font = { name: 'Arial', size: 11, bold: true };
      t.getCell(lastCol - 1).alignment = { horizontal: 'right' };
      t.getCell(lastCol).value = grand;
      t.getCell(lastCol).numFmt = '#,##0';
      t.getCell(lastCol).font = { name: 'Arial', size: 11, bold: true };
      t.getCell(lastCol).border = border;
    }

    ws.addRow([]);
    const sig = ws.addRow([]);
    sig.getCell(2).value = 'Người lập';
    sig.getCell(3).value = 'Người duyệt';
    sig.getCell(lastCol - 1).value = 'Nhà cung cấp xác nhận';
    sig.eachCell(c => { c.font = { name: 'Arial', size: 10, bold: true }; c.alignment = { horizontal: 'center' }; });
    ws.views = [{ state: 'frozen', ySplit: header.number }];

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="don-mua-hang.xlsx"');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ====== ĐỒ UỐNG: dự kiến mua theo số lượng bán (không cần định lượng) ======
async function seedBeverages(db, branchId) {
  const menu = (await db.query(
    "SELECT item_code, item_name, item_type FROM cukcuk_menu WHERE branch_id = $1 AND item_type LIKE 'Đồ uống%'", [branchId])).rows;
  const sold = (await db.query(
    "SELECT cukcuk_code AS item_code, cukcuk_name AS item_name, '' AS item_type FROM dish_code_map WHERE branch_id = $1 AND cukcuk_kind = 'Đồ uống'", [branchId])).rows;
  const seen = new Set();
  const items = [...menu, ...sold].filter((i) => (seen.has(i.item_code) ? false : (seen.add(i.item_code), true)));
  for (const it of items) {
    const d = beverageDefaults(it.item_name, it.item_type);
    const ins = await db.query(
      `INSERT INTO beverage_config (branch_id, item_code, item_name, menu_type, mode, ml_per_sale, buy_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (branch_id, item_code) DO NOTHING`,
      [branchId, it.item_code, it.item_name, it.item_type, d.mode, d.mlPerSale, d.buy ? d.buy.name : null]);
    if (d.buy) {
      await db.query(
        `INSERT INTO beverage_buy_items (branch_id, buy_name, category, buy_unit, size_ml)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (branch_id, buy_name) DO NOTHING`,
        [branchId, d.buy.name, d.buy.category, d.buy.unit, d.buy.sizeMl]);
    }
  }
}

app.get('/api/beverage/plan/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const cycleDays = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
  try {
    await seedBeverages(pool, branchId);
    const WINDOW = 7;
    const buyItems = (await pool.query('SELECT * FROM beverage_buy_items WHERE branch_id = $1', [branchId])).rows;
    const cfg = (await pool.query("SELECT * FROM beverage_config WHERE branch_id = $1 AND mode <> 'IGNORE' AND buy_name IS NOT NULL", [branchId])).rows;
    const sales = (await pool.query(`
      SELECT dish_id, SUM(quantity_sold) AS qty FROM cukcuk_daily_sales
      WHERE branch_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${WINDOW} days' GROUP BY dish_id`, [branchId])).rows;
    const soldMap = Object.fromEntries(sales.map((s) => [s.dish_id, Number(s.qty) || 0]));
    const daysRow = (await pool.query(
      `SELECT COUNT(DISTINCT sale_date) AS d, MIN(sale_date) AS f, MAX(sale_date) AS t FROM cukcuk_daily_sales
       WHERE branch_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${WINDOW} days'`, [branchId])).rows[0];
    const salesDays = Math.max(1, Number(daysRow.d) || 1);

    const byBuy = new Map(buyItems.map((b) => [b.buy_name, { ...b, soldQty: 0, consumed: 0, warn: '' }]));
    for (const c of cfg) {
      const b = byBuy.get(c.buy_name);
      const q = soldMap[c.item_code] || 0;
      if (!b || q === 0) continue;
      b.soldQty += q;
      if (c.mode === 'UNIT') b.consumed += q;
      else if (b.size_ml > 0) b.consumed += (q * c.ml_per_sale) / b.size_ml;
      else b.warn = 'Chưa nhập quy cách (ml/ĐVT) nên chưa tính được';
    }

    const rows = [];
    for (const b of byBuy.values()) {
      const avg = b.consumed / salesDays;
      const safety = PurchasePlanService.calculateSafetyStock(avg, 1);
      const forecast = PurchasePlanService.calculateForecastedDemand(avg, cycleDays, 0);
      const rop = PurchasePlanService.calculateReorderPoint(avg, 1, safety);
      const stock = Number(b.stock_qty) || 0;
      let suggested = PurchasePlanService.calculatePurchaseQty(stock, forecast, rop, safety);
      suggested = b.buy_unit === 'lít' ? Math.ceil(suggested * 10) / 10 : Math.ceil(suggested - 1e-9);
      const cost = Number(b.unit_cost) || 0;
      let note = b.warn;
      if (!note && b.soldQty === 0) note = 'Chưa có dữ liệu bán';
      if (!note && cost === 0) note = 'Chưa có đơn giá';
      rows.push({
        buy_name: b.buy_name, category: b.category || 'Khác', buy_unit: b.buy_unit, size_ml: Number(b.size_ml) || 0,
        sold_qty: Math.round(b.soldQty * 100) / 100, consumed_units: Math.round(b.consumed * 100) / 100,
        avg_daily: Math.round(avg * 100) / 100, stock_qty: stock, suggested_qty: Math.max(0, suggested),
        unit_cost: cost, estimated_cost: Math.max(0, suggested) * cost, note
      });
    }
    rows.sort((a, b) => b.suggested_qty - a.suggested_qty || a.buy_name.localeCompare(b.buy_name, 'vi'));
    return res.json({ success: true, data: { cycleDays, salesDays, fromDate: daysRow.f, toDate: daysRow.t, rows } });
  } catch (error) {
    console.error('Beverage plan error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/beverage/config/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    await seedBeverages(pool, branchId);
    const items = (await pool.query(`
      SELECT c.*, COALESCE(s.qty, 0) AS sold_qty FROM beverage_config c
      LEFT JOIN (SELECT dish_id, SUM(quantity_sold) AS qty FROM cukcuk_daily_sales WHERE branch_id = $1 GROUP BY dish_id) s ON s.dish_id = c.item_code
      WHERE c.branch_id = $1 ORDER BY c.menu_type, c.item_name`, [branchId])).rows;
    const buyItems = (await pool.query('SELECT * FROM beverage_buy_items WHERE branch_id = $1 ORDER BY category, buy_name', [branchId])).rows;
    return res.json({ success: true, data: { items, buyItems, modes: MODE_LABELS } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/beverage/config', async (req, res) => {
  const { branchId, itemCode, mode, mlPerSale, buyName } = req.body;
  if (!branchId || !itemCode) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
  if (mode && !MODE_LABELS[mode]) return res.status(400).json({ success: false, message: 'Cách tính không hợp lệ' });
  try {
    const name = buyName === undefined ? undefined : String(buyName || '').trim().substring(0, 255);
    if (name) {
      await pool.query(
        `INSERT INTO beverage_buy_items (branch_id, buy_name, category, buy_unit, size_ml) VALUES ($1,$2,'Khác','chai',0)
         ON CONFLICT (branch_id, buy_name) DO NOTHING`, [branchId, name]);
    }
    await pool.query(`
      UPDATE beverage_config SET
        mode = COALESCE($3, mode),
        ml_per_sale = COALESCE($4, ml_per_sale),
        buy_name = CASE WHEN $5::boolean THEN $6 ELSE buy_name END
      WHERE branch_id = $1 AND item_code = $2`,
      [branchId, itemCode, mode || null, mlPerSale === undefined ? null : Math.max(0, Number(mlPerSale) || 0), name !== undefined, name || null]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Sửa thông tin mặt hàng mua: tồn, đơn giá, quy cách, đơn vị, nhóm (nhận nhiều dòng một lần)
app.put('/api/beverage/buy-items', async (req, res) => {
  const { branchId, items } = req.body;
  if (!branchId || !Array.isArray(items)) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of items) {
      if (!it.buyName) continue;
      await client.query(`
        UPDATE beverage_buy_items SET
          unit_cost = COALESCE($3, unit_cost), stock_qty = COALESCE($4, stock_qty),
          size_ml = COALESCE($5, size_ml), buy_unit = COALESCE($6, buy_unit), category = COALESCE($7, category),
          updated_at = NOW()
        WHERE branch_id = $1 AND buy_name = $2`,
        [branchId, it.buyName,
          it.unitCost === undefined ? null : Math.max(0, Number(it.unitCost) || 0),
          it.stockQty === undefined ? null : Math.max(0, Number(it.stockQty) || 0),
          it.sizeMl === undefined ? null : Math.max(0, Number(it.sizeMl) || 0),
          it.buyUnit ? String(it.buyUnit).substring(0, 30) : null,
          it.category ? String(it.category).substring(0, 60) : null]);
    }
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã lưu' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// ====== TỒN KHO từ báo cáo "Tổng hợp nhập - xuất - tồn kho" của CUKCUK ======
// Dựng lại inventory_tracking (đơn vị mua của app) từ dữ liệu CUKCUK đã ghép với NVL
async function rebuildInventory(db, branchId) {
  await db.query('DELETE FROM inventory_tracking WHERE branch_id = $1', [branchId]);
  await db.query(`
    INSERT INTO inventory_tracking (branch_id, material_id, period_date, opening_stock, purchases_qty, sales_usage_qty, closing_stock, stock_value)
    SELECT d.branch_id, m.material_id, d.stock_date,
           SUM(d.opening * x.f), SUM(d.qty_in * x.f), SUM(d.qty_out * x.f), SUM(d.closing * x.f), SUM(d.closing_amount)
    FROM cukcuk_stock_daily d
    JOIN stock_code_map m ON m.branch_id = d.branch_id AND m.cukcuk_code = d.item_code AND m.material_id IS NOT NULL
    JOIN raw_materials rm ON rm.material_id = m.material_id
    CROSS JOIN LATERAL (SELECT CASE WHEN lower(d.unit_name) IN ('gram', 'gr', 'g', 'ml') AND rm.conversion_rate > 1
                                    THEN 1.0 / rm.conversion_rate ELSE 1.0 END AS f) x
    WHERE d.branch_id = $1
    GROUP BY d.branch_id, m.material_id, d.stock_date
  `, [branchId]);
}

async function branchMaterials(db, branchId) {
  return (await db.query(`
    SELECT DISTINCT rm.material_id AS dish_id, rm.material_name AS dish_name
    FROM raw_materials rm JOIN bill_of_materials b ON b.material_id = rm.material_id AND b.branch_id = $1
    WHERE rm.is_active IS NOT FALSE`, [branchId])).rows;
}

app.post('/api/inventory/import', async (req, res) => {
  const { branchId, rows } = req.body;
  if (!branchId || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dữ liệu tồn kho' });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const clean = rows
    .map(r => ({
      date: String(r.date || ''), code: String(r.code || '').trim(), name: String(r.name || '').trim(),
      category: String(r.category || '').trim(), unit: String(r.unit || '').trim(),
      opening: Number(r.opening) || 0, qtyIn: Number(r.qtyIn) || 0, qtyOut: Number(r.qtyOut) || 0,
      closing: Number(r.closing) || 0, amount: Number(r.amount) || 0
    }))
    .filter(r => dateRe.test(r.date) && r.code);
  if (clean.length === 0) return res.status(400).json({ success: false, message: 'Không có dòng tồn kho hợp lệ' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mats = await branchMaterials(client, branchId);
    const existing = new Map((await client.query('SELECT cukcuk_code, material_id, match_type FROM stock_code_map WHERE branch_id = $1', [branchId])).rows.map(r => [r.cukcuk_code, r]));
    const seen = new Map();
    clean.forEach(r => { seen.set(r.code, r); });
    for (const r of seen.values()) {
      const cur = existing.get(r.code);
      if (cur && cur.match_type === 'MANUAL') {
        await client.query('UPDATE stock_code_map SET cukcuk_name = $3, unit_name = $4, updated_at = NOW() WHERE branch_id = $1 AND cukcuk_code = $2', [branchId, r.code, r.name, r.unit]);
        continue;
      }
      const m = matchDish(r.name, mats, { minContain: 2 });
      await client.query(`
        INSERT INTO stock_code_map (branch_id, cukcuk_code, cukcuk_name, unit_name, material_id, match_type, match_score)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (branch_id, cukcuk_code) DO UPDATE SET cukcuk_name = EXCLUDED.cukcuk_name, unit_name = EXCLUDED.unit_name,
          material_id = EXCLUDED.material_id, match_type = EXCLUDED.match_type, match_score = EXCLUDED.match_score, updated_at = NOW()
      `, [branchId, r.code, r.name, r.unit, m ? m.dishId : null, m ? m.type : 'NONE', m ? m.score : 0]);
    }

    const dates = clean.map(r => r.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    await client.query('DELETE FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3', [branchId, minDate, maxDate]);
    for (const r of clean) {
      await client.query(`
        INSERT INTO cukcuk_stock_daily (branch_id, stock_date, item_code, item_name, category_name, unit_name, opening, qty_in, qty_out, closing, closing_amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (branch_id, stock_date, item_code) DO UPDATE SET item_name = EXCLUDED.item_name, category_name = EXCLUDED.category_name,
          unit_name = EXCLUDED.unit_name, opening = EXCLUDED.opening, qty_in = EXCLUDED.qty_in, qty_out = EXCLUDED.qty_out,
          closing = EXCLUDED.closing, closing_amount = EXCLUDED.closing_amount
      `, [branchId, r.date, r.code, r.name.substring(0, 255), r.category.substring(0, 100), r.unit.substring(0, 30), r.opening, r.qtyIn, r.qtyOut, r.closing, r.amount]);
    }
    await rebuildInventory(client, branchId);
    await client.query(
      "INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported) VALUES ($1, 'STOCK_REPORT', 'SUCCESS', $2)", [branchId, clean.length]);
    await client.query('COMMIT');

    const stat = await pool.query(`
      SELECT COUNT(*) AS total_codes, COUNT(*) FILTER (WHERE material_id IS NOT NULL) AS matched_codes
      FROM stock_code_map WHERE branch_id = $1`, [branchId]);
    return res.json({ success: true, message: 'Đã nhập tồn kho CUKCUK', data: { fromDate: minDate, toDate: maxDate, rows: clean.length, ...stat.rows[0] } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Inventory import error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Báo cáo tồn kho theo khoảng ngày: tồn đầu kỳ (ngày đầu), đã mua/xuất (cộng dồn), tồn cuối (ngày cuối)
app.get('/api/stock/report/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const dates = (await pool.query('SELECT DISTINCT stock_date FROM cukcuk_stock_daily WHERE branch_id = $1 ORDER BY stock_date', [branchId])).rows.map(r => r.stock_date);
    if (dates.length === 0) return res.json({ success: true, data: { dates: [], items: [], materials: [] } });
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const from = dateRe.test(req.query.from || '') ? req.query.from : iso(dates[0]);
    const to = dateRe.test(req.query.to || '') ? req.query.to : iso(dates[dates.length - 1]);
    const items = (await pool.query(`
      WITH r AS (SELECT * FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3),
      firsts AS (SELECT DISTINCT ON (item_code) item_code, opening FROM r ORDER BY item_code, stock_date ASC),
      lasts AS (SELECT DISTINCT ON (item_code) item_code, item_name, category_name, unit_name, closing, closing_amount FROM r ORDER BY item_code, stock_date DESC),
      sums AS (SELECT item_code, SUM(qty_in) AS qty_in, SUM(qty_out) AS qty_out FROM r GROUP BY item_code)
      SELECT l.item_code AS code, l.item_name AS name, l.category_name AS category, l.unit_name AS unit,
             f.opening, s.qty_in, s.qty_out, l.closing, l.closing_amount AS amount,
             m.material_id, m.match_type, rm.material_name
      FROM lasts l JOIN firsts f USING (item_code) JOIN sums s USING (item_code)
      LEFT JOIN stock_code_map m ON m.branch_id = $1 AND m.cukcuk_code = l.item_code
      LEFT JOIN raw_materials rm ON rm.material_id = m.material_id
      ORDER BY l.category_name, l.item_name`, [branchId, from, to])).rows;
    const mats = await branchMaterials(pool, branchId);
    const result = items.map(it => {
      if (it.material_id) return it;
      const s = suggest(it.name, mats, 1, { minContain: 2 })[0];
      return { ...it, suggestion: s && s.score >= 0.5 ? { material_id: s.dish_id, material_name: s.dish_name, score: Math.round(s.score * 100) / 100 } : null };
    });
    return res.json({
      success: true,
      data: { dates: dates.map(iso), from, to, items: result, materials: mats.map(m => ({ material_id: m.dish_id, material_name: m.dish_name })) }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Ghép tay mã NVL CUKCUK với NVL trong app (materialId = null để bỏ ghép)
app.post('/api/stock/map', async (req, res) => {
  const { branchId, cukcukCode, materialId } = req.body;
  if (!branchId || !cukcukCode) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      "UPDATE stock_code_map SET material_id = $3, match_type = 'MANUAL', match_score = 1, updated_at = NOW() WHERE branch_id = $1 AND cukcuk_code = $2",
      [branchId, cukcukCode, materialId || null]);
    if (r.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Không tìm thấy mã CUKCUK' }); }
    await rebuildInventory(client, branchId);
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã lưu ghép NVL' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// ====== NHÀ CUNG CẤP + lịch sử mua theo NCC và NVL (báo cáo "Mua hàng chi tiết theo NCC và NVL") ======
async function ensureStockMap(db, branchId, items) {
  const mats = await branchMaterials(db, branchId);
  const existing = new Map((await db.query('SELECT cukcuk_code, material_id, match_type FROM stock_code_map WHERE branch_id = $1', [branchId])).rows.map(r => [r.cukcuk_code, r]));
  for (const it of items) {
    const cur = existing.get(it.code);
    if (cur && cur.match_type === 'MANUAL') continue;
    const m = matchDish(it.name, mats, { minContain: 2 });
    await db.query(`
      INSERT INTO stock_code_map (branch_id, cukcuk_code, cukcuk_name, unit_name, material_id, match_type, match_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (branch_id, cukcuk_code) DO UPDATE SET cukcuk_name = EXCLUDED.cukcuk_name,
        material_id = EXCLUDED.material_id, match_type = EXCLUDED.match_type, match_score = EXCLUDED.match_score, updated_at = NOW()
    `, [branchId, it.code, it.name, it.unit || '', m ? m.dishId : null, m ? m.type : 'NONE', m ? m.score : 0]);
  }
}

app.post('/api/suppliers/import', async (req, res) => {
  const { branchId, suppliers, purchases } = req.body;
  if (!branchId || (!Array.isArray(suppliers) && !Array.isArray(purchases))) {
    return res.status(400).json({ success: false, message: 'Thiếu dữ liệu nhà cung cấp' });
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let supCount = 0;
    if (Array.isArray(suppliers) && suppliers.length) {
      for (const s of suppliers) {
        const code = String(s.code || '').trim();
        if (!code) continue;
        await client.query(`
          INSERT INTO suppliers (branch_id, code, name, phone, address, tax_code, contact, category, inactive, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
          ON CONFLICT (branch_id, code) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, address = EXCLUDED.address,
            tax_code = EXCLUDED.tax_code, contact = EXCLUDED.contact, category = EXCLUDED.category, inactive = EXCLUDED.inactive, updated_at = NOW()
        `, [branchId, code.substring(0, 60), String(s.name || '').substring(0, 255), String(s.phone || '').substring(0, 60),
          String(s.address || '').substring(0, 500), String(s.tax || '').substring(0, 60), String(s.contact || '').substring(0, 255),
          String(s.category || '').substring(0, 120), !!s.inactive]);
        supCount++;
      }
    }
    let purCount = 0;
    if (Array.isArray(purchases) && purchases.length) {
      const clean = purchases
        .map(p => ({
          detailId: String(p.detailId || '').trim(), refNo: String(p.refNo || ''), date: String(p.date || ''),
          supplierCode: String(p.supplierCode || '').trim(), supplierName: String(p.supplierName || ''),
          itemCode: String(p.itemCode || '').trim(), itemName: String(p.itemName || ''), unit: String(p.unit || ''),
          qty: Number(p.qty) || 0, price: Number(p.price) || 0, amount: Number(p.amount) || 0,
          vatRate: Number(p.vatRate) || 0, vatAmount: Number(p.vatAmount) || 0, total: p.total === undefined || p.total === null ? (Number(p.amount) || 0) : Number(p.total) || 0
        }))
        .filter(p => p.detailId && dateRe.test(p.date) && p.itemCode);
      if (clean.length) {
        const ds = clean.map(p => p.date).sort();
        await client.query('DELETE FROM supplier_purchases WHERE branch_id = $1 AND purchase_date BETWEEN $2 AND $3', [branchId, ds[0], ds[ds.length - 1]]);
        for (const p of clean) {
          await client.query(`
            INSERT INTO supplier_purchases (branch_id, detail_id, ref_no, purchase_date, supplier_code, supplier_name, item_code, item_name, unit_name, qty, unit_price, amount, vat_rate, vat_amount, total_amount)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (branch_id, detail_id) DO UPDATE SET purchase_date = EXCLUDED.purchase_date, supplier_code = EXCLUDED.supplier_code,
              supplier_name = EXCLUDED.supplier_name, qty = EXCLUDED.qty, unit_price = EXCLUDED.unit_price, amount = EXCLUDED.amount,
              vat_rate = EXCLUDED.vat_rate, vat_amount = EXCLUDED.vat_amount, total_amount = EXCLUDED.total_amount
          `, [branchId, p.detailId.substring(0, 80), p.refNo.substring(0, 60), p.date, p.supplierCode.substring(0, 60), p.supplierName.substring(0, 255),
            p.itemCode.substring(0, 100), p.itemName.substring(0, 255), p.unit.substring(0, 30), p.qty, p.price, p.amount, p.vatRate, p.vatAmount, p.total]);
          purCount++;
        }
        const uniq = new Map();
        clean.forEach(p => uniq.set(p.itemCode, { code: p.itemCode, name: p.itemName, unit: p.unit }));
        await ensureStockMap(client, branchId, Array.from(uniq.values()));
      }
    }
    await client.query(
      "INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported) VALUES ($1, 'SUPPLIERS', 'SUCCESS', $2)", [branchId, supCount + purCount]);
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã nhập nhà cung cấp và lịch sử mua', data: { suppliers: supCount, purchases: purCount } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Suppliers import error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// ===== Công nợ nhà cung cấp: mua hàng + chứng từ chi quỹ tiền mặt / tiền gửi =====
app.post('/api/payables/import', async (req, res) => {
  const { branchId, payments, debts, debtFrom, debtTo } = req.body;
  if (!branchId) return res.status(400).json({ success: false, message: 'Thiếu chi nhánh' });
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let payCount = 0;
    for (const p of Array.isArray(payments) ? payments : []) {
      const refId = String(p.refId || '').trim();
      if (!refId || !dateRe.test(String(p.date || ''))) continue;
      await client.query(`
        INSERT INTO supplier_payments (branch_id, ref_id, ref_no, pay_date, source, type_name, amount, reason, budget_item, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (branch_id, ref_id) DO UPDATE SET ref_no = EXCLUDED.ref_no, pay_date = EXCLUDED.pay_date, source = EXCLUDED.source,
          type_name = EXCLUDED.type_name, amount = EXCLUDED.amount, reason = EXCLUDED.reason, budget_item = EXCLUDED.budget_item, updated_at = NOW()
      `, [branchId, refId.substring(0, 80), String(p.refNo || '').substring(0, 60), p.date, p.source === 'BANK' ? 'BANK' : 'CASH',
        String(p.typeName || '').substring(0, 80), Number(p.amount) || 0, String(p.reason || ''), String(p.budgetItem || '')]);
      payCount++;
    }
    let debtCount = 0;
    if (Array.isArray(debts) && debts.length) {
      await client.query('DELETE FROM supplier_debt_snapshot WHERE branch_id = $1', [branchId]);
      for (const d of debts) {
        const code = String(d.code || '').trim();
        if (!code) continue;
        await client.query(`
          INSERT INTO supplier_debt_snapshot (branch_id, vendor_code, vendor_name, first_amount, increase_amount, decrease_amount, last_amount, from_date, to_date)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [branchId, code.substring(0, 60), String(d.name || '').substring(0, 255), Number(d.first) || 0, Number(d.increase) || 0,
          Number(d.decrease) || 0, Number(d.last) || 0, dateRe.test(String(debtFrom)) ? debtFrom : null, dateRe.test(String(debtTo)) ? debtTo : null]);
        debtCount++;
      }
    }
    await client.query("INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported) VALUES ($1, 'PAYABLES', 'SUCCESS', $2)", [branchId, payCount + debtCount]);
    await client.query('COMMIT');
    return res.json({ success: true, data: { payments: payCount, debts: debtCount } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Payables import error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Gán thủ công một chứng từ chi cho nhà cung cấp (supplierCode rỗng = tự nhận diện; ignore = không phải trả NCC)
app.post('/api/payables/assign', async (req, res) => {
  const { branchId, refId, supplierCode, ignore } = req.body;
  if (!branchId || !refId) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });
  try {
    await pool.query('UPDATE supplier_payments SET manual_supplier_code = $3, ignored = $4 WHERE branch_id = $1 AND ref_id = $2',
      [branchId, refId, supplierCode || null, !!ignore]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

const supplierKey = (s) => normalizeString(String(s || '').replace(/[-–]\s*[\d .]{8,}\s*$/, '')
  .replace(/c[oô]ng ty|tnhh|c[oô] ph[aầ]n|hkd|h[oộ] kinh doanh|\bcty\b|\btm\b|\bdv\b/gi, ' ')).replace(/\s+/g, ' ').trim();

// Nợ đầu kỳ do người dùng nhập (theo tên NCC), tính đến cuối ngày as_of
app.post('/api/payables/opening', async (req, res) => {
  const { branchId, asOf, rows } = req.body;
  if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || '')) || !Array.isArray(rows)) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh, ngày chốt hoặc danh sách nợ đầu kỳ' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM supplier_opening_debt WHERE branch_id = $1', [branchId]);
    let n = 0;
    for (const r of rows) {
      const name = String(r.name || '').trim();
      const key = supplierKey(name) || normalizeString(name);
      const amount = Number(r.amount);
      if (!name || !key || !Number.isFinite(amount) || amount === 0) continue;
      await client.query(`INSERT INTO supplier_opening_debt (branch_id, name_key, name, amount, as_of) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (branch_id, name_key) DO UPDATE SET amount = supplier_opening_debt.amount + EXCLUDED.amount`,
      [branchId, key.substring(0, 255), name.substring(0, 255), amount, asOf]);
      n++;
    }
    await client.query('COMMIT');
    return res.json({ success: true, data: { rows: n } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/payables/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = dateRe.test(String(req.query.from || '')) ? req.query.from : '1900-01-01';
  const to = dateRe.test(String(req.query.to || '')) ? req.query.to : '2999-12-31';
  try {
    const sups = (await pool.query('SELECT code, name FROM suppliers WHERE branch_id = $1', [branchId])).rows;
    const opens = (await pool.query("SELECT name_key, name, amount, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM supplier_opening_debt WHERE branch_id = $1", [branchId])).rows;
    const asOf = opens.length ? String(opens[0].as_of).slice(0, 10) : null;
    // Chỉ tính phát sinh sau ngày chốt nợ đầu kỳ
    const floor = asOf || '1900-01-01';
    const purchases = (await pool.query(`SELECT supplier_code,
        SUM(CASE WHEN purchase_date >= $2 THEN amount ELSE 0 END) AS goods,
        SUM(CASE WHEN purchase_date >= $2 THEN vat_amount ELSE 0 END) AS vat,
        SUM(CASE WHEN purchase_date >= $2 THEN (CASE WHEN total_amount > 0 THEN total_amount ELSE amount END) ELSE 0 END) AS total,
        SUM(CASE WHEN purchase_date < $2 THEN (CASE WHEN total_amount > 0 THEN total_amount ELSE amount END) ELSE 0 END) AS before_total,
        COUNT(DISTINCT CASE WHEN purchase_date >= $2 THEN ref_no END) AS times
      FROM supplier_purchases WHERE branch_id = $1 AND purchase_date > $4 AND purchase_date <= $3 GROUP BY supplier_code`,
    [branchId, from, to, floor])).rows;
    const snap = (await pool.query('SELECT * FROM supplier_debt_snapshot WHERE branch_id = $1', [branchId])).rows;
    const pays = (await pool.query(`SELECT ref_id, ref_no, to_char(pay_date, 'YYYY-MM-DD') AS pay_date, source, type_name, amount, reason, budget_item, manual_supplier_code, ignored
      FROM supplier_payments WHERE branch_id = $1 AND pay_date > $3 AND pay_date <= $2 ORDER BY pay_date DESC, ref_no DESC`, [branchId, to, floor])).rows;

    const keys = sups.map((s) => ({ code: s.code, key: supplierKey(s.name) })).filter((k) => k.key.length >= 4).sort((a, b) => b.key.length - a.key.length);
    const supByCode = new Map(sups.map((s) => [s.code, s.name]));
    const allPayments = pays.map((p) => {
      let code = null, how = '';
      if (p.ignored) how = 'ignored';
      else if (p.manual_supplier_code) { code = p.manual_supplier_code; how = 'manual'; }
      else {
        const text = normalizeString(`${p.reason || ''} ${p.budget_item || ''}`);
        const hit = keys.find((k) => text.includes(k.key));
        if (hit) { code = hit.code; how = 'auto'; }
      }
      return { ref_id: p.ref_id, ref_no: p.ref_no, date: String(p.pay_date).slice(0, 10), source: p.source, type_name: p.type_name,
        amount: Number(p.amount) || 0, reason: p.reason, budget_item: p.budget_item, supplier_code: code, supplier_name: code ? (supByCode.get(code) || code) : '', how };
    });
    const payments = allPayments.filter((p) => p.date >= from);

    const rows = new Map();
    const row = (code, name) => {
      if (!rows.has(code)) rows.set(code, { code, name: name || supByCode.get(code) || code, opening_debt: 0, goods: 0, vat: 0, purchases: 0, purchase_count: 0, paid: 0, before_purchases: 0, before_paid: 0 });
      return rows.get(code);
    };
    purchases.forEach((p) => { if (p.supplier_code) { const r = row(p.supplier_code); r.goods = Number(p.goods) || 0; r.vat = Number(p.vat) || 0; r.purchases = Number(p.total) || 0; r.before_purchases = Number(p.before_total) || 0; r.purchase_count = Number(p.times) || 0; } });
    allPayments.forEach((p) => { if (p.supplier_code) { const r = row(p.supplier_code); if (p.date >= from) r.paid += p.amount; else r.before_paid += p.amount; } });

    // Ghép nợ đầu kỳ vào NCC theo tên (chứa nhau); không ghép được thì giữ dòng riêng
    const unmatchedOpen = [];
    opens.forEach((o) => {
      const hit = keys.find((k) => k.key.includes(o.name_key) || o.name_key.includes(k.key));
      if (hit && o.name_key.length >= 4) row(hit.code).opening_debt += Number(o.amount) || 0;
      else unmatchedOpen.push(o);
    });
    unmatchedOpen.forEach((o) => { row('OPEN:' + o.name_key, o.name).opening_debt += Number(o.amount) || 0; });

    const list = Array.from(rows.values()).map((r) => {
      const open_at_from = r.opening_debt + r.before_purchases - r.before_paid;
      return { code: r.code, name: r.name, opening: open_at_from, goods: r.goods, vat: r.vat, purchases: r.purchases, purchase_count: r.purchase_count, paid: r.paid, balance: open_at_from + r.purchases - r.paid };
    }).sort((a, b) => b.balance - a.balance);
    return res.json({ success: true, data: {
      suppliers: list, payments, openingAsOf: asOf,
      supplierOptions: sups.map((s) => ({ code: s.code, name: s.name })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'))
    } });
  } catch (error) {
    console.error('Payables error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Danh sách nhà cung cấp kèm số NVL đã mua và lần mua gần nhất
app.get('/api/suppliers/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const rows = (await pool.query(`
      SELECT s.code, s.name, s.phone, s.address, s.tax_code, s.contact, s.category, s.inactive,
             COALESCE(p.items, 0) AS item_count, COALESCE(p.times, 0) AS purchase_count, p.last_date, COALESCE(p.total, 0) AS total_amount
      FROM suppliers s
      LEFT JOIN (SELECT supplier_code, COUNT(DISTINCT item_code) AS items, COUNT(DISTINCT ref_no) AS times,
                        MAX(purchase_date) AS last_date, SUM(amount) AS total
                 FROM supplier_purchases WHERE branch_id = $1 GROUP BY supplier_code) p ON p.supplier_code = s.code
      WHERE s.branch_id = $1
      ORDER BY (p.last_date IS NULL), s.inactive, s.name`, [branchId])).rows;
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Mỗi NVL đã mua từ những nhà cung cấp nào (kèm đơn giá gần nhất quy về đơn vị mua của app)
app.get('/api/suppliers/material-map/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const rows = (await pool.query(`
      SELECT DISTINCT ON (m.material_id, p.supplier_code)
             m.material_id, p.supplier_code, p.supplier_name, p.purchase_date AS last_date,
             CASE WHEN lower(p.unit_name) IN ('gram', 'gr', 'g', 'ml') AND rm.conversion_rate > 1
                  THEN p.unit_price * rm.conversion_rate ELSE p.unit_price END AS price_app,
             (SELECT COUNT(*) FROM supplier_purchases q WHERE q.branch_id = p.branch_id AND q.supplier_code = p.supplier_code AND q.item_code = p.item_code) AS times
      FROM supplier_purchases p
      JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code AND m.material_id IS NOT NULL
      JOIN raw_materials rm ON rm.material_id = m.material_id
      WHERE p.branch_id = $1
      ORDER BY m.material_id, p.supplier_code, p.purchase_date DESC`, [branchId])).rows;
    const map = {};
    for (const r of rows) {
      (map[r.material_id] = map[r.material_id] || []).push({
        supplier_code: r.supplier_code, supplier_name: r.supplier_name, last_date: r.last_date,
        price: Math.round(Number(r.price_app) || 0), times: Number(r.times) || 0
      });
    }
    Object.values(map).forEach(list => list.sort((a, b) => new Date(b.last_date) - new Date(a.last_date)));
    return res.json({ success: true, data: map });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ====== ĐƠN MUA HÀNG: đánh số 001/MM/YYYY theo chi nhánh, về 001 khi sang tháng mới ======
app.post('/api/purchase-orders', async (req, res) => {
  const { branchId, buyerCompany, supplierCode, supplierName, supplierPhone, supplierAddress, deliveryDate, note, cycleLabel, showPrice, lines } = req.body;
  if (!branchId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dòng hàng' });
  }
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [branchId + '|purchase-order']);
    const ym = (await client.query(`
      SELECT EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS y,
             EXTRACT(MONTH FROM (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS m`)).rows[0];
    const next = (await client.query(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM purchase_orders WHERE branch_id = $1 AND order_year = $2 AND order_month = $3',
      [branchId, ym.y, ym.m])).rows[0].n;
    const orderNo = String(next).padStart(3, '0') + '/' + String(ym.m).padStart(2, '0') + '/' + ym.y;
    const payload = { buyerCompany, supplierCode, supplierName, supplierPhone, supplierAddress, deliveryDate, note, cycleLabel, showPrice, lines };
    const ins = await client.query(`
      INSERT INTO purchase_orders (branch_id, order_year, order_month, seq, order_no, buyer_company, supplier_code, supplier_name, total_amount, line_count, payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, created_at`,
      [branchId, ym.y, ym.m, next, orderNo, String(buyerCompany || '').substring(0, 255), String(supplierCode || '').substring(0, 60),
        String(supplierName || '').substring(0, 255), Math.round(total), lines.length, JSON.stringify(payload)]);
    await client.query('COMMIT');
    return res.json({ success: true, data: { id: ins.rows[0].id, orderNo, createdAt: ins.rows[0].created_at } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create purchase order error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/purchase-orders/:branchId', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, order_no, created_at, buyer_company, supplier_name, total_amount, line_count, payload->>'cycleLabel' AS cycle_label
      FROM purchase_orders WHERE branch_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 300`, [req.params.branchId]);
    return res.json({ success: true, data: r.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/purchase-orders/:branchId/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT order_no, payload FROM purchase_orders WHERE branch_id = $1 AND id = $2 AND deleted_at IS NULL', [req.params.branchId, Number(req.params.id) || 0]);
    if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    return res.json({ success: true, data: r.rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// ====== SỔ MUA HÀNG (từ dữ liệu mua hàng đồng bộ từ CUKCUK + đơn đặt hàng đã xuất) ======
const SMALL_UNITS_SQL = "lower(p.unit_name) IN ('gram', 'gr', 'g', 'ml')";
const dateOnly = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : fallback);

// --- Đơn vị tính quy đổi theo từng NVL của CUKCUK ---
async function seedUnits(db, branchId) {
  const items = (await db.query(`
    SELECT DISTINCT ON (item_code) item_code, item_name, unit_name FROM (
      SELECT item_code, item_name, unit_name, purchase_date AS d FROM supplier_purchases WHERE branch_id = $1
      UNION ALL
      SELECT item_code, item_name, unit_name, stock_date AS d FROM cukcuk_stock_daily WHERE branch_id = $1
    ) x ORDER BY item_code, d DESC`, [branchId])).rows;
  for (const it of items) {
    const c = defaultConversion(it.item_name, it.unit_name);
    await db.query(`
      INSERT INTO unit_conversions (branch_id, item_code, item_name, base_unit, small_unit, large_unit, ratio, source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (branch_id, item_code) DO UPDATE SET item_name = EXCLUDED.item_name, base_unit = EXCLUDED.base_unit`,
      [branchId, it.item_code, it.item_name, it.unit_name || '', c.small, c.large, c.ratio, c.source]);
  }
}

app.get('/api/units/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    await seedUnits(pool, branchId);
    const rows = (await pool.query(`
      SELECT u.item_code, u.item_name, u.base_unit, u.small_unit, u.large_unit, u.ratio, u.source,
             COALESCE(p.n, 0) AS purchase_count
      FROM unit_conversions u
      LEFT JOIN (SELECT item_code, COUNT(*) AS n FROM supplier_purchases WHERE branch_id = $1 GROUP BY item_code) p ON p.item_code = u.item_code
      WHERE u.branch_id = $1 ORDER BY u.item_name`, [branchId])).rows;
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/units', async (req, res) => {
  const { branchId, itemCode, largeUnit, smallUnit, ratio } = req.body;
  if (!branchId || !itemCode) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
  const r = Number(ratio);
  if (ratio !== undefined && (!Number.isFinite(r) || r <= 0)) return res.status(400).json({ success: false, message: 'Quy đổi phải là số lớn hơn 0' });
  try {
    await pool.query(`
      UPDATE unit_conversions SET
        large_unit = COALESCE($3, large_unit), small_unit = COALESCE($4, small_unit), ratio = COALESCE($5, ratio),
        source = 'MANUAL', updated_at = NOW()
      WHERE branch_id = $1 AND item_code = $2`,
      [branchId, itemCode, largeUnit ? String(largeUnit).substring(0, 30) : null, smallUnit ? String(smallUnit).substring(0, 30) : null, ratio === undefined ? null : r]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/units/reset', async (req, res) => {
  const { branchId, itemCode } = req.body;
  try {
    const u = (await pool.query('SELECT item_name, base_unit FROM unit_conversions WHERE branch_id = $1 AND item_code = $2', [branchId, itemCode])).rows[0];
    if (!u) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    const c = defaultConversion(u.item_name, u.base_unit);
    await pool.query(
      'UPDATE unit_conversions SET small_unit = $3, large_unit = $4, ratio = $5, source = $6, updated_at = NOW() WHERE branch_id = $1 AND item_code = $2',
      [branchId, itemCode, c.small, c.large, c.ratio, c.source]);
    return res.json({ success: true, data: c });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Dòng nhập hàng kèm đơn vị lớn/nhỏ, đơn giá theo từng đơn vị và độ lệch so với đơn giá trung bình của NVL đó
app.get('/api/purchase-books/lines/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const from = dateOnly(req.query.from, '1970-01-01');
  const to = dateOnly(req.query.to, '2999-12-31');
  try {
    await seedUnits(pool, branchId);
    const rows = (await pool.query(`
      WITH base AS (
        SELECT p.*, COALESCE(NULLIF(c.ratio, 0), 1) AS ratio,
               COALESCE(c.large_unit, p.unit_name) AS large_unit, COALESCE(c.small_unit, p.unit_name) AS small_unit
        FROM supplier_purchases p
        LEFT JOIN unit_conversions c ON c.branch_id = p.branch_id AND c.item_code = p.item_code
        WHERE p.branch_id = $1),
      stats AS (
        SELECT item_code, COUNT(*) AS n, SUM(amount) / NULLIF(SUM(qty / ratio), 0) AS avg_large,
               MIN(unit_price * ratio) AS min_large, MAX(unit_price * ratio) AS max_large
        FROM base GROUP BY item_code)
      SELECT b.purchase_date AS date, b.ref_no, b.supplier_code, b.supplier_name, b.item_code, b.item_name,
             b.small_unit, b.large_unit, b.ratio,
             b.qty AS qty_small, b.qty / b.ratio AS qty_large,
             b.unit_price AS price_small, b.unit_price * b.ratio AS price_large, b.amount, COALESCE(b.vat_rate, 0) AS vat_rate, COALESCE(b.vat_amount, 0) AS vat_amount,
             CASE WHEN COALESCE(b.total_amount, 0) > 0 THEN b.total_amount ELSE b.amount END AS total_amount,
             s.n AS history_count, s.avg_large, s.min_large, s.max_large,
             CASE WHEN s.n > 1 AND s.avg_large > 0 THEN (b.unit_price * b.ratio - s.avg_large) / s.avg_large * 100 END AS deviation_pct,
             m.material_id
      FROM base b
      JOIN stats s ON s.item_code = b.item_code
      LEFT JOIN stock_code_map m ON m.branch_id = b.branch_id AND m.cukcuk_code = b.item_code
      WHERE b.purchase_date BETWEEN $2 AND $3
      ORDER BY b.purchase_date DESC, b.supplier_name, b.item_name`, [branchId, from, to])).rows;
    const range = (await pool.query('SELECT MIN(purchase_date) AS min_date, MAX(purchase_date) AS max_date FROM supplier_purchases WHERE branch_id = $1', [branchId])).rows[0];
    return res.json({ success: true, data: { range, rows } });
  } catch (error) {
    console.error('Purchase lines error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Số lượng nhập thực tế theo NVL của app (quy về đơn vị mua của app), có thể lọc nhà cung cấp
async function receivedByMaterial(db, branchId, from, to, supplierCode) {
  const params = [branchId, from, to];
  let supSql = '';
  if (supplierCode) { params.push(supplierCode); supSql = ' AND p.supplier_code = $4'; }
  return (await db.query(`
    SELECT m.material_id, rm.material_name, rm.unit_purchase AS unit,
           SUM(p.qty * CASE WHEN ${SMALL_UNITS_SQL} AND rm.conversion_rate > 1 THEN 1.0 / rm.conversion_rate ELSE 1.0 END) AS qty,
           SUM(p.amount) AS amount
    FROM supplier_purchases p
    JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code AND m.material_id IS NOT NULL
    JOIN raw_materials rm ON rm.material_id = m.material_id
    WHERE p.branch_id = $1 AND p.purchase_date BETWEEN $2 AND $3${supSql}
    GROUP BY m.material_id, rm.material_name, rm.unit_purchase`, params)).rows;
}

// Tổng đặt hàng theo NVL của các đơn lập trong khoảng ngày (giờ Việt Nam), bỏ đơn đã xóa
async function orderedByMaterial(db, branchId, from, to, supplierCode) {
  const params = [branchId, from, to];
  let supSql = '';
  if (supplierCode) { params.push(supplierCode); supSql = ' AND o.supplier_code = $4'; }
  return (await db.query(`
    SELECT l->>'code' AS material_id, MAX(l->>'name') AS name, MAX(l->>'unit') AS unit, SUM((l->>'qty')::numeric) AS qty
    FROM purchase_orders o, jsonb_array_elements(o.payload->'lines') l
    WHERE o.branch_id = $1 AND o.deleted_at IS NULL
      AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2 AND $3${supSql}
    GROUP BY l->>'code'`, params)).rows;
}

// So sánh số lượng thực nhập trong khoảng ngày với tổng đặt hàng trong tháng
app.get('/api/purchase-books/compare/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const to = dateOnly(req.query.to, today);
  const from = dateOnly(req.query.from, to);
  const supplier = String(req.query.supplier || '').trim();
  try {
    const t = new Date(to + 'T00:00:00Z');
    const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const monthEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const orderedMonth = await orderedByMaterial(pool, branchId, monthStart, monthEnd, supplier);
    const orderedRange = await orderedByMaterial(pool, branchId, from, to, supplier);
    const inRange = await receivedByMaterial(pool, branchId, from, to, supplier);
    const cumulative = await receivedByMaterial(pool, branchId, monthStart, to, supplier);
    const rows = new Map();
    const get = (id, name, unit) => {
      if (!rows.has(id)) rows.set(id, { material_id: id, material_name: name || id, unit: unit || '', ordered_range: 0, ordered_month: 0, received_range: 0, received_cum: 0 });
      return rows.get(id);
    };
    orderedMonth.forEach(o => { get(o.material_id, o.name, o.unit).ordered_month = Number(o.qty) || 0; });
    orderedRange.forEach(o => { get(o.material_id, o.name, o.unit).ordered_range = Number(o.qty) || 0; });
    inRange.forEach(o => { get(o.material_id, o.material_name, o.unit).received_range = Number(o.qty) || 0; });
    cumulative.forEach(o => { get(o.material_id, o.material_name, o.unit).received_cum = Number(o.qty) || 0; });
    const out = Array.from(rows.values()).map(r => ({
      ...r,
      remaining: Math.max(0, r.ordered_month - r.received_cum),
      pct: r.ordered_month > 0 ? Math.round((r.received_cum / r.ordered_month) * 1000) / 10 : null,
      status: r.ordered_month === 0 ? 'Nhập ngoài đơn' : r.received_cum === 0 ? 'Chưa nhập' : r.received_cum + 1e-9 >= r.ordered_month * 0.95 ? 'Đã đủ' : 'Nhập một phần'
    })).sort((a, b) => a.material_name.localeCompare(b.material_name, 'vi'));
    return res.json({ success: true, data: { from, to, monthStart, monthEnd, rows: out } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Sổ theo dõi đơn đặt hàng đã xuất, kèm tỷ lệ đã nhận (tính các lần nhập từ ngày lập đơn đến 10 ngày sau)
const RECEIVE_WINDOW_DAYS = 10;
async function orderFulfilment(db, branchId, order) {
  const p = order.payload || {};
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const created = new Date(new Date(order.created_at).getTime() + 7 * 3600 * 1000);
  const from = created.toISOString().slice(0, 10);
  const to = new Date(created.getTime() + RECEIVE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const received = await receivedByMaterial(db, branchId, from, to, order.supplier_code || '');
  const recMap = Object.fromEntries(received.map(r => [r.material_id, Number(r.qty) || 0]));
  let ordered = 0;
  let got = 0;
  const detail = lines.map((l, index) => {
    const q = Number(l.qty) || 0;
    const r = recMap[l.code] || 0;
    ordered += q;
    got += Math.min(q, r);
    return { index, code: l.code, name: l.name, group: l.group, unit: l.unit, ordered: q, price: Number(l.price) || 0, received: Math.round(r * 1000) / 1000, missing: Math.max(0, Math.round((q - r) * 1000) / 1000) };
  });
  const pct = ordered > 0 ? Math.round((got / ordered) * 1000) / 10 : 0;
  return { pct, status: pct === 0 ? 'Chưa nhận' : pct >= 95 ? 'Đã nhận đủ' : 'Nhận một phần', detail, from, to };
}

app.get('/api/purchase-books/orders/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const from = dateOnly(req.query.from, '1970-01-01');
  const to = dateOnly(req.query.to, '2999-12-31');
  try {
    const orders = (await pool.query(`
      SELECT id, order_no, created_at, buyer_company, supplier_code, supplier_name, total_amount, line_count, payload
      FROM purchase_orders
      WHERE branch_id = $1 AND deleted_at IS NULL AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2 AND $3
      ORDER BY created_at DESC LIMIT 300`, [branchId, from, to])).rows;
    const out = [];
    for (const o of orders) {
      const f = await orderFulfilment(pool, branchId, o);
      out.push({
        id: o.id, order_no: o.order_no, created_at: o.created_at, buyer_company: o.buyer_company, supplier_name: o.supplier_name,
        total_amount: o.total_amount, line_count: o.line_count, cycle_label: (o.payload || {}).cycleLabel || '',
        fulfil_pct: f.pct, status: f.status
      });
    }
    return res.json({ success: true, data: { windowDays: RECEIVE_WINDOW_DAYS, orders: out } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/purchase-books/orders/:branchId/:id/detail', async (req, res) => {
  const { branchId, id } = req.params;
  try {
    const o = (await pool.query(
      'SELECT id, order_no, created_at, buyer_company, supplier_code, supplier_name, payload FROM purchase_orders WHERE branch_id = $1 AND id = $2 AND deleted_at IS NULL', [branchId, Number(id) || 0])).rows[0];
    if (!o) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    const f = await orderFulfilment(pool, branchId, o);
    return res.json({ success: true, data: { id: o.id, order_no: o.order_no, supplier_name: o.supplier_name, created_at: o.created_at, ...f, windowDays: RECEIVE_WINDOW_DAYS } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Xóa đơn (ẩn khỏi sổ, số đơn đã cấp không bị cấp lại để tránh trùng khi theo dõi)
app.delete('/api/purchase-orders/:branchId/:id', async (req, res) => {
  try {
    const r = await pool.query('UPDATE purchase_orders SET deleted_at = NOW() WHERE branch_id = $1 AND id = $2 AND deleted_at IS NULL', [req.params.branchId, Number(req.params.id) || 0]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' });
    return res.json({ success: true, message: 'Đã xóa đơn' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Xóa một dòng chi tiết trong đơn; xóa hết dòng thì đơn được xóa luôn
app.delete('/api/purchase-orders/:branchId/:id/lines/:index', async (req, res) => {
  const { branchId } = req.params;
  const id = Number(req.params.id) || 0;
  const idx = Number(req.params.index);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const o = (await client.query('SELECT payload FROM purchase_orders WHERE branch_id = $1 AND id = $2 AND deleted_at IS NULL FOR UPDATE', [branchId, id])).rows[0];
    if (!o) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, message: 'Không tìm thấy đơn' }); }
    const payload = o.payload || {};
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) { await client.query('ROLLBACK'); return res.status(400).json({ success: false, message: 'Dòng không hợp lệ' }); }
    lines.splice(idx, 1);
    if (lines.length === 0) {
      await client.query('UPDATE purchase_orders SET deleted_at = NOW() WHERE branch_id = $1 AND id = $2', [branchId, id]);
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Đơn không còn dòng nào nên đã được xóa', data: { orderDeleted: true } });
    }
    payload.lines = lines;
    const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
    await client.query('UPDATE purchase_orders SET payload = $3, total_amount = $4, line_count = $5 WHERE branch_id = $1 AND id = $2',
      [branchId, id, JSON.stringify(payload), Math.round(total), lines.length]);
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã xóa dòng', data: { orderDeleted: false, lines: lines.length } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 7. API Tạo kế hoạch mua hàng
app.post('/api/purchase-plans/generate', async (req, res) => {
  const { branchId } = req.body;
  if (!branchId) {
    return res.status(400).json({ success: false, message: 'Thiếu Chi nhánh' });
  }

  const client = await pool.connect();
  try {
    const materialsRes = await client.query(`
      SELECT * FROM raw_materials rm
      WHERE rm.is_active IS NOT FALSE AND rm.is_merged IS NOT TRUE
        AND EXISTS (SELECT 1 FROM bill_of_materials b WHERE b.material_id = rm.material_id AND b.branch_id = $1)
    `, [branchId]);
    const materials = materialsRes.rows;
    if (materials.length === 0) {
      return res.status(400).json({ success: false, message: 'Chi nhánh chưa có định lượng (BOM). Hãy tải file định lượng ở mục Đồng Bộ trước.' });
    }

    const SALES_WINDOW_DAYS = 7;
    const salesRes = await client.query(`
      SELECT b.material_id, SUM(b.quantity_per_dish * s.quantity_sold) AS total_demand
      FROM cukcuk_daily_sales s
      JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id AND m.bom_dish_id IS NOT NULL
      JOIN bill_of_materials b ON b.dish_id = m.bom_dish_id AND b.branch_id = s.branch_id
      WHERE s.branch_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '${SALES_WINDOW_DAYS} days'
      GROUP BY b.material_id
    `, [branchId]);
    const daysRes = await client.query(`
      SELECT COUNT(DISTINCT sale_date) AS days FROM cukcuk_daily_sales
      WHERE branch_id = $1 AND sale_date >= CURRENT_DATE - INTERVAL '${SALES_WINDOW_DAYS} days'
    `, [branchId]);
    const salesDays = Math.max(1, Number(daysRes.rows[0].days) || 1);
    const salesDemandMap = {};
    salesRes.rows.forEach(r => { salesDemandMap[r.material_id] = r.total_demand || 0; });

    const inventoryRes = await client.query(`
      SELECT DISTINCT ON (material_id) material_id, closing_stock
      FROM inventory_tracking WHERE branch_id = $1
      ORDER BY material_id, period_date DESC
    `, [branchId]);
    const inventoryMap = {};
    inventoryRes.rows.forEach(r => { inventoryMap[r.material_id] = r.closing_stock || 0; });

    const planDetails = [];
    for (const material of materials) {
      const forecastDays = material.purchase_cycle === 'FRESH_3DAYS' ? 3 : 7;
      const conv = material.conversion_rate > 0 ? material.conversion_rate : 1;
      const leadTime = material.lead_time_days || 1;
      const wasteRate = material.waste_rate || 0;
      const unitCost = material.unit_cost || 0;

      const currentStock = inventoryMap[material.material_id] || 0;
      // Nhu cầu quy đổi từ đơn vị định lượng (gr/ml) sang đơn vị mua (kg/lít), bình quân theo ngày
      const avgDailySales = (salesDemandMap[material.material_id] || 0) / conv / salesDays;
      const safetyStock = PurchasePlanService.calculateSafetyStock(avgDailySales, leadTime);
      const forecastedDemand = PurchasePlanService.calculateForecastedDemand(avgDailySales, forecastDays, wasteRate);
      const reorderPoint = PurchasePlanService.calculateReorderPoint(avgDailySales, leadTime, safetyStock);
      const suggestedQty = Math.max(0, Math.ceil(
        PurchasePlanService.calculatePurchaseQty(currentStock, forecastedDemand, reorderPoint, safetyStock) * 100) / 100);

      planDetails.push({
        material_id: material.material_id,
        material_name: material.material_name,
        category: material.category,
        purchase_cycle: material.purchase_cycle,
        sub_group: material.sub_group || subGroupOf(material.category, material.material_name),
        unit_purchase: material.unit_purchase,
        opening_stock: Math.round(currentStock * 100) / 100,
        avg_daily_sales: Math.round(avgDailySales * 10000) / 10000,
        forecast_days: forecastDays,
        forecasted_demand: Math.round(forecastedDemand * 100) / 100,
        safety_stock: Math.round(safetyStock * 100) / 100,
        reorder_point: Math.round(reorderPoint * 100) / 100,
        suggested_qty: suggestedQty,
        unit_cost: unitCost,
        estimated_cost: Math.round(suggestedQty * unitCost),
        note: ({ PER_PIECE: 'ℹ️ Giá theo cái/con (file ghi theo gr). ', MISSING: '⚠️ Chưa có đơn giá. ' }[material.price_source] || '') +
          PurchasePlanService.generateNote(currentStock, avgDailySales, forecastDays, material.category)
      });
    }

    await client.query('BEGIN');
    const planRes = await client.query(`
      INSERT INTO purchase_plans (branch_id, plan_name, cycle_type, start_date, end_date, status)
      VALUES ($1, $2, 'ALL', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', 'DRAFT')
      RETURNING plan_id
    `, [branchId, `Kế hoạch mua ${new Date().toLocaleDateString('vi-VN')}`]);
    const planId = planRes.rows[0].plan_id;

    for (const d of planDetails) {
      await client.query(`
        INSERT INTO purchase_plan_details
        (plan_id, branch_id, material_id, material_name, category, purchase_cycle, sub_group, unit_purchase,
         opening_stock, avg_daily_sales, forecast_days, forecasted_demand,
         safety_stock, reorder_point, suggested_qty, unit_cost, estimated_cost, note, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'PENDING')
      `, [planId, branchId, d.material_id, d.material_name, d.category, d.purchase_cycle, d.sub_group, d.unit_purchase,
        d.opening_stock, d.avg_daily_sales, d.forecast_days, d.forecasted_demand,
        d.safety_stock, d.reorder_point, d.suggested_qty, d.unit_cost, d.estimated_cost, d.note]);
    }
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: 'Tạo kế hoạch mua hàng thành công!',
      data: {
        plan_id: planId,
        total_items: planDetails.length,
        total_cost: planDetails.reduce((s, d) => s + d.estimated_cost, 0),
        details: planDetails
      }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Purchase plan generation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 7b. API Lưu số lượng thực mua đã chỉnh sửa
app.post('/api/purchase-plans/:planId/adjust', async (req, res) => {
  const { planId } = req.params;
  const adjustments = req.body.adjustments || {};
  const prices = req.body.prices || {};
  if (typeof adjustments !== 'object' || typeof prices !== 'object') {
    return res.status(400).json({ success: false, message: 'Thiếu dữ liệu điều chỉnh' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Đơn giá sửa tay: lưu vào dòng kế hoạch và vào NVL (đánh dấu MANUAL để tải định lượng mới không ghi đè)
    for (const [materialId, price] of Object.entries(prices)) {
      const p = Math.round(parseFloat(price));
      if (!Number.isFinite(p) || p < 0) continue;
      await client.query(`
        UPDATE purchase_plan_details
        SET unit_cost = $1, estimated_cost = COALESCE(adjusted_qty, suggested_qty, 0) * $1, updated_at = NOW()
        WHERE plan_id = $2 AND material_id = $3
      `, [p, planId, materialId]);
      await client.query("UPDATE raw_materials SET unit_cost = $1, price_source = 'MANUAL', updated_at = NOW() WHERE material_id = $2", [p, materialId]);
    }
    for (const [materialId, qty] of Object.entries(adjustments)) {
      const q = parseFloat(qty);
      if (!Number.isFinite(q) || q < 0) continue;
      await client.query(`
        UPDATE purchase_plan_details
        SET adjusted_qty = $1, estimated_cost = $1 * COALESCE(unit_cost, 0), status = 'ADJUSTED', updated_at = NOW()
        WHERE plan_id = $2 AND material_id = $3
      `, [q, planId, materialId]);
    }
    await client.query("UPDATE purchase_plans SET status = 'SAVED' WHERE plan_id = $1", [planId]);
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã lưu kế hoạch mua hàng!' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});


// 8. API Lấy kế hoạch mua hàng
app.get('/api/purchase-plans/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const plansRes = await pool.query(`
      SELECT * FROM purchase_plans
      WHERE branch_id = $1
      ORDER BY created_at DESC LIMIT 10
    `, [branchId]);

    const plans = [];
    for (const plan of plansRes.rows) {
      const detailsRes = await pool.query(`
        SELECT * FROM purchase_plan_details
        WHERE plan_id = $1
        ORDER BY material_name
      `, [plan.plan_id]);

      plans.push({
        ...plan,
        details: detailsRes.rows,
        total_cost: detailsRes.rows.reduce((sum, d) => sum + (d.estimated_cost || 0), 0),
        total_items: detailsRes.rows.length
      });
    }

    return res.json({ success: true, data: plans });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 9. API Lấy tồn kho
app.get('/api/inventory/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (material_id)
        material_id, period_date, opening_stock, purchases_qty,
        sales_usage_qty, waste_loss_qty, closing_stock, stock_value
      FROM inventory_tracking
      WHERE branch_id = $1
      ORDER BY material_id, period_date DESC
    `, [branchId]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 10. API Cập nhật tồn kho
app.post('/api/inventory/record', async (req, res) => {
  const { branchId, materialId, periodDate, openingStock, purchasesQty, salesUsageQty, wasteLossQty, stockValue } = req.body;
  if (!branchId || !materialId) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
  }

  try {
    const closingStock = openingStock + purchasesQty - salesUsageQty - wasteLossQty;
    await pool.query(`
      INSERT INTO inventory_tracking
      (branch_id, material_id, period_date, opening_stock, purchases_qty, sales_usage_qty, waste_loss_qty, closing_stock, stock_value)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (branch_id, material_id, period_date) DO UPDATE SET
        opening_stock = $4, purchases_qty = $5, sales_usage_qty = $6, waste_loss_qty = $7,
        closing_stock = $8, stock_value = $9
    `, [branchId, materialId, periodDate, openingStock, purchasesQty, salesUsageQty, wasteLossQty, closingStock, stockValue || 0]);

    return res.json({ success: true, message: 'Cập nhật tồn kho thành công!' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 11. API Phân loại NVL tự động
app.post('/api/materials/classify', (req, res) => {
  const { materialName } = req.body;
  if (!materialName) {
    return res.status(400).json({ success: false, message: 'Thiếu tên NVL' });
  }

  try {
    const classification = classifyMaterial(materialName);
    return res.json({ success: true, data: classification });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Next.js catch-all (phải nằm cuối cùng)
app.all('*', (req, res) => {
  return handle(req, res);
});

// Start server with async/await
(async () => {
  let client;
  try {
    // Check environment
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable not set. Please set it on Render dashboard.');
    }

    // Test database connection
    console.log('🔄 Testing database connection...');
    console.log(`📍 DATABASE_URL: configured (${process.env.DATABASE_URL.substring(0, 50)}...)`);

    client = await pool.connect();
    const result = await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connected successfully');

    // Initialize database
    console.log('🔄 Initializing database schema...');
    await initializeDatabase();
    console.log('✅ Database schema initialized');

    // Prepare Next.js
    console.log('🔄 Preparing Next.js...');
    await nextApp.prepare();
    console.log('✅ Next.js prepared');

    // Start listening
    app.listen(port, () => {
      console.log(`✅ [Server Running] Port ${port}`);
      console.log(`📊 Fen Izakaya Purchase Planning App`);
      console.log(`🌐 http://localhost:${port}`);
    });
  } catch (err) {
    if (client) client.release();
    console.error('❌ Failed to start server:', err.message);
    console.error('❌ Error details:', JSON.stringify(err, null, 2));
    process.exit(1);
  }
})();

module.exports = app;
