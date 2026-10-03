import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function SyncCukcuk() {
  const router = useRouter();
  const { branch } = router.query;

  const [currentBranch, setCurrentBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bomUploading, setBomUploading] = useState(false);
  const [bomResult, setBomResult] = useState(null);

  const [salesStatus, setSalesStatus] = useState(null);
  const [savingCode, setSavingCode] = useState('');

  useEffect(() => {
    if (!branch) return;
    fetchBranch();
    fetchSalesStatus();
  }, [branch]);

  const fetchBranch = async () => {
    try {
      const res = await fetch(`/api/branches/${branch}`);
      const data = await res.json();
      if (data.success) setCurrentBranch(data.data);
    } catch (error) {
      console.error('Error fetching branch:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesStatus = async () => {
    try {
      const res = await fetch(`/api/sales/status/${branch}`);
      const data = await res.json();
      if (data.success) setSalesStatus(data.data);
    } catch (error) {
      console.error('Error fetching sales status:', error);
    }
  };

  const saveMapping = async (cukcukCode, bomDishId) => {
    try {
      setSavingCode(cukcukCode);
      const res = await fetch('/api/sales/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branch, cukcukCode, bomDishId: bomDishId || null })
      });
      const data = await res.json();
      if (!data.success) alert('❌ Lỗi: ' + data.message);
      await fetchSalesStatus();
    } finally {
      setSavingCode('');
    }
  };

  const handleBomUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('branchId', branch);

    try {
      setBomUploading(true);
      const res = await fetch('/api/bom/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setBomResult(data);
      if (data.success) {
        alert(`✅ Tải định lượng thành công!\n- Món ăn: ${data.data.totalDishes}\n- Dòng định lượng: ${data.data.totalMaterials}\n- NVL khác nhau: ${data.data.uniqueMaterials}`);
      } else {
        alert('❌ Lỗi: ' + data.message);
      }
    } catch (error) {
      setBomResult({ success: false, message: error.message });
      alert('❌ Lỗi: ' + error.message);
    } finally {
      setBomUploading(false);
      e.target.value = '';
    }
  };

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
        <title>Đồng Bộ CUKCUK & Tải BOM</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-800 text-white px-8 py-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">🔄 Đồng Bộ & Tải Dữ Liệu</h1>
            <p className="text-blue-200">Chi nhánh: {currentBranch?.branch_name}</p>
          </div>
        </header>

        <div className="max-w-4xl mx-auto p-8 space-y-8">
          {/* Section 1: Upload BOM */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-l-4 border-green-600">
            <div className="bg-green-50 px-6 py-4 border-b border-green-200">
              <h2 className="text-xl font-bold text-green-800">📄 Bước 1: Tải Định Lượng (BOM)</h2>
              <p className="text-sm text-green-700 mt-1">Upload file Excel chứa công thức và định lượng nguyên vật liệu</p>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-green-300 rounded-lg p-8 text-center hover:bg-green-50 transition cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleBomUpload}
                  disabled={bomUploading}
                  className="hidden"
                  id="bomFile"
                />
                <label htmlFor="bomFile" className="cursor-pointer block">
                  <p className="text-3xl mb-2">📊</p>
                  <p className="font-bold text-gray-800 mb-1">Click để chọn file hoặc kéo thả</p>
                  <p className="text-sm text-gray-600">Khuyến nghị file .xlsx gốc (CSV có thể mất dấu tiếng Việt). Tối đa 50MB</p>
                </label>
              </div>
              {bomUploading && <p className="text-center mt-4 text-blue-600">⏳ Đang tải...</p>}
              {bomResult && (
                <div className={`mt-4 p-4 rounded ${bomResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <p className="font-bold">{bomResult.success ? '✅' : '❌'} {bomResult.message}</p>
                  {bomResult.data && (
                    <ul className="text-sm mt-2">
                      <li>- Món ăn: {bomResult.data.totalDishes}</li>
                      <li>- Dòng định lượng: {bomResult.data.totalMaterials}</li>
                      <li>- NVL khác nhau: {bomResult.data.uniqueMaterials} (mới: {bomResult.data.newMaterialsCreated})</li>
                      {bomResult.data.byCategory && Object.entries(bomResult.data.byCategory).map(([k, v]) => (
                        <li key={k} className="ml-4">• {k}: {v}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Doanh số CUKCUK */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-l-4 border-purple-600">
            <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
              <h2 className="text-xl font-bold text-purple-800">🧾 Bước 2: Doanh Số Bán Hàng Từ CUKCUK</h2>
              <p className="text-sm text-purple-700 mt-1">Lấy từ báo cáo "Chi tiết doanh thu theo hóa đơn và mặt hàng" trên CUKCUK của chi nhánh</p>
            </div>
            <div className="p-6 space-y-4">
              {!salesStatus || !salesStatus.range || !salesStatus.range.records || Number(salesStatus.range.records) === 0 ? (
                <p className="text-gray-600">Chưa có doanh số. Hãy nhờ Claude đăng nhập CUKCUK và lấy báo cáo doanh số cho chi nhánh này.</p>
              ) : (() => {
                const maps = salesStatus.mappings || [];
                const foodUnmatched = maps.filter(m => !m.bom_dish_id && m.cukcuk_kind === 'Món ăn');
                const otherUnmatched = maps.filter(m => !m.bom_dish_id && m.cukcuk_kind !== 'Món ăn');
                const matched = maps.filter(m => m.bom_dish_id).length;
                const fmt = (d) => new Date(d).toLocaleDateString('vi-VN');
                return (
                  <>
                    <div className="bg-purple-50 rounded p-4 text-sm text-purple-900">
                      <p>📅 Doanh số từ <b>{fmt(salesStatus.range.from_date)}</b> đến <b>{fmt(salesStatus.range.to_date)}</b> ({salesStatus.range.records} dòng món/ngày)</p>
                      <p>✅ Đã ghép với định lượng: <b>{matched}</b> món &nbsp;|&nbsp; ⚠️ Món ăn chưa ghép: <b>{foodUnmatched.length}</b> &nbsp;|&nbsp; Đồ uống/mặt hàng khác không có định lượng: {otherUnmatched.length}</p>
                    </div>
                    {foodUnmatched.length > 0 && (
                      <div>
                        <p className="font-bold text-gray-800 mb-2">Món ăn CUKCUK chưa khớp với định lượng — chọn món tương ứng:</p>
                        <div className="border rounded divide-y">
                          {foodUnmatched.map(m => (
                            <div key={m.cukcuk_code} className="p-3 flex items-center gap-3 text-sm">
                              <div className="w-1/2">
                                <p className="font-medium">{m.cukcuk_name}</p>
                                <p className="text-xs text-gray-500">{m.cukcuk_code} · đã bán {m.qty}</p>
                              </div>
                              <select
                                disabled={savingCode === m.cukcuk_code}
                                defaultValue=""
                                onChange={(e) => e.target.value && saveMapping(m.cukcuk_code, e.target.value)}
                                className="w-1/2 border p-2 rounded"
                              >
                                <option value="">— Chọn món trong định lượng —</option>
                                {(salesStatus.bomDishes || []).map(d => (
                                  <option key={d.dish_id} value={d.dish_id}>{d.dish_name}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Next Step */}
          <div className="bg-blue-50 border-l-4 border-blue-600 p-6 rounded-lg">
            <h3 className="font-bold text-blue-800 mb-2">✅ Bước Tiếp Theo</h3>
            <p className="text-sm text-blue-700 mb-4">
              Sau khi hoàn thành 2 bước trên, bạn có thể lập kế hoạch mua hàng!
            </p>
            <a
              href={`/purchase-plan?branch=${branch}`}
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-bold"
            >
              📊 Lập Kế Hoạch Mua →
            </a>
          </div>

          {/* Back Link */}
          <div className="text-center">
            <a href="/" className="text-blue-600 hover:underline">← Quay lại danh sách chi nhánh</a>
          </div>
        </div>
      </div>
    </>
  );
}
