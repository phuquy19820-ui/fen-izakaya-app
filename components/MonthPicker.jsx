import React from 'react';

// Chọn tháng báo cáo (tháng + năm). onChange(year, month)
export default function MonthPicker({ year, month, onChange }) {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
  const shift = (k) => { const d = new Date(year, month - 1 + k, 1); onChange(d.getFullYear(), d.getMonth() + 1); };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => shift(-1)} className="px-2 py-1 rounded border bg-white font-bold" title="Tháng trước">‹</button>
      <select value={month} onChange={(e) => onChange(year, Number(e.target.value))} className="border rounded px-2 py-1 font-bold bg-white">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
      </select>
      <select value={year} onChange={(e) => onChange(Number(e.target.value), month)} className="border rounded px-2 py-1 font-bold bg-white">
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <button onClick={() => shift(1)} className="px-2 py-1 rounded border bg-white font-bold" title="Tháng sau">›</button>
    </div>
  );
}
