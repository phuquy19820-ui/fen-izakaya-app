import React, { useState, useEffect, useMemo } from 'react';
import SearchSelect from './SearchSelect';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// lines: [{ materialId?, code, name, group, unit, qty, price }]
// suppliers: danh sách nhà cung cấp; materialSuppliers: { [material_id]: [{ supplier_code, price, last_date }] }
export default function PurchaseOrderModal({ open, onClose, branch, lines, cycleLabel, onCompanySaved, suppliers = [], materialSuppliers = null, onOrderCreated }) {
  const [buyer, setBuyer] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierText, setSupplierText] = useState('');
  const [onlySupplier, setOnlySupplier] = useState(true);
  const [useSupplierPrice, setUseSupplierPrice] = useState(false);
  const [delivery, setDelivery] = useState('');
  const [note, setNote] = useState('');
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!open) return;
    let remembered = '';
    try { remembered = localStorage.getItem('fen_buyer_company') || ''; } catch (e) { /* bỏ qua */ }
    setBuyer((branch && branch.buyer_company) || remembered);
    setError('');
    setOrder(null);
  }, [open, branch]);

  const supplier = suppliers.find((s) => s.code === supplierCode) || null;

  const supplierOptions = useMemo(
    () => suppliers
      .filter((s) => !s.inactive)
      .map((s) => ({ value: s.code, label: s.name, hint: [s.category, Number(s.item_count) ? `${s.item_count} NVL đã mua` : ''].filter(Boolean).join(' · ') })),
    [suppliers]
  );

  const effLines = useMemo(() => {
    let out = lines;
    if (supplier && materialSuppliers && onlySupplier) {
      out = out.filter((l) => l.materialId && (materialSuppliers[l.materialId] || []).some((s) => s.supplier_code === supplier.code));
    }
    if (supplier && materialSuppliers && useSupplierPrice) {
      out = out.map((l) => {
        const hit = l.materialId && (materialSuppliers[l.materialId] || []).find((s) => s.supplier_code === supplier.code);
        return hit && hit.price > 0 ? { ...l, price: hit.price } : l;
      });
    }
    return out;
  }, [lines, supplier, materialSuppliers, onlySupplier, useSupplierPrice]);

  if (!open) return null;

  const excluded = lines.length - effLines.length;
  const total = effLines.reduce((s, l) => s + l.qty * l.price, 0);
  const supplierName = supplier ? supplier.name : supplierText.trim();

  const rememberCompany = async () => {
    const name = buyer.trim();
    try { localStorage.setItem('fen_buyer_company', name); } catch (e) { /* bỏ qua */ }
    if (branch && name !== (branch.buyer_company || '')) {
      await fetch(`/api/branches/${branch.branch_id}/buyer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerCompany: name })
      });
      if (onCompanySaved) onCompanySaved(name);
    }
  };

  const validate = () => {
    if (!buyer.trim()) { setError('Nhập tên công ty mua (chỉ cần nhập một lần, app sẽ nhớ).'); return false; }
    if (effLines.length === 0) { setError('Không có NVL nào có số lượng mua > 0 trong danh sách (đang lọc).'); return false; }
    setError('');
    return true;
  };

  const payload = (orderNo) => ({
    orderNo, buyerCompany: buyer.trim(), branchName: branch ? branch.branch_name : '', supplier: supplierName,
    supplierPhone: supplier ? supplier.phone : '', supplierAddress: supplier ? supplier.address : '',
    deliveryDate: delivery, note, cycleLabel, showPrice,
    lines: effLines.map((l) => ({ code: l.code, name: l.name, group: l.group, unit: l.unit, qty: l.qty, price: l.price }))
  });

  // Cùng nội dung xuất lần nữa (Excel rồi In) thì dùng lại số đơn, nội dung đổi thì cấp số mới
  const signature = JSON.stringify([effLines.map((l) => [l.name, l.qty, l.price]), supplierCode, supplierName, buyer.trim(), delivery, note, showPrice]);
  const ensureOrder = async () => {
    if (order && order.signature === signature) return order.orderNo;
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      setBusy(true);
      await rememberCompany();
      const orderNo = await ensureOrder();
      const res = await fetch('/api/purchase-plans/export-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(orderNo))
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Xuất file thất bại');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-mua-hang-${orderNo.replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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

  const hasMap = !!materialSuppliers;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3 text-sm max-h-screen overflow-auto">
        <h3 className="text-lg font-bold text-gray-800">📤 Xuất đơn mua hàng</h3>
        <p className="text-gray-600">
          {effLines.length} mặt hàng{showPrice ? ` · tổng ${money(total)} đ` : ''}
          {excluded > 0 && <span className="text-orange-600"> · {excluded} NVL không thuộc nhà cung cấp này bị loại</span>}
        </p>
        {order && <p className="bg-green-50 border border-green-300 text-green-800 rounded px-2 py-1 font-bold">Số đơn: {order.orderNo}</p>}
        <div>
          <label className="block font-semibold mb-1">Tên công ty mua *</label>
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Công ty TNHH ... " />
          <p className="text-xs text-gray-500 mt-1">Nhập một lần, app nhớ cho chi nhánh {branch ? branch.branch_name : ''} (và gợi ý sẵn cho chi nhánh khác).</p>
        </div>
        <div>
          <label className="block font-semibold mb-1">Nhà cung cấp</label>
          {suppliers.length > 0 ? (
            <div className="flex gap-2">
              <SearchSelect className="flex-1" options={supplierOptions} value={supplierCode} onChange={setSupplierCode} placeholder="🔍 Chọn nhà cung cấp…" />
              {supplierCode && <button type="button" onClick={() => setSupplierCode('')} className="px-2 border rounded text-red-600 font-bold" title="Bỏ chọn">✕</button>}
            </div>
          ) : (
            <p className="text-xs text-gray-500">Chưa có danh sách nhà cung cấp. Bấm "Đồng bộ doanh số từ CUKCUK" để lấy từ CUKCUK, hoặc nhập tên bên dưới.</p>
          )}
          {!supplier && (
            <input value={supplierText} onChange={(e) => setSupplierText(e.target.value)} className="w-full border p-2 rounded mt-2" placeholder="Hoặc nhập tên nhà cung cấp…" />
          )}
          {supplier && (
            <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded p-2 space-y-0.5">
              {supplier.category && <p>Nhóm: {supplier.category}</p>}
              {supplier.phone && <p>Điện thoại: {supplier.phone}</p>}
              {supplier.address && <p>Địa chỉ: {supplier.address}</p>}
              {!supplier.phone && !supplier.address && <p>CUKCUK chưa có điện thoại/địa chỉ cho nhà cung cấp này.</p>}
            </div>
          )}
          {supplier && hasMap && (
            <div className="mt-2 space-y-1">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={onlySupplier} onChange={(e) => setOnlySupplier(e.target.checked)} /> Chỉ lấy NVL từng mua của nhà cung cấp này</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={useSupplierPrice} onChange={(e) => setUseSupplierPrice(e.target.checked)} /> Dùng đơn giá mua gần nhất của nhà cung cấp này</label>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold mb-1">Ngày giao yêu cầu</label>
            <input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Ghi chú</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Giao trước 8h sáng" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Hiện đơn giá và thành tiền trong đơn
        </label>
        <p className="text-xs text-gray-500">Mỗi lần xuất với nội dung mới sẽ được cấp số đơn kế tiếp dạng 001/{String(new Date().getMonth() + 1).padStart(2, '0')}/{new Date().getFullYear()} (về 001 khi sang tháng mới).</p>
        {error && <p className="text-red-700">❌ {error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button>
          <button onClick={printOrder} disabled={busy} className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-800 text-white font-bold disabled:opacity-50">🖨 In / Lưu PDF</button>
          <button onClick={downloadExcel} disabled={busy} className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{busy ? 'Đang xuất…' : '⬇ Tải Excel'}</button>
        </div>
      </div>
    </div>
  );
}
