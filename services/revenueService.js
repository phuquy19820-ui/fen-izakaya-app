// Báo cáo doanh thu theo hóa đơn: phân loại nhóm khách theo tên khách hàng và dựng các báo cáo từ dữ liệu hóa đơn CUKCUK.

const GROUPS = [
  { key: 'WG', label: 'WG (Walking guest)' },
  { key: 'FB', label: 'FB (Facebook)' },
  { key: 'TT', label: 'TT (TikTok)' },
  { key: 'ZL', label: 'ZL (Zalo)' },
  { key: 'GG', label: 'GG (Google)' },
  { key: 'IG', label: 'IG (Instagram)' },
  { key: 'SOCIAL', label: 'SOCIAL (KOL/KOC/MXH khác)' },
  { key: 'HL', label: 'HL (Hotline)' },
  { key: 'CTV', label: 'CTV (Cộng tác viên)' },
  { key: 'MKT', label: 'MKT (Bộ phận MKT)' },
  { key: 'OTHER', label: 'Khách khác' }
];
const SOCIAL_KEYS = ['FB', 'TT', 'ZL', 'GG', 'IG', 'SOCIAL'];
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toUpperCase();

// Nhóm khách theo ký hiệu trong tên khách hàng. Thứ tự ưu tiên: WG > MKT > CTV > HL > FB > IG > TT > ZL > GG > SOCIAL > khách khác
function customerGroup(name) {
  const t = norm(name);
  const tok = t.split(/[^A-Z0-9]+/).filter(Boolean);
  const has = (...k) => k.some((x) => tok.includes(x));
  if (has('WG') || /^WG/.test(t) || /\bWG[_-]/.test(t)) return 'WG';
  if (has('MKT')) return 'MKT';
  if (has('CTV')) return 'CTV';
  if (has('HL', 'HOTLINE')) return 'HL';
  if (has('FB', 'FACEBOOK')) return 'FB';
  if (has('IG', 'INSTAGRAM')) return 'IG';
  if (has('TT', 'TIKTOK')) return 'TT';
  if (has('ZL', 'ZALO')) return 'ZL';
  if (has('GG', 'GOOGLE')) return 'GG';
  if (has('KOL', 'KOC', 'SOCIAL', 'MXH')) return 'SOCIAL';
  return 'OTHER';
}

const COUNTRIES = [
  ['Việt Nam', /VIET|\bVN\b/], ['Mỹ', /\bUSA\b|\bUS\b|AMERICA|\bMY\b/], ['Trung Quốc', /TRUNG QUOC|CHINA/], ['Thái Lan', /THAI/],
  ['Hàn Quốc', /KOREA|HAN QUOC/], ['Đức', /GERMAN|\bDUC\b/], ['Ấn Độ', /INDIA/], ['Úc', /\bAUS|AUSTRAL|\bUC\b/], ['Nhật', /JAPAN|NHAT/],
  ['Pháp', /FRANCE|PHAP/], ['Canada', /CANADA/], ['Hồng Kông', /HONG ?KONG/], ['Ý', /ITALY|\bY\b/], ['Singapore', /SINGAPORE|\bSG\b/],
  ['Anh', /ENGLAND|\bUK\b|BRITAIN/], ['Nga', /RUSSIA|\bNGA\b/], ['Đài Loan', /TAIWAN|DAI LOAN/]
];
function wgCountry(name) {
  const t = norm(name);
  for (const [c, re] of COUNTRIES) if (re.test(t)) return c;
  return 'Chưa rõ';
}

// ---- tiện ích ngày
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dow = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // Thứ 2 = 0
const WD = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -dow(d));
function isoWeek(d) {
  const t = new Date(d + 'T00:00:00Z');
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
const fmtDM = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);

const HOUR_BUCKETS = ['Trước 17h', '17h-18h', '18h-20h', '20h-22h', 'Sau 22h'];
function hourBucket(startHour) {
  const h = startHour < 5 ? startHour + 24 : startHour; // khách vào sau nửa đêm tính vào "Sau 22h"
  return h < 17 ? 0 : h < 18 ? 1 : h < 20 ? 2 : h < 22 ? 3 : 4;
}

const n0 = (v) => Number(v) || 0;
const pct = (a, b) => (b ? (a - b) / b : null);

function agg(list) {
  const r = { rev: 0, inv: 0, people: 0, promo: 0, fee: 0, goods: 0 };
  list.forEach((x) => { r.rev += x.rev; r.inv += 1; r.people += x.people; r.promo += x.promo; r.fee += x.fee; r.goods += x.goods; });
  r.aov = r.inv ? r.rev / r.inv : 0;
  r.perGuest = r.people ? r.rev / r.people : 0;
  return r;
}

// params: { year, month, cmp: 'YYYY-MM' | '', kind, category, group, lowQty }
function buildReport(rawInvoices, rawItems, menu, params) {
  const year = Number(params.year);
  const month = Number(params.month);
  const ym = `${year}-${pad(month)}`;
  const cmpYm = /^\d{4}-\d{2}$/.test(params.cmp || '') ? params.cmp : '';
  const lowQty = Number(params.lowQty) > 0 ? Number(params.lowQty) : 5;
  const fKind = params.kind || '';
  const fCat = params.category || '';
  const fGroup = params.group || '';
  const itemMode = !!(fKind || fCat);

  // hóa đơn: bổ sung nhóm khách
  const inv = new Map();
  rawInvoices.forEach((r) => {
    const m = String(r.time_in || '').match(/^(\d+):(\d+)/);
    const group = customerGroup(r.customer_name);
    inv.set(r.d + '|' + r.ref_no, {
      ref_no: r.ref_no, d: r.d, ym: r.d.slice(0, 7), area: r.area || '(không có)', shift: r.shift || '(không có)', people: n0(r.people),
      goods: n0(r.amount), promo: n0(r.discount), fee: n0(r.service_fee), taxRed: n0(r.tax_reduction),
      rev: n0(r.amount) - n0(r.discount) + n0(r.service_fee) - n0(r.tax_reduction),
      hour: m ? Number(m[1]) + Number(m[2]) / 60 : 19, group, country: group === 'WG' ? wgCountry(r.customer_name) : ''
    });
  });

  // món: lọc theo nhóm món ăn / nhóm thực đơn / nhóm khách
  const items = [];
  rawItems.forEach((r) => {
    const iv = inv.get(r.d + '|' + r.ref_no);
    if (!iv) return;
    if (fGroup && iv.group !== fGroup) return;
    const kind = r.kind || 'Khác';
    const category = r.category || '(Không có nhóm)';
    if (fKind && kind !== fKind) return;
    if (fCat && category !== fCat) return;
    items.push({ ref_no: r.d + '|' + r.ref_no, d: iv.d, ym: iv.ym, code: r.item_code, name: r.item_name, kind, category, qty: n0(r.qty), rev: n0(r.amount) - n0(r.discount), promo: n0(r.discount) });
  });

  // danh sách hóa đơn sau lọc
  let invoices;
  if (itemMode) {
    const byRef = new Map();
    items.forEach((it) => { const a = byRef.get(it.ref_no) || { rev: 0, promo: 0 }; a.rev += it.rev; a.promo += it.promo; byRef.set(it.ref_no, a); });
    invoices = [];
    byRef.forEach((a, ref) => { const iv = inv.get(ref); invoices.push({ ...iv, rev: a.rev, goods: a.rev + a.promo, promo: a.promo, fee: 0 }); });
  } else {
    invoices = Array.from(inv.values()).filter((iv) => !fGroup || iv.group === fGroup);
  }

  const cur = invoices.filter((x) => x.ym === ym);
  const cmp = cmpYm ? invoices.filter((x) => x.ym === cmpYm) : [];
  const curItems = items.filter((x) => x.ym === ym);
  const cmpItems = cmpYm ? items.filter((x) => x.ym === cmpYm) : [];

  const dim = daysIn(year, month);
  const lastDate = cur.reduce((m2, x) => (x.d > m2 ? x.d : m2), '');
  const allLast = Array.from(inv.values()).reduce((m2, x) => (x.d > m2 ? x.d : m2), '');
  const isOpenMonth = !!lastDate && ym === allLast.slice(0, 7);
  const daysElapsed = isOpenMonth ? Number(lastDate.slice(8, 10)) : dim;
  const cmpDays = cmpYm ? daysIn(Number(cmpYm.slice(0, 4)), Number(cmpYm.slice(5, 7))) : 0;

  const kpiCur = agg(cur);
  const kpiCmp = agg(cmp);
  const out = {
    ym, cmpYm, itemMode,
    filters: { kind: fKind, category: fCat, group: fGroup },
    kpi: {
      cur: kpiCur, cmp: kpiCmp, daysElapsed, daysInMonth: dim, cmpDays,
      avgPerDay: daysElapsed ? kpiCur.rev / daysElapsed : 0, cmpAvgPerDay: cmpDays ? kpiCmp.rev / cmpDays : 0,
      forecast: daysElapsed ? (kpiCur.rev / daysElapsed) * dim : 0,
      itemsSold: curItems.reduce((a, x) => a + x.qty, 0), cmpItemsSold: cmpItems.reduce((a, x) => a + x.qty, 0)
    }
  };

  // khung giờ
  const hourOf = (list) => HOUR_BUCKETS.map((label, i) => ({ label, ...agg(list.filter((x) => hourBucket(x.hour) === i)) }));
  out.byHour = { cur: hourOf(cur), cmp: cmpYm ? hourOf(cmp) : [] };

  // theo thứ
  const wdOf = (list, days) => WD.map((label, i) => {
    const l = list.filter((x) => dow(x.d) === i);
    const a = agg(l);
    const nd = new Set(l.map((x) => x.d)).size;
    return { label, ...a, days: nd, avgDay: nd ? a.rev / nd : 0 };
  });
  out.byWeekday = { cur: wdOf(cur), cmp: cmpYm ? wdOf(cmp) : [] };

  // khu vực & ca
  const keyed = (list, k) => {
    const m = new Map();
    list.forEach((x) => { const a = m.get(x[k]) || []; a.push(x); m.set(x[k], a); });
    return Array.from(m.entries()).map(([label, l]) => ({ label, ...agg(l) })).sort((a, b) => b.rev - a.rev);
  };
  out.byArea = keyed(cur, 'area');
  out.byShift = keyed(cur, 'shift');

  // tuần: 7 ngày từ đầu tháng và tuần Thứ 2 - Chủ nhật
  const weekSeven = (list, y, m, days) => Array.from({ length: Math.ceil(days / 7) }, (_, i) => {
    const from = `${y}-${pad(m)}-${pad(i * 7 + 1)}`;
    const to = `${y}-${pad(m)}-${pad(Math.min(days, i * 7 + 7))}`;
    return { label: `Tuần ${i + 1}`, range: `${fmtDM(from)} - ${fmtDM(to)}`, from, to, ...agg(list.filter((x) => x.d >= from && x.d <= to)) };
  });
  const weekMon = (list, y, m, days) => {
    const first = `${y}-${pad(m)}-01`;
    const off = dow(first);
    const n = Math.ceil((days + off) / 7);
    return Array.from({ length: n }, (_, i) => {
      const from = addDays(first, i * 7 - off);
      const to = addDays(from, 6);
      return { label: `Tuần ${i + 1}`, range: `${fmtDM(from)} - ${fmtDM(to)}`, from, to, ...agg(list.filter((x) => x.d >= from && x.d <= to)) };
    });
  };
  out.weeks7 = { cur: weekSeven(cur, year, month, dim), cmp: cmpYm ? weekSeven(cmp, Number(cmpYm.slice(0, 4)), Number(cmpYm.slice(5, 7)), cmpDays) : [] };
  out.weeksMon = { cur: weekMon(cur, year, month, dim), cmp: cmpYm ? weekMon(cmp, Number(cmpYm.slice(0, 4)), Number(cmpYm.slice(5, 7)), cmpDays) : [] };
  out.matrixWeekday = WD.map((label, i) => ({ label, weeks: out.weeks7.cur.map((w) => w.from && cur.filter((x) => x.d >= w.from && x.d <= w.to && dow(x.d) === i).reduce((a, x) => a + x.rev, 0)) }));

  // xu hướng theo tháng của năm và theo tuần ISO
  out.byMonth = Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${pad(i + 1)}`;
    return { label: 'Th' + pad(i + 1), ym: k, ...agg(invoices.filter((x) => x.ym === k)) };
  }).map((r, i, arr) => ({ ...r, prevPct: i > 0 && arr[i - 1].rev ? pct(r.rev, arr[i - 1].rev) : null }));
  const wk = new Map();
  invoices.filter((x) => x.d.startsWith(String(year))).forEach((x) => { const k = mondayOf(x.d); const a = wk.get(k) || []; a.push(x); wk.set(k, a); });
  out.byIsoWeek = Array.from(wk.entries()).sort().map(([k, l], i, arr) => {
    const a = agg(l);
    const prev = i > 0 ? agg(arr[i - 1][1]) : null;
    return { label: `${year}-W${pad(isoWeek(k))}`, monday: k, ...a, prevPct: prev && prev.rev ? pct(a.rev, prev.rev) : null, prevInvPct: prev && prev.inv ? pct(a.inv, prev.inv) : null };
  });

  // cơ cấu theo loại món, nhóm thực đơn
  const share = (list, keyFn) => {
    const m = new Map();
    list.forEach((x) => { const k = keyFn(x); const a = m.get(k) || { label: k, rev: 0, qty: 0 }; a.rev += x.rev; a.qty += x.qty; m.set(k, a); });
    const total = Array.from(m.values()).reduce((a, x) => a + x.rev, 0);
    return Array.from(m.values()).map((x) => ({ ...x, share: total ? x.rev / total : 0 })).sort((a, b) => b.rev - a.rev);
  };
  out.byKind = share(curItems, (x) => x.kind);
  out.byCategory = share(curItems, (x) => x.category);
  out.byKindCategory = (() => {
    const m = new Map();
    curItems.forEach((x) => { const k = x.kind + '|' + x.category; const a = m.get(k) || { kind: x.kind, category: x.category, rev: 0, qty: 0 }; a.rev += x.rev; a.qty += x.qty; m.set(k, a); });
    const total = Array.from(m.values()).reduce((a, x) => a + x.rev, 0);
    return Array.from(m.values()).map((x) => ({ ...x, share: total ? x.rev / total : 0 })).sort((a, b) => (a.kind === b.kind ? b.rev - a.rev : a.kind < b.kind ? -1 : 1));
  })();
  out.byKindWeek = (() => {
    const kinds = Array.from(new Set(curItems.map((x) => x.kind)));
    return kinds.map((k) => ({ label: k, weeks: out.weeks7.cur.map((w) => curItems.filter((x) => x.kind === k && x.d >= w.from && x.d <= w.to).reduce((a, x) => a + x.rev, 0)) }));
  })();
  out.categoryCmp = cmpYm ? share(cmpItems, (x) => x.category) : [];

  // top món
  const topOf = (list) => {
    const m = new Map();
    list.forEach((x) => { const a = m.get(x.code) || { code: x.code, name: x.name, kind: x.kind, category: x.category, qty: 0, rev: 0 }; a.qty += x.qty; a.rev += x.rev; m.set(x.code, a); });
    return Array.from(m.values());
  };
  const sold = topOf(curItems);
  const totalByKind = {};
  sold.forEach((x) => { totalByKind[x.kind] = (totalByKind[x.kind] || 0) + x.rev; });
  const withPct = (arr) => arr.map((x) => ({ ...x, pctKind: totalByKind[x.kind] ? x.rev / totalByKind[x.kind] : 0 }));
  out.topRev = withPct([...sold].sort((a, b) => b.rev - a.rev).slice(0, 15));
  out.topQty = withPct([...sold].sort((a, b) => b.qty - a.qty).slice(0, 15));
  out.topFood = withPct(sold.filter((x) => x.kind === 'Món ăn').sort((a, b) => b.rev - a.rev).slice(0, 15));
  out.topDrink = withPct(sold.filter((x) => x.kind === 'Đồ uống').sort((a, b) => b.rev - a.rev).slice(0, 15));

  // nhóm khách (hóa đơn, không phụ thuộc lọc món nhưng chịu lọc nhóm khách)
  const custInv = (itemMode ? invoices : Array.from(inv.values())).filter((x) => !fGroup || x.group === fGroup);
  const grpRows = (list, weeks) => GROUPS.map((g) => {
    const l = list.filter((x) => x.group === g.key);
    const a = agg(l);
    return { key: g.key, label: g.label, ...a, weeks: weeks.map((w) => l.filter((x) => x.d >= w.from && x.d <= w.to).reduce((s, x) => s + x.rev, 0)) };
  }).filter((r) => r.inv > 0 || ['WG', 'FB', 'OTHER'].includes(r.key));
  const custCur = custInv.filter((x) => x.ym === ym);
  const custCmp = cmpYm ? custInv.filter((x) => x.ym === cmpYm) : [];
  const totCur = agg(custCur).rev;
  const addShare = (rows, tot) => rows.map((r) => ({ ...r, share: tot ? r.rev / tot : 0 }));
  const socialOf = (rows, tot) => {
    const l = rows.filter((r) => SOCIAL_KEYS.includes(r.key));
    const s = l.reduce((a, r) => ({ rev: a.rev + r.rev, inv: a.inv + r.inv, people: a.people + r.people }), { rev: 0, inv: 0, people: 0 });
    return { ...s, aov: s.inv ? s.rev / s.inv : 0, perGuest: s.people ? s.rev / s.people : 0, share: tot ? s.rev / tot : 0, weeks: out.weeks7.cur.map((_, i) => l.reduce((a, r) => a + (r.weeks[i] || 0), 0)) };
  };
  const gCur = addShare(grpRows(custCur, out.weeks7.cur), totCur);
  out.customerGroups = { cur: gCur, social: socialOf(gCur, totCur), cmp: cmpYm ? addShare(grpRows(custCmp, out.weeks7.cmp), agg(custCmp).rev) : [] };
  out.platforms = ['FB', 'TT', 'ZL', 'GG', 'IG', 'SOCIAL'].map((k) => {
    const a = agg(custCur.filter((x) => x.group === k));
    return { key: k, label: GROUP_LABEL[k], ...a, share: totCur ? a.rev / totCur : 0 };
  });
  out.groupByMonth = (() => {
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
    const rows = GROUPS.map((g) => {
      const byM = months.map((k) => custInv.filter((x) => x.ym === k && x.group === g.key));
      return { key: g.key, label: g.label, rev: byM.map((l) => l.reduce((a, x) => a + x.rev, 0)), inv: byM.map((l) => l.length) };
    }).filter((r) => r.inv.some((v) => v > 0));
    const social = { key: 'SOCIAL_TOTAL', label: 'TỔNG MẠNG XÃ HỘI', rev: months.map((_, i) => rows.filter((r) => SOCIAL_KEYS.includes(r.key)).reduce((a, r) => a + r.rev[i], 0)), inv: months.map((_, i) => rows.filter((r) => SOCIAL_KEYS.includes(r.key)).reduce((a, r) => a + r.inv[i], 0)) };
    const all = { key: 'ALL', label: 'TỔNG CỘNG TẤT CẢ NHÓM', rev: months.map((_, i) => rows.reduce((a, r) => a + r.rev[i], 0)), inv: months.map((_, i) => rows.reduce((a, r) => a + r.inv[i], 0)) };
    return { months: months.map((k) => 'Th' + k.slice(5)), rows, social, all };
  })();

  // khách WG theo quốc gia
  const wgList = custCur.filter((x) => x.group === 'WG');
  const wgTotal = wgList.reduce((a, x) => a + x.rev, 0);
  const cMap = new Map();
  wgList.forEach((x) => { const a = cMap.get(x.country) || []; a.push(x); cMap.set(x.country, a); });
  out.wgCountries = Array.from(cMap.entries()).map(([label, l]) => ({ label, ...agg(l), share: wgTotal ? l.reduce((a, x) => a + x.rev, 0) / wgTotal : 0, weeks: out.weeks7.cur.map((w) => l.filter((x) => x.d >= w.from && x.d <= w.to).reduce((s, x) => s + x.rev, 0)) })).sort((a, b) => b.rev - a.rev);

  // tốc độ bán món (ABC / Pareto)
  const cmpSold = new Map(topOf(cmpItems).map((x) => [x.code, x]));
  const menuMap = new Map((menu || []).map((m) => [m.item_code, m]));
  const speedMap = new Map(sold.map((x) => [x.code, { ...x, inMenu: menuMap.has(x.code) }]));
  (menu || []).forEach((m) => {
    if (m.inactive || speedMap.has(m.item_code)) return;
    const kind = /^đồ uống/i.test(m.item_type || '') ? 'Đồ uống' : (m.item_type || 'Khác');
    const category = m.category_name || '(Không có nhóm)';
    if (fKind && kind !== fKind) return;
    if (fCat && category !== fCat) return;
    if (fGroup) return; // lọc theo nhóm khách thì chỉ xem món đã bán
    speedMap.set(m.item_code, { code: m.item_code, name: m.item_name, kind, category, qty: 0, rev: 0, inMenu: true });
  });
  // gộp các món trùng tên hoặc gần giống tên (khác hoa/thường, dấu, khoảng trắng, lỗi gõ nhẹ; khác dung tích/số thì KHÔNG gộp)
  const normName = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const lev = (x, y) => {
    const m = x.length, n = y.length; if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  };
  const digitsOf = (t) => (t.match(/\d+/g) || []).join('|');
  const clusters = [];
  Array.from(speedMap.values()).sort((p, q) => q.qty - p.qty || q.rev - p.rev).forEach((x) => {
    const nk = normName(x.name), compact = nk.replace(/ /g, ''), dg = digitsOf(nk);
    let hit = clusters.find((c) => c.compact === compact || (compact.length >= 8 && c.dg === dg && c.kind === x.kind && lev(c.compact, compact) <= 1));
    if (!hit) { hit = { compact, dg, kind: x.kind, main: x, codes: [], qty: 0, rev: 0, inMenu: false }; clusters.push(hit); }
    hit.codes.push(x.code); hit.qty += x.qty; hit.rev += x.rev; hit.inMenu = hit.inMenu || x.inMenu;
  });
  const mergedItems = clusters.map((c) => ({ ...c.main, qty: c.qty, rev: c.rev, inMenu: c.inMenu, codes: c.codes }));
  const speed = mergedItems.sort((a, b) => b.qty - a.qty || b.rev - a.rev || String(a.name).localeCompare(String(b.name), 'vi'));
  const totalQty = speed.reduce((a, x) => a + x.qty, 0);
  let cum = 0;
  out.speed = speed.map((x, i) => {
    const before = totalQty ? cum / totalQty : 1;
    cum += x.qty;
    const cq = (x.codes || [x.code]).reduce((t, cd) => t + ((cmpSold.get(cd) || {}).qty || 0), 0);
    const c = cq ? { qty: cq } : null;
    let cls;
    if (x.qty === 0) cls = 'none';
    else if (before < 0.7) cls = 'fast';
    else if (before < 0.95) cls = 'slow';
    else cls = 'veryslow';
    return { rank: i + 1, code: x.code, merged: (x.codes || []).length > 1 ? x.codes.length : 0, name: x.name, kind: x.kind, category: x.category, qty: x.qty, rev: x.rev, share: totalQty ? x.qty / totalQty : 0, cum: totalQty ? cum / totalQty : 0,
      cls, low: x.qty > 0 && x.qty < lowQty, cmpQty: cmpYm ? (c ? c.qty : 0) : null, changePct: cmpYm && c && c.qty ? (x.qty - c.qty) / c.qty : null, inMenu: x.inMenu };
  });
  out.speedSummary = { fast: 0, slow: 0, veryslow: 0, none: 0, low: 0, lowQty };
  out.speed.forEach((x) => { out.speedSummary[x.cls]++; if (x.low) out.speedSummary.low++; });
  out.notInMenu = (menu && menu.length) ? sold.filter((x) => !menuMap.has(x.code)).map((x) => ({ code: x.code, name: x.name, kind: x.kind, category: x.category, qty: x.qty, rev: x.rev })) : [];

  // nhận xét tự động
  const fm = (v) => Math.round(v).toLocaleString('vi-VN');
  const tips = [];
  if (kpiCur.inv) {
    const mm = kpiCmp.inv ? pct(kpiCur.rev, kpiCmp.rev) : null;
    tips.push(`Doanh thu tháng ${pad(month)}/${year} đạt ${fm(kpiCur.rev)} đ${mm !== null ? (mm >= 0 ? `, tăng ${(mm * 100).toFixed(1)}%` : `, giảm ${(-mm * 100).toFixed(1)}%`) + ` so với ${cmpYm}` : ''}. AOV ${fm(kpiCur.aov)} đ/HĐ.`);
    if (out.byKind.length) tips.push('Cơ cấu: ' + out.byKind.map((k) => `${k.label} ${(k.share * 100).toFixed(0)}%`).join(' - ') + '.');
    if (out.byCategory.length) tips.push(`Nhóm dẫn đầu: ${out.byCategory[0].label} (${(out.byCategory[0].share * 100).toFixed(1)}% doanh thu).${topOf(curItems).length ? ` Món bán chạy nhất: ${[...sold].sort((a, b) => b.qty - a.qty)[0].name}.` : ''}`);
    const bestH = [...out.byHour.cur].sort((a, b) => b.rev - a.rev)[0];
    if (bestH && bestH.rev) tips.push(`Khung giờ cao điểm: ${bestH.label}.`);
    const wds = out.byWeekday.cur.filter((x) => x.rev > 0);
    if (wds.length) {
      const hi = [...wds].sort((a, b) => b.rev - a.rev)[0];
      const lo = [...wds].sort((a, b) => a.rev - b.rev)[0];
      tips.push(`Ngày cao điểm: ${hi.label} (${fm(hi.rev)} đ). Ngày thấp điểm: ${lo.label} (${fm(lo.rev)} đ).`);
    }
    tips.push(`Mục tiêu: nâng AOV thêm 10% (lên ${fm(kpiCur.aov * 1.1)} đ/HĐ) với cùng lượng khách → doanh thu tăng ~${fm(kpiCur.rev * 0.1)} đ.`);
  }
  out.tips = tips;

  // dữ liệu cho bộ lọc
  const monthsAvail = {};
  inv.forEach((x) => { monthsAvail[x.ym] = (monthsAvail[x.ym] || 0) + 1; });
  out.meta = {
    months: Object.keys(monthsAvail).sort(), kinds: Array.from(new Set(rawItems.map((r) => r.kind || 'Khác'))).sort(),
    categories: Array.from(new Set(rawItems.map((r) => r.category || '(Không có nhóm)'))).sort((a, b) => a.localeCompare(b, 'vi')),
    groups: GROUPS, lastDate: allLast
  };
  return out;
}

module.exports = { buildReport, customerGroup, wgCountry, GROUPS };
