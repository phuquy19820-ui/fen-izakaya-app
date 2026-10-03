import React, { useState, useEffect } from 'react';

const UNITS = ['gr', 'ml', 'cái', 'quả', 'con', 'miếng', 'lá', 'gói', 'chai', 'lon', 'hộp'];

export default function NewMaterialModal({ open, onClose, onCreated, initialName = '' }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('gr');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setName(initialName); setUnit('gr'); setCost(''); setError(''); }
  }, [open, initialName]);

  if (!open) return null;

  const purchaseUnit = unit === 'gr' ? 'kg' : unit === 'ml' ? 'lít' : unit;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Nhập tên nguyên vật liệu'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/materials/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, recipeUnit: unit, unitCost: Number(cost) || 0 })
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      onCreated(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">➕ Tạo nguyên vật liệu mới</h3>
        <div>
          <label className="block text-sm font-semibold mb-1">Tên NVL *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Thịt ba chỉ heo" autoFocus />
          <p className="text-xs text-gray-500 mt-1">Nhóm hàng (thịt heo, gia vị…) và chu kỳ mua 3/7 ngày được tự phân loại theo tên.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">Đơn vị trong định lượng</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full border p-2 rounded">
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Giá mua / {purchaseUnit} (đ)</label>
            <input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: 180000" />
          </div>
        </div>
        {error && <p className="text-sm text-red-700">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{saving ? 'Đang lưu…' : 'Tạo NVL'}</button>
        </div>
      </form>
    </div>
  );
}
