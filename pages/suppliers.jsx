import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');

export default function Suppliers() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [map, setMap] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('suppliers');
  const [fS, setFS] = useState({});
  const [sS, setSS] = useState({ key: 'last', dir: 'desc' });
  const [fM, setFM] = useState({});
  const [sM, setSM] = useState(null);

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    Promise.all([
      fetch(`/api/suppliers/${branch}`).then((r) => r.json()),
      fetch(`/api/suppliers/items/${branch}`).then((r) => r.json())
    ]).then(([s, m]) => {
      if (s.success) setSuppliers(s.data);
      if (m.success) setMap(m.data);
    }).finally(() => setLoading(false));
  }, [branch]);

  const supCols = [
    { key: 'name', label: 'Nhà cung cấp', width: 330, type: 'text', render: (r) => <span className={r.inactive ? 'text-gray-400 line-through' : 'font-medium'}>{r.name}</span> },
    { key: 'category', label: 'Nhóm', width: 170, type: 'select', get: (r) => r.category || '(chưa phân nhóm)' },
    { key: 'phone', label: 'Điện thoại', width: 120, type: 'text', get: (r) => r.phone || '' },
    { key: 'address', label: 'Địa chỉ', minWidth: 300, type: 'text', get: (r) => r.address || '' },
    { key: 'items', label: 'Số NVL đã mua', width: 100, type: 'number', align: 'right', get: (r) => Number(r.item_count) || 0 },
    { key: 'times', label: 'Số lần mua', width: 84, type: 'number', align: 'right', get: (r) => Number(r.purchase_count) || 0 },
    { key: 'last', label: 'Mua gần nhất', width: 104, type: 'text', get: (r) => (r.last_date ? String(r.last_date).slice(0, 10) : ''), render: (r) => fmtDate(r.last_date) },
    { key: 'total', label: 'Tổng tiền đã mua', width: 120, type: 'number', align: 'right', get: (r) => Number(r.total_amount) || 0, render: (r) => money(r.total_amount) }
  ];
  const supVisible = useMemo(() => sortRows(filterRows(suppliers, supCols, fS), supCols, sS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers, fS, sS]);

  // map: mọi mặt hàng đã mua theo NCC; NCC nào giá/ngày gần nhất của cùng mặt hàng được đánh dấu ★
  const matRows = useMemo(() => {
    const latest = new Map();
    map.forEach((r) => { const cur = latest.get(r.item_code); if (!cur || r.last_date > cur) latest.set(r.item_code, r.last_date); });
    return map.map((r) => ({
      key: r.item_code + '|' + r.supplier_code, item_name: r.item_name, item_code: r.item_code, supplier_name: r.supplier_name, unit: r.unit_name,
      price: Number(r.unit_price) || 0, times: Number(r.times) || 0, amount: Number(r.amount) || 0, last_date: r.last_date,
      app_name: r.material_name || '', mapped: r.material_name ? 'Đã ghép' : 'Chưa ghép', preferred: latest.get(r.item_code) === r.last_date
    }));
  }, [map]);
  const matCols = [
    { key: 'item_name', label: 'Nguyên vật liệu (tên trên CUKCUK)', width: 320, type: 'text', render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'app_name', label: 'NVL trong app', width: 190, type: 'text', get: (r) => r.app_name || '(chưa ghép)', render: (r) => (r.app_name ? <span className="text-green-700">✔ {r.app_name}</span> : <span className="text-orange-600">⚠ chưa ghép</span>) },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 310, type: 'select', render: (r) => <span>{r.supplier_name}{r.preferred && <span className="ml-1 text-green-700">★ gần nhất</span>}</span> },
    { key: 'unit', label: 'ĐVT', width: 60, type: 'select', align: 'center' },
    { key: 'price', label: 'Giá mua gần nhất / ĐVT', width: 140, type: 'number', align: 'right', render: (r) => money(r.price) },
    { key: 'times', label: 'Số lần mua', width: 84, type: 'number', align: 'right' },
    { key: 'amount', label: 'Tổng tiền đã mua', width: 116, type: 'number', align: 'right', render: (r) => money(r.amount) },
    { key: 'last_date', label: 'Mua gần nhất', minWidth: 104, type: 'text', get: (r) => String(r.last_date).slice(0, 10), render: (r) => fmtDate(r.last_date) }
  ];
  const matVisible = useMemo(() => sortRows(filterRows(matRows, matCols, fM), matCols, sM),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matRows, fM, sM]);

  return (
    <>
      <Head>
        <title>Nhà Cung Cấp</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">NHÀ CUNG CẤP VÀ LỊCH SỬ MUA THEO NVL</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · lấy từ danh mục Nhà cung cấp và báo cáo Mua hàng chi tiết theo NCC và NVL của CUKCUK</p>
        </header>
        <BranchNav branch={branch} active="suppliers" branchName={branchInfo?.branch_name} />
        <div className="p-4 space-y-2" style={{ maxWidth: 1600, margin: '0 auto' }}>
          <div className="flex gap-2">
            <button onClick={() => setTab('suppliers')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'suppliers' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🚚 Theo nhà cung cấp ({suppliers.length})</button>
            <button onClick={() => setTab('materials')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'materials' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🥩 Theo nguyên vật liệu ({matRows.length}, {new Set(matRows.map((r) => r.item_code)).size} mặt hàng)</button>
          </div>
          {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : suppliers.length === 0 ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu nhà cung cấp. Vào mục <b>Đồng bộ & ghép món</b>, bấm "Đồng bộ doanh số từ CUKCUK" (tiện ích bản 1.2.0 trở lên sẽ lấy luôn nhà cung cấp và lịch sử mua).</p>
          ) : tab === 'suppliers' ? (
            <DataTable columns={supCols} allRows={suppliers} rows={supVisible} rowKey={(r) => r.code} filters={fS} onFiltersChange={setFS} sort={sS} onSortChange={setSS} maxHeight="calc(100vh - 230px)" />
          ) : (
            <DataTable columns={matCols} allRows={matRows} rows={matVisible} rowKey={(r) => r.key} filters={fM} onFiltersChange={setFM} sort={sM} onSortChange={setSM} maxHeight="calc(100vh - 230px)"
              emptyText="Chưa có lịch sử mua hàng. Hãy đồng bộ từ CUKCUK." />
          )}
        </div>
      </div>
    </>
  );
}
