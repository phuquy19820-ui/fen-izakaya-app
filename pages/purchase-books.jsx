import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import DateRangeBar, { presetRange } from '../components/DateRangeBar';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const price = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const iso = (d) => String(d).slice(0, 10);
const vn = (d) => (d ? iso(d).split('-').reverse().join('/') : '');
const short = (d) => iso(d).slice(8, 10) + '/' + iso(d).slice(5, 7);

const TABS = [
  { key: 'daily', label: '📅 Mua hàng theo NVL từng ngày' },
  { key: 'book', label: '📒 Sổ nhập hàng theo NCC & NVL' },
  { key: 'orders', label: '🧾 Sổ theo dõi đơn đặt hàng' },
  { key: 'compare', label: '⚖️ Nhập thực tế so với đơn đặt hàng' },
  { key: 'units', label: '📐 Đơn vị tính quy đổi' }
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
      const key = l.item_code + '|' + l.large_unit;
      const cur = map.get(key) || { key, name: l.item_name, unit: l.large_unit, byDate: {}, qty: 0, amount: 0 };
      const x = cur.byDate[d] || { qty: 0, amount: 0 };
      x.qty += Number(l.qty_large) || 0;
      x.amount += Number(l.amount) || 0;
      cur.byDate[d] = x;
      cur.qty += Number(l.qty_large) || 0;
      cur.amount += Number(l.amount) || 0;
      map.set(key, cur);
    });
    return { rows: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi')), dates: Array.from(dset).sort() };
  }, [lines]);

  const val = (r, d) => (r.byDate[d] ? r.byDate[d][metric] : 0);
  const fmt = (v) => (v ? (metric === 'qty' ? num(v) : money(v)) : <span className="text-gray-300">·</span>);
  const columns = [
    { key: 'name', label: 'Nguyên vật liệu', width: 300, type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'unit', label: 'ĐVT lớn', width: 66, type: 'select', align: 'center' },
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
        <button onClick={() => setMetric('qty')} className={`px-3 py-1.5 rounded font-bold border ${metric === 'qty' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Số lượng (ĐVT lớn)</button>
        <button onClick={() => setMetric('amount')} className={`px-3 py-1.5 rounded font-bold border ${metric === 'amount' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Thành tiền (đ)</button>
        <span className="text-gray-500 ml-2">Mỗi dòng là một NVL, mỗi cột là một ngày mua. Số lượng theo đơn vị tính lớn (sửa ở tab Đơn vị tính quy đổi).</span>
      </div>
      {rows.length === 0 ? <p className="bg-white border rounded p-6 text-gray-600">Chưa có dữ liệu mua hàng trong khoảng ngày này.</p> : (
        <DataTable
          columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.key}
          filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 380px)"
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

// ---------- Tab 2: sổ nhập hàng theo NCC và NVL, có đơn giá và cảnh báo lệch giá ----------
function BookTab({ lines }) {
  const [view, setView] = useState('detail');
  const [threshold, setThreshold] = useState(30);
  const [onlyWarn, setOnlyWarn] = useState(false);
  const [fD, setFD] = useState({});
  const [sD, setSD] = useState({ key: 'date', dir: 'desc' });
  const [fS, setFS] = useState({});
  const [sS, setSS] = useState({ key: 'amount', dir: 'desc' });

  const warned = (l) => l.deviation_pct !== null && l.deviation_pct !== undefined && Math.abs(Number(l.deviation_pct)) > threshold;
  const rows = useMemo(() => (onlyWarn ? lines.filter(warned) : lines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, onlyWarn, threshold]);
  const warnCount = lines.filter(warned).length;

  const detailCols = [
    { key: 'date', label: 'Ngày', width: 90, type: 'text', get: (r) => iso(r.date), render: (r) => vn(r.date) },
    { key: 'ref_no', label: 'Số phiếu', width: 94, type: 'text' },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 240, type: 'text' },
    { key: 'item_name', label: 'Nguyên vật liệu', width: 260, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'large_unit', label: 'ĐVT lớn', width: 66, type: 'select', align: 'center' },
    { key: 'qty_large', label: 'SL (lớn)', width: 80, type: 'number', align: 'right', render: (r) => num(r.qty_large) },
    { key: 'small_unit', label: 'ĐVT nhỏ', width: 66, type: 'select', align: 'center' },
    { key: 'qty_small', label: 'SL (nhỏ)', width: 84, type: 'number', align: 'right', render: (r) => num(r.qty_small) },
    { key: 'price_large', label: 'Đơn giá / ĐVT lớn', width: 120, type: 'number', align: 'right', render: (r) => <b>{money(r.price_large)}</b> },
    { key: 'price_small', label: 'Đơn giá / ĐVT nhỏ', width: 120, type: 'number', align: 'right', render: (r) => price(r.price_small) },
    { key: 'avg_large', label: 'Giá TB / ĐVT lớn', width: 116, type: 'number', align: 'right', render: (r) => money(r.avg_large) },
    {
      key: 'deviation_pct', label: 'Lệch so với TB', width: 130, type: 'number', align: 'right', noTitle: true,
      get: (r) => (r.deviation_pct === null || r.deviation_pct === undefined ? 0 : Number(r.deviation_pct)),
      render: (r) => {
        if (r.deviation_pct === null || r.deviation_pct === undefined) return <span className="text-gray-300">—</span>;
        const d = Number(r.deviation_pct);
        const bad = Math.abs(d) > threshold;
        return <span className={bad ? 'text-red-600 font-bold' : 'text-gray-600'}>{bad ? (d > 0 ? '⚠ cao ' : '⚠ thấp ') : ''}{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
      }
    },
    { key: 'amount', label: 'Thành tiền', minWidth: 110, type: 'number', align: 'right', render: (r) => <b>{money(r.amount)}</b> }
  ];
  const detailVisible = useMemo(() => sortRows(filterRows(rows, detailCols, fD), detailCols, sD),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, fD, sD, threshold]);

  const summary = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => {
      const key = l.supplier_code + '|' + l.item_code;
      const cur = map.get(key) || { key, supplier_name: l.supplier_name, item_name: l.item_name, large_unit: l.large_unit, small_unit: l.small_unit, times: 0, qty_large: 0, qty_small: 0, amount: 0, min: Infinity, max: 0, last: '', lastPrice: 0, avg_large: Number(l.avg_large) || 0 };
      const pl = Number(l.price_large) || 0;
      cur.times += 1;
      cur.qty_large += Number(l.qty_large) || 0;
      cur.qty_small += Number(l.qty_small) || 0;
      cur.amount += Number(l.amount) || 0;
      cur.min = Math.min(cur.min, pl);
      cur.max = Math.max(cur.max, pl);
      if (iso(l.date) >= cur.last) { cur.last = iso(l.date); cur.lastPrice = pl; }
      map.set(key, cur);
    });
    return Array.from(map.values()).map((r) => ({
      ...r, min: r.min === Infinity ? 0 : r.min,
      avg: r.qty_large ? r.amount / r.qty_large : 0,
      spread: r.max > 0 ? ((r.max - (r.min === Infinity ? 0 : r.min)) / (r.amount / (r.qty_large || 1) || 1)) * 100 : 0
    }));
  }, [lines]);
  const sumCols = [
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 250, type: 'text' },
    { key: 'item_name', label: 'Nguyên vật liệu', width: 270, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'large_unit', label: 'ĐVT lớn', width: 66, type: 'select', align: 'center' },
    { key: 'times', label: 'Số lần', width: 60, type: 'number', align: 'right' },
    { key: 'qty_large', label: 'Tổng SL (lớn)', width: 100, type: 'number', align: 'right', render: (r) => num(r.qty_large) },
    { key: 'qty_small', label: 'Tổng SL (nhỏ)', width: 110, type: 'number', align: 'right', render: (r) => <span>{num(r.qty_small)} <span className="text-gray-400">{r.small_unit}</span></span> },
    { key: 'min', label: 'Giá thấp nhất / ĐVT lớn', width: 138, type: 'number', align: 'right', render: (r) => money(r.min) },
    { key: 'avg', label: 'Giá TB / ĐVT lớn', width: 116, type: 'number', align: 'right', render: (r) => <b>{money(r.avg)}</b> },
    { key: 'max', label: 'Giá cao nhất / ĐVT lớn', width: 138, type: 'number', align: 'right', render: (r) => money(r.max) },
    { key: 'spread', label: 'Biên độ giá', width: 110, type: 'number', align: 'right', noTitle: true, render: (r) => <span className={r.spread > threshold ? 'text-red-600 font-bold' : ''}>{r.spread > threshold ? '⚠ ' : ''}{r.spread.toFixed(0)}%</span> },
    { key: 'amount', label: 'Tổng tiền', minWidth: 110, type: 'number', align: 'right', render: (r) => <b>{money(r.amount)}</b> }
  ];
  const sumVisible = useMemo(() => sortRows(filterRows(summary, sumCols, fS), sumCols, sS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, fS, sS, threshold]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setView('detail')} className={`px-3 py-1.5 rounded font-bold border ${view === 'detail' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Chi tiết từng lần nhập</button>
        <button onClick={() => setView('summary')} className={`px-3 py-1.5 rounded font-bold border ${view === 'summary' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Tổng hợp theo NCC × NVL</button>
        <label className="ml-3 font-semibold">Cảnh báo khi giá lệch quá <input type="number" min="1" value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 30))} className="border rounded px-1 text-right" style={{ width: 52 }} /> % so với giá trung bình</label>
        {view === 'detail' && <label className="flex items-center gap-1 cursor-pointer font-bold"><input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} /> Chỉ dòng cảnh báo</label>}
        <span className={warnCount ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>{warnCount ? `⚠ ${warnCount} dòng có đơn giá lệch lớn` : '✔ Không có đơn giá lệch lớn'}</span>
      </div>
      {lines.length === 0 ? <p className="bg-white border rounded p-6 text-gray-600">Chưa có dữ liệu mua hàng trong khoảng ngày này.</p> : view === 'detail' ? (
        <DataTable columns={detailCols} allRows={rows} rows={detailVisible} rowKey={(r, i) => r.ref_no + r.item_code + i} filters={fD} onFiltersChange={setFD} sort={sD} onSortChange={setSD} maxHeight="calc(100vh - 380px)"
          footer={[<td key="l" colSpan={12} className="px-2 py-1 text-right">Tổng tiền ({detailVisible.length} dòng):</td>, <td key="a" className="px-2 py-1 text-right">{money(detailVisible.reduce((s, r) => s + Number(r.amount || 0), 0))}</td>]} />
      ) : (
        <DataTable columns={sumCols} allRows={summary} rows={sumVisible} rowKey={(r) => r.key} filters={fS} onFiltersChange={setFS} sort={sS} onSortChange={setSS} maxHeight="calc(100vh - 380px)"
          footer={[<td key="l" colSpan={10} className="px-2 py-1 text-right">Tổng tiền ({sumVisible.length} dòng):</td>, <td key="a" className="px-2 py-1 text-right">{money(sumVisible.reduce((s, r) => s + r.amount, 0))}</td>]} />
      )}
    </div>
  );
}

// ---------- Tab 3: sổ theo dõi đơn đặt hàng (có xóa đơn / xóa dòng) ----------
function OrdersTab({ branch, branchInfo, from, to, version }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(0);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const j = await (await fetch(`/api/purchase-books/orders/${branch}?${qs.toString()}`)).json();
      if (j.success) setData(j.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [branch, from, to, version]);

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

  const openDetail = async (id) => {
    const j = await (await fetch(`/api/purchase-books/orders/${branch}/${id}/detail`)).json();
    if (j.success) setDetail(j.data); else alert('❌ ' + j.message);
  };

  const deleteOrder = async (o) => {
    if (!window.confirm(`Xóa đơn ${o.order_no}${o.supplier_name ? ' (' + o.supplier_name + ')' : ''}?\nSố đơn này sẽ không được cấp lại.`)) return;
    const j = await (await fetch(`/api/purchase-orders/${branch}/${o.id}`, { method: 'DELETE' })).json();
    if (!j.success) { alert('❌ ' + j.message); return; }
    setDetail(null);
    load();
  };

  const deleteLine = async (l) => {
    if (!window.confirm(`Xóa dòng "${l.name}" khỏi đơn ${detail.order_no}?`)) return;
    const j = await (await fetch(`/api/purchase-orders/${branch}/${detail.id}/lines/${l.index}`, { method: 'DELETE' })).json();
    if (!j.success) { alert('❌ ' + j.message); return; }
    if (j.data && j.data.orderDeleted) { setDetail(null); } else { await openDetail(detail.id); }
    load();
  };

  const orders = data ? data.orders : [];
  const columns = [
    { key: 'order_no', label: 'Số đơn', width: 100, type: 'text', render: (r) => <b className="text-blue-700">{r.order_no}</b> },
    { key: 'created', label: 'Ngày lập', width: 140, type: 'text', get: (r) => iso(r.created_at), render: (r) => new Date(r.created_at).toLocaleString('vi-VN') },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 260, type: 'text', get: (r) => r.supplier_name || '' },
    { key: 'buyer_company', label: 'Công ty mua', width: 200, type: 'text' },
    { key: 'cycle_label', label: 'Nội dung', minWidth: 180, type: 'text', get: (r) => r.cycle_label || '' },
    { key: 'line_count', label: 'Số dòng', width: 66, type: 'number', align: 'right', get: (r) => Number(r.line_count) },
    { key: 'total_amount', label: 'Tổng tiền (đ)', width: 108, type: 'number', align: 'right', get: (r) => Number(r.total_amount), render: (r) => money(r.total_amount) },
    { key: 'fulfil_pct', label: '% đã nhận', width: 80, type: 'number', align: 'right', render: (r) => r.fulfil_pct + '%' },
    { key: 'status', label: 'Tình trạng', width: 112, type: 'select', render: (r) => <span className={r.status === 'Đã nhận đủ' ? 'text-green-700 font-bold' : r.status === 'Chưa nhận' ? 'text-red-600 font-bold' : 'text-orange-600 font-bold'}>{r.status}</span> },
    {
      key: 'act', label: '', width: 230, filterable: false, get: () => '', noTitle: true,
      render: (r) => (
        <div className="flex gap-1">
          <button onClick={() => openDetail(r.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-2 rounded font-bold" style={{ height: 22 }}>Chi tiết</button>
          <button disabled={busy === r.id} onClick={() => download(r)} className="bg-green-600 hover:bg-green-700 text-white px-2 rounded font-bold disabled:opacity-50" style={{ height: 22 }}>⬇ Excel</button>
          <button onClick={() => deleteOrder(r)} className="bg-red-600 hover:bg-red-700 text-white px-2 rounded font-bold" style={{ height: 22 }}>🗑 Xóa</button>
        </div>
      )
    }
  ];
  const visible = useMemo(() => sortRows(filterRows(orders, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, filters, sort, busy]);

  return (
    <div className="space-y-2">
      <p className="text-gray-500">Số đơn dạng 001/Tháng/Năm, về 001 khi sang tháng mới. "% đã nhận" tính các lần nhập hàng đồng bộ từ CUKCUK, từ ngày lập đơn đến {data ? data.windowDays : 10} ngày sau (đúng nhà cung cấp trên đơn). Lọc theo ngày lập đơn.</p>
      {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : orders.length === 0 ? (
        <p className="bg-white border rounded p-6 text-gray-600">Không có đơn nào trong khoảng ngày này. Vào Kế hoạch mua, bấm "Xuất đơn mua hàng" để tạo đơn.</p>
      ) : (
        <DataTable columns={columns} allRows={orders} rows={visible} rowKey={(r) => r.id} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 380px)" />
      )}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-5 space-y-3 max-h-screen overflow-auto">
            <h3 className="text-lg font-bold">Đơn {detail.order_no} · {detail.supplier_name || 'chưa chọn NCC'}</h3>
            <p className="text-gray-600">Đã nhận {detail.pct}% ({detail.status}). Tính các lần nhập từ {vn(detail.from)} đến {vn(detail.to)}.</p>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="bg-gray-100">{['Nguyên vật liệu', 'Nhóm', 'ĐVT', 'Đặt', 'Đơn giá', 'Đã nhận', 'Còn thiếu', ''].map((h) => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}</tr></thead>
              <tbody>
                {detail.detail.map((l) => (
                  <tr key={l.index} className={l.missing > 0 ? 'bg-orange-50' : ''}>
                    <td className="border px-2 py-1">{l.name}</td><td className="border px-2 py-1">{l.group}</td><td className="border px-2 py-1 text-center">{l.unit}</td>
                    <td className="border px-2 py-1 text-right">{num(l.ordered)}</td><td className="border px-2 py-1 text-right">{money(l.price)}</td>
                    <td className="border px-2 py-1 text-right">{num(l.received)}</td><td className="border px-2 py-1 text-right font-bold">{num(l.missing)}</td>
                    <td className="border px-2 py-1 text-center"><button onClick={() => deleteLine(l)} className="text-red-600 font-bold" title="Xóa dòng này khỏi đơn">✕ Xóa</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between">
              <button onClick={() => deleteOrder({ id: detail.id, order_no: detail.order_no, supplier_name: detail.supplier_name })} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold">🗑 Xóa cả đơn</button>
              <button onClick={() => setDetail(null)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Tab 4: nhập thực tế so với đơn đặt hàng (theo khoảng ngày) ----------
function CompareTab({ branch, suppliers, from, to, version }) {
  const [supplier, setSupplier] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (supplier) qs.set('supplier', supplier);
      const j = await (await fetch(`/api/purchase-books/compare/${branch}?${qs.toString()}`)).json();
      if (j.success) setData(j.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [branch, from, to, supplier, version]);

  const rows = data ? data.rows : [];
  const columns = [
    { key: 'material_name', label: 'Nguyên vật liệu', width: 300, type: 'text', render: (r) => <span className="font-medium">{r.material_name}</span> },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    { key: 'ordered_range', label: 'Đặt trong kỳ', width: 100, type: 'number', align: 'right', render: (r) => num(r.ordered_range) },
    { key: 'ordered_month', label: 'Đặt cả tháng', width: 104, type: 'number', align: 'right', render: (r) => num(r.ordered_month) },
    { key: 'received_range', label: 'Nhập trong kỳ', width: 104, type: 'number', align: 'right', render: (r) => num(r.received_range) },
    { key: 'received_cum', label: 'Lũy kế từ đầu tháng', width: 130, type: 'number', align: 'right', render: (r) => <b>{num(r.received_cum)}</b> },
    { key: 'remaining', label: 'Còn phải nhập', width: 106, type: 'number', align: 'right', render: (r) => num(r.remaining) },
    {
      key: 'pct', label: '% hoàn thành', width: 140, type: 'number', align: 'right', get: (r) => (r.pct === null ? 0 : r.pct), noTitle: true,
      render: (r) => (r.pct === null ? <span className="text-gray-400">—</span> : (
        <div className="flex items-center gap-1 justify-end"><div className="bg-gray-200 rounded" style={{ width: 54, height: 8 }}><div className={`rounded ${r.pct >= 95 ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: Math.min(100, r.pct) + '%', height: 8 }} /></div><span>{r.pct}%</span></div>))
    },
    { key: 'status', label: 'Tình trạng', minWidth: 120, type: 'select', render: (r) => <span className={r.status === 'Đã đủ' ? 'text-green-700 font-bold' : r.status === 'Chưa nhập' ? 'text-red-600 font-bold' : r.status === 'Nhập ngoài đơn' ? 'text-purple-700 font-bold' : 'text-orange-600 font-bold'}>{r.status}</span> }
  ];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, sort]);
  const stat = (s) => rows.filter((r) => r.status === s).length;

  return (
    <div className="space-y-2">
      <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
        <div>
          <label className="block font-semibold mb-0.5">Nhà cung cấp</label>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="border px-2 py-1 rounded" style={{ maxWidth: 300 }}>
            <option value="">Tất cả nhà cung cấp</option>
            {suppliers.filter((s) => !s.inactive).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        {data && <span className="text-gray-600">Kỳ xem: {vn(data.from)} → {vn(data.to)} · so với tổng đặt hàng tháng {vn(data.monthStart)} → {vn(data.monthEnd)}. Chọn "Hôm nay", "Tuần này" hoặc "Tháng này" ở thanh ngày phía trên để xem theo ngày/tuần/tháng.</span>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Số NVL (đặt hoặc nhập)</p><p className="text-lg font-bold">{rows.length}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Đã nhập đủ</p><p className="text-lg font-bold text-green-700">{stat('Đã đủ')}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nhập một phần / chưa nhập</p><p className="text-lg font-bold text-orange-600">{stat('Nhập một phần')} / {stat('Chưa nhập')}</p></div>
        <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nhập ngoài đơn</p><p className="text-lg font-bold text-purple-700">{stat('Nhập ngoài đơn')}</p></div>
      </div>
      {loading && !data ? <p className="p-4 text-gray-600">Đang tải…</p> : rows.length === 0 ? (
        <p className="bg-white border rounded p-6 text-gray-600">Chưa có đơn đặt hàng hoặc dữ liệu nhập hàng trong kỳ này. Chỉ NVL đã ghép với NVL trong app (mục Tồn kho) mới được so sánh.</p>
      ) : (
        <DataTable columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.material_id} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 470px)" />
      )}
    </div>
  );
}

// ---------- Tab 5: đơn vị tính quy đổi ----------
function UnitsTab({ branch }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    if (!branch) return;
    const j = await (await fetch(`/api/units/${branch}`)).json();
    if (j.success) setRows(j.data);
    setLoading(false);
  };
  useEffect(() => { load(); }, [branch]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };
  const save = async (code, patch) => {
    setRows((rs) => rs.map((r) => (r.item_code === code ? { ...r, ...patch, source: 'MANUAL' } : r)));
    const body = { branchId: branch, itemCode: code };
    if (patch.large_unit !== undefined) body.largeUnit = patch.large_unit;
    if (patch.small_unit !== undefined) body.smallUnit = patch.small_unit;
    if (patch.ratio !== undefined) body.ratio = patch.ratio;
    const j = await (await fetch('/api/units', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    if (!j.success) { flash('❌ ' + j.message); load(); } else flash('✅ Đã lưu');
  };
  const reset = async (code) => {
    const j = await (await fetch('/api/units/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, itemCode: code }) })).json();
    flash(j.success ? '✅ Đã đặt lại mặc định theo tên' : '❌ ' + j.message);
    load();
  };

  const textIn = (v, commit) => <input defaultValue={v} key={String(v)} onBlur={(e) => { const x = e.target.value.trim(); if (x && x !== v) commit(x); }} className="w-full border rounded text-xs bg-white" style={{ height: 22, padding: '0 4px' }} />;
  const SOURCE = { DEFAULT: 'Mặc định', AUTO: 'Tự động theo tên', MANUAL: 'Đã sửa tay' };
  const columns = [
    { key: 'item_code', label: 'Mã CUKCUK', width: 104, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.item_code}</span> },
    { key: 'item_name', label: 'Nguyên vật liệu', width: 330, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'base_unit', label: 'ĐVT trên CUKCUK', width: 110, type: 'select', get: (r) => r.base_unit || '' },
    { key: 'large_unit', label: 'ĐVT lớn', width: 90, type: 'text', noTitle: true, render: (r) => textIn(r.large_unit, (v) => save(r.item_code, { large_unit: v })) },
    { key: 'ratio', label: '1 ĐVT lớn = ... ĐVT nhỏ', width: 150, type: 'number', align: 'right', get: (r) => Number(r.ratio), noTitle: true,
      render: (r) => <input type="number" min="0" step="any" defaultValue={Number(r.ratio)} key={String(r.ratio)} onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v !== Number(r.ratio)) save(r.item_code, { ratio: v }); }} className="w-full border rounded text-xs text-right bg-white" style={{ height: 22, padding: '0 4px' }} /> },
    { key: 'small_unit', label: 'ĐVT nhỏ nhất', width: 100, type: 'text', noTitle: true, render: (r) => textIn(r.small_unit, (v) => save(r.item_code, { small_unit: v })) },
    { key: 'preview', label: 'Quy đổi', width: 200, filterable: false, get: () => '', render: (r) => <span className="text-gray-600">1 {r.large_unit} = {num(r.ratio)} {r.small_unit}</span> },
    { key: 'source', label: 'Nguồn', width: 130, type: 'select', get: (r) => SOURCE[r.source] || r.source },
    { key: 'purchase_count', label: 'Số lần mua', width: 84, type: 'number', align: 'right', get: (r) => Number(r.purchase_count) },
    { key: 'act', label: '', minWidth: 110, filterable: false, get: () => '', noTitle: true, render: (r) => <button onClick={() => reset(r.item_code)} className="px-2 border rounded font-bold hover:bg-gray-100" style={{ height: 22 }} title="Đặt lại theo tên NVL">↺ Mặc định</button> }
  ];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, sort]);

  return (
    <div className="space-y-2">
      <div className="bg-white border rounded p-3 text-gray-700 space-y-1">
        <p><b>Đơn vị tính quy đổi cho từng NVL:</b> mặc định 1 kg = 1.000 gr và 1 lít = 1.000 ml. Với NVL có quy cách trong tên (chai 907 g, gói 1 kg, hộp 1 L, lon 330 ml…), app tự suy ra đơn vị lớn (chai, hộp, gói, bao, can, lon…) và số quy đổi. Bạn sửa trực tiếp trong bảng; mọi sổ mua hàng dùng bảng này để tính số lượng và đơn giá theo đơn vị lớn và đơn vị nhỏ nhất.</p>
        {msg && <p className="font-bold text-green-700">{msg}</p>}
      </div>
      {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : rows.length === 0 ? (
        <p className="bg-white border rounded p-6 text-gray-600">Chưa có NVL nào. Hãy đồng bộ mua hàng/tồn kho từ CUKCUK trước.</p>
      ) : (
        <DataTable columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.item_code} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 340px)" />
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
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mf, mt] = presetRange('month');
  const [from, setFrom] = useState(mf);
  const [to, setTo] = useState(mt);
  const [applied, setApplied] = useState({ from: mf, to: mt });
  const [version, setVersion] = useState(0);

  const loadLines = async (f, t) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const j = await (await fetch(`/api/purchase-books/lines/${branch}?${qs.toString()}`)).json();
      if (j.success) { setLines(j.data.rows); setRange(j.data.range); }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    fetch(`/api/suppliers/${branch}`).then((r) => r.json()).then((d) => d.success && setSuppliers(d.data)).catch(() => {});
  }, [branch]);
  useEffect(() => { loadLines(applied.from, applied.to); }, [branch, applied.from, applied.to, version]);

  const apply = (f, t) => { setApplied({ from: f, to: t }); setVersion((v) => v + 1); };
  const minDate = range && range.min_date ? iso(range.min_date) : '';
  const maxDate = range && range.max_date ? iso(range.max_date) : '';

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
        <div className="p-4 space-y-2" style={{ maxWidth: 1800, margin: '0 auto' }}>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded font-bold border ${tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{t.label}</button>
            ))}
          </div>
          {tab !== 'units' && (
            <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onApply={apply} minDate={minDate} maxDate={maxDate}>
              {range && range.min_date && <span className="text-gray-600">Dữ liệu mua hàng có từ {vn(range.min_date)} đến {vn(range.max_date)}{(tab === 'daily' || tab === 'book') ? ` · ${lines.length} dòng trong kỳ` : ''}</span>}
            </DateRangeBar>
          )}
          {tab === 'daily' ? (loading ? <p className="p-4 text-gray-600">Đang tải…</p> : <DailyTab lines={lines} />)
            : tab === 'book' ? (loading ? <p className="p-4 text-gray-600">Đang tải…</p> : <BookTab lines={lines} />)
              : tab === 'orders' ? <OrdersTab branch={branch} branchInfo={branchInfo} from={applied.from} to={applied.to} version={version} />
                : tab === 'compare' ? <CompareTab branch={branch} suppliers={suppliers} from={applied.from} to={applied.to} version={version} />
                  : <UnitsTab branch={branch} />}
        </div>
      </div>
    </>
  );
}
