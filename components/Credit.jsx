import React from 'react';
import { APP_VERSION } from './version';

// Logo + "Được tạo bởi Quý Nguyễn" + số phiên bản.
// variant "badge": màn hình rộng -> khung bên trái (khoảng trống cạnh nội dung), màn hình hẹp -> ô cố định góc dưới phải;
// "inline": dùng trong tiêu đề / trang đăng nhập.
export default function Credit({ variant = 'badge' }) {
  const font = "'Segoe UI', Roboto, Arial, sans-serif";
  if (variant === 'inline') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: font, background: 'rgba(255,255,255,.96)', borderRadius: 12, padding: '4px 12px 4px 6px' }}>
        <img src="/logo-iafc.png?v=2" alt="IAFC" style={{ height: 44, width: 'auto', display: 'block' }} />
        <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.25 }}>Được tạo bởi <b style={{ color: '#0f172a' }}>Quý Nguyễn</b><br />Phiên bản {APP_VERSION}</span>
      </div>
    );
  }
  return (
    <>
      <style>{`
        .fen-credit{position:fixed;z-index:55;pointer-events:none;background:rgba(255,255,255,.97);box-shadow:0 3px 14px rgba(0,0,0,.18);font-family:${font};text-align:center}
        .fen-credit img{display:block;width:auto}
        .fen-credit .t{color:#475569;line-height:1.3}
        .fen-credit .t b{color:#0f172a}
        .fen-credit .v{color:#64748b}
        .fen-credit.side{display:none}
        .fen-credit.corner{right:10px;bottom:8px;border:1px solid #cbd5e1;border-radius:18px;padding:6px 16px 6px 8px;display:flex;align-items:center;gap:10px;text-align:left}
        .fen-credit.corner img{height:92px}
        .fen-credit.corner .t{font-size:14px}.fen-credit.corner .t b{font-size:17px}.fen-credit.corner .v{font-size:12px}
        @media (min-width:1500px){
          .fen-credit.corner{display:none}
          .fen-credit.side{display:block;left:12px;top:200px;width:calc((100vw - 1400px) / 2 - 24px);max-width:260px;min-width:200px;border:1px solid #cbd5e1;border-radius:14px;padding:14px 10px}
          .fen-credit.side img{height:150px;margin:0 auto 8px}
          .fen-credit.side .t{font-size:14px}.fen-credit.side .t b{font-size:18px}.fen-credit.side .v{font-size:13px;margin-top:4px}
        }
        @media print{.fen-credit{display:none!important}}
      `}</style>
      <div className="fen-credit corner">
        <img src="/logo-iafc.png?v=2" alt="IAFC" />
        <span className="t">Được tạo bởi<br /><b>Quý Nguyễn</b><br /><span className="v">Phiên bản {APP_VERSION}</span></span>
      </div>
      <div className="fen-credit side">
        <img src="/logo-iafc.png?v=2" alt="IAFC" />
        <div className="t">Được tạo bởi<br /><b>Quý Nguyễn</b></div>
        <div className="v">Phiên bản {APP_VERSION}</div>
      </div>
    </>
  );
}
