import React from 'react';

// Logo + dòng bản quyền luôn hiện ở góc dưới bên phải mọi màn hình (không cần cuộn xuống cuối trang)
export default function Credit() {
  return (
    <div className="print:hidden" style={{ position: 'fixed', right: 10, bottom: 8, zIndex: 55, pointerEvents: 'none', background: 'rgba(255,255,255,.96)', border: '1px solid #cbd5e1', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.18)', padding: '4px 12px 4px 6px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Segoe UI', Roboto, Arial, sans-serif" }}>
      <img src="/logo-iafc.png?v=2" alt="IAFC" style={{ height: 46, width: 'auto', display: 'block' }} />
      <span style={{ fontSize: 13, color: '#475569', lineHeight: 1.2 }}>Được tạo bởi<br /><b style={{ color: '#0f172a', fontSize: 14 }}>Quý Nguyễn</b></span>
    </div>
  );
}
