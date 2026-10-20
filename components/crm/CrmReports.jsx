import React, { useEffect, useState } from 'react';
import { api, Card, Table, ChartBox, money, num, pc, TYPE_LABEL, TIER_COLORS, SEGMENT_COLORS } from './ui';

export default function CrmReports() {
  const [d, setD] = useState(null);
  useEffect(() => { api('GET', '/api/crm/reports').then((j) => j.success && setD(j.data)); }, []);
  if (!d) return <p className="p-4 text-gray-500">Đang tải…</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Khách mới theo tháng & tỷ lệ quay lại (khách ghé từ 2 lần)">
          <ChartBox type="bar" height={250} data={{ labels: d.cohorts.map((c) => c.ym.slice(5) + '/' + c.ym.slice(2, 4)), datasets: [
            { type: 'bar', label: 'Khách mới', data: d.cohorts.map((c) => c.n), backgroundColor: '#3b82f6', yAxisID: 'y' },
            { type: 'line', label: 'Tỷ lệ quay lại (%)', data: d.cohorts.map((c) => Math.round(c.repeatRate * 100)), borderColor: '#16a34a', backgroundColor: '#16a34a', yAxisID: 'y1' }] }}
          options={{ scales: { y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } } } }} />
        </Card>
        <Card title="Doanh thu theo hạng thẻ">
          <ChartBox type="bar" height={250} data={{ labels: d.byTier.map((t) => t.name), datasets: [{ label: 'Doanh thu (triệu đ)', data: d.byTier.map((t) => Math.round(t.spend / 1e5) / 10), backgroundColor: d.byTier.map((t) => TIER_COLORS[t.key] || '#64748b') }] }} options={{ plugins: { legend: { display: false } } }} />
        </Card>
      </div>

      <Card title="Hạng thẻ" pad={false}>
        <Table rows={d.byTier} rowKey={(r) => r.key} cols={[{ label: 'Hạng', render: (r) => <b>{r.name}</b> }, { label: 'Số khách', align: 'right', render: (r) => num(r.customers) }, { label: 'Doanh thu', align: 'right', render: (r) => money(r.spend) }, { label: 'Lần ghé TB', align: 'right', render: (r) => num(r.avgVisits) }]} />
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Phân khúc khách hàng" pad={false}>
          <Table rows={d.bySegment} rowKey={(r) => r.key} cols={[{ label: 'Phân khúc', render: (r) => <b style={{ color: SEGMENT_COLORS[r.key] }}>{r.name}</b> }, { label: 'Số khách', align: 'right', render: (r) => num(r.customers) }, { label: 'Doanh thu', align: 'right', render: (r) => money(r.spend) }, { label: 'Chi tiêu TB', align: 'right', render: (r) => money(r.avgSpend) }]} />
        </Card>
        <Card title="Theo chi nhánh" pad={false}>
          <Table rows={d.byBranch} rowKey={(r) => r.branch} cols={[{ label: 'Chi nhánh', render: (r) => <b>{r.name}</b> }, { label: 'Số khách', align: 'right', render: (r) => num(r.customers) }, { label: 'Lượt ghé', align: 'right', render: (r) => num(r.visits) }, { label: 'Doanh thu', align: 'right', render: (r) => money(r.spend) }]} />
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Hiệu quả theo nguồn khách" pad={false}>
          <Table rows={d.bySource} rowKey={(r) => r.source} cols={[{ label: 'Nguồn', render: (r) => <b>{r.source}</b> }, { label: 'Số khách', align: 'right', render: (r) => num(r.customers) }, { label: 'Doanh thu', align: 'right', render: (r) => money(r.spend) }, { label: 'Doanh thu / khách', align: 'right', render: (r) => money(r.customers ? r.spend / r.customers : 0) }]} />
        </Card>
        <Card title="Chăm sóc & phản hồi (90 ngày)">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-blue-50 p-3"><div className="text-2xl font-extrabold text-blue-700">{d.feedback.n}</div><div className="text-xs text-gray-600">Phản hồi / đánh giá</div></div>
            <div className="rounded-lg bg-amber-50 p-3"><div className="text-2xl font-extrabold text-amber-600">{d.feedback.avg ? d.feedback.avg.toFixed(1) : '—'}</div><div className="text-xs text-gray-600">Điểm trung bình ⭐</div></div>
            <div className="rounded-lg bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{d.feedback.complaints}</div><div className="text-xs text-gray-600">Khiếu nại</div></div>
          </div>
          <h4 className="font-bold text-xs text-gray-600 mt-4 mb-1">Tương tác 30 ngày gần đây</h4>
          {d.interactions30.length === 0 ? <p className="text-sm text-gray-500">Chưa có.</p> : d.interactions30.map((t) => <div key={t.type} className="flex justify-between text-sm border-t py-1"><span>{TYPE_LABEL[t.type] || t.type}</span><b>{t.n}</b></div>)}
        </Card>
      </div>
      <Card title="Khách mới & tỷ lệ quay lại theo tháng gia nhập" pad={false}>
        <Table rows={d.cohorts} rowKey={(r) => r.ym} cols={[{ label: 'Tháng', render: (r) => r.ym }, { label: 'Khách mới', align: 'right', render: (r) => r.n }, { label: 'Quay lại (≥2 lần)', align: 'right', render: (r) => r.repeat }, { label: 'Tỷ lệ', align: 'right', render: (r) => <b>{pc(r.repeatRate)}</b> }, { label: 'Chi tiêu TB', align: 'right', render: (r) => money(r.avgSpend) }]} />
      </Card>
    </div>
  );
}
