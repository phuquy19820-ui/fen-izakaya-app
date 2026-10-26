// API CRM (/api/crm/*) và thẻ thành viên công khai (/api/card/:token).
const crm = require('./crmService');

const STAGES = ['new', 'consulting', 'quoted', 'deposit', 'won', 'lost'];
const TASK_PRIORITIES = ['low', 'normal', 'high'];
const INTERACTION_TYPES = ['note', 'call', 'zalo', 'sms', 'messenger', 'email', 'meeting', 'visit', 'feedback', 'complaint'];

const str = (v, n) => String(v == null ? '' : v).trim().substring(0, n);
const dateOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const isManager = (u) => u.role === 'admin' || u.role === 'manager';

function register(app, pool) {
  const wrap = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) { console.error('CRM error:', e); res.status(500).json({ success: false, message: e.message }); }
  };
  const needManager = (req, res) => { if (!isManager(req.user)) { res.status(403).json({ success: false, message: 'Chức năng này dành cho Quản lý/Admin' }); return false; } return true; };

  async function context(req) {
    const branches = (await pool.query('SELECT branch_id, branch_name FROM branches WHERE is_active IS NOT FALSE ORDER BY branch_name')).rows;
    const allIds = branches.map((b) => b.branch_id);
    let scope = crm.scopeFor(req.user, allIds);
    const data = await crm.loadAll(pool);
    const allowed = scope ? branches.filter((b) => scope.has(b.branch_id)) : branches;
    // Tab chi nhánh: ?branch=<mã> chỉ xem số liệu của đúng chi nhánh đó (phải nằm trong quyền của người dùng)
    const only = String(req.query.branch || '');
    if (only && allowed.some((b) => b.branch_id === only)) scope = new Set([only]);
    return { branches: allowed, scope, data, allIds, only: scope && scope.size === 1 && only ? only : '' };
  }
  const visibleList = (ctx) => ctx.data.list.filter((c) => crm.visibleTo(c, ctx.scope)).map((c) => crm.maskFor(c, ctx.scope, ctx.data.settings, ctx.data.today));
  const slim = (c) => ({
    id: c.id, memberCode: c.memberCode, name: c.name, phone: c.phone, source: c.source, tier: c.tier, tierName: c.tierName, segment: c.segment, visits: c.visits, lastVisit: c.lastVisit,
    spend: c.spend, spend12: c.spend12, points: c.points, tags: c.tags, status: c.status, branches: c.branches, birthday: c.birthday, ownerId: c.ownerId, recencyDays: c.recencyDays,
    lastContact: c.lastContact, avgBill: c.avgBill, email: c.email, refBy: c.refBy
  });
  const branchAllowedSql = (ctx) => (ctx.scope ? Array.from(ctx.scope) : ctx.allIds);

  // ---- thông tin chung
  app.get('/api/crm/meta', wrap(async (req, res) => {
    const ctx = await context(req);
    const users = (await pool.query('SELECT id, full_name, username, role FROM app_users WHERE active ORDER BY full_name')).rows.map((u) => ({ id: u.id, name: u.full_name || u.username, role: u.role }));
    res.json({ success: true, data: { user: req.user, branches: ctx.branches, settings: ctx.data.settings, segments: crm.SEGMENTS, users, stages: STAGES, interactionTypes: INTERACTION_TYPES } });
  }));

  // ---- danh sách khách
  const filterCustomers = (list, q, ctx) => {
    const text = String(q.q || '').trim().toLowerCase();
    const textN = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const digits = text.replace(/\D/g, '');
    let out = list.filter((c) => (q.status === 'all' ? true : c.status === (q.status || 'active')));
    if (text) {
      out = out.filter((c) => {
        const hay = (c.name + ' ' + c.memberCode + ' ' + c.email + ' ' + c.refBy).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
        return hay.includes(textN) || (digits.length >= 3 && c.phone.includes(digits));
      });
    }
    if (q.branch) out = out.filter((c) => c.branches.includes(q.branch) || c.branchId === q.branch);
    if (q.source) out = out.filter((c) => c.source === q.source);
    if (q.tier) out = out.filter((c) => c.tier === q.tier);
    if (q.segment) out = out.filter((c) => c.segment === q.segment);
    if (q.tag) out = out.filter((c) => c.tags.includes(q.tag));
    if (q.owner) out = out.filter((c) => String(c.ownerId || '') === String(q.owner));
    if (q.hasPhone === '1') out = out.filter((c) => c.phone);
    if (q.minSpend) out = out.filter((c) => c.spend >= Number(q.minSpend));
    if (q.maxSpend) out = out.filter((c) => c.spend <= Number(q.maxSpend));
    if (q.lastFrom) out = out.filter((c) => c.lastVisit && c.lastVisit >= q.lastFrom);
    if (q.lastTo) out = out.filter((c) => c.lastVisit && c.lastVisit <= q.lastTo);
    if (q.noVisitDays) out = out.filter((c) => c.recencyDays !== null && c.recencyDays >= Number(q.noVisitDays));
    if (q.birthdayMonth) out = out.filter((c) => c.birthday && Number(c.birthday.slice(5, 7)) === Number(q.birthdayMonth));
    const key = ['spend', 'spend12', 'visits', 'lastVisit', 'name', 'memberNo', 'points', 'avgBill', 'recencyDays'].includes(q.sort) ? q.sort : 'spend';
    const dir = q.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (typeof x === 'string' || typeof y === 'string') return String(x || '').localeCompare(String(y || ''), 'vi') * dir;
      return ((Number(x) || 0) - (Number(y) || 0)) * dir;
    });
    return out;
  };

  app.get('/api/crm/customers', wrap(async (req, res) => {
    const ctx = await context(req);
    const list = filterCustomers(visibleList(ctx), req.query, ctx);
    const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const tags = Array.from(new Set(visibleList(ctx).flatMap((c) => c.tags))).sort();
    const sources = Array.from(new Set(visibleList(ctx).map((c) => c.source).filter(Boolean))).sort();
    res.json({ success: true, data: { total: list.length, page, pageSize, items: list.slice((page - 1) * pageSize, page * pageSize).map(slim), totalSpend: list.reduce((a, c) => a + c.spend, 0), tags, sources } });
  }));

  app.get('/api/crm/export', wrap(async (req, res) => {
    if (!needManager(req, res)) return;
    const ctx = await context(req);
    const list = filterCustomers(visibleList(ctx), req.query, ctx);
    const cols = ['Mã thành viên', 'Tên', 'Số điện thoại', 'Email', 'Nguồn', 'Người giới thiệu', 'Hạng', 'Phân khúc', 'Số lần ghé', 'Lần cuối', 'Tổng chi tiêu', 'Chi tiêu 12 tháng', 'Điểm', 'Sinh nhật', 'Thẻ (tags)', 'Ghi chú'];
    const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const full = new Map(ctx.data.list.map((c) => [c.id, c]));
    const rows = list.map((c) => [c.memberCode, c.name, c.phone, c.email, c.source, c.refBy, c.tierName, crm.SEGMENTS[c.segment], c.visits, c.lastVisit, Math.round(c.spend), Math.round(c.spend12), c.points, c.birthday, c.tags.join('; '), (full.get(c.id) || {}).notes]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="khach-hang-crm.csv"');
    res.send('﻿' + [cols, ...rows].map((r) => r.map(esc).join(',')).join('\r\n'));
  }));

  // ---- hồ sơ khách 360°
  app.get('/api/crm/customers/:id', wrap(async (req, res) => {
    const ctx = await context(req);
    const id = Number(req.params.id);
    const raw = ctx.data.list.find((c) => c.id === id);
    if (!raw || !crm.visibleTo(raw, ctx.scope)) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    const c = crm.maskFor(raw, ctx.scope, ctx.data.settings, ctx.data.today);
    const br = branchAllowedSql(ctx);
    const visits = (await pool.query(`SELECT branch_id, to_char(inv_date, 'YYYY-MM-DD') AS d, ref_no, time_in, area, people, ${crm.REV} AS rev, discount
      FROM cukcuk_invoices WHERE cust_key = $1 AND branch_id = ANY($2) ORDER BY inv_date DESC, ref_no DESC LIMIT 60`, [raw.key, br])).rows
      .map((v) => ({ ...v, rev: Number(v.rev) || 0, discount: Number(v.discount) || 0, people: Number(v.people) || 0 }));
    const items = (await pool.query(`SELECT i.branch_id, to_char(i.inv_date, 'YYYY-MM-DD') AS d, i.ref_no, i.item_name, i.kind, SUM(i.qty) AS qty, SUM(i.amount - i.discount) AS amount
      FROM cukcuk_invoice_items i JOIN cukcuk_invoices v ON v.branch_id = i.branch_id AND v.inv_date = i.inv_date AND v.ref_no = i.ref_no
      WHERE v.cust_key = $1 AND v.branch_id = ANY($2) GROUP BY i.branch_id, i.inv_date, i.ref_no, i.item_name, i.kind`, [raw.key, br])).rows;
    const itemsByVisit = {};
    const favorites = new Map();
    items.forEach((it) => {
      const k = `${it.branch_id}|${it.d}|${it.ref_no}`;
      (itemsByVisit[k] = itemsByVisit[k] || []).push({ name: it.item_name, qty: Number(it.qty) || 0, amount: Number(it.amount) || 0 });
      if (it.kind !== 'Mặt hàng khác') {
        const f = favorites.get(it.item_name) || { name: it.item_name, kind: it.kind, qty: 0, amount: 0, times: 0 };
        f.qty += Number(it.qty) || 0; f.amount += Number(it.amount) || 0; f.times += 1;
        favorites.set(it.item_name, f);
      }
    });
    visits.forEach((v) => { v.items = itemsByVisit[`${v.branch_id}|${v.d}|${v.ref_no}`] || []; });
    const monthly = (await pool.query(`SELECT to_char(inv_date, 'YYYY-MM') AS ym, SUM(${crm.REV}) AS spend, COUNT(DISTINCT inv_date) AS visits FROM cukcuk_invoices
      WHERE cust_key = $1 AND branch_id = ANY($2) AND inv_date >= date_trunc('month', CURRENT_DATE - interval '11 months') GROUP BY ym ORDER BY ym`, [raw.key, br])).rows
      .map((m) => ({ ym: m.ym, spend: Number(m.spend) || 0, visits: Number(m.visits) || 0 }));
    const interactions = (await pool.query('SELECT * FROM crm_interactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100', [id])).rows;
    const tasks = (await pool.query("SELECT * FROM crm_tasks WHERE customer_id = $1 ORDER BY (status = 'done'), due_date NULLS LAST LIMIT 50", [id])).rows;
    const deals = (await pool.query('SELECT * FROM crm_deals WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 30', [id])).rows;
    const ledger = (await pool.query('SELECT * FROM crm_points_ledger WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50', [id])).rows;
    res.json({ success: true, data: {
      customer: c, visits, favorites: Array.from(favorites.values()).sort((a, b) => b.qty - a.qty).slice(0, 12), monthly, interactions, tasks, deals, ledger,
      settings: ctx.data.settings, branches: ctx.branches
    } });
  }));

  const EDITABLE = ['name', 'phone', 'email', 'gender', 'birthday', 'address', 'company', 'source', 'notes', 'preferences', 'allergies', 'socialLink'];
  app.put('/api/crm/customers/:id', wrap(async (req, res) => {
    const ctx = await context(req);
    const id = Number(req.params.id);
    const raw = ctx.data.list.find((c) => c.id === id);
    if (!raw || !crm.visibleTo(raw, ctx.scope)) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    const b = req.body || {};
    const sets = [];
    const vals = [id];
    const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    EDITABLE.forEach((k) => {
      if (b[k] === undefined) return;
      if (k === 'birthday') set('birthday', dateOrNull(b[k]));
      else if (k === 'phone') set('phone', str(b[k], 20).replace(/[^\d+]/g, '') || null);
      else if (k === 'notes' || k === 'preferences' || k === 'allergies') set(k, str(b[k], 4000));
      else if (k === 'socialLink') set('social_link', str(b[k], 300) || null);
      else set(k, str(b[k], k === 'name' ? 160 : 300));
    });
    if (Array.isArray(b.tags)) set('tags', b.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 20));
    if (b.status !== undefined && ['active', 'inactive', 'vip', 'blacklist'].includes(b.status)) set('status', b.status);
    if (b.ownerId !== undefined) set('owner_id', b.ownerId ? Number(b.ownerId) : null);
    if (b.branchId !== undefined && raw.isManual) set('branch_id', b.branchId || null);
    if (b.tierOverride !== undefined) {
      if (!needManager(req, res)) return;
      set('tier_override', b.tierOverride && ctx.data.settings.tiers.some((t) => t.key === b.tierOverride) ? b.tierOverride : null);
    }
    if (!sets.length) return res.json({ success: true });
    await pool.query(`UPDATE crm_customers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, vals);
    crm.invalidate();
    res.json({ success: true });
  }));

  app.post('/api/crm/customers', wrap(async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 160);
    if (!name) return res.status(400).json({ success: false, message: 'Nhập tên khách hàng' });
    const phone = str(b.phone, 20).replace(/[^\d+]/g, '');
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);
    const key = digits ? 'p:' + digits : 'm:' + crm.newToken();
    if (digits) {
      const ex = (await pool.query('SELECT id, name FROM crm_customers WHERE cust_key = $1', [key])).rows[0];
      if (ex) return res.status(409).json({ success: false, message: `Số điện thoại này đã có khách "${ex.name}"`, data: { id: ex.id } });
    }
    const r = await pool.query(`INSERT INTO crm_customers (cust_key, name, phone, email, gender, birthday, address, company, source, notes, tags, branch_id, owner_id, is_manual, created_by, card_token)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14,$15) RETURNING id`,
    [key, name, digits || null, str(b.email, 160) || null, str(b.gender, 10) || null, dateOrNull(b.birthday), str(b.address, 300) || null, str(b.company, 160) || null,
      str(b.source, 80) || 'Nhập tay', str(b.notes, 4000) || null, Array.isArray(b.tags) ? b.tags.map((t) => str(t, 30)).filter(Boolean) : [], b.branchId || null,
      b.ownerId ? Number(b.ownerId) : req.user.id, req.user.id, crm.newToken()]);
    crm.invalidate();
    res.json({ success: true, data: { id: r.rows[0].id } });
  }));

  app.delete('/api/crm/customers/:id', wrap(async (req, res) => {
    if (!needManager(req, res)) return;
    const id = Number(req.params.id);
    const raw = (await crm.loadAll(pool)).list.find((c) => c.id === id);
    if (!raw) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (raw.isManual && !raw.visits) {
      await pool.query('DELETE FROM crm_interactions WHERE customer_id = $1', [id]);
      await pool.query('DELETE FROM crm_tasks WHERE customer_id = $1', [id]);
      await pool.query('DELETE FROM crm_points_ledger WHERE customer_id = $1', [id]);
      await pool.query('DELETE FROM crm_customers WHERE id = $1', [id]);
      crm.invalidate();
      return res.json({ success: true, message: 'Đã xóa khách hàng' });
    }
    await pool.query("UPDATE crm_customers SET status = 'inactive' WHERE id = $1", [id]);
    crm.invalidate();
    res.json({ success: true, message: 'Khách có lịch sử mua hàng nên được chuyển sang trạng thái "Ngừng chăm sóc"' });
  }));

  // ---- tương tác, điểm
  app.post('/api/crm/customers/:id/interactions', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const ctx = await context(req);
    const raw = ctx.data.list.find((c) => c.id === id);
    if (!raw || !crm.visibleTo(raw, ctx.scope)) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
    const b = req.body || {};
    const type = INTERACTION_TYPES.includes(b.type) ? b.type : 'note';
    const content = str(b.content, 4000);
    if (!content) return res.status(400).json({ success: false, message: 'Nhập nội dung' });
    const rating = b.rating ? Math.min(5, Math.max(1, Number(b.rating))) : null;
    const follow = dateOrNull(b.followUpDate);
    await pool.query('INSERT INTO crm_interactions (customer_id, type, content, rating, outcome, user_id, user_name, follow_up_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, type, content, rating, str(b.outcome, 120) || null, req.user.id, req.user.fullName, follow]);
    if (follow) {
      await pool.query('INSERT INTO crm_tasks (customer_id, title, description, due_date, priority, assignee_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, `Liên hệ lại: ${raw.name}`, content.substring(0, 300), follow, 'normal', req.user.id, req.user.id]);
    }
    crm.invalidate();
    res.json({ success: true });
  }));
  app.delete('/api/crm/interactions/:id', wrap(async (req, res) => {
    if (!needManager(req, res)) return;
    await pool.query('DELETE FROM crm_interactions WHERE id = $1', [Number(req.params.id)]);
    crm.invalidate();
    res.json({ success: true });
  }));
  app.post('/api/crm/customers/:id/points', wrap(async (req, res) => {
    if (!needManager(req, res)) return;
    const pts = Math.round(Number(req.body.points));
    if (!Number.isFinite(pts) || pts === 0) return res.status(400).json({ success: false, message: 'Nhập số điểm cộng (+) hoặc trừ (-)' });
    await pool.query('INSERT INTO crm_points_ledger (customer_id, points, reason, user_id, user_name) VALUES ($1,$2,$3,$4,$5)', [Number(req.params.id), pts, str(req.body.reason, 200) || (pts > 0 ? 'Cộng điểm' : 'Đổi quà / trừ điểm'), req.user.id, req.user.fullName]);
    crm.invalidate();
    res.json({ success: true });
  }));

  // ---- công việc
  app.get('/api/crm/tasks', wrap(async (req, res) => {
    const status = req.query.status === 'done' ? 'done' : req.query.status === 'all' ? null : 'open';
    const vals = [];
    const where = [];
    if (status) { vals.push(status); where.push(`t.status = $${vals.length}`); }
    if (!isManager(req.user) || req.query.scope === 'mine') { vals.push(req.user.id); where.push(`(t.assignee_id = $${vals.length} OR t.created_by = $${vals.length})`); }
    if (req.query.branch) {
      const ctx = await context(req);
      if (ctx.only) {
        const ids = visibleList(ctx).map((c) => c.id);
        vals.push(ids);
        where.push(`(t.customer_id IS NULL OR t.customer_id = ANY($${vals.length}::int[]))`);
      }
    }
    const r = await pool.query(`SELECT t.*, to_char(t.due_date, 'YYYY-MM-DD') AS due, c.name AS customer_name, c.phone AS customer_phone, u.full_name AS assignee_name
      FROM crm_tasks t LEFT JOIN crm_customers c ON c.id = t.customer_id LEFT JOIN app_users u ON u.id = t.assignee_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (t.status = 'done'), t.due_date NULLS LAST, t.id DESC LIMIT 500`, vals);
    res.json({ success: true, data: r.rows.map((t) => ({ ...t, due_date: t.due })) });
  }));
  app.post('/api/crm/tasks', wrap(async (req, res) => {
    const b = req.body || {};
    const title = str(b.title, 200);
    if (!title) return res.status(400).json({ success: false, message: 'Nhập tiêu đề công việc' });
    const r = await pool.query('INSERT INTO crm_tasks (customer_id, deal_id, title, description, due_date, priority, assignee_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [b.customerId ? Number(b.customerId) : null, b.dealId ? Number(b.dealId) : null, title, str(b.description, 1000) || null, dateOrNull(b.dueDate), TASK_PRIORITIES.includes(b.priority) ? b.priority : 'normal',
        b.assigneeId ? Number(b.assigneeId) : req.user.id, req.user.id]);
    res.json({ success: true, data: { id: r.rows[0].id } });
  }));
  app.put('/api/crm/tasks/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const id = Number(req.params.id);
    const t = (await pool.query('SELECT * FROM crm_tasks WHERE id = $1', [id])).rows[0];
    if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (!isManager(req.user) && t.assignee_id !== req.user.id && t.created_by !== req.user.id) return res.status(403).json({ success: false, message: 'Không có quyền' });
    const status = b.status === 'done' ? 'done' : b.status === 'open' ? 'open' : t.status;
    await pool.query('UPDATE crm_tasks SET title = $2, description = $3, due_date = $4, priority = $5, status = $6, assignee_id = $7, done_at = $8 WHERE id = $1',
      [id, b.title !== undefined ? str(b.title, 200) || t.title : t.title, b.description !== undefined ? str(b.description, 1000) : t.description, b.dueDate !== undefined ? dateOrNull(b.dueDate) : t.due_date,
        TASK_PRIORITIES.includes(b.priority) ? b.priority : t.priority, status, b.assigneeId !== undefined ? (b.assigneeId ? Number(b.assigneeId) : null) : t.assignee_id,
        status === 'done' ? (t.done_at || new Date()) : null]);
    res.json({ success: true });
  }));
  app.delete('/api/crm/tasks/:id', wrap(async (req, res) => {
    const id = Number(req.params.id);
    const t = (await pool.query('SELECT * FROM crm_tasks WHERE id = $1', [id])).rows[0];
    if (!t) return res.json({ success: true });
    if (!isManager(req.user) && t.created_by !== req.user.id) return res.status(403).json({ success: false, message: 'Không có quyền' });
    await pool.query('DELETE FROM crm_tasks WHERE id = $1', [id]);
    res.json({ success: true });
  }));
  // Tự tạo việc chăm sóc: sinh nhật trong 7 ngày tới, khách có nguy cơ rời bỏ (ưu tiên chi tiêu cao)
  app.post('/api/crm/tasks/generate', wrap(async (req, res) => {
    const ctx = await context(req);
    const list = visibleList(ctx).filter((c) => c.status === 'active' || c.status === 'vip');
    const today = ctx.data.today;
    const ym = today.slice(0, 7);
    let created = 0;
    const add = async (autoKey, c, title, desc, due, priority) => {
      const r = await pool.query(`INSERT INTO crm_tasks (customer_id, title, description, due_date, priority, assignee_id, created_by, auto_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (auto_key) DO NOTHING`,
        [c.id, title, desc, due, priority, c.ownerId || req.user.id, req.user.id, autoKey]);
      created += r.rowCount;
    };
    for (const c of list) {
      if (c.birthday) {
        const [, mm, dd] = c.birthday.split('-');
        let next = `${today.slice(0, 4)}-${mm}-${dd}`;
        if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${mm}-${dd}`;
        const d = crm.daysBetween(today, next);
        if (d >= 0 && d <= 7) await add(`bday:${c.id}:${next.slice(0, 4)}`, c, `Chúc mừng sinh nhật: ${c.name}`, `Sinh nhật ${dd}/${mm}. Hạng ${c.tierName}. Gửi lời chúc${(ctx.data.settings.tiers.find((t) => t.key === c.tier) || {}).birthdayVoucher ? ` và voucher sinh nhật ${((ctx.data.settings.tiers.find((t) => t.key === c.tier) || {}).birthdayVoucher).toLocaleString('vi-VN')}đ + bánh sinh nhật (hiệu lực 30 ngày; áp dụng 1 lần/năm, khách đã đăng ký ngày sinh trước ít nhất 30 ngày)` : ''}.`, next, 'high');
      }
    }
    for (const c of list.filter((x) => x.expiringSoon)) await add(`expire:${c.id}:${c.validUntil}`, c, `Hạng ${c.tierName} sắp hết hạn: ${c.name}`, `Hạng hiệu lực đến ${c.validUntil} (còn ${c.expiresInDays} ngày). Chi tiêu 12 tháng hiện tại ${Math.round(c.spend12).toLocaleString('vi-VN')}đ. Nếu không duy trì đủ chi tiêu: ${c.afterTierName}. Hãy nhắc khách để giữ hạng.`, c.validUntil, 'high');
    const risk = list.filter((c) => c.segment === 'at_risk').sort((a, b) => b.spend12 - a.spend12).slice(0, 30);
    for (const c of risk) await add(`winback:${c.id}:${ym}`, c, `Chăm sóc lại khách lâu chưa quay lại: ${c.name}`, `Lần ghé cuối ${c.lastVisit} (${c.recencyDays} ngày trước), tổng chi tiêu ${Math.round(c.spend).toLocaleString('vi-VN')}đ.`, today, c.spend12 > 5000000 ? 'high' : 'normal');
    res.json({ success: true, data: { created } });
  }));

  // ---- cơ hội (đặt tiệc, sự kiện, đoàn...)
  app.get('/api/crm/deals', wrap(async (req, res) => {
    const ctx = await context(req);
    const vals = [branchAllowedSql(ctx)];
    const r = await pool.query(`SELECT d.*, to_char(d.event_date, 'YYYY-MM-DD') AS event, c.name AS customer_name, c.phone AS customer_phone, u.full_name AS owner_name
      FROM crm_deals d LEFT JOIN crm_customers c ON c.id = d.customer_id LEFT JOIN app_users u ON u.id = d.owner_id
      WHERE ${ctx.only ? 'd.branch_id = ANY($1)' : '(d.branch_id IS NULL OR d.branch_id = ANY($1))'} ORDER BY d.event_date NULLS LAST, d.id DESC LIMIT 500`, vals);
    res.json({ success: true, data: r.rows.map((d) => ({ ...d, event_date: d.event, expected_value: Number(d.expected_value) || 0, deposit: Number(d.deposit) || 0 })) });
  }));
  const dealFields = (b) => ({
    title: str(b.title, 200), type: str(b.dealType, 30) || 'Đặt tiệc', branch: b.branchId || null, event: dateOrNull(b.eventDate), guests: b.guests ? Math.max(0, Number(b.guests)) : null,
    value: Math.max(0, Number(b.expectedValue) || 0), deposit: Math.max(0, Number(b.deposit) || 0), notes: str(b.notes, 4000) || null,
    contactName: str(b.contactName, 160) || null, contactPhone: str(b.contactPhone, 30) || null
  });
  app.post('/api/crm/deals', wrap(async (req, res) => {
    const b = req.body || {};
    const f = dealFields(b);
    if (!f.title) return res.status(400).json({ success: false, message: 'Nhập tên cơ hội' });
    const r = await pool.query(`INSERT INTO crm_deals (customer_id, contact_name, contact_phone, title, deal_type, branch_id, event_date, guests, expected_value, deposit, stage, owner_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new',$11,$12,$13) RETURNING id`,
    [b.customerId ? Number(b.customerId) : null, f.contactName, f.contactPhone, f.title, f.type, f.branch, f.event, f.guests, f.value, f.deposit, b.ownerId ? Number(b.ownerId) : req.user.id, f.notes, req.user.id]);
    res.json({ success: true, data: { id: r.rows[0].id } });
  }));
  app.put('/api/crm/deals/:id', wrap(async (req, res) => {
    const b = req.body || {};
    const id = Number(req.params.id);
    const d = (await pool.query('SELECT * FROM crm_deals WHERE id = $1', [id])).rows[0];
    if (!d) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    const f = dealFields({ title: d.title, dealType: d.deal_type, branchId: d.branch_id, eventDate: d.event_date && new Date(new Date(d.event_date).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10), guests: d.guests, expectedValue: d.expected_value, deposit: d.deposit, notes: d.notes, contactName: d.contact_name, contactPhone: d.contact_phone, ...b });
    const stage = STAGES.includes(b.stage) ? b.stage : d.stage;
    const closed = stage === 'won' || stage === 'lost';
    await pool.query(`UPDATE crm_deals SET title = $2, deal_type = $3, branch_id = $4, event_date = $5, guests = $6, expected_value = $7, deposit = $8, notes = $9, contact_name = $10, contact_phone = $11,
      stage = $12, lost_reason = $13, owner_id = $14, customer_id = $15, closed_at = $16, updated_at = NOW() WHERE id = $1`,
    [id, f.title || d.title, f.type, f.branch, f.event, f.guests, f.value, f.deposit, f.notes, f.contactName, f.contactPhone, stage, stage === 'lost' ? str(b.lostReason, 200) || d.lost_reason : null,
      b.ownerId !== undefined ? (b.ownerId ? Number(b.ownerId) : null) : d.owner_id, b.customerId !== undefined ? (b.customerId ? Number(b.customerId) : null) : d.customer_id, closed ? (d.closed_at || new Date()) : null]);
    res.json({ success: true });
  }));
  app.delete('/api/crm/deals/:id', wrap(async (req, res) => {
    if (!needManager(req, res)) return;
    await pool.query('DELETE FROM crm_deals WHERE id = $1', [Number(req.params.id)]);
    res.json({ success: true });
  }));

  // ---- tổng quan
  app.get('/api/crm/dashboard', wrap(async (req, res) => {
    const ctx = await context(req);
    const list = visibleList(ctx).filter((c) => c.status !== 'inactive');
    const today = ctx.data.today;
    const ym = today.slice(0, 7);
    const prevYm = (() => { const d = new Date(Date.parse(today.slice(0, 7) + '-01T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
    const withVisits = list.filter((c) => c.visits > 0);
    const count = (f) => list.filter(f).length;
    const tally = (fn, labels) => {
      const m = {};
      list.forEach((c) => { const k = fn(c); if (k) m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).map(([key, n]) => ({ key, label: (labels && labels[key]) || key, n })).sort((a, b) => b.n - a.n);
    };
    const tierLabels = Object.fromEntries(ctx.data.settings.tiers.map((t) => [t.key, t.name]));
    const monthly = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.parse(today.slice(0, 7) + '-01T00:00:00Z'));
      d.setUTCMonth(d.getUTCMonth() - i);
      const k = d.toISOString().slice(0, 7);
      monthly.push({ ym: k, newCustomers: withVisits.filter((c) => c.firstVisit.startsWith(k)).length });
    }
    const br = branchAllowedSql(ctx);
    const rev = (await pool.query(`SELECT to_char(inv_date, 'YYYY-MM') AS ym, SUM(${crm.REV}) FILTER (WHERE cust_key <> '') AS member_rev, SUM(${crm.REV}) AS total_rev,
      COUNT(*) FILTER (WHERE cust_key <> '') AS member_inv, COUNT(*) AS total_inv
      FROM cukcuk_invoices WHERE branch_id = ANY($1) AND inv_date >= date_trunc('month', CURRENT_DATE - interval '11 months') GROUP BY ym ORDER BY ym`, [br])).rows;
    monthly.forEach((m) => { const r = rev.find((x) => x.ym === m.ym); m.memberRev = r ? Number(r.member_rev) || 0 : 0; m.totalRev = r ? Number(r.total_rev) || 0 : 0; });
    const birthdays = list.filter((c) => c.birthday).map((c) => {
      const [, mm, dd] = c.birthday.split('-');
      let next = `${today.slice(0, 4)}-${mm}-${dd}`;
      if (next < today) next = `${Number(today.slice(0, 4)) + 1}-${mm}-${dd}`;
      return { ...slim(c), next, inDays: crm.daysBetween(today, next) };
    }).filter((c) => c.inDays <= 14).sort((a, b) => a.inDays - b.inDays).slice(0, 12);
    const myTasks = (await pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'open') AS open, COUNT(*) FILTER (WHERE status = 'open' AND due_date < CURRENT_DATE) AS overdue,
      COUNT(*) FILTER (WHERE status = 'open' AND due_date = CURRENT_DATE) AS today FROM crm_tasks WHERE assignee_id = $1 OR created_by = $1`, [req.user.id])).rows[0];
    const deals = (await pool.query(`SELECT stage, COUNT(*) AS n, COALESCE(SUM(expected_value), 0) AS value FROM crm_deals WHERE ${ctx.only ? 'branch_id = ANY($1)' : '(branch_id IS NULL OR branch_id = ANY($1))'} GROUP BY stage`, [br])).rows;
    const upcomingEvents = (await pool.query(`SELECT id, title, deal_type, to_char(event_date, 'YYYY-MM-DD') AS event_date, guests, expected_value, stage FROM crm_deals
      WHERE event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND stage NOT IN ('lost') AND ${ctx.only ? 'branch_id = ANY($1)' : '(branch_id IS NULL OR branch_id = ANY($1))'} ORDER BY event_date LIMIT 8`, [br])).rows;
    const sortedSpend = [...withVisits].sort((a, b) => b.spend - a.spend);
    const totalSpend = sortedSpend.reduce((a, c) => a + c.spend, 0);
    const top10pct = sortedSpend.slice(0, Math.max(1, Math.ceil(sortedSpend.length * 0.1))).reduce((a, c) => a + c.spend, 0);
    res.json({ success: true, data: {
      kpi: {
        total: list.length, withPhone: count((c) => c.phone), withVisits: withVisits.length, newThisMonth: withVisits.filter((c) => c.firstVisit.startsWith(ym)).length,
        newLastMonth: withVisits.filter((c) => c.firstVisit.startsWith(prevYm)).length, active90: count((c) => c.recencyDays !== null && c.recencyDays <= 90),
        returningRate: withVisits.length ? withVisits.filter((c) => c.visits >= 2).length / withVisits.length : 0, avgSpend: withVisits.length ? totalSpend / withVisits.length : 0,
        top10share: totalSpend ? top10pct / totalSpend : 0, atRiskVip: count((c) => c.segment === 'at_risk' && c.tier !== ctx.data.settings.tiers[0].key), totalPoints: list.reduce((a, c) => a + c.points, 0)
      },
      tiers: ctx.data.settings.tiers.map((t) => ({ key: t.key, label: t.name, n: list.filter((c) => c.tier === t.key).length })),
      segments: tally((c) => c.segment, crm.SEGMENTS), sources: tally((c) => c.source || 'Không rõ nguồn').slice(0, 10), monthly, birthdays,
      topCustomers: [...withVisits].sort((a, b) => b.spend12 - a.spend12).slice(0, 10).map(slim),
      atRisk: list.filter((c) => c.segment === 'at_risk').sort((a, b) => b.spend12 - a.spend12).slice(0, 8).map(slim),
      tasks: { open: Number(myTasks.open) || 0, overdue: Number(myTasks.overdue) || 0, today: Number(myTasks.today) || 0 },
      deals: deals.map((d) => ({ stage: d.stage, n: Number(d.n), value: Number(d.value) })), upcomingEvents: upcomingEvents.map((e) => ({ ...e, expected_value: Number(e.expected_value) || 0 }))
    } });
  }));

  app.get('/api/crm/reports', wrap(async (req, res) => {
    const ctx = await context(req);
    const list = visibleList(ctx).filter((c) => c.visits > 0 && c.status !== 'inactive');
    const months = {};
    list.forEach((c) => { const k = c.firstVisit.slice(0, 7); const m = months[k] = months[k] || { ym: k, n: 0, repeat: 0, spend: 0 }; m.n += 1; if (c.visits >= 2) m.repeat += 1; m.spend += c.spend; });
    const cohorts = Object.values(months).sort((a, b) => a.ym.localeCompare(b.ym)).slice(-12).map((m) => ({ ...m, repeatRate: m.n ? m.repeat / m.n : 0, avgSpend: m.n ? m.spend / m.n : 0 }));
    const bySource = {};
    list.forEach((c) => { const k = c.source || 'Không rõ nguồn'; const s = bySource[k] = bySource[k] || { source: k, customers: 0, spend: 0, visits: 0 }; s.customers += 1; s.spend += c.spend; s.visits += c.visits; });
    const byTier = ctx.data.settings.tiers.map((t) => {
      const l = list.filter((c) => c.tier === t.key);
      return { key: t.key, name: t.name, customers: l.length, spend: l.reduce((a, c) => a + c.spend, 0), avgVisits: l.length ? l.reduce((a, c) => a + c.visits, 0) / l.length : 0 };
    });
    const bySegment = Object.keys(crm.SEGMENTS).map((k) => {
      const l = list.filter((c) => c.segment === k);
      return { key: k, name: crm.SEGMENTS[k], customers: l.length, spend: l.reduce((a, c) => a + c.spend, 0), avgSpend: l.length ? l.reduce((a, c) => a + c.spend, 0) / l.length : 0 };
    });
    const brs = {};
    list.forEach((c) => Object.entries(c.byBranch).forEach(([b, v]) => { const x = brs[b] = brs[b] || { branch: b, customers: 0, spend: 0, visits: 0 }; x.customers += 1; x.spend += v.spend; x.visits += v.visits; }));
    const names = Object.fromEntries(ctx.branches.map((b) => [b.branch_id, b.branch_name]));
    const feedback = (await pool.query(`SELECT COUNT(*) AS n, AVG(rating) AS avg, COUNT(*) FILTER (WHERE type = 'complaint') AS complaints FROM crm_interactions WHERE created_at >= NOW() - interval '90 days' AND (rating IS NOT NULL OR type IN ('feedback','complaint'))`)).rows[0];
    const byType = (await pool.query(`SELECT type, COUNT(*) AS n FROM crm_interactions WHERE created_at >= NOW() - interval '30 days' GROUP BY type ORDER BY n DESC`)).rows;
    res.json({ success: true, data: {
      cohorts, bySource: Object.values(bySource).sort((a, b) => b.spend - a.spend), byTier, bySegment,
      byBranch: Object.values(brs).map((b) => ({ ...b, name: names[b.branch] || b.branch })).sort((a, b) => b.spend - a.spend),
      feedback: { n: Number(feedback.n) || 0, avg: feedback.avg ? Number(feedback.avg) : null, complaints: Number(feedback.complaints) || 0 }, interactions30: byType.map((t) => ({ type: t.type, n: Number(t.n) }))
    } });
  }));

  // ---- cài đặt hạng thẻ
  app.get('/api/crm/settings', wrap(async (req, res) => res.json({ success: true, data: await crm.getSettings(pool) })));
  app.put('/api/crm/settings', wrap(async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Chỉ Admin được đổi cài đặt hạng thẻ' });
    const s = await crm.saveSettings(pool, req.body || {});
    crm.invalidate();
    res.json({ success: true, data: s });
  }));

  // ---- thẻ thành viên công khai (khách mở bằng link/QR, không cần đăng nhập)
  app.get('/api/card/:token', wrap(async (req, res) => {
    const token = String(req.params.token || '');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return res.status(404).json({ success: false, message: 'Không tìm thấy thẻ' });
    const data = await crm.loadAll(pool);
    const c = data.list.find((x) => x.cardToken === token);
    if (!c || c.status === 'inactive') return res.status(404).json({ success: false, message: 'Không tìm thấy thẻ' });
    const tiers = data.settings.tiers;
    const idx = tiers.findIndex((t) => t.key === c.tier);
    const cur = tiers[idx];
    const next = tiers[idx + 1] || null;
    const pct = next ? Math.min(100, Math.max(0, Math.round(((c.tierMetric - cur.min) / Math.max(1, next.min - cur.min)) * 100))) : 100;
    const phone = c.phone ? c.phone.slice(0, 3) + '****' + c.phone.slice(-3) : '';
    res.json({ success: true, data: {
      brand: data.settings.brand, name: c.name, memberCode: c.memberCode, phone, tier: c.tier, tierName: c.tierName, perks: cur.perks, points: c.points,
      since: (c.firstVisit || String(c.createdAt || '').slice(0, 10)), visits: c.visits,
      next: next ? { name: next.name, need: Math.max(0, next.min - c.tierMetric), pct } : null, period: data.settings.tierPeriod, validUntil: c.validUntil, expiringSoon: c.expiringSoon, afterTierName: c.afterTierName, tierSource: c.tierSource,
      tiers: tiers.map((t) => ({ key: t.key, name: t.name, min: t.min }))
    } });
  }));
}

module.exports = { register };
