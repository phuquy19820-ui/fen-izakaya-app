const XLSX = require('xlsx');
const { MATERIAL_CATEGORIES, classifyMaterial } = require('./materialClassificationService');

function normalizeString(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

// Hiểu số kiểu Việt Nam: "40,00" -> 40 ; "4.532" -> 4532 ; "12.859,60" -> 12859.6
function parseNumber(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function parseCsvText(text) {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  const sample = lines.slice(0, 10).join('\n');
  const delim = (sample.match(/;/g) || []).length >= (sample.match(/,/g) || []).length ? ';' : ',';
  return lines.map(line => {
    const cells = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote;
      } else if (ch === delim && !inQuote) {
        cells.push(cur); cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function loadRows(fileBuffer, filename) {
  if (/\.csv$/i.test(filename || '')) {
    return parseCsvText(fileBuffer.toString('utf8'));
  }
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true });
    if (rows.some(r => r.some(c => normalizeString(c) === 'mamon'))) return rows;
  }
  return [];
}

// Từ khóa (có dấu) theo thứ tự ưu tiên: gia vị/sốt đứng trước để "Bột ớt", "Sốt cà chua" không bị xếp vào rau.
const NAME_RULES = [
  ['FROZEN', ['đông lạnh', 'frozen']],
  ['SPICE_DRY', ['bột', 'tiêu', 'muối', 'đường', 'nanami', 'mù tạt', 'wasabi', 'gia vị', 'hạt nêm', 'bột ngọt', 'mì chính']],
  ['SAUCE_CONDIMENT', ['sốt', 'tương', 'mayo', 'nước chấm', 'giấm', 'mirin', 'sake', 'nước mắm', 'dầu hào', 'tương ớt', 'ketchup']],
  ['DRY_GOODS', ['dầu ăn', 'dầu', 'khô', 'gạo', 'mì', 'bún', 'miến', 'rượu', 'bia', 'nước ngọt', 'trà', 'cà phê']],
  ['VEGETABLE', ['nấm']],
  ['SEAFOOD', ['cá', 'tôm', 'mực', 'cua', 'ghẹ', 'hàu', 'sò', 'nghêu', 'ốc', 'lươn', 'sứa', 'bạch tuộc', 'ebiko', 'mentaiko', 'caviar', 'surimi', 'chả cá', 'kani', 'hải sản', 'tép']],
  ['FRESH_MEAT', ['thịt', 'bò', 'heo', 'lợn', 'gà', 'vịt', 'sườn', 'ba rọi', 'ba chỉ', 'bacon', 'xúc xích', 'nạm', 'gân', 'lưỡi', 'dồi', 'phèo', 'pate', 'xá xíu', 'jambon', 'giò', 'trứng']],
  ['HERB_SEASONING', ['ngò', 'tía tô', 'húng', 'thơm', 'rau mùi', 'hành lá', 'kinh giới', 'diếp cá', 'lá chanh', 'lá lốt', 'lá cà ri', 'rau răm', 'lá nguyệt quế']],
  ['VEGETABLE', ['rau', 'cải', 'cà chua', 'cà rốt', 'cà tím', 'cà pháo', 'cà', 'khoai', 'nấm', 'hành', 'tỏi', 'ớt', 'măng', 'bắp', 'dưa', 'bí', 'su', 'xà lách', 'gừng', 'sả', 'tắc', 'chanh', 'giá', 'đậu', 'củ', 'bầu', 'mướp', 'hẹ', 'tây', 'quả', 'trái', 'khế', 'me', 'chuối', 'xoài', 'dứa', 'cam', 'táo']]
];

const PRICE_CEILING_PER_KG = {
  FRESH_MEAT: 1200000,
  SEAFOOD: 1500000,
  VEGETABLE: 600000,
  HERB_SEASONING: 300000,
  SPICE_DRY: 1000000,
  DRY_GOODS: 1500000,
  FROZEN: 1000000,
  SAUCE_CONDIMENT: 600000
};

// Nhóm chi tiết (thịt gà, thịt heo, gia vị…) để lọc trong kế hoạch mua. Luật xếp theo nhóm lớn đã phân loại.
const SUB_RULES = {
  VAT_TU: ['than', 'lá chuối', 'giấy', 'túi', 'găng', 'khăn', 'tăm', 'ống hút'],
  SUA_KEM: ['bơ lạt', 'kem', 'whipping', 'phô mai', 'phômai', 'sữa', 'cream', 'cheese', 'butter'],
  TRUNG: ['trứng'],
  THIT_BO: ['bò', 'nạm', 'wagyu', 'fuji', 'tomahawk', 'ribeye', 'gyutan', 'sancho'],
  THIT_HEO: ['heo', 'lợn', 'ba rọi', 'ba chỉ', 'sườn', 'bacon', 'baycon', 'giò', 'xá xíu', 'nọng', 'dồi', 'phèo', 'xúc xích', 'lòng', 'bao tử', 'tai', 'tộc'],
  THIT_GA: ['gà', 'vịt', 'ngan', 'cánh', 'sụn', 'mề', 'tim'],
  TOM_MUC: ['tôm', 'mực', 'cua', 'ghẹ', 'hàu', 'sò', 'nghêu', 'ốc', 'bạch tuộc', 'tuột', 'sứa', 'tép', 'ebiko', 'mentaiko', 'surimi', 'kani', 'tako', 'mưc'],
  CA: ['cá', 'lươn', 'saba', 'sashimi', 'hamachi', 'tuna'],
  NAM: ['nấm'],
  TRAI_CAY: ['quả', 'trái', 'chanh', 'cam', 'táo', 'xoài', 'dứa', 'chuối', 'khế', 'me', 'nho', 'đào', 'mận', 'lê', 'dừa', 'bơ'],
  TUOI_GIA_VI: ['hành', 'tỏi', 'gừng', 'sả', 'ớt', 'riềng', 'nghệ', 'tắc', 'quất'],
  BOT: ['bột'],
  GIA_VI: ['tiêu', 'muối', 'đường', 'nanami', 'mù tạt', 'wasabi', 'gia vị', 'hạt nêm', 'bột ngọt', 'mì chính', 'mè', 'vừng', 'cà ri', 'quế', 'hồi', 'ngũ vị', 'tomyum', 'ớt', 'tỏi', 'hành', 'knorr', 'hạt ngò'],
  SOT: ['sốt', 'tương', 'mayo', 'mayonnaise', 'nước chấm', 'giấm', 'mirin', 'sake', 'nước mắm', 'mắm', 'dầu hào', 'ketchup', 'miso', 'nước dùng', 'kewpie', 'sauce', 'dấm'],
  DAU_AN: ['dầu', 'mỡ'],
  DO_UONG: ['bia', 'rượu', 'nước ngọt', 'nước suối', 'trà', 'cà phê', 'soda', 'nước ép', 'sữa'],
  TINH_BOT: ['gạo', 'mì', 'bún', 'miến', 'bánh', 'cơm', 'udon', 'ramen', 'phở', 'nui'],
  RAU_CU: ['rau', 'cải', 'cà', 'khoai', 'bắp', 'dưa', 'bí', 'su', 'xà lách', 'củ', 'bầu', 'mướp', 'hẹ', 'đậu', 'măng', 'rong', 'tảo']
};
const SUB_LABELS = {
  VAT_TU: 'Vật tư & khác', SUA_KEM: 'Bơ, sữa, kem & phô mai', TRUNG: 'Trứng', THIT_BO: 'Thịt bò', THIT_HEO: 'Thịt heo', THIT_GA: 'Thịt gà & vịt', TOM_MUC: 'Tôm, mực & nhuyễn thể',
  CA: 'Cá', NAM: 'Nấm', TRAI_CAY: 'Trái cây', TUOI_GIA_VI: 'Hành, tỏi, gừng, ớt', BOT: 'Bột & tinh bột', GIA_VI: 'Gia vị',
  SOT: 'Sốt & nước chấm', DAU_AN: 'Dầu ăn & mỡ', DO_UONG: 'Đồ uống & rượu', TINH_BOT: 'Mì, gạo & bánh', RAU_CU: 'Rau củ',
  THAO_MOC: 'Thảo mộc', THIT_KHAC: 'Thịt khác', HAI_SAN_KHAC: 'Hải sản khác', HANG_KHO_KHAC: 'Hàng khô khác', DONG_LANH_KHAC: 'Đông lạnh khác'
};
const SUB_ORDER_BY_CATEGORY = {
  FRESH_MEAT: ['VAT_TU', 'TRUNG', 'THIT_BO', 'THIT_HEO', 'THIT_GA', 'TOM_MUC', 'CA', 'RAU_CU'],
  SEAFOOD: ['VAT_TU', 'TOM_MUC', 'CA'],
  VEGETABLE: ['VAT_TU', 'NAM', 'TUOI_GIA_VI', 'RAU_CU', 'TRAI_CAY'],
  SPICE_DRY: ['VAT_TU', 'GIA_VI', 'BOT'],
  DRY_GOODS: ['VAT_TU', 'DAU_AN', 'DO_UONG', 'SUA_KEM', 'TINH_BOT', 'GIA_VI', 'SOT', 'TOM_MUC', 'CA'],
  FROZEN: ['VAT_TU', 'TOM_MUC', 'CA', 'THIT_BO', 'THIT_HEO', 'THIT_GA', 'RAU_CU']
};
const SUB_DEFAULT_BY_CATEGORY = {
  FRESH_MEAT: 'THIT_KHAC', SEAFOOD: 'HAI_SAN_KHAC', VEGETABLE: 'RAU_CU', HERB_SEASONING: 'THAO_MOC',
  SPICE_DRY: 'GIA_VI', SAUCE_CONDIMENT: 'SOT', DRY_GOODS: 'HANG_KHO_KHAC', FROZEN: 'DONG_LANH_KHAC'
};

function subGroupOf(categoryCode, name) {
  const text = ' ' + String(name || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  for (const key of SUB_ORDER_BY_CATEGORY[categoryCode] || []) {
    if (SUB_RULES[key].some(w => text.includes(' ' + w + ' '))) return SUB_LABELS[key];
  }
  return SUB_LABELS[SUB_DEFAULT_BY_CATEGORY[categoryCode] || 'HANG_KHO_KHAC'];
}

function categorize(code, name) {
  const upper = String(code || '').toUpperCase();
  const text = ' ' + String(name || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
  const matchRule = () => {
    for (const [key, words] of NAME_RULES) {
      if (words.some(w => text.includes(' ' + w + ' '))) return key;
    }
    return null;
  };
  const byName = matchRule();
  let key;
  if (upper.startsWith('TH')) key = 'FRESH_MEAT';
  else if (upper.startsWith('HS')) key = 'SEAFOOD';
  else if (upper.startsWith('RC')) key = byName === 'HERB_SEASONING' ? 'HERB_SEASONING' : 'VEGETABLE';
  else if (upper.startsWith('GBB')) {
    key = ['SPICE_DRY', 'SAUCE_CONDIMENT', 'FROZEN'].includes(byName) ? byName : 'DRY_GOODS';
  } else key = byName || classifyMaterial(name).code;
  return MATERIAL_CATEGORIES[key];
}

function autoDetectCategory(materialCode, materialName) {
  const c = categorize(materialCode, materialName);
  return { group: c.code, cycle: c.purchase_cycle };
}

async function parseAndSaveBOM(fileBuffer, branchId, db, filename) {
  const rows = loadRows(fileBuffer, filename);
  const headerIdx = rows.findIndex(r => r.some(c => normalizeString(c) === 'mamon'));
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề "Mã món (*)". Hãy tải đúng file định lượng (khuyến nghị dùng file .xlsx gốc).');
  }

  const header = rows[headerIdx].map(normalizeString);
  const find = (pred, from = 0) => { for (let i = from; i < header.length; i++) if (pred(header[i])) return i; return -1; };
  const col = {
    type: find(h => h.startsWith('loai')),
    dishCode: find(h => h === 'mamon'),
    dishName: find(h => h === 'tenmon'),
    dishUnit: find(h => h === 'donvitinh'),
    price: find(h => h === 'giaban'),
    matCode: find(h => h === 'manvl'),
    matName: find(h => h === 'tennvl'),
    qty: find(h => h.startsWith('soluong')),
    unitPrice: find(h => h.startsWith('dongia'))
  };
  col.matUnit = col.dishUnit >= 0 ? find(h => h === 'donvitinh', col.dishUnit + 1) : -1;
  const missing = Object.entries(col).filter(([k, v]) => v === -1 && k !== 'unitPrice' && k !== 'price').map(([k]) => k);
  if (missing.length) throw new Error('File thiếu cột bắt buộc: ' + missing.join(', '));

  await db.query('DELETE FROM bill_of_materials WHERE branch_id = $1', [branchId]);

  const summary = { totalDishes: 0, totalMaterials: 0, newMaterialsCreated: 0, byCategory: {} };
  const knownMaterials = new Map();
  const priceLists = new Map();
  const dishNamesByCode = new Map();
  const bomRows = [];
  let currentDish = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const cell = (idx) => (idx >= 0 && row[idx] !== undefined && row[idx] !== null ? row[idx] : '');
    const dishType = String(cell(col.type)).trim();
    const dishCode = String(cell(col.dishCode)).trim();

    if (dishType && dishCode && !dishCode.startsWith('#')) {
      const dishName = String(cell(col.dishName)).trim() || dishCode;
      // Một mã món đôi khi bị dùng cho hai món khác tên: tách thành món riêng để không gộp nhầm định lượng.
      const nameKey = normalizeString(dishName);
      const seenNames = dishNamesByCode.get(dishCode) || [];
      let idx = seenNames.indexOf(nameKey);
      if (idx === -1) {
        seenNames.push(nameKey);
        idx = seenNames.length - 1;
        dishNamesByCode.set(dishCode, seenNames);
        summary.totalDishes++;
      }
      currentDish = {
        id: idx === 0 ? dishCode : dishCode + '~' + (idx + 1),
        name: dishName,
        unit: String(cell(col.dishUnit)).trim() || 'Phần',
        price: parseNumber(cell(col.price))
      };
    }

    const matName = String(cell(col.matName)).trim();
    const quantity = parseNumber(cell(col.qty));
    if (!currentDish || !matName || quantity <= 0) continue;

    const normName = normalizeString(matName);
    let matCode = String(cell(col.matCode)).trim();
    if (!matCode || matCode.startsWith('#')) matCode = 'RAW_' + normName.substring(0, 20).toUpperCase();
    matCode = matCode.substring(0, 50);

    if (!knownMaterials.has(matCode)) {
      const recipeUnit = String(cell(col.matUnit)).trim() || 'gr';
      const lowerUnit = recipeUnit.toLowerCase();
      const isWeight = ['gr', 'g', 'gram', 'gam'].includes(lowerUnit);
      const isVolume = ['ml', 'mililit'].includes(lowerUnit);
      const purchaseUnit = isWeight ? 'kg' : (isVolume ? 'lít' : recipeUnit);
      const conversionRate = (isWeight || isVolume) ? 1000 : 1;
      const cat = categorize(matCode, matName);
      const unitCost = Math.round(parseNumber(cell(col.unitPrice)) * conversionRate);
      const leadTime = cat.purchase_cycle === 'FRESH_3DAYS' ? 1 : 3;

      const res = await db.query(`
        INSERT INTO raw_materials
          (material_id, material_name, normalized_name, category, category_group, purchase_cycle,
           unit_recipe, unit_purchase, conversion_rate, unit_cost, lead_time_days, waste_rate,
           shelf_life_days, is_auto_created, is_active, sub_group)
        VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,TRUE,$13)
        ON CONFLICT (material_id) DO UPDATE SET
          unit_cost = CASE WHEN raw_materials.price_source = 'MANUAL' THEN raw_materials.unit_cost WHEN EXCLUDED.unit_cost > 0 THEN EXCLUDED.unit_cost ELSE raw_materials.unit_cost END,
          sub_group = EXCLUDED.sub_group,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [matCode, matName.substring(0, 255), normName.substring(0, 255), cat.code, cat.purchase_cycle,
        recipeUnit.substring(0, 20), purchaseUnit.substring(0, 20), conversionRate, unitCost, leadTime,
        cat.waste_percentage, cat.shelf_life_days, subGroupOf(cat.code, matName)]);

      knownMaterials.set(matCode, { cat: cat.code, conv: conversionRate });
      if (res.rows[0].inserted) {
        summary.newMaterialsCreated++;
        summary.byCategory[cat.code] = (summary.byCategory[cat.code] || 0) + 1;
      }
    }

    const rowPrice = parseNumber(cell(col.unitPrice));
    if (rowPrice > 0) {
      if (!priceLists.has(matCode)) priceLists.set(matCode, []);
      priceLists.get(matCode).push(rowPrice);
    }

    bomRows.push([branchId, currentDish.id, currentDish.name.substring(0, 255), currentDish.unit.substring(0, 20),
      currentDish.price, matCode, quantity]);
    summary.totalMaterials++;
  }

  // Đơn giá trong file định lượng có chỗ sai (vd. giá 1 cái/con nhưng ghi theo gr). Đối chiếu với trần giá thị trường
  // (đ/kg hoặc đ/lít, giá bán buôn nhà hàng tại Hà Nội) theo nhóm hàng để loại giá bất hợp lý.
  for (const [code, info] of knownMaterials) {
    const prices = (priceLists.get(code) || []).slice().sort((a, b) => a - b);
    if (prices.length === 0) {
      await db.query("UPDATE raw_materials SET unit_cost = 0, price_source = 'MISSING' WHERE material_id = $1 AND COALESCE(price_source, '') <> 'MANUAL'", [code]);
      continue;
    }
    const pick = (list) => list[Math.floor((list.length - 1) / 2)];
    const ceiling = PRICE_CEILING_PER_KG[info.cat] || 1500000;
    const plausible = info.conv > 1 ? prices.filter(p => p * info.conv <= ceiling) : prices;
    if (plausible.length > 0) {
      const price = pick(plausible);
      const source = plausible.length < prices.length ? 'MEDIAN' : 'FILE';
      await db.query("UPDATE raw_materials SET unit_cost = ROUND($2 * conversion_rate), price_source = $3 WHERE material_id = $1 AND COALESCE(price_source, '') <> 'MANUAL'", [code, price, source]);
    } else {
      // Mọi dòng đều có giá quy ra kg vượt trần thị trường: đó là giá theo cái/con, tính theo cái thay vì theo kg.
      await db.query("UPDATE raw_materials SET unit_cost = ROUND($2), conversion_rate = 1, unit_purchase = 'cái', price_source = 'PER_PIECE' WHERE material_id = $1 AND COALESCE(price_source, '') <> 'MANUAL'", [code, pick(prices)]);
    }
  }

  const CHUNK = 500;
  for (let i = 0; i < bomRows.length; i += CHUNK) {
    const chunk = bomRows.slice(i, i + CHUNK);
    const params = [];
    const values = chunk.map((r, k) => {
      params.push(...r);
      const o = k * 7;
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`;
    });
    await db.query(`
      INSERT INTO bill_of_materials (branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish)
      VALUES ${values.join(',')}
    `, params);
  }

  summary.totalMaterialRows = summary.totalMaterials;
  summary.uniqueMaterials = knownMaterials.size;
  return summary;
}

module.exports = { parseAndSaveBOM, autoDetectCategory, categorize, subGroupOf, normalizeString, parseNumber };
