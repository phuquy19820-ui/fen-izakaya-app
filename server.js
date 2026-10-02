const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const next = require('next');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CukCukService = require('./services/cukcukService');
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
    const summary = await parseAndSaveBOM(req.file.buffer, branchId, client);
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
      SELECT * FROM raw_materials
      WHERE branch_id = $1 AND is_active = TRUE
      ORDER BY category, material_name
    `, [branchId]);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 6. API Đồng bộ CUKCUK
app.post('/api/cukcuk/sync', async (req, res) => {
  const { branchId, companyCode, username, password, fromDate, toDate } = req.body;
  if (!branchId || !companyCode) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin đăng nhập CUKCUK' });
  }

  const client = await pool.connect();
  try {
    const auth = await CukCukService.login(companyCode, username, password);
    if (!auth.success) return res.status(401).json(auth);

    const salesData = await CukCukService.getSalesData(auth.accessToken, fromDate, toDate);
    const inventoryData = await CukCukService.getInventoryBalance(auth.accessToken);

    await client.query('BEGIN');

    // Lưu dữ liệu bán hàng
    for (const item of salesData) {
      await client.query(`
        INSERT INTO cukcuk_daily_sales (branch_id, dish_id, dish_name, quantity_sold, sale_date)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [branchId, item.dish_id, item.dish_name, item.quantity, toDate]);
    }

    // Lưu tồn kho
    for (const inv of inventoryData) {
      await client.query(`
        INSERT INTO inventory_tracking (branch_id, material_id, period_date, closing_stock)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (branch_id, material_id, period_date) DO UPDATE SET closing_stock = $4
      `, [branchId, inv.material_code, toDate, inv.current_stock]);
    }

    // Cập nhật token CUKCUK
    await client.query(`
      UPDATE branches SET cukcuk_auth_token = $1, cukcuk_token_expires_at = NOW() + INTERVAL '24 hours'
      WHERE branch_id = $2
    `, [auth.accessToken, branchId]);

    await client.query('COMMIT');

    // Ghi log sync
    await pool.query(`
      INSERT INTO cukcuk_sync_logs (branch_id, sync_type, status, records_imported)
      VALUES ($1, 'SALES_INVENTORY', 'SUCCESS', $2)
    `, [branchId, salesData.length + inventoryData.length]);

    return res.json({
      success: true,
      message: 'Đồng bộ CUKCUK thành công!',
      data: { salesRecords: salesData.length, inventoryRecords: inventoryData.length }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CUKCUK sync error:', error);
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 7. API Tạo kế hoạch mua hàng
app.post('/api/purchase-plans/generate', async (req, res) => {
  const { branchId, cycleType = 'FRESH_3DAYS' } = req.body;
  if (!branchId) {
    return res.status(400).json({ success: false, message: 'Thiếu Chi nhánh' });
  }

  const client = await pool.connect();
  try {
    // Lấy danh sách NVL
    const materialsRes = await client.query(`
      SELECT * FROM raw_materials
      WHERE branch_id = $1 AND is_active = TRUE AND is_merged = FALSE
    `, [branchId]);
    const materials = materialsRes.rows;

    // Lấy dữ liệu bán hàng 7 ngày gần nhất
    const salesRes = await client.query(`
      SELECT b.material_id, SUM(b.quantity_per_dish * s.quantity_sold) as total_demand
      FROM cukcuk_daily_sales s
      JOIN bill_of_materials b ON s.dish_id = b.dish_id AND s.branch_id = b.branch_id
      WHERE s.branch_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY b.material_id
    `, [branchId]);

    const salesDemandMap = {};
    salesRes.rows.forEach(r => {
      salesDemandMap[r.material_id] = parseFloat(r.total_demand) || 0;
    });

    // Lấy tồn kho hiện tại
    const inventoryRes = await client.query(`
      SELECT DISTINCT ON (material_id) material_id, closing_stock, period_date
      FROM inventory_tracking WHERE branch_id = $1
      ORDER BY material_id, period_date DESC
    `, [branchId]);

    const inventoryMap = {};
    inventoryRes.rows.forEach(r => {
      inventoryMap[r.material_id] = {
        current_stock: parseFloat(r.closing_stock) || 0,
        period_date: r.period_date
      };
    });

    // Tính kế hoạch mua
    const forecastDays = cycleType === 'FRESH_3DAYS' ? 3 : 7;
    const planDetails = [];

    for (const material of materials) {
      const currentStock = inventoryMap[material.material_id]?.current_stock || 0;
      const avgDailySales = salesDemandMap[material.material_id] || 0;
      const safetyStock = PurchasePlanService.calculateSafetyStock(avgDailySales, material.lead_time_days || 1);
      const forecastedDemand = PurchasePlanService.calculateForecastedDemand(avgDailySales, forecastDays, material.waste_rate || 5);
      const reorderPoint = PurchasePlanService.calculateReorderPoint(avgDailySales, material.lead_time_days || 1, safetyStock);
      const suggestedQty = PurchasePlanService.calculatePurchaseQty(currentStock, forecastedDemand, reorderPoint, safetyStock);

      planDetails.push({
        material_id: material.material_id,
        material_name: material.material_name,
        category: material.category,
        unit_purchase: material.unit_purchase,
        opening_stock: Math.round(currentStock * 100) / 100,
        avg_daily_sales: Math.round(avgDailySales * 100) / 100,
        forecast_days: forecastDays,
        forecasted_demand: Math.ceil(forecastedDemand),
        safety_stock: Math.ceil(safetyStock),
        reorder_point: Math.ceil(reorderPoint),
        suggested_qty: Math.max(0, Math.ceil(suggestedQty)),
        unit_cost: material.unit_cost || 0,
        estimated_cost: Math.max(0, Math.ceil(suggestedQty)) * (material.unit_cost || 0),
        note: PurchasePlanService.generateNote(currentStock, avgDailySales, forecastDays, material.category)
      });
    }

    // Lưu kế hoạch
    const planRes = await client.query(`
      INSERT INTO purchase_plans (branch_id, plan_name, cycle_type, start_date, end_date, status)
      VALUES ($1, $2, $3, CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', 'DRAFT')
      RETURNING plan_id
    `, [branchId, `Kế hoạch ${cycleType} - ${new Date().toLocaleDateString('vi-VN')}`, cycleType]);

    const planId = planRes.rows[0].plan_id;

    // Lưu chi tiết kế hoạch
    for (const detail of planDetails) {
      await client.query(`
        INSERT INTO purchase_plan_details
        (plan_id, branch_id, material_id, material_name, category, unit_purchase,
         opening_stock, avg_daily_sales, forecast_days, forecasted_demand,
         safety_stock, reorder_point, suggested_qty, unit_cost, estimated_cost, note, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'PENDING')
      `, [
        planId, branchId, detail.material_id, detail.material_name, detail.category, detail.unit_purchase,
        detail.opening_stock, detail.avg_daily_sales, detail.forecast_days, detail.forecasted_demand,
        detail.safety_stock, detail.reorder_point, detail.suggested_qty, detail.unit_cost,
        detail.estimated_cost, detail.note
      ]);
    }

    const totalCost = planDetails.reduce((sum, d) => sum + d.estimated_cost, 0);

    return res.json({
      success: true,
      message: 'Tạo kế hoạch mua hàng thành công!',
      data: {
        plan_id: planId,
        cycle_type: cycleType,
        total_items: planDetails.length,
        total_cost: Math.round(totalCost * 100) / 100,
        details: planDetails
      }
    });
  } catch (error) {
    console.error('Purchase plan generation error:', error);
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
