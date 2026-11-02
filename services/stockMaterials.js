// Đưa toàn bộ NVL / hàng hóa trong tồn kho CUKCUK (và hàng đã mua) vào danh mục NVL của app để lập kế hoạch mua,
// kể cả hàng không có bán trong tháng. Ghép với NVL có sẵn theo TÊN khi mã CUKCUK khác mã trong app; chưa có thì tạo NVL mới.
// Cho phép tạo mã hàng mới để mua (đồng bộ với CUKCUK theo tên khi CUKCUK có hàng cùng tên nhưng khác mã).

const { itemGroupOf } = require('./itemGroup');

function placement(deps, code, name, categoryName) {
  const { categorize, subGroupOf } = deps;
  const g = itemGroupOf(code, name, categoryName);
  if (g === 'drink' || g === 'ccdc') return { group: g, category: 'DRY_GOODS', cycle: 'WEEKLY_7DAYS', sub: g === 'drink' ? 'Đồ uống' : 'CCDC', waste: 0, shelf: 30 };
  const c = categorize(code, name);
  return { group: 'food', category: c.code, cycle: c.purchase_cycle, sub: subGroupOf(c.code, name), waste: c.waste_percentage || 0, shelf: c.shelf_life_days || 30 };
}

async function insertMaterial(db, deps, m) {
  const p = m.place;
  const norm = deps.normalizeString(m.name);
  await db.query(`
    INSERT INTO raw_materials (material_id, material_name, normalized_name, category, category_group, purchase_cycle, unit_recipe, unit_purchase,
      conversion_rate, unit_cost, lead_time_days, waste_rate, shelf_life_days, is_auto_created, is_active, sub_group, price_source)
    VALUES ($1,$2,$3,$4,$4,$5,$6,$6,1,$7,$8,$9,$10,FALSE,TRUE,$11,$12)`,
  [m.id, m.name.substring(0, 255), norm.substring(0, 255), p.category, p.cycle, (m.unit || 'cái').substring(0, 20), Math.max(0, Number(m.price) || 0),
    p.cycle === 'FRESH_3DAYS' ? 1 : 3, p.waste, p.shelf, p.sub, Number(m.price) > 0 ? 'FILE' : 'MISSING']);
}

async function upsertMap(db, branchId, code, name, unit, materialId, type, score) {
  await db.query(`
    INSERT INTO stock_code_map (branch_id, cukcuk_code, cukcuk_name, unit_name, material_id, match_type, match_score)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (branch_id, cukcuk_code) DO UPDATE SET cukcuk_name = EXCLUDED.cukcuk_name, unit_name = EXCLUDED.unit_name,
      material_id = EXCLUDED.material_id, match_type = EXCLUDED.match_type, match_score = EXCLUDED.match_score, updated_at = NOW()`,
  [branchId, String(code).substring(0, 100), String(name || '').substring(0, 255), String(unit || '').substring(0, 30), materialId, type, score]);
}

async function syncStockMaterials(db, branchId, deps) {
  const { normalizeString, matchDish } = deps;
  const items = new Map();
  (await db.query(`SELECT DISTINCT ON (item_code) item_code, item_name, category_name, unit_name FROM cukcuk_stock_daily
    WHERE branch_id = $1 AND COALESCE(item_name, '') <> '' ORDER BY item_code, stock_date DESC`, [branchId])).rows
    .forEach((r) => items.set(r.item_code, { code: r.item_code, name: String(r.item_name).trim(), cat: r.category_name || '', unit: r.unit_name || '', price: 0 }));
  (await db.query(`SELECT DISTINCT ON (item_code) item_code, item_name, unit_name, unit_price FROM supplier_purchases
    WHERE branch_id = $1 AND COALESCE(item_name, '') <> '' ORDER BY item_code, purchase_date DESC`, [branchId])).rows
    .forEach((r) => {
      const cur = items.get(r.item_code);
      if (cur) { cur.price = Number(r.unit_price) || 0; if (!cur.unit) cur.unit = r.unit_name || ''; } else items.set(r.item_code, { code: r.item_code, name: String(r.item_name).trim(), cat: '', unit: r.unit_name || '', price: Number(r.unit_price) || 0 });
    });
  const maps = new Map((await db.query('SELECT cukcuk_code, material_id, match_type FROM stock_code_map WHERE branch_id = $1', [branchId])).rows.map((r) => [r.cukcuk_code, r]));
  const mats = (await db.query('SELECT material_id, material_name, normalized_name FROM raw_materials WHERE is_active IS NOT FALSE AND is_merged IS NOT TRUE')).rows;
  const byNorm = new Map();
  mats.forEach((m) => { if (!byNorm.has(m.normalized_name)) byNorm.set(m.normalized_name, m.material_id); });
  const ids = new Set(mats.map((m) => m.material_id));
  const fuzzyList = mats.map((m) => ({ dish_id: m.material_id, dish_name: m.material_name }));
  let mapped = 0; let created = 0; let kept = 0;
  const newMats = []; const mapRows = [];

  for (const it of items.values()) {
    const cur = maps.get(it.code);
    if (cur && cur.material_id) { kept += 1; continue; }
    if (cur && cur.match_type === 'MANUAL') continue; // người dùng đã chủ động bỏ ghép
    const norm = normalizeString(it.name);
    let target = byNorm.get(norm) || null;
    let type = 'NAME'; let score = 1;
    if (!target) {
      const m = matchDish(it.name, fuzzyList, { minContain: 2 });
      if (m && m.score >= 0.92) { target = m.dishId; type = m.type || 'FUZZY'; score = m.score; }
    }
    if (!target) {
      let id = it.code.substring(0, 50);
      if (ids.has(id)) id = `${branchId}_${it.code}`.substring(0, 50);
      if (ids.has(id)) continue;
      newMats.push({ id, name: it.name, unit: it.unit, price: it.price, place: placement(deps, it.code, it.name, it.cat) });
      ids.add(id); byNorm.set(norm, id); fuzzyList.push({ dish_id: id, dish_name: it.name });
      target = id; type = 'NEW'; score = 1; created += 1;
    } else mapped += 1;
    mapRows.push({ code: it.code, name: it.name, unit: it.unit, target, type, score });
  }

  // ghi hàng loạt (nhanh hơn từng dòng khi CSDL ở xa)
  const CH = 300;
  for (let i = 0; i < newMats.length; i += CH) {
    const c = newMats.slice(i, i + CH);
    await db.query(`
      INSERT INTO raw_materials (material_id, material_name, normalized_name, category, category_group, purchase_cycle, unit_recipe, unit_purchase,
        conversion_rate, unit_cost, lead_time_days, waste_rate, shelf_life_days, is_auto_created, is_active, sub_group, price_source)
      SELECT t.id, t.name, t.norm, t.cat, t.cat, t.cycle, t.unit, t.unit, 1, t.price, t.lead, t.waste, t.shelf, FALSE, TRUE, t.sub, t.src
      FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::numeric[], $8::int[], $9::numeric[], $10::int[], $11::text[], $12::text[])
        AS t(id, name, norm, cat, cycle, unit, price, lead, waste, shelf, sub, src)
      ON CONFLICT (material_id) DO NOTHING`,
    [c.map((m) => m.id), c.map((m) => m.name.substring(0, 255)), c.map((m) => normalizeString(m.name).substring(0, 255)), c.map((m) => m.place.category), c.map((m) => m.place.cycle),
      c.map((m) => (m.unit || 'cái').substring(0, 20)), c.map((m) => Math.max(0, Number(m.price) || 0)), c.map((m) => (m.place.cycle === 'FRESH_3DAYS' ? 1 : 3)),
      c.map((m) => m.place.waste), c.map((m) => m.place.shelf), c.map((m) => m.place.sub), c.map((m) => (Number(m.price) > 0 ? 'FILE' : 'MISSING'))]);
  }
  for (let i = 0; i < mapRows.length; i += CH) {
    const c = mapRows.slice(i, i + CH);
    await db.query(`
      INSERT INTO stock_code_map (branch_id, cukcuk_code, cukcuk_name, unit_name, material_id, match_type, match_score)
      SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::numeric[])
      ON CONFLICT (branch_id, cukcuk_code) DO UPDATE SET cukcuk_name = EXCLUDED.cukcuk_name, unit_name = EXCLUDED.unit_name,
        material_id = EXCLUDED.material_id, match_type = EXCLUDED.match_type, match_score = EXCLUDED.match_score, updated_at = NOW()`,
    [branchId, c.map((m) => String(m.code).substring(0, 100)), c.map((m) => String(m.name || '').substring(0, 255)), c.map((m) => String(m.unit || '').substring(0, 30)),
      c.map((m) => m.target), c.map((m) => m.type), c.map((m) => Number(m.score) || 0)]);
  }
  return { total: items.size, kept, mapped, created };
}

// Tạo mã hàng mới để mua (không cần có trong CUKCUK). Nếu tên đã có trong hệ thống thì dùng lại, không tạo trùng.
async function createPurchaseItem(db, deps, p) {
  const { normalizeString } = deps;
  const branchId = p.branchId;
  const name = String(p.name || '').trim();
  if (!name) throw Object.assign(new Error('Thiếu tên hàng'), { status: 400 });
  const norm = normalizeString(name);
  const dup = (await db.query('SELECT material_id, material_name, unit_purchase FROM raw_materials WHERE normalized_name = $1 AND is_active IS NOT FALSE AND is_merged IS NOT TRUE LIMIT 1', [norm])).rows[0];
  if (dup) {
    const has = (await db.query('SELECT 1 FROM stock_code_map WHERE branch_id = $1 AND material_id = $2 LIMIT 1', [branchId, dup.material_id])).rowCount
      || (await db.query('SELECT 1 FROM bill_of_materials WHERE branch_id = $1 AND material_id = $2 LIMIT 1', [branchId, dup.material_id])).rowCount;
    if (has) throw Object.assign(new Error(`Hàng này đã có: ${dup.material_name} (mã ${dup.material_id})`), { status: 409, data: dup });
    await upsertMap(db, branchId, dup.material_id, dup.material_name, dup.unit_purchase, dup.material_id, 'MANUAL', 1);
    return { existing: true, material_id: dup.material_id, material_name: dup.material_name, unit_purchase: dup.unit_purchase };
  }
  let code = String(p.code || '').trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, '').substring(0, 40);
  if (code) {
    if ((await db.query('SELECT 1 FROM raw_materials WHERE material_id = $1', [code])).rowCount) throw Object.assign(new Error(`Mã ${code} đã tồn tại, hãy chọn mã khác`), { status: 409 });
  } else {
    const mx = (await db.query("SELECT COALESCE(MAX(substring(material_id from 3)::int), 0) AS n FROM raw_materials WHERE material_id ~ '^MH[0-9]+$'")).rows[0].n;
    code = 'MH' + String(Number(mx) + 1).padStart(5, '0');
  }
  const base = placement(deps, code, name, '');
  const g = ['food', 'drink', 'ccdc'].includes(p.group) ? p.group : base.group;
  const place = g === base.group ? base : (g === 'food' ? placement(deps, 'NVL', name, '') : { group: g, category: 'DRY_GOODS', cycle: 'WEEKLY_7DAYS', sub: g === 'drink' ? 'Đồ uống' : 'CCDC', waste: 0, shelf: 30 });
  if (p.cycle === 'FRESH_3DAYS' || p.cycle === 'WEEKLY_7DAYS') place.cycle = p.cycle;
  const unit = String(p.unit || 'kg').trim() || 'kg';
  await insertMaterial(db, deps, { id: code, name, unit, price: p.price, place });
  await upsertMap(db, branchId, code, name, unit, code, 'MANUAL', 1);
  return { existing: false, material_id: code, material_name: name, unit_purchase: unit, sub_group: place.sub, purchase_cycle: place.cycle };
}

module.exports = { syncStockMaterials, createPurchaseItem };
