import React, { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthContext';
import { homeFor } from '../components/permissions';

export default function Login() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const j = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, remember }) })).json();
      if (!j.success) { setError(j.message || 'Đăng nhập thất bại'); return; }
      const u = await refresh();
      const next = router.query.next && String(router.query.next).startsWith('/') ? String(router.query.next) : homeFor(u);
      router.replace(next);
    } catch (err) {
      setError('Không kết nối được máy chủ');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Head>
        <title>Đăng nhập · Fen Izakaya</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a8a 60%,#0f172a)' }}>
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full p-8 space-y-4" style={{ maxWidth: 400 }}>
          <div className="text-center">
            <div className="text-xs tracking-widest text-gray-500">FEN IZAKAYA</div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Đăng nhập</h1>
            <p className="text-sm text-gray-500 mt-1">Hệ thống quản lý nhà hàng & CRM khách hàng</p>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Tên đăng nhập</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="w-full border rounded-lg px-3 py-2" style={{ paddingRight: 84 }} />
              <button type="button" onClick={() => setShow((v) => !v)} style={{ position: 'absolute', right: 8, top: 0, bottom: 0, fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>{show ? '🙈 Ẩn' : '👁 Hiện'}</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Ghi nhớ đăng nhập trên máy này (30 ngày)</label>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button disabled={busy || !username || !password} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 rounded-lg disabled:opacity-50">{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </form>
      </div>
    </>
  );
}
