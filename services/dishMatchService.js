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

// Từ đệm không làm đổi bản chất món ("Cơm trắng thêm" = "Cơm trắng", "Xiên bạch tuộc" = "Bạch tuộc")
const FILLER = new Set(['xien', 'them']);
const meaningful = (ws) => {
  const kept = ws.filter(w => !FILLER.has(w));
  return kept.length ? kept : ws;
};

// Điểm giống nhau 0..1 giữa hai tên món: kết hợp khoảng cách ký tự, độ trùng từ và quan hệ "tên này nằm trong tên kia".
function similarity(nameA, nameB) {
  const wa = meaningful(words(nameA));
  const wb = meaningful(words(nameB));
  if (!wa.length || !wb.length) return 0;
  const a = wa.join('');
  const b = wb.join('');
  if (a === b) return 1;
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const setA = new Set(wa);
  const setB = new Set(wb);
  const common = wa.filter(w => setB.has(w)).length;
  const dice = (2 * common) / (wa.length + wb.length);

  const [short, long, setLong] = wa.length <= wb.length ? [wa, wb, setB] : [wb, wa, setA];
  const contained = short.length >= 3 && short.every(w => setLong.has(w));
  const containment = contained ? 0.85 + 0.1 * (short.length / long.length) : 0;
  return Math.max(lev, dice, containment);
}

// Trả về n món định lượng gần nhất để gợi ý khi chưa tự ghép được.
function suggest(name, bomDishes, n = 1) {
  return bomDishes
    .map(d => ({ dish_id: d.dish_id, dish_name: d.dish_name, score: similarity(name, d.dish_name) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, n);
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
    const dKey = normalizeString(d.dish_name);
    if (!best || score > best.score) {
      // Món định lượng trùng tên với ứng viên tốt nhất không được tính là "ứng viên thứ hai"
      if (best && best.key !== dKey) second = Math.max(second, best.score);
      best = { dishId: d.dish_id, score, key: dKey };
    } else if (dKey !== best.key && score > second) second = score;
  }
  // Chỉ nhận khi đủ giống và nổi bật hơn hẳn ứng viên thứ hai, để tránh ghép nhầm món.
  if (best && best.score >= AUTO_THRESHOLD && best.score - second >= 0.03) {
    return { dishId: best.dishId, type: 'AUTO_FUZZY', score: best.score };
  }
  return null;
}

module.exports = { matchDish, similarity, suggest, AUTO_THRESHOLD };
