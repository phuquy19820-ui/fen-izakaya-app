import React, { useEffect, useRef, useState } from 'react';

export const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
export const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
export const pc = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
export const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '');

export async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  let j;
  try { j = await res.json(); } catch (e) { j = { success: false, message: 'Lỗi máy chủ (' + res.status + ')' }; }
  return j;
}

export const TIER_COLORS = { member: '#64748b', silver: '#94a3b8', gold: '#d97706', diamond: '#2563eb', luxury: '#111827' };
export const SEGMENT_COLORS = { new: '#0ea5e9', loyal: '#16a34a', regular: '#64748b', at_risk: '#f59e0b', lost: '#dc2626', none: '#cbd5e1' };
export const STAGE_LABEL = { new: 'Mới', consulting: 'Đang tư vấn', quoted: 'Đã báo giá', deposit: 'Đã đặt cọc', won: 'Thành công', lost: 'Thất bại' };
export const STAGE_COLOR = { new: '#64748b', consulting: '#0ea5e9', quoted: '#8b5cf6', deposit: '#f59e0b', won: '#16a34a', lost: '#dc2626' };
export const TYPE_LABEL = { note: '📝 Ghi chú', call: '📞 Gọi điện', zalo: '💬 Zalo', sms: '✉️ SMS', email: '📧 Email', meeting: '🤝 Gặp trực tiếp', visit: '🍽 Ghé quán', feedback: '⭐ Phản hồi', complaint: '⚠️ Khiếu nại' };

export function Badge({ color = '#64748b', children, solid = false }) {
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: solid ? '#fff' : color, background: solid ? color : color + '1a', border: `1px solid ${color}55`, whiteSpace: 'nowrap' }}>{children}</span>;
}
export const TierBadge = ({ tier, name }) => <Badge color={TIER_COLORS[tier] || '#64748b'} solid={tier === 'luxury' || tier === 'diamond' || tier === 'gold'}>{name || tier}</Badge>;
export const SegmentBadge = ({ segment, label }) => <Badge color={SEGMENT_COLORS[segment] || '#64748b'}>{label || segment}</Badge>;

export function Card({ title, right, children, className = '', pad = true }) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm ${className}`}>
      {(title || right) && <div className="px-4 py-2.5 border-b flex items-center justify-between gap-2"><h3 className="font-bold text-sm text-gray-800">{title}</h3>{right}</div>}
      <div className={pad ? 'p-3 overflow-auto' : ''}>{children}</div>
    </div>
  );
}

export function Kpi({ label, value, sub, color = '#1d4ed8' }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-3" style={{ borderTop: `3px solid ${color}` }}>
      <div className="text-xs text-gray-500 font-semibold">{label}</div>
      <div className="text-xl font-extrabold mt-1" style={{ color: '#0f172a' }}>{value}</div>
      {sub ? <div className="text-xs text-gray-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflow: 'auto' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full" style={{ maxWidth: width, marginTop: 24 }}>
        <div className="px-4 py-3 border-b flex items-center justify-between"><h3 className="font-bold text-base">{title}</h3><button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none">×</button></div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  return <div className={className}><label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>{children}</div>;
}
export const inputCls = 'w-full border rounded-lg px-2.5 py-1.5 text-sm bg-white';

// ---- biểu đồ (Chart.js từ CDN)
function useChartJs() {
  const [ready, setReady] = useState(typeof window !== 'undefined' && !!window.Chart);
  useEffect(() => {
    if (window.Chart) { setReady(true); return undefined; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
    return undefined;
  }, []);
  return ready;
}
export function ChartBox({ type, data, options, height = 240 }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const ready = useChartJs();
  useEffect(() => {
    if (!ready || !ref.current) return undefined;
    if (chart.current) chart.current.destroy();
    chart.current = new window.Chart(ref.current, { type, data, options: { responsive: true, maintainAspectRatio: false, ...(options || {}) } });
    return () => { if (chart.current) { chart.current.destroy(); chart.current = null; } };
  }, [ready, JSON.stringify(data), JSON.stringify(options)]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}

export function Table({ cols, rows, onRow, empty = 'Không có dữ liệu', rowKey }) {
  if (!rows || rows.length === 0) return <p className="p-4 text-gray-500 text-sm">{empty}</p>;
  return (
    <table className="w-full text-sm border-collapse">
      <thead><tr className="bg-gray-50 text-gray-600 text-xs uppercase">{cols.map((c, i) => <th key={i} className="px-2 py-2 border-b font-bold" style={{ textAlign: c.align || 'left', width: c.w, whiteSpace: 'nowrap' }}>{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={rowKey ? rowKey(r) : ri} onClick={onRow ? () => onRow(r) : undefined} className={`border-b hover:bg-blue-50 ${onRow ? 'cursor-pointer' : ''}`}>
            {cols.map((c, i) => <td key={i} className="px-2 py-1.5" style={{ textAlign: c.align || 'left' }}>{c.render ? c.render(r) : r[c.key]}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
