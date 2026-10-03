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
  const [map, setMap] = useState({});
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
      fetch(`/api/suppliers/material-map/${branch}`).then((r) => r.json()),
      fetch('/api/material-list').then((r) => r.json())
    ]).then(([s, m, ml]) => {
      if (s.success) setSuppliers(s.data);
      if (m.success) setMap(m.data);
      if (ml.success) setMaterials(ml.data);
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

  const matRows = useMemo(() => {
    const names = Object.fromEntries(materials.map((m) => [m.material_id, m]));
    const rows = [];
    Object.entries(map).forEach(([id, list]) => {
      list.forEach((s, i) => rows.push({
        key: id + '|' + s.supplier_code, material_id: id, material_name: names[id] ? names[id].material_name : id,
        unit: names[id] ? names[id].unit_purchase : '', supplier_name: s.supplier_name, price: s.price, times: s.times, last_date: s.last_date, preferred: i === 0
      }));
    });
    return rows;
  }, [map, materials]);
  const matCols = [
    { key: 'material_name', label: 'Nguyên vật liệu', width: 320, type: 'text', render: (r) => <span className="font-medium">{r.material_name}</span> },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 330, type: 'select', render: (r) => <span>{r.supplier_name}{r.preferred && <span className="ml-1 text-green-700">★ gần nhất</span>}</span> },
    { key: 'unit', label: 'ĐVT', width: 60, type: 'select', align: 'center' },
    { key: 'price', label: 'Giá mua gần nhất / ĐVT', width: 150, type: 'number', align: 'right', render: (r) => money(r.price) },
    { key: 'times', label: 'Số lần mua', width: 90, type: 'number', align: 'right' },
    { key: 'last_date', label: 'Mua gần nhất', minWidth: 110, type: 'text', get: (r) => String(r.last_date).slice(0, 10), render: (r) => fmtDate(r.last_date) }
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
            <button onClick={() => setTab('materials')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'materials' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🥩 Theo nguyên vật liệu ({matRows.length})</button>
          </div>
          {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : suppliers.length === 0 ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu nhà cung cấp. Vào mục <b>Đồng bộ & ghép món</b>, bấm "Đồng bộ doanh số từ CUKCUK" (tiện ích bản 1.2.0 trở lên sẽ lấy luôn nhà cung cấp và lịch sử mua).</p>
          ) : tab === 'suppliers' ? (
            <DataTable columns={supCols} allRows={suppliers} rows={supVisible} rowKey={(r) => r.code} filters={fS} onFiltersChange={setFS} sort={sS} onSortChange={setSS} maxHeight="calc(100vh - 230px)" />
          ) : (
            <DataTable columns={matCols} allRows={matRows} rows={matVisible} rowKey={(r) => r.key} filters={fM} onFiltersChange={setFM} sort={sM} onSortChange={setSM} maxHeight="calc(100vh - 230px)"
              emptyText="Chưa có NVL nào được ghép với lịch sử mua. Kiểm tra mục Tồn kho để ghép NVL CUKCUK với NVL trong app." />
          )}
        </div>
      </div>
    </>
  );
}
