import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { api, setCrmBranch, setCrmMonth } from '../components/crm/ui';
import { hasBranchModules } from '../components/permissions';
import Credit from '../components/Credit';
import CrmDashboard from '../components/crm/CrmDashboard';
import CrmCustomers from '../components/crm/CrmCustomers';
import CrmCustomerDetail from '../components/crm/CrmCustomerDetail';
import CrmTasks from '../components/crm/CrmTasks';
import CrmDeals from '../components/crm/CrmDeals';
import CrmReports from '../components/crm/CrmReports';
import CrmGrowth from '../components/crm/CrmGrowth';
import CrmSettings from '../components/crm/CrmSettings';
import CrmUsers from '../components/crm/CrmUsers';

const ROLE = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

export default function Crm() {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');
  const view = router.query.view ? String(router.query.view) : 'dashboard';
  const id = router.query.id ? Number(router.query.id) : null;
  const branch = router.query.b ? String(router.query.b) : '';
  const month = router.query.m && /^\d{4}-\d{2}$/.test(String(router.query.m)) ? String(router.query.m) : '';
  setCrmBranch(branch);
  setCrmMonth(month);

  const loadMeta = useCallback(async () => {
    const j = await api('GET', '/api/crm/meta');
    if (j.success) setMeta(j.data); else setErr(j.message || 'Không tải được dữ liệu CRM');
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const go = (v, cid) => router.push({ pathname: '/crm', query: { view: v, ...(cid ? { id: cid } : {}), ...(branch ? { b: branch } : {}), ...(month ? { m: month } : {}) } }, undefined, { shallow: true });
  const goMonth = (m) => router.push({ pathname: '/crm', query: { view: view === 'customer' ? 'customers' : view, ...(branch ? { b: branch } : {}), ...(m ? { m } : {}) } }, undefined, { shallow: true });
  const monthOptions = (() => { const out = []; const d = new Date(Date.now() + 7 * 3600 * 1000); d.setUTCDate(1); for (let i = 0; i < 24; i++) { out.push(d.toISOString().slice(0, 7)); d.setUTCMonth(d.getUTCMonth() - 1); } return out; })();
  const goBranch = (b) => router.push({ pathname: '/crm', query: { view: view === 'customer' ? 'customers' : view, ...(b ? { b } : {}), ...(month ? { m: month } : {}) } }, undefined, { shallow: true });
  const branchName = meta && branch ? ((meta.branches.find((x) => x.branch_id === branch) || {}).branch_name || branch) : '';
  const isAdmin = meta && meta.user.role === 'admin';
  const isManager = meta && (meta.user.role === 'admin' || meta.user.role === 'manager');

  const NAV = [['dashboard', '📊 Tổng quan'], ['customers', '👥 Khách hàng'], ['tasks', '✅ Công việc'], ['deals', '🎉 Cơ hội / Tiệc'], ['growth', '📊 Tăng trưởng khách'], ['reports', '📈 Báo cáo']];
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
            <Credit variant="inline" />
            {meta && <span className="bg-white bg-opacity-15 rounded-full px-3 py-1">{meta.user.fullName} · {ROLE[meta.user.role]}</span>}
            {meta && hasBranchModules(meta.user) && <Link href="/"><a className="underline text-blue-100">← Hệ thống quản lý nhà hàng</a></Link>}
          </div>
        </header>
        <nav className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5">
          {NAV.map(([k, l]) => <button key={k} onClick={() => go(k)} className={`px-3.5 py-1.5 rounded-lg font-bold ${active === k ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{l}</button>)}
        </nav>
        {meta && !['settings', 'users'].includes(view) && (
          <div className="bg-white border-b px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Lọc theo tháng:</span>
            <select value={month} onChange={(e) => goMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 font-bold">
              <option value="">Toàn bộ thời gian</option>
              {monthOptions.map((m) => <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>)}
            </select>
            {month && <button onClick={() => goMonth('')} className="px-2 py-1 rounded border text-xs font-bold text-red-600">✕ Bỏ lọc tháng</button>}
            <span className="text-xs text-gray-500">{month ? `Đang xem số liệu của tháng ${month.slice(5)}/${month.slice(0, 4)}: khách có phát sinh trong tháng, chi tiêu & lượt ghé tính riêng tháng; công việc theo hạn trong tháng; cơ hội/tiệc theo ngày tổ chức trong tháng.` : 'Đang xem toàn bộ thời gian. Chọn một tháng để lọc tất cả các tab.'}</span>
          </div>
        )}
        {meta && meta.branches.length > 1 && !['settings', 'users'].includes(view) && (
          <div className="bg-white border-b px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase">Chi nhánh:</span>
            <button onClick={() => goBranch('')} className={`px-4 py-1.5 rounded-full border font-bold ${!branch ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>🏢 Tất cả chi nhánh</button>
            {meta.branches.map((b) => <button key={b.branch_id} onClick={() => goBranch(b.branch_id)} className={`px-4 py-1.5 rounded-full border font-bold ${branch === b.branch_id ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{b.branch_name}</button>)}
            {branch && <span className="text-xs text-gray-500 ml-2">Đang xem riêng số liệu của <b>{branchName}</b> (hạng thẻ vẫn tính chung toàn hệ thống).</span>}
          </div>
        )}
        <main className="p-4" style={{ maxWidth: 1500, margin: '0 auto' }}>
          {err && <p className="text-red-600 p-4">{err}</p>}
          {!meta && !err && <p className="p-4 text-gray-500">Đang tải…</p>}
          {meta && meta.branches.length === 0 && meta.user.role !== 'admin' && <p className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3">Tài khoản của bạn chưa được gán chi nhánh nào. Hãy nhờ Admin gán chi nhánh để xem khách hàng.</p>}
          {meta && view === 'dashboard' && <CrmDashboard key={branch + '|' + month} meta={meta} go={go} />}
          {meta && view === 'customers' && <CrmCustomers key={branch + '|' + month} meta={meta} go={go} isManager={isManager} branch={branch} />}
          {meta && view === 'customer' && id && <CrmCustomerDetail key={branch + '-' + id} id={id} meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'tasks' && <CrmTasks key={branch + '|' + month} meta={meta} go={go} isManager={isManager} />}
          {meta && view === 'deals' && <CrmDeals key={branch + '|' + month} meta={meta} go={go} isManager={isManager} branch={branch} />}
          {meta && view === 'growth' && <CrmGrowth key={branch + '|' + month} month={month} setMonth={goMonth} />}
          {meta && view === 'reports' && <CrmReports key={branch + '|' + month} meta={meta} />}
          {meta && view === 'settings' && isAdmin && <CrmSettings meta={meta} reloadMeta={loadMeta} />}
          {meta && view === 'users' && isAdmin && <CrmUsers meta={meta} />}
        </main>
      </div>
    </>
  );
}
