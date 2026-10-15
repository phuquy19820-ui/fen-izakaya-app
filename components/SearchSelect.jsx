import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

const norm = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase();

// Ô chọn có tìm kiếm: gõ không dấu cũng tìm được ("ba roi" -> "BA RỌI").
export default function SearchSelect({ options, value, onChange, placeholder = 'Gõ để tìm và chọn…', footer, className = '', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Danh sách chọn hiển thị ở lớp riêng (không bị ô bảng cắt mất), tự lật lên nếu hết chỗ phía dưới
  const place = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const width = Math.max(300, r.width);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const below = window.innerHeight - r.bottom;
    const up = below < 340 && r.top > below;
    setPos({ left, width, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined, maxList: Math.max(160, Math.min(320, (up ? r.top : below) - 110)) });
  };

  useEffect(() => {
    const onDown = (e) => {
      const inside = (ref.current && ref.current.contains(e.target)) || (popRef.current && popRef.current.contains(e.target));
      if (!inside) setOpen(false);
    };
    const onScroll = (e) => { if (popRef.current && popRef.current.contains(e.target)) return; setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', place); };
  }, []);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) return options.slice(0, 200);
    return options
      .filter((o) => {
        const hay = norm(o.label + ' ' + (o.hint || ''));
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 200);
  }, [q, options]);

  const choose = (v) => {
    setOpen(false);
    setQ('');
    onChange(v);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!open) place(); setOpen((o) => !o); }}
        className="w-full border p-2 rounded bg-white text-left flex justify-between items-center gap-2 disabled:opacity-50"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>{selected ? selected.label : placeholder}</span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} className="bg-white border rounded shadow-lg" style={{ position: 'fixed', zIndex: 1000, left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
          <div className="p-2 border-b">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Tìm theo tên…"
              className="w-full border p-2 rounded text-sm"
            />
          </div>
          <div className="overflow-auto" style={{ maxHeight: pos.maxList }}>
            {filtered.length === 0 && <p className="p-3 text-sm text-gray-500">Không tìm thấy.</p>}
            {filtered.map((o, idx) => (
              <button
                type="button"
                key={`${o.value}-${idx}`}
                onClick={() => choose(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-purple-50 ${o.value === value ? 'bg-purple-100' : ''}`}
              >
                <span className="block">{o.label}</span>
                {o.hint && <span className="block text-xs text-gray-500">{o.hint}</span>}
              </button>
            ))}
            {options.length > 200 && !q && <p className="p-2 text-xs text-gray-400 text-center">Hiện 200 mục đầu — gõ để tìm thêm</p>}
          </div>
          {footer && <div className="border-t p-2">{typeof footer === 'function' ? footer(() => setOpen(false)) : footer}</div>}
        </div>,
        document.body
      )}
    </div>
  );
}
