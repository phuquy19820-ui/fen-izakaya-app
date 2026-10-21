import React, { useState } from 'react';
import { api, inputCls } from './ui';

// Liên hệ nhanh khách hàng: mở Zalo / gọi / SMS / Facebook của khách với tin nhắn soạn sẵn, tự ghi vào lịch sử chăm sóc.
const phone84 = (p) => { const d = String(p || '').replace(/[^\d]/g, ''); return d.startsWith('84') ? d : d.startsWith('0') ? '84' + d.slice(1) : d; };
const fillTpl = (text, c, settings) => String(text || '')
  .replace(/\{ten\}/g, c.name || '').replace(/\{hang\}/g, c.tierName || 'thành viên')
  .replace(/\{quan\}/g, (settings && settings.brand) || 'Fen Izakaya')
  .replace(/\{the\}/g, c.cardToken && typeof window !== 'undefined' ? `${window.location.origin}/card/${c.cardToken}` : '');

export default function ContactBar({ customer, settings, onLogged, compact = false }) {
  const tpls = (settings && settings.messageTemplates) || [];
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [note, setNote] = useState('');
  const c = customer;
  const msg = edited ? text : fillTpl((tpls[idx] || {}).text, c, settings);
  const hasPhone = !!c.phone;
  const social = c.socialLink ? (/^https?:\/\//i.test(c.socialLink) ? c.socialLink : 'https://' + c.socialLink) : '';

  const copy = async () => { try { await navigator.clipboard.writeText(msg); return true; } catch (e) { return false; } };
  const log = async (type, label) => {
    await api('POST', `/api/crm/customers/${c.id}/interactions`, { type, content: `${label}${msg && type !== 'call' ? ': ' + msg : ''}`.substring(0, 1000) });
    if (onLogged) onLogged();
  };
  const go = async (kind) => {
    if (kind === 'zalo') { const ok = await copy(); window.open(`https://zalo.me/${phone84(c.phone)}`, '_blank', 'noopener'); setNote(ok ? 'Đã sao chép tin nhắn — dán vào khung chat Zalo rồi gửi.' : 'Đã mở Zalo — hãy tự dán tin nhắn.'); await log('zalo', 'Gửi Zalo'); }
    else if (kind === 'call') { window.location.href = `tel:${c.phone}`; await log('call', 'Gọi điện cho khách'); }
    else if (kind === 'sms') { window.location.href = `sms:${c.phone}?body=${encodeURIComponent(msg)}`; await log('sms', 'Gửi SMS'); }
    else if (kind === 'social') { const ok = await copy(); window.open(social, '_blank', 'noopener'); setNote(ok ? 'Đã sao chép tin nhắn — dán vào khung chat Facebook/mạng xã hội rồi gửi.' : 'Đã mở trang mạng xã hội của khách.'); await log('messenger', 'Nhắn qua mạng xã hội'); }
    else if (kind === 'copy') { setNote((await copy()) ? 'Đã sao chép tin nhắn.' : 'Không sao chép được.'); }
  };
  const btn = 'px-2.5 py-1 rounded-lg border font-bold text-xs';
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'mt-3 border rounded-xl p-3 bg-gray-50 space-y-2'}>
      {!compact && <div className="font-bold text-sm">📲 Liên hệ nhanh</div>}
      {tpls.length > 0 && (
        <select value={idx} onChange={(e) => { setIdx(Number(e.target.value)); setEdited(false); }} className={compact ? 'border rounded px-1 py-0.5 text-xs' : inputCls} style={compact ? { maxWidth: 170 } : undefined}>
          {tpls.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
        </select>
      )}
      {!compact && <textarea rows={3} value={msg} onChange={(e) => { setText(e.target.value); setEdited(true); }} className={inputCls} />}
      <div className="flex flex-wrap items-center gap-1.5">
        {hasPhone && <button onClick={() => go('zalo')} className={btn} style={{ background: '#0068ff', color: '#fff', borderColor: '#0068ff' }}>💬 Zalo</button>}
        {hasPhone && <button onClick={() => go('call')} className={btn + ' bg-white'}>📞 Gọi</button>}
        {hasPhone && <button onClick={() => go('sms')} className={btn + ' bg-white'}>✉️ SMS</button>}
        {social && <button onClick={() => go('social')} className={btn} style={{ background: '#1877f2', color: '#fff', borderColor: '#1877f2' }}>📘 Facebook</button>}
        <button onClick={() => go('copy')} className={btn + ' bg-white'}>📋 Chép tin</button>
        {!hasPhone && !social && <span className="text-xs text-gray-500">Khách chưa có số điện thoại / link mạng xã hội.</span>}
      </div>
      {note && <div className="text-xs text-green-700 font-semibold">{note}</div>}
    </div>
  );
}
