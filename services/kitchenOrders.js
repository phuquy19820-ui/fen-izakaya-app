// Theo dõi đơn đặt hàng của Bếp: tải file "Đơn đặt mua nguyên vật liệu" (xuất từ app) mỗi ngày,
// so sánh số lượng ĐẶT với số lượng dự kiến DÙNG theo bán hàng (định lượng món) và số lượng THỰC MUA.

const dateOnly = (s, fallback) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : fallback);
const SMALL_UNITS_SQL = "lower(p.unit_name) IN ('gram', 'gr', 'g', 'ml')";

async function init(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS kitchen_orders (
    id SERIAL PRIMARY KEY, branch_id VARCHAR(50) NOT NULL, order_no VARCHAR(40), order_date DATE NOT NULL, delivery_date DATE,
    supplier_name VARCHAR(255), file_name VARCHAR(255), uploaded_by VARCHAR(80), uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, line_count INT DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS kitchen_order_lines (
    order_id INT NOT NULL REFERENCES kitchen_orders(id) ON DELETE CASCADE, branch_id VARCHAR(50) NOT NULL, line_no INT NOT NULL,
    group_name VARCHAR(120), code VARCHAR(80) NOT NULL, name VARCHAR(255), unit VARCHAR(30), qty NUMERIC(18,4) DEFAULT 0,
    PRIMARY KEY (order_id, line_no)
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_kitchen_orders_branch ON kitchen_orders (branch_id, order_date)');
}

function register(app, pool) {
  init(pool).catch((e) => console.error('Kitchen orders init error:', e.message));
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('Kitchen orders error:', e); res.status(500).json({ success: false, message: e.message }); } };

  // Lưu các đơn đã đọc từ file (cùng số đơn thì ghi đè)
  app.post('/api/kitchen-orders/import', wrap(async (req, res) => {
    const { branchId, orders } = req.body || {};
    if (!branchId || !Array.isArray(orders) || orders.length === 0) return res.status(400).json({ success: false, message: 'Thiếu chi nhánh hoặc dữ liệu đơn hàng' });
    const client = await pool.connect();
    let saved = 0; let replaced = 0; let lines = 0;
    try {
      await client.query('BEGIN');
      for (const o of orders) {
        const orderNo = String(o.orderNo || '').trim().substring(0, 40);
        const orderDate = dateOnly(o.orderDate, '');
        const ls = (Array.isArray(o.lines) ? o.lines : []).map((l) => ({
          group: String(l.group || '').substring(0, 120), code: String(l.code || '').trim().substring(0, 80), name: String(l.name || '').substring(0, 255),
          unit: String(l.unit || '').substring(0, 30), qty: Number(l.qty) || 0
        })).filter((l) => l.code && l.qty > 0).slice(0, 3000);
        if (!orderDate || ls.length === 0) continue;
        if (orderNo) {
          const del = await client.query('DELETE FROM kitchen_orders WHERE branch_id = $1 AND order_no = $2', [branchId, orderNo]);
          replaced += del.rowCount;
        }
        const r = await client.query(`INSERT INTO kitchen_orders (branch_id, order_no, order_date, delivery_date, supplier_name, file_name, uploaded_by, line_count)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [branchId, orderNo || null, orderDate, dateOnly(o.deliveryDate, null), String(o.supplier || '').substring(0, 255) || null, String(o.fileName || '').substring(0, 255) || null,
          (req.user && req.user.fullName) || null, ls.length]);
        const id = r.rows[0].id;
        await client.query(`INSERT INTO kitchen_order_lines (order_id, branch_id, line_no, group_name, code, name, unit, qty)
          SELECT $1, $2, * FROM unnest($3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[])`,
        [id, branchId, ls.map((_, i) => i + 1), ls.map((l) => l.group), ls.map((l) => l.code), ls.map((l) => l.name), ls.map((l) => l.unit), ls.map((l) => l.qty)]);
        saved += 1; lines += ls.length;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    res.json({ success: true, data: { saved, replaced, lines } });
  }));

  app.get('/api/kitchen-orders/list/:branchId', wrap(async (req, res) => {
    const from = dateOnly(req.query.from, '1970-01-01');
    const to = dateOnly(req.query.to, '2999-12-31');
    const r = await pool.query(`SELECT id, order_no, to_char(order_date, 'YYYY-MM-DD') AS order_date, to_char(delivery_date, 'YYYY-MM-DD') AS delivery_date, supplier_name, file_name, uploaded_by, uploaded_at, line_count
      FROM kitchen_orders WHERE branch_id = $1 AND COALESCE(delivery_date, order_date) BETWEEN $2 AND $3
      ORDER BY COALESCE(delivery_date, order_date) DESC, id DESC LIMIT 500`, [req.params.branchId, from, to]);
    res.json({ success: true, data: r.rows });
  }));

  app.delete('/api/kitchen-orders/:branchId/:id', wrap(async (req, res) => {
    const r = await pool.query('DELETE FROM kitchen_orders WHERE branch_id = $1 AND id = $2', [req.params.branchId, Number(req.params.id) || 0]);
    res.json({ success: r.rowCount > 0, message: r.rowCount ? 'Đã xóa đơn' : 'Không tìm thấy đơn' });
  }));

  // So sánh ĐẶT (file Bếp) - DÙNG THEO BÁN (định lượng món) - THỰC MUA, theo NVL trong khoảng ngày
  app.get('/api/kitchen-orders/compare/:branchId', wrap(async (req, res) => {
    const branchId = req.params.branchId;
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const to = dateOnly(req.query.to, today);
    const from = dateOnly(req.query.from, to);
    const basis = req.query.basis === 'created' ? 'created' : 'delivery';
    const dateExpr = basis === 'created' ? 'o.order_date' : 'COALESCE(o.delivery_date, o.order_date)';

    const ordered = (await pool.query(`SELECT l.code, MAX(l.name) AS name, MAX(l.unit) AS unit, MAX(l.group_name) AS grp, to_char(${dateExpr}, 'YYYY-MM-DD') AS d, SUM(l.qty) AS qty
      FROM kitchen_orders o JOIN kitchen_order_lines l ON l.order_id = o.id
      WHERE o.branch_id = $1 AND ${dateExpr} BETWEEN $2 AND $3 GROUP BY l.code, d`, [branchId, from, to])).rows;
    // dự kiến dùng theo bán: số món bán × định lượng, quy về đơn vị mua của NVL
    const sold = (await pool.query(`SELECT b.material_id AS code, to_char(i.inv_date, 'YYYY-MM-DD') AS d,
        SUM(i.qty * b.quantity_per_dish / NULLIF(CASE WHEN COALESCE(rm.conversion_rate, 0) > 0 THEN rm.conversion_rate ELSE 1 END, 0)) AS qty
      FROM cukcuk_invoice_items i
      JOIN dish_code_map m ON m.branch_id = i.branch_id AND m.cukcuk_code = i.item_code AND m.bom_dish_id IS NOT NULL
      JOIN bill_of_materials b ON b.dish_id = m.bom_dish_id AND b.branch_id = i.branch_id
      JOIN raw_materials rm ON rm.material_id = b.material_id
      WHERE i.branch_id = $1 AND i.inv_date BETWEEN $2 AND $3 GROUP BY b.material_id, d`, [branchId, from, to])).rows;
    // thực mua (đã ghép NVL của app), quy về đơn vị mua
    const bought = (await pool.query(`SELECT m.material_id AS code, to_char(p.purchase_date, 'YYYY-MM-DD') AS d,
        SUM(p.qty * CASE WHEN ${SMALL_UNITS_SQL} AND rm.conversion_rate > 1 THEN 1.0 / rm.conversion_rate ELSE 1.0 END) AS qty, SUM(p.amount) AS amount
      FROM supplier_purchases p
      JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code AND m.material_id IS NOT NULL
      JOIN raw_materials rm ON rm.material_id = m.material_id
      WHERE p.branch_id = $1 AND p.purchase_date BETWEEN $2 AND $3 GROUP BY m.material_id, d`, [branchId, from, to])).rows;
    const unmatched = (await pool.query(`SELECT COUNT(*) AS n, COALESCE(SUM(p.amount), 0) AS amount FROM supplier_purchases p
      LEFT JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code
      WHERE p.branch_id = $1 AND p.purchase_date BETWEEN $2 AND $3 AND m.material_id IS NULL`, [branchId, from, to])).rows[0];
    // độ phủ định lượng của doanh số
    const cover = (await pool.query(`SELECT SUM(i.qty) AS total, SUM(i.qty) FILTER (WHERE m.bom_dish_id IS NOT NULL) AS mapped
      FROM cukcuk_invoice_items i LEFT JOIN dish_code_map m ON m.branch_id = i.branch_id AND m.cukcuk_code = i.item_code
      WHERE i.branch_id = $1 AND i.inv_date BETWEEN $2 AND $3 AND (i.kind IS NULL OR i.kind NOT ILIKE 'đồ uống%')`, [branchId, from, to])).rows[0];
    const unmappedDishes = (await pool.query(`SELECT MAX(i.item_name) AS name, SUM(i.qty) AS qty FROM cukcuk_invoice_items i
      LEFT JOIN dish_code_map m ON m.branch_id = i.branch_id AND m.cukcuk_code = i.item_code
      WHERE i.branch_id = $1 AND i.inv_date BETWEEN $2 AND $3 AND m.bom_dish_id IS NULL AND (i.kind IS NULL OR i.kind NOT ILIKE 'đồ uống%')
      GROUP BY i.item_code ORDER BY qty DESC LIMIT 10`, [branchId, from, to])).rows;

    const codes = Array.from(new Set([...ordered.map((r) => r.code), ...sold.map((r) => r.code), ...bought.map((r) => r.code)]));
    const metaRows = codes.length ? (await pool.query('SELECT material_id, material_name, unit_purchase, category, unit_cost FROM raw_materials WHERE material_id = ANY($1)', [codes])).rows : [];
    const meta = new Map(metaRows.map((r) => [r.material_id, r]));
    const rows = new Map();
    const get = (code) => {
      if (!rows.has(code)) {
        const m = meta.get(code) || {};
        rows.set(code, { code, name: m.material_name || '', unit: m.unit_purchase || '', group: m.category || '', ordered: 0, sold: 0, bought: 0, boughtAmount: 0, orderedUnit: '', daily: {} });
      }
      return rows.get(code);
    };
    const day = (r, d) => (r.daily[d] = r.daily[d] || { d, ordered: 0, sold: 0, bought: 0 });
    ordered.forEach((o) => { const r = get(o.code); r.ordered += Number(o.qty) || 0; r.orderedUnit = o.unit || r.orderedUnit; if (!r.name) r.name = o.name; if (!r.unit) r.unit = o.unit; if (o.grp) r.group = o.grp; day(r, o.d).ordered += Number(o.qty) || 0; });
    sold.forEach((o) => { const r = get(o.code); r.sold += Number(o.qty) || 0; day(r, o.d).sold += Number(o.qty) || 0; });
    bought.forEach((o) => { const r = get(o.code); r.bought += Number(o.qty) || 0; r.boughtAmount += Number(o.amount) || 0; day(r, o.d).bought += Number(o.qty) || 0; });
    const round = (v) => Math.round(v * 1000) / 1000;
    const out = Array.from(rows.values()).map((r) => ({
      code: r.code, name: r.name || r.code, unit: r.unit, group: r.group, ordered: round(r.ordered), sold: round(r.sold), bought: round(r.bought), boughtAmount: Math.round(r.boughtAmount),
      unitMismatch: !!(r.orderedUnit && r.unit && r.orderedUnit.trim().toLowerCase() !== r.unit.trim().toLowerCase()),
      daily: Object.values(r.daily).sort((a, b) => a.d.localeCompare(b.d)).map((x) => ({ d: x.d, ordered: round(x.ordered), sold: round(x.sold), bought: round(x.bought) }))
    })).filter((r) => r.ordered > 0 || r.sold > 0 || r.bought > 0).sort((a, b) => (a.group || '').localeCompare(b.group || '', 'vi') || a.name.localeCompare(b.name, 'vi'));
    const orderCount = (await pool.query(`SELECT COUNT(*) AS n FROM kitchen_orders o WHERE o.branch_id = $1 AND ${dateExpr} BETWEEN $2 AND $3`, [branchId, from, to])).rows[0].n;
    const lastUpload = (await pool.query('SELECT MAX(uploaded_at) AS t, to_char(MAX(COALESCE(delivery_date, order_date)), \'YYYY-MM-DD\') AS last_order FROM kitchen_orders WHERE branch_id = $1', [branchId])).rows[0];
    res.json({ success: true, data: {
      from, to, basis, orderCount: Number(orderCount) || 0, rows: out,
      coverage: { total: Number(cover.total) || 0, mapped: Number(cover.mapped) || 0 }, unmappedDishes: unmappedDishes.map((d) => ({ name: d.name, qty: Number(d.qty) || 0 })),
      unmatchedPurchases: { n: Number(unmatched.n) || 0, amount: Math.round(Number(unmatched.amount) || 0) },
      lastUpload: lastUpload && lastUpload.t ? new Date(lastUpload.t).toISOString() : '', lastOrderDate: (lastUpload && lastUpload.last_order) || ''
    } });
  }));
}

module.exports = { register };
