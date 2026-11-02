// Phân loại hàng mua thành 3 nhóm: Đồ ăn (food), Đồ uống (drink), CCDC (ccdc: công cụ dụng cụ, vật tư tiêu hao).
// Dựa vào mã hàng, tên nhóm hàng trong CUKCUK (danh mục tồn kho) và tên hàng.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

const CCDC_CAT = /ccdc|cong cu|dung cu|vat tu|nhom khac|dich vu/;
const DRINK_CAT = /do uong|bia|ruou|soft drink|nuoc ngot|syrup|pha che|nuoc ep|ken\b|tiger|sake|whisky|vang\b/;
const CCDC_NAME = /^(ao |cay canh|bao rac|tui |khay |gang tay|giay ve sinh|khan |nuoc rua|binh co2|binh gas|gas |than$|than |mang pvc|hop dung|bay chuot|bang phien|dung cu|lifebuoy|xa phong|nuoc lau|ban chai|chen |dia |ly |dao |thot |bat |dua )/;

function itemGroupOf(code, name, category) {
  const c = String(code || '').toUpperCase();
  const cat = norm(category);
  const nm = norm(name);
  // 1) mã hàng / nhóm hàng của CCDC
  if (/^(CCDC|CC-|CC[0-9])/.test(c) || CCDC_CAT.test(cat)) return 'ccdc';
  // 2) đồ uống: mã DU hoặc nhóm hàng đồ uống
  if (/^DU[-0-9A-Z]/.test(c) && !/^DUA/.test(c)) return 'drink';
  if (DRINK_CAT.test(cat) && !/gia vi/.test(cat)) return 'drink';
  // 3) hàng chưa có nhóm: đoán theo tên
  if (!cat && CCDC_NAME.test(nm)) return 'ccdc';
  return 'food';
}

// NVL trong app: nhóm hàng (sub_group) 'Đồ uống' / 'CCDC' ưu tiên, còn lại theo mã và tên
function materialGroupOf(code, name, subGroup) {
  const sg = norm(subGroup);
  if (sg === 'ccdc') return 'ccdc';
  if (sg === 'do uong') return 'drink';
  return itemGroupOf(String(code || '').replace(/^CK:/, ''), name, '');
}

const GROUP_LABEL = { food: 'Đồ ăn', drink: 'Đồ uống', ccdc: 'CCDC' };
module.exports = { itemGroupOf, materialGroupOf, GROUP_LABEL };
