// Phân loại hàng mua thành 3 nhóm: Đồ ăn (food), Đồ uống (drink), CCDC (ccdc: công cụ dụng cụ, vật tư tiêu hao).
// Dựa vào mã hàng, tên nhóm hàng trong CUKCUK (danh mục tồn kho) và tên hàng.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

const CCDC_CAT = /ccdc|cong cu|dung cu|vat tu|nhom khac|dich vu/;
const DRINK_CAT = /do uong|bia|ruou|soft drink|nuoc ngot|syrup|pha che|nuoc ep|ken\b|tiger|sake|whisky|vang\b/;
const CCDC_NAME = /^(ao |cay canh|bao rac|tui |khay |gang tay|giay ve sinh|khan |nuoc rua|binh co2|binh gas|gas |than$|than |mang pvc|hop dung|bay chuot|bang phien|dung cu|lifebuoy|xa phong|nuoc lau|ban chai|chen |dia |ly |dao |thot |bat )/;

function itemGroupOf(code, name, category) {
  const c = String(code || '').toUpperCase();
  const cat = norm(category);
  const nm = norm(name);
  // 1) mã hàng / nhóm hàng của CCDC
  if (/^(CCDC|CC-)/.test(c) || CCDC_CAT.test(cat)) return 'ccdc';
  // 2) đồ uống: mã DU hoặc nhóm hàng đồ uống
  if (/^DU[-0-9A-Z]/.test(c) && !/^DUA/.test(c)) return 'drink';
  if (DRINK_CAT.test(cat) && !/gia vi/.test(cat)) return 'drink';
  // 3) hàng chưa có nhóm: đoán theo tên
  if (!cat && CCDC_NAME.test(nm)) return 'ccdc';
  return 'food';
}

// NVL trong app: nhóm hàng (sub_group) 'Đồ uống' / 'CCDC' ưu tiên; còn lại theo MÃ + TÊN HÀNG + NHÓM HÀNG của mặt hàng CUKCUK đã ghép
// (ngữ cảnh nạp bằng warmGroupContext để cùng một mặt hàng luôn ra cùng một nhóm ở mọi tab).
const ctxCache = new Map(); // branchId -> { at, map: material_id -> { code, cat } }
async function warmGroupContext(db, branchId) {
  const c = ctxCache.get(branchId);
  if (c && Date.now() - c.at < 60000) return;
  const rows = (await db.query(`
    SELECT m.material_id, m.cukcuk_code,
           (SELECT sd.category_name FROM cukcuk_stock_daily sd WHERE sd.branch_id = m.branch_id AND sd.item_code = m.cukcuk_code AND COALESCE(sd.category_name, '') <> '' ORDER BY sd.stock_date DESC LIMIT 1) AS cat
    FROM stock_code_map m WHERE m.branch_id = $1 AND m.material_id IS NOT NULL`, [branchId])).rows;
  const map = new Map();
  rows.forEach((r) => { const cur = map.get(r.material_id); if (!cur || (!cur.cat && r.cat)) map.set(r.material_id, { code: r.cukcuk_code, cat: r.cat || '' }); });
  ctxCache.set(branchId, { at: Date.now(), map });
}
function materialGroupOf(code, name, subGroup, branchId) {
  const sg = norm(subGroup);
  if (sg === 'ccdc') return 'ccdc';
  if (sg === 'do uong') return 'drink';
  const id = String(code || '').replace(/^CK:/, '');
  const c = branchId ? ctxCache.get(branchId) : null;
  const info = c ? c.map.get(id) : null;
  return itemGroupOf(info ? info.code : id, name, info ? info.cat : '');
}

const GROUP_LABEL = { food: 'Đồ ăn', drink: 'Đồ uống', ccdc: 'CCDC' };
module.exports = { itemGroupOf, materialGroupOf, warmGroupContext, GROUP_LABEL };
