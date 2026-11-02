import React from 'react';

// Chọn nhóm hàng: Đồ ăn / Đồ uống / CCDC / Tất cả. stats: { food: { n, amount }, drink: {...}, ccdc: {...}, all: {...} }
export const GROUPS = [['food', '🍽️ Đồ ăn'], ['drink', '🍺 Đồ uống'], ['ccdc', '🧰 CCDC'], ['all', 'Tất cả']];

export default function GroupBar({ group, onChange, stats, note }) {
  const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {GROUPS.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} className={`px-4 py-2 rounded-lg font-bold border-2 ${group === k ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'}`}>
          {l} <span className="font-normal opacity-90">({(stats && stats[k] ? stats[k].n : 0)} mặt hàng{stats && stats[k] && stats[k].amount !== undefined ? ` · ${money(stats[k].amount)} đ` : ''})</span>
        </button>
      ))}
      {note && <span className="text-gray-500">{note}</span>}
    </div>
  );
}

export const inGroup = (group, g) => group === 'all' || (g || 'food') === group;
