import React, { useEffect, useState } from 'react';
import { api, Card, Kpi, ChartBox, Table, TierBadge, SegmentBadge, money, num, pc, fmtDate, STAGE_LABEL, STAGE_COLOR, TIER_COLORS, SEGMENT_COLORS } from './ui';

export default function CrmDashboard({ meta, go }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('GET', '/api/crm/dashboard').then((j) => (j.success ? setD(j.data) : setErr(j.message))); }, []);
  if (err) return <p className="text-red-600 p-4">{err}</p>;
  if (!d) return <p className="p-4 text-gray-500">Đang tải…</p>;
  const k = d.kpi;
  const seg = meta.segments;
  const growth = k.newLastMonth ? (k.newThisMonth - k.newLastMonth) / k.newLastMonth : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <Kpi label="Tổng khách hàng" value={num(k.total)} sub={`${num(k.withPhone)} khách có số điện thoại`} />
        <Kpi label="Khách mới tháng này" value={num(k.newThisMonth)} sub={growth === null ? 'Tháng trước: ' + num(k.newLastMonth) : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth * 100).toFixed(0)}% so với tháng trước`} color="#16a34a" />
        <Kpi label="Khách còn hoạt động (90 ngày)" value={num(k.active90)} sub={`${pc(k.total ? k.active90 / k.total : 0)} tổng khách`} color="#0ea5e9" />
        <Kpi label="Tỷ lệ khách quay lại" value={pc(k.returningRate)} sub="Khách ghé từ 2 lần trở lên" color="#8b5cf6" />
        <Kpi label="Chi tiêu TB / khách" value={money(k.avgSpend) + ' đ'} sub={`Top 10% khách chiếm ${pc(k.top10share)} doanh thu`} color="#d97706" />
        <Kpi label="Khách VIP có nguy cơ rời bỏ" value={num(k.atRiskVip)} sub="Hạng cao, lâu chưa quay lại" color="#dc2626" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Khách mới theo tháng & doanh thu từ khách thành viên" className="lg:col-span-2">
          <ChartBox type="bar" height={250} data={{ labels: d.monthly.map((m) => m.ym.slice(5) + '/' + m.ym.slice(2, 4)), datasets: [
            { type: 'bar', label: 'Khách mới', data: d.monthly.map((m) => m.newCustomers), backgroundColor: '#3b82f6', yAxisID: 'y' },
            { type: 'line', label: 'Doanh thu từ khách thành viên (triệu đ)', data: d.monthly.map((m) => Math.round(m.memberRev / 1e5) / 10), borderColor: '#f59e0b', backgroundColor: '#f59e0b', yAxisID: 'y1' }] }}
          options={{ scales: { y1: { position: 'right', grid: { drawOnChartArea: false } } } }} />
        </Card>
        <Card title="Phân bổ theo hạng thẻ">
          <ChartBox type="doughnut" height={250} data={{ labels: d.tiers.map((t) => `${t.label} (${t.n})`), datasets: [{ data: d.tiers.map((t) => t.n), backgroundColor: d.tiers.map((t) => TIER_COLORS[t.key] || '#64748b') }] }} options={{ plugins: { legend: { position: 'bottom' } } }} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Phân khúc khách hàng (RFM)">
          <ChartBox type="bar" height={220} data={{ labels: d.segments.map((s) => s.label), datasets: [{ label: 'Số khách', data: d.segments.map((s) => s.n), backgroundColor: d.segments.map((s) => SEGMENT_COLORS[s.key] || '#64748b') }] }} options={{ indexAxis: 'y', plugins: { legend: { display: false } } }} />
        </Card>
        <Card title="Nguồn khách">
          <ChartBox type="doughnut" height={220} data={{ labels: d.sources.map((s) => `${s.label} (${s.n})`), datasets: [{ data: d.sources.map((s) => s.n), backgroundColor: ['#1d4ed8', '#16a34a', '#f59e0b', '#8b5cf6', '#0ea5e9', '#dc2626', '#14b8a6', '#64748b', '#a855f7', '#ea580c'] }] }} options={{ plugins: { legend: { position: 'right' } } }} />
        </Card>
        <Card title="Công việc của tôi" right={<button onClick={() => go('tasks')} className="text-blue-700 text-xs font-bold">Xem tất cả →</button>}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-blue-50 p-3"><div className="text-2xl font-extrabold text-blue-700">{d.tasks.open}</div><div className="text-xs text-gray-600">Đang mở</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-2xl font-extrabold text-amber-600">{d.tasks.today}</div><div className="text-xs text-gray-600">Hôm nay</div></div>
            <div className="rounded-lg bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{d.tasks.overdue}</div><div className="text-xs text-gray-600">Quá hạn</div></div>
          </div>
          <h4 className="font-bold text-xs text-gray-600 mt-4 mb-1">Cơ hội đang theo dõi</h4>
          <div className="space-y-1 text-sm">
            {d.deals.filter((x) => !['won', 'lost'].includes(x.stage)).map((x) => <div key={x.stage} className="flex justify-between"><span style={{ color: STAGE_COLOR[x.stage] }} className="font-semibold">{STAGE_LABEL[x.stage]} ({x.n})</span><span>{money(x.value)} đ</span></div>)}
            {d.deals.filter((x) => !['won', 'lost'].includes(x.stage)).length === 0 && <p className="text-gray-500">Chưa có cơ hội nào.</p>}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Top 10 khách chi tiêu cao (12 tháng)" pad={false}>
          <Table rows={d.topCustomers} rowKey={(r) => r.id} onRow={(r) => go('customer', r.id)} cols={[
            { label: 'Khách hàng', render: (r) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-gray-500">{r.memberCode}{r.phone ? ' · ' + r.phone : ''}</div></div> },
            { label: 'Hạng', render: (r) => <TierBadge tier={r.tier} name={r.tierName} /> },
            { label: 'Lần ghé', align: 'right', render: (r) => r.visits },
            { label: 'Chi tiêu 12 tháng', align: 'right', render: (r) => <b>{money(r.spend12)}</b> }
          ]} />
        </Card>
        <Card title="Khách có nguy cơ rời bỏ (cần chăm sóc lại)" pad={false}>
          <Table rows={d.atRisk} rowKey={(r) => r.id} onRow={(r) => go('customer', r.id)} empty="Không có khách nào đang có nguy cơ rời bỏ 🎉" cols={[
            { label: 'Khách hàng', render: (r) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-gray-500">{r.phone || r.memberCode}</div></div> },
            { label: 'Lần ghé cuối', render: (r) => <span>{fmtDate(r.lastVisit)} <span className="text-xs text-gray-500">({r.recencyDays} ngày)</span></span> },
            { label: 'Chi tiêu', align: 'right', render: (r) => money(r.spend) }
          ]} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="🎂 Sinh nhật 14 ngày tới" pad={false}>
          <Table rows={d.birthdays} rowKey={(r) => r.id} onRow={(r) => go('customer', r.id)} empty="Chưa có sinh nhật sắp tới. Nhập ngày sinh trong hồ sơ khách để nhận nhắc." cols={[
            { label: 'Khách hàng', render: (r) => <div><div className="font-semibold">{r.name}</div><div className="text-xs text-gray-500">{r.phone}</div></div> },
            { label: 'Ngày', render: (r) => fmtDate(r.next) },
            { label: 'Còn', align: 'right', render: (r) => (r.inDays === 0 ? <b className="text-red-600">Hôm nay</b> : r.inDays + ' ngày') },
            { label: 'Hạng', render: (r) => <TierBadge tier={r.tier} name={r.tierName} /> }
          ]} />
        </Card>
        <Card title="🎉 Sự kiện / tiệc sắp tới (30 ngày)" pad={false}>
          <Table rows={d.upcomingEvents} rowKey={(r) => r.id} onRow={() => go('deals')} empty="Chưa có sự kiện nào trong 30 ngày tới." cols={[
            { label: 'Cơ hội', render: (r) => <div><div className="font-semibold">{r.title}</div><div className="text-xs text-gray-500">{r.deal_type}{r.guests ? ' · ' + r.guests + ' khách' : ''}</div></div> },
            { label: 'Ngày', render: (r) => fmtDate(r.event_date) },
            { label: 'Giai đoạn', render: (r) => <span style={{ color: STAGE_COLOR[r.stage] }} className="font-semibold">{STAGE_LABEL[r.stage]}</span> },
            { label: 'Dự kiến', align: 'right', render: (r) => money(r.expected_value) }
          ]} />
        </Card>
      </div>
    </div>
  );
}
