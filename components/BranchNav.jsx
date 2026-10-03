import React from 'react';

const ITEMS = [
  { key: 'plan', href: '/purchase-plan', label: '📊 Kế hoạch mua' },
  { key: 'sales', href: '/sales-report', label: '💰 Doanh thu theo món' },
  { key: 'stock', href: '/stock-report', label: '📦 Tồn kho' },
  { key: 'suppliers', href: '/suppliers', label: '🚚 Nhà cung cấp' },
  { key: 'orders', href: '/purchase-orders', label: '🧾 Đơn đã xuất' },
  { key: 'sync', href: '/sync-cukcuk', label: '🔄 Đồng bộ & ghép món' }
];

export default function BranchNav({ branch, active, branchName }) {
  return (
    <nav className="bg-white border-b px-6 py-2 flex flex-wrap items-center gap-2 text-sm">
      <a href="/" className="text-gray-500 hover:text-blue-700 mr-2">← Chi nhánh{branchName ? `: ${branchName}` : ''}</a>
      {ITEMS.map((it) => (
        <a
          key={it.key}
          href={`${it.href}?branch=${branch || ''}`}
          className={`px-3 py-1.5 rounded font-bold ${active === it.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
