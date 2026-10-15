import React, { useState, useEffect } from 'react';

const DB_NAME = 'fen-backup';
const STORE = 'handles';
const SUBDIR = 'sao-luu-web';

// Lưu "thư mục sao lưu" đã chọn (trên ổ D) để lần sau không phải chọn lại
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function saveHandle(h) { try { const db = await idb(); db.transaction(STORE, 'readwrite').objectStore(STORE).put(h, 'dir'); } catch (e) { /* bỏ qua */ } }
async function loadHandle() {
  try {
    const db = await idb();
    return await new Promise((resolve) => { const q = db.transaction(STORE).objectStore(STORE).get('dir'); q.onsuccess = () => resolve(q.result || null); q.onerror = () => resolve(null); });
  } catch (e) { return null; }
}
async function ensurePermission(h) {
  if (!h) return false;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}
const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

export default function BackupPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dirName, setDirName] = useState('');
  const [last, setLast] = useState('');
  const [pending, setPending] = useState(null); // { name, buf, info }
  const [confirmText, setConfirmText] = useState('');
  const canPick = typeof window !== 'undefined' && !!window.showDirectoryPicker;

  useEffect(() => {
    try { setLast(localStorage.getItem('fen-last-backup') || ''); } catch (e) { /* bỏ qua */ }
    loadHandle().then((h) => h && setDirName(h.name));
  }, []);

  const pickFolder = async () => {
    try {
      const h = await window.showDirectoryPicker({ id: 'fenbackup', mode: 'readwrite' });
      await saveHandle(h);
      setDirName(h.name);
      setMsg(`✅ Đã chọn thư mục "${h.name}". File sao lưu sẽ nằm trong thư mục con "${SUBDIR}".`);
      return h;
    } catch (e) { return null; }
  };

  const backup = async () => {
    setBusy(true);
    setMsg('Đang tạo bản sao lưu…');
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('Máy chủ trả lỗi ' + res.status);
      const buf = await res.arrayBuffer();
      const rows = res.headers.get('X-Backup-Rows');
      const name = `fen-izakaya-saoluu-${stamp()}.json.gz`;
      let saved = '';
      if (canPick) {
        let h = await loadHandle();
        if (!h || !(await ensurePermission(h))) h = await pickFolder();
        if (h) {
          const sub = await h.getDirectoryHandle(SUBDIR, { create: true });
          const f = await sub.getFileHandle(name, { create: true });
          const w = await f.createWritable();
          await w.write(buf);
          await w.close();
          saved = `${h.name}\\${SUBDIR}\\${name}`;
        }
      }
      if (!saved) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([buf], { type: 'application/gzip' }));
        a.download = name;
        a.click();
        saved = `${name} (đã tải về thư mục Tải xuống)`;
      }
      const when = new Date().toLocaleString('vi-VN');
      try { localStorage.setItem('fen-last-backup', when); } catch (e) { /* bỏ qua */ }
      setLast(when);
      setMsg(`✅ Đã sao lưu ${Number(rows || 0).toLocaleString('vi-VN')} dòng dữ liệu → ${saved}`);
    } catch (e) {
      setMsg('❌ Sao lưu thất bại: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const readInfo = async (buf) => {
    try {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      const d = JSON.parse(text);
      if (d.app !== 'fen-izakaya') return null;
      return { createdAt: d.createdAt, counts: d.counts || {} };
    } catch (e) { return null; }
  };

  const chooseFile = async () => {
    setMsg('');
    try {
      let file;
      if (window.showOpenFilePicker) {
        const h = await loadHandle();
        let start;
        if (h && (await h.queryPermission({ mode: 'read' })) === 'granted') { try { start = await h.getDirectoryHandle(SUBDIR); } catch (e) { start = h; } }
        const [fh] = await window.showOpenFilePicker({ startIn: start, types: [{ description: 'File sao lưu Fen Izakaya', accept: { 'application/gzip': ['.gz'], 'application/json': ['.json'] } }] });
        file = await fh.getFile();
      } else {
        file = await new Promise((resolve) => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.gz,.json'; i.onchange = () => resolve(i.files[0]); i.click(); });
      }
      if (!file) return;
      const buf = await file.arrayBuffer();
      const info = await readInfo(buf);
      if (!info) { setMsg('❌ Đây không phải file sao lưu của app Fen Izakaya.'); return; }
      setPending({ name: file.name, buf, info });
      setConfirmText('');
    } catch (e) { /* người dùng hủy */ }
  };

  const restore = async () => {
    setBusy(true);
    setMsg('Đang khôi phục dữ liệu, vui lòng không đóng trang…');
    try {
      const res = await fetch('/api/backup/import', { method: 'POST', headers: { 'Content-Type': 'application/gzip' }, body: pending.buf });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || 'Lỗi không rõ');
      setMsg(`✅ Đã khôi phục ${Number(j.data.rows).toLocaleString('vi-VN')} dòng (${j.data.tables} bảng) từ bản sao lưu ngày ${new Date(j.data.createdAt).toLocaleString('vi-VN')}. Hãy tải lại trang.`);
      setPending(null);
    } catch (e) {
      setMsg('❌ ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const totalRows = pending ? Object.values(pending.info.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <button onClick={() => { setOpen(true); setMsg(''); }} className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-2 rounded-lg font-bold shadow-lg">💾 Sao lưu / Khôi phục</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-5 space-y-3 text-sm max-h-screen overflow-auto">
            <h3 className="text-lg font-bold">Sao lưu & khôi phục dữ liệu</h3>
            <p className="text-gray-600">Sao lưu toàn bộ dữ liệu của app (tất cả chi nhánh: doanh thu, hóa đơn, tồn kho, mua hàng, công nợ, đơn đặt hàng, định lượng, cài đặt…) thành một file nén trên máy bạn.</p>
            <div className="border rounded p-3 space-y-2">
              <p className="font-semibold">📁 Nơi lưu file sao lưu</p>
              {canPick ? (
                <>
                  <p className="text-gray-600">{dirName ? <>Đang dùng thư mục: <b>{dirName}</b> (file nằm trong thư mục con <b>{SUBDIR}</b>)</> : <>Chưa chọn thư mục. Bấm nút dưới và chọn thư mục trên ổ D, ví dụ <b>D:\App Báo Cáo Fen Izakaya (portable)\data</b>.</>}</p>
                  <button onClick={pickFolder} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 font-bold">{dirName ? 'Chọn thư mục khác' : 'Chọn thư mục trên ổ D'}</button>
                </>
              ) : <p className="text-orange-700">Trình duyệt này không cho chọn thư mục, file sẽ được tải về thư mục Tải xuống. Hãy dùng Chrome hoặc Edge để chọn thư mục trên ổ D.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button disabled={busy} onClick={backup} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">💾 Sao lưu dữ liệu ngay</button>
              <button disabled={busy} onClick={chooseFile} className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 text-white font-bold disabled:opacity-50">♻️ Khôi phục từ file…</button>
              <span className="text-gray-500">{last ? `Lần sao lưu gần nhất: ${last}` : 'Chưa sao lưu trên trình duyệt này'}</span>
            </div>
            {pending && (
              <div className="border-2 border-orange-400 bg-orange-50 rounded p-3 space-y-2">
                <p className="font-bold text-orange-800">⚠ Khôi phục sẽ THAY THẾ TOÀN BỘ dữ liệu hiện tại bằng nội dung file.</p>
                <p>File: <b>{pending.name}</b><br />Tạo lúc: <b>{new Date(pending.info.createdAt).toLocaleString('vi-VN')}</b> · {Object.keys(pending.info.counts).length} bảng · {totalRows.toLocaleString('vi-VN')} dòng</p>
                <p className="text-gray-700">Nên bấm "Sao lưu dữ liệu ngay" trước để giữ lại dữ liệu hiện tại. Gõ <b>KHOI PHUC</b> để xác nhận:</p>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="border rounded px-2 py-1 w-full" placeholder="KHOI PHUC" />
                <div className="flex gap-2">
                  <button disabled={busy || confirmText.trim().toUpperCase() !== 'KHOI PHUC'} onClick={restore} className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-40">Khôi phục dữ liệu</button>
                  <button disabled={busy} onClick={() => setPending(null)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
                </div>
              </div>
            )}
            {msg && <p className={`font-semibold ${msg.startsWith('❌') ? 'text-red-700' : 'text-green-700'}`}>{msg}</p>}
            <div className="flex justify-end"><button onClick={() => setOpen(false)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button></div>
          </div>
        </div>
      )}
    </>
  );
}
