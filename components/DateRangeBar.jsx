import React from 'react';

const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const todayVn = () => { const n = new Date(Date.now() + 7 * 3600 * 1000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

export function presetRange(key, minDate, maxDate) {
  const t = todayVn();
  const dow = (t.getUTCDay() + 6) % 7;
  switch (key) {
    case 'today': return [fmt(t), fmt(t)];
    case 'yesterday': return [fmt(addDays(t, -1)), fmt(addDays(t, -1))];
    case '7d': return [fmt(addDays(t, -6)), fmt(t)];
    case 'week': return [fmt(addDays(t, -dow)), fmt(addDays(t, 6 - dow))];
    case 'month': return [fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)))];
    case 'lastmonth': return [fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))), fmt(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)))];
    case 'all': return [minDate || '', maxDate || ''];
    default: return [fmt(t), fmt(t)];
  }
}

const PRESETS = [['today', 'Hôm nay'], ['yesterday', 'Hôm qua'], ['7d', '7 ngày'], ['week', 'Tuần này'], ['month', 'Tháng này'], ['lastmonth', 'Tháng trước'], ['all', 'Toàn bộ']];

// Bộ lọc thời gian dùng chung: từ ngày - đến ngày + nút chọn nhanh. onApply(from, to) được gọi khi bấm "Xem" hoặc chọn nhanh.
export default function DateRangeBar({ from, to, onChange, onApply, minDate, maxDate, children }) {
  const apply = (f, t) => { onChange(f, t); onApply(f, t); };
  return (
    <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3 text-xs">
      <div>
        <label className="block font-semibold mb-0.5">Từ ngày</label>
        <input type="date" value={from || ''} onChange={(e) => onChange(e.target.value, to)} className="border px-2 py-1 rounded" />
      </div>
      <div>
        <label className="block font-semibold mb-0.5">Đến ngày</label>
        <input type="date" value={to || ''} onChange={(e) => onChange(from, e.target.value)} className="border px-2 py-1 rounded" />
      </div>
      <button onClick={() => onApply(from, to)} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold">Xem</button>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([k, label]) => (
          <button key={k} onClick={() => { const [f, t] = presetRange(k, minDate, maxDate); apply(f, t); }} className="px-2 py-1 rounded border bg-gray-50 hover:bg-gray-100 font-semibold">{label}</button>
        ))}
      </div>
      {children}
    </div>
  );
}
