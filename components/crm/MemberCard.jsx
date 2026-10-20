import React, { useEffect, useRef, useState } from 'react';

// Thẻ thành viên digital (tỉ lệ thẻ ngân hàng 85,6 × 54 mm). Mỗi hạng có chất liệu riêng.
const THEMES = {
  member: { bg: 'linear-gradient(135deg,#475569 0%,#1e293b 55%,#0f172a 100%)', fg: '#f8fafc', sub: '#cbd5e1', accent: '#94a3b8', chip: 'linear-gradient(135deg,#cbd5e1,#64748b)', glow: 'rgba(148,163,184,.25)' },
  silver: { bg: 'linear-gradient(135deg,#f8fafc 0%,#cbd5e1 35%,#94a3b8 70%,#e2e8f0 100%)', fg: '#0f172a', sub: '#334155', accent: '#475569', chip: 'linear-gradient(135deg,#f1f5f9,#94a3b8)', glow: 'rgba(255,255,255,.55)' },
  gold: { bg: 'linear-gradient(135deg,#fef3c7 0%,#fbbf24 30%,#b45309 75%,#f59e0b 100%)', fg: '#3b2300', sub: '#6b3f00', accent: '#7c4a00', chip: 'linear-gradient(135deg,#fde68a,#b45309)', glow: 'rgba(255,255,255,.45)' },
  diamond: { bg: 'linear-gradient(135deg,#0b1f5c 0%,#1d4ed8 45%,#38bdf8 85%,#e0f2fe 100%)', fg: '#ffffff', sub: '#dbeafe', accent: '#bae6fd', chip: 'linear-gradient(135deg,#e0f2fe,#38bdf8)', glow: 'rgba(186,230,253,.4)' },
  luxury: { bg: 'linear-gradient(135deg,#050505 0%,#1a1a1a 45%,#3b2f0f 80%,#7a5c14 100%)', fg: '#f5d77a', sub: '#cdb15f', accent: '#e8c25a', chip: 'linear-gradient(135deg,#fde68a,#a16207)', glow: 'rgba(245,215,122,.28)' }
};
const themeOf = (key) => THEMES[key] || THEMES.member;

let qrPromise = null;
function loadQr() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.QRCode) return Promise.resolve(window.QRCode);
  if (!qrPromise) {
    qrPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.onload = () => resolve(window.QRCode);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return qrPromise;
}

function Qr({ text, size = 64 }) {
  const ref = useRef(null);
  useEffect(() => {
    let dead = false;
    loadQr().then((QRCode) => {
      if (dead || !ref.current) return;
      ref.current.innerHTML = '';
      // eslint-disable-next-line no-new
      new QRCode(ref.current, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    }).catch(() => {});
    return () => { dead = true; };
  }, [text, size]);
  return <div ref={ref} style={{ width: size, height: size, lineHeight: 0 }} />;
}

export const fmtDateVn = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

export default function MemberCard({ brand = 'FEN IZAKAYA', name, memberCode, tier = 'member', tierName = 'Thành viên', points = 0, since, link, id = 'member-card' }) {
  const t = themeOf(tier);
  const diamond = tier === 'diamond';
  const luxury = tier === 'luxury';
  return (
    <div id={id} style={{ position: 'relative', width: '100%', maxWidth: 440, aspectRatio: '1.586 / 1', borderRadius: 22, overflow: 'hidden', background: t.bg, color: t.fg, boxShadow: '0 18px 40px rgba(2,6,23,.35), inset 0 1px 0 rgba(255,255,255,.35)', fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif", containerType: 'inline-size' }}>
      {/* họa tiết nền */}
      <div style={{ position: 'absolute', right: -60, top: -80, width: 260, height: 260, borderRadius: '50%', background: `radial-gradient(circle, ${t.glow}, transparent 68%)` }} />
      <div style={{ position: 'absolute', left: -70, bottom: -110, width: 280, height: 280, borderRadius: '50%', background: `radial-gradient(circle, ${t.glow}, transparent 70%)` }} />
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: luxury ? 0.22 : 0.12 }} viewBox="0 0 440 277" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M-10 ${40 + i * 30} C 120 ${i * 30}, 260 ${90 + i * 30}, 460 ${30 + i * 30}`} fill="none" stroke={t.accent} strokeWidth="0.8" />)}
      </svg>
      {diamond && (
        <svg style={{ position: 'absolute', right: 18, top: 52, opacity: 0.55 }} width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e0f2fe" strokeWidth="0.8"><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M12 21 8 9l4-6 4 6z" /></svg>
      )}
      {luxury && <div style={{ position: 'absolute', inset: 8, borderRadius: 16, border: '1px solid rgba(245,215,122,.55)' }} />}

      <div style={{ position: 'relative', height: '100%', padding: '6% 7%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 'clamp(13px,4.6cqw,20px)', fontWeight: 800, letterSpacing: '0.22em' }}>{brand}</div>
            <div style={{ fontSize: 'clamp(8px,2.2cqw,10px)', letterSpacing: '0.3em', color: t.sub, marginTop: 2 }}>MEMBERSHIP</div>
          </div>
          <div style={{ padding: '4px 12px', borderRadius: 999, border: `1px solid ${t.accent}`, background: 'rgba(255,255,255,.12)', fontWeight: 700, fontSize: 'clamp(10px,3cqw,13px)', letterSpacing: '0.12em', textTransform: 'uppercase', backdropFilter: 'blur(2px)' }}>{tierName}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: '12%', minWidth: 36, aspectRatio: '1.25 / 1', borderRadius: 7, background: t.chip, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.2)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '22% 0', borderTop: '1px solid rgba(0,0,0,.25)', borderBottom: '1px solid rgba(0,0,0,.25)' }} />
            <div style={{ position: 'absolute', inset: '0 38%', borderLeft: '1px solid rgba(0,0,0,.25)', borderRight: '1px solid rgba(0,0,0,.25)' }} />
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontWeight: 700, fontSize: 'clamp(13px,5cqw,22px)', letterSpacing: '0.16em' }}>{memberCode}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 'clamp(7px,2cqw,9px)', letterSpacing: '0.2em', color: t.sub }}>HỘI VIÊN</div>
            <div style={{ fontSize: 'clamp(14px,5.2cqw,23px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '62cqw' }}>{name}</div>
            <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>
              <div><div style={{ fontSize: 'clamp(7px,2cqw,9px)', letterSpacing: '0.18em', color: t.sub }}>ĐIỂM</div><div style={{ fontSize: 'clamp(12px,3.8cqw,17px)', fontWeight: 800 }}>{Number(points).toLocaleString('vi-VN')}</div></div>
              {since ? <div><div style={{ fontSize: 'clamp(7px,2cqw,9px)', letterSpacing: '0.18em', color: t.sub }}>THÀNH VIÊN TỪ</div><div style={{ fontSize: 'clamp(11px,3.4cqw,15px)', fontWeight: 700 }}>{fmtDateVn(since)}</div></div> : null}
            </div>
          </div>
          {link ? <div style={{ background: '#fff', padding: 5, borderRadius: 8, boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}><Qr text={link} size={62} /></div> : null}
        </div>
      </div>
    </div>
  );
}

// Tải thẻ thành ảnh PNG
export async function downloadCardPng(elId, filename) {
  const load = () => new Promise((resolve, reject) => {
    if (window.html2canvas) return resolve(window.html2canvas);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = () => resolve(window.html2canvas);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  const h2c = await load();
  const canvas = await h2c(document.getElementById(elId), { backgroundColor: null, scale: 3, useCORS: true });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

export function CopyLink({ link }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 1800); } catch (e) { window.prompt('Sao chép link thẻ:', link); } }} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 font-bold">
      {done ? '✅ Đã sao chép' : '🔗 Sao chép link thẻ'}
    </button>
  );
}
