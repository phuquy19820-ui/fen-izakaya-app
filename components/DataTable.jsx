import React from 'react';

const norm = (s) => String(s === null || s === undefined ? '' : s)
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

const OPS = [
  { v: '>=', l: '≥' }, { v: '>', l: '>' }, { v: '=', l: '=' },
  { v: '<=', l: '≤' }, { v: '<', l: '<' }, { v: '!=', l: '≠' }
];

const valueOf = (col, row) => (col.get ? col.get(row) : row[col.key]);

// Áp bộ lọc theo từng cột. filters: { [key]: { text } | { value } | { op, val } }
export function filterRows(rows, columns, filters) {
  const active = columns.filter((c) => {
    const f = filters[c.key];
    if (!f) return false;
    if (c.type === 'number') return f.val !== undefined && f.val !== '';
    if (c.type === 'select') return f.value !== undefined && f.value !== '';
    return f.text !== undefined && f.text !== '';
  });
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((c) => {
    const f = filters[c.key];
    const v = valueOf(c, row);
    if (c.type === 'number') {
      const n = Number(v) || 0;
      const t = Number(f.val);
      if (!Number.isFinite(t)) return true;
      switch (f.op || '>=') {
        case '>': return n > t;
        case '=': return Math.abs(n - t) < 1e-9;
        case '<=': return n <= t;
        case '<': return n < t;
        case '!=': return Math.abs(n - t) >= 1e-9;
        default: return n >= t;
      }
    }
    if (c.type === 'select') return String(v === null || v === undefined ? '' : v) === f.value;
    return norm(v).includes(norm(f.text));
  }));
}

export function sortRows(rows, columns, sort) {
  if (!sort || !sort.key) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col) return rows;
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = valueOf(col, a);
    const vb = valueOf(col, b);
    if (col.type === 'number') return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    return String(va || '').localeCompare(String(vb || ''), 'vi') * dir;
  });
}

// Bảng gọn: tiêu đề dính trên cùng, hàng lọc theo cột, bấm tiêu đề để sắp xếp.
export default function DataTable({ columns, allRows, rows, rowKey, filters, onFiltersChange, sort, onSortChange, footer, maxHeight = '68vh', emptyText = 'Không có dòng nào phù hợp bộ lọc.' }) {
  const setFilter = (key, patch) => onFiltersChange({ ...filters, [key]: { ...(filters[key] || {}), ...patch } });

  const optionsFor = (c) => {
    if (c.options) return c.options;
    const set = new Set();
    (allRows || rows).forEach((r) => { const v = valueOf(c, r); if (v !== null && v !== undefined && v !== '') set.add(String(v)); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  };

  const headerBg = '#eef3f8';
  const cellBase = 'px-2 text-xs';

  return (
    <div className="bg-white rounded shadow border" style={{ overflow: 'auto', maxHeight }}>
      <table className="border-collapse text-xs" style={{ tableLayout: 'fixed', width: '100%', minWidth: columns.reduce((s, c) => s + (c.width || c.minWidth || 160), 0) }}>
        <colgroup>
          {columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const isSorted = sort && sort.key === c.key;
              return (
                <th
                  key={c.key}
                  onClick={() => onSortChange && onSortChange(isSorted ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.type === 'number' ? 'desc' : 'asc' })}
                  className={`${cellBase} font-bold text-gray-700 uppercase cursor-pointer select-none border-b border-r`}
                  style={{ position: 'sticky', top: 0, zIndex: 3, background: headerBg, height: 30, textAlign: c.align || 'left' }}
                  title="Bấm để sắp xếp"
                >
                  {c.label}{isSorted ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
          </tr>
          <tr>
            {columns.map((c) => {
              const f = filters[c.key] || {};
              return (
                <th key={c.key} className="border-b border-r font-normal" style={{ position: 'sticky', top: 30, zIndex: 3, background: '#fafcfe', padding: '2px 3px' }}>
                  {c.filterable === false ? null : c.type === 'number' ? (
                    <div className="flex gap-0.5">
                      <select value={f.op || '>='} onChange={(e) => setFilter(c.key, { op: e.target.value })} className="border rounded text-xs" style={{ width: 38, padding: '1px 0' }}>
                        {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                      <input type="number" step="any" value={f.val === undefined ? '' : f.val} onChange={(e) => setFilter(c.key, { val: e.target.value })} className="border rounded text-xs min-w-0 flex-1" style={{ padding: '1px 3px', width: 0 }} placeholder="lọc" />
                    </div>
                  ) : c.type === 'select' ? (
                    <select value={f.value || ''} onChange={(e) => setFilter(c.key, { value: e.target.value })} className="border rounded text-xs w-full" style={{ padding: '1px 0' }}>
                      <option value="">Tất cả</option>
                      {optionsFor(c).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input value={f.text || ''} onChange={(e) => setFilter(c.key, { text: e.target.value })} className="border rounded text-xs w-full" style={{ padding: '1px 4px' }} placeholder="lọc…" />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="p-6 text-center text-gray-500">{emptyText}</td></tr>
          )}
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b hover:bg-blue-50" style={{ height: 28 }}>
              {columns.map((c) => {
                const v = valueOf(c, row);
                return (
                  <td key={c.key} className={`${cellBase} border-r`} style={{ textAlign: c.align || 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: c.wrap ? 'normal' : 'nowrap', paddingTop: 2, paddingBottom: 2 }} title={c.noTitle ? undefined : (typeof v === 'string' ? v : undefined)}>
                    {c.render ? c.render(row, v) : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-bold">
              {React.Children.map(footer, (cell) => React.cloneElement(cell, {
                style: { ...(cell.props.style || {}), position: 'sticky', bottom: 0, zIndex: 3, background: headerBg, borderTop: '2px solid #cbd5e1' }
              }))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
