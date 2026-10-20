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

// ---- Vẽ thẻ trực tiếp bằng Canvas để lưu ảnh (không phụ thuộc html2canvas nên không bị vỡ bố cục)
const STOPS = {
  member: [[0, '#475569'], [0.55, '#1e293b'], [1, '#0f172a']],
  silver: [[0, '#f8fafc'], [0.35, '#cbd5e1'], [0.7, '#94a3b8'], [1, '#e2e8f0']],
  gold: [[0, '#fef3c7'], [0.3, '#fbbf24'], [0.75, '#b45309'], [1, '#f59e0b']],
  diamond: [[0, '#0b1f5c'], [0.45, '#1d4ed8'], [0.85, '#38bdf8'], [1, '#e0f2fe']],
  luxury: [[0, '#050505'], [0.45, '#1a1a1a'], [0.8, '#3b2f0f'], [1, '#7a5c14']]
};
const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// chữ có giãn cách chữ (letter-spacing) vẽ thủ công để chạy được trên mọi trình duyệt
function spaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = Array.from(String(text));
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  return total;
}
function measureSpaced(ctx, text, spacing) {
  const chars = Array.from(String(text));
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}
function fitText(ctx, text, maxWidth, weight, startSize, minSize = 28) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) { size -= 2; ctx.font = `${weight} ${size}px ${FONT}`; }
  return size;
}

async function qrCanvas(text, size) {
  const QRCode = await loadQr();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(box);
  // eslint-disable-next-line no-new
  new QRCode(box, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
  await new Promise((r) => setTimeout(r, 60));
  const cv = box.querySelector('canvas');
  const img = box.querySelector('img');
  let out = null;
  if (cv) out = cv;
  else if (img) { await new Promise((r) => { if (img.complete) r(); else { img.onload = r; img.onerror = r; } }); out = img; }
  const copy = document.createElement('canvas');
  copy.width = size; copy.height = size;
  if (out) copy.getContext('2d').drawImage(out, 0, 0, size, size);
  document.body.removeChild(box);
  return copy;
}

export async function renderCardCanvas({ brand = 'FEN IZAKAYA', name = '', memberCode = '', tier = 'member', tierName = 'Thành viên', points = 0, since, link }) {
  const W = 1080;
  const H = Math.round(W / 1.586);
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const t = themeOf(tier);

  rrect(ctx, 0, 0, W, H, 56);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, W, H);
  (STOPS[tier] || STOPS.member).forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // ánh sáng nền
  const glow = (cx, cy, r) => { const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, t.glow); rg.addColorStop(0.7, 'rgba(255,255,255,0)'); ctx.fillStyle = rg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); };
  glow(W - 120, 40, 440);
  glow(120, H + 120, 480);
  // đường uốn lượn
  ctx.strokeStyle = t.accent;
  ctx.globalAlpha = tier === 'luxury' ? 0.22 : 0.12;
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(-20, 100 + i * 70);
    ctx.bezierCurveTo(300, i * 70, 640, 220 + i * 70, 1120, 80 + i * 70);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (tier === 'luxury') { ctx.strokeStyle = 'rgba(245,215,122,.55)'; ctx.lineWidth = 2; rrect(ctx, 20, 20, W - 40, H - 40, 40); ctx.stroke(); }
  if (tier === 'diamond') {
    ctx.save(); ctx.translate(W - 220, 150); ctx.strokeStyle = 'rgba(224,242,254,.6)'; ctx.lineWidth = 2.2; ctx.beginPath();
    ctx.moveTo(30, 12); ctx.lineTo(90, 12); ctx.lineTo(120, 56); ctx.lineTo(60, 128); ctx.lineTo(0, 56); ctx.closePath();
    ctx.moveTo(0, 56); ctx.lineTo(120, 56); ctx.moveTo(60, 128); ctx.lineTo(38, 56); ctx.lineTo(60, 12); ctx.lineTo(82, 56); ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  const padX = 76;
  ctx.textBaseline = 'alphabetic';
  // thương hiệu
  ctx.fillStyle = t.fg;
  ctx.font = `800 56px ${FONT}`;
  spaced(ctx, brand, padX, 118, 12);
  ctx.fillStyle = t.sub;
  ctx.font = `500 21px ${FONT}`;
  spaced(ctx, 'MEMBERSHIP', padX, 156, 8);

  // nhãn hạng
  ctx.font = `700 30px ${FONT}`;
  const label = String(tierName).toUpperCase();
  const lw = measureSpaced(ctx, label, 3);
  const pillW = lw + 64;
  const pillX = W - padX - pillW;
  rrect(ctx, pillX, 62, pillW, 68, 34);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fill();
  ctx.strokeStyle = t.accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = t.fg;
  spaced(ctx, label, pillX + 32, 108, 3);

  // chip + mã thành viên
  const chipW = 118;
  const chipH = 92;
  const chipY = 262;
  rrect(ctx, padX, chipY, chipW, chipH, 14);
  const cg = ctx.createLinearGradient(padX, chipY, padX + chipW, chipY + chipH);
  const chipColors = { member: ['#cbd5e1', '#64748b'], silver: ['#f1f5f9', '#94a3b8'], gold: ['#fde68a', '#b45309'], diamond: ['#e0f2fe', '#38bdf8'], luxury: ['#fde68a', '#a16207'] }[tier] || ['#cbd5e1', '#64748b'];
  cg.addColorStop(0, chipColors[0]); cg.addColorStop(1, chipColors[1]);
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padX, chipY + 28); ctx.lineTo(padX + chipW, chipY + 28); ctx.moveTo(padX, chipY + chipH - 28); ctx.lineTo(padX + chipW, chipY + chipH - 28);
  ctx.moveTo(padX + 44, chipY); ctx.lineTo(padX + 44, chipY + chipH); ctx.moveTo(padX + chipW - 44, chipY); ctx.lineTo(padX + chipW - 44, chipY + chipH); ctx.stroke();
  ctx.fillStyle = t.fg;
  ctx.font = `700 52px "Courier New", Courier, monospace`;
  spaced(ctx, memberCode, padX + chipW + 36, chipY + 64, 10);

  // hội viên
  ctx.fillStyle = t.sub;
  ctx.font = `500 20px ${FONT}`;
  spaced(ctx, 'HỘI VIÊN', padX, 440, 6);
  ctx.fillStyle = t.fg;
  const nm = String(name || '').toUpperCase();
  fitText(ctx, nm, 600, 700, 58);
  ctx.fillText(nm, padX, 500);

  // điểm + thành viên từ
  ctx.fillStyle = t.sub;
  ctx.font = `500 20px ${FONT}`;
  spaced(ctx, 'ĐIỂM', padX, 556, 5);
  ctx.fillStyle = t.fg;
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(Number(points).toLocaleString('vi-VN'), padX, 606);
  if (since) {
    ctx.fillStyle = t.sub;
    ctx.font = `500 20px ${FONT}`;
    spaced(ctx, 'THÀNH VIÊN TỪ', padX + 250, 556, 5);
    ctx.fillStyle = t.fg;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(fmtDateVn(since), padX + 250, 606);
  }

  // mã QR
  if (link) {
    try {
      const qs = 196;
      const q = await qrCanvas(link, qs);
      const bx = W - padX - qs - 28;
      const by = H - 56 - qs - 28;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      rrect(ctx, bx, by, qs + 28, qs + 28, 22);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
      ctx.drawImage(q, bx + 14, by + 14, qs, qs);
    } catch (e) { /* bỏ qua QR nếu không tải được */ }
  }
  ctx.restore();
  return canvas;
}

// Lưu thẻ: điện thoại dùng bảng chia sẻ (Lưu ảnh / Zalo...), máy tính tải thẳng file PNG
export async function saveCardImage(props, filename) {
  const canvas = await renderCardCanvas(props);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Không tạo được ảnh');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Thẻ thành viên' }); return { mode: 'share' }; } catch (e) { if (e && e.name === 'AbortError') return { mode: 'cancel' }; }
  }
  const url = URL.createObjectURL(blob);
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (!mobile) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { mode: 'download' };
  }
  return { mode: 'view', url };
}

// Nút lưu thẻ (có cửa sổ hiện ảnh để nhấn giữ lưu khi điện thoại không hỗ trợ chia sẻ)
export function SaveCardButton({ card, filename, className, children }) {
  const [busy, setBusy] = useState(false);
  const [viewUrl, setViewUrl] = useState('');
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await saveCardImage(card, filename);
      if (r.mode === 'view') setViewUrl(r.url);
    } catch (e) { setErr('Không lưu được thẻ: ' + (e.message || e)); } finally { setBusy(false); }
  };
  return (
    <>
      <button onClick={run} disabled={busy} className={className}>{busy ? 'Đang tạo ảnh…' : children}</button>
      {err && <p style={{ color: '#fca5a5', fontSize: 12 }}>{err}</p>}
      {viewUrl && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12 }}>
          <img src={viewUrl} alt="Thẻ thành viên" style={{ width: '100%', maxWidth: 440, borderRadius: 18 }} />
          <p style={{ color: '#fff', fontSize: 14, textAlign: 'center' }}>Nhấn giữ vào ảnh thẻ → chọn <b>Lưu ảnh</b> / <b>Thêm vào Ảnh</b></p>
          <button onClick={() => setViewUrl('')} style={{ background: '#fff', borderRadius: 999, padding: '8px 22px', fontWeight: 700 }}>Đóng</button>
        </div>
      )}
    </>
  );
}

export function CopyLink({ link }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={async () => { try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 1800); } catch (e) { window.prompt('Sao chép link thẻ:', link); } }} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 font-bold">
      {done ? '✅ Đã sao chép' : '🔗 Sao chép link thẻ'}
    </button>
  );
}
