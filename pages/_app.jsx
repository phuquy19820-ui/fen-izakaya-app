import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UserBar from '../components/UserBar';
import { AuthContext } from '../components/AuthContext';

const isPublic = (path) => path === '/login' || path.startsWith('/card/');

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null });

  const refresh = useCallback(async () => {
    try {
      const j = await (await fetch('/api/auth/me')).json();
      setState({ loading: false, user: j.data || null });
      return j.data || null;
    } catch (e) {
      setState({ loading: false, user: null });
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Phiên hết hạn giữa chừng: về trang đăng nhập
  useEffect(() => {
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const r = await orig(...args);
      const url = typeof args[0] === 'string' ? args[0] : '';
      if (r.status === 401 && url.startsWith('/api/') && !url.startsWith('/api/auth/') && !url.startsWith('/api/card/')) {
        setState({ loading: false, user: null });
      }
      return r;
    };
    return () => { window.fetch = orig; };
  }, []);

  const path = router.pathname;
  const user = state.user;
  let redirect = null;
  if (!state.loading) {
    if (!user && !isPublic(path)) redirect = '/login?next=' + encodeURIComponent(router.asPath);
    else if (user && path === '/login') redirect = (router.query.next && String(router.query.next).startsWith('/')) ? String(router.query.next) : (user.role === 'admin' ? '/' : '/crm');
    else if (user && user.role !== 'admin' && !path.startsWith('/crm') && !isPublic(path)) redirect = '/crm';
  }
  useEffect(() => { if (redirect) router.replace(redirect); }, [redirect]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.loading || redirect) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#64748b' }}>Đang tải…</div>;
  }
  return (
    <AuthContext.Provider value={{ user, refresh }}>
      <Component {...pageProps} />
      {user && !isPublic(path) && <UserBar />}
    </AuthContext.Provider>
  );
}

export default MyApp;
