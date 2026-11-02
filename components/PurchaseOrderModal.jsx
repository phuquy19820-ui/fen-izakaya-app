import React, { useState, useEffect, useMemo } from 'react';
import SearchSelect from './SearchSelect';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Cửa sổ kiểm tra và xuất đơn đặt hàng gửi NCC.
// lines: [{ materialId?, code, name, group, unit, qty, price }] — các NVL đã chọn đặt mua, hiện thành bảng để kiểm tra / sửa / bỏ bớt.
// suppliers: danh sách nhà cung cấp; materialSuppliers: { [material_id]: [{ supplier_code, price, last_date }] }
// onSavePlan(edits): lưu kế hoạch mua hàng (kèm các số lượng/đơn giá đã sửa trong cửa sổ này); trả về true nếu lưu được.
export default function PurchaseOrderModal({ open, onClose, branch, lines, cycleLabel, onCompanySaved, suppliers = [], materialSuppliers = null, onOrderCreated, onNewSupplier, onSavePlan, candidates = [] }) {
  const [buyer, setBuyer] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierText, setSupplierText] = useState('');
  const [delivery, setDelivery] = useState('');
  const [note, setNote] = useState('');
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [order, setOrder] = useState(null);
  const [rows, setRows] = useState([]);
  const [onlyBoughtOpt, setOnlyBoughtOpt] = useState(false);

  useEffect(() => {
    if (!open) return;
    let remembered = '';
    try { remembered = localStorage.getItem('fen_buyer_company') || ''; } catch (e) { /* bỏ qua */ }
    setBuyer((branch && branch.buyer_company) || remembered);
    setError(''); setInfo('');
    setOrder(null);
    setRows((lines || []).map((l) => ({ ...l, rowKey: l.materialId || l.code, origQty: l.qty, origPrice: l.price })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const supplier = suppliers.find((s) => s.code === supplierCode) || null;
  const supplierOptions = useMemo(
    () => suppliers.filter((s) => !s.inactive).map((s) => ({ value: s.code, label: s.name, hint: [s.is_manual ? 'mới tạo' : '', s.category, Number(s.item_count) ? `${s.item_count} NVL đã mua` : ''].filter(Boolean).join(' · ') })),
    [suppliers]
  );
  const hitOf = (l) => (supplier && materialSuppliers && l.materialId ? (materialSuppliers[l.materialId] || []).find((s) => s.supplier_code === supplier.code) : null);

  const effLines = useMemo(() => rows.filter((l) => (Number(l.qty) || 0) > 0).map((l) => ({ ...l, qty: Number(l.qty) || 0, price: Number(l.price) || 0 })), [rows]);
  const inRows = useMemo(() => new Set(rows.map((r) => r.rowKey)), [rows]);
  const addable = useMemo(() => candidates.filter((c) => !inRows.has(c.materialId || c.code) && (!onlyBoughtOpt || !supplier || !materialSuppliers || hitOf(c))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, inRows, onlyBoughtOpt, supplierCode, materialSuppliers]);
  const addOptions = useMemo(() => addable.map((c) => ({ value: c.materialId || c.code, label: `${c.name}`, hint: [c.code, c.group, c.unit, (Number(c.qty) || 0) > 0 ? `đề xuất ${num(c.qty)}` : ''].filter(Boolean).join(' · ') })), [addable]);
  const addRow = (key) => {
    const c = candidates.find((x) => (x.materialId || x.code) === key);
    if (!c || inRows.has(key)) return;
    setRows((rs) => [...rs, { ...c, rowKey: key, origQty: c.qty, origPrice: c.price }]);
  };
  const addBoughtBySupplier = () => {
    const add = candidates.filter((c) => !inRows.has(c.materialId || c.code) && hitOf(c));
    setRows((rs) => [...rs, ...add.map((c) => ({ ...c, rowKey: c.materialId || c.code, origQty: c.qty, origPrice: c.price }))]);
  };
  const boughtAddable = supplier && materialSuppliers ? candidates.filter((c) => !inRows.has(c.materialId || c.code) && hitOf(c)).length : 0;
  const notBought = supplier && materialSuppliers ? rows.filter((l) => !hitOf(l)).length : 0;

  if (!open) return null;

  const total = effLines.reduce((s, l) => s + l.qty * l.price, 0);
  const supplierName = supplier ? supplier.name : supplierText.trim();
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.rowKey === key ? { ...r, ...patch } : r)));

  const rememberCompany = async () => {
    const name = buyer.trim();
    try { localStorage.setItem('fen_buyer_company', name); } catch (e) { /* bỏ qua */ }
    if (branch && name !== (branch.buyer_company || '')) {
      await fetch(`/api/branches/${branch.branch_id}/buyer`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ buyerCompany: name }) });
      if (onCompanySaved) onCompanySaved(name);
    }
  };

  const validate = () => {
    if (!buyer.trim()) { setError('Nhập tên công ty mua (chỉ cần nhập một lần, app sẽ nhớ).'); return false; }
    if (!supplierName) { setError('Chọn nhà cung cấp (hoặc nhập tên) để gửi đơn.'); return false; }
    if (effLines.length === 0) { setError('Chưa có NVL nào có số lượng đặt > 0 trong bảng.'); return false; }
    setError('');
    return true;
  };

  const payload = (orderNo) => ({
    orderNo, buyerCompany: buyer.trim(), branchName: branch ? branch.branch_name : '', supplier: supplierName,
    supplierPhone: supplier ? supplier.phone : '', supplierAddress: supplier ? supplier.address : '',
    deliveryDate: delivery, note, cycleLabel, showPrice,
    lines: effLines.map((l) => ({ code: l.code, name: l.name, group: l.group, unit: l.unit, qty: l.qty, price: l.price }))
  });

  // Lưu kế hoạch mua hàng (gồm cả số lượng / đơn giá sửa trong cửa sổ này)
  const saveToPlan = async () => {
    if (!onSavePlan) return true;
    const edits = rows.filter((l) => l.materialId).map((l) => ({ materialId: l.materialId, qty: Number(l.qty) || 0, price: Number(l.price) || 0, qtyChanged: (Number(l.qty) || 0) !== (Number(l.origQty) || 0), priceChanged: (Number(l.price) || 0) !== (Number(l.origPrice) || 0) }));
    const ok = await onSavePlan(edits);
    if (ok) setRows((rs) => rs.map((r) => ({ ...r, origQty: r.qty, origPrice: r.price })));
    return ok;
  };
  const savePlanClick = async () => {
    try { setBusy(true); setError(''); const ok = await saveToPlan(); setInfo(ok ? '✅ Đã lưu kế hoạch mua hàng.' : ''); if (!ok) setError('Không lưu được kế hoạch. Hãy bấm "Tạo Kế Hoạch" trước.'); } finally { setBusy(false); }
  };

  // Cùng nội dung xuất lần nữa (Excel rồi In) thì dùng lại số đơn, nội dung đổi thì cấp số mới
  const signature = JSON.stringify([effLines.map((l) => [l.name, l.qty, l.price]), supplierCode, supplierName, buyer.trim(), delivery, note, showPrice]);
  const ensureOrder = async () => {
    if (order && order.signature === signature) return order.orderNo;
    const res = await fetch('/api/purchase-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: branch.branch_id, supplierCode, supplierName, ...payload(null) })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Không cấp được số đơn');
    setOrder({ orderNo: json.data.orderNo, signature });
    if (onOrderCreated) onOrderCreated(json.data);
    return json.data.orderNo;
  };

  const downloadExcel = async () => {
    if (!validate()) return;
    try {
      setBusy(true); setInfo('');
      await rememberCompany();
      if (onSavePlan) await saveToPlan(); // lưu kế hoạch cùng lúc để đơn và kế hoạch luôn khớp nhau
      const orderNo = await ensureOrder();
      const res = await fetch('/api/purchase-plans/export-xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(orderNo)) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || 'Xuất file thất bại'); }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-mua-hang-${orderNo.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setInfo(`✅ Đã xuất file Excel đơn ${orderNo}${onSavePlan ? ' và lưu kế hoạch mua hàng' : ''}.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const printOrder = async () => {
    if (!validate()) return;
    let orderNo;
    try {
      setBusy(true);
      await rememberCompany();
      orderNo = await ensureOrder();
    } catch (e) {
      setError(e.message);
      return;
    } finally {
      setBusy(false);
    }
    const groups = {};
    effLines.forEach((l) => { (groups[l.group] = groups[l.group] || []).push(l); });
    let stt = 0;
    const body = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'vi')).map((g) => {
      const rows = groups[g].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((l) => {
        stt++;
        return `<tr><td class="c">${stt}</td><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td class="c">${esc(l.unit)}</td><td class="r">${l.qty.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</td>${showPrice ? `<td class="r">${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td>` : ''}</tr>`;
      }).join('');
      return `<tr class="g"><td colspan="${showPrice ? 7 : 5}">${esc(g.toUpperCase())}</td></tr>${rows}`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Đơn mua hàng ${esc(orderNo)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{text-align:center;font-size:18px;margin:0 0 4px}
.sub{text-align:center;margin-bottom:12px}.no{text-align:center;font-weight:bold;font-size:14px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:3px 6px}
th{background:#0073C5;color:#fff}.c{text-align:center}.r{text-align:right}.g td{background:#e8f1fa;font-weight:bold}
.sig{display:flex;justify-content:space-between;margin-top:40px;text-align:center;font-weight:bold}@media print{body{margin:8mm}}</style></head><body>
<h1>ĐƠN ĐẶT MUA NGUYÊN VẬT LIỆU</h1><div class="no">Số: ${esc(orderNo)}</div><div class="sub">${esc(cycleLabel || '')}</div>
<div><b>Công ty mua:</b> ${esc(buyer.trim())}</div>
${branch ? `<div><b>Chi nhánh:</b> ${esc(branch.branch_name)}</div>` : ''}
${supplierName ? `<div><b>Nhà cung cấp:</b> ${esc(supplierName)}</div>` : ''}
${supplier && supplier.phone ? `<div><b>Điện thoại NCC:</b> ${esc(supplier.phone)}</div>` : ''}
${supplier && supplier.address ? `<div><b>Địa chỉ NCC:</b> ${esc(supplier.address)}</div>` : ''}
<div><b>Ngày lập:</b> ${new Date().toLocaleDateString('vi-VN')}</div>
${delivery ? `<div><b>Ngày giao hàng yêu cầu:</b> ${esc(delivery.split('-').reverse().join('/'))}</div>` : ''}
${note ? `<div><b>Ghi chú:</b> ${esc(note)}</div>` : ''}
<table><thead><tr><th>STT</th><th>Mã NVL</th><th>Tên nguyên vật liệu</th><th>ĐVT</th><th>Số lượng</th>${showPrice ? '<th>Đơn giá (đ)</th><th>Thành tiền (đ)</th>' : ''}</tr></thead><tbody>${body}</tbody>
${showPrice ? `<tfoot><tr><td colspan="6" class="r"><b>TỔNG CỘNG:</b></td><td class="r"><b>${money(total)}</b></td></tr></tfoot>` : ''}</table>
<div class="sig"><div>Người lập</div><div>Người duyệt</div><div>Nhà cung cấp xác nhận</div></div>
<script>window.onload=function(){window.print()}<\/script></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { setError('Trình duyệt chặn cửa sổ in. Hãy cho phép cửa sổ bật lên rồi thử lại.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };


  const th = 'border px-2 py-1 bg-gray-100 text-left font-bold';
  const td = 'border px-2 py-1';
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-3" style={{ zIndex: 85 }}>
      <div className="bg-white rounded-lg shadow-xl w-full p-5 space-y-3 text-xs max-h-screen overflow-auto" style={{ maxWidth: 1180 }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-800">📤 Kiểm tra đơn đặt hàng gửi nhà cung cấp</h3>
            <p className="text-gray-600">Bước 1: chọn nhà cung cấp · Bước 2: kiểm tra bảng NVL (sửa số lượng, đơn giá hoặc bỏ bớt) · Bước 3: <b>Lưu kế hoạch mua hàng</b> · Bước 4: <b>Xuất Excel</b> gửi NCC.</p>
          </div>
          {order && <span className="bg-green-50 border border-green-300 text-green-800 rounded px-2 py-1 font-bold whitespace-nowrap">Số đơn: {order.orderNo}</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block font-semibold mb-1">Nhà cung cấp *</label>
            {suppliers.length > 0 ? (
              <div className="flex gap-2">
                <SearchSelect className="flex-1" options={supplierOptions} value={supplierCode} onChange={setSupplierCode} placeholder="🔍 Chọn nhà cung cấp…" />
                {supplierCode && <button type="button" onClick={() => setSupplierCode('')} className="px-2 border rounded text-red-600 font-bold" title="Bỏ chọn">✕</button>}
                {onNewSupplier && <button type="button" onClick={onNewSupplier} className="px-2 border rounded text-green-700 font-bold whitespace-nowrap">➕ NCC mới</button>}
              </div>
            ) : (
              <div className="flex gap-2">
                <p className="text-gray-500 flex-1">Chưa có danh sách nhà cung cấp.</p>
                {onNewSupplier && <button type="button" onClick={onNewSupplier} className="px-2 border rounded text-green-700 font-bold whitespace-nowrap">➕ NCC mới</button>}
              </div>
            )}
            {!supplier && <input value={supplierText} onChange={(e) => setSupplierText(e.target.value)} className="w-full border p-2 rounded mt-2" placeholder="Hoặc nhập tên nhà cung cấp…" />}
            {supplier && <div className="mt-1 text-gray-600">{[supplier.category, supplier.phone, supplier.address].filter(Boolean).join(' · ') || 'Chưa có điện thoại/địa chỉ cho NCC này.'}</div>}
          </div>
          <div>
            <label className="block font-semibold mb-1">Tên công ty mua *</label>
            <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Công ty TNHH ..." />
          </div>
          <div>
            <label className="block font-semibold mb-1">Ngày giao yêu cầu</label>
            <input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div className="md:col-span-3">
            <label className="block font-semibold mb-1">Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Giao trước 8h sáng" />
          </div>
          <label className="flex items-end gap-2 cursor-pointer pb-2"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Hiện đơn giá, thành tiền trong đơn</label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm">Danh sách NVL đặt mua ({rows.length} dòng · {effLines.length} dòng có số lượng{showPrice ? ` · tổng ${money(total)} đ` : ''})</b>
          {supplier && materialSuppliers && notBought > 0 && (
            <button onClick={() => setRows((rs) => rs.filter((l) => hitOf(l)))} className="px-2 py-1 rounded border font-bold text-orange-700">Bỏ {notBought} NVL NCC này chưa từng mua</button>
          )}
          {supplier && materialSuppliers && (
            <button onClick={() => setRows((rs) => rs.map((l) => { const h = hitOf(l); return h && h.price > 0 ? { ...l, price: h.price } : l; }))} className="px-2 py-1 rounded border font-bold text-blue-700">Dùng đơn giá mua gần nhất của NCC này</button>
          )}
          <button onClick={() => setRows((rs) => rs.filter((l) => (Number(l.qty) || 0) > 0))} className="px-2 py-1 rounded border font-bold">Bỏ các dòng chưa có số lượng</button>
        </div>

        <div className="flex flex-wrap items-end gap-2 bg-blue-50 border border-blue-200 rounded p-2">
          <div style={{ minWidth: 380, flex: 1 }}>
            <label className="block font-semibold mb-1">➕ Thêm NVL vào đơn (gõ tên hoặc mã để tìm, {addable.length} NVL có thể thêm)</label>
            <SearchSelect className="w-full" options={addOptions} value="" onChange={(v) => v && addRow(v)} placeholder="🔍 Tìm NVL cần đặt mua…" />
          </div>
          {supplier && materialSuppliers && (
            <button onClick={addBoughtBySupplier} disabled={boughtAddable === 0} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">Thêm {boughtAddable} NVL NCC này từng bán</button>
          )}
          {supplier && materialSuppliers && <label className="flex items-center gap-1 pb-2 cursor-pointer"><input type="checkbox" checked={onlyBoughtOpt} onChange={(e) => setOnlyBoughtOpt(e.target.checked)} /> Ô tìm chỉ hiện NVL NCC này từng bán</label>}
        </div>

        <div className="border rounded overflow-auto" style={{ maxHeight: '42vh' }}>
          <table className="w-full border-collapse">
            <thead style={{ position: 'sticky', top: 0 }}>
              <tr><th className={th} style={{ width: 40 }}>STT</th><th className={th} style={{ width: 110 }}>Mã NVL</th><th className={th}>Tên nguyên vật liệu</th><th className={th} style={{ width: 120 }}>Nhóm</th><th className={th} style={{ width: 56 }}>ĐVT</th>
                <th className={th} style={{ width: 96 }}>SL đặt</th><th className={th} style={{ width: 110 }}>Đơn giá (đ)</th><th className={th} style={{ width: 110 }}>Thành tiền (đ)</th><th className={th} style={{ width: 170 }}>NCC này đã từng mua?</th><th className={th} style={{ width: 34 }}></th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-gray-500">Chưa có NVL nào trong đơn. Dùng ô "➕ Thêm NVL vào đơn" ở trên để tìm và thêm NVL cần đặt (hoặc bấm "Thêm … NVL NCC này từng bán"), rồi nhập số lượng.</td></tr>}
              {rows.map((l, i) => {
                const h = hitOf(l);
                const q = Number(l.qty) || 0;
                return (
                  <tr key={l.rowKey} style={q <= 0 ? { background: '#fff7ed' } : undefined}>
                    <td className={td + ' text-center text-gray-500'}>{i + 1}</td>
                    <td className={td + ' font-mono text-blue-700'}>{l.code}</td>
                    <td className={td + ' font-medium'}>{l.name}</td>
                    <td className={td}>{l.group}</td>
                    <td className={td + ' text-center'}>{l.unit}</td>
                    <td className={td}><input type="number" step="any" min="0" value={l.qty} onChange={(e) => setRow(l.rowKey, { qty: e.target.value })} className="w-full text-right font-bold border rounded bg-green-50" style={{ height: 24 }} /></td>
                    <td className={td}><input type="number" step="any" min="0" value={l.price} onChange={(e) => setRow(l.rowKey, { price: e.target.value })} className="w-full text-right border rounded" style={{ height: 24 }} /></td>
                    <td className={td + ' text-right font-bold'}>{money(q * (Number(l.price) || 0))}</td>
                    <td className={td} style={{ color: h ? '#16a34a' : '#c2410c' }}>{!supplier ? '—' : !materialSuppliers ? '—' : h ? `✓ Từng mua${h.price ? ' · giá ' + money(h.price) : ''}` : '⚠ Chưa từng mua NCC này'}</td>
                    <td className={td + ' text-center'}><button onClick={() => setRows((rs) => rs.filter((r) => r.rowKey !== l.rowKey))} className="text-red-600 font-bold" title="Bỏ NVL này khỏi đơn">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
            {showPrice && <tfoot><tr className="bg-gray-100 font-bold"><td className={td + ' text-right'} colSpan={7}>TỔNG CỘNG ({effLines.length} mặt hàng):</td><td className={td + ' text-right'}>{money(total)}</td><td className={td} colSpan={2}></td></tr></tfoot>}
          </table>
        </div>

        <p className="text-gray-500">Số đơn dạng 001/{String(new Date().getMonth() + 1).padStart(2, '0')}/{new Date().getFullYear()} (về 001 khi sang tháng mới), chỉ cấp khi bạn xuất Excel hoặc in. Bấm "Xuất Excel" cũng tự lưu kế hoạch để đơn và kế hoạch khớp nhau. Dòng chưa có số lượng sẽ không đưa vào đơn.</p>
        {error && <p className="text-red-700 font-bold">❌ {error}</p>}
        {info && <p className="text-green-700 font-bold">{info}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button>
          <button onClick={printOrder} disabled={busy} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-800 text-white font-bold disabled:opacity-50">🖨 In / Lưu PDF</button>
          {onSavePlan && <button onClick={savePlanClick} disabled={busy} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50">💾 Lưu kế hoạch mua hàng</button>}
          <button onClick={downloadExcel} disabled={busy} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{busy ? 'Đang xử lý…' : '⬇ Xuất Excel đơn hàng gửi NCC'}</button>
        </div>
      </div>
    </div>
  );
}
