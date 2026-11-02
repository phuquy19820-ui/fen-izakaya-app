import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const vn = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const pad = (n) => String(n).padStart(2, '0');
const todayVn = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const weekRange = (d) => { const dow = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; const from = addDays(d, -dow); return [from, addDays(from, 6)]; };
const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return [`${ym}-01`, `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`]; };
const toIsoDate = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : ''; };
const normText = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

// Đọc file "Đơn đặt mua nguyên vật liệu" xuất từ app (Excel): phần đầu có Số / Ngày lập / Ngày giao / NCC, bảng có Mã NVL - Tên - ĐVT - Số lượng
function parseOrderSheet(aoa, fileName) {
  const head = aoa.slice(0, 20).map((r) => r.map((c) => String(c == null ? '' : c)).join(' ')).join('\n');
  const pick = (re) => { const m = head.match(re); return m ? m[1].trim() : ''; };
  const orderNo = pick(/Số:\s*([^\s\n]+)/i);
  const orderDate = toIsoDate(pick(/Ngày lập:\s*([\d/]+)/i));
  const deliveryDate = toIsoDate(pick(/Ngày giao hàng yêu cầu:\s*([\d/]+)/i));
  const branchName = pick(/Chi nhánh:\s*([^\n]+)/i);
  const supplier = pick(/Nhà cung cấp:\s*([^\n]+)/i);
  let hi = -1; let cCode = -1; let cName = -1; let cUnit = -1; let cQty = -1;
  for (let i = 0; i < Math.min(aoa.length, 40) && hi < 0; i++) {
    const cells = aoa[i].map(normText);
    const code = cells.findIndex((c) => c === 'ma nvl' || c === 'ma' || c.startsWith('ma nvl'));
    const qty = cells.findIndex((c) => c === 'so luong' || c.startsWith('so luong'));
    if (code >= 0 && qty >= 0) { hi = i; cCode = code; cQty = qty; cName = cells.findIndex((c) => c.startsWith('ten')); cUnit = cells.findIndex((c) => c === 'dvt' || c.startsWith('don vi')); }
  }
  if (hi < 0) return { error: 'Không tìm thấy bảng có cột "Mã NVL" và "Số lượng"', fileName };
  const lines = []; let group = '';
  for (let i = hi + 1; i < aoa.length; i++) {
    const r = aoa[i];
    const code = String(r[cCode] == null ? '' : r[cCode]).trim();
    const qty = Number(String(r[cQty] == null ? '' : r[cQty]).replace(/,/g, '')) || 0;
    const first = String(r[0] == null ? '' : r[0]).trim();
    if (!code && first && r.slice(1).every((c) => c === '' || c == null)) { group = first; continue; } // dòng tên nhóm
    if (!code || /cộng nhóm|tổng/i.test(first) || qty <= 0) continue;
    lines.push({ group, code, name: cName >= 0 ? String(r[cName] || '').trim() : '', unit: cUnit >= 0 ? String(r[cUnit] || '').trim() : '', qty });
  }
  if (lines.length === 0) return { error: 'File không có dòng hàng nào có số lượng', fileName };
  return { fileName, orderNo, orderDate: orderDate || deliveryDate || '', deliveryDate, branchName, supplier, lines };
}

export default function KitchenOrders() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [mode, setMode] = useState('week'); // week | month | range
  const [anchor, setAnchor] = useState(todayVn());
  const [month, setMonth] = useState(todayVn().slice(0, 7));
  const [rangeFrom, setRangeFrom] = useState(addDays(todayVn(), -6));
  const [rangeTo, setRangeTo] = useState(todayVn());
  const [basis, setBasis] = useState('delivery');
  const [tol, setTol] = useState(15);
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [detail, setDetail] = useState(null);
  const [parsed, setParsed] = useState([]);
  const [errors, setErrors] = useState([]);
  const [msg, setMsg] = useState('');
  const [reload, setReload] = useState(0);
  const fileRef = useRef(null);

  const [from, to] = mode === 'week' ? weekRange(anchor) : mode === 'month' ? monthRange(month) : [rangeFrom, rangeTo];

  useEffect(() => { if (branch) fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {}); }, [branch]);

  useEffect(() => {
    if (!branch) return undefined;
    let dead = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/kitchen-orders/compare/${branch}?from=${from}&to=${to}&basis=${basis}`).then((r) => r.json()),
      fetch(`/api/kitchen-orders/list/${branch}?from=${from}&to=${to}`).then((r) => r.json())
    ]).then(([c, l]) => { if (dead) return; if (c.success) setData(c.data); if (l.success) setOrders(l.data); }).catch(() => {}).finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [branch, from, to, basis, reload]);

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setMsg(''); setErrors([]);
    const XLSX = await import('xlsx');
    const ok = []; const bad = [];
    for (const f of files) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
        const p = parseOrderSheet(aoa, f.name);
        if (p.error) bad.push(`${f.name}: ${p.error}`); else ok.push(p);
      } catch (err) { bad.push(`${f.name}: không đọc được file (${err.message})`); }
    }
    setParsed(ok); setErrors(bad);
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveParsed = async () => {
    const missing = parsed.filter((p) => !p.orderDate);
    if (missing.length) { alert('Còn đơn chưa có ngày lập: ' + missing.map((m) => m.fileName).join(', ') + '. Hãy chọn ngày ở bảng bên dưới.'); return; }
    setMsg('Đang lưu…');
    const res = await fetch('/api/kitchen-orders/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, orders: parsed }) });
    const j = await res.json();
    if (j.success) {
      setMsg(`✅ Đã lưu ${j.data.saved} đơn (${j.data.lines} dòng hàng)${j.data.replaced ? `, ghi đè ${j.data.replaced} đơn trùng số` : ''}.`);
      setParsed([]);
      // đưa khoảng xem về ngày của đơn vừa tải
      const d = parsed.map((p) => p.deliveryDate || p.orderDate).sort().pop();
      if (d) { setAnchor(d); setMonth(d.slice(0, 7)); }
      setReload((v) => v + 1);
    } else setMsg('❌ ' + j.message);
  };

  const delOrder = async (o) => {
    if (!window.confirm(`Xóa đơn ${o.order_no || ''} (${vn(o.delivery_date || o.order_date)})?`)) return;
    await fetch(`/api/kitchen-orders/${branch}/${o.id}`, { method: 'DELETE' });
    setReload((v) => v + 1);
  };

  const statusOf = (r) => {
    const t = tol / 100;
    if (r.ordered > 0 && r.sold === 0) return 'Đặt nhưng chưa có số bán';
    if (r.ordered === 0 && r.sold > 0) return 'Có bán, Bếp không đặt';
    if (r.ordered > r.sold * (1 + t)) return 'Đặt vượt nhu cầu bán';
    if (r.ordered < r.sold * (1 - t)) return 'Đặt thấp hơn nhu cầu bán';
    return 'Khớp';
  };
  const rows = useMemo(() => (data ? data.rows.map((r) => ({
    ...r, diffOS: Math.round((r.ordered - r.sold) * 1000) / 1000, pctOS: r.sold > 0 ? (r.ordered / r.sold) * 100 : null,
    diffBO: Math.round((r.bought - r.ordered) * 1000) / 1000, diffBS: Math.round((r.bought - r.sold) * 1000) / 1000, status: statusOf(r)
  })) : []), [data, tol]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = [
    { key: 'code', label: 'Mã NVL', width: 100, type: 'text' },
    { key: 'name', label: 'Nguyên vật liệu', width: 230, type: 'text', render: (r) => <span className="font-medium">{r.name}{r.unitMismatch ? <span className="ml-1 text-orange-600" title="ĐVT trong file đặt khác ĐVT mua của app, số liệu có thể lệch">⚠ ĐVT</span> : null}</span> },
    { key: 'group', label: 'Nhóm', width: 110, type: 'select' },
    { key: 'unit', label: 'ĐVT', width: 60, type: 'select' },
    { key: 'ordered', label: 'ĐẶT (Bếp)', width: 90, type: 'number', align: 'right', render: (r) => <b>{num(r.ordered)}</b> },
    { key: 'sold', label: 'DÙNG theo bán', width: 100, type: 'number', align: 'right', render: (r) => num(r.sold) },
    { key: 'bought', label: 'THỰC MUA', width: 90, type: 'number', align: 'right', render: (r) => <b>{num(r.bought)}</b> },
    { key: 'diffOS', label: 'Đặt − Bán', width: 86, type: 'number', align: 'right', render: (r) => <span style={{ color: r.diffOS > 0 ? '#c2410c' : r.diffOS < 0 ? '#2563eb' : undefined }}>{r.diffOS > 0 ? '+' : ''}{num(r.diffOS)}</span> },
    { key: 'pctOS', label: 'Đặt / Bán %', width: 90, type: 'number', align: 'right', get: (r) => (r.pctOS === null ? 0 : r.pctOS), render: (r) => (r.pctOS === null ? '—' : r.pctOS.toFixed(0) + '%') },
    { key: 'diffBO', label: 'Mua − Đặt', width: 86, type: 'number', align: 'right', render: (r) => <span style={{ color: r.diffBO < 0 ? '#dc2626' : undefined }}>{r.diffBO > 0 ? '+' : ''}{num(r.diffBO)}</span> },
    { key: 'diffBS', label: 'Mua − Bán', width: 86, type: 'number', align: 'right', render: (r) => <span>{r.diffBS > 0 ? '+' : ''}{num(r.diffBS)}</span> },
    { key: 'status', label: 'Nhận xét', width: 190, type: 'select', render: (r) => <span className="font-bold" style={{ color: { 'Khớp': '#16a34a', 'Đặt vượt nhu cầu bán': '#c2410c', 'Đặt thấp hơn nhu cầu bán': '#2563eb' }[r.status] || '#64748b' }}>{r.status}</span> },
    { key: 'boughtAmount', label: 'Tiền mua (đ)', width: 100, type: 'number', align: 'right', render: (r) => money(r.boughtAmount) }
  ];
  const visible = useMemo(() => sortRows(filterRows(rows, cols, filters), cols, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, sort]);
  const cnt = (s) => rows.filter((r) => r.status === s).length;
  const cov = data && data.coverage.total ? data.coverage.mapped / data.coverage.total : null;

  const shift = (dir) => {
    if (mode === 'week') setAnchor(addDays(anchor, 7 * dir));
    else if (mode === 'month') { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + dir, 1)); setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); }
  };
  const label = mode === 'week' ? `Tuần ${vn(from)} – ${vn(to)}` : mode === 'month' ? `Tháng ${month.slice(5)}/${month.slice(0, 4)} (${vn(from)} – ${vn(to)})` : `${vn(from)} – ${vn(to)}`;

  return (
    <>
      <Head>
        <title>Theo dõi đặt hàng Bếp</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="text-base font-bold">THEO DÕI ĐẶT HÀNG CỦA BẾP: ĐẶT HÀNG – DÙNG THEO BÁN – THỰC MUA</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · tải file "Đơn đặt mua nguyên vật liệu" của Bếp mỗi ngày, so sánh với doanh số bán (theo định lượng món) và thực mua</p>
        </header>
        <BranchNav branch={branch} active="kitchen" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-3" style={{ maxWidth: 1600, margin: '0 auto' }}>
          {/* Tải file */}
          <div className="bg-white rounded border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <b className="text-sm">📥 Tải file đặt hàng của Bếp (.xlsx)</b>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple onChange={onFiles} />
              <span className="text-gray-500">Chọn được nhiều file cùng lúc. Đơn trùng số sẽ được ghi đè.</span>
              {data && data.lastUpload && <span className="text-gray-600">Lần tải gần nhất: {new Date(data.lastUpload).toLocaleString('vi-VN')} · đơn mới nhất ngày {vn(data.lastOrderDate)}</span>}
            </div>
            {errors.length > 0 && <div className="bg-red-50 border border-red-200 rounded p-2 text-red-700">{errors.map((e, i) => <div key={i}>❌ {e}</div>)}</div>}
            {parsed.length > 0 && (
              <div className="border rounded p-2 space-y-2">
                <div className="font-bold">Đã đọc {parsed.length} đơn, kiểm tra rồi bấm Lưu:</div>
                <table className="w-full border-collapse text-xs">
                  <thead><tr className="bg-gray-100"><th className="border px-2 py-1 text-left">File</th><th className="border px-2 py-1">Số đơn</th><th className="border px-2 py-1">Ngày lập</th><th className="border px-2 py-1">Ngày giao yêu cầu</th><th className="border px-2 py-1">Chi nhánh trong file</th><th className="border px-2 py-1">NCC</th><th className="border px-2 py-1">Số dòng</th><th className="border px-2 py-1"></th></tr></thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i}>
                        <td className="border px-2 py-1">{p.fileName}</td><td className="border px-2 py-1 text-center">{p.orderNo || '—'}</td>
                        <td className="border px-2 py-1 text-center"><input type="date" value={p.orderDate} onChange={(e) => setParsed(parsed.map((x, j) => (j === i ? { ...x, orderDate: e.target.value } : x)))} className="border rounded px-1" /></td>
                        <td className="border px-2 py-1 text-center"><input type="date" value={p.deliveryDate} onChange={(e) => setParsed(parsed.map((x, j) => (j === i ? { ...x, deliveryDate: e.target.value } : x)))} className="border rounded px-1" /></td>
                        <td className="border px-2 py-1" style={{ color: p.branchName && branchInfo && normText(p.branchName) !== normText(branchInfo.branch_name) ? '#dc2626' : undefined }}>{p.branchName || '—'}</td>
                        <td className="border px-2 py-1">{p.supplier || '—'}</td><td className="border px-2 py-1 text-right">{p.lines.length}</td>
                        <td className="border px-2 py-1 text-center"><button onClick={() => setParsed(parsed.filter((_, j) => j !== i))} className="text-red-600 font-bold">Bỏ</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.some((p) => p.branchName && branchInfo && normText(p.branchName) !== normText(branchInfo.branch_name)) && <div className="text-red-600 font-bold">⚠ Có file ghi chi nhánh khác với chi nhánh đang xem ({branchInfo.branch_name}). Hãy kiểm tra trước khi lưu.</div>}
                <button onClick={saveParsed} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold">💾 Lưu {parsed.length} đơn lên hệ thống</button>
              </div>
            )}
            {msg && <div className="font-bold">{msg}</div>}
          </div>

          {/* Bộ lọc kỳ */}
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-2">
            {[['week', 'Theo tuần'], ['month', 'Theo tháng'], ['range', 'Khoảng ngày']].map(([k, l]) => <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 rounded font-bold border ${mode === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{l}</button>)}
            {mode !== 'range' && <button onClick={() => shift(-1)} className="px-2 py-1.5 rounded border font-bold">◀</button>}
            {mode === 'week' && <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="border rounded px-2 py-1" />}
            {mode === 'month' && <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="border rounded px-2 py-1" />}
            {mode === 'range' && (<><input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="border rounded px-2 py-1" /><span>→</span><input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="border rounded px-2 py-1" /></>)}
            {mode !== 'range' && <button onClick={() => shift(1)} className="px-2 py-1.5 rounded border font-bold">▶</button>}
            <b className="text-sm text-blue-800">{label}</b>
            <span className="ml-3 font-semibold">Tính đơn theo:</span>
            <select value={basis} onChange={(e) => setBasis(e.target.value)} className="border rounded px-2 py-1"><option value="delivery">Ngày giao hàng yêu cầu (nếu có)</option><option value="created">Ngày lập đơn</option></select>
            <span className="font-semibold">Dung sai khớp ±</span>
            <input type="number" value={tol} onChange={(e) => setTol(Math.max(0, Number(e.target.value) || 0))} className="border rounded px-2 py-1" style={{ width: 56 }} /><span>%</span>
          </div>

          {loading && <p className="p-4 text-gray-500">Đang tải…</p>}
          {data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                {[['Số đơn Bếp trong kỳ', data.orderCount, '#0073C5'], ['NVL đã đặt', rows.filter((r) => r.ordered > 0).length, '#0073C5'], ['Đặt vượt nhu cầu bán', cnt('Đặt vượt nhu cầu bán') + cnt('Đặt nhưng chưa có số bán'), '#c2410c'], ['Đặt thấp hơn nhu cầu', cnt('Đặt thấp hơn nhu cầu bán') + cnt('Có bán, Bếp không đặt'), '#2563eb'], ['Khớp (±' + tol + '%)', cnt('Khớp'), '#16a34a'], ['Tiền thực mua trong kỳ (đ)', money(rows.reduce((a, r) => a + r.boughtAmount, 0)), '#334155']].map(([l, v, c]) => (
                  <div key={l} className="rounded overflow-hidden border bg-white"><div className="px-2 py-1 text-white text-center font-bold" style={{ backgroundColor: c }}>{l}</div><div className="py-2 text-center text-lg font-bold">{v}</div></div>
                ))}
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-900 space-y-1">
                <div><b>Cách tính:</b> <b>ĐẶT</b> = tổng số lượng trong các file đơn của Bếp đã tải. <b>DÙNG theo bán</b> = số món bán trên CUKCUK × định lượng của món (đã ghép món), quy về đơn vị mua của NVL. <b>THỰC MUA</b> = số lượng nhập thực tế từ CUKCUK đã ghép NVL. Bấm vào một dòng để xem chi tiết từng ngày.</div>
                {cov !== null && <div>Độ phủ định lượng: <b>{(cov * 100).toFixed(0)}%</b> số lượng món ăn bán ra đã có định lượng{cov < 0.95 ? ' — phần còn lại chưa quy ra NVL nên cột "Dùng theo bán" có thể thấp hơn thực tế.' : '.'}{data.unmappedDishes.length > 0 && cov < 0.95 && <> Món bán nhiều nhưng chưa có định lượng: {data.unmappedDishes.slice(0, 6).map((d) => `${d.name} (${num(d.qty)})`).join('; ')}.</>}</div>}
                {data.unmatchedPurchases.n > 0 && <div>Có {data.unmatchedPurchases.n} dòng mua hàng ({money(data.unmatchedPurchases.amount)} đ) chưa ghép với NVL của app nên chưa tính vào cột "Thực mua" (ghép ở tab Tồn kho).</div>}
              </div>
              <DataTable columns={cols} allRows={rows} rows={visible} rowKey={(r) => r.code} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 330px)"
                onRowClick={(r) => setDetail(r)} emptyText="Chưa có dữ liệu trong kỳ này. Hãy tải file đặt hàng của Bếp hoặc đổi kỳ xem." />
            </>
          )}

          {/* Danh sách đơn đã tải */}
          <div className="bg-white rounded border p-3">
            <b className="text-sm">🧾 Đơn Bếp đã tải trong kỳ ({orders.length})</b>
            {orders.length === 0 ? <p className="text-gray-500 mt-1">Chưa có đơn nào trong kỳ.</p> : (
              <table className="w-full border-collapse text-xs mt-2">
                <thead><tr className="bg-gray-100"><th className="border px-2 py-1">Số đơn</th><th className="border px-2 py-1">Ngày lập</th><th className="border px-2 py-1">Ngày giao yêu cầu</th><th className="border px-2 py-1 text-left">NCC</th><th className="border px-2 py-1">Số dòng</th><th className="border px-2 py-1 text-left">File</th><th className="border px-2 py-1">Tải lúc</th><th className="border px-2 py-1"></th></tr></thead>
                <tbody>{orders.map((o) => (
                  <tr key={o.id}><td className="border px-2 py-1 text-center font-bold">{o.order_no || '—'}</td><td className="border px-2 py-1 text-center">{vn(o.order_date)}</td><td className="border px-2 py-1 text-center">{vn(o.delivery_date)}</td>
                    <td className="border px-2 py-1">{o.supplier_name || ''}</td><td className="border px-2 py-1 text-right">{o.line_count}</td><td className="border px-2 py-1">{o.file_name || ''}</td>
                    <td className="border px-2 py-1 text-center">{new Date(o.uploaded_at).toLocaleString('vi-VN')}{o.uploaded_by ? ` · ${o.uploaded_by}` : ''}</td>
                    <td className="border px-2 py-1 text-center"><button onClick={() => delOrder(o)} className="text-red-600 font-bold">Xóa</button></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>

        {detail && (
          <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)', zIndex: 80 }} onClick={() => setDetail(null)}>
            <div className="bg-white rounded-lg shadow-xl p-4 overflow-auto" style={{ maxWidth: 760, width: '100%', maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-2">
                <div><div className="font-bold text-sm">{detail.name} <span className="text-gray-500 font-normal">({detail.code} · {detail.unit})</span></div><div className="text-gray-600">{label}</div></div>
                <button onClick={() => setDetail(null)} className="px-3 py-1 rounded border font-bold">Đóng</button>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead><tr className="bg-gray-100"><th className="border px-2 py-1">Ngày</th><th className="border px-2 py-1 text-right">Đặt (Bếp)</th><th className="border px-2 py-1 text-right">Dùng theo bán</th><th className="border px-2 py-1 text-right">Thực mua</th><th className="border px-2 py-1 text-right">Đặt − Bán</th></tr></thead>
                <tbody>
                  {detail.daily.map((d) => <tr key={d.d}><td className="border px-2 py-1 text-center">{vn(d.d)}</td><td className="border px-2 py-1 text-right">{num(d.ordered)}</td><td className="border px-2 py-1 text-right">{num(d.sold)}</td><td className="border px-2 py-1 text-right">{num(d.bought)}</td><td className="border px-2 py-1 text-right">{num(d.ordered - d.sold)}</td></tr>)}
                  <tr className="bg-gray-100 font-bold"><td className="border px-2 py-1">Tổng cộng</td><td className="border px-2 py-1 text-right">{num(detail.ordered)}</td><td className="border px-2 py-1 text-right">{num(detail.sold)}</td><td className="border px-2 py-1 text-right">{num(detail.bought)}</td><td className="border px-2 py-1 text-right">{num(detail.ordered - detail.sold)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
