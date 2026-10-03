import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const iso = (d) => String(d).slice(0, 10);
const vn = (d) => (d ? iso(d).split('-').reverse().join('/') : '');
const short = (d) => iso(d).slice(8, 10) + '/' + iso(d).slice(5, 7);
const todayVn = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const TABS = [
  { key: 'daily', label: '📅 Mua hàng theo NVL từng ngày' },
  { key: 'book', label: '📒 Sổ nhập hàng theo NCC & NVL' },
  { key: 'orders', label: '🧾 Sổ theo dõi đơn đặt hàng' },
  { key: 'compare', label: '⚖️ Nhập thực tế so với đơn đặt hàng' }
];

// ---------- Tab 1: mua hàng theo NVL từng ngày ----------
function DailyTab({ lines }) {
  const [metric, setMetric] = useState('qty');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const { rows, dates } = useMemo(() => {
    const dset = new Set();
    const map = new Map();
    lines.forEach((l) => {
      const d = iso(l.date);
      dset.add(d);
      const key = l.item_code + '|' + l.unit;
      const cur = map.get(key) || { key, name: l.item_name, unit: l.unit, byDate: {}, qty: 0, amount: 0 };
      const x = cur.byDate[d] || { qty: 0, amount: 0 };
      x.qty += Number(l.qty) || 0;
      x.amount += Number(l.amount) || 0;
      cur.byDate[d] = x;
      cur.qty += Number(l.qty) || 0;
      cur.amount += Number(l.amount) || 0;
      map.set(key, cur);
    });
    return { rows: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi')), dates: Array.from(dset).sort() };
  }, [lines]);

  const val = (r, d) => (r.byDate[d] ? r.byDate[d][metric] : 0);
  const fmt = (v) => (v ? (metric === 'qty' ? num(v) : money(v)) : <span className="text-gray-300">·</span>);
  const columns = [
    { key: 'name', label: 'Nguyên vật liệu', width: 300, type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    ...dates.map((d) => ({ key: 'd' + d, label: short(d), width: 84, type: 'number', align: 'right', get: (r) => val(r, d), render: (r) => fmt(val(r, d)) })),
    { key: 'total', label: 'Tổng', minWidth: 100, type: 'number', align: 'right', get: (r) => r[metric], render: (r) => <b>{metric === 'qty' ? num(r.qty) : money(r.amount)}</b> }
  ];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, dates, metric, filters, sort]);
  const tot = (d) => visible.reduce((s, r) => s + val(r, d), 0);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <button onClick={() => setMetric('qty')} className={`px-3 py-1.5 rounded font-bold border ${metric === 'qty' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Số lượng</button>
        <button onClick={() => setMetric('amount')} className={`px-3 py-1.5 rounded font-bold border ${metric === 'amount' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Thành tiền (đ)</button>
        <span className="text-gray-500 ml-2">Mỗi dòng là một NVL, mỗi cột là một ngày mua. Gram/ml được quy về kg/lít.</span>
      </div>
      {rows.length === 0 ? <p className="bg-white border rounded p-6 text-gray-600">Chưa có dữ liệu mua hàng trong khoảng ngày này.</p> : (
        <DataTable
          columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.key}
          filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 330px)"
          footer={[
            <td key="l" colSpan={2} className="px-2 py-1 text-right">Tổng cộng:</td>,
            ...dates.map((d) => <td key={d} className="px-2 py-1 text-right">{metric === 'qty' ? '' : money(tot(d))}</td>),
            <td key="t" className="px-2 py-1 text-right">{metric === 'qty' ? '' : money(visible.reduce((s, r) => s + r.amount, 0))}</td>
          ]}
        />
      )}
    </div>
  );
}

// ---------- Tab 2: sổ nhập hàng theo NCC và NVL ----------
function BookTab({ lines }) {
  const [view, setView] = useState('detail');
  const [fD, setFD] = useState({});
  const [sD, setSD] = useState({ key: 'date', dir: 'desc' });
  const [fS, setFS] = useState({});
  const [sS, setSS] = useState({ key: 'amount', dir: 'desc' });

  const detailCols = [
    { key: 'date', label: 'Ngày', width: 96, type: 'text', get: (r) => iso(r.date), render: (r) => vn(r.date) },
    { key: 'ref_no', label: 'Số phiếu', width: 100, type: 'text' },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 300, type: 'text' },
    { key: 'item_name', label: 'Nguyên vật liệu', width: 300, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    { key: 'qty', label: 'Số lượng', width: 90, type: 'number', align: 'right', render: (r) => num(r.qty) },
    { key: 'price', label: 'Đơn giá', width: 100, type: 'number', align: 'right', render: (r) => money(r.price) },
    { key: 'amount', label: 'Thành tiền', minWidth: 110, type: 'number', align: 'right', render: (r) => <b>{money(r.amount)}</b> }
  ];
  const detailVisible = useMemo(() => sortRows(filterRows(lines, detailCols, fD), detailCols, sD),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, fD, sD]);

  const summary = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => {
      const key = l.supplier_code + '|' + l.item_code + '|' + l.unit;
      const cur = map.get(key) || { key, supplier_name: l.supplier_name, item_name: l.item_name, unit: l.unit, times: 0, qty: 0, amount: 0, last: '' };
      cur.times += 1;
      cur.qty += Number(l.qty) || 0;
      cur.amount += Number(l.amount) || 0;
      if (iso(l.date) > cur.last) cur.last = iso(l.date);
      map.set(key, cur);
    });
    return Array.from(map.values()).map((r) => ({ ...r, avg: r.qty ? r.amount / r.qty : 0 }));
  }, [lines]);
  const sumCols = [
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 320, type: 'text' },
    { key: 'item_name', label: 'Nguyên vật liệu', width: 320, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    { key: 'times', label: 'Số lần nhập', width: 90, type: 'number', align: 'right' },
    { key: 'qty', label: 'Tổng số lượng', width: 110, type: 'number', align: 'right', render: (r) => num(r.qty) },
    { key: 'avg', label: 'Đơn giá bình quân', width: 120, type: 'number', align: 'right', render: (r) => money(r.avg) },
    { key: 'amount', label: 'Tổng tiền', width: 120, type: 'number', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
    { key: 'last', label: 'Nhập gần nhất', minWidth: 110, type: 'text', render: (r) => vn(r.last) }
  ];
  const sumVisible = useMemo(() => sortRows(filterRows(summary, sumCols, fS), sumCols, sS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, fS, sS]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <button onClick={() => setView('detail')} className={`px-3 py-1.5 rounded font-bold border ${view === 'detail' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Chi tiết từng lần nhập</button>
        <button onClick={() => setView('summary')} className={`px-3 py-1.5 rounded font-bold border ${view === 'summary' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Tổng hợp theo NCC × NVL</button>
      </div>
      {lines.length === 0 ? <p className="bg-white border rounded p-6 text-gray-600">Chưa có dữ liệu mua hàng trong khoảng ngày này.</p> : view === 'detail' ? (
        <DataTable columns={detailCols} allRows={lines} rows={detailVisible} rowKey={(r, i) => r.ref_no + r.item_code + i} filters={fD} onFiltersChange={setFD} sort={sD} onSortChange={setSD} maxHeight="calc(100vh - 330px)"
          footer={[<td key="l" colSpan={7} className="px-2 py-1 text-right">Tổng tiền ({detailVisible.length} dòng):</td>, <td key="a" className="px-2 py-1 text-right">{money(detailVisible.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>]} />
      ) : (
        <DataTable columns={sumCols} allRows={summary} rows={sumVisible} rowKey={(r) => r.key} filters={fS} onFiltersChange={setFS} sort={sS} onSortChange={setSS} maxHeight="calc(100vh - 330px)"
          footer={[<td key="l" colSpan={6} className="px-2 py-1 text-right">Tổng tiền ({sumVisible.length} dòng):</td>, <td key="a" className="px-2 py-1 text-right">{money(sumVisible.reduce((s, r) => s + r.amount, 0))}</td>, <td key="n"></td>]} />
      )}
    </div>
  );
}

// ---------- Tab 3: sổ theo dõi đơn đặt hàng ----------
function OrdersTab({ branch, branchInfo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(0);

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/purchase-books/orders/${branch}`).then((r) => r.json()).then((d) => d.success && setData(d.data)).finally(() => setLoading(false));
  }, [branch]);

  const download = async (o) => {
    try {
      setBusy(o.id);
      const one = await (await fetch(`/api/purchase-orders/${branch}/${o.id}`)).json();
      if (!one.success) throw new Error(one.message);
      const p = one.data.payload || {};
      const res = await fetch('/api/purchase-plans/export-xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...p, orderNo: one.data.order_no, supplier: p.supplierName, branchName: branchInfo ? branchInfo.branch_name : '' }) });
      if (!res.ok) throw new Error('Xuất file thất bại');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-mua-hang-${o.order_no.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { alert('❌ ' + e.message); } finally { setBusy(0); }
  };

  const openDetail = async (o) => {
    const j = await (await fetch(`/api/purchase-books/orders/${branch}/${o.id}/detail`)).json();
    if (j.success) setDetail(j.data); else alert('❌ ' + j.message);
  };

  const orders = data ? data.orders : [];
  const columns = [
    { key: 'order_no', label: 'Số đơn', width: 104, type: 'text', render: (r) => <b className="text-blue-700">{r.order_no}</b> },
    { key: 'created', label: 'Ngày lập', width: 140, type: 'text', get: (r) => iso(r.created_at), render: (r) => new Date(r.created_at).toLocaleString('vi-VN') },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 280, type: 'text', get: (r) => r.supplier_name || '' },
    { key: 'buyer_company', label: 'Công ty mua', width: 220, type: 'text' },
    { key: 'cycle_label', label: 'Nội dung', minWidth: 200, type: 'text', get: (r) => r.cycle_label || '' },
    { key: 'line_count', label: 'Số dòng', width: 70, type: 'number', align: 'right', get: (r) => Number(r.line_count) },
    { key: 'total_amount', label: 'Tổng tiền (đ)', width: 110, type: 'number', align: 'right', get: (r) => Number(r.total_amount), render: (r) => money(r.total_amount) },
    { key: 'fulfil_pct', label: '% đã nhận', width: 84, type: 'number', align: 'right', render: (r) => r.fulfil_pct + '%' },
    { key: 'status', label: 'Tình trạng', width: 120, type: 'select', render: (r) => <span className={r.status === 'Đã nhận đủ' ? 'text-green-700 font-bold' : r.status === 'Chưa nhận' ? 'text-red-600 font-bold' : 'text-orange-600 font-bold'}>{r.status}</span> },
    {
      key: 'act', label: '', width: 150, filterable: false, get: () => '', noTitle: true,
      render: (r) => (
        <div className="flex gap-1">
          <button onClick={() => openDetail(r)} className="bg-blue-600 hover:bg-blue-700 text-white px-2 rounded font-bold" style={{ height: 22 }}>Chi tiết</button>
          <button disabled={busy === r.id} onClick={() => download(r)} className="bg-green-600 hover:bg-green-700 text-white px-2 rounded font-bold disabled:opacity-50" style={{ height: 22 }}>⬇ Excel</button>
        </div>
      )
    }
  ];
  const visible = useMemo(() => sortRows(filterRows(orders, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, filters, sort, busy]);

  return (
    <div className="space-y-2">
      <p className="text-gray-500">Số đơn dạng 001/Tháng/Năm, về 001 khi sang tháng mới. "% đã nhận" tính các lần nhập hàng đồng bộ từ CUKCUK, từ ngày lập đơn đến {data ? data.windowDays : 10} ngày sau (đúng nhà cung cấp trên đơn).</p>
      {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : orders.length === 0 ? (
        <p className="bg-white border rounded p-6 text-gray-600">Chưa có đơn nào. Vào Kế hoạch mua, bấm "Xuất đơn mua hàng" để tạo đơn đầu tiên.</p>
      ) : (
        <DataTable columns={columns} allRows={orders} rows={visible} rowKey={(r) => r.id} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 340px)" />
      )}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-5 space-y-3 max-h-screen overflow-auto">
            <h3 className="text-lg font-bold">Đơn {detail.order_no} · {detail.supplier_name || 'chưa chọn NCC'}</h3>
            <p className="text-gray-600">Đã nhận {detail.pct}% ({detail.status}). Tính các lần nhập từ {vn(detail.from)} đến {vn(detail.to)}.</p>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-gray-100">{['Nguyên vật liệu', 'Nhóm', 'ĐVT', 'Đặt', 'Đã nhận', 'Còn thiếu'].map((h) => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {detail.detail.map((l, i) => (
                  <tr key={i} className={l.missing > 0 ? 'bg-orange-50' : ''}>
                    <td className="border px-2 py-1">{l.name}</td><td className="border px-2 py-1">{l.group}</td><td className="border px-2 py-1 text-center">{l.unit}</td>
                    <td className="border px-2 py-1 text-right">{num(l.ordered)}</td><td className="border px-2 py-1 text-right">{num(l.received)}</td>
                    <td className="border px-2 py-1 text-right font-bold">{num(l.missing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right"><button onClick={() => setDetail(null)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Tab 4: nhập thực tế so với đơn đặt hàng ----------
function CompareTab({ branch, suppliers }) {
  const [period, setPeriod] = useState('week');
  const [date, setDate] = useState(todayVn());
  const [supplier, setSupplier] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ period, date });
      if (supplier) qs.set('supplier', supplier);
      const j = await (await fetch(`/api/purchase-books/compare/${branch}?${qs.toString()}`)).json();
      if (j.success) setData(j.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [branch, period, supplier]);

  const rows = data ? data.rows : [];
  const periodLabel = { day: 'Nhập trong ngày', week: 'Nhập trong tuần', month: 'Nhập trong tháng' }[period];
  const columns = [
    { key: 'material_name', label: 'Nguyên vật liệu', width: 320, type: 'text', render: (r) => <span className="font-medium">{r.material_name}</span> },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    { key: 'ordered', label: 'Đặt cả tháng', width: 110, type: 'number', align: 'right', render: (r) => num(r.ordered) },
    { key: 'received_period', label: periodLabel, width: 130, type: 'number', align: 'right', render: (r) => num(r.received_period) },
    { key: 'received_cum', label: 'Lũy kế từ đầu tháng', width: 140, type: 'number', align: 'right', render: (r) => <b>{num(r.received_cum)}</b> },
    { key: 'remaining', label: 'Còn phải nhập', width: 110, type: 'number', align: 'right', render: (r) => num(r.remaining) },
    { key: 'pct', label: '% hoàn thành', width: 150, type: 'number', align: 'right', get: (r) => (r.pct === null ? 0 : r.pct), noTitle: true,
      render: (r) => (r.pct === null ? <span className="text-gray-400">—</span> : (
        <div className="flex items-center gap-1 justify-end"><div className="bg-gray-200 rounded" style={{ width: 60, height: 8 }}><div className={`rounded ${r.pct >= 95 ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: Math.min(100, r.pct) + '%', height: 8 }} /></div><span>{r.pct}%</span></div>)) },
    { key: 'status', label: 'Tình trạng', minWidth: 120, type: 'select', render: (r) => <span className={r.status === 'Đã đủ' ? 'text-green-700 font-bold' : r.status === 'Chưa nhập' ? 'text-red-600 font-bold' : r.status === 'Nhập ngoài đơn' ? 'text-purple-700 font-bold' : 'text-orange-600 font-bold'}>{r.status}</span> }
  ];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, sort, period]);
  const stat = (s) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-2">
      <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {[['day', 'Ngày'], ['week', 'Tuần'], ['month', 'Tháng']].map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`px-3 py-1.5 rounded font-bold border ${period === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>{l}</button>
          ))}
        </div>
        <div><label className="block font-semibold mb-0.5">Chọn ngày</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border px-2 py-1 rounded" /></div>
        <button onClick={load} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">Xem</button>
        <div>
          <label className="block font-semibold mb-0.5">Nhà cung cấp</label>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="border px-2 py-1 rounded" style={{ maxWidth: 260 }}>
            <option value="">Tất cả nhà cung cấp</option>
            {suppliers.filter((s) => !s.inactive).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        {data && <span className="text-gray-600">Kỳ xem: {vn(data.from)} → {vn(data.to)} · Đơn đặt hàng tháng {data.month}/{data.year}</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">NVL có trong đơn / nhập</p><p className="text-lg font-bold">{rows.length}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Đã nhập đủ</p><p className="text-lg font-bold text-green-700">{stat('Đã đủ')}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nhập một phần / chưa nhập</p><p className="text-lg font-bold text-orange-600">{stat('Nhập một phần')} / {stat('Chưa nhập')}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nhập ngoài đơn</p><p className="text-lg font-bold text-purple-700">{stat('Nhập ngoài đơn')}</p></div>
      </div>
      {loading && !data ? <p className="p-4 text-gray-600">Đang tải…</p> : rows.length === 0 ? (
        <p className="bg-white border rounded p-6 text-gray-600">Chưa có đơn đặt hàng hoặc dữ liệu nhập hàng trong tháng này. Chỉ NVL đã ghép với NVL trong app (mục Tồn kho) mới được so sánh.</p>
      ) : (
        <DataTable columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.material_id} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 430px)" />
      )}
    </div>
  );
}

export default function PurchaseBooks() {
  const router = useRouter();
  const { branch } = router.query;
  const [tab, setTab] = useState('daily');
  const [branchInfo, setBranchInfo] = useState(null);
  const [lines, setLines] = useState([]);
  const [range, setRange] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLines = async (f, t) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const j = await (await fetch(`/api/purchase-books/lines/${branch}?${qs.toString()}`)).json();
      if (j.success) {
        setLines(j.data.rows);
        setRange(j.data.range);
        if (!f && j.data.range && j.data.range.min_date) { setFrom(iso(j.data.range.min_date)); setTo(iso(j.data.range.max_date)); }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    fetch(`/api/suppliers/${branch}`).then((r) => r.json()).then((d) => d.success && setSuppliers(d.data)).catch(() => {});
    loadLines('', '');
  }, [branch]);

  return (
    <>
      <Head>
        <title>Sổ Mua Hàng</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">SỔ MUA HÀNG</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · số liệu nhập hàng đồng bộ từ CUKCUK, đơn đặt hàng xuất từ app</p>
        </header>
        <BranchNav branch={branch} active="books" branchName={branchInfo?.branch_name} />
        <div className="p-4 space-y-2" style={{ maxWidth: 1700, margin: '0 auto' }}>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded font-bold border ${tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{t.label}</button>
            ))}
          </div>
          {(tab === 'daily' || tab === 'book') && (
            <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
              <div><label className="block font-semibold mb-0.5">Từ ngày</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border px-2 py-1 rounded" /></div>
              <div><label className="block font-semibold mb-0.5">Đến ngày</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border px-2 py-1 rounded" /></div>
              <button onClick={() => loadLines(from, to)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">Xem</button>
              {range && range.min_date && <span className="text-gray-600">Có dữ liệu mua hàng từ {vn(range.min_date)} đến {vn(range.max_date)} · {lines.length} dòng</span>}
            </div>
          )}
          {loading && (tab === 'daily' || tab === 'book') ? <p className="p-4 text-gray-600">Đang tải…</p> : tab === 'daily' ? <DailyTab lines={lines} /> : tab === 'book' ? <BookTab lines={lines} /> : tab === 'orders' ? <OrdersTab branch={branch} branchInfo={branchInfo} /> : <CompareTab branch={branch} suppliers={suppliers} />}
        </div>
      </div>
    </>
  );
}
