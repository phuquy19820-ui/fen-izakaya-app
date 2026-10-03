import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import SearchSelect from '../components/SearchSelect';

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

export default function StockReport() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [saving, setSaving] = useState('');

  const load = async (f, t) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const json = await (await fetch(`/api/stock/report/${branch}?${qs.toString()}`)).json();
      if (json.success) {
        setData(json.data);
        if (!f && json.data.dates && json.data.dates.length) { setFrom(json.data.from); setTo(json.data.to); }
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

  const saveMap = async (code, materialId) => {
    setSaving(code);
    try {
      const res = await fetch('/api/stock/map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, cukcukCode: code, materialId: materialId || null }) });
      const json = await res.json();
      if (!json.success) alert('❌ ' + json.message);
      await load(from, to);
    } finally {
      setSaving('');
    }
  };

  const items = data ? data.items : [];
  const matOptions = useMemo(() => (data ? data.materials.map((m) => ({ value: m.material_id, label: m.material_name })) : []), [data]);

  const columns = [
    { key: 'code', label: 'Mã CUKCUK', width: 106, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.code}</span> },
    { key: 'name', label: 'Tên NVL trên CUKCUK', width: 280, type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'category', label: 'Nhóm', width: 130, type: 'select' },
    { key: 'unit', label: 'ĐVT', width: 60, type: 'select', align: 'center' },
    { key: 'opening', label: 'Tồn đầu kỳ', width: 96, type: 'number', align: 'right', render: (r) => num(r.opening) },
    { key: 'qty_in', label: 'Đã mua (nhập)', width: 104, type: 'number', align: 'right', render: (r) => <b className="text-green-700">{num(r.qty_in)}</b> },
    { key: 'qty_out', label: 'Xuất', width: 84, type: 'number', align: 'right', render: (r) => num(r.qty_out) },
    { key: 'closing', label: 'Tồn cuối kỳ', width: 100, type: 'number', align: 'right', render: (r) => <b>{num(r.closing)}</b> },
    { key: 'amount', label: 'Giá trị tồn (đ)', width: 110, type: 'number', align: 'right', render: (r) => money(r.amount) },
    {
      key: 'match', label: 'NVL trong app (để tính kế hoạch)', minWidth: 280, type: 'text', get: (r) => r.material_name || '(chưa ghép)', noTitle: true,
      render: (r) => (
        <div className="flex items-center gap-1">
          {!r.material_id && r.suggestion && (
            <button disabled={saving === r.code} onClick={() => saveMap(r.code, r.suggestion.material_id)} className="shrink-0 bg-green-600 hover:bg-green-700 text-white px-2 rounded font-bold disabled:opacity-50" style={{ height: 22 }} title={`Độ giống ${Math.round(r.suggestion.score * 100)}%`}>
              ✔ {r.suggestion.material_name.slice(0, 22)}
            </button>
          )}
          <SearchSelect className="flex-1" options={matOptions} value={r.material_id || ''} onChange={(v) => saveMap(r.code, v)} placeholder={r.material_id ? r.material_name : '🔍 Chọn NVL…'} />
        </div>
      )
    }
  ];

  const visible = useMemo(
    () => sortRows(filterRows(items, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filters, sort, saving, matOptions]
  );
  const matched = items.filter((r) => r.material_id).length;
  const totalValue = visible.reduce((s, r) => s + Number(r.amount || 0), 0);
  const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '');

  return (
    <>
      <Head>
        <title>Tồn Kho</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">TỒN KHO: TỒN ĐẦU KỲ, ĐÃ MUA, XUẤT, TỒN CUỐI</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · lấy từ báo cáo Tổng hợp nhập - xuất - tồn kho của CUKCUK</p>
        </header>
        <BranchNav branch={branch} active="stock" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1600, margin: '0 auto' }}>
          {data && data.dates.length > 0 && (
            <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
              <div>
                <label className="block font-semibold mb-0.5">Từ ngày</label>
                <input type="date" value={from} min={data.dates[0]} max={data.dates[data.dates.length - 1]} onChange={(e) => setFrom(e.target.value)} className="border px-2 py-1 rounded" />
              </div>
              <div>
                <label className="block font-semibold mb-0.5">Đến ngày</label>
                <input type="date" value={to} min={data.dates[0]} max={data.dates[data.dates.length - 1]} onChange={(e) => setTo(e.target.value)} className="border px-2 py-1 rounded" />
              </div>
              <button onClick={() => load(from, to)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">Xem</button>
              <span className="text-gray-600">Tồn đầu kỳ = tồn đầu ngày {fmtDate(data.from)}; Đã mua/Xuất = cộng dồn trong kỳ; Tồn cuối = cuối ngày {fmtDate(data.to)}. Có dữ liệu từ {fmtDate(data.dates[0])} đến {fmtDate(data.dates[data.dates.length - 1])}.</span>
              <span className="ml-auto text-gray-700 font-bold">Đã ghép với NVL trong app: {matched}/{items.length}</span>
            </div>
          )}
          {loading ? (
            <p className="p-4 text-gray-600">Đang tải…</p>
          ) : !data || data.dates.length === 0 ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu tồn kho. Vào mục <b>Đồng bộ & ghép món</b>, bấm "Đồng bộ doanh số từ CUKCUK" (tiện ích bản 1.2.0 trở lên sẽ lấy luôn tồn kho theo ngày).</p>
          ) : (
            <DataTable
              columns={columns} allRows={items} rows={visible} rowKey={(r) => r.code}
              filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort}
              maxHeight="calc(100vh - 260px)"
              footer={[
                <td key="l" colSpan={8} className="px-2 py-1 text-right">Tổng giá trị tồn ({visible.length} NVL):</td>,
                <td key="a" className="px-2 py-1 text-right">{money(totalValue)}</td>,
                <td key="n"></td>
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}
