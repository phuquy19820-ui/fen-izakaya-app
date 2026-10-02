import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function SyncCukcuk() {
  const router = useRouter();
  const { branch } = router.query;

  const [currentBranch, setCurrentBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [bomUploading, setBomUploading] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [bomResult, setBomResult] = useState(null);

  const [cukcukForm, setCukcukForm] = useState({
    companyCode: '',
    username: '',
    password: '',
    fromDate: '',
    toDate: ''
  });

  useEffect(() => {
    if (!branch) return;
    fetchBranch();
  }, [branch]);

  const fetchBranch = async () => {
    try {
      const res = await fetch(`/api/branches/${branch}`);
      const data = await res.json();
      if (data.success) {
        setCurrentBranch(data.data);
        setCukcukForm({
          companyCode: data.data.cukcuk_company_code || '',
          username: '',
          password: '',
          fromDate: new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0],
          toDate: new Date().toISOString().split('T')[0]
        });
      }
    } catch (error) {
      console.error('Error fetching branch:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCukcukSync = async (e) => {
    e.preventDefault();
    if (!cukcukForm.companyCode || !cukcukForm.username || !cukcukForm.password) {
      alert('Vui lòng nhập đầy đủ thông tin CUKCUK');
      return;
    }

    try {
      setSyncing(true);
      const res = await fetch('/api/cukcuk/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: branch,
          ...cukcukForm
        })
      });
      const data = await res.json();
      setSyncResult(data);
      if (data.success) {
        alert('✅ Đồng bộ CUKCUK thành công!');
      } else {
        alert('❌ Lỗi: ' + data.message);
      }
    } catch (error) {
      setSyncResult({ success: false, message: error.message });
      alert('❌ Lỗi: ' + error.message);
    } finally {
      setSyncing(false);
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

          {/* Section 2: CUKCUK Sync */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border-l-4 border-purple-600">
            <div className="bg-purple-50 px-6 py-4 border-b border-purple-200">
              <h2 className="text-xl font-bold text-purple-800">🔄 Bước 2: Đồng Bộ Dữ Liệu CUKCUK</h2>
              <p className="text-sm text-purple-700 mt-1">Kết nối với hệ thống bán hàng để lấy dữ liệu bán hàng và tồn kho</p>
            </div>
            <div className="p-6">
              <form onSubmit={handleCukcukSync} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Mã Công Ty CUKCUK *</label>
                    <input
                      type="text"
                      value={cukcukForm.companyCode}
                      onChange={(e) => setCukcukForm({ ...cukcukForm, companyCode: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                      placeholder="VD: FENIZAKAYA"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Tên Đăng Nhập *</label>
                    <input
                      type="text"
                      value={cukcukForm.username}
                      onChange={(e) => setCukcukForm({ ...cukcukForm, username: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                      placeholder="VD: admin@fenizakaya"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Mật Khẩu *</label>
                    <input
                      type="password"
                      value={cukcukForm.password}
                      onChange={(e) => setCukcukForm({ ...cukcukForm, password: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Đến Ngày</label>
                    <input
                      type="date"
                      value={cukcukForm.toDate}
                      onChange={(e) => setCukcukForm({ ...cukcukForm, toDate: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Từ Ngày</label>
                    <input
                      type="date"
                      value={cukcukForm.fromDate}
                      onChange={(e) => setCukcukForm({ ...cukcukForm, fromDate: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={syncing}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded font-bold disabled:opacity-50"
                >
                  {syncing ? '⏳ Đang đồng bộ...' : '🔄 Đồng Bộ CUKCUK'}
                </button>
              </form>
              {syncResult && (
                <div className={`mt-4 p-4 rounded ${syncResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  <p className="font-bold">{syncResult.success ? '✅' : '❌'} {syncResult.message}</p>
                  {syncResult.data && (
                    <ul className="text-sm mt-2">
                      <li>- Bản ghi bán hàng: {syncResult.data.salesRecords}</li>
                      <li>- Bản ghi tồn kho: {syncResult.data.inventoryRecords}</li>
                    </ul>
                  )}
                </div>
              )}
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
