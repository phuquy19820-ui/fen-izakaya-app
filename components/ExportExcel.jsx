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
      const mod = await import('exceljs/dist/exceljs.min.js');
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fen Izakaya'; wb.created = new Date();
      const FONT = 'Times New Roman';
      const thin = { style: 'thin', color: { argb: 'FF7F7F7F' } };
      const border = { top: thin, left: thin, bottom: thin, right: thin };
      const title = clean((document.querySelector('h1') || {}).textContent) || 'Báo cáo';
      const sub = clean((document.querySelector('header p') || {}).textContent);
      const user = clean((document.querySelector('[data-user-name]') || {}).textContent).replace(/^👤\s*/, '');
      const now = new Date();
      const nowText = now.toLocaleString('vi-VN');

      const setupPage = (ws, landscape, headerRow) => {
        ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } };
        if (headerRow) ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
        ws.headerFooter = { oddFooter: `&L&"${FONT},Italic"&8Fen Izakaya&C&"${FONT},Regular"&9Trang &P / &N&R&"${FONT},Italic"&8In ngày &D` };
      };

      // Sheet thông tin
      const info = wb.addWorksheet('Thông tin');
      info.columns = [{ width: 22 }, { width: 80 }];
      info.mergeCells('A1:B1');
      info.getCell('A1').value = 'FEN IZAKAYA';
      info.getCell('A1').font = { name: FONT, size: 16, bold: true, color: { argb: 'FF0073C5' } };
      info.getCell('A1').alignment = { horizontal: 'center' };
      info.mergeCells('A2:B2');
      info.getCell('A2').value = title.toUpperCase();
      info.getCell('A2').font = { name: FONT, size: 14, bold: true };
      info.getCell('A2').alignment = { horizontal: 'center', wrapText: true };
      [['Mô tả', sub], ['Địa chỉ trang', window.location.href], ['Xuất lúc', nowText], ['Người xuất', user]].forEach((r, k) => {
        const row = info.getRow(4 + k);
        row.getCell(1).value = r[0]; row.getCell(1).font = { name: FONT, size: 11, bold: true };
        row.getCell(2).value = r[1]; row.getCell(2).font = { name: FONT, size: 11 }; row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        [1, 2].forEach((c) => { row.getCell(c).border = border; });
      });
      setupPage(info, false, null);

      const used = new Set(['thông tin']);
      let count = 0;
      Array.from(document.querySelectorAll('table')).forEach((table) => {
        if (!table.getClientRects().length) return;
        if (table.closest('.print\\:hidden')) return;
        const rows = tableToRows(table);
        if (rows.length < 2) return;
        count += 1;
        const name = sheetName(table, used, count);
        const ncol = Math.max(...rows.map((r) => r.length));
        const ws = wb.addWorksheet(name);
        const raw = (c) => (c && typeof c === 'object' ? c.v : c);

        // độ rộng cột theo nội dung
        const widths = [];
        rows.slice(0, 300).forEach((r) => r.forEach((c, ci) => { const len = c && typeof c === 'object' ? 7 : (typeof c === 'number' ? String(Math.round(c)).length + 3 : String(c).length); widths[ci] = Math.min(46, Math.max(widths[ci] || 6, len + 2)); }));
        for (let ci = 0; ci < ncol; ci++) ws.getColumn(ci + 1).width = widths[ci] || 10;
        const totalWidth = widths.reduce((a, b) => a + b, 0);
        const landscape = ncol > 6 || totalWidth > 95;

        // khối tiêu đề
        const mergeRow = (rn) => { if (ncol > 1) ws.mergeCells(rn, 1, rn, ncol); };
        mergeRow(1); ws.getCell(1, 1).value = 'FEN IZAKAYA'; ws.getCell(1, 1).font = { name: FONT, size: 12, bold: true, color: { argb: 'FF0073C5' } }; ws.getCell(1, 1).alignment = { horizontal: 'left' };
        mergeRow(2); ws.getCell(2, 1).value = (name || title).toUpperCase(); ws.getCell(2, 1).font = { name: FONT, size: 15, bold: true }; ws.getCell(2, 1).alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(2).height = 26;
        mergeRow(3); ws.getCell(3, 1).value = [title, sub].filter(Boolean).join(' — '); ws.getCell(3, 1).font = { name: FONT, size: 10, italic: true }; ws.getCell(3, 1).alignment = { horizontal: 'center', wrapText: true }; ws.getRow(3).height = sub && sub.length > 90 ? 28 : 16;
        mergeRow(4); ws.getCell(4, 1).value = `Ngày xuất: ${nowText}${user ? ' — Người lập: ' + user : ''}`; ws.getCell(4, 1).font = { name: FONT, size: 10, italic: true }; ws.getCell(4, 1).alignment = { horizontal: 'center' };

        const headerRow = 6;
        // dòng đầu của bảng là tiêu đề cột; các dòng sau là dữ liệu
        rows.forEach((r, ri) => {
          const row = ws.getRow(headerRow + ri);
          const isHeader = ri === 0;
          const firstText = String(raw(r[0]) === undefined ? '' : raw(r[0]));
          const isTotal = !isHeader && /^(tổng|cộng|total)/i.test(firstText.trim());
          for (let ci = 0; ci < ncol; ci++) {
            const c = r[ci] === undefined ? '' : r[ci];
            const cell = row.getCell(ci + 1);
            const v = raw(c);
            cell.value = v === '' ? null : v;
            cell.border = border;
            if (isHeader) {
              cell.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0073C5' } };
              cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            } else {
              cell.font = { name: FONT, size: 11, bold: isTotal };
              if (isTotal) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F1FA' } };
              else if (ri % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } };
              if (c && typeof c === 'object') { cell.numFmt = '0.0%'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
              else if (typeof c === 'number') { cell.numFmt = Number.isInteger(c) ? '#,##0' : '#,##0.###'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
              else cell.alignment = { horizontal: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(String(c)) ? 'center' : 'left', vertical: 'middle', wrapText: true };
            }
          }
          if (isHeader) row.height = 32;
        });
        ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }];

        // chữ ký
        const sigRow = headerRow + rows.length + 2;
        const labels = ['Người lập biểu', 'Kế toán trưởng', 'Giám đốc'];
        const span = Math.max(1, Math.floor(ncol / 3));
        labels.forEach((lb, k) => {
          const from = k * span + 1;
          const to = k === 2 ? ncol : (k + 1) * span;
          if (from > ncol) return;
          if (to > from) ws.mergeCells(sigRow, from, sigRow, to);
          const cell = ws.getCell(sigRow, from);
          cell.value = lb; cell.font = { name: FONT, size: 11, bold: true }; cell.alignment = { horizontal: 'center' };
          if (to > from) ws.mergeCells(sigRow + 1, from, sigRow + 1, to);
          const c2 = ws.getCell(sigRow + 1, from);
          c2.value = '(Ký, ghi rõ họ tên)'; c2.font = { name: FONT, size: 10, italic: true }; c2.alignment = { horizontal: 'center' };
        });
        setupPage(ws, landscape, headerRow);
        ws.pageSetup.printArea = `A1:${ws.getColumn(ncol).letter}${sigRow + 5}`;
      });
      if (count === 0) { alert('Màn hình này chưa có bảng số liệu nào để xuất. Hãy chọn kỳ báo cáo / bấm Xem rồi thử lại.'); return; }
      const p = (n) => String(n).padStart(2, '0');
      const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 50);
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug || 'bao_cao'}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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
