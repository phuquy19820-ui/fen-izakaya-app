import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import SearchSelect from '../components/SearchSelect';
import DateRangeBar from '../components/DateRangeBar';

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const price = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
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
  const [threshold, setThreshold] = useState(30);
  const [stock, setStock] = useState('');

  const load = async (f, t, st) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const useStock = st === undefined ? stock : st;
      if (useStock) qs.set('stock', useStock);
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
    { key: 'opening', label: 'Tồn đầu kỳ', width: 90, type: 'number', align: 'right', render: (r) => num(r.opening) },
    { key: 'open_price', label: 'Đơn giá đầu kỳ', width: 96, type: 'number', align: 'right', render: (r) => (r.open_price ? price(r.open_price) : <span className="text-gray-300">—</span>) },
    { key: 'open_amount', label: 'Thành tiền đầu kỳ', width: 108, type: 'number', align: 'right', render: (r) => money(r.open_amount) },
    { key: 'qty_in', label: 'Đã mua (nhập)', width: 98, type: 'number', align: 'right', render: (r) => <b className="text-green-700">{num(r.qty_in)}</b> },
    { key: 'buy_price', label: 'Đơn giá mua', width: 92, type: 'number', align: 'right', render: (r) => (r.buy_price ? price(r.buy_price) : <span className="text-gray-300">—</span>) },
    { key: 'buy_amount', label: 'Thành tiền đã mua', width: 108, type: 'number', align: 'right', render: (r) => money(r.buy_amount) },
    { key: 'qty_out', label: 'Xuất', width: 78, type: 'number', align: 'right', render: (r) => num(r.qty_out) },
    { key: 'closing', label: 'Tồn cuối kỳ', width: 92, type: 'number', align: 'right', render: (r) => <b>{num(r.closing)}</b> },
    { key: 'close_price', label: 'Đơn giá cuối kỳ', width: 98, type: 'number', align: 'right', render: (r) => (r.close_price ? price(r.close_price) : <span className="text-gray-300">—</span>) },
    { key: 'amount', label: 'Thành tiền cuối kỳ', width: 112, type: 'number', align: 'right', render: (r) => money(r.amount) },
    {
      key: 'warn', label: 'Cảnh báo lệch giá', width: 170, type: 'number', align: 'left', noTitle: true,
      get: (r) => Math.max(Math.abs(r.dev_buy || 0), Math.abs(r.dev_close || 0), Math.abs(r.dev_hist || 0)),
      render: (r) => {
        const msgs = [];
        if (r.dev_buy !== null && r.dev_buy !== undefined && Math.abs(r.dev_buy) > threshold) msgs.push(`giá mua ${r.dev_buy > 0 ? 'cao' : 'thấp'} hơn đầu kỳ ${r.dev_buy > 0 ? '+' : ''}${r.dev_buy.toFixed(0)}%`);
        if (r.dev_close !== null && r.dev_close !== undefined && Math.abs(r.dev_close) > threshold) msgs.push(`giá cuối kỳ ${r.dev_close > 0 ? 'tăng' : 'giảm'} ${r.dev_close > 0 ? '+' : ''}${r.dev_close.toFixed(0)}% so với đầu kỳ`);
        if (r.dev_hist !== null && r.dev_hist !== undefined && Math.abs(r.dev_hist) > threshold) msgs.push(`giá mua ${r.dev_hist > 0 ? 'cao' : 'thấp'} hơn giá các lần mua trước ${r.dev_hist > 0 ? '+' : ''}${r.dev_hist.toFixed(0)}%`);
        return msgs.length ? <span className="text-red-600 font-bold" title={msgs.join('; ')}>⚠ {msgs.join('; ')}</span> : <span className="text-gray-300">—</span>;
      }
    },
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
    [items, filters, sort, saving, matOptions, threshold]
  );
  const matched = items.filter((r) => r.material_id).length;
  const totalValue = visible.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalOpen = visible.reduce((s, r) => s + Number(r.open_amount || 0), 0);
  const totalBuy = visible.reduce((s, r) => s + Number(r.buy_amount || 0), 0);
  const warnCount = visible.filter((r) => Math.max(Math.abs(r.dev_buy || 0), Math.abs(r.dev_close || 0), Math.abs(r.dev_hist || 0)) > threshold).length;
  const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '');

  return (
    <>
      <Head>
        <title>Tồn Kho</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 66 }}>
          <h1 className="text-base font-bold">TỒN KHO: TỒN ĐẦU KỲ, ĐÃ MUA, XUẤT, TỒN CUỐI</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · lấy từ báo cáo Tổng hợp nhập - xuất - tồn kho của CUKCUK</p>
        </header>
        <BranchNav branch={branch} active="stock" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1600, margin: '0 auto' }}>
          {data && data.stocks && data.stocks.length > 0 && (
            <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold">Kho:</span>
              <button onClick={() => { setStock(''); load(from, to, ''); }} className={`px-3 py-1.5 rounded font-bold border ${stock === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>📦 Tất cả kho</button>
              {data.stocks.map((st) => (
                <button key={st.id} onClick={() => { setStock(st.id); load(from, to, st.id); }} className={`px-3 py-1.5 rounded font-bold border ${stock === st.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{st.name}</button>
              ))}
            </div>
          )}
          {data && data.dates.length > 0 && data.stocks && data.stocks.length === 0 && (
            <p className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-2">Dữ liệu tồn kho hiện chưa chia theo kho. Cài tiện ích bản <b>1.9.0</b> rồi đồng bộ lại để xem từng kho như trên CUKCUK.</p>
          )}
          {data && data.dates.length > 0 && (
            <DateRangeBar from={from} to={to} onChange={(f, tt) => { setFrom(f); setTo(tt); }} onApply={(f, tt) => load(f, tt, stock)} minDate={data.dates[0]} maxDate={data.dates[data.dates.length - 1]}>
              <span className="text-gray-600">Tồn đầu kỳ = đầu ngày {fmtDate(data.from)}; Đã mua/Xuất = cộng dồn trong kỳ; Tồn cuối = cuối ngày {fmtDate(data.to)}. Đơn giá mua lấy từ phiếu mua (chưa VAT), đơn giá tồn = giá trị ÷ số lượng. Có dữ liệu từ {fmtDate(data.dates[0])} đến {fmtDate(data.dates[data.dates.length - 1])}.</span>
              <label className="font-semibold">Cảnh báo khi giá lệch quá <input type="number" min="1" value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 30))} className="border rounded px-1 text-right" style={{ width: 52 }} /> %</label>
              <span className="text-red-600 font-bold">⚠ {warnCount} NVL lệch giá</span>
              <span className="ml-auto text-gray-700 font-bold">Đã ghép với NVL trong app: {matched}/{items.length}</span>
            </DateRangeBar>
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
                <td key="l" colSpan={6} className="px-2 py-1 text-right">Tổng ({visible.length} NVL):</td>,
                <td key="o" className="px-2 py-1 text-right">{money(totalOpen)}</td>,
                <td key="m1" colSpan={2}></td>,
                <td key="b" className="px-2 py-1 text-right">{money(totalBuy)}</td>,
                <td key="m2" colSpan={3}></td>,
                <td key="a" className="px-2 py-1 text-right">{money(totalValue)}</td>,
                <td key="n" colSpan={2}></td>
              ]}
            />
          )}
        </div>
      </div>
    </>
  );
}
