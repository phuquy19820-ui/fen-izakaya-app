import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const MODE_LABELS = { UNIT: 'Bán nguyên chai/lon', VOLUME: 'Bán theo ly (ml/lần bán)', MIXED: 'Pha chế (ml nguyên liệu/ly)', IGNORE: 'Không tính' };
const inputCls = 'w-full border rounded text-xs bg-white';
const inputStyle = { height: 22, padding: '0 4px' };

export default function BeverageConfig() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [items, setItems] = useState([]);
  const [buyItems, setBuyItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [fItems, setFItems] = useState({});
  const [sItems, setSItems] = useState(null);
  const [fBuy, setFBuy] = useState({});
  const [sBuy, setSBuy] = useState(null);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/beverage/config/${branch}`);
      const json = await res.json();
      if (json.success) { setItems(json.data.items); setBuyItems(json.data.buyItems); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    load();
  }, [branch]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  const saveItem = async (code, patch) => {
    setItems((rows) => rows.map((r) => (r.item_code === code ? { ...r, ...patch } : r)));
    const body = { branchId: branch, itemCode: code };
    if (patch.mode !== undefined) body.mode = patch.mode;
    if (patch.ml_per_sale !== undefined) body.mlPerSale = patch.ml_per_sale;
    if (patch.buy_name !== undefined) body.buyName = patch.buy_name;
    const res = await fetch('/api/beverage/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.success) { flash('❌ ' + json.message); load(); return; }
    flash('✅ Đã lưu');
    if (patch.buy_name !== undefined) load();
  };

  const saveBuy = async (name, patch) => {
    setBuyItems((rows) => rows.map((r) => (r.buy_name === name ? { ...r, ...patch } : r)));
    const it = { buyName: name };
    if (patch.category !== undefined) it.category = patch.category;
    if (patch.buy_unit !== undefined) it.buyUnit = patch.buy_unit;
    if (patch.size_ml !== undefined) it.sizeMl = patch.size_ml;
    if (patch.unit_cost !== undefined) it.unitCost = patch.unit_cost;
    if (patch.stock_qty !== undefined) it.stockQty = patch.stock_qty;
    const res = await fetch('/api/beverage/buy-items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, items: [it] }) });
    const json = await res.json();
    flash(json.success ? '✅ Đã lưu' : '❌ ' + json.message);
  };

  const numInput = (value, onCommit, w) => (
    <input
      type="number" step="any" min="0" defaultValue={value} key={String(value)}
      onBlur={(e) => { const v = parseFloat(e.target.value) || 0; if (v !== Number(value)) onCommit(v); }}
      className={`${inputCls} text-right`} style={{ ...inputStyle, width: w }}
    />
  );
  const textInput = (value, onCommit, list) => (
    <input
      defaultValue={value || ''} key={String(value)} list={list}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (value || '')) onCommit(v); }}
      className={inputCls} style={inputStyle}
    />
  );

  const itemCols = [
    { key: 'item_code', label: 'Mã', width: 96, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.item_code}</span> },
    { key: 'item_name', label: 'Món đồ uống', type: 'text', width: 280, render: (r) => <span className="font-medium">{r.item_name}</span> },
    { key: 'menu_type', label: 'Loại trong thực đơn', width: 140, type: 'select', get: (r) => r.menu_type || '(không có trong thực đơn)' },
    { key: 'sold_qty', label: 'Đã bán', width: 64, type: 'number', align: 'right', get: (r) => Number(r.sold_qty) || 0 },
    {
      key: 'mode', label: 'Cách tính', width: 190, type: 'select', get: (r) => MODE_LABELS[r.mode] || r.mode, noTitle: true,
      render: (r) => (
        <select value={r.mode} onChange={(e) => saveItem(r.item_code, { mode: e.target.value })} className={inputCls} style={{ height: 22 }}>
          {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )
    },
    { key: 'ml_per_sale', label: 'ml mỗi lần bán', width: 100, type: 'number', align: 'right', get: (r) => Number(r.ml_per_sale) || 0, noTitle: true, render: (r) => (r.mode === 'VOLUME' || r.mode === 'MIXED' ? numInput(r.ml_per_sale, (v) => saveItem(r.item_code, { ml_per_sale: v }), 84) : <span className="text-gray-400">—</span>) },
    { key: 'buy_name', label: 'Mua từ mặt hàng', type: 'text', get: (r) => r.buy_name || '', noTitle: true, render: (r) => (r.mode === 'IGNORE' ? <span className="text-gray-400">—</span> : textInput(r.buy_name, (v) => saveItem(r.item_code, { buy_name: v }), 'buy-names')) }
  ];
  const itemRows = useMemo(
    () => sortRows(filterRows(items, itemCols, fItems), itemCols, sItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fItems, sItems]
  );

  const buyCols = [
    { key: 'buy_name', label: 'Mặt hàng mua', type: 'text', width: 320, render: (r) => <span className="font-medium">{r.buy_name}</span> },
    { key: 'category', label: 'Nhóm', width: 170, type: 'text', get: (r) => r.category || '', noTitle: true, render: (r) => textInput(r.category, (v) => saveBuy(r.buy_name, { category: v })) },
    { key: 'buy_unit', label: 'ĐVT mua', width: 90, type: 'text', get: (r) => r.buy_unit || '', noTitle: true, render: (r) => textInput(r.buy_unit, (v) => saveBuy(r.buy_name, { buy_unit: v })) },
    { key: 'size_ml', label: 'Quy cách (ml / 1 ĐVT)', width: 140, type: 'number', align: 'right', get: (r) => Number(r.size_ml) || 0, noTitle: true, render: (r) => numInput(r.size_ml, (v) => saveBuy(r.buy_name, { size_ml: v }), 110) },
    { key: 'unit_cost', label: 'Đơn giá mua (đ)', width: 130, type: 'number', align: 'right', get: (r) => Number(r.unit_cost) || 0, noTitle: true, render: (r) => numInput(r.unit_cost, (v) => saveBuy(r.buy_name, { unit_cost: v }), 104) },
    { key: 'stock_qty', label: 'Tồn hiện có', width: 110, type: 'number', align: 'right', get: (r) => Number(r.stock_qty) || 0, noTitle: true, render: (r) => numInput(r.stock_qty, (v) => saveBuy(r.buy_name, { stock_qty: v }), 84) }
  ];
  const buyRows = useMemo(
    () => sortRows(filterRows(buyItems, buyCols, fBuy), buyCols, sBuy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buyItems, fBuy, sBuy]
  );

  return (
    <>
      <Head>
        <title>Cấu Hình Đồ Uống</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">CẤU HÌNH TÍNH MUA ĐỒ UỐNG</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'}</p>
        </header>
        <BranchNav branch={branch} active="plan" branchName={branchInfo?.branch_name} />
        <datalist id="buy-names">{buyItems.map((b) => <option key={b.buy_name} value={b.buy_name} />)}</datalist>

        <div className="p-4 space-y-4" style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div className="bg-white border rounded p-3 text-gray-700 space-y-1">
            <p><b>Cách tính dự kiến mua đồ uống theo số lượng bán (không cần định lượng):</b></p>
            <p>• <b>Bán nguyên chai/lon</b>: mua đúng số lượng đã bán.</p>
            <p>• <b>Bán theo ly</b>: mỗi lần bán dùng bao nhiêu ml từ mặt hàng mua (vd. Sapporo 500 ml/ly, ly vang 100 ml, tháp 3000 ml).</p>
            <p>• <b>Pha chế</b>: mặc định 10 ml nguyên liệu cho 1 ly. Chọn "Mua từ mặt hàng" là chai cụ thể (vd. Whisky) nếu muốn tính riêng.</p>
            <p>Số lượng mua = ml tiêu hao ÷ quy cách của mặt hàng mua. Mọi thông số bên dưới sửa trực tiếp, tự lưu khi bạn rời khỏi ô.</p>
            {msg && <p className="font-bold text-green-700">{msg}</p>}
          </div>

          {loading ? <p className="p-4 text-gray-600">Đang tải…</p> : (
            <>
              <div>
                <h2 className="font-bold text-sm mb-1">1. Cách tính cho từng món đồ uống ({items.length} món)</h2>
                <DataTable columns={itemCols} allRows={items} rows={itemRows} rowKey={(r) => r.item_code} filters={fItems} onFiltersChange={setFItems} sort={sItems} onSortChange={setSItems} maxHeight="50vh" />
              </div>
              <div>
                <h2 className="font-bold text-sm mb-1">2. Mặt hàng mua ({buyItems.length} mặt hàng) — quy cách, đơn giá, tồn</h2>
                <DataTable columns={buyCols} allRows={buyItems} rows={buyRows} rowKey={(r) => r.buy_name} filters={fBuy} onFiltersChange={setFBuy} sort={sBuy} onSortChange={setSBuy} maxHeight="50vh" />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
