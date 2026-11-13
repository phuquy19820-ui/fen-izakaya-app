// Phân tích dòng tiền vào / ra của một chi nhánh theo tháng.
//  - Tiền vào: doanh thu thuần theo hóa đơn CUKCUK (tiền hàng - khuyến mại + phí dịch vụ - thuế được giảm)
//  - Tiền ra: chứng từ chi quỹ tiền mặt / tiền gửi (trả NCC và chi khác), không tính chứng từ đã đánh dấu "không phải trả NCC"
//  - Công nợ NCC cuối tháng, giá trị tồn kho cuối tháng theo nhóm NVL / hàng hóa (đồ uống) / CCDC, giá trị xuất kho
const p2 = (n) => String(n).padStart(2, '0');
const ymOf = (y, m) => `${y}-${p2(m)}`;
const nz = (v) => Number(v) || 0;
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${p2(new Date(y, m, 0).getDate())}`; };
function addMonths(ym, k) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + k, 1); return ymOf(d.getFullYear(), d.getMonth() + 1); }

const GROUPS = { food: 'NVL thực phẩm', drink: 'Hàng hóa / đồ uống', ccdc: 'CCDC' };
const fmt = (n) => Math.round(nz(n)).toLocaleString('vi-VN');
const fmtM = (n) => `${(nz(n) / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`;

async function buildCashflow(db, branchId, year, month, nMonths, deps) {
  const endYm = ymOf(year, month);
  const startYm = addMonths(endYm, -(nMonths - 1));
  const prevYm = addMonths(startYm, -1); // tháng trước kỳ xem: để tính tồn đầu kỳ cho giá trị xuất kho
  const months = []; for (let i = 0; i < nMonths; i++) months.push(addMonths(startYm, i));
  const dFrom = `${prevYm}-01`; const dTo = lastDay(endYm);

  // ---- Tiền vào: doanh thu
  const revRows = (await db.query(`
    SELECT to_char(inv_date, 'YYYY-MM') AS ym, SUM(amount - discount + service_fee - tax_reduction) AS rev, SUM(amount) AS goods,
           SUM(discount) AS promo, COUNT(*) AS inv, COUNT(DISTINCT inv_date) AS days
    FROM cukcuk_invoices WHERE branch_id = $1 AND inv_date BETWEEN $2 AND $3 GROUP BY 1`, [branchId, dFrom, dTo])).rows;
  const rev = new Map(revRows.map((r) => [r.ym, r]));

  // ---- Tiền ra: chứng từ chi quỹ (đã gán NCC / chi khác)
  const pay = await deps.computePayables(branchId, '1900-01-01', dTo);
  const payBy = new Map(); const otherBudget = new Map();
  let ignoredAmt = 0;
  pay.payments.forEach((p) => {
    const ym = String(p.date).slice(0, 7);
    if (ym < startYm || ym > endYm) return;
    if (p.how === 'ignored') { ignoredAmt += p.amount; return; }
    const a = payBy.get(ym) || { ncc: 0, other: 0, cash: 0, bank: 0, n: 0 };
    if (p.supplier_code) a.ncc += p.amount; else { a.other += p.amount; const k = p.budget_item || p.type_name || '(không ghi khoản mục)'; otherBudget.set(k, (otherBudget.get(k) || 0) + p.amount); }
    if (p.source === 'BANK') a.bank += p.amount; else a.cash += p.amount;
    a.n += 1;
    payBy.set(ym, a);
  });

  // ---- Mua hàng (phát sinh nợ NCC)
  const purRows = (await db.query(`
    SELECT to_char(purchase_date, 'YYYY-MM') AS ym, SUM(CASE WHEN total_amount > 0 THEN total_amount ELSE amount END) AS total, SUM(amount) AS goods
    FROM supplier_purchases WHERE branch_id = $1 AND purchase_date BETWEEN $2 AND $3 GROUP BY 1`, [branchId, dFrom, dTo])).rows;
  const pur = new Map(purRows.map((r) => [r.ym, r]));

  // ---- Công nợ NCC cuối từng tháng
  const debtEnd = new Map(); let lastSuppliers = [];
  for (const ym of months) {
    const d = await deps.computePayables(branchId, '1900-01-01', lastDay(ym));
    debtEnd.set(ym, d.suppliers.reduce((a, s) => a + nz(s.balance), 0));
    if (ym === endYm) lastSuppliers = d.suppliers;
  }
  const debtPrev = (await deps.computePayables(branchId, '1900-01-01', lastDay(prevYm))).suppliers.reduce((a, s) => a + nz(s.balance), 0);

  // ---- Tồn kho cuối tháng và nhập kho trong tháng theo nhóm
  const closeRows = (await db.query(`
    WITH me AS (SELECT to_char(stock_date, 'YYYY-MM') AS ym, MAX(stock_date) AS d FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3 GROUP BY 1)
    SELECT me.ym, s.item_code, MAX(s.item_name) AS n, MAX(s.category_name) AS c, SUM(s.closing_amount) AS amt
    FROM cukcuk_stock_daily s JOIN me ON s.stock_date = me.d WHERE s.branch_id = $1 GROUP BY me.ym, s.item_code`, [branchId, dFrom, dTo])).rows;
  const inRows = (await db.query(`
    SELECT to_char(stock_date, 'YYYY-MM') AS ym, item_code, MAX(item_name) AS n, MAX(category_name) AS c, SUM(in_amount) AS inn
    FROM cukcuk_stock_daily WHERE branch_id = $1 AND stock_date BETWEEN $2 AND $3 GROUP BY 1, 2`, [branchId, dFrom, dTo])).rows;
  const stock = new Map(); // ym -> { close: {food,drink,ccdc}, inn: {...} }
  const bucket = (ym) => { if (!stock.has(ym)) stock.set(ym, { close: { food: 0, drink: 0, ccdc: 0 }, inn: { food: 0, drink: 0, ccdc: 0 } }); return stock.get(ym); };
  closeRows.forEach((r) => { bucket(r.ym).close[deps.itemGroupOf(r.item_code, r.n, r.c)] += nz(r.amt); });
  inRows.forEach((r) => { bucket(r.ym).inn[deps.itemGroupOf(r.item_code, r.n, r.c)] += nz(r.inn); });
  const hasStock = stock.size > 0;

  // ---- Bảng theo tháng
  let cum = 0;
  const rows = months.map((ym, i) => {
    const r = rev.get(ym); const p = payBy.get(ym) || { ncc: 0, other: 0, cash: 0, bank: 0, n: 0 }; const u = pur.get(ym);
    const revenue = nz(r && r.rev); const out = p.ncc + p.other; const net = revenue - out; cum += net;
    const st = stock.get(ym); const stPrev = stock.get(i === 0 ? prevYm : months[i - 1]);
    const close = st ? st.close : null;
    const outVal = {}; let cogs = null;
    if (st && stPrev) {
      cogs = 0;
      Object.keys(GROUPS).forEach((g) => { outVal[g] = stPrev.close[g] + st.inn[g] - st.close[g]; if (g !== 'ccdc') cogs += outVal[g]; });
    }
    const debt = debtEnd.get(ym); const debtBefore = i === 0 ? debtPrev : debtEnd.get(months[i - 1]);
    return {
      ym, revenue, goods: nz(r && r.goods), promo: nz(r && r.promo), invoices: nz(r && r.inv), days: nz(r && r.days),
      purchases: nz(u && u.total), pay_ncc: p.ncc, pay_other: p.other, pay_total: out, pay_count: p.n, pay_cash: p.cash, pay_bank: p.bank,
      net, cum, debt_end: debt, debt_change: debt - debtBefore,
      stock_close: close ? close.food + close.drink + close.ccdc : null, stock_by_group: close, out_by_group: st && stPrev ? outVal : null, cogs
    };
  });

  // ---- Chỉ số & cảnh báo (tháng cuối so với các tháng trước)
  const L = rows[rows.length - 1]; const P = rows.length > 1 ? rows[rows.length - 2] : null;
  const last3 = rows.slice(-3);
  const avg = (arr, f) => (arr.length ? arr.reduce((a, x) => a + nz(f(x)), 0) / arr.length : 0);
  const avgPur = avg(last3, (x) => x.purchases);
  const dpo = avgPur > 0 ? (L.debt_end / avgPur) * 30 : null; // số ngày công nợ NCC bình quân
  const foodDrinkStock = L.stock_by_group ? L.stock_by_group.food + L.stock_by_group.drink : null;
  const cogsAvg = avg(last3.filter((x) => x.cogs !== null), (x) => x.cogs);
  const dio = foodDrinkStock !== null && cogsAvg > 0 ? (foodDrinkStock / cogsAvg) * 30 : null; // số ngày tồn kho
  const cogsPct = L.cogs !== null && L.revenue > 0 ? L.cogs / L.revenue : null;
  const purPct = L.revenue > 0 ? L.purchases / L.revenue : null;
  const outPct = L.revenue > 0 ? L.pay_total / L.revenue : null;
  const debtPct = L.revenue > 0 ? L.debt_end / L.revenue : null;
  const negMonths = last3.filter((x) => x.net < 0).length;
  const cumNet = rows.reduce((a, x) => a + x.net, 0);
  const alerts = [];
  const add = (level, title, detail, advice) => alerts.push({ level, title, detail, advice });
  const [ly, lm] = [L.ym.slice(0, 4), L.ym.slice(5)]; const lab = `tháng ${Number(lm)}/${ly}`;

  if (L.revenue <= 0) add('warn', 'Chưa có doanh thu trong tháng cuối', `Không có hóa đơn nào trong ${lab}.`, 'Kiểm tra đã đồng bộ doanh thu từ CUKCUK chưa.');
  if (L.pay_count === 0 && L.revenue > 0) add('warn', 'Chưa có chứng từ chi quỹ trong tháng cuối', `${lab} chưa có chứng từ chi nào nên dòng tiền ra có thể bị thiếu.`, 'Đồng bộ lại "Chứng từ chi quỹ tiền mặt / tiền gửi" ở mục Đồng bộ & ghép món.');
  if (L.revenue > 0) {
    if (L.net < 0) add('high', `Tiền chi ra lớn hơn tiền thu về trong ${lab}`, `Thu ${fmtM(L.revenue)}, chi ${fmtM(L.pay_total)} → thiếu ${fmtM(-L.net)} (chi bằng ${(outPct * 100).toFixed(0)}% doanh thu).`, 'Xem khoản chi khác lớn nhất bên dưới; cân nhắc giãn lịch trả NCC hoặc cắt chi không cấp thiết.');
    else if (outPct > 0.9) add('warn', `Chi ra đã chiếm ${(outPct * 100).toFixed(0)}% doanh thu ${lab}`, `Thu ${fmtM(L.revenue)}, chi ${fmtM(L.pay_total)}, còn dư ${fmtM(L.net)} — biên an toàn mỏng.`, 'Theo dõi sát tuần đầu tháng sau; tránh phát sinh thêm khoản chi lớn.');
  }
  if (negMonths >= 2) add('high', `${negMonths}/3 tháng gần nhất dòng tiền thuần âm`, last3.map((x) => `${x.ym.slice(5)}/${x.ym.slice(2, 4)}: ${x.net < 0 ? '-' : '+'}${fmtM(Math.abs(x.net))}`).join(' · '), 'Âm liên tục thường phải bù bằng vốn chủ / vay hoặc nợ NCC — cần kế hoạch cân đối lại.');
  if (rows.length >= 3 && cumNet < 0) add('high', `Cộng dồn ${rows.length} tháng: chi nhiều hơn thu ${fmtM(-cumNet)}`, `Tổng thu ${fmtM(rows.reduce((a, x) => a + x.revenue, 0))}, tổng chi ${fmtM(rows.reduce((a, x) => a + x.pay_total, 0))}.`, 'Kiểm tra nguồn tiền đã bù phần thiếu (góp vốn, vay, nợ NCC tăng).');

  if (dpo !== null) {
    if (dpo > 45) add('high', `Công nợ NCC ≈ ${dpo.toFixed(0)} ngày mua hàng`, `Dư nợ ${fmtM(L.debt_end)} so với mua hàng bình quân ${fmtM(avgPur)}/tháng.`, 'Nợ quá 45 ngày dễ bị NCC siết hàng/giá; ưu tiên trả nhóm NCC thực phẩm tươi.');
    else if (dpo > 30) add('warn', `Công nợ NCC ≈ ${dpo.toFixed(0)} ngày mua hàng`, `Dư nợ ${fmtM(L.debt_end)} so với mua hàng bình quân ${fmtM(avgPur)}/tháng.`, 'Theo dõi để không vượt kỳ hạn thanh toán đã thỏa thuận với NCC.');
  }
  const debtUp3 = rows.length >= 4 ? L.debt_end - rows[rows.length - 4].debt_end : null;
  if (debtUp3 !== null && debtUp3 > 0 && rows[rows.length - 4].debt_end > 0 && debtUp3 / rows[rows.length - 4].debt_end > 0.2) add('warn', `Công nợ NCC tăng ${fmtM(debtUp3)} trong 3 tháng (+${((debtUp3 / rows[rows.length - 4].debt_end) * 100).toFixed(0)}%)`, `Từ ${fmtM(rows[rows.length - 4].debt_end)} lên ${fmtM(L.debt_end)}.`, 'Mua chịu đang tăng nhanh hơn trả nợ — dấu hiệu dùng NCC làm nguồn vốn.');
  if (debtPct !== null && debtPct > 1) add('high', `Dư nợ NCC lớn hơn cả doanh thu 1 tháng (${(debtPct * 100).toFixed(0)}%)`, `Dư nợ ${fmtM(L.debt_end)} / doanh thu ${fmtM(L.revenue)}.`, 'Rủi ro thanh khoản cao nếu doanh thu sụt.');
  if (L.purchases > 0 && L.pay_ncc < L.purchases) {
    const gap3 = last3.reduce((a, x) => a + x.purchases - x.pay_ncc, 0);
    if (gap3 > 0) add(gap3 > avgPur ? 'warn' : 'info', `3 tháng gần nhất mua nhiều hơn trả NCC ${fmtM(gap3)}`, `Mua ${fmtM(last3.reduce((a, x) => a + x.purchases, 0))}, trả ${fmtM(last3.reduce((a, x) => a + x.pay_ncc, 0))}.`, 'Phần chênh lệch là nợ NCC phát sinh thêm.');
  }

  if (!hasStock) add('warn', 'Chưa có dữ liệu tồn kho', 'Chưa có báo cáo nhập - xuất - tồn của CUKCUK nên chưa phân tích được tiền chôn trong tồn kho.', 'Đồng bộ doanh số/tồn kho từ CUKCUK.');
  else {
    if (dio !== null) {
      if (dio > 45) add('high', `Tồn kho NVL + hàng hóa đủ dùng ≈ ${dio.toFixed(0)} ngày`, `Tồn ${fmtM(foodDrinkStock)}, xuất bình quân ${fmtM(cogsAvg)}/tháng — tiền đang nằm trong kho.`, 'Giảm lượng đặt, xả hàng tồn lâu; nhóm hàng tươi chỉ nên tồn 2–5 ngày.');
      else if (dio > 30) add('warn', `Tồn kho NVL + hàng hóa đủ dùng ≈ ${dio.toFixed(0)} ngày`, `Tồn ${fmtM(foodDrinkStock)}, xuất bình quân ${fmtM(cogsAvg)}/tháng.`, 'Xem lại mức tồn tối thiểu của hàng khô / đồ uống.');
    }
    if (P && P.stock_close && L.stock_close && L.stock_close > P.stock_close * 1.2 && L.revenue <= P.revenue) add('warn', `Tồn kho tăng ${(((L.stock_close / P.stock_close) - 1) * 100).toFixed(0)}% trong khi doanh thu không tăng`, `Tồn ${fmtM(P.stock_close)} → ${fmtM(L.stock_close)}, doanh thu ${fmtM(P.revenue)} → ${fmtM(L.revenue)}.`, 'Mua vào đang vượt nhu cầu bán — kiểm tra kế hoạch mua.');
    if (cogsPct !== null) {
      if (cogsPct > 0.45) add('high', `Giá vốn NVL + hàng hóa chiếm ${(cogsPct * 100).toFixed(0)}% doanh thu`, `Xuất kho ${fmtM(L.cogs)} / doanh thu ${fmtM(L.revenue)}.`, 'Mức thông thường của quán nhậu/izakaya khoảng 30–38%; kiểm tra hao hụt, định lượng, giá nhập.');
      else if (cogsPct > 0.4) add('warn', `Giá vốn NVL + hàng hóa chiếm ${(cogsPct * 100).toFixed(0)}% doanh thu`, `Xuất kho ${fmtM(L.cogs)} / doanh thu ${fmtM(L.revenue)}.`, 'Cao hơn mức 30–38% thường gặp — xem báo cáo tiêu hao NVL để tìm hao hụt.');
    }
  }
  if (purPct !== null && purPct > 0.5) add('warn', `Mua hàng chiếm ${(purPct * 100).toFixed(0)}% doanh thu ${lab}`, `Mua ${fmtM(L.purchases)} / doanh thu ${fmtM(L.revenue)}.`, 'Nếu tháng sau không giảm, tồn kho/nợ NCC sẽ phình ra.');
  if (P && P.revenue > 0 && L.revenue > 0 && L.revenue < P.revenue * 0.9) add('warn', `Doanh thu ${lab} giảm ${(((P.revenue - L.revenue) / P.revenue) * 100).toFixed(0)}% so với tháng trước`, `${fmtM(P.revenue)} → ${fmtM(L.revenue)}.`, 'Chi phí cố định không giảm theo — cần điều chỉnh chi tiêu sớm.');

  const top = [...otherBudget.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, amount]) => ({ name, amount }));
  const high = alerts.filter((a) => a.level === 'high').length; const warn = alerts.filter((a) => a.level === 'warn').length;
  const verdict = high >= 2 ? 'red' : (high === 1 || warn >= 3 ? 'yellow' : 'green');
  const order = { high: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => order[a.level] - order[b.level]);
  const supTop = lastSuppliers.filter((s) => nz(s.balance) > 0).sort((a, b) => b.balance - a.balance).slice(0, 8).map((s) => ({ name: s.name, balance: nz(s.balance), share: L.debt_end > 0 ? nz(s.balance) / L.debt_end : 0 }));
  if (supTop.length && supTop[0].share > 0.3) alerts.push({ level: 'info', title: `NCC "${supTop[0].name}" chiếm ${(supTop[0].share * 100).toFixed(0)}% dư nợ`, detail: `${fmtM(supTop[0].balance)} / ${fmtM(L.debt_end)}.`, advice: 'Phụ thuộc một NCC lớn — thương lượng kỳ hạn thanh toán rõ ràng.' });

  return {
    year, month, months: nMonths, rows, alerts, verdict, counts: { high, warn },
    kpi: { dpo, dio, cogsPct, purPct, outPct, debtPct, cumNet, avgPur, foodDrinkStock },
    topOther: top, topSuppliers: supTop, ignoredAmt, groups: GROUPS, hasStock,
    note: { revenueBasis: 'Doanh thu thuần theo hóa đơn CUKCUK, coi như tiền thu về trong tháng (chưa có số liệu quỹ để đối chiếu tiền thực nhận).' }
  };
}

module.exports = { buildCashflow };
