import React, { useState, useMemo, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function PurchasePlanMisaUI() {
  const router = useRouter();
  const { branch } = router.query;

  const [cycleType, setCycleType] = useState('FRESH_3DAYS');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentBranch, setCurrentBranch] = useState(null);
  const [planData, setPlanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [adjustments, setAdjustments] = useState({});
  const [planId, setPlanId] = useState(null);
  const [saving, setSaving] = useState(false);

  const CATEGORY_LABELS = {
    FRESH_MEAT: 'Thịt tươi', SEAFOOD: 'Hải sản', VEGETABLE: 'Rau củ quả', HERB_SEASONING: 'Thảo mộc',
    SPICE_DRY: 'Gia vị khô', DRY_GOODS: 'Hàng khô', FROZEN: 'Đông lạnh', SAUCE_CONDIMENT: 'Sốt & condiment'
  };

  const initialAdjustments = (details) => {
    const adj = {};
    (details || []).forEach(d => { if (d.adjusted_qty !== null && d.adjusted_qty !== undefined) adj[d.material_id] = d.adjusted_qty; });
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
        body: JSON.stringify({ adjustments })
      });
      const data = await res.json();
      alert(data.success ? '✅ ' + data.message : '❌ Lỗi: ' + data.message);
    } catch (error) {
      alert('❌ Lỗi: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredData = useMemo(() => {
    return planData.filter(item => {
      const matchCycle = item.purchase_cycle === cycleType;
      const matchGroup = selectedGroup === 'ALL' || item.category === selectedGroup;
      const matchSearch = item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) || item.material_id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCycle && matchGroup && matchSearch;
    });
  }, [planData, cycleType, selectedGroup, searchTerm]);

  const handleQtyChange = (materialId, value) => {
    const numericVal = parseFloat(value) || 0;
    setAdjustments(prev => ({ ...prev, [materialId]: numericVal }));
  };

  const totalCost = filteredData.reduce((sum, d) => sum + (d.estimated_cost || 0), 0);
  const actualTotal = filteredData.reduce((sum, d) => {
    const qty = adjustments[d.material_id] !== undefined ? adjustments[d.material_id] : d.suggested_qty;
    return sum + (qty * (d.unit_cost || 0));
  }, 0);

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
        <header className="bg-blue-800 text-white px-6 py-3 flex justify-between items-center" style={{ backgroundColor: '#0073C5' }}>
          <div className="flex items-center space-x-3">
            <span className="bg-white text-blue-800 p-1 font-bold text-base rounded">FEN</span>
            <div>
              <h1 className="text-base font-bold">LẬP KẾ HOẠCH MUA NGUYÊN VẬT LIỆU</h1>
              <p className="text-blue-200">Chi nhánh: {currentBranch?.branch_name || 'Đang tải...'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generatePurchasePlan}
              disabled={generating}
              className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded font-bold disabled:opacity-50"
            >
              {generating ? '⏳ Đang tính...' : '🔄 Tạo Kế Hoạch'}
            </button>
            <button onClick={savePlan} disabled={saving} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-bold disabled:opacity-50">{saving ? '⏳ Đang lưu...' : '💾 Lưu Kế Hoạch'}</button>
          </div>
        </header>

        <div className="bg-white px-6 pt-3 flex justify-between border-b items-center">
          <div className="flex space-x-2">
            <button onClick={() => setCycleType('FRESH_3DAYS')} className={`px-4 py-2 font-bold border-b-2 ${cycleType === 'FRESH_3DAYS' ? 'border-blue-600 text-blue-600' : 'text-gray-500'}`}>🔴 ĐỒ TƯƠI (3 Ngày)</button>
            <button onClick={() => setCycleType('WEEKLY_7DAYS')} className={`px-4 py-2 font-bold border-b-2 ${cycleType === 'WEEKLY_7DAYS' ? 'border-blue-600 text-blue-600' : 'text-gray-500'}`}>🔵 ĐỒ KHÔ (7 Ngày)</button>
          </div>
          <div className="flex gap-2 items-center">
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)} className="border p-1.5 rounded">
            <option value="ALL">Tất cả nhóm hàng</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" placeholder="Tìm NVL..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="border p-1.5 rounded w-60" />
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-600">Đang tải dữ liệu kế hoạch mua...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <p className="text-gray-600">Chưa có kế hoạch mua nào. Vui lòng tạo kế hoạch mới.</p>
            <button
              onClick={generatePurchasePlan}
              className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-bold"
            >
              🔄 Tạo Kế Hoạch Mua
            </button>
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-auto">
            <table className="w-full bg-white border border-gray-300 rounded text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b font-bold uppercase text-gray-700">
                  <th className="p-2 border-r">Mã NVL</th>
                  <th className="p-2 border-r">Tên Nguyên Vật Liệu</th>
                  <th className="p-2 border-r">Nhóm</th>
                  <th className="p-2 border-r text-center">ĐVT</th>
                  <th className="p-2 border-r text-right">Tồn</th>
                  <th className="p-2 border-r text-right">Đề Xuất</th>
                  <th className="p-2 border-r text-right bg-green-50">Thực Mua</th>
                  <th className="p-2 border-r text-right">Đơn Giá</th>
                  <th className="p-2 border-r text-right">Thành Tiền</th>
                  <th className="p-2 border-r">Ghi Chú</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map(row => {
                  const actualQty = adjustments[row.material_id] !== undefined ? adjustments[row.material_id] : row.suggested_qty;
                  const actualCost = actualQty * (row.unit_cost || 0);
                  return (
                    <tr key={row.material_id} className="border-b hover:bg-blue-50">
                      <td className="p-2 border-r font-mono text-blue-700 text-xs">{row.material_id}</td>
                      <td className="p-2 border-r font-medium">{row.material_name}</td>
                      <td className="p-2 border-r">{CATEGORY_LABELS[row.category] || row.category}</td>
                      <td className="p-2 border-r text-center">{row.unit_purchase}</td>
                      <td className="p-2 border-r text-right">{Number(row.opening_stock || 0).toFixed(2)}</td>
                      <td className="p-2 border-r text-right font-bold text-yellow-800">{Number(row.suggested_qty || 0).toFixed(2)}</td>
                      <td className="p-1 border-r bg-green-50">
                        <input
                          type="number"
                          step="0.01"
                          value={adjustments[row.material_id] !== undefined ? adjustments[row.material_id] : row.suggested_qty}
                          onChange={(e) => handleQtyChange(row.material_id, e.target.value)}
                          className="w-full text-right font-bold p-1 border rounded text-xs"
                        />
                      </td>
                      <td className="p-2 border-r text-right text-xs">{(row.unit_cost || 0).toLocaleString('vi-VN')}</td>
                      <td className="p-2 border-r text-right text-xs font-bold">{actualCost.toLocaleString('vi-VN')}</td>
                      <td className="p-2 border-r text-xs text-gray-600">{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold border-t-2">
                  <td colSpan="8" className="p-2 text-right">Tổng Cộng:</td>
                  <td className="p-2 border-l text-right">{actualTotal.toLocaleString('vi-VN')} ₫</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
