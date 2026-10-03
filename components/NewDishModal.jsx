import React, { useState, useEffect } from 'react';
import SearchSelect from './SearchSelect';
import NewMaterialModal from './NewMaterialModal';

// cukcukItem: { code, name } khi tạo món để ghép với món CUKCUK chưa khớp (có thể null).
export default function NewDishModal({ open, onClose, branch, cukcukItem, onCreated }) {
  const [dishName, setDishName] = useState('');
  const [rows, setRows] = useState([{ materialId: '', qty: '' }]);
  const [materials, setMaterials] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newMatFor, setNewMatFor] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDishName(cukcukItem ? cukcukItem.name : '');
    setRows([{ materialId: '', qty: '' }]);
    setError('');
    fetch('/api/material-list')
      .then((r) => r.json())
      .then((d) => { if (d.success) setMaterials(d.data); })
      .catch(() => {});
  }, [open, cukcukItem]);

  if (!open) return null;

  const options = materials.map((m) => ({
    value: m.material_id,
    label: m.material_name,
    hint: `${m.unit_recipe} · ${m.sub_group || m.category || ''}`
  }));
  const byId = Object.fromEntries(materials.map((m) => [m.material_id, m]));

  const setRow = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const ingredients = rows
      .filter((r) => r.materialId && Number(r.qty) > 0)
      .map((r) => ({ materialId: r.materialId, quantity: Number(r.qty) }));
    if (!dishName.trim()) { setError('Nhập tên món'); return; }
    if (ingredients.length === 0) { setError('Thêm ít nhất 1 NVL có số lượng > 0'); return; }
    try {
      setSaving(true);
      const res = await fetch('/api/dishes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: branch, dishName, cukcukCode: cukcukItem ? cukcukItem.code : null, ingredients })
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
    <div className="fixed inset-0 z-40 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-bold text-gray-800">➕ Tạo món mới và định lượng</h3>
        {cukcukItem && <p className="text-sm text-purple-800 bg-purple-50 rounded p-2">Món này sẽ được ghép với món CUKCUK "<b>{cukcukItem.name}</b>" ({cukcukItem.code}).</p>}
        <div>
          <label className="block text-sm font-semibold mb-1">Tên món *</label>
          <input value={dishName} onChange={(e) => setDishName(e.target.value)} className="w-full border p-2 rounded" />
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Nguyên vật liệu cho 1 phần</p>
          <div className="space-y-2">
            {rows.map((r, i) => {
              const m = byId[r.materialId];
              return (
                <div key={i} className="flex items-center gap-2">
                  <SearchSelect
                    className="flex-1"
                    options={options}
                    value={r.materialId}
                    onChange={(v) => setRow(i, { materialId: v })}
                    placeholder="Chọn nguyên vật liệu…"
                    footer={(close) => (
                      <button type="button" onClick={() => { close(); setNewMatFor(i); }} className="w-full text-left text-sm font-bold text-green-700 hover:bg-green-50 p-2 rounded">
                        ＋ Tạo nguyên vật liệu mới
                      </button>
                    )}
                  />
                  <input
                    type="number" min="0" step="any" value={r.qty}
                    onChange={(e) => setRow(i, { qty: e.target.value })}
                    className="w-28 border p-2 rounded text-right" placeholder="Số lượng"
                  />
                  <span className="w-10 text-sm text-gray-600">{m ? m.unit_recipe : ''}</span>
                  <button type="button" onClick={() => setRows((rs) => rs.length > 1 ? rs.filter((_, k) => k !== i) : rs)} className="text-red-600 font-bold px-2" title="Xóa dòng">✕</button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setRows((rs) => [...rs, { materialId: '', qty: '' }])} className="mt-2 text-sm font-bold text-blue-700 hover:underline">＋ Thêm nguyên vật liệu</button>
        </div>
        {error && <p className="text-sm text-red-700">❌ {error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{saving ? 'Đang lưu…' : 'Tạo món'}</button>
        </div>
      </form>

      <NewMaterialModal
        open={newMatFor !== null}
        onClose={() => setNewMatFor(null)}
        onCreated={(mat) => {
          setMaterials((ms) => [...ms, mat]);
          if (newMatFor !== null) setRow(newMatFor, { materialId: mat.material_id });
          setNewMatFor(null);
        }}
      />
    </div>
  );
}
