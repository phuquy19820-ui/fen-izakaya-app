// Quy tắc tính dự kiến mua đồ uống theo số lượng bán (không cần định lượng).
//  UNIT   : bán nguyên chai/lon -> mua đúng số lượng bán.
//  VOLUME : bán theo ly/phần quy ra ml lấy từ chai/thùng (vd. Sapporo 500ml/ly, vang 100ml/ly, tháp 3L).
//  MIXED  : đồ pha chế, tính 10ml nguyên liệu cho 1 ly (có thể sửa).

const norm = (s) => ' ' + String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
const has = (t, words) => words.some((w) => t.includes(' ' + w + ' ') || t.includes(w));

function parseSizeMl(name) {
  const m = String(name || '').match(/(\d+(?:[.,]\d+)?)\s*(ml|l)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(',', '.'));
  return /^l$/i.test(m[2]) ? Math.round(v * 1000) : Math.round(v);
}

function categoryOf(t) {
  if (has(t, ['bia', 'beer', 'sapporo', 'tiger', 'heineken', 'heneiken', 'saigon'])) return 'Bia';
  if (has(t, ['vang', 'wine'])) return 'Rượu vang';
  if (has(t, ['sake', 'rượu', 'ruou', 'soju', 'whisky', 'sochu', 'umeshu', 'jinro', 'hibiki', 'nigori', 'dassai', 'kubota', 'hakkaisan', 'mơ', 'gin', 'roku', 'sui'])) return 'Rượu & Sake';
  if (has(t, ['pepsi', 'coke', 'sprite', 'tonic', 'soda', 'nước ngọt', 'nước suối', 'vikoda', 'trà', 'tea'])) return 'Nước ngọt & nước suối';
  return 'Khác';
}

const FLAVORS = [['xoài', 'Xoài Hòa Lộc'], ['ổi', 'Ổi Hồng'], ['du lạc', 'Du Lạc'], ['chanh dây', 'Chanh dây']];

// Trả về cấu hình mặc định cho một món đồ uống trong thực đơn
function beverageDefaults(name, menuType) {
  const t = norm(name);
  const size = parseSizeMl(name);
  const isMixedType = /pha chế/i.test(menuType || '');

  if (has(t, ['phụ thu', 'khăn lạnh', 'tiền'])) return { mode: 'IGNORE', mlPerSale: 0, buy: null };

  const draft = (buyName, ml) => ({
    mode: 'VOLUME', mlPerSale: ml,
    buy: { name: buyName, unit: 'lít', sizeMl: 1000, category: 'Bia' }
  });

  if (has(t, ['bia hơi'])) return draft('Bia hơi Hà Nội (lít)', size || 1000);
  if (has(t, ['sapporo'])) {
    if (has(t, ['keg'])) return draft('Bia Sapporo (lít)', size || 20000);
    if (has(t, ['tháp'])) return draft('Bia Sapporo (lít)', size || 3000);
    return draft('Bia Sapporo (lít)', 500);
  }
  if (has(t, ['bia']) && (has(t, ['tháp']) || size >= 1000)) {
    const flavor = FLAVORS.find(([k]) => has(t, [k]));
    return draft(`Bia trái cây ${flavor ? flavor[1] : 'khác'} (lít)`, size || 3000);
  }
  if (has(t, ['vang', 'wine'])) {
    return { mode: 'VOLUME', mlPerSale: 100, buy: { name: String(name).trim(), unit: 'chai', sizeMl: size || 750, category: 'Rượu vang' } };
  }
  if (has(t, ['bia']) && size === 0) {
    return { mode: 'UNIT', mlPerSale: 0, buy: { name: String(name).trim(), unit: 'chai', sizeMl: 0, category: 'Bia' } };
  }
  if (isMixedType && size === 0) {
    return { mode: 'MIXED', mlPerSale: 10, buy: { name: 'Nguyên liệu pha chế (rượu, si-rô)', unit: 'lít', sizeMl: 1000, category: 'Pha chế' } };
  }
  return {
    mode: 'UNIT', mlPerSale: 0,
    buy: { name: String(name).trim(), unit: has(t, ['lon']) ? 'lon' : 'chai', sizeMl: size, category: categoryOf(t) }
  };
}

const MODE_LABELS = { UNIT: 'Bán nguyên chai/lon', VOLUME: 'Bán theo ly (ml/lần bán)', MIXED: 'Pha chế (ml nguyên liệu/ly)', IGNORE: 'Không tính' };

module.exports = { beverageDefaults, parseSizeMl, MODE_LABELS };
