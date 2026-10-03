import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

export default function PurchaseOrders() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: 'created', dir: 'desc' });
  const [busy, setBusy] = useState(0);

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    fetch(`/api/purchase-orders/${branch}`).then((r) => r.json()).then((d) => d.success && setOrders(d.data)).finally(() => setLoading(false));
  }, [branch]);

  const download = async (o) => {
    try {
      setBusy(o.id);
      const one = await (await fetch(`/api/purchase-orders/${branch}/${o.id}`)).json();
      if (!one.success) throw new Error(one.message);
      const p = one.data.payload || {};
      const res = await fetch('/api/purchase-plans/export-xlsx', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...p, orderNo: one.data.order_no, supplier: p.supplierName, branchName: branchInfo ? branchInfo.branch_name : '' })
      });
      if (!res.ok) throw new Error('Xuất file thất bại');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-mua-hang-${o.order_no.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert('❌ ' + e.message);
    } finally {
      setBusy(0);
    }
  };

  const columns = [
    { key: 'order_no', label: 'Số đơn', width: 110, type: 'text', render: (r) => <b className="text-blue-700">{r.order_no}</b> },
    { key: 'created', label: 'Ngày lập', width: 150, type: 'text', get: (r) => String(r.created_at).slice(0, 10), render: (r) => new Date(r.created_at).toLocaleString('vi-VN') },
    { key: 'buyer_company', label: 'Công ty mua', width: 260, type: 'text' },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 280, type: 'text', get: (r) => r.supplier_name || '' },
    { key: 'cycle_label', label: 'Nội dung', minWidth: 240, type: 'text', get: (r) => r.cycle_label || '' },
    { key: 'line_count', label: 'Số dòng', width: 80, type: 'number', align: 'right', get: (r) => Number(r.line_count) },
    { key: 'total_amount', label: 'Tổng tiền (đ)', width: 120, type: 'number', align: 'right', get: (r) => Number(r.total_amount), render: (r) => money(r.total_amount) },
    { key: 'dl', label: '', width: 110, filterable: false, get: () => '', noTitle: true, render: (r) => <button disabled={busy === r.id} onClick={() => download(r)} className="bg-green-600 hover:bg-green-700 text-white px-2 rounded font-bold disabled:opacity-50" style={{ height: 22 }}>⬇ Excel</button> }
  ];
  const visible = useMemo(() => sortRows(filterRows(orders, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, filters, sort, busy]);

  return (
    <>
      <Head>
        <title>Đơn Mua Đã Xuất</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">ĐƠN MUA HÀNG ĐÃ XUẤT</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · số đơn dạng 001/Tháng/Năm, về 001 khi sang tháng mới</p>
        </header>
        <BranchNav branch={branch} active="orders" branchName={branchInfo?.branch_name} />
        <div className="p-4" style={{ maxWidth: 1600, margin: '0 auto' }}>
          {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : orders.length === 0 ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có đơn nào. Vào Kế hoạch mua, bấm "Xuất đơn mua hàng" để tạo đơn đầu tiên.</p>
          ) : (
            <DataTable columns={columns} allRows={orders} rows={visible} rowKey={(r) => r.id} filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort} maxHeight="calc(100vh - 200px)" />
          )}
        </div>
      </div>
    </>
  );
}
