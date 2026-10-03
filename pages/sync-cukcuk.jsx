import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SearchSelect from '../components/SearchSelect';
import BranchNav from '../components/BranchNav';
import NewDishModal from '../components/NewDishModal';
import NewMaterialModal from '../components/NewMaterialModal';

export default function SyncCukcuk() {
  const router = useRouter();
  const { branch } = router.query;

  const [currentBranch, setCurrentBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bomUploading, setBomUploading] = useState(false);
  const [bomResult, setBomResult] = useState(null);

  const [salesStatus, setSalesStatus] = useState(null);
  const [savingCode, setSavingCode] = useState('');
  const [ext, setExt] = useState({ installed: false, status: 'idle', text: '' });
  const [rangeDays, setRangeDays] = useState(7);
  const [dishModal, setDishModal] = useState({ open: false, item: null });
  const [matModalOpen, setMatModalOpen] = useState(false);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.source !== window || !e.data || e.data.source !== 'FEN_EXT') return;
      if (e.data.type === 'READY') setExt((x) => ({ ...x, installed: true }));
      if (e.data.type === 'STATUS') {
        setExt((x) => ({ ...x, installed: true, ...e.data.payload }));
        if (e.data.payload.status === 'done') fetchSalesStatus();
      }
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'FEN_APP', type: 'PING' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, [branch]);

  const cukcukUrl = () => {
    const c = (currentBranch?.cukcuk_domain || currentBranch?.cukcuk_company_code || '').trim();
    if (!c) return '';
    if (/^https?:\/\//.test(c)) return c;
    return c.includes('.') ? `https://${c}` : `https://${c}.cukcuk.vn`;
  };

  const startExtSync = () => {
    const url = cukcukUrl();
    if (!url) {
      alert('Chi nhánh chưa có Mã công ty CUKCUK (phần đầu địa chỉ ....cukcuk.vn). Hãy tạo lại chi nhánh với mã này.');
      return;
    }
    const p = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const to = new Date();
    const from = new Date(Date.now() - (rangeDays - 1) * 86400000);
    setExt((x) => ({ ...x, status: 'waiting_login', text: 'Đang mở CUKCUK…', result: null }));
    window.postMessage({
      source: 'FEN_APP', type: 'START_SYNC',
      job: { branchId: branch, cukcukUrl: url, fromDate: fmt(from), toDate: fmt(to) }
    }, '*');
  };

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
        <BranchNav branch={branch} active="sync" branchName={currentBranch?.branch_name} />
        <NewDishModal
          open={dishModal.open}
          branch={branch}
          cukcukItem={dishModal.item}
          onClose={() => setDishModal({ open: false, item: null })}
          onCreated={() => { setDishModal({ open: false, item: null }); fetchSalesStatus(); }}
        />
        <NewMaterialModal
          open={matModalOpen}
          onClose={() => setMatModalOpen(false)}
          onCreated={() => { setMatModalOpen(false); alert('✅ Đã tạo nguyên vật liệu mới. Bạn có thể chọn nó khi tạo món.'); }}
        />

        <div className="max-w-6xl mx-auto p-8 space-y-8">
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
              <p className="text-sm text-purple-700 mt-1">Lấy từ báo cáo "Chi tiết doanh thu theo hóa đơn và mặt hàng" (phân hệ Báo cáo → Bán hàng) trên CUKCUK của chi nhánh</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="border border-purple-200 rounded p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={startExtSync}
                    disabled={!ext.installed || ext.status === 'waiting_login' || ext.status === 'running'}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded font-bold disabled:opacity-50"
                  >
                    🔄 Đồng bộ doanh số từ CUKCUK
                  </button>
                  <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className="border p-2 rounded text-sm">
                    <option value={3}>3 ngày gần nhất</option>
                    <option value={7}>7 ngày gần nhất</option>
                    <option value={14}>14 ngày gần nhất</option>
                    <option value={30}>30 ngày gần nhất</option>
                  </select>
                  <span className="text-xs text-gray-500">Bấm nút → CUKCUK tự mở → bạn đăng nhập → app tự lấy số liệu.</span>
                </div>
                {ext.status !== 'idle' && (
                  <p className={`text-sm font-medium ${ext.status === 'error' ? 'text-red-700' : ext.status === 'done' ? 'text-green-700' : 'text-purple-800'}`}>
                    {ext.status === 'error' ? '❌ ' : ext.status === 'done' ? '✅ ' : '⏳ '}{ext.text}
                    {ext.status === 'done' && ext.result && ` Ghép được ${ext.result.matchedCodes}/${ext.result.totalCodes} mã món.`}
                  </p>
                )}
                {!ext.installed && (
                  <div className="bg-yellow-50 border border-yellow-300 rounded p-3 text-sm text-yellow-900">
                    <p className="font-bold mb-1">Cần cài tiện ích Chrome một lần (không thấy tiện ích trên trình duyệt này):</p>
                    <ol className="list-decimal ml-5 space-y-1">
                      <li><a href="/fen-cukcuk-extension.zip" className="text-blue-700 underline">Tải tiện ích (.zip)</a> rồi giải nén ra một thư mục cố định.</li>
                      <li>Mở Chrome, vào <b>chrome://extensions</b>, bật <b>Chế độ nhà phát triển</b> (Developer mode).</li>
                      <li>Bấm <b>Tải tiện ích đã giải nén</b> (Load unpacked) và chọn thư mục vừa giải nén.</li>
                      <li>Quay lại trang này, tải lại trang (F5), nút đồng bộ sẽ sáng lên.</li>
                    </ol>
                  </div>
                )}
              </div>
              {!salesStatus || !salesStatus.range || !salesStatus.range.records || Number(salesStatus.range.records) === 0 ? (
                <p className="text-gray-600">Chưa có doanh số. Bấm nút "Đồng bộ doanh số từ CUKCUK" ở trên.</p>
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
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setDishModal({ open: true, item: null })} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold">＋ Tạo món mới</button>
                      <button onClick={() => setMatModalOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold">＋ Tạo nguyên vật liệu mới</button>
                    </div>
                    {foodUnmatched.length > 0 && (
                      <div>
                        <p className="font-bold text-gray-800 mb-2">Món ăn CUKCUK chưa khớp với định lượng — chọn món tương ứng:</p>
                        <div className="border rounded divide-y">
                          {foodUnmatched.map(m => (
                            <div key={m.cukcuk_code} className="p-3 flex items-center gap-3 text-sm">
                              <div className="w-1/3">
                                <p className="font-medium">{m.cukcuk_name}</p>
                                <p className="text-xs text-gray-500">{m.cukcuk_code} · đã bán {m.qty}</p>
                              </div>
                              {m.suggestion && (
                                <button
                                  disabled={savingCode === m.cukcuk_code}
                                  onClick={() => saveMapping(m.cukcuk_code, m.suggestion.dish_id)}
                                  className="shrink-0 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-xs font-bold disabled:opacity-50"
                                  title={`Độ giống ${Math.round(m.suggestion.score * 100)}%`}
                                >
                                  ✔ {m.suggestion.dish_name}
                                </button>
                              )}
                              <SearchSelect
                                className="flex-1"
                                disabled={savingCode === m.cukcuk_code}
                                value=""
                                options={(salesStatus.bomDishes || []).map(d => ({ value: d.dish_id, label: d.dish_name }))}
                                onChange={(v) => v && saveMapping(m.cukcuk_code, v)}
                                placeholder="🔍 Tìm món trong định lượng…"
                              />
                              <button
                                onClick={() => setDishModal({ open: true, item: { code: m.cukcuk_code, name: m.cukcuk_name } })}
                                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs font-bold"
                                title="Món này chưa có trong file định lượng: tạo món mới và định lượng"
                              >
                                ＋ Tạo món mới
                              </button>
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
