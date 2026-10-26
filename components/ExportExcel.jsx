import React, { useState } from 'react';
import { useRouter } from 'next/router';

// Nút "Xuất Excel" nổi ở góc dưới phải mọi màn hình báo cáo: xuất tất cả bảng đang hiển thị trên màn hình
// (mỗi bảng một sheet, số liệu đã chuyển thành số để tính toán được trong Excel).
const HIDE_ON = ['/', '/login', '/sync-cukcuk'];

const NUM_RE = /^[-+]?(0|[1-9]\d{0,2}(\.\d{3})+|[1-9]\d*)(,\d+)?$/; // 1.234.567 hoặc 0,5 (kiểu Việt Nam)
const PCT_RE = /^[-+]?\d+([.,]\d+)?%$/;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s*[▲▼]\s*$/, '').trim();

function toValue(text) {
  const t = text.replace(/\s*đ$/, '').trim();
  if (NUM_RE.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (PCT_RE.test(t)) return { v: Number(t.replace('%', '').replace(',', '.')) / 100, pct: true };
  if (/^[-+]?\d+(\.\d+)?$/.test(t) && !/^[-+]?0\d/.test(t) && t.length < 16) return Number(t);
  return text;
}

function sheetName(table, used, idx) {
  let name = '';
  let el = table;
  for (let depth = 0; depth < 5 && el && !name; depth++, el = el.parentElement) {
    let prev = el.previousElementSibling;
    for (let k = 0; k < 3 && prev && !name; k++, prev = prev.previousElementSibling) {
      const t = clean(prev.textContent);
      if (t && t.length <= 70 && !prev.querySelector('table')) name = t;
    }
  }
  name = (name || `Bảng ${idx}`).replace(/[\\/?*[\]:]/g, ' ').trim().substring(0, 28) || `Bảng ${idx}`;
  let n = name; let i = 2;
  while (used.has(n.toLowerCase())) n = `${name.substring(0, 25)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

function tableToRows(table) {
  table.querySelectorAll('input,select,textarea').forEach((el) => {
    let v = '';
    if (el.tagName === 'SELECT') v = (el.options[el.selectedIndex] || {}).text || '';
    else if (el.type === 'checkbox' || el.type === 'radio') v = el.checked ? '✓' : '';
    else if (el.type === 'hidden' || el.type === 'file' || el.type === 'button') v = '';
    else v = el.value || '';
    el.setAttribute('data-xv', v);
  });
  const clone = table.cloneNode(true);
  // bỏ hàng lọc theo cột của DataTable (hàng thứ 2 của thead có ô nhập)
  clone.querySelectorAll('thead').forEach((th) => {
    Array.from(th.rows).slice(1).forEach((tr) => { if (tr.querySelector('input,select')) tr.remove(); });
  });
  clone.querySelectorAll('input,select,textarea').forEach((el) => el.replaceWith(document.createTextNode(el.getAttribute('data-xv') || '')));
  clone.querySelectorAll('button,svg,script,style').forEach((el) => el.remove());
  const rows = [];
  Array.from(clone.rows).forEach((tr) => {
    const out = [];
    Array.from(tr.cells).forEach((cell) => {
      const text = clean(cell.textContent);
      out.push(cell.tagName === 'TH' ? text : toValue(text));
      for (let k = 1; k < (cell.colSpan || 1); k++) out.push('');
    });
    if (out.some((x) => x !== '')) rows.push(out);
  });
  return rows;
}

export default function ExportExcel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (HIDE_ON.includes(router.pathname) || router.pathname.startsWith('/card')) return null;

  const run = async () => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      const title = clean((document.querySelector('h1') || {}).textContent) || 'Báo cáo';
      const sub = clean((document.querySelector('header p') || {}).textContent);
      const now = new Date();
      const info = [['Báo cáo', title], ['Mô tả', sub], ['Địa chỉ trang', window.location.href], ['Xuất lúc', now.toLocaleString('vi-VN')], ['Người xuất', clean((document.querySelector('[data-user-name]') || {}).textContent)]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), 'Thông tin');
      const used = new Set(['thông tin']);
      let count = 0;
      Array.from(document.querySelectorAll('table')).forEach((table) => {
        if (!table.getClientRects().length) return;
        if (table.closest('.print\\:hidden')) return;
        const rows = tableToRows(table);
        if (rows.length < 2) return;
        count += 1;
        const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c))));
        rows.forEach((r, ri) => r.forEach((c, ci) => {
          const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
          if (c && typeof c === 'object' && ws[ref]) ws[ref].z = '0.0%';
          else if (typeof c === 'number' && ws[ref]) ws[ref].z = Number.isInteger(c) ? '#,##0' : '#,##0.###';
        }));
        const widths = [];
        rows.slice(0, 200).forEach((r) => r.forEach((c, ci) => { const len = String(c && typeof c === 'object' ? '00.0%' : c).length; widths[ci] = Math.min(60, Math.max(widths[ci] || 8, len + 2)); }));
        ws['!cols'] = widths.map((w) => ({ wch: w }));
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        XLSX.utils.book_append_sheet(wb, ws, sheetName(table, used, count));
      });
      if (count === 0) { alert('Màn hình này chưa có bảng số liệu nào để xuất. Hãy chọn kỳ báo cáo / bấm Xem rồi thử lại.'); return; }
      const p = (n) => String(n).padStart(2, '0');
      const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 50);
      XLSX.writeFile(wb, `${slug || 'bao_cao'}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.xlsx`);
    } catch (e) {
      alert('Không xuất được file Excel: ' + (e && e.message ? e.message : e));
    } finally { setBusy(false); }
  };

  return (
    <button onClick={run} disabled={busy} className="print:hidden"
      style={{ position: 'fixed', right: 22, bottom: 16, zIndex: 58, background: '#16a34a', color: '#fff', border: '2px solid #fff', borderRadius: 999, padding: '9px 16px', fontWeight: 800, fontSize: 13, boxShadow: '0 3px 12px rgba(0,0,0,.3)', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
      title="Xuất tất cả bảng đang hiển thị ra file Excel (.xlsx)">
      {busy ? '⏳ Đang xuất…' : '📥 Xuất Excel'}
    </button>
  );
}
