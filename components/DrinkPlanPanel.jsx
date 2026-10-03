import React, { useState, useEffect, useMemo } from 'react';
import DataTable, { filterRows, sortRows } from './DataTable';
import PurchaseOrderModal from './PurchaseOrderModal';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const fix2 = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const inp = { height: 22, padding: '0 4px' };

// Tab "Đồ uống": dự kiến mua theo số lượng bán, không cần định lượng.
export default function DrinkPlanPanel({ branch, branchInfo, onCompanySaved, suppliers = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [stockEdits, setStockEdits] = useState({});
  const [priceEdits, setPriceEdits] = useState({});
  const [qtyEdits, setQtyEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const load = async () => {
    if (!branch) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/beverage/plan/${branch}?days=7`);
      const json = await res.json();
      if (json.success) setData(json.data); else setError(json.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branch]);

  const rows = data ? data.rows : [];
  const stockOf = (r) => (stockEdits[r.buy_name] !== undefined ? stockEdits[r.buy_name] : r.stock_qty);
  const priceOf = (r) => (priceEdits[r.buy_name] !== undefined ? priceEdits[r.buy_name] : r.unit_cost);
  const qtyOf = (r) => (qtyEdits[r.buy_name] !== undefined ? qtyEdits[r.buy_name] : r.suggested_qty);

  const columns = [
    { key: 'name', label: 'Mặt hàng mua', width: 300, type: 'text', get: (r) => r.buy_name, render: (r) => <span className="font-medium">{r.buy_name}</span> },
    { key: 'category', label: 'Nhóm', width: 150, type: 'select', get: (r) => r.category },
    { key: 'unit', label: 'ĐVT', width: 60, type: 'select', get: (r) => r.buy_unit, align: 'center' },
    { key: 'size', label: 'Quy cách (ml)', width: 90, type: 'number', align: 'right', get: (r) => r.size_ml, render: (r) => (r.size_ml ? fix2(r.size_ml) : '—') },
    { key: 'sold', label: 'Đã bán', width: 72, type: 'number', align: 'right', get: (r) => r.sold_qty, render: (r) => fix2(r.sold_qty) },
    { key: 'consumed', label: 'Tiêu hao (ĐVT)', width: 100, type: 'number', align: 'right', get: (r) => r.consumed_units, render: (r) => fix2(r.consumed_units) },
    { key: 'avg', label: 'BQ/ngày', width: 76, type: 'number', align: 'right', get: (r) => r.avg_daily, render: (r) => fix2(r.avg_daily) },
    {
      key: 'stock', label: 'Tồn (sửa được)', width: 100, type: 'number', align: 'right', get: stockOf, noTitle: true,
      render: (r) => (
        <input type="number" step="any" min="0" value={stockOf(r)} onChange={(e) => setStockEdits((s) => ({ ...s, [r.buy_name]: parseFloat(e.target.value) || 0 }))}
          className={`w-full text-right border rounded text-xs ${stockEdits[r.buy_name] !== undefined ? 'bg-yellow-100 font-bold' : 'bg-white'}`} style={inp} />
      )
    },
    { key: 'suggested', label: 'Đề xuất', width: 76, type: 'number', align: 'right', get: (r) => r.suggested_qty, render: (r) => <span className="font-bold text-yellow-800">{fix2(r.suggested_qty)}</span> },
    {
      key: 'qty', label: 'Thực mua', width: 90, type: 'number', align: 'right', get: qtyOf, noTitle: true,
      render: (r) => (
        <input type="number" step="any" min="0" value={qtyOf(r)} onChange={(e) => setQtyEdits((q) => ({ ...q, [r.buy_name]: parseFloat(e.target.value) || 0 }))}
          className="w-full text-right font-bold border rounded text-xs bg-green-50" style={inp} />
      )
    },
    {
      key: 'price', label: 'Đơn giá (sửa được)', width: 112, type: 'number', align: 'right', get: priceOf, noTitle: true,
      render: (r) => (
        <input type="number" step="any" min="0" value={priceOf(r)} onChange={(e) => setPriceEdits((p) => ({ ...p, [r.buy_name]: parseFloat(e.target.value) || 0 }))}
          className={`w-full text-right border rounded text-xs ${priceEdits[r.buy_name] !== undefined ? 'bg-yellow-100 font-bold' : 'bg-white'}`} style={inp} />
      )
    },
    { key: 'amount', label: 'Thành tiền', width: 106, type: 'number', align: 'right', get: (r) => qtyOf(r) * priceOf(r), render: (r) => <b>{money(qtyOf(r) * priceOf(r))}</b> },
    { key: 'note', label: 'Ghi chú', minWidth: 200, type: 'text', get: (r) => r.note || '', render: (r) => <span className="text-gray-600">{r.note}</span> }
  ];

  const visible = useMemo(
    () => sortRows(filterRows(rows, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, sort, stockEdits, priceEdits, qtyEdits]
  );
  const total = visible.reduce((s, r) => s + qtyOf(r) * priceOf(r), 0);

  const groupStats = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const g = r.category || 'Khác';
      const cur = map.get(g) || { name: g, count: 0, need: 0 };
      cur.count++;
      if (r.suggested_qty > 0) cur.need++;
      map.set(g, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.need - a.need || b.count - a.count);
  }, [rows]);

  const selectedGroup = (filters.category && filters.category.value) || '';
  const onlyNeed = filters.suggested && filters.suggested.op === '>' && filters.suggested.val === '0';
  const dirty = Object.keys(stockEdits).length + Object.keys(priceEdits).length;
  const hasFilter = Object.values(filters).some((f) => f && (f.text || f.value || (f.val !== undefined && f.val !== ''))) || !!sort;

  const save = async () => {
    const names = new Set([...Object.keys(stockEdits), ...Object.keys(priceEdits)]);
    if (names.size === 0) { alert('Chưa có thay đổi tồn/đơn giá để lưu.'); return; }
    try {
      setSaving(true);
      const items = Array.from(names).map((n) => ({
        buyName: n,
        ...(stockEdits[n] !== undefined ? { stockQty: stockEdits[n] } : {}),
        ...(priceEdits[n] !== undefined ? { unitCost: priceEdits[n] } : {})
      }));
      const res = await fetch('/api/beverage/buy-items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, items }) });
      const json = await res.json();
      if (!json.success) { alert('❌ Lỗi: ' + json.message); return; }
      setStockEdits({});
      setPriceEdits({});
      setQtyEdits({});
      await load();
      alert('✅ Đã lưu tồn và đơn giá. Số lượng đề xuất đã được tính lại.');
    } finally {
      setSaving(false);
    }
  };

  const lines = visible.filter((r) => qtyOf(r) > 0).map((r) => ({ code: '', name: r.buy_name, group: r.category || 'Khác', unit: r.buy_unit, qty: qtyOf(r), price: priceOf(r) }));
  const cycleLabel = 'Đồ uống - chu kỳ mua 7 ngày' + (selectedGroup ? ' - nhóm ' + selectedGroup : '');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={load} disabled={loading} className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1.5 rounded font-bold disabled:opacity-50">{loading ? '⏳ Đang tính…' : '🔄 Tính lại'}</button>
        <button onClick={save} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-bold disabled:opacity-50">{saving ? '⏳ Đang lưu…' : `💾 Lưu tồn & đơn giá${dirty ? ` (${dirty})` : ''}`}</button>
        <button onClick={() => setOrderOpen(true)} className="bg-white text-blue-800 border border-blue-300 hover:bg-blue-50 px-3 py-1.5 rounded font-bold">📤 Xuất đơn mua hàng</button>
        <a href={`/beverage-config?branch=${branch}`} className="bg-gray-100 hover:bg-gray-200 text-gray-800 border px-3 py-1.5 rounded font-bold">⚙ Cấu hình cách tính (ml/ly, quy cách…)</a>
        <label className="flex items-center gap-1 ml-2 text-gray-700 cursor-pointer font-bold">
          <input type="checkbox" checked={!!onlyNeed} onChange={(e) => setFilters((f) => ({ ...f, suggested: e.target.checked ? { op: '>', val: '0' } : { op: '>=', val: '' } }))} /> Chỉ mặt hàng cần mua
        </label>
        {hasFilter && <button onClick={() => { setFilters({}); setSort(null); }} className="px-2 py-1 rounded border bg-white text-red-600 font-bold">✕ Xóa bộ lọc</button>}
        {data && <span className="ml-auto text-gray-500">{visible.length}/{rows.length} mặt hàng · tính từ doanh số {data.salesDays} ngày gần nhất, chu kỳ mua {data.cycleDays} ngày</span>}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 text-blue-900">
        Quy tắc: bán nguyên chai/lon thì mua đúng số đã bán; bán theo ly thì quy ra ml (Sapporo 500 ml/ly, vang 100 ml/ly, tháp 3 L…); đồ pha chế tính 10 ml nguyên liệu/ly. Tồn hiện có chưa lấy từ CUKCUK nên nhập ở cột Tồn rồi bấm Lưu.
      </div>

      {groupStats.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center bg-white rounded border px-2 py-1.5">
          <span className="text-gray-500 font-bold mr-1">Nhóm hàng:</span>
          <button onClick={() => setFilters((f) => ({ ...f, category: { value: '' } }))} className={`px-2.5 py-0.5 rounded-full border font-bold ${selectedGroup === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>Tất cả ({rows.length})</button>
          {groupStats.map((g) => (
            <button key={g.name} onClick={() => setFilters((f) => ({ ...f, category: { value: g.name } }))} className={`px-2.5 py-0.5 rounded-full border font-bold ${selectedGroup === g.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
              {g.name} ({g.need > 0 ? `${g.need}/` : ''}{g.count})
            </button>
          ))}
          <span className="text-gray-400 ml-1">(cần mua/tổng)</span>
        </div>
      )}

      {error && <p className="text-red-700 bg-white border rounded p-3">❌ {error}</p>}
      {loading && !data ? (
        <p className="text-gray-600 p-6">Đang tính dự kiến mua đồ uống…</p>
      ) : data && rows.length === 0 ? (
        <p className="bg-white rounded border p-6 text-gray-600">Chưa có đồ uống nào. Hãy lấy thực đơn và doanh số từ CUKCUK (mục Đồng bộ & ghép món).</p>
      ) : data && (
        <DataTable
          columns={columns}
          allRows={rows}
          rows={visible}
          rowKey={(r) => r.buy_name}
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          maxHeight="calc(100vh - 330px)"
          footer={[
            <td key="l" colSpan={11} className="px-2 py-1 text-right">Tổng cộng ({visible.length} mặt hàng đang hiển thị):</td>,
            <td key="a" className="px-2 py-1 text-right">{money(total)} ₫</td>,
            <td key="n" className="px-2 py-1"></td>
          ]}
        />
      )}

      <PurchaseOrderModal open={orderOpen} onClose={() => setOrderOpen(false)} branch={branchInfo} lines={lines} cycleLabel={cycleLabel} suppliers={suppliers} onCompanySaved={onCompanySaved} />
    </div>
  );
}
