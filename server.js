const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool, types } = require('pg');
types.setTypeParser(1700, (v) => parseFloat(v));
const next = require('next');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { matchDish, suggest } = require('./services/dishMatchService');
const { categorize, subGroupOf, normalizeString } = require('./services/bomService');
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
        branches: ['cukcuk_company_code VARCHAR(100)', 'cukcuk_domain VARCHAR(255)', 'cukcuk_auth_token TEXT',
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
        const missing = await pool.query('SELECT material_id, material_name, category FROM raw_materials WHERE sub_group IS NULL');
        for (const m of missing.rows) {
          await pool.query('UPDATE raw_materials SET sub_group = $2 WHERE material_id = $1', [m.material_id, subGroupOf(m.category, m.material_name)]);
        }
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
  const { adjustments } = req.body;
  if (!adjustments || typeof adjustments !== 'object') {
    return res.status(400).json({ success: false, message: 'Thiếu dữ liệu điều chỉnh' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
