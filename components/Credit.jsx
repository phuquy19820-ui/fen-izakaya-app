import React from 'react';

// Dòng bản quyền + logo, hiện ở cuối mọi màn hình của app
export default function Credit() {
  return (
    <div className="print:hidden" style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '10px 16px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: "'Segoe UI', Roboto, Arial, sans-serif" }}>
      <img src="/logo-iafc.png" alt="IAFC" style={{ height: 40, width: 'auto', display: 'block' }} />
      <span style={{ fontSize: 13, color: '#475569' }}>Được tạo bởi <b style={{ color: '#0f172a' }}>Quý Nguyễn</b></span>
    </div>
  );
}
