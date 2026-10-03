import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const isoDate = (d) => String(d).slice(0, 10);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

export default function SalesReport() {
  const router = useRouter();
  const { branch } = router.query;

  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dish');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('revenue');

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

  const rows = useMemo(() => {
    if (!data) return [];
    const q = norm(search);
    const list = data.byDish.filter((r) => {
      const k = r.kind || 'Khác';
      if (kind !== 'ALL' && k !== kind) return false;
      return !q || norm(r.name).includes(q) || norm(r.code).includes(q);
    });
    return [...list].sort((a, b) => sortBy === 'qty' ? Number(b.qty) - Number(a.qty) : Number(b.revenue) - Number(a.revenue));
  }, [data, kind, search, sortBy]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + Number(r.revenue || 0), 0);
    const qty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    return { revenue, qty, dishes: rows.length };
  }, [rows]);

  const exportCsv = () => {
    const header = ['Mã món', 'Tên món', 'Loại', 'Số lượng', 'Doanh thu'];
    const lines = rows.map((r) => [r.code, r.name, r.kind || 'Khác', r.qty, Math.round(r.revenue)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['﻿' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doanh-thu-theo-mon-${from}_${to}.csv`;
    a.click();
  };

  const maxDayRevenue = data ? Math.max(1, ...data.byDay.map((d) => Number(d.revenue) || 0)) : 1;
  const noRevenue = data && data.byDish.length > 0 && data.byDish.every((r) => !Number(r.revenue));

  return (
    <>
      <Head>
        <title>Doanh Thu Theo Món</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-sm">
        <header className="px-6 py-3 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">DOANH THU & SỐ LƯỢNG THEO MÓN</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'}</p>
        </header>
        <BranchNav branch={branch} active="sales" branchName={branchInfo?.branch_name} />

        <div className="p-6 space-y-4">
          <div className="bg-white rounded shadow p-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Từ ngày</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border p-2 rounded" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Đến ngày</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border p-2 rounded" />
            </div>
            <button onClick={() => load(from, to)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-bold">Xem báo cáo</button>
            <div>
              <label className="block text-xs font-semibold mb-1">Loại</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="border p-2 rounded">
                <option value="ALL">Tất cả</option>
                <option value="Món ăn">Món ăn</option>
                <option value="Đồ uống">Đồ uống</option>
                <option value="Mặt hàng khác">Mặt hàng khác</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Sắp xếp theo</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border p-2 rounded">
                <option value="revenue">Doanh thu</option>
                <option value="qty">Số lượng</option>
              </select>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Tìm món…" className="border p-2 rounded w-56 ml-auto" />
            <button onClick={exportCsv} className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded font-bold">⬇ Xuất CSV</button>
          </div>

          {noRevenue && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-3">
              Dữ liệu doanh số hiện tại chưa có doanh thu (chỉ có số lượng). Vào mục <b>Đồng bộ & ghép món</b> bấm "Đồng bộ doanh số từ CUKCUK" một lần nữa để lấy cả doanh thu.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded shadow p-4"><p className="text-gray-500 text-xs">Tổng doanh thu</p><p className="text-xl font-bold text-blue-700">{money(totals.revenue)} ₫</p></div>
            <div className="bg-white rounded shadow p-4"><p className="text-gray-500 text-xs">Tổng số lượng bán</p><p className="text-xl font-bold">{num(totals.qty)}</p></div>
            <div className="bg-white rounded shadow p-4"><p className="text-gray-500 text-xs">Số món khác nhau</p><p className="text-xl font-bold">{totals.dishes}</p></div>
            <div className="bg-white rounded shadow p-4"><p className="text-gray-500 text-xs">Bán chạy nhất (theo SL)</p><p className="text-base font-bold truncate">{rows.length ? [...rows].sort((a, b) => Number(b.qty) - Number(a.qty))[0].name : '—'}</p></div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setTab('dish')} className={`px-4 py-2 rounded font-bold ${tab === 'dish' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}>🍽️ Theo món</button>
            <button onClick={() => setTab('day')} className={`px-4 py-2 rounded font-bold ${tab === 'day' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}>📅 Theo ngày</button>
          </div>

          {loading ? (
            <p className="text-gray-600">Đang tải…</p>
          ) : !data || data.byDish.length === 0 ? (
            <p className="text-gray-600 bg-white rounded shadow p-6">Chưa có dữ liệu doanh số trong khoảng ngày này. Vào mục "Đồng bộ & ghép món" để lấy doanh số từ CUKCUK.</p>
          ) : tab === 'dish' ? (
            <div className="bg-white rounded shadow overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b font-bold uppercase text-gray-700 text-xs">
                    <th className="p-2">#</th>
                    <th className="p-2">Mã món</th>
                    <th className="p-2">Tên món</th>
                    <th className="p-2">Loại</th>
                    <th className="p-2 text-right">Số lượng</th>
                    <th className="p-2 text-right">Doanh thu</th>
                    <th className="p-2 text-right">% doanh thu</th>
                    <th className="p-2">Định lượng</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.code} className="border-b hover:bg-blue-50">
                      <td className="p-2 text-gray-500">{i + 1}</td>
                      <td className="p-2 font-mono text-xs text-blue-700">{r.code}</td>
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2">{r.kind || 'Khác'}</td>
                      <td className="p-2 text-right font-bold">{num(r.qty)}</td>
                      <td className="p-2 text-right">{money(r.revenue)}</td>
                      <td className="p-2 text-right text-gray-600">{totals.revenue ? ((Number(r.revenue) / totals.revenue) * 100).toFixed(1) + '%' : '—'}</td>
                      <td className="p-2 text-xs">{r.matched ? <span className="text-green-700">✔ đã ghép</span> : (r.kind === 'Món ăn' ? <span className="text-orange-600">⚠ chưa ghép</span> : <span className="text-gray-400">—</span>)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-bold border-t-2">
                    <td colSpan="4" className="p-2 text-right">Tổng cộng:</td>
                    <td className="p-2 text-right">{num(totals.qty)}</td>
                    <td className="p-2 text-right">{money(totals.revenue)}</td>
                    <td colSpan="2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded shadow overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b font-bold uppercase text-gray-700 text-xs">
                    <th className="p-2">Ngày</th>
                    <th className="p-2 text-right">Số lượng</th>
                    <th className="p-2 text-right">Số món ăn</th>
                    <th className="p-2 text-right">Doanh thu món ăn</th>
                    <th className="p-2 text-right">Doanh thu đồ uống</th>
                    <th className="p-2 text-right">Tổng doanh thu</th>
                    <th className="p-2 w-64"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.map((d) => (
                    <tr key={String(d.date)} className="border-b hover:bg-blue-50">
                      <td className="p-2 font-medium">{new Date(d.date).toLocaleDateString('vi-VN')}</td>
                      <td className="p-2 text-right">{num(d.qty)}</td>
                      <td className="p-2 text-right">{num(d.food_qty)}</td>
                      <td className="p-2 text-right">{money(d.food_revenue)}</td>
                      <td className="p-2 text-right">{money(d.drink_revenue)}</td>
                      <td className="p-2 text-right font-bold">{money(d.revenue)}</td>
                      <td className="p-2"><div className="bg-blue-500 h-3 rounded" style={{ width: `${((Number(d.revenue) || 0) / maxDayRevenue) * 100}%` }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
