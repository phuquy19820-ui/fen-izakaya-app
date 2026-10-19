const express = require('express');
const cors = require('cors');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Pool, types } = require('pg');
types.setTypeParser(1700, (v) => parseFloat(v));
const next = require('next');
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
require('dotenv').config();

const { matchDish, suggest, similarity } = require('./services/dishMatchService');
const { categorize, subGroupOf, normalizeString } = require('./services/bomService');
const { beverageDefaults, MODE_LABELS } = require('./services/beverageService');
const { defaultConversion } = require('./services/unitService');
const { parseAndSaveBOM } = require('./services/bomService');
const { classifyMaterial } = require('./services/materialClassificationService');
const PurchasePlanService = require('./services/purchasePlanService');
const { buildReport } = require('./services/revenueService');

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
        branches: ['buyer_company VARCHAR(255)', 'cukcuk_company_code VARCHAR(100)', 'cukcuk_domain VARCHAR(255)', 'cukcuk_branch_name VARCHAR(255)', 'cukcuk_auth_token TEXT',
          'cukcuk_token_expires_at TIMESTAMP', 'is_active BOOLEAN DEFAULT TRUE',
          'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
        raw_materials: ['branch_id VARCHAR(50)', 'category VARCHAR(50)', 'category_group VARCHAR(50)',
          'unit_cost NUMERIC(14,2) DEFAULT 0', 'min_stock NUMERIC(12,2) DEFAULT 0', 'max_stock NUMERIC(12,2) DEFAULT 0',
          'lead_time_days INT DEFAULT 1', 'waste_rate NUMERIC(5,2) DEFAULT 0', 'shelf_life_days INT DEFAULT 30',
          'safety_stock NUMERIC(12,2) DEFAULT 0', 'price_source VARCHAR(20)', 'price_updated_at TIMESTAMP', 'sub_group VARCHAR(60)', 'is_merged BOOLEAN DEFAULT FALSE', 'is_active BOOLEAN DEFAULT TRUE',
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
      migrations.push('ALTER TABLE beverage_buy_items ADD COLUMN IF NOT EXISTS cost_updated_at TIMESTAMP');
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
      migrations.push("ALTER TABLE cukcuk_stock_daily ADD COLUMN IF NOT EXISTS stock_id VARCHAR(60) NOT NULL DEFAULT ''");
      migrations.push("ALTER TABLE cukcuk_stock_daily ADD COLUMN IF NOT EXISTS stock_name VARCHAR(120) DEFAULT ''");
      migrations.push('ALTER TABLE cukcuk_stock_daily ADD COLUMN IF NOT EXISTS opening_amount NUMERIC(18,2)');
      migrations.push('ALTER TABLE cukcuk_stock_daily ADD COLUMN IF NOT EXISTS in_amount NUMERIC(18,2)');
      migrations.push(`DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cukcuk_stock_daily'::regclass AND contype = 'p' AND pg_get_constraintdef(oid) LIKE '%stock_id%') THEN
          ALTER TABLE cukcuk_stock_daily DROP CONSTRAINT IF EXISTS cukcuk_stock_daily_pkey;
          ALTER TABLE cukcuk_stock_daily ADD PRIMARY KEY (branch_id, stock_date, item_code, stock_id);
        END IF;
      END $$`);
      migrations.push(`CREATE TABLE IF NOT EXISTS cukcuk_invoices (
        branch_id VARCHAR(50) NOT NULL, ref_no VARCHAR(60) NOT NULL, inv_date DATE NOT NULL, time_in VARCHAR(20), area VARCHAR(100),
        shift VARCHAR(60), customer_name VARCHAR(255), people INT DEFAULT 0, amount NUMERIC(18,2) DEFAULT 0, discount NUMERIC(18,2) DEFAULT 0,
        service_fee NUMERIC(18,2) DEFAULT 0, tax_reduction NUMERIC(18,2) DEFAULT 0, vat NUMERIC(18,2) DEFAULT 0,
        PRIMARY KEY (branch_id, ref_no)
      )`);
      migrations.push('CREATE INDEX IF NOT EXISTS idx_cukcuk_invoices_date ON cukcuk_invoices (branch_id, inv_date)');
      migrations.push(`CREATE TABLE IF NOT EXISTS cukcuk_invoice_items (
        branch_id VARCHAR(50) NOT NULL, ref_no VARCHAR(60) NOT NULL, line_no INT NOT NULL, item_code VARCHAR(100), item_name VARCHAR(255),
        kind VARCHAR(60), category VARCHAR(120), qty NUMERIC(18,4) DEFAULT 0, amount NUMERIC(18,2) DEFAULT 0, discount NUMERIC(18,2) DEFAULT 0,
        PRIMARY KEY (branch_id, ref_no, line_no)
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
      migrations.push('ALTER TABLE supplier_opening_debt ADD COLUMN IF NOT EXISTS supplier_code VARCHAR(60)');
      migrations.push("ALTER TABLE supplier_opening_debt ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'IMPORT'");
      migrations.push(`CREATE TABLE IF NOT EXISTS supplier_debt_daily (
        branch_id VARCHAR(50) NOT NULL, debt_date DATE NOT NULL, vendor_code VARCHAR(60) NOT NULL, vendor_name VARCHAR(255),
        increase NUMERIC(18,2) DEFAULT 0, decrease NUMERIC(18,2) DEFAULT 0, PRIMARY KEY (branch_id, debt_date, vendor_code)
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

// ====== SAO LƯU / KHÔI PHỤC TOÀN BỘ DỮ LIỆU ======
function syncRange(body, minDate, maxDate) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const f = re.test(String(body.rangeFrom || '')) ? body.rangeFrom : minDate;
  const t = re.test(String(body.rangeTo || '')) ? body.rangeTo : maxDate;
  return [f < minDate ? f : minDate, t > maxDate ? t : maxDate];
}

async function listPublicTables(db) {
  return (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"))
    .rows.map((r) => r.table_name).filter((t) => /^[A-Za-z0-9_]+$/.test(t));
}

app.get('/api/backup/export', async (req, res) => {
  try {
    const tables = await listPublicTables(pool);
    const out = { app: 'fen-izakaya', version: 1, createdAt: new Date().toISOString(), tables: {}, counts: {} };
    let total = 0;
    for (const t of tables) {
      const r = await pool.query(`SELECT COALESCE(json_agg(x), '[]'::json) AS j FROM "${t}" x`);
      out.tables[t] = r.rows[0].j;
      out.counts[t] = out.tables[t].length;
      total += out.counts[t];
    }
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify(out), 'utf8'));
    res.set({ 'Content-Type': 'application/gzip', 'X-Backup-Rows': String(total), 'X-Backup-Tables': String(tables.length), 'Access-Control-Expose-Headers': 'X-Backup-Rows, X-Backup-Tables' });
    return res.send(buf);
  } catch (error) {
    console.error('Backup export error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/backup/import', express.raw({ type: '*/*', limit: '300mb' }), async (req, res) => {
  let data;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    let text;
    try { text = zlib.gunzipSync(raw).toString('utf8'); } catch (e) { text = raw.toString('utf8'); }
    data = JSON.parse(text);
  } catch (e) {
    return res.status(400).json({ success: false, message: 'File sao lưu không đọc được (không đúng định dạng)' });
  }
  if (!data || data.app !== 'fen-izakaya' || !data.tables || typeof data.tables !== 'object') {
    return res.status(400).json({ success: false, message: 'Đây không phải file sao lưu của app Fen Izakaya' });
  }
  const client = await pool.connect();
  try {
    const existing = new Set(await listPublicTables(client));
    const names = Object.keys(data.tables).filter((t) => existing.has(t) && Array.isArray(data.tables[t]));
    if (names.length === 0) return res.status(400).json({ success: false, message: 'File sao lưu không có bảng dữ liệu nào hợp lệ' });
    // sắp xếp theo khóa ngoại: bảng cha trước bảng con
    const fks = (await client.query(`SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE k.contype = 'f' AND n.nspname = 'public'`)).rows;
    const ordered = [];
    const left = new Set(names);
    while (left.size) {
      const ready = Array.from(left).filter((t) => !fks.some((f) => f.child === t && f.parent !== t && left.has(f.parent)));
      const pick = ready.length ? ready : Array.from(left);
      pick.forEach((t) => { ordered.push(t); left.delete(t); });
    }
    await client.query('BEGIN');
    await client.query(`TRUNCATE ${names.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
    const counts = {};
    for (const t of ordered) {
      const rows = data.tables[t];
      counts[t] = rows.length;
      for (let i = 0; i < rows.length; i += 1000) {
        await client.query(`INSERT INTO "${t}" SELECT * FROM jsonb_populate_recordset(null::"${t}", $1::jsonb)`, [JSON.stringify(rows.slice(i, i + 1000))]);
      }
    }
    // đặt lại bộ đếm tự tăng (id) sau khi nạp
    const seqCols = (await client.query(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_default LIKE 'nextval%'`)).rows.filter((r) => names.includes(r.table_name));
    for (const c of seqCols) {
      await client.query(`SELECT setval(pg_get_serial_sequence('"${c.table_name}"', '${c.column_name}'), COALESCE((SELECT MAX("${c.column_name}") FROM "${c.table_name}"), 0) + 1, false)`);
    }
    if (req.query.dryRun) {
      // chạy thử: kiểm tra số dòng từng bảng rồi hủy, không thay đổi dữ liệu thật
      const bad = [];
      for (const t of ordered) {
        const c = Number((await client.query(`SELECT COUNT(*) AS n FROM "${t}"`)).rows[0].n);
        if (c !== counts[t]) bad.push(`${t}: ${c}/${counts[t]}`);
      }
      await client.query('ROLLBACK');
      return res.json({ success: bad.length === 0, message: bad.length ? 'Lệch số dòng: ' + bad.join('; ') : 'Chạy thử khôi phục thành công (đã hủy, không đổi dữ liệu)', data: { tables: names.length, rows: Object.values(counts).reduce((x, y) => x + y, 0) } });
    }
    await client.query('COMMIT');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return res.json({ success: true, message: 'Đã khôi phục dữ liệu', data: { tables: names.length, rows: total, createdAt: data.createdAt } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Backup import error:', error);
    return res.status(500).json({ success: false, message: 'Khôi phục thất bại, dữ liệu hiện tại được giữ nguyên: ' + error.message });
  } finally {
    client.release();
  }
});

// ====== BÁO CÁO DOANH THU THEO HÓA ĐƠN (nhóm khách, khung giờ, khu vực, so sánh tháng...) ======
app.post('/api/revenue/import', async (req, res) => {
  const { branchId, invoices, items } = req.body;
  if (!branchId || !Array.isArray(invoices)) return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dữ liệu hóa đơn' });
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const inv0 = invoices.filter((r) => r && r.refNo && dateRe.test(String(r.date || '')));
  if (inv0.length === 0) return res.json({ success: true, message: 'Không có hóa đơn trong kỳ (bỏ qua)', data: { invoices: 0, items: 0 } });
  // Cùng số hóa đơn nhưng khác ngày (số bị dùng lại) vẫn là hóa đơn khác nhau: bản đầu giữ nguyên số, các bản sau thêm hậu tố ngày
  const firstDate = new Map();
  const inv = inv0.map((r) => {
    const ref = String(r.refNo);
    if (!firstDate.has(ref)) { firstDate.set(ref, r.date); return { ...r, refNo: ref }; }
    return { ...r, refNo: firstDate.get(ref) === r.date ? ref : `${ref}~${r.date}` };
  });
  const refSet = new Set(inv.map((r) => String(r.refNo)));
  const keyOf = (r) => { const ref = String(r.refNo); const alt = `${ref}~${r.date}`; return r.date && refSet.has(alt) ? alt : ref; };
  const its = (Array.isArray(items) ? items : []).filter((r) => r && refSet.has(String(r.refNo))).map((r) => ({ ...r, refNo: keyOf(r) }));
  const dates = inv.map((r) => r.date).sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const [delFrom, delTo] = syncRange(req.body, dates[0], dates[dates.length - 1]);
    await client.query(`DELETE FROM cukcuk_invoice_items WHERE branch_id = $1 AND ref_no IN
      (SELECT ref_no FROM cukcuk_invoices WHERE branch_id = $1 AND inv_date BETWEEN $2 AND $3)`, [branchId, delFrom, delTo]);
    await client.query('DELETE FROM cukcuk_invoices WHERE branch_id = $1 AND inv_date BETWEEN $2 AND $3', [branchId, delFrom, delTo]);
    const seen = new Set();
    const uniq = inv.filter((r) => (seen.has(r.refNo) ? false : (seen.add(r.refNo), true)));
    const CH = 500;
    for (let i = 0; i < uniq.length; i += CH) {
      const c = uniq.slice(i, i + CH);
      await client.query(`INSERT INTO cukcuk_invoices (branch_id, ref_no, inv_date, time_in, area, shift, customer_name, people, amount, discount, service_fee, tax_reduction, vat)
        SELECT $1, * FROM unnest($2::text[], $3::date[], $4::text[], $5::text[], $6::text[], $7::text[], $8::int[], $9::numeric[], $10::numeric[], $11::numeric[], $12::numeric[], $13::numeric[])
        ON CONFLICT (branch_id, ref_no) DO NOTHING`,
      [branchId, c.map((r) => String(r.refNo).substring(0, 60)), c.map((r) => r.date), c.map((r) => String(r.timeIn || '').substring(0, 20)),
        c.map((r) => String(r.area || '').substring(0, 100)), c.map((r) => String(r.shift || '').substring(0, 60)), c.map((r) => String(r.customer || '').substring(0, 255)),
        c.map((r) => Math.round(Number(r.people) || 0)), c.map((r) => Number(r.amount) || 0), c.map((r) => Number(r.discount) || 0),
        c.map((r) => Number(r.serviceFee) || 0), c.map((r) => Number(r.taxReduction) || 0), c.map((r) => Number(r.vat) || 0)]);
    }
    const lineNo = new Map();
    const rowsI = its.map((r) => { const k = String(r.refNo); const n = (lineNo.get(k) || 0) + 1; lineNo.set(k, n); return { ...r, n }; });
    for (let i = 0; i < rowsI.length; i += CH) {
      const c = rowsI.slice(i, i + CH);
      await client.query(`INSERT INTO cukcuk_invoice_items (branch_id, ref_no, line_no, item_code, item_name, kind, category, qty, amount, discount)
        SELECT $1, * FROM unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[], $9::numeric[], $10::numeric[])
        ON CONFLICT (branch_id, ref_no, line_no) DO NOTHING`,
      [branchId, c.map((r) => String(r.refNo).substring(0, 60)), c.map((r) => r.n), c.map((r) => String(r.code || '').substring(0, 100)),
        c.map((r) => String(r.name || '').substring(0, 255)), c.map((r) => String(r.kind || '').substring(0, 60)), c.map((r) => String(r.category || '').substring(0, 120)),
        c.map((r) => Number(r.qty) || 0), c.map((r) => Number(r.amount) || 0), c.map((r) => Number(r.discount) || 0)]);
    }
    await client.query("INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported) VALUES ($1, 'INVOICES', 'SUCCESS', $2)", [branchId, uniq.length]);
    await client.query('COMMIT');
    return res.json({ success: true, data: { invoices: uniq.length, items: rowsI.length } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Revenue import error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/revenue/report/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const q = req.query;
    const last = (await pool.query("SELECT to_char(MAX(inv_date), 'YYYY-MM-DD') AS d FROM cukcuk_invoices WHERE branch_id = $1", [branchId])).rows[0].d;
    if (!last) return res.json({ success: true, data: { empty: true } });
    const year = Number(q.year) || Number(last.slice(0, 4));
    const month = Number(q.month) || Number(last.slice(5, 7));
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const prevYm = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    const cmp = q.cmp === 'auto' ? prevYm : (/^\d{4}-\d{2}$/.test(String(q.cmp || '')) ? String(q.cmp) : '');
    const minYear = Math.min(year, cmp ? Number(cmp.slice(0, 4)) : year);
    const itemMode = !!(q.kind || q.category);
    const invoices = (await pool.query(`SELECT ref_no, to_char(inv_date, 'YYYY-MM-DD') AS d, time_in, area, shift, customer_name, people, amount, discount, service_fee, tax_reduction
      FROM cukcuk_invoices WHERE branch_id = $1 AND inv_date >= $2 AND inv_date <= $3`, [branchId, `${minYear}-01-01`, `${year}-12-31`])).rows;
    const months = itemMode ? null : [ym, cmp].filter(Boolean);
    const items = (await pool.query(`SELECT i.ref_no, i.item_code, i.item_name, i.kind, i.category, i.qty, i.amount, i.discount
      FROM cukcuk_invoice_items i JOIN cukcuk_invoices v ON v.branch_id = i.branch_id AND v.ref_no = i.ref_no
      WHERE v.branch_id = $1 AND v.inv_date >= $2 AND v.inv_date <= $3 AND ($4::text[] IS NULL OR to_char(v.inv_date, 'YYYY-MM') = ANY($4))`,
    [branchId, `${minYear}-01-01`, `${year}-12-31`, months])).rows;
    const menu = (await pool.query('SELECT item_code, item_name, item_type, category_name, inactive FROM cukcuk_menu WHERE branch_id = $1', [branchId])).rows;
    // danh mục lọc: lấy từ toàn bộ món của năm, không phụ thuộc bộ lọc đang chọn
    const report = buildReport(invoices, items, menu, { year, month, cmp, kind: q.kind, category: q.category, group: q.group, lowQty: q.lowQty });
    if (!itemMode) {
      const cats = (await pool.query(`SELECT DISTINCT kind, category FROM cukcuk_invoice_items WHERE branch_id = $1`, [branchId])).rows;
      report.meta.kinds = Array.from(new Set(cats.map((c) => c.kind || 'Khác'))).sort();
      report.meta.categories = Array.from(new Set(cats.map((c) => c.category || '(Không có nhóm)'))).sort((a, b) => a.localeCompare(b, 'vi'));
    } else {
      const cats = (await pool.query(`SELECT DISTINCT kind, category FROM cukcuk_invoice_items WHERE branch_id = $1`, [branchId])).rows;
      report.meta.kinds = Array.from(new Set(cats.map((c) => c.kind || 'Khác'))).sort();
      report.meta.categories = Array.from(new Set(cats.map((c) => c.category || '(Không có nhóm)'))).sort((a, b) => a.localeCompare(b, 'vi'));
    }
    report.year = year; report.month = month;
    return res.json({ success: true, data: report });
  } catch (error) {
    console.error('Revenue report error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Xóa toàn bộ số liệu ĐÃ ĐỒNG BỘ từ CUKCUK của một chi nhánh (dùng khi lỡ đồng bộ nhầm chi nhánh).
// Không đụng tới định lượng, NVL, đơn đặt hàng, bảng ghép tay, nợ đầu kỳ nhập tay.
app.post('/api/branches/purge-sync', async (req, res) => {
  const { branchId, confirm } = req.body;
  if (!branchId || confirm !== branchId) return res.status(400).json({ success: false, message: 'Cần gõ đúng mã chi nhánh để xác nhận xóa' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const counts = {};
    const run = async (label, sql) => { counts[label] = (await client.query(sql, [branchId])).rowCount; };
    await run('doanh_so_theo_mon', 'DELETE FROM cukcuk_daily_sales WHERE branch_id = $1');
    await run('ton_kho_theo_ngay', 'DELETE FROM cukcuk_stock_daily WHERE branch_id = $1');
    await run('ton_kho_tinh_ke_hoach', 'DELETE FROM inventory_tracking WHERE branch_id = $1');
    await run('dong_hoa_don', 'DELETE FROM cukcuk_invoice_items WHERE branch_id = $1');
    await run('hoa_don', 'DELETE FROM cukcuk_invoices WHERE branch_id = $1');
    await run('lich_su_mua_hang', 'DELETE FROM supplier_purchases WHERE branch_id = $1');
    await run('chung_tu_chi', 'DELETE FROM supplier_payments WHERE branch_id = $1');
    await run('cong_no_cukcuk', 'DELETE FROM supplier_debt_snapshot WHERE branch_id = $1');
    await run('cong_no_phat_sinh_ngay', 'DELETE FROM supplier_debt_daily WHERE branch_id = $1');
    await run('no_dau_ky_cukcuk', "DELETE FROM supplier_opening_debt WHERE branch_id = $1 AND COALESCE(source, 'IMPORT') = 'CUKCUK'");
    await run('nha_cung_cap', 'DELETE FROM suppliers WHERE branch_id = $1');
    await run('nhat_ky_dong_bo', 'DELETE FROM cukcuk_sync_logs WHERE branch_id = $1');
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Đã xóa số liệu đồng bộ của chi nhánh', data: counts });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// Tên chi nhánh trên CUKCUK (khi nhiều chi nhánh dùng chung một phần mềm bán hàng)
app.post('/api/branches/cukcuk-branch', async (req, res) => {
  const { branchId, name } = req.body;
  if (!branchId) return res.status(400).json({ success: false, message: 'Thiếu chi nhánh' });
  if (/^https?:\/\/|cukcuk\.vn/i.test(String(name || ''))) return res.status(400).json({ success: false, message: 'Hãy nhập TÊN chi nhánh (ví dụ FEN RESTAURANT, Tiệm Yến), không nhập địa chỉ web' });
  try {
    await pool.query('UPDATE branches SET cukcuk_branch_name = $2 WHERE branch_id = $1', [branchId, String(name || '').trim().substring(0, 255)]);
    return res.json({ success: true });
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
  if (!branchId || !Array.isArray(rows)) {
    return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dữ liệu doanh số' });
  }
  // Kỳ không có doanh số: bỏ qua, không coi là lỗi
  if (rows.length === 0) return res.json({ success: true, message: 'Không có doanh số trong kỳ', data: { salesRecords: 0, matched_codes: 0, total_codes: 0 } });
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const clean = rows
    .map(r => ({ date: String(r.date || ''), code: String(r.code || '').trim(), name: String(r.name || '').trim(), kind: String(r.kind || '').trim(), qty: Number(r.qty), amount: Number(r.amount) || 0 }))
    .filter(r => dateRe.test(r.date) && r.code && Number.isFinite(r.qty) && r.qty !== 0);
  if (clean.length === 0) {
    return res.json({ success: true, message: 'Không có doanh số hợp lệ trong kỳ', data: { salesRecords: 0, matched_codes: 0, total_codes: 0 } });
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
    const [delFrom, delTo] = syncRange(req.body, minDate, maxDate);
    await client.query('DELETE FROM cukcuk_daily_sales WHERE branch_id = $1 AND sale_date BETWEEN $2 AND $3', [branchId, delFrom, delTo]);
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

// Đơn giá mua gần nhất của từng mặt hàng đồ uống (ghép theo tên với lịch sử mua CUKCUK, quy về đơn vị mua: chai/lon/lít)
const plainWords = (t) => ' ' + String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const sizeMlOf = (name) => {
  const m = String(name || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(',', '.'));
  return /^l$/i.test(m[2]) ? Math.round(v * 1000) : Math.round(v);
};
async function latestDrinkPrices(db, branchId, buyItems) {
  const purchases = (await db.query(`
    SELECT DISTINCT ON (item_code) item_code, item_name, unit_name, unit_price, to_char(purchase_date, 'YYYY-MM-DD') AS d, supplier_name
    FROM supplier_purchases WHERE branch_id = $1 AND unit_price > 0
    ORDER BY item_code, purchase_date DESC, detail_id DESC`, [branchId])).rows;
  const cands = purchases.map((p) => ({ ...p, words: plainWords(p.item_name), size: sizeMlOf(p.item_name), dish_id: p.item_code, dish_name: p.item_name }));
  const FLAVOR = [['chanh day', 'chanh day'], ['du lac', 'du lac'], ['oi hong', 'oi hong'], ['xoai', 'xoai']];
  const out = new Map();
  for (const b of buyItems) {
    const bw = plainWords(b.buy_name);
    let matches = [];
    if (b.buy_unit === 'lít') {
      let kws = null;
      if (bw.includes(' bia hoi ')) kws = ['bia hoi'];
      else if (bw.includes(' sapporo ')) kws = ['sapporo'];
      else if (bw.includes(' bia trai cay ')) { const f = FLAVOR.find(([k]) => bw.includes(' ' + k + ' ')); if (f) kws = ['bia', f[1]]; }
      if (!kws) continue;
      matches = cands.filter((c) => kws.every((k) => c.words.includes(' ' + k + ' ') || c.words.includes(k)));
    } else {
      const m = matchDish(b.buy_name, cands, { minContain: 2 });
      if (!m) continue;
      const c = cands.find((x) => x.item_code === m.dishId);
      const sz = sizeMlOf(b.buy_name);
      if (c && !(sz && c.size && sz !== c.size)) matches = [c];
    }
    matches.sort((a, c) => (a.d < c.d ? 1 : -1));
    for (const c of matches) {
      const u = normalizeString(c.unit_name);
      const price = Number(c.unit_price);
      let v = null;
      if (b.buy_unit === 'lít') {
        if (u === 'ml') v = price * 1000;
        else if (u === 'lit' || u === 'l') v = price;
        else if (c.size > 0) v = price / (c.size / 1000);
      } else if (u === 'ml') {
        v = (Number(b.size_ml) || 0) > 0 ? price * Number(b.size_ml) : null;
      } else v = price;
      if (v && Number.isFinite(v) && v > 0) { out.set(b.buy_name, { price: Math.round(v), date: c.d, supplier: c.supplier_name || '', item: c.item_name }); break; }
    }
  }
  return out;
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

    const lastPrices = await latestDrinkPrices(pool, branchId, buyItems);
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
      let cost = Number(b.unit_cost) || 0;
      // Đơn giá mặc định = giá mua gần nhất; giá sửa tay chỉ thắng nếu sửa cùng ngày hoặc sau lần mua đó
      const lp = lastPrices.get(b.buy_name);
      let priceOrigin = cost > 0 ? 'MANUAL' : 'NONE';
      if (lp) {
        const editedDay = b.cost_updated_at ? new Date(new Date(b.cost_updated_at).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : '';
        if (!(editedDay && editedDay >= lp.date)) { cost = lp.price; priceOrigin = 'LAST_PURCHASE'; } else priceOrigin = 'MANUAL';
      }
      let note = b.warn;
      if (!note && b.soldQty === 0) note = 'Chưa có dữ liệu bán';
      if (!note && cost === 0) note = 'Chưa có đơn giá';
      rows.push({
        buy_name: b.buy_name, category: b.category || 'Khác', buy_unit: b.buy_unit, size_ml: Number(b.size_ml) || 0,
        sold_qty: Math.round(b.soldQty * 100) / 100, consumed_units: Math.round(b.consumed * 100) / 100,
        avg_daily: Math.round(avg * 100) / 100, stock_qty: stock, suggested_qty: Math.max(0, suggested),
        unit_cost: cost, estimated_cost: Math.max(0, suggested) * cost, note, price_origin: priceOrigin,
        last_price_date: lp ? lp.date : null, last_price_supplier: lp ? lp.supplier : '', last_price_item: lp ? lp.item : ''
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
          unit_cost = COALESCE($3, unit_cost), cost_updated_at = CASE WHEN $3::numeric IS NOT NULL THEN NOW() ELSE cost_updated_at END, stock_qty = COALESCE($4, stock_qty),
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
      closing: Number(r.closing) || 0, amount: Number(r.amount) || 0,
      stockId: String(r.stockId || '').trim().substring(0, 60), stockName: String(r.stockName || '').trim().substring(0, 120),
      openingAmount: r.openingAmount === undefined || r.openingAmount === null ? null : Number(r.openingAmount) || 0,
      inAmount: r.inAmount === undefined || r.inAmount === null ? null : Number(r.inAmount) || 0
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
    const [delFrom, delTo] = syncRange(req.body, minDate, maxDate);
    await client.query('DELETE FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3', [branchId, delFrom, delTo]);
    for (const r of clean) {
      await client.query(`
        INSERT INTO cukcuk_stock_daily (branch_id, stock_date, item_code, item_name, category_name, unit_name, opening, qty_in, qty_out, closing, closing_amount,
          stock_id, stock_name, opening_amount, in_amount)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (branch_id, stock_date, item_code, stock_id) DO UPDATE SET item_name = EXCLUDED.item_name, category_name = EXCLUDED.category_name,
          unit_name = EXCLUDED.unit_name, opening = EXCLUDED.opening, qty_in = EXCLUDED.qty_in, qty_out = EXCLUDED.qty_out,
          closing = EXCLUDED.closing, closing_amount = EXCLUDED.closing_amount, stock_name = EXCLUDED.stock_name,
          opening_amount = EXCLUDED.opening_amount, in_amount = EXCLUDED.in_amount
      `, [branchId, r.date, r.code, r.name.substring(0, 255), r.category.substring(0, 100), r.unit.substring(0, 30), r.opening, r.qtyIn, r.qtyOut, r.closing, r.amount,
        r.stockId, r.stockName, r.openingAmount, r.inAmount]);
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
    if (dates.length === 0) return res.json({ success: true, data: { dates: [], items: [], materials: [], stocks: [] } });
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    const from = dateRe.test(req.query.from || '') ? req.query.from : iso(dates[0]);
    const to = dateRe.test(req.query.to || '') ? req.query.to : iso(dates[dates.length - 1]);
    const stockId = String(req.query.stock || '');
    // Danh sách kho (đúng như trên CUKCUK) có dữ liệu
    const stocks = (await pool.query(`SELECT stock_id AS id, MAX(stock_name) AS name FROM cukcuk_stock_daily
      WHERE branch_id = $1 AND stock_id <> '' GROUP BY stock_id ORDER BY MAX(stock_name)`, [branchId])).rows;
    const items = (await pool.query(`
      WITH r AS (
        SELECT stock_date, item_code, MAX(item_name) AS item_name, MAX(category_name) AS category_name, MAX(unit_name) AS unit_name,
               SUM(opening) AS opening, SUM(qty_in) AS qty_in, SUM(qty_out) AS qty_out, SUM(closing) AS closing, SUM(closing_amount) AS closing_amount,
               SUM(opening_amount) AS opening_amount, SUM(in_amount) AS in_amount
        FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3 AND ($4 = '' OR stock_id = $4)
        GROUP BY stock_date, item_code),
      firsts AS (SELECT DISTINCT ON (item_code) item_code, opening, opening_amount FROM r ORDER BY item_code, stock_date ASC),
      lasts AS (SELECT DISTINCT ON (item_code) item_code, item_name, category_name, unit_name, closing, closing_amount FROM r ORDER BY item_code, stock_date DESC),
      sums AS (SELECT item_code, SUM(qty_in) AS qty_in, SUM(qty_out) AS qty_out, SUM(in_amount) AS in_amount FROM r GROUP BY item_code),
      f1 AS (SELECT DISTINCT ON (item_code) item_code, closing AS first_closing, closing_amount AS first_amount FROM r ORDER BY item_code, stock_date ASC),
      prev AS (SELECT DISTINCT ON (item_code) item_code, closing AS prev_closing, closing_amount AS prev_amount FROM (
                 SELECT stock_date, item_code, SUM(closing) AS closing, SUM(closing_amount) AS closing_amount FROM cukcuk_stock_daily
                 WHERE branch_id = $1 AND stock_date < $2 AND ($4 = '' OR stock_id = $4) GROUP BY stock_date, item_code) x
               ORDER BY item_code, stock_date DESC),
      hist AS (SELECT p.item_code, SUM(p.amount) / NULLIF(SUM(p.qty), 0) AS hist_price
               FROM supplier_purchases p JOIN lasts l ON l.item_code = p.item_code AND lower(p.unit_name) = lower(l.unit_name)
               WHERE p.branch_id = $1 AND p.purchase_date < $2 GROUP BY p.item_code),
      buys AS (SELECT p.item_code, SUM(p.amount) AS buy_amount,
                      SUM(CASE WHEN lower(p.unit_name) = lower(l.unit_name) THEN p.qty END) AS buy_qty_same,
                      SUM(CASE WHEN lower(p.unit_name) = lower(l.unit_name) THEN p.amount END) AS buy_amount_same
               FROM supplier_purchases p JOIN lasts l ON l.item_code = p.item_code
               WHERE p.branch_id = $1 AND p.purchase_date BETWEEN $2 AND $3 GROUP BY p.item_code)
      SELECT l.item_code AS code, l.item_name AS name, l.category_name AS category, l.unit_name AS unit,
             f.opening, f.opening_amount, s.qty_in, s.qty_out, s.in_amount, l.closing, l.closing_amount AS amount,
             f1.first_closing, f1.first_amount, pv.prev_amount, pv.prev_closing IS NOT NULL AS has_prev,
             b.buy_amount, b.buy_qty_same, b.buy_amount_same, h.hist_price,
             m.material_id, m.match_type, rm.material_name
      FROM lasts l JOIN firsts f USING (item_code) JOIN sums s USING (item_code) JOIN f1 USING (item_code)
      LEFT JOIN prev pv ON pv.item_code = l.item_code
      LEFT JOIN buys b ON b.item_code = l.item_code
      LEFT JOIN hist h ON h.item_code = l.item_code
      LEFT JOIN stock_code_map m ON m.branch_id = $1 AND m.cukcuk_code = l.item_code
      LEFT JOIN raw_materials rm ON rm.material_id = m.material_id
      ORDER BY l.category_name, l.item_name`, [branchId, from, to, stockId])).rows;
    const mats = await branchMaterials(pool, branchId);
    const result = items.map(raw => {
      const n = (v) => Number(v) || 0;
      const opening = n(raw.opening), closing = n(raw.closing), qtyIn = n(raw.qty_in);
      // Giá trị đầu kỳ: ưu tiên "Giá trị tồn đầu kỳ" CUKCUK; không có thì lấy số dư cuối ngày trước kỳ; cuối cùng ước tính theo giá ngày đầu
      const openAmount = raw.opening_amount !== null && raw.opening_amount !== undefined ? n(raw.opening_amount)
        : raw.has_prev ? n(raw.prev_amount) : (n(raw.first_closing) > 0 ? opening * (n(raw.first_amount) / n(raw.first_closing)) : 0);
      const openPrice = opening > 0 ? openAmount / opening : 0;
      const closePrice = closing > 0 ? n(raw.amount) / closing : 0;
      // Đã mua: giá trị nhập kho theo CUKCUK (theo từng kho); chưa có thì lấy từ phiếu mua
      const hasIn = raw.in_amount !== null && raw.in_amount !== undefined;
      const buyAmount = hasIn ? n(raw.in_amount) : n(raw.buy_amount);
      const buyPrice = hasIn ? (qtyIn > 0 ? buyAmount / qtyIn : 0)
        : (n(raw.buy_qty_same) > 0 ? n(raw.buy_amount_same) / n(raw.buy_qty_same) : (qtyIn > 0 && buyAmount > 0 ? buyAmount / qtyIn : 0));
      const pct = (a, b) => (a > 0 && b > 0 ? ((b - a) / a) * 100 : null);
      const it = { ...raw, open_amount: openAmount, open_price: openPrice, close_price: closePrice, buy_amount: buyAmount, buy_price: buyPrice,
        dev_buy: pct(openPrice, buyPrice), dev_close: pct(openPrice, closePrice), hist_price: n(raw.hist_price), dev_hist: pct(n(raw.hist_price), buyPrice) };
      ['first_closing', 'first_amount', 'prev_amount', 'prev_closing', 'buy_qty_same', 'buy_amount_same', 'opening_amount', 'in_amount'].forEach((k) => delete it[k]);
      if (it.material_id) return it;
      const sg = suggest(it.name, mats, 1, { minContain: 2 })[0];
      return { ...it, suggestion: sg && sg.score >= 0.5 ? { material_id: sg.dish_id, material_name: sg.dish_name, score: Math.round(sg.score * 100) / 100 } : null };
    });
    return res.json({
      success: true,
      data: { dates: dates.map(iso), from, to, stock: stockId, stocks, items: result, materials: mats.map(m => ({ material_id: m.dish_id, material_name: m.dish_name })) }
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
        const [delFrom, delTo] = syncRange(req.body, ds[0], ds[ds.length - 1]);
        await client.query('DELETE FROM supplier_purchases WHERE branch_id = $1 AND purchase_date BETWEEN $2 AND $3', [branchId, delFrom, delTo]);
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
    if (Array.isArray(payments) && payments.length && dateRe.test(String(req.body.rangeFrom || '')) && dateRe.test(String(req.body.rangeTo || ''))) {
      const ids = payments.map((p) => String(p.refId || '').trim()).filter(Boolean);
      await client.query('DELETE FROM supplier_payments WHERE branch_id = $1 AND pay_date BETWEEN $2 AND $3 AND ref_id <> ALL($4::text[])', [branchId, req.body.rangeFrom, req.body.rangeTo, ids]);
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
    if (Array.isArray(debts) && dateRe.test(String(debtFrom))) {
      const asOfDay = new Date(Date.parse(debtFrom + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      for (const d of debts) {
        const code = String(d.code || '').trim();
        if (!code) continue;
        await client.query(`
          INSERT INTO supplier_opening_debt (branch_id, name_key, name, amount, as_of, supplier_code, source)
          VALUES ($1,$2,$3,$4,$5,$6,'CUKCUK')
          ON CONFLICT (branch_id, name_key) DO UPDATE SET name = EXCLUDED.name, amount = EXCLUDED.amount, as_of = EXCLUDED.as_of, updated_at = NOW()
          WHERE supplier_opening_debt.source = 'CUKCUK' AND EXCLUDED.as_of <= supplier_opening_debt.as_of`,
        [branchId, ('cc:' + code).substring(0, 255), String(d.name || '').substring(0, 255), Number(d.first) || 0, asOfDay, code.substring(0, 60)]);
      }
    }
    if (Array.isArray(req.body.debtDaily) && dateRe.test(String(req.body.rangeFrom || '')) && dateRe.test(String(req.body.rangeTo || ''))) {
      await client.query('DELETE FROM supplier_debt_daily WHERE branch_id = $1 AND debt_date BETWEEN $2 AND $3', [branchId, req.body.rangeFrom, req.body.rangeTo]);
      const dd = req.body.debtDaily.filter((x) => x && x.code && dateRe.test(String(x.date || '')));
      for (let i = 0; i < dd.length; i += 500) {
        const c = dd.slice(i, i + 500);
        await client.query(`INSERT INTO supplier_debt_daily (branch_id, debt_date, vendor_code, vendor_name, increase, decrease)
          SELECT $1, * FROM unnest($2::date[], $3::text[], $4::text[], $5::numeric[], $6::numeric[])
          ON CONFLICT (branch_id, debt_date, vendor_code) DO UPDATE SET increase = EXCLUDED.increase, decrease = EXCLUDED.decrease, vendor_name = EXCLUDED.vendor_name`,
        [branchId, c.map((x) => x.date), c.map((x) => String(x.code).substring(0, 60)), c.map((x) => String(x.name || '').substring(0, 255)),
          c.map((x) => Number(x.increase) || 0), c.map((x) => Number(x.decrease) || 0)]);
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

// Khóa so khớp tên NCC trong lý do chi: giữ khoảng trắng để chỉ khớp theo TỪ nguyên vẹn (tránh "than" khớp nhầm trong "thanh toán")
const supplierWords = (s) => String(s || '').replace(/[-–]\s*[\d .]{8,}\s*$/, '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
  .replace(/\b(cong ty|tnhh|co phan|cp|hkd|ho kinh doanh|cty|tm|dv|mtv|dntn|sx|xnk|thuong mai|dich vu|san xuat|kinh doanh)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const textWords = (s) => ' ' + String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';

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
    await client.query("DELETE FROM supplier_opening_debt WHERE branch_id = $1 AND source = 'IMPORT'", [branchId]);
    let n = 0;
    for (const r of rows) {
      const name = String(r.name || '').trim();
      const key = supplierKey(name) || normalizeString(name);
      const amount = Number(r.amount);
      if (!name || !key || !Number.isFinite(amount) || amount === 0) continue;
      await client.query(`INSERT INTO supplier_opening_debt (branch_id, name_key, name, amount, as_of, source) VALUES ($1,$2,$3,$4,$5,'IMPORT')
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

// Sửa tay nợ đầu kỳ của một NCC (ưu tiên hơn số đồng bộ từ CUKCUK và số dán từ Excel)
app.post('/api/payables/opening/set', async (req, res) => {
  const { branchId, code, name, amount, asOf } = req.body;
  const amt = Number(amount);
  if (!branchId || !code || !Number.isFinite(amt) || !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || ''))) {
    return res.status(400).json({ success: false, message: 'Thiếu nhà cung cấp, số tiền hoặc ngày chốt nợ' });
  }
  try {
    await pool.query(`INSERT INTO supplier_opening_debt (branch_id, name_key, name, amount, as_of, supplier_code, source)
      VALUES ($1,$2,$3,$4,$5,$6,'MANUAL')
      ON CONFLICT (branch_id, name_key) DO UPDATE SET name = EXCLUDED.name, amount = EXCLUDED.amount, as_of = EXCLUDED.as_of, updated_at = NOW()`,
    [branchId, ('mn:' + code).substring(0, 255), String(name || '').substring(0, 255), amt, asOf, String(code).substring(0, 60)]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Bỏ số sửa tay: quay về số đồng bộ từ CUKCUK (hoặc số đã dán)
app.post('/api/payables/opening/reset', async (req, res) => {
  const { branchId, code } = req.body;
  if (!branchId || !code) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu' });
  try {
    await pool.query("DELETE FROM supplier_opening_debt WHERE branch_id = $1 AND name_key = $2 AND source = 'MANUAL'", [branchId, 'mn:' + code]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payables/:branchId', async (req, res) => {
  const { branchId } = req.params;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = dateRe.test(String(req.query.from || '')) ? req.query.from : '1900-01-01';
  const to = dateRe.test(String(req.query.to || '')) ? req.query.to : '2999-12-31';
  try {
    const sups = (await pool.query('SELECT code, name FROM suppliers WHERE branch_id = $1', [branchId])).rows;
    const opens = (await pool.query("SELECT name_key, name, amount, to_char(as_of, 'YYYY-MM-DD') AS as_of, supplier_code, COALESCE(source, 'IMPORT') AS source FROM supplier_opening_debt WHERE branch_id = $1", [branchId])).rows;
    const pur = (await pool.query(`SELECT supplier_code, to_char(purchase_date, 'YYYY-MM-DD') AS d, SUM(amount) AS goods, SUM(vat_amount) AS vat,
        SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE amount END) AS total, COUNT(DISTINCT ref_no) AS times
      FROM supplier_purchases WHERE branch_id = $1 AND purchase_date <= $2 GROUP BY supplier_code, purchase_date`, [branchId, to])).rows;
    const pays = (await pool.query(`SELECT ref_id, ref_no, to_char(pay_date, 'YYYY-MM-DD') AS pay_date, source, type_name, amount, reason, budget_item, manual_supplier_code, ignored
      FROM supplier_payments WHERE branch_id = $1 AND pay_date <= $2 ORDER BY pay_date DESC, ref_no DESC`, [branchId, to])).rows;

    const keys = sups.map((s) => ({ code: s.code, key: supplierKey(s.name), words: supplierWords(s.name) })).filter((k) => k.key.length >= 4).sort((a, b) => b.key.length - a.key.length);
    const supByCode = new Map(sups.map((s) => [s.code, s.name]));
    const allPayments = pays.map((p) => {
      let code = null, how = '';
      if (p.ignored) how = 'ignored';
      else if (p.manual_supplier_code) { code = p.manual_supplier_code; how = 'manual'; }
      else {
        const text = textWords(`${p.reason || ''} ${p.budget_item || ''}`);
        const hit = keys.find((k) => k.words.length >= 5 && text.includes(' ' + k.words + ' '));
        if (hit) { code = hit.code; how = 'auto'; }
      }
      return { ref_id: p.ref_id, ref_no: p.ref_no, date: p.pay_date, source: p.source, type_name: p.type_name,
        amount: Number(p.amount) || 0, reason: p.reason, budget_item: p.budget_item, supplier_code: code, supplier_name: code ? (supByCode.get(code) || code) : '', how };
    });
    const payments = allPayments.filter((p) => p.date >= from);

    const rows = new Map();
    const row = (code, name) => {
      if (!rows.has(code)) rows.set(code, { code, name: name || supByCode.get(code) || code, base: 0, as_of: null, source: '', goods: 0, vat: 0, purchases: 0, purchase_count: 0, paid: 0, before_purchases: 0, before_paid: 0 });
      return rows.get(code);
    };
    sups.forEach((s) => row(s.code, s.name));

    // Gom nợ đầu kỳ theo NCC; ưu tiên: sửa tay > dán từ Excel > đồng bộ CUKCUK
    const RANK = { MANUAL: 3, IMPORT: 2, CUKCUK: 1 };
    const cand = new Map();
    opens.forEach((o) => {
      let code = o.supplier_code;
      if (!code) {
        const hit = keys.find((k) => k.key.includes(o.name_key) || o.name_key.includes(k.key));
        code = hit && o.name_key.length >= 4 ? hit.code : 'OPEN:' + o.name_key;
      }
      if (!cand.has(code)) cand.set(code, []);
      cand.get(code).push(o);
    });
    cand.forEach((list, code) => {
      const top = Math.max(...list.map((o) => RANK[o.source] || 0));
      const chosen = list.filter((o) => (RANK[o.source] || 0) === top);
      const r = row(code, chosen[0].name);
      r.base = chosen.reduce((a, o) => a + (Number(o.amount) || 0), 0);
      r.as_of = chosen.map((o) => o.as_of).sort().pop();
      r.source = chosen[0].source;
    });

    // NCC chưa có dòng nợ đầu kỳ: coi như hết nợ tại ngày chốt chung (khi đã nhập số dán/sửa tay)
    const fixedDates = opens.filter((o) => o.source !== 'CUKCUK').map((o) => o.as_of).sort();
    const defaultFloor = fixedDates.length ? fixedDates[fixedDates.length - 1] : null;
    const floorOf = (r) => r.as_of || defaultFloor;
    // Công nợ phát sinh theo ngày lấy thẳng từ báo cáo "Công nợ nhà cung cấp" của CUKCUK (nếu đã đồng bộ): khớp đúng CUKCUK
    const dd = (await pool.query("SELECT to_char(debt_date, 'YYYY-MM-DD') AS d, vendor_code, vendor_name, increase, decrease FROM supplier_debt_daily WHERE branch_id = $1 AND debt_date <= $2", [branchId, to])).rows;
    const ckMode = dd.length > 0;
    const firstDay = dd.reduce((m, x) => (x.d < m ? x.d : m), '9999-12-31');
    const dayBefore = ckMode ? new Date(Date.parse(firstDay + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : null;
    pur.forEach((p) => {
      if (!p.supplier_code) return;
      const r = row(p.supplier_code);
      const fl = ckMode ? (r.as_of || dayBefore) : floorOf(r);
      if (fl && p.d <= fl) return;
      if (p.d < from) { if (!ckMode) r.before_purchases += Number(p.total) || 0; }
      else { r.goods += Number(p.goods) || 0; r.vat += Number(p.vat) || 0; if (!ckMode) r.purchases += Number(p.total) || 0; r.purchase_count += Number(p.times) || 0; }
    });
    if (ckMode) {
      dd.forEach((x) => {
        const r = row(x.vendor_code, x.vendor_name);
        const fl = r.as_of || dayBefore;
        if (x.d <= fl) return;
        const inc = Number(x.increase) || 0;
        const dec = Number(x.decrease) || 0;
        if (x.d < from) { r.before_inc = (r.before_inc || 0) + inc; r.before_dec = (r.before_dec || 0) + dec; }
        else { r.inc = (r.inc || 0) + inc; r.dec = (r.dec || 0) + dec; }
      });
    } else {
      allPayments.forEach((p) => {
        if (!p.supplier_code) return;
        const r = row(p.supplier_code);
        if (floorOf(r) && p.date <= floorOf(r)) return;
        if (p.date < from) r.before_paid += p.amount; else r.paid += p.amount;
      });
    }

    const all = Array.from(rows.values()).map((r) => {
      if (ckMode) {
        const opening = r.base + (r.before_inc || 0) - (r.before_dec || 0);
        const inc = r.inc || 0;
        const dec = r.dec || 0;
        return { code: r.code, name: r.name, opening, goods: r.goods, vat: r.vat, other: inc - r.goods - r.vat, purchases: inc, purchase_count: r.purchase_count, paid: dec,
          balance: opening + inc - dec, opening_base: r.base, opening_as_of: r.as_of, opening_source: r.source };
      }
      const opening = r.base + r.before_purchases - r.before_paid;
      return { code: r.code, name: r.name, opening, goods: r.goods, vat: r.vat, other: 0, purchases: r.purchases, purchase_count: r.purchase_count, paid: r.paid,
        balance: opening + r.purchases - r.paid, opening_base: r.base, opening_as_of: r.as_of, opening_source: r.source };
    });
    const list = all.filter((r) => r.opening || r.purchases || r.paid || r.balance).sort((a, b) => b.balance - a.balance);
    const openingRows = all.map((r) => ({ code: r.code, name: r.name, amount: r.opening_base, as_of: r.opening_as_of, source: r.opening_source }))
      .sort((a, b) => (b.amount ? 1 : 0) - (a.amount ? 1 : 0) || String(a.name).localeCompare(String(b.name), 'vi'));
    return res.json({ success: true, data: {
      suppliers: list, payments, openingRows, ck: ckMode,
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
// Mọi mặt hàng đã mua theo từng NCC (kể cả chưa ghép với NVL trong app)
app.get('/api/suppliers/items/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    const rows = (await pool.query(`
      WITH g AS (
        SELECT p.item_code, p.supplier_code, MAX(p.supplier_name) AS supplier_name, MAX(p.item_name) AS item_name, COUNT(DISTINCT p.ref_no) AS times,
               SUM(p.amount) AS amount, SUM(p.qty) AS qty, MAX(p.purchase_date) AS last_date
        FROM supplier_purchases p WHERE p.branch_id = $1 GROUP BY p.item_code, p.supplier_code),
      lastp AS (SELECT DISTINCT ON (item_code, supplier_code) item_code, supplier_code, unit_name, unit_price
                FROM supplier_purchases WHERE branch_id = $1 ORDER BY item_code, supplier_code, purchase_date DESC, detail_id DESC)
      SELECT g.item_code, g.item_name, g.supplier_code, g.supplier_name, g.times, g.amount, g.qty, to_char(g.last_date, 'YYYY-MM-DD') AS last_date,
             l.unit_name, l.unit_price, m.material_id, rm.material_name
      FROM g JOIN lastp l ON l.item_code = g.item_code AND l.supplier_code = g.supplier_code
      LEFT JOIN stock_code_map m ON m.branch_id = $1 AND m.cukcuk_code = g.item_code
      LEFT JOIN raw_materials rm ON rm.material_id = m.material_id
      ORDER BY g.item_name, g.last_date DESC`, [branchId])).rows;
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

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
    GROUP BY m.material_id, rm.material_name, rm.unit_purchase`, params)).rows.concat((await db.query(`
    SELECT 'CK:' || p.item_code AS material_id, MAX(p.item_name) || ' (chưa ghép NVL)' AS material_name, MAX(p.unit_name) AS unit,
           SUM(p.qty) AS qty, SUM(p.amount) AS amount
    FROM supplier_purchases p
    LEFT JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code
    WHERE p.branch_id = $1 AND p.purchase_date BETWEEN $2 AND $3${supSql} AND m.material_id IS NULL
    GROUP BY p.item_code`, params)).rows);
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
      await client.query("UPDATE raw_materials SET unit_cost = $1, price_source = 'MANUAL', price_updated_at = NOW(), updated_at = NOW() WHERE material_id = $2", [p, materialId]);
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
// Đơn giá mua của lần nhập gần nhất cho từng NVL trong app (quy về đơn vị mua của app; bỏ qua nếu đơn vị không tương thích)
const SMALL_UNIT_SET = new Set(['gram', 'gr', 'g', 'ml']);
const BIG_UNIT_SET = new Set(['kg', 'kilogam', 'lit', 'l', 'liter', 'litre']);
async function latestPurchasePrices(db, branchId) {
  const rows = (await db.query(`
    SELECT DISTINCT ON (m.material_id) m.material_id, to_char(p.purchase_date, 'YYYY-MM-DD') AS d, p.supplier_name, p.unit_name, p.unit_price,
           rm.unit_purchase, rm.conversion_rate, rm.price_source, rm.price_updated_at
    FROM supplier_purchases p
    JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code AND m.material_id IS NOT NULL
    JOIN raw_materials rm ON rm.material_id = m.material_id
    WHERE p.branch_id = $1 AND p.unit_price > 0
    ORDER BY m.material_id, p.purchase_date DESC, p.detail_id DESC`, [branchId])).rows;
  const map = new Map();
  rows.forEach((r) => {
    const up = normalizeString(r.unit_purchase);
    const pu = normalizeString(r.unit_name);
    const conv = Number(r.conversion_rate) || 1;
    let price = null;
    if (up && up === pu) price = Number(r.unit_price);
    else if (SMALL_UNIT_SET.has(pu) && BIG_UNIT_SET.has(up) && conv > 1) price = Number(r.unit_price) * conv;
    if (price === null || !Number.isFinite(price) || price <= 0) return;
    map.set(r.material_id, { price: Math.round(price), date: r.d, supplier: r.supplier_name || '', manual: r.price_source === 'MANUAL', editedAt: r.price_updated_at });
  });
  return map;
}

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

      // Đơn giá mặc định = giá mua của đơn hàng gần nhất; giá sửa tay chỉ thắng nếu sửa cùng ngày hoặc sau lần mua đó
      const lastPrices = await latestPurchasePrices(pool, branchId);
      const details = detailsRes.rows.map((d) => {
        const lp = lastPrices.get(d.material_id);
        if (!lp) return { ...d, price_origin: 'BOM' };
        const editedDay = lp.editedAt ? new Date(new Date(lp.editedAt).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : '';
        const manualWins = lp.manual && editedDay && editedDay >= lp.date;
        const base = { ...d, last_price: lp.price, last_price_date: lp.date, last_price_supplier: lp.supplier };
        if (manualWins) return { ...base, price_origin: 'MANUAL' };
        const qty = d.adjusted_qty !== null && d.adjusted_qty !== undefined ? Number(d.adjusted_qty) : Number(d.suggested_qty) || 0;
        return { ...base, unit_cost: lp.price, estimated_cost: Math.round(qty * lp.price), price_origin: 'LAST_PURCHASE' };
      });
      plans.push({
        ...plan,
        details,
        total_cost: details.reduce((sum, d) => sum + (Number(d.estimated_cost) || 0), 0),
        total_items: details.length
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
