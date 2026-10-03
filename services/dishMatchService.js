const { normalizeString } = require('./bomService');

function words(str) {
  return String(str || '')
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Điểm giống nhau 0..1 giữa hai tên món: kết hợp khoảng cách ký tự và độ trùng từ.
function similarity(nameA, nameB) {
  const wa = words(nameA);
  const wb = words(nameB);
  if (!wa.length || !wb.length) return 0;
  const a = wa.join('');
  const b = wb.join('');
  if (a === b) return 1;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const setB = new Set(wb);
  const common = wa.filter(w => setB.has(w)).length;
  const dice = (2 * common) / (wa.length + wb.length);
  return Math.max(lev, dice);
}

const AUTO_THRESHOLD = 0.85;

// bomDishes: [{ dish_id, dish_name }]. Trả về { dishId, type, score } hoặc null.
function matchDish(name, bomDishes) {
  const key = normalizeString(name);
  if (!key) return null;
  const exact = bomDishes.find(d => normalizeString(d.dish_name) === key);
  if (exact) return { dishId: exact.dish_id, type: 'AUTO_EXACT', score: 1 };

  let best = null;
  let second = 0;
  for (const d of bomDishes) {
    const score = similarity(name, d.dish_name);
    if (!best || score > best.score) {
      if (best) second = best.score;
      best = { dishId: d.dish_id, score };
    } else if (score > second) second = score;
  }
  // Chỉ nhận khi đủ giống và nổi bật hơn hẳn ứng viên thứ hai, để tránh ghép nhầm món.
  if (best && best.score >= AUTO_THRESHOLD && best.score - second >= 0.03) {
    return { dishId: best.dishId, type: 'AUTO_FUZZY', score: best.score };
  }
  return null;
}

module.exports = { matchDish, similarity, AUTO_THRESHOLD };
