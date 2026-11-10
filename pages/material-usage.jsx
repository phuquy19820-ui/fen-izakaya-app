import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import MonthPicker from '../components/MonthPicker';

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

export default function MaterialUsage() {
  const router = useRouter();
  const { branch } = router.query;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showMissing, setShowMissing] = useState(true);

  const load = async (y, m) => {
    if (!branch) return;
    setLoading(true); setError('');
    try {
      const j = await (await fetch(`/api/materials/usage/${branch}?year=${y}&month=${m}`)).json();
      if (j.success) { setData(j.data); setDetail(null); } else setError(j.message || 'Lỗi');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    load(year, month);
  }, [branch]);

  const pick = (y, m) => { setYear(y); setMonth(m); load(y, m); };

  const columns = [
    { key: 'material_id', label: 'Mã NVL', width: 110, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.material_id}</span> },
    { key: 'name', label: 'Tên nguyên vật liệu', width: 280, type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'group', label: 'Nhóm hàng', width: 140, type: 'select' },
    { key: 'unit', label: 'ĐVT', width: 56, type: 'select', align: 'center' },
    { key: 'qty', label: 'Số lượng đã tiêu hao', width: 118, type: 'number', align: 'right', render: (r) => <b>{num(r.qty)}</b> },
    { key: 'price', label: 'Đơn giá mua', width: 100, type: 'number', align: 'right', render: (r) => (r.price > 0 ? money(r.price) : <span className="text-red-600 font-bold">chưa có</span>) },
    { key: 'amount', label: 'Thành tiền', width: 112, type: 'number', align: 'right', render: (r) => <b className="text-blue-800">{money(r.amount)}</b> },
    { key: 'price_source', label: 'Nguồn đơn giá', width: 130, type: 'select', render: (r) => <span className={r.price_source === 'Chưa có giá' ? 'text-red-600 font-bold' : 'text-gray-500'}>{r.price_source}</span> },
    { key: 'qty_direct', label: 'Trong đó bán trực tiếp', width: 110, type: 'number', align: 'right', render: (r) => (r.qty_direct ? num(r.qty_direct) : <span className="text-gray-300">—</span>) },
    { key: 'ndish', label: 'Số món dùng', width: 80, type: 'number', align: 'right', get: (r) => r.dishes.length, render: (r) => (r.dishes.length ? <button className="text-blue-700 underline" onClick={(e) => { e.stopPropagation(); setDetail(r); }}>{r.dishes.length} món</button> : <span className="text-gray-300">—</span>) }
  ];

  const rows = data ? data.rows : [];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort), [rows, filters, sort]); // eslint-disable-line
  const total = visible.reduce((a, r) => a + r.amount, 0);
  const cov = data ? data.coverage : null;
  const missing = data ? data.missing : [];

  return (
    <>
      <Head>
        <title>Tiêu hao NVL</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="text-base font-bold">BÁO CÁO TIÊU HAO NGUYÊN VẬT LIỆU THÁNG {month}/{year}</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · số lượng món bán × định lượng món; đơn giá theo giá mua</p>
        </header>
        <BranchNav branch={branch} active="plan" branchName={branchInfo?.branch_name} />
        <div className="p-4 space-y-2" style={{ maxWidth: 1600, margin: '0 auto' }}>
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-3">
            <a href={`/purchase-plan?branch=${branch || ''}`} className="px-3 py-1.5 rounded border bg-white font-bold text-gray-700">← Kế hoạch mua</a>
            <a href={`/material-stock?branch=${branch || ''}`} className="px-3 py-1.5 rounded border bg-white font-bold text-blue-800">📑 Xuất nhập tồn NVL</a>
            <span className="font-semibold ml-2">Chọn tháng:</span>
            <MonthPicker year={year} month={month} onChange={pick} />
            {data && <span className="text-gray-600">Có doanh số {data.salesDays} ngày · File định lượng: {data.bom.dishes} món{data.bom.updated ? `, cập nhật ${new Date(data.bom.updated).toLocaleDateString('vi-VN')}` : ''}</span>}
          </div>

          {error && <p className="bg-red-50 border border-red-300 text-red-700 rounded p-2">❌ {error}</p>}
          {loading ? <p className="p-4 text-gray-600">Đang tính…</p> : data && (
            <>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tổng giá trị NVL đã tiêu hao</div><div className="text-xl font-bold text-blue-800">{money(data.totals.amount)} đ</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Số NVL có tiêu hao</div><div className="text-xl font-bold">{rows.length}</div>{data.totals.noPrice > 0 && <div className="text-red-600">{data.totals.noPrice} NVL chưa có đơn giá</div>}</div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Món bán đã có định lượng</div>
                  <div className={`text-xl font-bold ${cov.pct !== null && cov.pct < 0.95 ? 'text-orange-600' : 'text-green-700'}`}>{cov.pct === null ? '—' : (cov.pct * 100).toFixed(1) + '%'}</div>
                  <div className="text-gray-500">{missing.length} món chưa có định lượng</div></div>
              </div>

              {missing.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-400 rounded p-2 text-yellow-900">
                  <div className="flex items-center gap-2">
                    <b>⚠ {missing.length} món bán trong tháng chưa có định lượng — tiêu hao NVL thực tế đang cao hơn số báo cáo.</b>
                    <span>Doanh thu của các món này: {money(cov.missRev)} đ.</span>
                    <button onClick={() => setShowMissing(!showMissing)} className="ml-auto px-2 py-0.5 rounded border bg-white font-bold">{showMissing ? 'Ẩn danh sách' : 'Xem danh sách'}</button>
                    <a href={`/sync-cukcuk?branch=${branch || ''}`} className="px-2 py-0.5 rounded bg-blue-600 text-white font-bold">Thêm định lượng / ghép món →</a>
                  </div>
                  {showMissing && (
                    <div style={{ maxHeight: 260, overflow: 'auto' }} className="mt-2 bg-white rounded border">
                      <table className="w-full">
                        <thead className="bg-yellow-100 sticky top-0"><tr><th className="px-2 py-1 text-left">Mã món</th><th className="px-2 py-1 text-left">Tên món</th><th className="px-2 py-1 text-left">Loại</th><th className="px-2 py-1 text-right">SL bán</th><th className="px-2 py-1 text-right">Doanh thu</th><th className="px-2 py-1 text-left">Lý do</th></tr></thead>
                        <tbody>{missing.map((d) => (
                          <tr key={d.code} className="border-t"><td className="px-2 py-1 font-mono">{d.code}</td><td className="px-2 py-1 font-medium">{d.name}</td><td className="px-2 py-1">{d.kind}</td><td className="px-2 py-1 text-right">{num(d.qty)}</td><td className="px-2 py-1 text-right">{money(d.revenue)}</td><td className="px-2 py-1 text-red-600">{d.reason}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {missing.length === 0 && rows.length > 0 && <p className="bg-green-50 border border-green-300 text-green-800 rounded p-2">✅ Tất cả món bán trong tháng đều đã có định lượng.</p>}

              {detail && (
                <div className="bg-white rounded border-2 border-blue-400 p-2">
                  <div className="flex items-center"><b>Món đã dùng "{detail.name}" trong tháng — tổng {num(detail.qty)} {detail.unit}</b><button onClick={() => setDetail(null)} className="ml-auto px-2 rounded border font-bold">✕ Đóng</button></div>
                  <div style={{ maxHeight: 240, overflow: 'auto' }}>
                    <table className="w-full mt-1"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Món</th><th className="px-2 py-1 text-right">SL bán</th><th className="px-2 py-1 text-right">Định lượng / món</th><th className="px-2 py-1 text-right">Tiêu hao ({detail.unit})</th><th className="px-2 py-1 text-right">Thành tiền</th></tr></thead>
                      <tbody>{detail.dishes.map((d) => (<tr key={d.dish_id} className="border-t"><td className="px-2 py-1">{d.dish_name}</td><td className="px-2 py-1 text-right">{num(d.sold)}</td><td className="px-2 py-1 text-right">{num(d.per_dish)}</td><td className="px-2 py-1 text-right">{num(d.qty)}</td><td className="px-2 py-1 text-right">{money(d.qty * detail.price)}</td></tr>))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {rows.length === 0 ? (
                <p className="bg-white rounded border p-6 text-gray-600">Tháng {month}/{year} chưa có doanh số khớp với định lượng. Chọn tháng khác hoặc kiểm tra mục Đồng bộ & ghép món.</p>
              ) : (
                <DataTable
                  columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.material_id}
                  filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort}
                  maxHeight="calc(100vh - 330px)"
                  footer={[
                    <td key="l" colSpan={7} className="px-2 py-1 text-right">Tổng cộng ({visible.length} NVL):</td>,
                    <td key="a" className="px-2 py-1 text-right">{money(total)}</td>,
                    <td key="n" colSpan={3}></td>
                  ]}
                />
              )}
              <p className="text-gray-500">Đơn giá mua: bình quân các phiếu mua trong tháng; nếu tháng đó chưa mua thì lấy lần mua gần nhất; chưa từng mua thì lấy đơn giá trong file định lượng. Khi tải file định lượng mới lên (mục Đồng bộ & ghép món), file cũ bị xóa và báo cáo này tự tính lại theo file mới.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
