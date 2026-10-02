const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
require('dotenv').config();

const CukCukService = require('./services/cukcukService');
const { parseAndSaveBOM } = require('./services/bomService');
const PurchasePlanService = require('./services/purchasePlanService');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const upload = multer({ storage: multer.memoryStorage() });

// 1. API Tạo Chi Nhánh Mới
app.post('/api/branches/create', async (req, res) => {
  const { branchId, branchName, cukcukCompanyCode } = req.body;
  try {
    await pool.query(`
      INSERT INTO branches (branch_id, branch_name, cukcuk_company_code)
      VALUES ($1, $2, $3)
    `, [branchId, branchName, cukcukCompanyCode]);
    return res.json({ success: true, message: `Đã tạo chi nhánh ${branchName} thành công!` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. API Upload BOM Định Lượng theo Chi Nhánh
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
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

// 3. API Đồng Bộ CUKCUK
app.post('/api/cukcuk/sync', async (req, res) => {
  const { branchId, companyCode, username, password, fromDate, toDate } = req.body;
  try {
    const auth = await CukCukService.login(companyCode, username, password);
    if (!auth.success) return res.status(401).json(auth);

    const salesData = await CukCukService.getSalesData(auth.accessToken, fromDate, toDate);
    const inventoryData = await CukCukService.getInventoryBalance(auth.accessToken);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of salesData) {
        await client.query(`
          INSERT INTO cukcuk_daily_sales (branch_id, dish_id, dish_name, quantity_sold, sale_date)
          VALUES ($1, $2, $3, $4, $5)
        `, [branchId, item.dish_id, item.dish_name, item.quantity, toDate]);
      }
      for (const inv of inventoryData) {
        await client.query(`
          INSERT INTO inventory_tracking (branch_id, material_id, period_date, closing_stock)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (branch_id, material_id, period_date) DO UPDATE SET closing_stock = $4
        `, [branchId, inv.material_code, toDate, inv.current_stock]);
      }
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Đồng bộ CUKCUK thành công!' });
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 4. API Tạo Kế Hoạch Mua Hàng
app.post('/api/purchase-plans/generate', async (req, res) => {
  const { branchId, cycleType } = req.body;
  const client = await pool.connect();
  try {
    const forecastDays = cycleType === 'FRESH_3DAYS' ? 3 : 7;
    const materials = (await client.query('SELECT * FROM raw_materials WHERE is_merged = FALSE')).rows;

    const salesRes = await client.query(`
      SELECT b.material_id, SUM(b.quantity_per_dish * s.quantity_sold) as total_demand
      FROM cukcuk_daily_sales s
      JOIN bill_of_materials b ON s.dish_id = b.dish_id AND s.branch_id = b.branch_id
      WHERE s.branch_id = $1 AND s.sale_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY b.material_id
    `, [branchId]);
    const salesDemandMap = {};
    salesRes.rows.forEach(r => { salesDemandMap[r.material_id] = parseFloat(r.total_demand) || 0; });

    const inventoryRes = await client.query(`
      SELECT DISTINCT ON (material_id) material_id, closing_stock
      FROM inventory_tracking WHERE branch_id = $1
      ORDER BY material_id, period_date DESC
    `, [branchId]);
    const inventoryMap = {};
    inventoryRes.rows.forEach(r => { inventoryMap[r.material_id] = { current_stock: parseFloat(r.closing_stock) || 0 }; });

    const planDetails = PurchasePlanService.calculatePlan(materials, salesDemandMap, inventoryMap, cycleType, forecastDays);
    return res.json({ success: true, data: planDetails });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

app.listen(port, () => console.log(`[Server Running] Port ${port}`));
