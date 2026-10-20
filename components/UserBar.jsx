import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';

const ROLE = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

// Thanh tài khoản nhỏ ở góc dưới bên trái: đổi mật khẩu, đăng xuất
export default function UserBar() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState({ cur: '', next: '', again: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    await refresh();
    router.replace('/login');
  };
  const change = async () => {
    if (pw.next !== pw.again) { setMsg('❌ Mật khẩu nhập lại không khớp'); return; }
    setBusy(true);
    try {
      const j = await (await fetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: pw.cur, newPassword: pw.next }) })).json();
      setMsg(j.success ? '✅ ' + j.message : '❌ ' + j.message);
      if (j.success) setPw({ cur: '', next: '', again: '' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="print:hidden" style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 60, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 999, boxShadow: '0 2px 8px rgba(0,0,0,.15)', padding: '4px 10px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>👤 <b>{user.fullName}</b> <span style={{ color: '#64748b' }}>({ROLE[user.role] || user.role})</span></span>
        <button onClick={() => { setOpen(true); setMsg(''); }} style={{ color: '#2563eb', fontWeight: 600 }}>Đổi mật khẩu</button>
        <button onClick={logout} style={{ color: '#dc2626', fontWeight: 600 }}>Đăng xuất</button>
      </div>
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 380, fontSize: 14 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Đổi mật khẩu</h3>
            {[['cur', 'Mật khẩu hiện tại'], ['next', 'Mật khẩu mới (ít nhất 8 ký tự)'], ['again', 'Nhập lại mật khẩu mới']].map(([k, label]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: 2 }}>{label}</label>
                <input type="password" autoComplete={k === 'cur' ? 'current-password' : 'new-password'} value={pw[k]} onChange={(e) => setPw({ ...pw, [k]: e.target.value })} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px' }} />
              </div>
            ))}
            {msg && <p style={{ fontWeight: 600, color: msg.startsWith('✅') ? '#15803d' : '#b91c1c', marginBottom: 8 }}>{msg}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{ padding: '6px 14px', borderRadius: 6, background: '#e2e8f0', fontWeight: 600 }}>Đóng</button>
              <button disabled={busy} onClick={change} style={{ padding: '6px 14px', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>Đổi mật khẩu</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
