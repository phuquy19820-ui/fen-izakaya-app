import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import MonthPicker from '../components/MonthPicker';

const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const dash = <span className="text-gray-300">—</span>;

export default function MaterialStock() {
  const router = useRouter();
  const { branch } = router.query;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState(null);
  const fileRef = useRef(null);

  const load = async (y, m) => {
    if (!branch) return;
    setLoading(true); setError('');
    try {
      const j = await (await fetch(`/api/materials/stock-movement/${branch}?year=${y}&month=${m}`)).json();
      if (j.success) setData(j.data); else setError(j.message || 'Lỗi');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    load(year, month);
  }, [branch]);
  const pick = (y, m) => { setYear(y); setMonth(m); setUnmatched(null); load(y, m); };

  const upload = async (file) => {
    if (!file) return;
    if (data && data.opening.uploaded > 0 && !window.confirm(`Tháng ${month}/${year} đã có số tồn tải lên trước đó (${data.opening.uploaded} NVL). File mới sẽ THAY THẾ hoàn toàn số cũ. Tiếp tục?`)) { fileRef.current.value = ''; return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('branchId', branch); fd.append('year', year); fd.append('month', month);
      const j = await (await fetch('/api/materials/opening-stock/upload', { method: 'POST', body: fd })).json();
      if (!j.success) { alert('❌ ' + j.message); return; }
      setUnmatched(j.data.unmatched && j.data.unmatched.length ? j.data.unmatched : null);
      alert('✅ ' + j.message + (j.data.unmatched.length ? `\n⚠ ${j.data.unmatched.length} dòng không khớp NVL nào (xem danh sách bên dưới).` : ''));
      await load(year, month);
    } catch (e) { alert('❌ ' + e.message); } finally { setBusy(false); fileRef.current.value = ''; }
  };
  const resetUpload = async () => {
    if (!window.confirm(`Bỏ số tồn đã tải của tháng ${month}/${year}? Số tồn đầu kỳ sẽ lấy tự động từ tồn cuối kỳ trước.`)) return;
    const j = await (await fetch(`/api/materials/opening-stock/${branch}/${year}/${month}`, { method: 'DELETE' })).json();
    if (!j.success) alert('❌ ' + j.message);
    await load(year, month);
  };

  const sl = (k, label, w = 84) => ({ key: k, label, width: w, type: 'number', align: 'right' });
  const columns = [
    { key: 'material_id', label: 'Mã NVL', width: 106, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.material_id}</span> },
    { key: 'name', label: 'Tên nguyên vật liệu', width: 250, type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'group', label: 'Nhóm hàng', width: 130, type: 'select' },
    { key: 'unit', label: 'ĐVT', width: 52, type: 'select', align: 'center' },
    { ...sl('open_qty', 'Tồn đầu kỳ: SL'), render: (r) => num(r.open_qty) },
    { ...sl('open_price', 'Đơn giá'), render: (r) => (r.open_price ? money(r.open_price) : dash) },
    { ...sl('open_amount', 'Thành tiền', 100), render: (r) => money(r.open_amount) },
    { ...sl('in_qty', 'Nhập kho: SL'), render: (r) => (r.in_qty ? <b className="text-green-700">{num(r.in_qty)}</b> : dash) },
    { ...sl('in_price', 'Đơn giá'), render: (r) => (r.in_price ? money(r.in_price) : dash) },
    { ...sl('in_amount', 'Thành tiền', 100), render: (r) => (r.in_amount ? money(r.in_amount) : dash) },
    { ...sl('out_qty', 'Xuất kho: SL'), render: (r) => (r.out_qty ? <b className="text-orange-700">{num(r.out_qty)}</b> : dash) },
    { ...sl('out_price', 'Đơn giá'), render: (r) => (r.out_qty && r.out_price ? money(r.out_price) : dash) },
    { ...sl('out_amount', 'Thành tiền', 100), render: (r) => (r.out_amount ? money(r.out_amount) : dash) },
    { ...sl('close_qty', 'Tồn cuối kỳ: SL'), render: (r) => <b className={r.close_qty < -1e-6 ? 'text-red-600' : ''} title={r.close_qty < -1e-6 ? 'Âm: tiêu hao theo định lượng lớn hơn tồn + nhập (kiểm tra số tồn đầu / phiếu mua)' : ''}>{num(r.close_qty)}</b> },
    { ...sl('close_price', 'Đơn giá'), render: (r) => (r.close_price ? money(r.close_price) : dash) },
    { ...sl('close_amount', 'Thành tiền', 100), render: (r) => <b>{money(r.close_amount)}</b> },
    { key: 'open_src', label: 'Nguồn tồn đầu', width: 120, type: 'select', render: (r) => <span className={r.open_src === 'Tải file' ? 'text-blue-700 font-bold' : 'text-gray-500'}>{r.open_src}</span> }
  ];

  const rows = data ? data.rows : [];
  const visible = useMemo(() => sortRows(filterRows(rows, columns, filters), columns, sort), [rows, filters, sort]); // eslint-disable-line
  const sum = (k) => visible.reduce((a, r) => a + r[k], 0);
  const T = (k) => <td key={k} className="px-2 py-1 text-right">{money(sum(k))}</td>;

  return (
    <>
      <Head>
        <title>Xuất nhập tồn NVL</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="text-base font-bold">BÁO CÁO XUẤT - NHẬP - TỒN KHO NVL THÁNG {month}/{year}</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · Nhập = phiếu mua; Xuất = tiêu hao theo số bán × định lượng; đơn giá bình quân gia quyền</p>
        </header>
        <BranchNav branch={branch} active="plan" branchName={branchInfo?.branch_name} />
        <div className="p-4 space-y-2" style={{ maxWidth: 1700, margin: '0 auto' }}>
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-2">
            <a href={`/purchase-plan?branch=${branch || ''}`} className="px-3 py-1.5 rounded border bg-white font-bold text-gray-700">← Kế hoạch mua</a>
            <a href={`/material-usage?branch=${branch || ''}`} className="px-3 py-1.5 rounded border bg-white font-bold text-blue-800">📉 Tiêu hao NVL</a>
            <span className="font-semibold ml-2">Chọn tháng:</span>
            <MonthPicker year={year} month={month} onChange={pick} />
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <a href={`/api/materials/opening-stock/template/${branch}?year=${year}&month=${month}`} className="px-3 py-1.5 rounded border bg-white font-bold text-gray-700" title="Tải file Excel chứa số tồn đầu kỳ hiện tại của tháng để sửa rồi tải lên lại">📥 File mẫu (tồn đầu kỳ hiện tại)</a>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => upload(e.target.files[0])} />
              <button disabled={busy} onClick={() => fileRef.current.click()} className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">{busy ? '⏳ Đang tải…' : `📤 Tải file tồn đầu kỳ tháng ${month}/${year}`}</button>
              {data && data.opening.uploaded > 0 && <button onClick={resetUpload} className="px-3 py-1.5 rounded border bg-white font-bold text-red-600">↩ Bỏ số đã tải (dùng số tự tính)</button>}
            </span>
          </div>

          {error && <p className="bg-red-50 border border-red-300 text-red-700 rounded p-2">❌ {error}</p>}
          {loading ? <p className="p-4 text-gray-600">Đang tính…</p> : data && (
            <>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tồn đầu kỳ</div><div className="text-lg font-bold">{money(data.totals.open_amount)} đ</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Nhập kho trong kỳ</div><div className="text-lg font-bold text-green-700">{money(data.totals.in_amount)} đ</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Xuất kho trong kỳ</div><div className="text-lg font-bold text-orange-700">{money(data.totals.out_amount)} đ</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tồn cuối kỳ</div><div className="text-lg font-bold text-blue-800">{money(data.totals.close_amount)} đ</div></div>
              </div>
              <div className={`rounded border p-2 ${data.opening.uploaded > 0 ? 'bg-blue-50 border-blue-300 text-blue-900' : 'bg-gray-50 text-gray-700'}`}>
                {data.opening.uploaded > 0
                  ? <>Số tồn đầu kỳ tháng {month}/{year} lấy từ <b>file đã tải</b> ({data.opening.uploaded} NVL, tải lúc {data.opening.uploadedAt}). NVL không có trong file lấy từ tồn cuối kỳ trước.</>
                  : <>Số tồn đầu kỳ tháng {month}/{year} <b>tự chuyển từ tồn cuối kỳ trước</b>{data.opening.hasAny ? '' : ' (chưa có file tồn đầu nào được tải: hệ thống tính từ 0 theo phiếu mua và tiêu hao — hãy tải file tồn đầu để số liệu chính xác)'}. Bạn có thể tải file để thay thế.</>}
              </div>
              {data.negative > 0 && <p className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-2">⚠ {data.negative} NVL có tồn cuối kỳ ÂM (tiêu hao theo định lượng lớn hơn tồn đầu + nhập). Thường do chưa có số tồn đầu, phiếu mua chưa ghép NVL, hoặc định lượng cao hơn thực tế.</p>}
              {unmatched && (
                <div className="bg-red-50 border border-red-300 rounded p-2 text-red-800">
                  <b>{unmatched.length} dòng trong file không khớp NVL nào (đã bỏ qua):</b> {unmatched.slice(0, 30).map((r) => `${r.code ? r.code + ' - ' : ''}${r.name}`).join('; ')}{unmatched.length > 30 ? '…' : ''}
                  <button onClick={() => setUnmatched(null)} className="ml-2 px-2 rounded border bg-white font-bold">Ẩn</button>
                </div>
              )}
              {rows.length === 0 ? <p className="bg-white rounded border p-6 text-gray-600">Chưa có số liệu nhập/xuất/tồn cho tháng này.</p> : (
                <DataTable
                  columns={columns} allRows={rows} rows={visible} rowKey={(r) => r.material_id}
                  filters={filters} onFiltersChange={setFilters} sort={sort} onSortChange={setSort}
                  maxHeight="calc(100vh - 360px)"
                  footer={[
                    <td key="l" colSpan={5} className="px-2 py-1 text-right">Tổng cộng ({visible.length} NVL):</td>,
                    <td key="a1" colSpan={2}></td>, T('open_amount'),
                    <td key="a2" colSpan={2}></td>, T('in_amount'),
                    <td key="a3" colSpan={2}></td>, T('out_amount'),
                    <td key="a4" colSpan={2}></td>, T('close_amount'),
                    <td key="z"></td>
                  ]}
                />
              )}
              <p className="text-gray-500">File tồn đầu kỳ (Excel/CSV) gồm các cột: Mã NVL, Tên NVL, ĐVT, Số lượng, Đơn giá, Thành tiền (theo đơn vị mua của NVL trong app, ví dụ kg). Khớp NVL theo mã, sau đó theo tên. Mỗi tháng có thể tải lại để thay thế số cũ; tháng không tải sẽ tự lấy tồn cuối kỳ của tháng trước.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
