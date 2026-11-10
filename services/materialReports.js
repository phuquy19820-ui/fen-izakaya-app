// Báo cáo NVL: (1) tiêu hao theo số lượng bán x định lượng, (2) xuất - nhập - tồn kho NVL theo tháng.
// Mọi số lượng quy về ĐƠN VỊ MUA của NVL trong app (kg, lít, cái...). Định lượng lưu theo gr/ml nên chia cho conversion_rate.
const XLSX = require('xlsx');
const { normalizeString, parseNumber } = require('./bomService');

const SMALL_UNITS = new Set(['gram', 'gr', 'g', 'ml']);
const BIG_UNITS = new Set(['kg', 'kilogam', 'lit', 'l', 'liter', 'litre']);
const p2 = (n) => String(n).padStart(2, '0');
const ymOf = (y, m) => `${y}-${p2(m)}`;
const monthRange = (y, m) => ({ from: `${y}-${p2(m)}-01`, to: `${y}-${p2(m)}-${p2(new Date(y, m, 0).getDate())}` });
const nz = (v) => Number(v) || 0;

function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + k, 1);
  return ymOf(d.getFullYear(), d.getMonth() + 1);
}

// Phiếu mua (đã ghép NVL) tới hết ngày `to`: số lượng và đơn giá quy về đơn vị mua của NVL
async function purchaseRows(db, branchId, to) {
  const rows = (await db.query(`
    SELECT to_char(p.purchase_date, 'YYYY-MM') AS ym, to_char(p.purchase_date, 'YYYY-MM-DD') AS d, m.material_id,
           p.unit_name, p.qty, p.unit_price, p.amount, rm.unit_purchase, rm.conversion_rate
    FROM supplier_purchases p
    JOIN stock_code_map m ON m.branch_id = p.branch_id AND m.cukcuk_code = p.item_code AND m.material_id IS NOT NULL
    JOIN raw_materials rm ON rm.material_id = m.material_id
    WHERE p.branch_id = $1 AND p.purchase_date <= $2
    ORDER BY p.purchase_date, p.detail_id`, [branchId, to])).rows;
  return rows.map((r) => {
    const up = normalizeString(r.unit_purchase);
    const pu = normalizeString(r.unit_name);
    const conv = nz(r.conversion_rate) > 1 ? nz(r.conversion_rate) : 1;
    const qty = nz(r.qty);
    let k = null; // hệ số đổi số lượng của phiếu mua sang đơn vị mua của NVL
    if (up && up === pu) k = 1;
    else if (SMALL_UNITS.has(pu) && BIG_UNITS.has(up) && conv > 1) k = 1 / conv;
    return { ym: r.ym, d: r.d, material_id: r.material_id, qty: k === null ? qty : qty * k, amount: nz(r.amount), converted: k !== null };
  });
}

// Đơn giá mua theo NVL: bình quân tháng chọn -> lần mua gần nhất trước đó -> đơn giá trong file định lượng
function buildPriceFn(purchases, ym, materials) {
  const month = new Map(); const last = new Map();
  purchases.forEach((r) => {
    if (!r.converted || r.qty <= 0 || r.amount <= 0) return;
    if (r.ym === ym) { const a = month.get(r.material_id) || { q: 0, v: 0 }; a.q += r.qty; a.v += r.amount; month.set(r.material_id, a); }
    last.set(r.material_id, r.amount / r.qty); // đã sắp xếp theo ngày: giá cuối cùng là gần nhất
  });
  return (id) => {
    const a = month.get(id);
    if (a && a.q > 0) return { price: a.v / a.q, source: 'Mua trong tháng' };
    if (last.has(id)) return { price: last.get(id), source: 'Lần mua gần nhất' };
    const c = nz((materials.get(id) || {}).unit_cost);
    return c > 0 ? { price: c, source: 'Giá file định lượng' } : { price: 0, source: 'Chưa có giá' };
  };
}

async function loadMaterials(db, branchId) {
  const rows = (await db.query(`
    SELECT rm.material_id, rm.material_name, rm.unit_purchase, rm.unit_recipe, rm.conversion_rate, rm.unit_cost, rm.normalized_name
    FROM raw_materials rm
    WHERE rm.is_active IS NOT FALSE AND rm.is_merged IS NOT TRUE
      AND (EXISTS (SELECT 1 FROM bill_of_materials b WHERE b.material_id = rm.material_id AND b.branch_id = $1)
           OR EXISTS (SELECT 1 FROM stock_code_map sm WHERE sm.material_id = rm.material_id AND sm.branch_id = $1))`, [branchId])).rows;
  return new Map(rows.map((r) => [r.material_id, r]));
}

const CONV_SQL = 'CASE WHEN rm.conversion_rate > 0 THEN rm.conversion_rate ELSE 1 END';

// Tiêu hao theo tháng của mọi NVL (đơn vị mua): từ món bán x định lượng + hàng bán trực tiếp (không có định lượng)
async function usageByMonth(db, branchId, to) {
  const bom = (await db.query(`
    SELECT to_char(s.sale_date, 'YYYY-MM') AS ym, b.material_id, SUM(b.quantity_per_dish * s.quantity_sold / ${CONV_SQL}) AS q
    FROM cukcuk_daily_sales s
    JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id AND m.bom_dish_id IS NOT NULL
    JOIN bill_of_materials b ON b.dish_id = m.bom_dish_id AND b.branch_id = s.branch_id
    JOIN raw_materials rm ON rm.material_id = b.material_id
    WHERE s.branch_id = $1 AND s.sale_date <= $2 GROUP BY 1, 2`, [branchId, to])).rows;
  const direct = (await db.query(`
    SELECT to_char(s.sale_date, 'YYYY-MM') AS ym, m.material_id, SUM(s.quantity_sold) AS q
    FROM cukcuk_daily_sales s
    JOIN stock_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id AND m.material_id IS NOT NULL
    WHERE s.branch_id = $1 AND s.sale_date <= $2
      AND NOT EXISTS (SELECT 1 FROM dish_code_map d WHERE d.branch_id = s.branch_id AND d.cukcuk_code = s.dish_id AND d.bom_dish_id IS NOT NULL)
    GROUP BY 1, 2`, [branchId, to])).rows;
  const out = new Map(); // ym -> Map(material -> {bom, direct})
  const put = (ym, id, key, q) => { if (!out.has(ym)) out.set(ym, new Map()); const m = out.get(ym); const a = m.get(id) || { bom: 0, direct: 0 }; a[key] += nz(q); m.set(id, a); };
  bom.forEach((r) => put(r.ym, r.material_id, 'bom', r.q));
  direct.forEach((r) => put(r.ym, r.material_id, 'direct', r.q));
  return out;
}

// ============ 1. Báo cáo tiêu hao NVL theo tháng ============
async function usageReport(db, branchId, year, month, groupOf) {
  const { from, to } = monthRange(year, month);
  const ym = ymOf(year, month);
  const materials = await loadMaterials(db, branchId);
  const purchases = await purchaseRows(db, branchId, to);
  const priceOf = buildPriceFn(purchases, ym, materials);
  const usage = (await usageByMonth(db, branchId, to)).get(ym) || new Map();

  const lineRows = (await db.query(`
    SELECT b.material_id, m.bom_dish_id AS dish_id, MAX(b.dish_name) AS dish_name,
           SUM(s.quantity_sold)::numeric / COUNT(DISTINCT b.id) AS sold,
           SUM(b.quantity_per_dish * s.quantity_sold)::numeric / COUNT(DISTINCT b.id) AS recipe_total,
           SUM(b.quantity_per_dish * s.quantity_sold / ${CONV_SQL})::numeric / COUNT(DISTINCT b.id) AS qty
    FROM cukcuk_daily_sales s
    JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id AND m.bom_dish_id IS NOT NULL
    JOIN bill_of_materials b ON b.dish_id = m.bom_dish_id AND b.branch_id = s.branch_id
    JOIN raw_materials rm ON rm.material_id = b.material_id
    WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3
    GROUP BY b.material_id, m.bom_dish_id`, [branchId, from, to])).rows;
  const linesByMat = new Map();
  lineRows.forEach((l) => {
    if (!linesByMat.has(l.material_id)) linesByMat.set(l.material_id, []);
    linesByMat.get(l.material_id).push({ dish_id: l.dish_id, dish_name: l.dish_name, sold: nz(l.sold), per_dish: nz(l.sold) > 0 ? nz(l.recipe_total) / nz(l.sold) : 0, qty: nz(l.qty) });
  });

  const rows = [];
  usage.forEach((u, id) => {
    const m = materials.get(id);
    if (!m) return;
    const qty = u.bom + u.direct;
    if (qty <= 0) return;
    const pr = priceOf(id);
    rows.push({
      material_id: id, name: m.material_name, group: groupOf(id), unit: m.unit_purchase || '',
      qty_bom: u.bom, qty_direct: u.direct, qty, price: pr.price, price_source: pr.source, amount: qty * pr.price,
      dishes: (linesByMat.get(id) || []).sort((a, b) => b.qty - a.qty)
    });
  });
  rows.sort((a, b) => b.amount - a.amount);

  // Món bán trong tháng nhưng chưa có định lượng
  const dishes = (await db.query(`
    SELECT s.dish_id AS code, COALESCE(MAX(m.cukcuk_name), MAX(s.dish_name)) AS name, COALESCE(MAX(m.cukcuk_kind), '') AS kind,
           SUM(s.quantity_sold) AS qty, SUM(s.revenue) AS revenue, MAX(m.bom_dish_id) AS bom_dish_id,
           BOOL_OR(bd.dish_id IS NOT NULL) AS has_bom,
           BOOL_OR(sd.cukcuk_code IS NOT NULL) AS is_direct
    FROM cukcuk_daily_sales s
    LEFT JOIN dish_code_map m ON m.branch_id = s.branch_id AND m.cukcuk_code = s.dish_id
    LEFT JOIN (SELECT DISTINCT dish_id FROM bill_of_materials WHERE branch_id = $1) bd ON bd.dish_id = m.bom_dish_id
    LEFT JOIN (SELECT DISTINCT cukcuk_code FROM stock_code_map WHERE branch_id = $1 AND material_id IS NOT NULL) sd ON sd.cukcuk_code = s.dish_id
    WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3
    GROUP BY s.dish_id`, [branchId, from, to])).rows;
  let totalQty = 0; let coveredQty = 0; let totalRev = 0; let missRev = 0;
  const missing = [];
  dishes.forEach((d) => {
    if (d.is_direct && !d.has_bom) return; // hàng bán trực tiếp: tính theo số bán, không cần định lượng
    totalQty += nz(d.qty); totalRev += nz(d.revenue);
    if (d.has_bom) { coveredQty += nz(d.qty); return; }
    missRev += nz(d.revenue);
    missing.push({ code: d.code, name: d.name, kind: d.kind, qty: nz(d.qty), revenue: nz(d.revenue), reason: d.bom_dish_id ? 'Món có trong file định lượng nhưng chưa có dòng NVL' : 'Chưa có trong file định lượng' });
  });
  missing.sort((a, b) => b.qty - a.qty);

  const days = (await db.query('SELECT COUNT(DISTINCT sale_date) AS n FROM cukcuk_daily_sales WHERE branch_id = $1 AND sale_date BETWEEN $2 AND $3', [branchId, from, to])).rows[0];
  const bomInfo = (await db.query('SELECT COUNT(DISTINCT dish_id) AS dishes, MAX(updated_at) AS updated FROM bill_of_materials WHERE branch_id = $1', [branchId])).rows[0];
  return {
    year, month, from, to, rows, missing,
    coverage: { totalQty, coveredQty, pct: totalQty > 0 ? coveredQty / totalQty : null, totalRev, missRev },
    totals: { amount: rows.reduce((a, r) => a + r.amount, 0), noPrice: rows.filter((r) => r.price <= 0).length },
    salesDays: Number(days.n) || 0, bom: { dishes: Number(bomInfo.dishes) || 0, updated: bomInfo.updated }
  };
}

// ============ 2. Xuất - nhập - tồn kho NVL ============
async function stockMovement(db, branchId, year, month, groupOf) {
  const { to } = monthRange(year, month);
  const ym = ymOf(year, month);
  const materials = await loadMaterials(db, branchId);
  const purchases = await purchaseRows(db, branchId, to);
  const usageAll = await usageByMonth(db, branchId, to);
  const opens = (await db.query('SELECT ym, material_id, qty, unit_price, amount, to_char(created_at, \'DD/MM/YYYY HH24:MI\') AS at FROM material_opening_stock WHERE branch_id = $1 AND ym <= $2', [branchId, ym])).rows;

  // tháng bắt đầu chuỗi tính: tháng sớm nhất có số tồn đầu đã tải / phiếu mua / doanh số (tối đa 36 tháng trước)
  const monthsWithData = [...opens.map((r) => r.ym), ...purchases.map((r) => r.ym), ...usageAll.keys()].filter((x) => x <= ym).sort();
  let start = monthsWithData[0] || ym;
  const floor = addMonths(ym, -36);
  if (start < floor) start = floor;

  const inByMonth = new Map(); // ym -> Map(material -> {q, v})
  purchases.forEach((r) => {
    if (!inByMonth.has(r.ym)) inByMonth.set(r.ym, new Map());
    const m = inByMonth.get(r.ym); const a = m.get(r.material_id) || { q: 0, v: 0 }; a.q += r.qty; a.v += r.amount; m.set(r.material_id, a);
  });
  const openByMonth = new Map();
  opens.forEach((r) => { if (!openByMonth.has(r.ym)) openByMonth.set(r.ym, new Map()); openByMonth.get(r.ym).set(r.material_id, { q: nz(r.qty), v: nz(r.amount) || nz(r.qty) * nz(r.unit_price), at: r.at }); });

  const lastPrice = new Map();
  const state = new Map(); // material -> {q, v}
  let result = null; let cur = start;
  for (let guard = 0; guard < 40; guard++) {
    const up = openByMonth.get(cur) || new Map();
    const ins = inByMonth.get(cur) || new Map();
    const outs = usageAll.get(cur) || new Map();
    up.forEach((o, id) => { state.set(id, { q: o.q, v: o.v, uploaded: true }); });
    const ids = new Set([...state.keys(), ...ins.keys(), ...outs.keys()]);
    const rows = [];
    ids.forEach((id) => {
      const m = materials.get(id);
      if (!m) return;
      const st = state.get(id) || { q: 0, v: 0 };
      const inn = ins.get(id) || { q: 0, v: 0 };
      const u = outs.get(id); const outQty = u ? u.bom + u.direct : 0;
      if (inn.q > 0 && inn.v > 0) lastPrice.set(id, inn.v / inn.q);
      const poolQty = st.q + inn.q; const poolVal = st.v + inn.v;
      let avg = poolQty > 0 && poolVal > 0 ? poolVal / poolQty : (lastPrice.get(id) || nz(m.unit_cost));
      const closeQty = poolQty - outQty;
      const closeVal = closeQty * avg;
      rows.push({
        material_id: id, name: m.material_name, group: groupOf(id), unit: m.unit_purchase || '',
        open_qty: st.q, open_price: st.q > 0 ? st.v / st.q : 0, open_amount: st.v, open_src: st.uploaded ? 'Tải file' : 'Chuyển từ kỳ trước',
        in_qty: inn.q, in_price: inn.q > 0 ? inn.v / inn.q : 0, in_amount: inn.v,
        out_qty: outQty, out_price: avg, out_amount: outQty * avg,
        close_qty: closeQty, close_price: avg, close_amount: closeVal
      });
      state.set(id, { q: closeQty, v: closeVal });
    });
    if (cur === ym) {
      result = rows.filter((r) => Math.abs(r.open_qty) > 1e-9 || Math.abs(r.in_qty) > 1e-9 || Math.abs(r.out_qty) > 1e-9 || Math.abs(r.close_qty) > 1e-9 || Math.abs(r.open_amount) > 0.5);
      break;
    }
    cur = addMonths(cur, 1);
  }
  result = (result || []).sort((a, b) => (a.group || '').localeCompare(b.group || '', 'vi') || a.name.localeCompare(b.name, 'vi'));
  const upl = openByMonth.get(ym);
  const sum = (k) => result.reduce((a, r) => a + r[k], 0);
  return {
    year, month, ym, rows: result, startMonth: start,
    opening: { uploaded: upl ? upl.size : 0, uploadedAt: upl ? [...upl.values()][0].at : null, hasAny: opens.length > 0 },
    totals: { open_amount: sum('open_amount'), in_amount: sum('in_amount'), out_amount: sum('out_amount'), close_amount: sum('close_amount') },
    negative: result.filter((r) => r.close_qty < -1e-6).length
  };
}

// ============ File số tồn đầu kỳ ============
function parseOpeningFile(buffer, filename) {
  let rows;
  if (/\.csv$/i.test(filename || '')) rows = String(buffer.toString('utf8')).split(/\r?\n/).map((l) => l.split(/[;,\t]/));
  else {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
  }
  const norm = (c) => normalizeString(c);
  const hIdx = rows.findIndex((r) => r.some((c) => /^ten/.test(norm(c))) && r.some((c) => /soluong|^ton|sl/.test(norm(c))));
  if (hIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề. File cần có các cột: Mã NVL, Tên NVL, ĐVT, Số lượng, Đơn giá, Thành tiền.');
  const h = rows[hIdx].map(norm);
  const find = (re) => h.findIndex((x) => re.test(x));
  const col = { code: find(/^ma/), name: find(/^ten/), unit: find(/donvi|^dvt/), qty: find(/soluong|^ton|^sl/), price: find(/dongia|gia/), amount: find(/thanhtien|giatri/) };
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (k) => (col[k] >= 0 && r[col[k]] !== undefined ? r[col[k]] : '');
    const name = String(cell('name')).trim(); const code = String(cell('code')).trim();
    if (!name && !code) continue;
    let qty = parseNumber(cell('qty')); let price = parseNumber(cell('price')); let amount = parseNumber(cell('amount'));
    if (!amount && qty && price) amount = qty * price;
    if (!price && qty && amount) price = amount / qty;
    out.push({ code, name, unit: String(cell('unit')).trim(), qty, price, amount });
  }
  return out;
}

async function saveOpeningStock(db, branchId, year, month, fileRows) {
  const ym = ymOf(year, month);
  const materials = await loadMaterials(db, branchId);
  const byName = new Map(); materials.forEach((m) => { byName.set(normalizeString(m.material_name), m.material_id); });
  const codeMap = new Map((await db.query('SELECT cukcuk_code, material_id FROM stock_code_map WHERE branch_id = $1 AND material_id IS NOT NULL', [branchId])).rows.map((r) => [normalizeString(r.cukcuk_code), r.material_id]));
  const byCode = new Map(); materials.forEach((m, id) => { byCode.set(normalizeString(id), id); });
  const agg = new Map(); const unmatched = [];
  fileRows.forEach((r) => {
    const id = (r.code && (byCode.get(normalizeString(r.code)) || codeMap.get(normalizeString(r.code)))) || byName.get(normalizeString(r.name));
    if (!id) { unmatched.push(r); return; }
    const a = agg.get(id) || { q: 0, v: 0 }; a.q += r.qty; a.v += r.amount; agg.set(id, a);
  });
  await db.query('DELETE FROM material_opening_stock WHERE branch_id = $1 AND ym = $2', [branchId, ym]);
  for (const [id, a] of agg) {
    await db.query('INSERT INTO material_opening_stock (branch_id, ym, material_id, qty, unit_price, amount) VALUES ($1,$2,$3,$4,$5,$6)',
      [branchId, ym, id, a.q, a.q ? a.v / a.q : 0, a.v]);
  }
  return { ym, saved: agg.size, unmatched };
}

module.exports = { usageReport, stockMovement, parseOpeningFile, saveOpeningStock, monthRange };
