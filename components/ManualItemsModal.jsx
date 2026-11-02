import React, { useState, useEffect, useCallback } from 'react';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const GROUP = { food: '🍽️ Đồ ăn', drink: '🍺 Đồ uống', ccdc: '🧰 CCDC' };

// Quản lý NVL và NCC do người dùng tạo trong app: sửa, xóa. (Dữ liệu lấy từ CUKCUK không sửa ở đây.)
export default function ManualItemsModal({ open, branchId, onClose, onChanged }) {
  const [tab, setTab] = useState('items');
  const [items, setItems] = useState([]);
  const [sups, setSups] = useState([]);
  const [edit, setEdit] = useState(null); // { kind, key, ...fields }
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/materials/manual/${branchId}`).then((r) => r.json()),
        fetch(`/api/suppliers/${branchId}`).then((r) => r.json())
      ]);
      if (a.success) setItems(a.data);
      if (b.success) setSups(b.data.filter((s) => s.is_manual));
    } finally { setLoading(false); }
  }, [branchId]);
  useEffect(() => { if (open) { setEdit(null); setMsg(''); load(); } }, [open, load]);
  if (!open) return null;

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 4000); };
  const saveItem = async () => {
    const e = edit;
    const j = await (await fetch(`/api/materials/manual/${branchId}/${encodeURIComponent(e.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: e.name, unit: e.unit, price: e.price, group: e.group, cycle: e.cycle }) })).json();
    flash(j.success ? '✅ ' + j.message : '❌ ' + j.message);
    if (j.success) { setEdit(null); await load(); if (onChanged) onChanged('item'); }
  };
  const delItem = async (r) => {
    if (!window.confirm(`Xóa mã hàng ${r.material_id} - ${r.material_name}?`)) return;
    const j = await (await fetch(`/api/materials/manual/${branchId}/${encodeURIComponent(r.material_id)}`, { method: 'DELETE' })).json();
    flash(j.success ? '✅ ' + j.message : '❌ ' + j.message);
    if (j.success) { await load(); if (onChanged) onChanged('item'); }
  };
  const saveSup = async () => {
    const e = edit;
    const j = await (await fetch(`/api/suppliers/manual/${branchId}/${encodeURIComponent(e.code)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: e.name, phone: e.phone, address: e.address, tax: e.tax, contact: e.contact, category: e.category }) })).json();
    flash(j.success ? '✅ ' + j.message : '❌ ' + j.message);
    if (j.success) { setEdit(null); await load(); if (onChanged) onChanged('supplier'); }
  };
  const delSup = async (r) => {
    if (!window.confirm(`Xóa nhà cung cấp ${r.name} (${r.code})?`)) return;
    const j = await (await fetch(`/api/suppliers/manual/${branchId}/${encodeURIComponent(r.code)}`, { method: 'DELETE' })).json();
    flash(j.success ? '✅ ' + j.message : '❌ ' + j.message);
    if (j.success) { await load(); if (onChanged) onChanged('supplier'); }
  };

  const inp = 'border rounded px-1.5 py-1 w-full';
  const th = 'border px-2 py-1 bg-gray-100 text-left';
  const td = 'border px-2 py-1';
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4" style={{ zIndex: 92 }}>
      <div className="bg-white rounded-lg shadow-xl w-full p-5 space-y-3 text-xs max-h-screen overflow-auto" style={{ maxWidth: 980 }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800">🗂 Mã hàng và NCC do bạn tạo trong app</h3>
          <button onClick={onClose} className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setTab('items'); setEdit(null); }} className={`px-3 py-1.5 rounded font-bold border ${tab === 'items' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Mã hàng / NVL ({items.length})</button>
          <button onClick={() => { setTab('sups'); setEdit(null); }} className={`px-3 py-1.5 rounded font-bold border ${tab === 'sups' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}>Nhà cung cấp ({sups.length})</button>
          {msg && <span className="font-bold self-center">{msg}</span>}
        </div>
        <p className="text-gray-500">Chỉ hiện những mục bạn tự tạo. Mục đã ghép với hàng/NCC của CUKCUK (hoặc đã có dữ liệu mua hàng) sẽ không xóa được, nhưng vẫn sửa được.</p>
        {loading && <p className="text-gray-500">Đang tải…</p>}

        {tab === 'items' && (
          items.length === 0 ? <p className="bg-gray-50 border rounded p-4 text-gray-600">Chưa có mã hàng nào do bạn tạo.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>STT</th><th className={th}>Mã</th><th className={th}>Tên hàng</th><th className={th}>Nhóm</th><th className={th}>ĐVT</th><th className={th}>Giá mua (đ)</th><th className={th}>Ghép CUKCUK</th><th className={th}></th></tr></thead>
              <tbody>
                {items.map((r, i) => (edit && edit.kind === 'item' && edit.id === r.material_id ? (
                  <tr key={r.material_id} className="bg-yellow-50">
                    <td className={td}>{i + 1}</td><td className={td + ' font-mono'}>{r.material_id}</td>
                    <td className={td}><input className={inp} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                    <td className={td}>
                      <select className={inp} value={edit.group} onChange={(e) => setEdit({ ...edit, group: e.target.value })}><option value="food">🍽️ Đồ ăn</option><option value="drink">🍺 Đồ uống</option><option value="ccdc">🧰 CCDC</option></select>
                      {edit.group === 'food' && <select className={inp + ' mt-1'} value={edit.cycle} onChange={(e) => setEdit({ ...edit, cycle: e.target.value })}><option value="FRESH_3DAYS">Tươi (3 ngày)</option><option value="WEEKLY_7DAYS">Khô (7 ngày)</option></select>}
                    </td>
                    <td className={td} style={{ width: 80 }}><input className={inp} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></td>
                    <td className={td} style={{ width: 110 }}><input type="number" className={inp} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></td>
                    <td className={td}>{r.cukcuk_codes || '—'}</td>
                    <td className={td + ' whitespace-nowrap'}><button onClick={saveItem} className="px-2 py-1 rounded bg-green-600 text-white font-bold mr-1">Lưu</button><button onClick={() => setEdit(null)} className="px-2 py-1 rounded bg-gray-200 font-bold">Hủy</button></td>
                  </tr>
                ) : (
                  <tr key={r.material_id}>
                    <td className={td}>{i + 1}</td><td className={td + ' font-mono'}>{r.material_id}</td><td className={td + ' font-medium'}>{r.material_name}</td>
                    <td className={td}>{GROUP[r.item_group] || r.sub_group}{r.item_group === 'food' ? ` · ${r.purchase_cycle === 'FRESH_3DAYS' ? 'tươi' : 'khô'}` : ''}</td>
                    <td className={td}>{r.unit_purchase}</td><td className={td + ' text-right'}>{money(r.unit_cost)}</td><td className={td}>{r.cukcuk_codes || '—'}</td>
                    <td className={td + ' whitespace-nowrap'}>
                      <button onClick={() => setEdit({ kind: 'item', id: r.material_id, name: r.material_name, unit: r.unit_purchase, price: Number(r.unit_cost) || 0, group: r.item_group, cycle: r.purchase_cycle })} className="px-2 py-1 rounded border font-bold mr-1">✏️ Sửa</button>
                      <button onClick={() => delItem(r)} className="px-2 py-1 rounded border font-bold text-red-600">🗑 Xóa</button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          )
        )}

        {tab === 'sups' && (
          sups.length === 0 ? <p className="bg-gray-50 border rounded p-4 text-gray-600">Chưa có nhà cung cấp nào do bạn tạo.</p> : (
            <table className="w-full border-collapse">
              <thead><tr><th className={th}>STT</th><th className={th}>Mã</th><th className={th}>Tên NCC</th><th className={th}>Điện thoại</th><th className={th}>Địa chỉ</th><th className={th}>MST</th><th className={th}>Nhóm</th><th className={th}></th></tr></thead>
              <tbody>
                {sups.map((r, i) => (edit && edit.kind === 'sup' && edit.code === r.code ? (
                  <tr key={r.code} className="bg-yellow-50">
                    <td className={td}>{i + 1}</td><td className={td + ' font-mono'}>{r.code}</td>
                    <td className={td}><input className={inp} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
                    <td className={td}><input className={inp} value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></td>
                    <td className={td}><input className={inp} value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></td>
                    <td className={td}><input className={inp} value={edit.tax} onChange={(e) => setEdit({ ...edit, tax: e.target.value })} /></td>
                    <td className={td}><input className={inp} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></td>
                    <td className={td + ' whitespace-nowrap'}><button onClick={saveSup} className="px-2 py-1 rounded bg-green-600 text-white font-bold mr-1">Lưu</button><button onClick={() => setEdit(null)} className="px-2 py-1 rounded bg-gray-200 font-bold">Hủy</button></td>
                  </tr>
                ) : (
                  <tr key={r.code}>
                    <td className={td}>{i + 1}</td><td className={td + ' font-mono'}>{r.code}</td><td className={td + ' font-medium'}>{r.name}</td><td className={td}>{r.phone}</td><td className={td}>{r.address}</td><td className={td}>{r.tax_code}</td><td className={td}>{r.category}</td>
                    <td className={td + ' whitespace-nowrap'}>
                      <button onClick={() => setEdit({ kind: 'sup', code: r.code, name: r.name, phone: r.phone || '', address: r.address || '', tax: r.tax_code || '', contact: r.contact || '', category: r.category || '' })} className="px-2 py-1 rounded border font-bold mr-1">✏️ Sửa</button>
                      <button onClick={() => delSup(r)} className="px-2 py-1 rounded border font-bold text-red-600">🗑 Xóa</button>
                    </td>
                  </tr>
                )))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
