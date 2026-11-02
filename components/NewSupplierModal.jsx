import React, { useState, useEffect } from 'react';

// Tạo nhà cung cấp mới (chưa có trong CUKCUK). Khi CUKCUK có NCC cùng tên, lần đồng bộ sau app tự ghép theo tên, không tạo trùng.
export default function NewSupplierModal({ open, branchId, onClose, onCreated }) {
  const [v, setV] = useState({ name: '', code: '', phone: '', address: '', tax: '', contact: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setV({ name: '', code: '', phone: '', address: '', tax: '', contact: '', category: '' }); setError(''); } }, [open]);
  if (!open) return null;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!v.name.trim()) { setError('Nhập tên nhà cung cấp'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/suppliers/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId, ...v }) });
      const j = await res.json();
      if (!j.success) { setError(j.message); return; }
      onCreated(j.data, j.message);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const lbl = 'block text-sm font-semibold mb-1';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4" style={{ zIndex: 95 }}>
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3 text-sm">
        <h3 className="text-lg font-bold text-gray-800">➕ Tạo nhà cung cấp mới</h3>
        <div>
          <label className={lbl}>Tên nhà cung cấp *</label>
          <input value={v.name} onChange={set('name')} className="w-full border p-2 rounded" placeholder="VD: Công ty TNHH Thực phẩm ABC" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>Mã NCC (để trống = tự sinh)</label><input value={v.code} onChange={set('code')} className="w-full border p-2 rounded font-mono" placeholder="VD: NCCM0001" /></div>
          <div><label className={lbl}>Điện thoại</label><input value={v.phone} onChange={set('phone')} className="w-full border p-2 rounded" /></div>
          <div className="col-span-2"><label className={lbl}>Địa chỉ</label><input value={v.address} onChange={set('address')} className="w-full border p-2 rounded" /></div>
          <div><label className={lbl}>Mã số thuế</label><input value={v.tax} onChange={set('tax')} className="w-full border p-2 rounded" /></div>
          <div><label className={lbl}>Người liên hệ</label><input value={v.contact} onChange={set('contact')} className="w-full border p-2 rounded" /></div>
          <div className="col-span-2"><label className={lbl}>Nhóm NCC</label><input value={v.category} onChange={set('category')} className="w-full border p-2 rounded" placeholder="VD: Thịt, Hải sản, Rau củ…" /></div>
        </div>
        <p className="text-xs text-gray-500">NCC tạo ở đây được giữ nguyên khi đồng bộ CUKCUK. Nếu CUKCUK có NCC cùng tên (khác mã), app tự ghép theo tên và đổi sang mã của CUKCUK, các đơn đặt mua cũ vẫn giữ.</p>
        {error && <p className="text-red-700">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{saving ? 'Đang lưu…' : 'Tạo NCC'}</button>
        </div>
      </form>
    </div>
  );
}
