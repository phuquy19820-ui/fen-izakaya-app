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

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-z0-9]/g, '');

  // Danh sách chi nhánh của tài khoản CUKCUK, tìm theo tên hoặc mã chi nhánh
  async function resolveBranch(tpl, wanted) {
    const res = await fetch('Service/SettingService.svc/GetBranch?_dc=' + Date.now() + '&loadType=0&page=1&start=0&limit=100', {
      credentials: 'same-origin', headers: { 'X-Cukcuk-Branchid': tpl.BranchID, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!res.ok) throw new Error('Không đọc được danh sách chi nhánh CUKCUK (lỗi ' + res.status + ')');
    const list = ((await res.json()).data || []).filter((b) => b.BranchID && !b.Inactive);
    const w = norm(wanted);
    const hit = list.find((b) => norm(b.BranchName) === w) || list.find((b) => norm(b.BranchCode) === w) ||
      list.find((b) => norm(b.BranchName).includes(w) || (w && w.includes(norm(b.BranchName))));
    if (!hit) throw new Error('Không tìm thấy chi nhánh "' + wanted + '" trên CUKCUK. Các chi nhánh có: ' + list.map((b) => b.BranchName).join(', ') + '. Hãy sửa lại "Tên chi nhánh trên CUKCUK" trong app.');
    return { id: hit.BranchID, name: hit.BranchName };
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

  const baseObj = (tpl, extra) => Object.assign({
    BranchID: tpl.BranchID, BranchName: tpl.BranchName, CashierID: tpl.CashierID || ALL_GUID,
    NumberTop: -1, Period: null, PeriodName: 'Tùy chọn', ReportCode: null, RevenueBy: null, TimeZone: 420, ViewMode: 1
  }, extra);

  async function postReport(tpl, reportId, obj, page) {
    const body = { reportID: reportId, obj: JSON.stringify(obj), hasSummary: true, hasMaster: false, page, start: (page - 1) * 100, limit: 100 };
    const res = await fetch('Service/ReportService.svc/GetReportData?_dc=' + Date.now(), {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Cukcuk-Branchid': tpl.BranchID, 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('CUKCUK trả lỗi ' + res.status);
    const json = await res.json();
    if (json.success === false) throw new Error('CUKCUK từ chối báo cáo (có thể chưa đủ quyền)');
    return json;
  }

  async function allPages(tpl, reportId, obj) {
    const rows = [];
    let page = 1;
    let total = 0;
    do {
      const json = await postReport(tpl, reportId, obj, page);
      total = Number(json.total) || 0;
      const data = json.data || [];
      rows.push(...data);
      page++;
      if (data.length === 0) break;
    } while (rows.length < total);
    return rows;
  }

  const eachDay = (from, to) => {
    const out = [];
    let t = Date.parse(from + 'T00:00:00Z');
    const e = Date.parse(to + 'T00:00:00Z');
    while (t <= e && out.length < 62) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
    return out;
  };

  // Tồn kho theo từng ngày (báo cáo Tổng hợp nhập - xuất - tồn kho)
  async function fetchStock(tpl, from, to) {
    const rows = [];
    for (const day of eachDay(from, to)) {
      const obj = baseObj(tpl, {
        FromDate: day + 'T00:00:00.0000' + TZ, ToDate: day + 'T23:59:59.9990' + TZ,
        InventoryItemCategoryID: null, InventoryItemCategoryName: 'Tất cả', ReportID: 'ST_STOCKGENERAL',
        ReportName: 'Tổng hợp nhập - xuất - tồn kho', StockName: 'Tất cả', UnitName: '', branchID: tpl.BranchID
      });
      const data = await allPages(tpl, 'ST_STOCKGENERAL', obj);
      for (const d of data) {
        const r = { date: day, code: d.InventoryItemCode, name: d.InventoryItemName, category: d.InventoryCategoryName, unit: d.UnitName,
          opening: Number(d.QuantityInTerm) || 0, qtyIn: Number(d.QuantityIn) || 0, qtyOut: Number(d.QuantityOut) || 0,
          closing: Number(d.QuantityInStock) || 0, amount: Number(d.ClosingAmount) || 0 };
        if (r.code && (r.opening || r.qtyIn || r.qtyOut || r.closing)) rows.push(r);
      }
    }
    return rows;
  }

  async function fetchVendors(tpl) {
    const out = [];
    let page = 1;
    let total = 0;
    do {
      const res = await fetch('Service/DictionaryService.svc/GetAllVendorPaging?_dc=' + Date.now() + '&itemType=0&page=' + page + '&start=' + ((page - 1) * 100) + '&limit=100', {
        credentials: 'same-origin', headers: { 'X-Cukcuk-Branchid': tpl.BranchID, 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) throw new Error('CUKCUK trả lỗi ' + res.status);
      const json = await res.json();
      total = Number(json.total) || 0;
      const data = json.data || [];
      for (const d of data) {
        out.push({ code: d.VendorCode, name: d.VendorName, phone: d.Tel || d.Mobile || '', address: d.Address || d.AddressOrContactAddress || '',
          tax: d.CompanyTaxCode || '', contact: d.ContactName || '', category: d.VendorCategoryName || '', inactive: !!d.Inactive });
      }
      page++;
      if (data.length === 0) break;
    } while (out.length < total);
    return out;
  }

  // Lịch sử mua theo nhà cung cấp và NVL: đúng khoảng ngày đang đồng bộ
  async function fetchPurchases(tpl, from, to) {
    const obj = baseObj(tpl, {
      FromDate: from + 'T00:00:00.0000' + TZ, ToDate: to + 'T23:59:59.9990' + TZ, ReportID: 'PU_BYVENDORANDMATERIALS',
      ReportName: 'Mua hàng chi tiết theo NCC và NVL', VendorCategoryID: ALL_GUID, VendorCategoryName: 'Tất cả', VendorID: ALL_GUID, VendorName: 'Tất cả'
    });
    const data = await allPages(tpl, 'PU_BYVENDORANDMATERIALS', obj);
    return data.filter((d) => d.InventoryItemCode && d.RefDetailID).map((d) => ({
      detailId: d.RefDetailID, refNo: d.RefNo, date: new Date(new Date(d.RefDate).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10),
      supplierCode: d.VendorCode, supplierName: d.VendorName, itemCode: d.InventoryItemCode, itemName: d.InventoryItemName,
      unit: d.PUUnitName || d.UnitName, qty: Number(d.Quantity) || 0, price: Number(d.UnitPrice) || 0, amount: Number(d.Amount) || 0,
      vatRate: Number(d.VATRate) || 0, vatAmount: Number(d.VATAmount) || 0, total: d.TotalAmount === undefined || d.TotalAmount === null ? Number(d.Amount) || 0 : Number(d.TotalAmount) || 0
    }));
  }

  // Công nợ nhà cung cấp (báo cáo DP_BYVENDOR) trong khoảng ngày đang đồng bộ
  async function fetchVendorDebt(tpl, from, to) {
    const obj = baseObj(tpl, {
      FromDate: from + 'T00:00:00.0000' + TZ, ToDate: to + 'T23:59:59.9990' + TZ, ReportID: 'DP_BYVENDOR',
      ReportName: 'Công nợ nhà cung cấp', VendorCategoryID: ALL_GUID, VendorCategoryName: 'Tất cả', VendorID: ALL_GUID, VendorName: 'Tất cả', branchID: tpl.BranchID
    });
    const data = await allPages(tpl, 'DP_BYVENDOR', obj);
    return {
      from, to,
      debts: data.filter((d) => d.VendorCode).map((d) => ({ code: d.VendorCode, name: d.VendorName, first: Number(d.FirstDeptAmount) || 0,
        increase: Number(d.IncreaseAmount) || 0, decrease: Number(d.DecreaseAmount) || 0, last: Number(d.LastDeptAmount) || 0 }))
    };
  }

  // Chứng từ chi quỹ tiền mặt và tiền gửi ngân hàng (đúng khoảng ngày đang đồng bộ), kèm Mục chi ở chi tiết
  async function fetchPayments(tpl, from, to) {
    const fromIso = new Date(Date.parse(from + 'T00:00:00Z') - 7 * 3600 * 1000).toISOString();
    const toIso = new Date(Date.parse(to + 'T00:00:00Z') + 86400000 - 7 * 3600 * 1000).toISOString();
    const filter = encodeURIComponent(JSON.stringify([
      { xtype: 'filter', property: 'RefDate', operator: '>=', value: fromIso, type: 'DateTime', group: 'RefDate' },
      { xtype: 'filter', property: 'RefDate', operator: '<', value: toIso, type: 'DateTime', addition: 'and', group: 'RefDate' }
    ]));
    const headers = { 'X-Cukcuk-Branchid': tpl.BranchID, 'X-Requested-With': 'XMLHttpRequest' };
    const get = async (url) => {
      const res = await fetch(url, { credentials: 'same-origin', headers });
      if (!res.ok) throw new Error('CUKCUK trả lỗi ' + res.status);
      return res.json();
    };
    const out = [];
    const sources = [
      { source: 'CASH', list: 'CAService.svc/GetAllCAReceiptPaymentPaging', detail: (d) => 'CAService.svc/GetCAReceiptPaymentDetailById?receiptPaymentId=' + d.RefID + '&refType=' + d.RefType },
      { source: 'BANK', list: 'BAService.svc/GetAllBADepositWithdrawPaging', detail: (d) => 'BAService.svc/GetBADepositWithdrawDetailById?depositWithdrawId=' + d.RefID + '&refType=' + d.RefType }
    ];
    for (const s of sources) {
      let page = 1;
      let total = 0;
      let got = 0;
      do {
        const json = await get('Service/' + s.list + '?_dc=' + Date.now() + '&page=' + page + '&start=' + ((page - 1) * 100) + '&limit=100&filter=' + filter);
        total = Number(json.total) || 0;
        const data = json.data || [];
        got += data.length;
        for (const d of data) {
          if (d.BranchID && d.BranchID !== tpl.BranchID) continue;
          if (!/chi/i.test(String(d.RefTypeName || '')) || /^(phiếu )?thu/i.test(String(d.RefTypeName || ''))) continue;
          let budget = '';
          try {
            const det = await get('Service/' + s.detail(d) + '&_dc=' + Date.now() + '&page=1&start=0&limit=100');
            budget = (det.data || []).map((x) => [x.BudgetItemName, x.Description].filter(Boolean).join(': ')).join('; ');
          } catch (e) { /* bỏ qua chi tiết */ }
          out.push({ refId: d.RefID, refNo: d.RefNo, date: localDate(d.RefDate), source: s.source, typeName: d.RefTypeName,
            amount: Number(d.TotalAmount) || 0, reason: ((d.ObjectName ? '[' + d.ObjectName + '] ' : '') + (d.Reason || '')).trim(), budgetItem: budget });
        }
        page++;
        if (data.length === 0) break;
      } while (got < total);
    }
    return out;
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

      // Nhiều chi nhánh dùng chung một phần mềm bán hàng: chọn đúng chi nhánh theo tên đã lưu trong app
      if (job.cukcukBranchName) {
        say('PROGRESS', { status: 'running', text: 'Đang chọn chi nhánh "' + job.cukcukBranchName + '" trên CUKCUK…' });
        const target = await resolveBranch(tpl, job.cukcukBranchName);
        tpl = Object.assign({}, tpl, { BranchID: target.id, BranchName: target.name, BranchIDs: target.id + ',' });
      }

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

      const extras = { stock: [], suppliers: [], purchases: [], warnings: [] };
      try {
        say('PROGRESS', { status: 'running', text: 'Đang lấy tồn kho theo ngày…' });
        extras.stock = await fetchStock(tpl, job.fromDate, job.toDate);
      } catch (e) { extras.warnings.push('Tồn kho: ' + e.message); }
      try {
        say('PROGRESS', { status: 'running', text: 'Đang lấy danh sách nhà cung cấp…' });
        extras.suppliers = await fetchVendors(tpl);
      } catch (e) { extras.warnings.push('Nhà cung cấp: ' + e.message); }
      try {
        say('PROGRESS', { status: 'running', text: 'Đang lấy lịch sử mua theo nhà cung cấp…' });
        extras.purchases = await fetchPurchases(tpl, job.fromDate, job.toDate);
      } catch (e) { extras.warnings.push('Lịch sử mua: ' + e.message); }

      try {
        say('PROGRESS', { status: 'running', text: 'Đang lấy công nợ nhà cung cấp và chứng từ chi…' });
        const vd = await fetchVendorDebt(tpl, job.fromDate, job.toDate);
        extras.debts = vd.debts; extras.debtFrom = vd.from; extras.debtTo = vd.to;
        extras.payments = await fetchPayments(tpl, job.fromDate, job.toDate);
      } catch (e) { extras.warnings.push('Công nợ: ' + e.message); }

      say('ROWS', {
        debts: extras.debts || [], debtFrom: extras.debtFrom, debtTo: extras.debtTo, payments: extras.payments || [],
        stock: extras.stock, suppliers: extras.suppliers, purchases: extras.purchases, warnings: extras.warnings,
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
