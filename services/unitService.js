// Đơn vị tính quy đổi: mặc định 1 kg = 1.000 gr, 1 lít = 1.000 ml; chai/hộp/gói/bao… suy ra từ quy cách trong tên NVL.
const norm = (s) => ' ' + String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
const has = (t, words) => words.some((w) => t.includes(' ' + w + ' ') || t.includes(w));

const LIQUID_WORDS = ['dầu', 'nước', 'sốt', 'xốt', 'sauce', 'tương', 'giấm', 'dấm', 'mắm', 'rượu', 'sake', 'mirin', 'sữa', 'bia', 'cooking', 'syrup', 'si rô'];
const DAIRY_WORDS = ['sữa', 'kem', 'phô mai', 'phomai', 'cream', 'whipping'];

function packWord(t, isVolume, sizeBase) {
  if (has(t, ['gói', 'goi']) && !isVolume) return 'gói';
  if (has(t, ['thùng'])) return 'thùng';
  if (has(t, ['lốc'])) return 'lốc';
  if (has(t, ['lon'])) return 'lon';
  if (isVolume || has(t, LIQUID_WORDS)) {
    if (has(t, DAIRY_WORDS) && sizeBase <= 1500) return 'hộp';
    return sizeBase >= 5000 ? 'can' : 'chai';
  }
  if (has(t, DAIRY_WORDS)) return 'hộp';
  return sizeBase >= 5000 ? 'bao' : 'gói';
}

// name: tên NVL trên CUKCUK; unit: đơn vị tính trên CUKCUK (Gram, gr, ml, Con, miếng…)
function defaultConversion(name, unit) {
  const u = String(unit || '').trim();
  const lu = u.toLowerCase();
  const isWeight = ['gram', 'gr', 'g'].includes(lu);
  const isVolume = lu === 'ml';
  if (!isWeight && !isVolume) return { large: u || 'đơn vị', small: u || 'đơn vị', ratio: 1, source: 'DEFAULT' };

  const small = isWeight ? 'gr' : 'ml';
  const defaultLarge = isWeight ? 'kg' : 'lít';
  const text = String(name || '');
  // "1L8" nghĩa là 1,8 lít
  const compact = text.match(/(\d)\s*L\s*(\d)\b/i);
  let m = null;
  if (compact) m = [compact[0], compact[1] + '.' + compact[2], 'l'];
  if (!m) {
    const re = /(\d+(?:[.,]\d+)?)\s*(kg|gram|gr|g|lít|lit|l|ml)/gi;
    let hit;
    while ((hit = re.exec(text))) {
      const su1 = hit[2].toLowerCase();
      const next = text.charAt(hit.index + hit[0].length);
      // "15 gói", "2 lốc": chữ g/l đứng trước một chữ cái khác không phải đơn vị
      if ((su1 === 'g' || su1 === 'l') && /\p{L}/u.test(next)) continue;
      m = hit;
      break;
    }
  }
  if (m) {
    const v = parseFloat(String(m[1]).replace(',', '.'));
    const su = String(m[2]).toLowerCase();
    const nameIsWeight = ['kg', 'gr', 'gram', 'g'].includes(su);
    const size = ['kg', 'l', 'lít', 'lit'].includes(su) ? v * 1000 : v;
    if (nameIsWeight === isWeight && size > 0) {
      return { large: packWord(norm(name), isVolume, size), small, ratio: Math.round(size), source: 'AUTO' };
    }
  }
  return { large: defaultLarge, small, ratio: 1000, source: 'DEFAULT' };
}

module.exports = { defaultConversion };
