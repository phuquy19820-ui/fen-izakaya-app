import React, { useState, useEffect } from 'react';

const UNITS = ['kg', 'gr', 'lít', 'ml', 'gói', 'hộp', 'chai', 'lon', 'thùng', 'bao', 'can', 'cái', 'con', 'quả', 'bó', 'túi', 'cuộn', 'bộ'];

// Tạo mã hàng mới để lập kế hoạch mua (đồ ăn / đồ uống / CCDC). Mã tự sinh nếu để trống.
// Khi CUKCUK có hàng cùng tên (khác mã), lần đồng bộ sau app tự ghép theo tên.
export default function NewPurchaseItemModal({ open, branchId, onClose, onCreated }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [group, setGroup] = useState('food');
  const [cycle, setCycle] = useState('FRESH_3DAYS');
  const [unit, setUnit] = useState('kg');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setCode(''); setName(''); setGroup('food'); setCycle('FRESH_3DAYS'); setUnit('kg'); setPrice(''); setError(''); } }, [open]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Nhập tên hàng'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/materials/create-purchase-item', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId, code, name, group, cycle: group === 'food' ? cycle : 'WEEKLY_7DAYS', unit, price: Number(price) || 0 })
      });
      const j = await res.json();
      if (!j.success) { setError(j.message); return; }
      onCreated(j.data, j.message);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  const lbl = 'block text-sm font-semibold mb-1';
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4" style={{ zIndex: 90 }}>
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3 text-sm">
        <h3 className="text-lg font-bold text-gray-800">➕ Tạo mã hàng mới để mua</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={lbl}>Tên hàng / NVL / CCDC *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Thịt ba chỉ heo" autoFocus />
          </div>
          <div>
            <label className={lbl}>Mã hàng (để trống = tự sinh)</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border p-2 rounded font-mono" placeholder="VD: MH00001" />
          </div>
          <div>
            <label className={lbl}>Nhóm</label>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="w-full border p-2 rounded">
              <option value="food">🍽️ Đồ ăn (NVL)</option><option value="drink">🍺 Đồ uống</option><option value="ccdc">🧰 CCDC</option>
            </select>
          </div>
          {group === 'food' && (
            <div className="col-span-2">
              <label className={lbl}>Chu kỳ mua</label>
              <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="w-full border p-2 rounded">
                <option value="FRESH_3DAYS">🔴 Hàng tươi (mua 3 ngày)</option><option value="WEEKLY_7DAYS">🔵 Hàng khô (mua 7 ngày)</option>
              </select>
            </div>
          )}
          <div>
            <label className={lbl}>Đơn vị mua</label>
            <input list="pi-units" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full border p-2 rounded" />
            <datalist id="pi-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <div>
            <label className={lbl}>Giá mua / {unit || 'đơn vị'} (đ)</label>
            <input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: 180000" />
          </div>
        </div>
        <p className="text-xs text-gray-500">Mã mới dùng để lập kế hoạch mua. Nếu CUKCUK có hàng cùng tên nhưng khác mã, app tự ghép theo tên khi đồng bộ, không tạo trùng.</p>
        {error && <p className="text-red-700">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{saving ? 'Đang lưu…' : 'Tạo mã'}</button>
        </div>
      </form>
    </div>
  );
}
