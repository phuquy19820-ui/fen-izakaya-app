import React, { useState, useRef, useEffect, useMemo } from 'react';

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

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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
        onClick={() => setOpen((o) => !o)}
        className="w-full border p-2 rounded bg-white text-left flex justify-between items-center gap-2 disabled:opacity-50"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-500'}`}>{selected ? selected.label : placeholder}</span>
        <span className="text-gray-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[260px] bg-white border rounded shadow-lg">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Tìm theo tên…"
              className="w-full border p-2 rounded text-sm"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {filtered.length === 0 && <p className="p-3 text-sm text-gray-500">Không tìm thấy.</p>}
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
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
        </div>
      )}
    </div>
  );
}
