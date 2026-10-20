import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { api } from '../components/crm/ui';
import CrmDashboard from '../components/crm/CrmDashboard';
import CrmCustomers from '../components/crm/CrmCustomers';
import CrmCustomerDetail from '../components/crm/CrmCustomerDetail';
import CrmTasks from '../components/crm/CrmTasks';
import CrmDeals from '../components/crm/CrmDeals';
import CrmReports from '../components/crm/CrmReports';
import CrmSettings from '../components/crm/CrmSettings';
import CrmUsers from '../components/crm/CrmUsers';

const ROLE = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

export default function Crm() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const view = router.query.view ? String(router.query.view) : 'dashboard';
  const id = router.query.id ? Number(router.query.id) : null;

  const loadMeta = useCallback(async () => {
    const j = await api('GET', '/api/crm/meta');
    if (j.success) setMeta(j.data); else setErr(j.message || 'Không tải được dữ liệu CRM');
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const go = (v, cid) => router.push({ pathname: '/crm', query: cid ? { view: v, id: cid } : { view: v } }, undefined, { shallow: true });
  const isAdmin = meta && meta.user.role === 'admin';
  const isManager = meta && (meta.user.role === 'admin' || meta.user.role === 'manager');

  const NAV = [['dashboard', '📊 Tổng quan'], ['customers', '👥 Khách hàng'], ['tasks', '✅ Công việc'], ['deals', '🎉 Cơ hội / Tiệc'], ['reports', '📈 Báo cáo']];
  if (isAdmin) NAV.push(['settings', '💎 Hạng thẻ'], ['users', '🔐 Tài khoản']);
  const active = view === 'customer' ? 'customers' : view;

  return (
    <>
      <Head>
        <title>CRM Khách hàng · Fen Izakaya</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-sm pb-14">
        <header className="text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2" style={{ background: 'linear-gradient(90deg,#0f172a,#1e3a8a)' }}>
          <div>
            <div className="text-lg font-extrabold tracking-wide">FEN IZAKAYA · CRM KHÁCH HÀNG</div>
            <div className="text-xs text-blue-200">Quản lý khách hàng, thẻ thành viên, chăm sóc & cơ hội đặt tiệc</div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {meta && <span className="bg-white bg-opacity-15 rounded-full px-3 py-1">{meta.user.fullName} · {ROLE[meta.user.role]}</span>}
            {isAdmin && <Link href="/"><a className="underline text-blue-100">← Hệ thống quản lý nhà hàng</a></Link>}
          </div>
        </header>
        <nav className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5">
          {NAV.map(([k, l]) => <button key={k} onClick={() => go(k)} className={`px-3.5 py-1.5 rounded-lg font-bold ${active === k ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>)}
        </nav>
        <main className="p-4" style={{ maxWidth: 1500, margin: '0 auto' }}>
          {err && <p className="text-red-600 p-4">{err}</p>}
          {!meta && !err && <p className="p-4 text-gray-500">Đang tải…</p>}
          {meta && meta.branches.length === 0 && meta.user.role !== 'admin' && <p className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3">Tài khoản của bạn chưa được gán chi nhánh nào. Hãy nhờ Admin gán chi nhánh để xem khách hàng.</p>}
          {meta && view === 'dashboard' && <CrmDashboard meta={meta} go={go} />}
          {meta && view === 'customers' && <CrmCustomers meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'customer' && id && <CrmCustomerDetail id={id} meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'tasks' && <CrmTasks meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'deals' && <CrmDeals meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'reports' && <CrmReports meta={meta} />}
          {meta && view === 'settings' && isAdmin && <CrmSettings meta={meta} reloadMeta={loadMeta} />}
          {meta && view === 'users' && isAdmin && <CrmUsers meta={meta} />}
        </main>
      </div>
    </>
  );
}
