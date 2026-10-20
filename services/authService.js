// Đăng nhập, phiên làm việc, phân quyền và quản lý tài khoản.
// - Admin: toàn quyền (mọi chức năng + quản lý tài khoản).
// - Quản lý / Nhân viên: chỉ dùng CRM (/api/crm/*), mỗi người được gán các chi nhánh được xem.
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET
  || crypto.createHash('sha256').update('fen-izakaya|' + (process.env.DATABASE_URL || 'dev')).digest('hex');
const COOKIE = 'fen_sid';
const SESSION_DAYS = 30;
const ROLES = ['admin', 'manager', 'staff'];
// Các chức năng (tab) có thể cấp quyền riêng cho từng tài khoản
const MODULES = [
  { key: 'plan', label: 'Kế hoạch mua' }, { key: 'sales', label: 'Doanh thu theo món' }, { key: 'revenue', label: 'Báo cáo doanh thu' },
  { key: 'stock', label: 'Tồn kho' }, { key: 'books', label: 'Sổ mua hàng' }, { key: 'suppliers', label: 'Nhà cung cấp' },
  { key: 'payables', label: 'Công nợ NCC' }, { key: 'sync', label: 'Đồng bộ & ghép món' }, { key: 'crm', label: 'CRM Khách hàng' }
];
const MODULE_KEYS = MODULES.map((m) => m.key);

// API nào thuộc chức năng nào (chỉ cần có một trong các quyền liệt kê). Không có trong bảng = chỉ Admin.
const RULES = [
  [/^\/api\/crm\//, ['crm']],
  [/^\/api\/branches\/[^/]+\/buyer$/, ['plan']],
  [/^\/api\/branches(\/[^/]+)?$/, ['*'], 'GET'],
  [/^\/api\/purchase-plans/, ['plan']],
  [/^\/api\/(materials|dishes|material-list)/, ['plan', 'sync']],
  [/^\/api\/bom\/upload/, ['sync']],
  [/^\/api\/beverage/, ['plan']],
  [/^\/api\/purchase-orders/, ['plan', 'books']],
  [/^\/api\/purchase-books/, ['books']],
  [/^\/api\/units/, ['books']],
  [/^\/api\/sales\/report/, ['sales']],
  [/^\/api\/sales\//, ['sync']],
  [/^\/api\/menu\/add-missing/, ['revenue']],
  [/^\/api\/menu\//, ['sync']],
  [/^\/api\/inventory\/(import|record)/, ['sync']],
  [/^\/api\/inventory\//, ['plan']],
  [/^\/api\/stock\//, ['stock']],
  [/^\/api\/suppliers\/import/, ['sync']],
  [/^\/api\/suppliers/, ['suppliers', 'plan', 'books', 'payables']],
  [/^\/api\/payables\/import/, ['sync']],
  [/^\/api\/payables/, ['payables']],
  [/^\/api\/revenue\/import/, ['sync']],
  [/^\/api\/revenue\//, ['revenue']],
  [/^\/api\/auth\/sync-token$/, ['sync']]
];
function allowedFor(user, method, path) {
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  for (const [re, mods, onlyMethod] of RULES) {
    if (!re.test(path)) continue;
    if (onlyMethod && method !== onlyMethod) continue;
    return mods.includes('*') ? perms.length > 0 : mods.some((m) => perms.includes(m));
  }
  return false;
}
const cleanPerms = (p) => (Array.isArray(p) ? Array.from(new Set(p.filter((x) => MODULE_KEYS.includes(x)))) : ['crm']);

// danh sách mã chi nhánh (để chặn truy cập chi nhánh không được gán)
let branchCache = { at: 0, ids: [] };
async function knownBranchIds(pool) {
  if (Date.now() - branchCache.at > 60000) {
    try { branchCache = { at: Date.now(), ids: (await pool.query('SELECT branch_id FROM branches')).rows.map((r) => r.branch_id) }; } catch (e) { /* giữ bản cũ */ }
  }
  return branchCache.ids;
}

// ---- mật khẩu (scrypt, có muối)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---- token đồng bộ (tiện ích Chrome gửi dữ liệu về app, không có cookie đăng nhập)
const SYNC_PATHS = /^\/api\/(sales\/import|inventory\/import|suppliers\/import|payables\/import|revenue\/import)$/;
function signSyncToken(hours = 6) {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + hours * 3600 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update('sync.' + body).digest('base64url');
  return `${body}.${sig}`;
}
function verifySyncToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return false;
  const want = crypto.createHmac('sha256', SECRET).update('sync.' + body).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()).exp > Date.now(); } catch (e) { return false; }
}

const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => {
  const i = c.indexOf('=');
  return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
}));
function setSessionCookie(res, token, maxAgeSec) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function init(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_users (
    id SERIAL PRIMARY KEY, username VARCHAR(60) NOT NULL, full_name VARCHAR(120), password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'staff', branch_ids TEXT[] DEFAULT '{}', active BOOLEAN DEFAULT TRUE,
    phone VARCHAR(30), created_at TIMESTAMP DEFAULT NOW(), last_login TIMESTAMP
  )`);
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower ON app_users (lower(username))');
  await pool.query("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions TEXT[] DEFAULT '{crm}'");
  await pool.query(`CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash VARCHAR(64) PRIMARY KEY, user_id INT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), expires_at TIMESTAMP NOT NULL, last_seen TIMESTAMP DEFAULT NOW()
  )`);
  const n = (await pool.query('SELECT COUNT(*) AS n FROM app_users')).rows[0].n;
  if (Number(n) === 0) {
    // Tài khoản quản trị mặc định theo yêu cầu: đổi mật khẩu ngay sau khi cài xong
    await pool.query("INSERT INTO app_users (username, full_name, password_hash, role) VALUES ('Admin', 'Quản trị viên', $1, 'admin')", [hashPassword('Aa123456@')]);
    console.log('👤 Đã tạo tài khoản Admin mặc định');
  }
}

// ---- chống dò mật khẩu: tối đa 6 lần sai / 10 phút cho mỗi (IP + tên đăng nhập)
const fails = new Map();
function lockedOut(key) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 10 * 60 * 1000) { fails.delete(key); return false; }
  return f.n >= 6;
}
function noteFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > 10 * 60 * 1000) fails.set(key, { n: 1, first: Date.now() });
  else f.n += 1;
}

// ---- middleware: gắn req.user, chặn API khi chưa đăng nhập hoặc không đủ quyền
function middleware(pool) {
  return async (req, res, next) => {
    const url = req.path;
    if (!url.startsWith('/api/')) return next();
    try {
      const sid = parseCookies(req)[COOKIE];
      if (sid) {
        const r = await pool.query(`SELECT u.id, u.username, u.full_name, u.role, u.branch_ids, u.permissions, u.active, s.token_hash
          FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [sha256(sid)]);
        if (r.rows[0] && r.rows[0].active) {
          const u = r.rows[0];
          req.user = { id: u.id, username: u.username, fullName: u.full_name || u.username, role: u.role, branchIds: u.branch_ids || [], permissions: u.role === 'admin' ? MODULE_KEYS : (u.permissions || ['crm']) };
          req.sessionHash = u.token_hash;
        }
      }
    } catch (e) { /* coi như chưa đăng nhập */ }

    const open = url === '/api/auth/login' || url === '/api/auth/me' || url.startsWith('/api/card/');
    if (open) return next();
    if (!req.user) {
      // tiện ích đồng bộ: chỉ được gọi đúng các API nhập dữ liệu và phải có token do Admin cấp
      if (req.method === 'POST' && SYNC_PATHS.test(url) && verifySyncToken(req.headers['x-sync-token'])) {
        req.user = { id: 0, username: 'sync', fullName: 'Tiện ích đồng bộ', role: 'admin', branchIds: [], permissions: MODULE_KEYS, sync: true };
        return next();
      }
      return res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập' });
    }
    if (url.startsWith('/api/auth/') && url !== '/api/auth/sync-token') return next();
    if (!allowedFor(req.user, req.method, url)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Tài khoản của bạn không có quyền dùng chức năng này' });
    }
    if (req.user.role !== 'admin') {
      // chỉ được dùng dữ liệu của chi nhánh được gán
      const ids = await knownBranchIds(pool);
      const cands = [...url.split('/').map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } }), req.query.branch, req.query.branchId, req.body && req.body.branchId].filter(Boolean).map(String);
      if (cands.some((c) => ids.includes(c) && !(req.user.branchIds || []).includes(c))) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN_BRANCH', message: 'Bạn không được xem dữ liệu của chi nhánh này' });
      }
    }
    return next();
  };
}

const requireAdmin = (req, res, next) => (req.user && req.user.role === 'admin' ? next() : res.status(403).json({ success: false, message: 'Chỉ Admin mới được thực hiện' }));

function registerRoutes(app, pool) {
  app.post('/api/auth/login', async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) return res.status(400).json({ success: false, message: 'Nhập tên đăng nhập và mật khẩu' });
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (lockedOut(key)) return res.status(429).json({ success: false, message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 10 phút' });
    try {
      const r = await pool.query('SELECT * FROM app_users WHERE lower(username) = lower($1)', [username]);
      const u = r.rows[0];
      if (!u || !u.active || !verifyPassword(password, u.password_hash)) {
        noteFail(key);
        return res.status(401).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu' });
      }
      fails.delete(key);
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query("INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' days')::interval)", [sha256(token), u.id, String(SESSION_DAYS)]);
      await pool.query('UPDATE app_users SET last_login = NOW() WHERE id = $1', [u.id]);
      await pool.query("DELETE FROM app_sessions WHERE expires_at < NOW()");
      setSessionCookie(res, token, SESSION_DAYS * 86400);
      return res.json({ success: true, data: { id: u.id, username: u.username, fullName: u.full_name || u.username, role: u.role, branchIds: u.branch_ids || [], permissions: u.role === 'admin' ? MODULE_KEYS : (u.permissions || ['crm']) } });
    } catch (e) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  app.get('/api/auth/me', (req, res) => res.json({ success: true, data: req.user || null }));

  app.post('/api/auth/logout', async (req, res) => {
    if (req.sessionHash) await pool.query('DELETE FROM app_sessions WHERE token_hash = $1', [req.sessionHash]).catch(() => {});
    setSessionCookie(res, '', 0);
    return res.json({ success: true });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!req.user || req.user.sync) return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập' });
    if (String(newPassword || '').length < 8) return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
    try {
      const u = (await pool.query('SELECT password_hash FROM app_users WHERE id = $1', [req.user.id])).rows[0];
      if (!u || !verifyPassword(currentPassword || '', u.password_hash)) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
      await pool.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [hashPassword(newPassword), req.user.id]);
      // đăng xuất các phiên khác
      await pool.query('DELETE FROM app_sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, req.sessionHash || '']);
      return res.json({ success: true, message: 'Đã đổi mật khẩu' });
    } catch (e) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  // token cho tiện ích Chrome đồng bộ (Admin cấp, hiệu lực 6 giờ)
  app.get('/api/auth/sync-token', (req, res) => (req.user && (req.user.role === 'admin' || (req.user.permissions || []).includes('sync')) ? res.json({ success: true, data: { token: signSyncToken(6) } }) : res.status(403).json({ success: false, message: 'Không có quyền đồng bộ' })));

  // ---- quản lý tài khoản (Admin)
  app.get('/api/users', requireAdmin, async (req, res) => {
    const r = await pool.query('SELECT id, username, full_name, role, branch_ids, permissions, active, phone, created_at, last_login FROM app_users ORDER BY id');
    res.json({ success: true, data: r.rows });
  });
  const cleanUser = (b) => ({
    fullName: String(b.fullName || '').trim().substring(0, 120),
    role: ROLES.includes(b.role) ? b.role : 'staff',
    branchIds: Array.isArray(b.branchIds) ? b.branchIds.map(String).slice(0, 50) : [],
    phone: String(b.phone || '').trim().substring(0, 30),
    permissions: cleanPerms(b.permissions)
  });
  app.post('/api/users', requireAdmin, async (req, res) => {
    const username = String((req.body && req.body.username) || '').trim();
    const password = String((req.body && req.body.password) || '');
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) return res.status(400).json({ success: false, message: 'Tên đăng nhập 3-40 ký tự, chỉ gồm chữ không dấu, số, . _ -' });
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' });
    const c = cleanUser(req.body);
    try {
      const r = await pool.query(`INSERT INTO app_users (username, full_name, password_hash, role, branch_ids, phone, permissions) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [username, c.fullName || username, hashPassword(password), c.role, c.branchIds, c.phone, c.permissions]);
      return res.json({ success: true, data: { id: r.rows[0].id } });
    } catch (e) {
      return res.status(e.code === '23505' ? 409 : 500).json({ success: false, message: e.code === '23505' ? 'Tên đăng nhập đã tồn tại' : e.message });
    }
  });
  app.put('/api/users/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const target = (await pool.query('SELECT * FROM app_users WHERE id = $1', [id])).rows[0];
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    const c = cleanUser({ ...target, fullName: target.full_name, branchIds: target.branch_ids, permissions: target.permissions, ...req.body });
    let active = req.body.active === undefined ? target.active : !!req.body.active;
    let role = c.role;
    if (target.username.toLowerCase() === 'admin') { role = 'admin'; active = true; } // luôn giữ Admin
    await pool.query('UPDATE app_users SET full_name = $2, role = $3, branch_ids = $4, phone = $5, active = $6, permissions = $7 WHERE id = $1', [id, c.fullName || target.username, role, c.branchIds, c.phone, active, c.permissions]);
    if (!active) await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [id]);
    return res.json({ success: true });
  });
  app.post('/api/users/:id/reset-password', requireAdmin, async (req, res) => {
    const password = String((req.body && req.body.password) || '');
    if (password.length < 8) return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' });
    await pool.query('UPDATE app_users SET password_hash = $1 WHERE id = $2', [hashPassword(password), Number(req.params.id)]);
    await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [Number(req.params.id)]);
    return res.json({ success: true, message: 'Đã đặt lại mật khẩu' });
  });
  app.delete('/api/users/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const target = (await pool.query('SELECT username FROM app_users WHERE id = $1', [id])).rows[0];
    if (!target) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
    if (target.username.toLowerCase() === 'admin' || id === req.user.id) return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Admin hoặc chính bạn' });
    await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM app_users WHERE id = $1', [id]);
    return res.json({ success: true });
  });
}

module.exports = { init, middleware, registerRoutes, requireAdmin, hashPassword, verifyPassword, MODULES };
