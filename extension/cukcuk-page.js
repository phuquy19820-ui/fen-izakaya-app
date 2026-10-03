// Chạy trong chính trang CUKCUK (world MAIN) để dùng phiên đăng nhập của bạn.
// Chỉ hoạt động khi tiện ích gửi lệnh RUN; chỉ ĐỌC báo cáo, không sửa dữ liệu CUKCUK.
(function () {
  if (window.__fenPageLoaded) return;
  window.__fenPageLoaded = true;

  const ALL_GUID = '994C6FE5-DA83-441B-A0E8-57A6FED98FB2';
  const REPORT_ID = 'RV_BYPRODUCTANDINVOICE';
  const TZ = '+07:00';
  let running = false;

  const say = (type, payload) => window.postMessage({ source: 'FEN_PAGE', type, payload }, '*');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findTemplate() {
    if (typeof Ext === 'undefined' || !Ext.ComponentQuery) return null;
    let grids = [];
    try { grids = Ext.ComponentQuery.query('gridpanel'); } catch (e) { return null; }
    for (const g of grids) {
      try {
        const st = g.getStore && g.getStore();
        const ep = st && st.getProxy && st.getProxy().extraParams;
        if (ep && ep.obj) {
          const o = typeof ep.obj === 'string' ? JSON.parse(ep.obj) : ep.obj;
          if (o && o.BranchID) return o;
        }
      } catch (e) { /* bỏ qua lưới không phù hợp */ }
    }
    return null;
  }

  function looksLoggedIn() {
    if (typeof Ext === 'undefined' || !Ext.ComponentQuery) return false;
    const pw = document.querySelector('input[type=password]');
    if (pw && pw.offsetParent !== null) return false;
    return !/login/i.test(location.hash);
  }

  async function fetchPage(tpl, from, to, page) {
    const obj = {
      FromDate: from, ToDate: to, ReportCode: null, ReportName: 'Chi tiết doanh thu theo hóa đơn và mặt hàng',
      RevenueBy: null, TimeZone: 420, ViewMode: 1, Period: null, ReportID: REPORT_ID,
      BranchID: tpl.BranchID, BranchName: tpl.BranchName, NumberTop: -1,
      CashierID: tpl.CashierID || ALL_GUID, IsShowComboDetail: true, PeriodName: 'Tùy chọn', OrderName: 'Tất cả',
      AreaID: tpl.AreaID || ALL_GUID, AreaName: 'Tất cả',
      EmployeeID: tpl.EmployeeID || ALL_GUID, EmployeeName: 'Tất cả',
      WaiterEmployeeID: tpl.WaiterEmployeeID || ALL_GUID, WaiterEmployeeName: 'Tất cả',
      SaleEmployeeID: tpl.SaleEmployeeID || ALL_GUID, SaleEmployeeName: 'Tất cả',
      CustomerID: tpl.CustomerID || ALL_GUID, CustomerName: '', OrderType: 0,
      BranchIDs: tpl.BranchIDs || (tpl.BranchID + ','), IsGetSeperatePhoneAndName: false
    };
    const body = { reportID: REPORT_ID, obj: JSON.stringify(obj), hasSummary: true, hasMaster: false, page, start: (page - 1) * 100, limit: 100 };
    const res = await fetch('Service/ReportService.svc/GetReportData?_dc=' + Date.now(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Cukcuk-Branchid': tpl.BranchID, 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('CUKCUK trả lỗi ' + res.status);
    const json = await res.json();
    if (json.success === false) throw new Error('CUKCUK từ chối báo cáo (có thể chưa đủ quyền xem báo cáo doanh thu)');
    return json;
  }

  const localDate = (iso) => new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  async function run(job) {
    if (running) return;
    running = true;
    try {
      say('PROGRESS', { status: 'waiting_login', text: 'Đang chờ bạn đăng nhập CUKCUK…' });
      const deadline = Date.now() + 20 * 60 * 1000;
      let tpl = null;
      let hashSetAt = 0;
      while (Date.now() < deadline) {
        tpl = findTemplate();
        if (tpl) break;
        if (looksLoggedIn() && Date.now() - hashSetAt > 20000) {
          say('PROGRESS', { status: 'running', text: 'Đã đăng nhập, đang mở phân hệ báo cáo doanh thu…' });
          hashSetAt = Date.now();
          if (location.hash === '#report-revenue') location.hash = '#index';
          setTimeout(() => { location.hash = '#report-revenue'; }, 800);
        }
        await sleep(1500);
      }
      if (!tpl) throw new Error('Hết thời gian chờ đăng nhập/mở báo cáo CUKCUK. Hãy bấm đồng bộ lại.');

      const from = job.fromDate + 'T00:00:00.0000' + TZ;
      const to = job.toDate + 'T23:59:59.9990' + TZ;
      say('PROGRESS', { status: 'running', text: 'Đang lấy báo cáo doanh thu từ ' + job.fromDate + ' đến ' + job.toDate + '…' });

      const agg = new Map();
      const invoices = new Set();
      let page = 1;
      let total = 0;
      let collected = 0;
      let itemRows = 0;
      do {
        const json = await fetchPage(tpl, from, to, page);
        total = Number(json.total) || 0;
        const data = json.data || [];
        collected += data.length;
        for (const r of data) {
          if (r.RefNo) invoices.add(r.RefNo);
          if (!r.InventoryItemCode || r.Quantity === null || r.Quantity === undefined) continue;
          itemRows++;
          const date = localDate(r.RefDate);
          const key = date + '|' + r.InventoryItemCode;
          const cur = agg.get(key) || { date, code: r.InventoryItemCode, name: r.ItemName, kind: r.InventoryItemKind, qty: 0, amount: 0 };
          cur.qty += Number(r.Quantity);
          cur.amount += Number(r.Amount) || 0;
          agg.set(key, cur);
        }
        say('PROGRESS', { status: 'running', text: 'Đã đọc ' + collected + '/' + total + ' dòng…' });
        page++;
        if (data.length === 0) break;
      } while (collected < total);

      say('ROWS', {
        rows: Array.from(agg.values()),
        meta: { branchName: tpl.BranchName, invoices: invoices.size, itemRows, fromDate: job.fromDate, toDate: job.toDate }
      });
    } catch (e) {
      say('ERROR', { message: String((e && e.message) || e) });
    } finally {
      running = false;
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== 'FEN_EXT_CS' || ev.data.type !== 'RUN') return;
    run(ev.data.job);
  });
})();
