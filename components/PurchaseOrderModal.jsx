import React, { useState, useEffect } from 'react';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default function PurchaseOrderModal({ open, onClose, branch, lines, cycleLabel, onCompanySaved }) {
  const [buyer, setBuyer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [delivery, setDelivery] = useState('');
  const [note, setNote] = useState('');
  const [showPrice, setShowPrice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let remembered = '';
    try { remembered = localStorage.getItem('fen_buyer_company') || ''; } catch (e) { /* bỏ qua */ }
    setBuyer((branch && branch.buyer_company) || remembered);
    setError('');
  }, [open, branch]);

  if (!open) return null;

  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);

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
    if (lines.length === 0) { setError('Không có NVL nào có số lượng mua > 0 trong danh sách đang lọc.'); return false; }
    setError('');
    return true;
  };

  const payload = () => ({
    buyerCompany: buyer.trim(), branchName: branch ? branch.branch_name : '', supplier, deliveryDate: delivery, note, cycleLabel, showPrice, lines
  });

  const downloadExcel = async () => {
    if (!validate()) return;
    try {
      setBusy(true);
      await rememberCompany();
      const res = await fetch('/api/purchase-plans/export-xlsx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload())
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'Xuất file thất bại');
      }
      const blob = await res.blob();
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `don-mua-hang-${branch ? branch.branch_id : ''}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.xlsx`;
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
    await rememberCompany();
    const groups = {};
    lines.forEach((l) => { (groups[l.group] = groups[l.group] || []).push(l); });
    let stt = 0;
    const body = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'vi')).map((g) => {
      const rows = groups[g].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((l) => {
        stt++;
        return `<tr><td class="c">${stt}</td><td>${esc(l.code)}</td><td>${esc(l.name)}</td><td class="c">${esc(l.unit)}</td><td class="r">${l.qty.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</td>${showPrice ? `<td class="r">${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td>` : ''}</tr>`;
      }).join('');
      return `<tr class="g"><td colspan="${showPrice ? 7 : 5}">${esc(g.toUpperCase())}</td></tr>${rows}`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Đơn mua hàng</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:24px}h1{text-align:center;font-size:18px;margin:0 0 4px}
.sub{text-align:center;margin-bottom:12px}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #999;padding:3px 6px}
th{background:#0073C5;color:#fff}.c{text-align:center}.r{text-align:right}.g td{background:#e8f1fa;font-weight:bold}
.sig{display:flex;justify-content:space-between;margin-top:40px;text-align:center;font-weight:bold}@media print{body{margin:8mm}}</style></head><body>
<h1>ĐƠN ĐẶT MUA NGUYÊN VẬT LIỆU</h1><div class="sub">${esc(cycleLabel || '')}</div>
<div><b>Công ty mua:</b> ${esc(buyer.trim())}</div>
${branch ? `<div><b>Chi nhánh:</b> ${esc(branch.branch_name)}</div>` : ''}
${supplier ? `<div><b>Nhà cung cấp:</b> ${esc(supplier)}</div>` : ''}
<div><b>Ngày lập:</b> ${new Date().toLocaleDateString('vi-VN')}</div>
${delivery ? `<div><b>Ngày giao hàng yêu cầu:</b> ${esc(delivery)}</div>` : ''}
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

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-3 text-sm">
        <h3 className="text-lg font-bold text-gray-800">📤 Xuất đơn mua hàng</h3>
        <p className="text-gray-600">{lines.length} mặt hàng (chỉ NVL có số lượng mua &gt; 0 theo bộ lọc hiện tại){showPrice ? ` · tổng ${money(total)} đ` : ''}</p>
        <div>
          <label className="block font-semibold mb-1">Tên công ty mua *</label>
          <input value={buyer} onChange={(e) => setBuyer(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Công ty TNHH ... " />
          <p className="text-xs text-gray-500 mt-1">Nhập một lần, app nhớ cho chi nhánh {branch ? branch.branch_name : ''} (và gợi ý sẵn cho chi nhánh khác).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold mb-1">Nhà cung cấp (tùy chọn)</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full border p-2 rounded" />
          </div>
          <div>
            <label className="block font-semibold mb-1">Ngày giao yêu cầu</label>
            <input type="date" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="w-full border p-2 rounded" />
          </div>
        </div>
        <div>
          <label className="block font-semibold mb-1">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full border p-2 rounded" placeholder="VD: Giao trước 8h sáng" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> Hiện đơn giá và thành tiền trong đơn
        </label>
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
