import React, { useEffect, useState } from 'react';
import { api, Card, Kpi, ChartBox, Table, money, num, pc } from './ui';

const ml = (ym) => `Tháng ${ym.slice(5)}/${ym.slice(0, 4)}`;
const short = (ym) => `${ym.slice(5)}/${ym.slice(2, 4)}`;
const growth = (a, b) => (b ? (a - b) / b : null);
const Delta = ({ v }) => (v === null || v === undefined ? <span className="text-gray-400">—</span> : <span style={{ color: v >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{v >= 0 ? '▲' : '▼'} {Math.abs(v * 100).toFixed(1)}%</span>);

// Báo cáo tăng trưởng khách mới / khách cũ quay lại theo tháng + nhóm khách
export default function CrmGrowth() {
  const [month, setMonth] = useState('');
  const [cmp, setCmp] = useState('auto');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    const qs = new URLSearchParams();
    if (month) qs.set('month', month);
    qs.set('cmp', cmp);
    api('GET', '/api/crm/growth?' + qs.toString()).then((j) => { if (j.success) { setD(j.data); if (!month) setMonth(j.data.month); } else setErr(j.message); });
  }, [month, cmp]);

  if (err) return <p className="text-red-600 p-4">{err}</p>;
  if (!d) return <p className="p-4 text-gray-500">Đang tải…</p>;
  const c = d.cur;
  const p = d.cmpSummary;
  const avail = [...d.available].reverse();

  const metrics = [
    ['Khách mới (lần đầu ghé)', 'newC', num], ['Khách cũ quay lại', 'returning', num], ['  · Quay lại liên tiếp (có ghé tháng trước)', 'consecutive', num], ['  · Quay lại sau thời gian vắng', 'reactivated', num],
    ['Tổng khách hoạt động', 'active', num], ['Doanh thu khách mới', 'newRev', (v) => money(v) + ' đ'], ['Doanh thu khách cũ quay lại', 'retRev', (v) => money(v) + ' đ'], ['Tổng doanh thu thành viên', 'rev', (v) => money(v) + ' đ']
  ];
  const groupCols = (rows) => [
    { label: 'Nhóm', render: (r) => <b>{r.label}</b> },
    { label: `Khách mới ${short(d.month)}`, align: 'right', render: (r) => num(r.cur.newC) },
    ...(p ? [{ label: `Khách mới ${short(d.cmp)}`, align: 'right', render: (r) => num(r.cmp.newC) }, { label: '% mới', align: 'right', render: (r) => <Delta v={growth(r.cur.newC, r.cmp.newC)} /> }] : []),
    { label: `Khách cũ quay lại ${short(d.month)}`, align: 'right', render: (r) => num(r.cur.returning) },
    ...(p ? [{ label: `Khách cũ ${short(d.cmp)}`, align: 'right', render: (r) => num(r.cmp.returning) }, { label: '% cũ', align: 'right', render: (r) => <Delta v={growth(r.cur.returning, r.cmp.returning)} /> }] : []),
    { label: 'Tổng hoạt động', align: 'right', render: (r) => <b>{num(r.cur.active)}</b> },
    { label: 'Doanh thu', align: 'right', render: (r) => money(r.cur.rev) + ' đ' },
    ...(p ? [{ label: '% DT', align: 'right', render: (r) => <Delta v={growth(r.cur.rev, r.cmp.rev)} /> }] : [])
  ];

  return (
    <div className="space-y-3">
      <Card pad={false}>
        <div className="p-3 flex flex-wrap items-end gap-3">
          <div><label className="block text-xs font-bold text-gray-600 mb-0.5">Xem tháng</label>
            <select value={d.month} onChange={(e) => setMonth(e.target.value)} className="border rounded px-2 py-1.5">{avail.map((m) => <option key={m} value={m}>{ml(m)}</option>)}</select></div>
          <div><label className="block text-xs font-bold text-gray-600 mb-0.5">So sánh với</label>
            <select value={cmp} onChange={(e) => setCmp(e.target.value)} className="border rounded px-2 py-1.5">
              <option value="auto">Tháng trước (tự động)</option><option value="none">Không so sánh</option>
              {avail.filter((m) => m !== d.month).map((m) => <option key={m} value={m}>{ml(m)}</option>)}
            </select></div>
          <div className="text-xs text-gray-500 max-w-xl">
            <b>Khách mới</b> = lần đầu ghé trong tháng. <b>Khách cũ quay lại</b> = đã từng ghé ở các tháng trước và có ghé trong tháng này. Chỉ tính khách thành viên (có số điện thoại). Dữ liệu hóa đơn bắt đầu từ {ml(d.dataStart)}.
          </div>
        </div>
        {d.firstMonthNote && <p className="px-3 pb-3 text-xs text-amber-700 font-semibold">⚠ {ml(d.dataStart)} là tháng đầu tiên có dữ liệu trong app nên mọi khách ghé tháng này đều bị tính là khách mới; hãy so sánh từ tháng sau trở đi để có số liệu chính xác.</p>}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label={`Khách mới ${short(d.month)}`} value={num(c.newC)} sub={p ? <Delta v={growth(c.newC, p.newC)} /> : ''} />
        <Kpi label="Khách cũ quay lại" value={num(c.returning)} sub={p ? <Delta v={growth(c.returning, p.returning)} /> : ''} color="#16a34a" />
        <Kpi label="Tổng khách hoạt động" value={num(c.active)} sub={p ? <Delta v={growth(c.active, p.active)} /> : ''} color="#0ea5e9" />
        <Kpi label="Tỷ lệ khách cũ" value={pc(c.active ? c.returning / c.active : 0)} sub={`${pc(c.active ? c.newC / c.active : 0)} là khách mới`} color="#8b5cf6" />
        <Kpi label="Giữ chân so với tháng trước" value={c.retention === null ? '—' : pc(c.retention)} sub="Khách tháng trước còn quay lại" color="#d97706" />
        <Kpi label="Doanh thu khách thành viên" value={money(c.rev) + ' đ'} sub={p ? <Delta v={growth(c.rev, p.rev)} /> : ''} color="#dc2626" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Khách mới & khách cũ quay lại 12 tháng (đường: % tăng trưởng tổng khách so với tháng trước)" className="lg:col-span-2">
          <ChartBox type="bar" height={290} data={{ labels: d.trend.map((t) => short(t.ym)), datasets: [
            { type: 'bar', label: 'Khách mới', data: d.trend.map((t) => t.newC), backgroundColor: '#3b82f6', stack: 'k', yAxisID: 'y' },
            { type: 'bar', label: 'Khách cũ quay lại', data: d.trend.map((t) => t.returning), backgroundColor: '#16a34a', stack: 'k', yAxisID: 'y' },
            { type: 'line', label: 'Tăng trưởng tổng khách (%)', data: d.trend.map((t) => (t.activeGrowth === null ? null : Math.round(t.activeGrowth * 1000) / 10)), borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1' }] }}
          options={{ scales: { y: { stacked: true }, x: { stacked: true }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} />
        </Card>
        <Card title={`Cơ cấu khách ${ml(d.month)}`}>
          <ChartBox type="doughnut" height={290} data={{ labels: [`Khách mới (${c.newC})`, `Quay lại liên tiếp (${c.consecutive})`, `Quay lại sau thời gian vắng (${c.reactivated})`], datasets: [{ data: [c.newC, c.consecutive, c.reactivated], backgroundColor: ['#3b82f6', '#16a34a', '#a3e635'] }] }}
          options={{ plugins: { legend: { position: 'bottom' } } }} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title={`Tỷ lệ tăng trưởng khách mới & khách cũ theo tháng (% so với tháng liền trước)`}>
          <ChartBox type="line" height={250} data={{ labels: d.trend.map((t) => short(t.ym)), datasets: [
            { label: 'Khách mới (%)', data: d.trend.map((t) => (t.newGrowth === null ? null : Math.round(t.newGrowth * 1000) / 10)), borderColor: '#3b82f6', backgroundColor: '#3b82f6' },
            { label: 'Khách cũ quay lại (%)', data: d.trend.map((t) => (t.returningGrowth === null ? null : Math.round(t.returningGrowth * 1000) / 10)), borderColor: '#16a34a', backgroundColor: '#16a34a' }] }} />
        </Card>
        <Card title={`Theo nhóm khách${p ? `: ${short(d.cmp)} so với ${short(d.month)}` : ''} (số khách hoạt động)`}>
          <ChartBox type="bar" height={250} data={{ labels: d.groups.map((g) => g.label.split(' ')[0]), datasets: [
            ...(p ? [{ label: `${short(d.cmp)} mới`, data: d.groups.map((g) => g.cmp.newC), backgroundColor: '#bfdbfe' }, { label: `${short(d.cmp)} cũ`, data: d.groups.map((g) => g.cmp.returning), backgroundColor: '#bbf7d0' }] : []),
            { label: `${short(d.month)} mới`, data: d.groups.map((g) => g.cur.newC), backgroundColor: '#3b82f6' }, { label: `${short(d.month)} cũ`, data: d.groups.map((g) => g.cur.returning), backgroundColor: '#16a34a' }] }} />
        </Card>
      </div>

      <Card title={`So sánh chỉ số: ${ml(d.month)}${p ? ' với ' + ml(d.cmp) : ''}`} pad={false}>
        <Table rows={metrics} rowKey={(r) => r[1]} cols={[
          { label: 'Chỉ số', render: (r) => <span style={{ whiteSpace: 'pre' }}>{r[0]}</span> },
          { label: ml(d.month), align: 'right', render: (r) => <b>{r[2](c[r[1]])}</b> },
          ...(p ? [{ label: ml(d.cmp), align: 'right', render: (r) => r[2](p[r[1]]) }, { label: 'Tăng / giảm', align: 'right', render: (r) => <Delta v={growth(c[r[1]], p[r[1]])} /> }] : [])
        ]} />
      </Card>

      <Card title="Theo nhóm khách (WG, FB, TT, ZL, GG, IG, Social, Hotline, CTV, MKT…)" pad={false}><Table rows={d.groups} rowKey={(r) => r.key} cols={groupCols(d.groups)} /></Card>
      <Card title="Theo hạng thẻ thành viên" pad={false}><Table rows={d.tiers} rowKey={(r) => r.key} cols={groupCols(d.tiers)} /></Card>

      <Card title="Số liệu 12 tháng" pad={false}>
        <Table rows={[...d.trend].reverse()} rowKey={(r) => r.ym} cols={[
          { label: 'Tháng', render: (r) => <b>{ml(r.ym)}</b> },
          { label: 'Khách mới', align: 'right', render: (r) => num(r.newC) }, { label: '% mới', align: 'right', render: (r) => <Delta v={r.newGrowth} /> },
          { label: 'Khách cũ quay lại', align: 'right', render: (r) => num(r.returning) }, { label: '% cũ', align: 'right', render: (r) => <Delta v={r.returningGrowth} /> },
          { label: 'Tổng hoạt động', align: 'right', render: (r) => <b>{num(r.active)}</b> }, { label: '% tổng', align: 'right', render: (r) => <Delta v={r.activeGrowth} /> },
          { label: 'Giữ chân', align: 'right', render: (r) => (r.retention === null ? '—' : pc(r.retention)) },
          { label: 'Doanh thu', align: 'right', render: (r) => money(r.rev) + ' đ' }
        ]} />
      </Card>
    </div>
  );
}
