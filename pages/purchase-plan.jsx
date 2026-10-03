import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import PurchaseOrderModal from '../components/PurchaseOrderModal';

const CATEGORY_LABELS = {
  FRESH_MEAT: 'Thịt tươi', SEAFOOD: 'Hải sản', VEGETABLE: 'Rau củ quả', HERB_SEASONING: 'Thảo mộc',
  SPICE_DRY: 'Gia vị khô', DRY_GOODS: 'Hàng khô', FROZEN: 'Đông lạnh', SAUCE_CONDIMENT: 'Sốt & condiment'
};
const groupOf = (item) => item.sub_group || CATEGORY_LABELS[item.category] || item.category || 'Khác';
const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const fix2 = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export default function PurchasePlanMisaUI() {
  const router = useRouter();
  const { branch } = router.query;

  const [cycleType, setCycleType] = useState('FRESH_3DAYS');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [planData, setPlanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [adjustments, setAdjustments] = useState({});
  const [priceEdits, setPriceEdits] = useState({});
  const [planId, setPlanId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);

  const initialAdjustments = (details) => {
    const adj = {};
    (details || []).forEach((d) => { if (d.adjusted_qty !== null && d.adjusted_qty !== undefined) adj[d.material_id] = d.adjusted_qty; });
    return adj;
  };

  useEffect(() => {
    if (!branch) return;
    fetchBranch();
    fetchPurchasePlan();
  }, [branch]);

  const fetchBranch = async () => {
    try {
      const res = await fetch(`/api/branches/${branch}`);
      const data = await res.json();
      if (data.success) setCurrentBranch(data.data);
    } catch (error) {
      console.error('Error fetching branch:', error);
    }
  };

  const fetchPurchasePlan = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/purchase-plans/${branch}`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setPlanData(data.data[0].details || []);
        setPlanId(data.data[0].plan_id);
        setAdjustments(initialAdjustments(data.data[0].details));
        setPriceEdits({});
      }
    } catch (error) {
      console.error('Error fetching purchase plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePurchasePlan = async () => {
    if (!branch) return;
    try {
      setGenerating(true);
      const res = await fetch('/api/purchase-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branch, cycleType })
      });
      const data = await res.json();
      if (data.success) {
        setPlanData(data.data.details || []);
        setPlanId(data.data.plan_id);
        setAdjustments({});
        setPriceEdits({});
        alert('✅ Đã tạo kế hoạch mua hàng!');
      } else {
        alert('❌ Lỗi: ' + data.message);
      }
    } catch (error) {
      alert('❌ Lỗi: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const savePlan = async () => {
    if (!planId) { alert('Chưa có kế hoạch để lưu. Hãy tạo kế hoạch trước.'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/purchase-plans/' + planId + '/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustments, prices: priceEdits })
      });
      const data = await res.json();
      if (data.success) {
        // Giá đã lưu: ghi vào dữ liệu hiển thị để không còn là "chưa lưu"
        setPlanData((rows) => rows.map((r) => (priceEdits[r.material_id] !== undefined ? { ...r, unit_cost: priceEdits[r.material_id] } : r)));
        setPriceEdits({});
      }
      alert(data.success ? '✅ ' + data.message : '❌ Lỗi: ' + data.message);
    } catch (error) {
      alert('❌ Lỗi: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const qtyOf = (r) => (adjustments[r.material_id] !== undefined ? adjustments[r.material_id] : (r.suggested_qty || 0));
  const priceOf = (r) => (priceEdits[r.material_id] !== undefined ? priceEdits[r.material_id] : (r.unit_cost || 0));

  const cycleData = useMemo(() => planData.filter((item) => item.purchase_cycle === cycleType), [planData, cycleType]);

  const groupStats = useMemo(() => {
    const map = new Map();
    cycleData.forEach((item) => {
      const g = groupOf(item);
      const cur = map.get(g) || { name: g, count: 0, need: 0 };
      cur.count++;
      if ((item.suggested_qty || 0) > 0) cur.need++;
      map.set(g, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.need - a.need || b.count - a.count);
  }, [cycleData]);

  const columns = [
    { key: 'code', label: 'Mã NVL', width: 118, type: 'text', get: (r) => r.material_id, render: (r) => <span className="font-mono text-blue-700">{r.material_id}</span> },
    { key: 'name', label: 'Tên nguyên vật liệu', type: 'text', get: (r) => r.material_name, render: (r) => <span className="font-medium">{r.material_name}</span> },
    { key: 'group', label: 'Nhóm hàng', width: 132, type: 'select', get: groupOf },
    { key: 'unit', label: 'ĐVT', width: 54, type: 'select', get: (r) => r.unit_purchase, align: 'center' },
    { key: 'stock', label: 'Tồn', width: 62, type: 'number', align: 'right', get: (r) => r.opening_stock, render: (r) => fix2(r.opening_stock) },
    { key: 'suggested', label: 'Đề xuất', width: 74, type: 'number', align: 'right', get: (r) => r.suggested_qty, render: (r) => <span className="font-bold text-yellow-800">{fix2(r.suggested_qty)}</span> },
    {
      key: 'qty', label: 'Thực mua', width: 88, type: 'number', align: 'right', get: qtyOf, noTitle: true,
      render: (r) => (
        <input
          type="number" step="any" min="0" value={qtyOf(r)}
          onChange={(e) => setAdjustments((a) => ({ ...a, [r.material_id]: parseFloat(e.target.value) || 0 }))}
          className="w-full text-right font-bold border rounded text-xs bg-green-50" style={{ height: 22, padding: '0 4px' }}
        />
      )
    },
    {
      key: 'price', label: 'Đơn giá (sửa được)', width: 108, type: 'number', align: 'right', get: priceOf, noTitle: true,
      render: (r) => (
        <input
          type="number" step="any" min="0" value={priceOf(r)}
          onChange={(e) => setPriceEdits((p) => ({ ...p, [r.material_id]: parseFloat(e.target.value) || 0 }))}
          className={`w-full text-right border rounded text-xs ${priceEdits[r.material_id] !== undefined ? 'bg-yellow-100 font-bold' : 'bg-white'}`} style={{ height: 22, padding: '0 4px' }}
          title="Sửa đơn giá, nhớ bấm Lưu Kế Hoạch"
        />
      )
    },
    { key: 'amount', label: 'Thành tiền', width: 106, type: 'number', align: 'right', get: (r) => qtyOf(r) * priceOf(r), render: (r) => <b>{money(qtyOf(r) * priceOf(r))}</b> },
    { key: 'note', label: 'Ghi chú', width: 230, type: 'text', get: (r) => r.note || '', render: (r) => <span className="text-gray-600">{r.note}</span> }
  ];

  const visibleRows = useMemo(
    () => sortRows(filterRows(cycleData, columns, filters), columns, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cycleData, filters, sort, adjustments, priceEdits]
  );

  const totalAmount = visibleRows.reduce((s, r) => s + qtyOf(r) * priceOf(r), 0);
  const selectedGroup = (filters.group && filters.group.value) || '';
  const onlyNeed = filters.suggested && filters.suggested.op === '>' && filters.suggested.val === '0';

  const setGroup = (g) => setFilters((f) => ({ ...f, group: { value: g } }));
  const toggleOnlyNeed = (checked) => setFilters((f) => ({ ...f, suggested: checked ? { op: '>', val: '0' } : { op: '>=', val: '' } }));
  const hasFilter = Object.keys(filters).some((k) => { const f = filters[k]; return f && (f.text || f.value || (f.val !== undefined && f.val !== '')); }) || !!sort;

  const orderLines = visibleRows
    .filter((r) => qtyOf(r) > 0)
    .map((r) => ({ code: r.material_id, name: r.material_name, group: groupOf(r), unit: r.unit_purchase, qty: qtyOf(r), price: priceOf(r) }));
  const cycleLabel = (cycleType === 'FRESH_3DAYS' ? 'Hàng tươi - chu kỳ mua 3 ngày' : 'Hàng khô - chu kỳ mua 7 ngày') + (selectedGroup ? ' - nhóm ' + selectedGroup : '');
  const unsavedPrices = Object.keys(priceEdits).length;

  if (!currentBranch && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Chi nhánh không tìm thấy</p>
          <a href="/" className="text-blue-600 hover:underline">← Quay lại danh sách chi nhánh</a>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Kế Hoạch Mua NVL - MISA UI</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>

      <div className="min-h-screen bg-gray-100 flex flex-col text-xs font-sans">
        <header className="text-white px-6 py-2 flex justify-between items-center" style={{ backgroundColor: '#0073C5' }}>
          <div>
            <h1 className="text-base font-bold">LẬP KẾ HOẠCH MUA NGUYÊN VẬT LIỆU</h1>
            <p className="text-blue-200">Chi nhánh: {currentBranch?.branch_name || 'Đang tải...'}</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <button onClick={generatePurchasePlan} disabled={generating} className="bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 rounded font-bold disabled:opacity-50">
              {generating ? '⏳ Đang tính...' : '🔄 Tạo Kế Hoạch'}
            </button>
            <button onClick={savePlan} disabled={saving} className="bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded font-bold disabled:opacity-50">
              {saving ? '⏳ Đang lưu...' : `💾 Lưu Kế Hoạch${unsavedPrices ? ` (${unsavedPrices} giá sửa)` : ''}`}
            </button>
            <button onClick={() => setOrderOpen(true)} className="bg-white text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded font-bold">📤 Xuất đơn mua hàng</button>
          </div>
        </header>
        <BranchNav branch={branch} active="plan" branchName={currentBranch?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1600, width: '100%', margin: '0 auto' }}>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => { setCycleType('FRESH_3DAYS'); setGroup(''); }} className={`px-3 py-1.5 rounded font-bold border ${cycleType === 'FRESH_3DAYS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🔴 ĐỒ TƯƠI (3 ngày)</button>
            <button onClick={() => { setCycleType('WEEKLY_7DAYS'); setGroup(''); }} className={`px-3 py-1.5 rounded font-bold border ${cycleType === 'WEEKLY_7DAYS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>🔵 ĐỒ KHÔ (7 ngày)</button>
            <label className="flex items-center gap-1 ml-3 text-gray-700 cursor-pointer font-bold">
              <input type="checkbox" checked={!!onlyNeed} onChange={(e) => toggleOnlyNeed(e.target.checked)} /> Chỉ NVL cần mua (Đề xuất &gt; 0)
            </label>
            {hasFilter && <button onClick={() => { setFilters({}); setSort(null); }} className="px-2 py-1 rounded border bg-white text-red-600 font-bold">✕ Xóa bộ lọc</button>}
            <span className="ml-auto text-gray-500">{visibleRows.length}/{cycleData.length} NVL · Bấm tiêu đề cột để sắp xếp, ô dưới tiêu đề để lọc</span>
          </div>

          {groupStats.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center bg-white rounded border px-2 py-1.5">
              <span className="text-gray-500 font-bold mr-1">Nhóm hàng:</span>
              <button onClick={() => setGroup('')} className={`px-2.5 py-0.5 rounded-full border font-bold ${selectedGroup === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
                Tất cả ({cycleData.length})
              </button>
              {groupStats.map((g) => (
                <button
                  key={g.name}
                  onClick={() => setGroup(g.name)}
                  className={`px-2.5 py-0.5 rounded-full border font-bold ${selectedGroup === g.name ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  {g.name} ({g.need > 0 ? `${g.need}/` : ''}{g.count})
                </button>
              ))}
              <span className="text-gray-400 ml-1">(cần mua/tổng)</span>
            </div>
          )}

          {loading ? (
            <p className="text-gray-600 p-6">Đang tải dữ liệu kế hoạch mua...</p>
          ) : planData.length === 0 ? (
            <div className="bg-white rounded border p-8 text-center space-y-3">
              <p className="text-gray-600">Chưa có kế hoạch mua nào. Vui lòng tạo kế hoạch mới.</p>
              <button onClick={generatePurchasePlan} className="bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-2 rounded font-bold">🔄 Tạo Kế Hoạch Mua</button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              allRows={cycleData}
              rows={visibleRows}
              rowKey={(r) => r.material_id}
              filters={filters}
              onFiltersChange={setFilters}
              sort={sort}
              onSortChange={setSort}
              maxHeight="calc(100vh - 250px)"
              footer={[
                <td key="l" colSpan={8} className="px-2 py-1 text-right">Tổng cộng ({visibleRows.length} NVL đang hiển thị):</td>,
                <td key="a" className="px-2 py-1 text-right">{money(totalAmount)} ₫</td>,
                <td key="n" className="px-2 py-1"></td>
              ]}
            />
          )}
        </div>
      </div>

      <PurchaseOrderModal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        branch={currentBranch}
        lines={orderLines}
        cycleLabel={cycleLabel}
        onCompanySaved={(name) => setCurrentBranch((b) => (b ? { ...b, buyer_company: name } : b))}
      />
    </>
  );
}
