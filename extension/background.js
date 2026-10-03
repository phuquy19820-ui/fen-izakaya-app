const APP_ORIGINS = ['https://fen-izakaya-app-v2.onrender.com'];
const JOB_KEY = 'fenJob';
const JOB_TTL_MS = 30 * 60 * 1000;

const getJob = async () => (await chrome.storage.local.get(JOB_KEY))[JOB_KEY] || null;
const setJob = (job) => chrome.storage.local.set({ [JOB_KEY]: job });

function notifyApp(job, payload) {
  if (!job || !job.appTabId) return;
  chrome.tabs.sendMessage(job.appTabId, { type: 'FEN_STATUS', payload }).catch(() => {});
}

async function update(job, patch) {
  const next = { ...job, ...patch };
  await setJob(next);
  notifyApp(next, { status: next.status, text: next.text, result: next.result });
  return next;
}

function validJob(job) {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  try {
    const u = new URL(job.cukcukUrl);
    return u.protocol === 'https:' && u.hostname.endsWith('.cukcuk.vn') &&
      typeof job.branchId === 'string' && job.branchId.length > 0 &&
      date.test(job.fromDate) && date.test(job.toDate);
  } catch (e) {
    return false;
  }
}

async function startSync(msg, sender) {
  const origin = sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : '';
  if (!APP_ORIGINS.includes(origin)) return { ok: false, error: 'Nguồn không hợp lệ' };
  const j = msg.job || {};
  if (!validJob(j)) {
    notifyApp({ appTabId: sender.tab.id }, { status: 'error', text: 'Thiếu địa chỉ CUKCUK của chi nhánh (Mã công ty CUKCUK) hoặc ngày không hợp lệ.' });
    return { ok: false };
  }
  const tab = await chrome.tabs.create({ url: j.cukcukUrl, active: true });
  await update({
    branchId: j.branchId, fromDate: j.fromDate, toDate: j.toDate, cukcukUrl: j.cukcukUrl,
    appOrigin: origin, appTabId: sender.tab.id, cukcukTabId: tab.id, createdAt: Date.now()
  }, { status: 'waiting_login', text: 'Đã mở CUKCUK. Hãy đăng nhập, tiện ích sẽ tự lấy số liệu.' });
  return { ok: true };
}

async function finishWithRows(job, payload) {
  await update(job, { status: 'running', text: 'Đang gửi ' + payload.rows.length + ' dòng doanh số về app…' });
  try {
    const res = await fetch(job.appOrigin + '/api/sales/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: job.branchId, rows: payload.rows, source: 'EXTENSION' })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'App từ chối dữ liệu');
    const d = json.data;
    const parts = ['Doanh số: ' + payload.meta.invoices + ' hóa đơn, ' + d.salesRecords + ' dòng món/ngày (' + payload.meta.fromDate + ' → ' + payload.meta.toDate + ')'];
    const warnings = [...(payload.warnings || [])];
    const post = async (path, body) => {
      const r = await fetch(job.appOrigin + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'App từ chối dữ liệu');
      return j.data;
    };
    if (payload.stock && payload.stock.length) {
      try {
        await update(job, { status: 'running', text: 'Đang gửi tồn kho về app…' });
        const s = await post('/api/inventory/import', { branchId: job.branchId, rows: payload.stock });
        parts.push('Tồn kho: ' + s.rows + ' dòng, ghép ' + s.matched_codes + '/' + s.total_codes + ' mã NVL');
      } catch (e) { warnings.push('Tồn kho: ' + e.message); }
    }
    if ((payload.suppliers && payload.suppliers.length) || (payload.purchases && payload.purchases.length)) {
      try {
        await update(job, { status: 'running', text: 'Đang gửi nhà cung cấp về app…' });
        const s = await post('/api/suppliers/import', { branchId: job.branchId, suppliers: payload.suppliers, purchases: payload.purchases });
        parts.push('Nhà cung cấp: ' + s.suppliers + ' NCC, ' + s.purchases + ' dòng mua');
      } catch (e) { warnings.push('Nhà cung cấp: ' + e.message); }
    }
    await update(job, {
      status: 'done',
      text: 'Hoàn tất. ' + parts.join(' · ') + (warnings.length ? ' · Cảnh báo: ' + warnings.join('; ') : '') + '.',
      result: { matchedCodes: d.matched_codes, totalCodes: d.total_codes, branchName: payload.meta.branchName }
    });
    chrome.tabs.update(job.appTabId, { active: true }).catch(() => {});
  } catch (e) {
    await update(job, { status: 'error', text: 'Gửi dữ liệu về app thất bại: ' + e.message });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'START_SYNC') return sendResponse(await startSync(msg, sender));

    if (msg.type === 'GET_STATUS') {
      const job = await getJob();
      return sendResponse(job && sender.tab && sender.tab.id === job.appTabId
        ? { status: job.status, text: job.text, result: job.result } : null);
    }

    const job = await getJob();
    const fromCukcuk = job && sender.tab && sender.tab.id === job.cukcukTabId;

    if (msg.type === 'GET_JOB') {
      const fresh = job && Date.now() - job.createdAt < JOB_TTL_MS;
      return sendResponse(fromCukcuk && fresh && (job.status === 'waiting_login' || job.status === 'running') ? job : null);
    }
    if (!fromCukcuk) return sendResponse(null);

    if (msg.type === 'PAGE_PROGRESS') await update(job, { status: msg.payload.status, text: msg.payload.text });
    else if (msg.type === 'PAGE_ERROR') await update(job, { status: 'error', text: msg.payload.message });
    else if (msg.type === 'PAGE_ROWS') await finishWithRows(job, msg.payload);
    sendResponse(null);
  })();
  return true;
});
