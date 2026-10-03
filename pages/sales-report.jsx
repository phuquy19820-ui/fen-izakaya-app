import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const isoDate = (d) => String(d).slice(0, 10);

export default function SalesReport() {
  const router = useRouter();
  const { branch } = router.query;

  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dish');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dishFilters, setDishFilters] = useState({});
  const [dishSort, setDishSort] = useState({ key: 'revenue', dir: 'desc' });
  const [dayFilters, setDayFilters] = useState({});
  const [daySort, setDaySort] = useState({ key: 'date', dir: 'asc' });

  const load = async (f, t) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const res = await fetch(`/api/sales/report/${branch}?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (!f && json.data.range && json.data.range.min_date) {
          setFrom(isoDate(json.data.range.min_date));
          setTo(isoDate(json.data.range.max_date));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    load('', '');
  }, [branch]);

  const dishRows = useMemo(() => (data ? data.byDish.map((r) => ({ ...r, kind: r.kind || 'Khác', status: r.matched ? 'Đã ghép' : (r.kind === 'Món ăn' ? 'Chưa ghép' : '—') })) : []), [data]);
  const totalRevenueAll = dishRows.reduce((s, r) => s + Number(r.revenue || 0), 0);

  const dishColumns = [
    { key: 'idx', label: '#', width: 44, align: 'center', filterable: false, get: () => '', render: (r, v, i) => null },
    { key: 'code', label: 'Mã món', width: 112, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.code}</span> },
    { key: 'name', label: 'Tên món', type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'kind', label: 'Loại', width: 120, type: 'select' },
    { key: 'qty', label: 'Số lượng', width: 92, type: 'number', align: 'right', render: (r) => <b>{num(r.qty)}</b> },
    { key: 'revenue', label: 'Doanh thu', width: 118, type: 'number', align: 'right', render: (r) => money(r.revenue) },
    { key: 'pct', label: '% DT', width: 84, type: 'number', align: 'right', get: (r) => (totalRevenueAll ? (Number(r.revenue) / totalRevenueAll) * 100 : 0), render: (r, v) => (totalRevenueAll ? v.toFixed(1) + '%' : '—') },
    { key: 'status', label: 'Định lượng', width: 108, type: 'select', render: (r) => (r.status === 'Đã ghép' ? <span className="text-green-700">✔ đã ghép</span> : r.status === 'Chưa ghép' ? <span className="text-orange-600">⚠ chưa ghép</span> : <span className="text-gray-400">—</span>) }
  ];
  const dishVisible = useMemo(
    () => sortRows(filterRows(dishRows, dishColumns, dishFilters), dishColumns, dishSort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dishRows, dishFilters, dishSort, totalRevenueAll]
  );
  const totals = useMemo(() => ({
    revenue: dishVisible.reduce((s, r) => s + Number(r.revenue || 0), 0),
    qty: dishVisible.reduce((s, r) => s + Number(r.qty || 0), 0),
    dishes: dishVisible.length
  }), [dishVisible]);

  const dayRows = useMemo(() => (data ? data.byDay.map((d) => ({ ...d, dateStr: isoDate(d.date) })) : []), [data]);
  const dayColumns = [
    { key: 'dateStr', label: 'Ngày', width: 120, type: 'text', render: (r) => <b>{new Date(r.date).toLocaleDateString('vi-VN')}</b> },
    { key: 'qty', label: 'Tổng số lượng', width: 120, type: 'number', align: 'right', render: (r) => num(r.qty) },
    { key: 'food_qty', label: 'Số món ăn', width: 110, type: 'number', align: 'right', render: (r) => num(r.food_qty) },
    { key: 'food_revenue', label: 'Doanh thu món ăn', width: 150, type: 'number', align: 'right', render: (r) => money(r.food_revenue) },
    { key: 'drink_revenue', label: 'Doanh thu đồ uống', width: 150, type: 'number', align: 'right', render: (r) => money(r.drink_revenue) },
    { key: 'revenue', label: 'Tổng doanh thu', width: 140, type: 'number', align: 'right', render: (r) => <b>{money(r.revenue)}</b> },
    { key: 'bar', label: '', filterable: false, get: () => '', noTitle: true, render: (r) => <div className="bg-blue-500 rounded" style={{ height: 10, width: `${((Number(r.revenue) || 0) / Math.max(1, ...dayRows.map((d) => Number(d.revenue) || 0))) * 100}%` }} /> }
  ];
  const dayVisible = useMemo(
    () => sortRows(filterRows(dayRows, dayColumns, dayFilters), dayColumns, daySort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayRows, dayFilters, daySort]
  );

  const exportCsv = () => {
    const header = ['Mã món', 'Tên món', 'Loại', 'Số lượng', 'Doanh thu'];
    const lines = dishVisible.map((r) => [r.code, r.name, r.kind, r.qty, Math.round(r.revenue)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doanh-thu-theo-mon-${from}_${to}.csv`;
    a.click();
  };

  const noRevenue = dishRows.length > 0 && dishRows.every((r) => !Number(r.revenue));
  const hasDishFilter = Object.values(dishFilters).some((f) => f && (f.text || f.value || (f.val !== undefined && f.val !== '')));

  return (
    <>
      <Head>
        <title>Doanh Thu Theo Món</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">DOANH THU & SỐ LƯỢNG THEO MÓN</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'}</p>
        </header>
        <BranchNav branch={branch} active="sales" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
            <div>
              <label className="block font-semibold mb-0.5">Từ ngày</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border px-2 py-1 rounded" />
            </div>
            <div>
              <label className="block font-semibold mb-0.5">Đến ngày</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border px-2 py-1 rounded" />
            </div>
            <button onClick={() => load(from, to)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">Xem báo cáo</button>
            <div className="flex gap-1 ml-3">
              <button onClick={() => setTab('dish')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'dish' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🍽️ Theo món</button>
              <button onClick={() => setTab('day')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'day' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>📅 Theo ngày</button>
            </div>
            {hasDishFilter && tab === 'dish' && <button onClick={() => setDishFilters({})} className="px-2 py-1 rounded border bg-white text-red-600 font-bold">✕ Xóa bộ lọc</button>}
            <button onClick={exportCsv} className="ml-auto bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded font-bold">⬇ Xuất CSV</button>
          </div>

          {noRevenue && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-2">
              Dữ liệu doanh số hiện tại chưa có doanh thu (chỉ có số lượng). Vào mục <b>Đồng bộ & ghép món</b> bấm "Đồng bộ doanh số từ CUKCUK" một lần nữa để lấy cả doanh thu.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Tổng doanh thu (đang lọc)</p><p className="text-lg font-bold text-blue-700">{money(totals.revenue)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Tổng số lượng</p><p className="text-lg font-bold">{num(totals.qty)}</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Số món khác nhau</p><p className="text-lg font-bold">{totals.dishes}</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Bán chạy nhất (theo SL)</p><p className="text-sm font-bold truncate">{dishVisible.length ? [...dishVisible].sort((a, b) => Number(b.qty) - Number(a.qty))[0].name : '—'}</p></div>
          </div>

          {loading ? (
            <p className="text-gray-600 p-4">Đang tải…</p>
          ) : !data || data.byDish.length === 0 ? (
            <p className="text-gray-600 bg-white rounded border p-6">Chưa có dữ liệu doanh số trong khoảng ngày này. Vào mục "Đồng bộ & ghép món" để lấy doanh số từ CUKCUK.</p>
          ) : tab === 'dish' ? (
            <DataTable
              columns={dishColumns.map((c) => (c.key === 'idx' ? { ...c, render: (r) => dishVisible.indexOf(r) + 1 } : c))}
              allRows={dishRows}
              rows={dishVisible}
              rowKey={(r) => r.code}
              filters={dishFilters}
              onFiltersChange={setDishFilters}
              sort={dishSort}
              onSortChange={setDishSort}
              maxHeight="calc(100vh - 330px)"
              footer={[
                <td key="l" colSpan={4} className="px-2 py-1 text-right">Tổng cộng:</td>,
                <td key="q" className="px-2 py-1 text-right">{num(totals.qty)}</td>,
                <td key="r" className="px-2 py-1 text-right">{money(totals.revenue)}</td>,
                <td key="e" colSpan={2}></td>
              ]}
            />
          ) : (
            <DataTable
              columns={dayColumns}
              allRows={dayRows}
              rows={dayVisible}
              rowKey={(r) => String(r.date)}
              filters={dayFilters}
              onFiltersChange={setDayFilters}
              sort={daySort}
              onSortChange={setDaySort}
              maxHeight="calc(100vh - 330px)"
            />
          )}
        </div>
      </div>
    </>
  );
}
