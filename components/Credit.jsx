import React from 'react';
import { useRouter } from 'next/router';
import { APP_VERSION } from './version';

// Logo + "Được tạo bởi Quý Nguyễn" + số phiên bản.
// variant "badge": cố định ở góc trái trên cùng mọi màn hình (trong dải tiêu đề); "inline": dùng trong trang chủ / CRM / đăng nhập.
const NO_BADGE = ['/', '/login', '/crm'];
export default function Credit({ variant = 'badge' }) {
  const router = useRouter();
  const font = "'Segoe UI', Roboto, Arial, sans-serif";
  if (variant === 'inline') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: font, background: 'rgba(255,255,255,.96)', borderRadius: 12, padding: '4px 12px 4px 6px' }}>
        <img src="/logo-iafc.png?v=2" alt="IAFC" style={{ height: 44, width: 'auto', display: 'block' }} />
        <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.25 }}>Được tạo bởi <b style={{ color: '#0f172a' }}>Quý Nguyễn</b><br />Phiên bản {APP_VERSION}</span>
      </div>
    );
  }
  if (NO_BADGE.includes(router.pathname) || router.pathname.startsWith('/card')) return null;
  return (
    <>
      <style>{`
        .fen-credit{position:fixed;left:8px;top:9px;z-index:55;pointer-events:none;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.97);border-radius:12px;padding:3px 12px 3px 5px;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:${font}}
        .fen-credit img{height:50px;width:auto;display:block}
        .fen-credit .t{font-size:12px;color:#475569;line-height:1.25}
        .fen-credit .t b{color:#0f172a;font-size:14px}
        @media (max-width:900px){.fen-credit .t{display:none}.fen-credit{padding:3px}}
        @media print{.fen-credit{display:none!important}}
      `}</style>
      <div className="fen-credit">
        <img src="/logo-iafc.png?v=2" alt="IAFC" />
        <span className="t">Được tạo bởi<br /><b>Quý Nguyễn</b><br />Phiên bản {APP_VERSION}</span>
      </div>
    </>
  );
}
