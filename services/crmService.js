// CRM nhà hàng: nhận diện khách từ hóa đơn POS (CUKCUK), hạng thẻ thành viên, phân khúc RFM, điểm tích lũy.
const crypto = require('crypto');
const { customerGroup, GROUPS } = require('./revenueService');
const { normalizeString } = require('./bomService');

const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label]));
const KNOWN_TOKENS = new Set(['FB', 'FACEBOOK', 'IG', 'INSTAGRAM', 'TT', 'TIKTOK', 'ZL', 'ZALO', 'HL', 'HOTLINE', 'CTV', 'MKT', 'GG', 'GOOGLE', 'KOL', 'KOC', 'SOCIAL', 'MXH', 'WG']);

const PARSE_VERSION = 2;

const DEFAULT_SETTINGS = {
  brand: 'FEN IZAKAYA',
  // Hạng thẻ theo chi tiêu (đ). Ngưỡng do chủ quán tự nhập trong Cài đặt.
  tierPeriod: 'best_month12', // best_month12 = tháng chi tiêu cao nhất trong 12 tháng gần nhất; rolling12 = tổng 12 tháng; lifetime = từ trước đến nay
  tiers: [
    { key: 'member', name: 'Thành viên', min: 0, perks: ['Tích điểm mọi hóa đơn', 'Nhận ưu đãi sinh nhật'] },
    { key: 'silver', name: 'Bạc', min: 10000000, perks: ['Tích điểm x1,2', 'Tặng 1 món tráng miệng/lần ghé', 'Ưu tiên đặt bàn'] },
    { key: 'gold', name: 'Vàng', min: 15000000, perks: ['Tích điểm x1,5', 'Tặng 1 đồ uống/lần ghé', 'Ưu tiên giữ bàn đẹp'] },
    { key: 'diamond', name: 'Kim cương', min: 20000000, perks: ['Tích điểm x2', 'Tặng 1 món khai vị/lần ghé', 'Quà sinh nhật đặc biệt'] },
    { key: 'luxury', name: 'Luxury', min: 30000000, perks: ['Tích điểm x3', 'Quản lý riêng chăm sóc', 'Ưu đãi sự kiện & tiệc riêng'] }
  ],
  pointsRate: 10000, // 10.000đ = 1 điểm
  // Mẫu tin nhắn gửi nhanh qua Zalo / SMS / Facebook. Biến: {ten} {hang} {quan} {the}
  messageTemplates: [
    { name: 'Chúc mừng sinh nhật', text: 'Xin chào {ten}, {quan} xin chúc mừng sinh nhật anh/chị! Mời anh/chị ghé quán trong tháng sinh nhật để nhận quà tặng đặc biệt dành cho thành viên hạng {hang}.' },
    { name: 'Cảm ơn sau khi ghé quán', text: 'Cảm ơn {ten} đã ghé {quan}. Rất mong nhận được góp ý của anh/chị để chúng tôi phục vụ tốt hơn. Hẹn gặp lại anh/chị!' },
    { name: 'Mời quay lại', text: 'Xin chào {ten}, lâu rồi {quan} chưa được đón anh/chị. Mời anh/chị ghé quán, chúng tôi có nhiều món mới và ưu đãi dành riêng cho thành viên hạng {hang}.' },
    { name: 'Thẻ thành viên', text: 'Xin chào {ten}, đây là thẻ thành viên {quan} của anh/chị (hạng {hang}): {the}' }
  ],
  newDays: 30,
  winbackDays: 60,
  lostDays: 120
};

const pad = (n) => String(n).padStart(2, '0');
const todayVn = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// ---- nhận diện khách từ tên khách hàng trên POS
function parseCustomerName(raw) {
  const original = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!original || /^null$/i.test(original)) return null;
  // số điện thoại Việt Nam trong tên (vd. "Mr.Huy (HOTLINE) - 0888927388")
  let phone = '';
  const re = /(\+?84|0)(?:[\s.\-]?\d){8,10}/g;
  let m;
  let phoneText = '';
  while ((m = re.exec(original))) {
    let d = m[0].replace(/\D/g, '');
    if (d.startsWith('84') && d.length >= 11) d = '0' + d.slice(2);
    if (/^0\d{9,10}$/.test(d)) { phone = d; phoneText = m[0]; }
  }
  const group = customerGroup(original);
  // phần trong ngoặc: nền tảng/nguồn hoặc tên người giới thiệu (vd. "( AN )", "( A.LỘC )")
  const parens = [];
  let rest = original.replace(/[\(\（]([^\)\）]*)[\)\）]?/g, (_, inner) => { parens.push(inner.trim()); return ' '; });
  if (phoneText) rest = rest.replace(phoneText, ' ');
  let display = rest.replace(/\s*[-–]\s*\d{5,}\s*$/, '').replace(/^[\s\-–]+|[\s\-–]+$/g, '').replace(/\s+/g, ' ').trim() || original;
  // tiền tố là ký hiệu nguồn ("FB - MS LINH", "CTV - MS SOU"): bỏ tiền tố, giữ tên khách
  const pre = display.match(/^([A-Za-z.]{2,10})\s*-\s+(.{2,})$/);
  if (pre && KNOWN_TOKENS.has(pre[1].toUpperCase().replace(/[^A-Z]/g, ''))) display = pre[2].trim();
  const refBy = parens.filter((p) => p && !KNOWN_TOKENS.has(p.toUpperCase().replace(/[^A-Z]/g, ''))).join(', ').substring(0, 120);
  const key = phone ? 'p:' + phone : 'n:' + normalizeString(display);
  if (key === 'n:' || key.length < 5) return null;
  return { key, name: display.substring(0, 120), phone, group, walkin: group === 'WG', refBy, source: group === 'OTHER' ? '' : (GROUP_LABEL[group] || group) };
}

const newToken = () => crypto.randomBytes(12).toString('base64url');

async function init(pool) {
  const q = (s) => pool.query(s);
  await q('ALTER TABLE cukcuk_invoices ADD COLUMN IF NOT EXISTS cust_key VARCHAR(80)');
  await q('ALTER TABLE cukcuk_invoices ADD COLUMN IF NOT EXISTS cust_phone VARCHAR(20)');
  await q('ALTER TABLE cukcuk_invoices ADD COLUMN IF NOT EXISTS cust_display VARCHAR(160)');
  await q('ALTER TABLE cukcuk_invoices ADD COLUMN IF NOT EXISTS cust_group VARCHAR(20)');
  await q('CREATE INDEX IF NOT EXISTS idx_cukcuk_invoices_cust ON cukcuk_invoices (cust_key)');
  await q(`CREATE TABLE IF NOT EXISTS crm_settings (key VARCHAR(60) PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS crm_customers (
    id SERIAL PRIMARY KEY, member_no SERIAL, cust_key VARCHAR(80) UNIQUE, name VARCHAR(160) NOT NULL, phone VARCHAR(20), email VARCHAR(160),
    gender VARCHAR(10), birthday DATE, address VARCHAR(300), company VARCHAR(160), source VARCHAR(80), ref_by VARCHAR(160),
    notes TEXT, preferences TEXT, allergies TEXT, tags TEXT[] DEFAULT '{}', status VARCHAR(20) DEFAULT 'active', owner_id INT,
    branch_id VARCHAR(50), tier_override VARCHAR(20), card_token VARCHAR(40) UNIQUE, is_manual BOOLEAN DEFAULT FALSE,
    created_by INT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q('CREATE INDEX IF NOT EXISTS idx_crm_customers_phone ON crm_customers (phone)');
  await q('ALTER TABLE crm_customers ADD COLUMN IF NOT EXISTS social_link VARCHAR(300)');
  await q(`CREATE TABLE IF NOT EXISTS crm_interactions (
    id SERIAL PRIMARY KEY, customer_id INT NOT NULL, type VARCHAR(20) NOT NULL DEFAULT 'note', content TEXT, rating INT, outcome VARCHAR(120),
    user_id INT, user_name VARCHAR(120), follow_up_date DATE, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await q('CREATE INDEX IF NOT EXISTS idx_crm_interactions_cust ON crm_interactions (customer_id)');
  await q(`CREATE TABLE IF NOT EXISTS crm_tasks (
    id SERIAL PRIMARY KEY, customer_id INT, deal_id INT, title VARCHAR(200) NOT NULL, description TEXT, due_date DATE, priority VARCHAR(10) DEFAULT 'normal',
    status VARCHAR(10) DEFAULT 'open', assignee_id INT, branch_id VARCHAR(50), auto_key VARCHAR(80) UNIQUE, created_by INT,
    created_at TIMESTAMP DEFAULT NOW(), done_at TIMESTAMP
  )`);
  await q(`CREATE TABLE IF NOT EXISTS crm_deals (
    id SERIAL PRIMARY KEY, customer_id INT, contact_name VARCHAR(160), contact_phone VARCHAR(30), title VARCHAR(200) NOT NULL, deal_type VARCHAR(30) DEFAULT 'Đặt tiệc',
    branch_id VARCHAR(50), event_date DATE, guests INT, expected_value NUMERIC(18,0) DEFAULT 0, deposit NUMERIC(18,0) DEFAULT 0, stage VARCHAR(20) DEFAULT 'new',
    lost_reason VARCHAR(200), owner_id INT, notes TEXT, created_by INT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(), closed_at TIMESTAMP
  )`);
  await q(`CREATE TABLE IF NOT EXISTS crm_points_ledger (
    id SERIAL PRIMARY KEY, customer_id INT NOT NULL, points INT NOT NULL, reason VARCHAR(200), user_id INT, user_name VARCHAR(120), created_at TIMESTAMP DEFAULT NOW()
  )`);
  await reparseIfNeeded(pool);
}

// Đổi cách nhận diện tên khách: nhận diện lại toàn bộ (chỉ khi chưa có dữ liệu do người dùng nhập, tránh mất ghi chú)
async function reparseIfNeeded(pool) {
  const v = (await pool.query("SELECT value FROM crm_settings WHERE key = 'parse'")).rows[0];
  if (v && Number(v.value.version) >= PARSE_VERSION) return;
  const used = (await pool.query(`SELECT (SELECT COUNT(*) FROM crm_interactions) + (SELECT COUNT(*) FROM crm_tasks) + (SELECT COUNT(*) FROM crm_points_ledger)
    + (SELECT COUNT(*) FROM crm_deals WHERE customer_id IS NOT NULL)
    + (SELECT COUNT(*) FROM crm_customers WHERE is_manual OR tier_override IS NOT NULL OR COALESCE(notes, '') <> '' OR birthday IS NOT NULL OR COALESCE(email, '') <> '' OR cardinality(tags) > 0) AS n`)).rows[0].n;
  if (Number(used) === 0) {
    await pool.query('UPDATE cukcuk_invoices SET cust_key = NULL');
    await pool.query('DELETE FROM crm_customers WHERE NOT is_manual');
  }
  await pool.query("INSERT INTO crm_settings (key, value) VALUES ('parse', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify({ version: PARSE_VERSION })]);
}

// ---- cài đặt
async function getSettings(pool) {
  const r = await pool.query("SELECT value FROM crm_settings WHERE key = 'main'");
  const v = r.rows[0] ? r.rows[0].value : {};
  const s = { ...DEFAULT_SETTINGS, ...v };
  s.tiers = (Array.isArray(v.tiers) && v.tiers.length ? v.tiers : DEFAULT_SETTINGS.tiers)
    .map((t) => ({ key: String(t.key), name: String(t.name || t.key), min: Number(t.min) || 0, perks: Array.isArray(t.perks) ? t.perks.map(String) : [] }))
    .sort((a, b) => a.min - b.min);
  if (s.tiers[0]) s.tiers[0].min = 0;
  s.messageTemplates = (Array.isArray(v.messageTemplates) ? v.messageTemplates : DEFAULT_SETTINGS.messageTemplates)
    .map((t) => ({ name: String(t.name || '').trim().substring(0, 60), text: String(t.text || '').trim().substring(0, 1000) })).filter((t) => t.name && t.text).slice(0, 12);
  return s;
}
async function saveSettings(pool, body) {
  const cur = await getSettings(pool);
  const next = { ...cur };
  if (Array.isArray(body.tiers) && body.tiers.length >= 2) {
    next.tiers = body.tiers.map((t, i) => ({
      key: String(t.key || 'tier' + i).replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'tier' + i, name: String(t.name || '').trim().substring(0, 40) || 'Hạng ' + (i + 1),
      min: Math.max(0, Number(t.min) || 0), perks: Array.isArray(t.perks) ? t.perks.map((p) => String(p).trim()).filter(Boolean).slice(0, 8) : []
    })).sort((a, b) => a.min - b.min);
    next.tiers[0].min = 0;
  }
  if (['best_month12', 'rolling12', 'lifetime'].includes(body.tierPeriod)) next.tierPeriod = body.tierPeriod;
  for (const k of ['pointsRate', 'newDays', 'winbackDays', 'lostDays']) if (Number(body[k]) > 0) next[k] = Number(body[k]);
  if (Array.isArray(body.messageTemplates)) next.messageTemplates = body.messageTemplates;
  if (body.brand) next.brand = String(body.brand).substring(0, 40);
  await pool.query(`INSERT INTO crm_settings (key, value) VALUES ('main', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(next)]);
  cache.at = 0;
  return getSettings(pool);
}

// ---- đồng bộ danh sách khách từ hóa đơn
let lastSync = 0;
async function syncCustomers(pool, force = false) {
  if (!force && Date.now() - lastSync < 20000) return;
  lastSync = Date.now();
  const names = (await pool.query("SELECT DISTINCT customer_name FROM cukcuk_invoices WHERE cust_key IS NULL")).rows;
  for (const r of names) {
    const p = parseCustomerName(r.customer_name);
    // '' = không phải khách (vãng lai / không tên) để khỏi xử lý lại
    await pool.query('UPDATE cukcuk_invoices SET cust_key = $2, cust_phone = $3, cust_display = $4, cust_group = $5 WHERE customer_name IS NOT DISTINCT FROM $1 AND cust_key IS NULL',
      [r.customer_name, p && !p.walkin ? p.key : '', p ? p.phone : '', p ? p.name : '', p ? p.group : '']);
  }
  const fresh = (await pool.query(`
    SELECT i.cust_key, i.cust_phone, (array_agg(i.cust_display ORDER BY i.inv_date DESC))[1] AS name, (array_agg(i.customer_name ORDER BY i.inv_date DESC))[1] AS raw
    FROM cukcuk_invoices i
    WHERE i.cust_key <> '' AND NOT EXISTS (SELECT 1 FROM crm_customers c WHERE c.cust_key = i.cust_key)
    GROUP BY i.cust_key, i.cust_phone`)).rows;
  for (const f of fresh) {
    const p = parseCustomerName(f.raw) || {};
    await pool.query(`INSERT INTO crm_customers (cust_key, name, phone, source, ref_by, card_token) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cust_key) DO NOTHING`,
      [f.cust_key, f.name || p.name || 'Khách', f.cust_phone || null, p.source || null, p.refBy || null, newToken()]);
  }
  if (names.length || fresh.length) cache.at = 0;
}

// ---- thống kê từng khách + hạng + phân khúc
const cache = { at: 0, data: null };
const REV = '(amount - discount + service_fee - tax_reduction)';

function tierFor(settings, metric, override) {
  if (override) { const t = settings.tiers.find((x) => x.key === override); if (t) return t; }
  let cur = settings.tiers[0];
  for (const t of settings.tiers) if (metric >= t.min) cur = t;
  return cur;
}
function segmentFor(c, settings, today) {
  if (!c.visits) return 'none';
  const rec = daysBetween(c.lastVisit, today);
  if (c.visits <= 1 && daysBetween(c.firstVisit, today) <= settings.newDays) return 'new';
  if (rec > settings.lostDays) return 'lost';
  if (c.visits >= 2 && rec > settings.winbackDays) return 'at_risk';
  if (c.visits >= 4 && rec <= settings.winbackDays) return 'loyal';
  return 'regular';
}
const SEGMENTS = { new: 'Khách mới', loyal: 'Thân thiết', regular: 'Thường xuyên', at_risk: 'Có nguy cơ rời bỏ', lost: 'Đã mất', none: 'Chưa phát sinh' };

async function loadAll(pool, force = false) {
  await syncCustomers(pool, force);
  if (!force && cache.data && Date.now() - cache.at < 30000) return cache.data;
  const settings = await getSettings(pool);
  const today = todayVn();
  const custs = (await pool.query(`SELECT c.*, COALESCE((SELECT SUM(points) FROM crm_points_ledger l WHERE l.customer_id = c.id), 0) AS ledger_points,
    (SELECT MAX(created_at) FROM crm_interactions i WHERE i.customer_id = c.id) AS last_contact FROM crm_customers c ORDER BY c.id`)).rows;
  const per = (await pool.query(`
    SELECT cust_key, branch_id, COUNT(*) AS invoices, COUNT(DISTINCT inv_date) AS visits, to_char(MIN(inv_date), 'YYYY-MM-DD') AS first_visit, to_char(MAX(inv_date), 'YYYY-MM-DD') AS last_visit,
           SUM(${REV}) AS spend, SUM(people) AS guests, SUM(${REV}) FILTER (WHERE inv_date >= CURRENT_DATE - 365) AS spend12
    FROM cukcuk_invoices WHERE cust_key <> '' GROUP BY cust_key, branch_id`)).rows;
  const months = (await pool.query(`
    SELECT cust_key, to_char(inv_date, 'YYYY-MM') AS ym, SUM(${REV}) AS spend FROM cukcuk_invoices
    WHERE cust_key <> '' AND inv_date >= date_trunc('month', CURRENT_DATE - interval '11 months') GROUP BY cust_key, ym`)).rows;
  const byKey = new Map();
  per.forEach((r) => { if (!byKey.has(r.cust_key)) byKey.set(r.cust_key, { branches: {}, months: {} }); byKey.get(r.cust_key).branches[r.branch_id] = { invoices: Number(r.invoices), visits: Number(r.visits), firstVisit: r.first_visit, lastVisit: r.last_visit, spend: Number(r.spend) || 0, guests: Number(r.guests) || 0, spend12: Number(r.spend12) || 0 }; });
  months.forEach((r) => { if (byKey.has(r.cust_key)) byKey.get(r.cust_key).months[r.ym] = Number(r.spend) || 0; });

  const list = custs.map((c) => {
    const st = byKey.get(c.cust_key) || { branches: {}, months: {} };
    const bs = Object.values(st.branches);
    const spend = bs.reduce((a, b) => a + b.spend, 0);
    const spend12 = bs.reduce((a, b) => a + b.spend12, 0);
    const visits = bs.reduce((a, b) => a + b.visits, 0);
    const firstVisit = bs.map((b) => b.firstVisit).sort()[0] || '';
    const lastVisit = bs.map((b) => b.lastVisit).sort().pop() || '';
    const bestMonth = Math.max(0, ...Object.values(st.months));
    const metric = settings.tierPeriod === 'lifetime' ? spend : settings.tierPeriod === 'rolling12' ? spend12 : bestMonth;
    const tier = tierFor(settings, metric, c.tier_override);
    const idx = settings.tiers.findIndex((t) => t.key === tier.key);
    const next = settings.tiers[idx + 1] || null;
    const obj = {
      id: c.id, memberNo: c.member_no, memberCode: 'FEN-' + String(c.member_no).padStart(6, '0'), key: c.cust_key, name: c.name, phone: c.phone || '', email: c.email || '', gender: c.gender || '',
      birthday: c.birthday ? new Date(new Date(c.birthday).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10) : '', address: c.address || '', company: c.company || '',
      source: c.source || '', socialLink: c.social_link || '', refBy: c.ref_by || '', notes: c.notes || '', preferences: c.preferences || '', allergies: c.allergies || '', tags: c.tags || [], status: c.status,
      ownerId: c.owner_id, branchId: c.branch_id, isManual: c.is_manual, tierOverride: c.tier_override || '', cardToken: c.card_token, createdAt: c.created_at,
      lastContact: c.last_contact, byBranch: st.branches, branches: Object.keys(st.branches),
      spend, spend12, bestMonth, visits, invoices: bs.reduce((a, b) => a + b.invoices, 0), guests: bs.reduce((a, b) => a + b.guests, 0), firstVisit, lastVisit,
      avgBill: bs.reduce((a, b) => a + b.invoices, 0) ? spend / bs.reduce((a, b) => a + b.invoices, 0) : 0,
      tier: tier.key, tierName: tier.name, tierMetric: metric,
      nextTier: next ? { key: next.key, name: next.name, min: next.min, need: Math.max(0, next.min - metric) } : null,
      points: Math.max(0, Math.floor(spend / settings.pointsRate) + Number(c.ledger_points || 0)),
      recencyDays: lastVisit ? daysBetween(lastVisit, today) : null
    };
    obj.segment = segmentFor(obj, settings, today);
    return obj;
  });
  cache.data = { settings, list, today };
  cache.at = Date.now();
  return cache.data;
}
const invalidate = () => { cache.at = 0; };

// lọc theo chi nhánh được phép: khách POS phải có phát sinh ở chi nhánh được gán; khách nhập tay theo chi nhánh của khách (trống = mọi người thấy)
function scopeFor(user, allBranchIds) {
  if (user.role === 'admin') return null;
  return new Set((user.branchIds || []).filter((b) => allBranchIds.includes(b)));
}
function visibleTo(c, scope) {
  if (!scope) return true;
  if (c.isManual && !c.branches.length) return !c.branchId || scope.has(c.branchId);
  return c.branches.some((b) => scope.has(b)) || (c.isManual && c.branchId && scope.has(c.branchId));
}
// che số liệu của chi nhánh ngoài phạm vi
function maskFor(c, scope, settings, today) {
  if (!scope) return c;
  const byBranch = Object.fromEntries(Object.entries(c.byBranch).filter(([b]) => scope.has(b)));
  const bs = Object.values(byBranch);
  const spend = bs.reduce((a, b) => a + b.spend, 0);
  const out = { ...c, byBranch, branches: Object.keys(byBranch), spend, visits: bs.reduce((a, b) => a + b.visits, 0), invoices: bs.reduce((a, b) => a + b.invoices, 0),
    guests: bs.reduce((a, b) => a + b.guests, 0), spend12: bs.reduce((a, b) => a + b.spend12, 0), avgBill: bs.reduce((a, b) => a + b.invoices, 0) ? spend / bs.reduce((a, b) => a + b.invoices, 0) : 0,
    firstVisit: bs.map((b) => b.firstVisit).sort()[0] || '', lastVisit: bs.map((b) => b.lastVisit).sort().pop() || '' };
  if (settings && today) {
    out.recencyDays = out.lastVisit ? daysBetween(out.lastVisit, today) : null;
    out.segment = segmentFor(out, settings, today);
  }
  return out;
}

module.exports = { init, getSettings, saveSettings, loadAll, invalidate, syncCustomers, parseCustomerName, scopeFor, visibleTo, maskFor, newToken, DEFAULT_SETTINGS, SEGMENTS, todayVn, daysBetween, REV };
