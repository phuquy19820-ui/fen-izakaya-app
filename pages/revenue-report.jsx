import React, { useState, useEffect, useMemo, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const pc = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (v * 100).toFixed(d) + '%');
const delta = (v) => (v === null || v === undefined || !Number.isFinite(v) ? <span className="text-gray-300">—</span> : <span className={v > 0 ? 'text-green-700 font-semibold' : v < 0 ? 'text-red-600 font-semibold' : ''}>{v > 0 ? '▲ +' : v < 0 ? '▼ ' : ''}{(v * 100).toFixed(1)}%</span>);
const ratio = (a, b) => (b ? (a - b) / b : null);
const NAVY = '#1f2a4a';
const TEAL = '#4a8479';
const GOLD = '#c8913f';

const TABS = [
  { key: 'dash', label: '📊 Dashboard' },
  { key: 'month', label: '📅 Báo cáo tháng' },
  { key: 'cust', label: '👥 Nhóm khách' },
  { key: 'cmp', label: '⚖️ So sánh tăng/giảm' },
  { key: 'speed', label: '🐢 Tốc độ bán món' }
];

// ---- biểu đồ (Chart.js nạp từ CDN)
function useChartJs() {
  const [ready, setReady] = useState(typeof window !== 'undefined' && !!window.Chart);
  useEffect(() => {
    if (window.Chart) { setReady(true); return undefined; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = () => setReady(true);
    document.head.appendChild(s);
    return undefined;
  }, []);
  return ready;
}
function ChartBox({ type, data, options, height = 260 }) {
  const ref = useRef(null);
  const chart = useRef(null);
  const ready = useChartJs();
  useEffect(() => {
    if (!ready || !ref.current) return undefined;
    if (chart.current) chart.current.destroy();
    chart.current = new window.Chart(ref.current, { type, data, options: { responsive: true, maintainAspectRatio: false, ...(options || {}) } });
    return () => { if (chart.current) { chart.current.destroy(); chart.current = null; } };
  }, [ready, JSON.stringify(data), JSON.stringify(options)]);
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>;
}

function Card({ title, children, className = '' }) {
  return (
    <div className={`bg-white rounded border ${className}`}>
      {title && <h3 className="px-3 py-2 font-bold text-sm border-b" style={{ color: NAVY }}>{title}</h3>}
      <div className="p-2 overflow-auto">{children}</div>
    </div>
  );
}
// bảng đơn giản: cols = [{ label, get | key, render, align, w }]
function Tbl({ cols, rows, foot, empty = 'Chưa có dữ liệu', zebra = true }) {
  if (!rows || rows.length === 0) return <p className="p-3 text-gray-500">{empty}</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-gray-100">{cols.map((c, i) => <th key={i} className="border px-2 py-1 font-bold text-gray-700" style={{ textAlign: c.align || (i === 0 ? 'left' : 'right'), width: c.w }}>{c.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className={zebra && ri % 2 ? 'bg-gray-50' : ''}>
            {cols.map((c, i) => <td key={i} className="border px-2 py-1" style={{ textAlign: c.align || (i === 0 ? 'left' : 'right') }}>{c.render ? c.render(r, ri) : (c.get ? c.get(r) : r[c.key])}</td>)}
          </tr>
        ))}
        {foot && <tr className="bg-gray-100 font-bold">{foot.map((v, i) => <td key={i} className="border px-2 py-1" style={{ textAlign: i === 0 ? 'left' : 'right' }}>{v}</td>)}</tr>}
      </tbody>
    </table>
  );
}
function Kpi({ label, value, sub, color }) {
  return (
    <div className="rounded overflow-hidden border bg-white">
      <div className="px-2 py-1 text-white text-center font-bold text-xs" style={{ backgroundColor: color }}>{label}</div>
      <div className="px-2 py-3 text-center text-xl font-bold">{value}</div>
      {sub && <div className="pb-2 text-center text-xs">{sub}</div>}
    </div>
  );
}

export default function RevenueReport() {
  const router = useRouter();
  const { branch } = router.query;
  const [branches, setBranches] = useState([]);
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('dash');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [cmp, setCmp] = useState('auto');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [group, setGroup] = useState('');
  const [lowQty, setLowQty] = useState(5);
  const [speedClass, setSpeedClass] = useState('');
  const [speedFilters, setSpeedFilters] = useState({});
  const [speedSort, setSpeedSort] = useState(null);
  const [metaKeep, setMetaKeep] = useState(null);

  useEffect(() => { fetch('/api/branches').then((r) => r.json()).then((d) => d.success && setBranches(d.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
  }, [branch]);

  useEffect(() => {
    if (!branch) return undefined;
    let dead = false;
    setLoading(true);
    const qs = new URLSearchParams();
    if (year) qs.set('year', year);
    if (month) qs.set('month', month);
    qs.set('cmp', cmp === 'none' ? '' : cmp);
    if (kind) qs.set('kind', kind);
    if (category) qs.set('category', category);
    if (group) qs.set('group', group);
    qs.set('lowQty', String(lowQty));
    fetch(`/api/revenue/report/${branch}?${qs.toString()}`).then((r) => r.json()).then((j) => {
      if (dead) return;
      if (!j.success) { setError(j.message || 'Lỗi tải báo cáo'); setData(null); return; }
      setError('');
      setData(j.data);
      if (!j.data.empty) {
        if (!year) setYear(String(j.data.year));
        if (!month) setMonth(String(j.data.month));
        setMetaKeep(j.data.meta);
      }
    }).catch((e) => !dead && setError(String(e))).finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [branch, year, month, cmp, kind, category, group, lowQty]);

  const meta = (data && data.meta) || metaKeep;
  const years = useMemo(() => (meta ? Array.from(new Set(meta.months.map((m) => m.slice(0, 4)))).sort() : []), [meta]);
  const monthLabel = (ym) => `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

  const speedRows = useMemo(() => (data && data.speed ? data.speed.filter((r) => !speedClass || (speedClass === 'low' ? r.low : r.cls === speedClass)) : []), [data, speedClass]);
  const CLS = { fast: ['🟢 Bán chạy', 'text-green-700'], slow: ['🟡 Bán chậm', 'text-yellow-700'], veryslow: ['🟠 Bán rất ít', 'text-orange-600'], none: ['⚫ Chưa bán được', 'text-gray-500'] };
  const speedCols = [
    { key: 'rank', label: '#', width: 52, type: 'number', align: 'right' },
    { key: 'name', label: 'Món', type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'kind', label: 'Nhóm F&B', width: 100, type: 'select' },
    { key: 'category', label: 'Nhóm thực đơn', width: 130, type: 'select' },
    { key: 'qty', label: 'SL bán', width: 80, type: 'number', align: 'right', render: (r) => <b>{num(r.qty)}</b> },
    { key: 'rev', label: 'Doanh thu', width: 110, type: 'number', align: 'right', render: (r) => money(r.rev) },
    { key: 'share', label: '% SL', width: 70, type: 'number', align: 'right', get: (r) => r.share * 100, render: (r) => pc(r.share) },
    { key: 'cum', label: '% SL tích luỹ', width: 96, type: 'number', align: 'right', get: (r) => r.cum * 100, render: (r) => pc(r.cum) },
    { key: 'status', label: 'Tình trạng', width: 150, type: 'select', get: (r) => CLS[r.cls][0], render: (r) => <span className={`font-bold ${CLS[r.cls][1]}`}>{CLS[r.cls][0]}</span> },
    { key: 'low', label: `Bán ít (< ${lowQty})`, width: 92, type: 'select', get: (r) => (r.low ? 'Bán ít' : '—'), render: (r) => (r.low ? <span className="text-red-600 font-bold">⚠ bán ít</span> : <span className="text-gray-300">—</span>) },
    { key: 'cmpQty', label: data && data.cmpYm ? `SL ${data.cmpYm.slice(5)}/${data.cmpYm.slice(0, 4)}` : 'SL so sánh', width: 96, type: 'number', align: 'right', get: (r) => (r.cmpQty === null ? 0 : r.cmpQty), render: (r) => (r.cmpQty === null ? '—' : num(r.cmpQty)) },
    { key: 'changePct', label: 'Thay đổi SL', width: 100, type: 'number', align: 'right', get: (r) => (r.changePct === null ? 0 : r.changePct * 100), render: (r) => delta(r.changePct) }
  ];
  const speedVisible = useMemo(() => sortRows(filterRows(speedRows, speedCols, speedFilters), speedCols, speedSort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speedRows, speedFilters, speedSort, lowQty, data]);

  const empty = data && data.empty;
  const k = data && data.kpi;
  const hasCmp = !!(data && data.cmpYm);
  const cmpTxt = hasCmp ? monthLabel(data.cmpYm) : '';

  // ---------- các khối dùng lại ----------
  const hourChart = data && !empty && (
    <ChartBox type="bar" height={250} data={{ labels: data.byHour.cur.map((h) => h.label), datasets: [
      { type: 'bar', label: 'Doanh thu', data: data.byHour.cur.map((h) => h.rev), backgroundColor: NAVY, yAxisID: 'y' },
      { type: 'line', label: 'Số hóa đơn', data: data.byHour.cur.map((h) => h.inv), borderColor: GOLD, backgroundColor: GOLD, yAxisID: 'y1' }] }}
    options={{ scales: { y: { ticks: { callback: (v) => (v / 1e6) + 'tr' } }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} />
  );
  const monthChart = data && !empty && (
    <ChartBox type="bar" height={250} data={{ labels: data.byMonth.map((m) => m.label), datasets: [
      { type: 'bar', label: 'Doanh thu', data: data.byMonth.map((m) => m.rev), backgroundColor: TEAL, yAxisID: 'y' },
      { type: 'line', label: 'AOV', data: data.byMonth.map((m) => Math.round(m.aov)), borderColor: GOLD, backgroundColor: GOLD, yAxisID: 'y1' }] }}
    options={{ scales: { y: { ticks: { callback: (v) => (v / 1e6) + 'tr' } }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} />
  );
  const kindChart = data && !empty && data.byKind.length > 0 && (
    <ChartBox type="doughnut" height={250} data={{ labels: data.byKind.map((x) => `${x.label} (${(x.share * 100).toFixed(0)}%)`), datasets: [{ data: data.byKind.map((x) => x.rev), backgroundColor: [NAVY, GOLD, TEAL, '#999'] }] }} options={{ plugins: { legend: { position: 'bottom' } } }} />
  );
  const topCols = (label) => [
    { label: 'Hạng', w: 44, align: 'center', render: (_, i) => i + 1 },
    { label, align: 'left', render: (r) => <span className="font-medium">{r.name}</span> },
    { label: 'SL bán', get: (r) => num(r.qty) },
    { label: 'Doanh thu', get: (r) => money(r.rev) },
    { label: '% nhóm', get: (r) => pc(r.pctKind) }
  ];
  const groupCols = [
    { label: 'Nhóm khách', render: (r) => <span className="font-medium">{r.label}</span> },
    { label: 'Doanh thu', get: (r) => money(r.rev) },
    { label: 'Số HĐ', get: (r) => num(r.inv) },
    { label: 'Số khách', get: (r) => num(r.people) },
    { label: 'DT/HĐ', get: (r) => money(r.aov) },
    { label: '% DT', get: (r) => pc(r.share) }
  ];
  const socialRow = data && !empty ? { label: 'TỔNG MẠNG XÃ HỘI', ...data.customerGroups.social } : null;
  const weekdayTable = (cols2) => (data && !empty && <Tbl cols={cols2} rows={data.byWeekday.cur.map((r, i) => ({ ...r, c: data.byWeekday.cmp[i] }))} />);

  return (
    <>
      <Head>
        <title>Báo Cáo Doanh Thu</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-3 text-center text-white" style={{ backgroundColor: NAVY }}>
          <h1 className="text-lg font-bold tracking-wide">{(branchInfo?.branch_name || 'FEN IZAKAYA').toUpperCase()} — BÁO CÁO KINH DOANH</h1>
          <p className="text-xs" style={{ color: '#cfe3df' }}>Doanh thu quản trị = Tiền hàng + Phí DV − Khuyến mại − Thuế được giảm</p>
        </header>
        <BranchNav branch={branch} active="revenue" branchName={branchInfo?.branch_name} />

        <div className="p-3 space-y-2" style={{ maxWidth: 1600, margin: '0 auto' }}>
          {/* bộ lọc */}
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-end gap-3">
            <div><label className="block font-semibold mb-0.5">Cửa hàng</label>
              <select value={branch || ''} onChange={(e) => { setYear(''); setMonth(''); setCmp('auto'); setKind(''); setCategory(''); setGroup(''); router.push(`/revenue-report?branch=${e.target.value}`); }} className="border px-2 py-1 rounded">
                {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Năm</label>
              <select value={year} onChange={(e) => { setYear(e.target.value); setCmp('auto'); }} className="border px-2 py-1 rounded">
                {(years.length ? years : [year]).filter(Boolean).map((y) => <option key={y} value={y}>{y}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Tháng</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="border px-2 py-1 rounded">
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">So sánh với tháng</label>
              <select value={cmp} onChange={(e) => setCmp(e.target.value)} className="border px-2 py-1 rounded">
                <option value="auto">Tháng trước (tự động)</option>
                <option value="none">Không so sánh</option>
                {meta && meta.months.filter((m) => !(year && month && m === `${year}-${String(month).padStart(2, '0')}`)).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Nhóm món ăn</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className="border px-2 py-1 rounded">
                <option value="">Tất cả</option>{meta && meta.kinds.map((x) => <option key={x} value={x}>{x}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Nhóm thực đơn</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="border px-2 py-1 rounded" style={{ maxWidth: 180 }}>
                <option value="">Tất cả</option>{meta && meta.categories.map((x) => <option key={x} value={x}>{x}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Nhóm khách</label>
              <select value={group} onChange={(e) => setGroup(e.target.value)} className="border px-2 py-1 rounded">
                <option value="">Tất cả</option>{meta && meta.groups.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select></div>
            <div><label className="block font-semibold mb-0.5">Bán ít khi SL &lt;</label>
              <input type="number" min="1" value={lowQty} onChange={(e) => setLowQty(Math.max(1, Number(e.target.value) || 5))} className="border px-2 py-1 rounded text-right" style={{ width: 60 }} /></div>
            {(kind || category || group || cmp !== 'auto') && <button onClick={() => { setKind(''); setCategory(''); setGroup(''); setCmp('auto'); }} className="px-2 py-1 rounded border bg-white text-red-600 font-bold">✕ Xóa lọc</button>}
            <button onClick={() => window.print()} className="ml-auto px-3 py-1.5 rounded border bg-white font-bold">🖨 In / lưu PDF</button>
          </div>
          {data && !empty && data.itemMode && <p className="bg-yellow-50 border border-yellow-300 text-yellow-900 rounded p-2">Đang lọc theo nhóm món: doanh thu là tiền hàng của các món được lọc (đã trừ khuyến mại món), số HĐ là số hóa đơn có món đó, chưa cộng phí dịch vụ.</p>}

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded font-bold border ${tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{t.label}</button>)}
          </div>

          {loading && <p className="p-4 text-gray-600">Đang tải…</p>}
          {error && <p className="p-3 bg-red-50 text-red-700 rounded border border-red-300">❌ {error}</p>}
          {!loading && empty && (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu hóa đơn. Cài tiện ích Chrome bản <b>1.7.2</b> rồi vào <b>Đồng bộ & ghép món</b>, chọn tháng và bấm Đồng bộ để lấy dữ liệu hóa đơn từ CUKCUK.</p>
          )}

          {!loading && data && !empty && (
            <>
              {/* ===== DASHBOARD ===== */}
              {tab === 'dash' && (
                <div className="space-y-2">
                  <p className="font-bold text-sm" style={{ color: NAVY }}>Đang xem: {branchInfo?.branch_name} — {monthLabel(data.ym)}{hasCmp ? ` (so sánh ${cmpTxt})` : ''}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Kpi label="TỔNG DOANH THU QUẢN TRỊ" color={NAVY} value={`${money(k.cur.rev)} đ`} sub={hasCmp && delta(ratio(k.cur.rev, k.cmp.rev))} />
                    <Kpi label="SỐ HÓA ĐƠN" color={TEAL} value={money(k.cur.inv)} sub={hasCmp && delta(ratio(k.cur.inv, k.cmp.inv))} />
                    <Kpi label="DOANH THU TB/HĐ (AOV)" color={GOLD} value={`${money(k.cur.aov)} đ`} sub={hasCmp && delta(ratio(k.cur.aov, k.cmp.aov))} />
                    <Kpi label="SỐ KHÁCH" color={NAVY} value={money(k.cur.people)} sub={hasCmp && delta(ratio(k.cur.people, k.cmp.people))} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Kpi label="DOANH THU TB/KHÁCH" color={NAVY} value={`${money(k.cur.perGuest)} đ`} sub={hasCmp && delta(ratio(k.cur.perGuest, k.cmp.perGuest))} />
                    <Kpi label="TỔNG KHUYẾN MẠI" color={TEAL} value={`${money(k.cur.promo)} đ`} sub={hasCmp && delta(ratio(k.cur.promo, k.cmp.promo))} />
                    <Kpi label="TỔNG PHÍ DỊCH VỤ" color={GOLD} value={`${money(k.cur.fee)} đ`} sub={hasCmp && delta(ratio(k.cur.fee, k.cmp.fee))} />
                  </div>
                  <h2 className="font-bold text-sm pt-2" style={{ color: NAVY }}>PHÂN TÍCH TRỰC QUAN (theo bộ lọc đang chọn)</h2>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    <Card title="Doanh thu & Số HĐ theo khung giờ">{hourChart}</Card>
                    <Card title="Xu hướng doanh thu & AOV theo tháng">{monthChart}</Card>
                    <Card title="Cơ cấu Đồ ăn / Đồ uống">{kindChart}</Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="TOP 15 ĐỒ ĂN BÁN CHẠY (theo doanh thu)"><Tbl cols={topCols('Món ăn')} rows={data.topFood} /></Card>
                    <Card title="TOP 15 ĐỒ UỐNG BÁN CHẠY (theo doanh thu)"><Tbl cols={topCols('Đồ uống')} rows={data.topDrink} /></Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="DOANH THU THEO NHÓM KHÁCH"><Tbl cols={groupCols} rows={data.customerGroups.cur} foot={socialRow && ['TỔNG MẠNG XÃ HỘI', money(socialRow.rev), num(socialRow.inv), num(socialRow.people), money(socialRow.aov), pc(socialRow.share)]} /></Card>
                    <Card title="DOANH THU THEO NỀN TẢNG MẠNG XÃ HỘI (chưa VAT)">
                      <Tbl cols={[{ label: 'Nền tảng', render: (r) => <span className="font-medium">{r.label}</span> }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'DT/HĐ', get: (r) => money(r.aov) }, { label: '% Tổng DT', get: (r) => pc(r.share) }]}
                        rows={data.platforms} foot={socialRow && ['TỔNG MẠNG XÃ HỘI', num(socialRow.inv), money(socialRow.rev), money(socialRow.aov), pc(socialRow.share)]} />
                    </Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="DOANH THU THEO THỨ">
                      {weekdayTable([{ label: 'Thứ', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'DT/HĐ', get: (r) => money(r.aov) }])}
                    </Card>
                    <Card title="DOANH THU THEO NHÓM MÓN ĂN">
                      <Tbl cols={[{ label: 'Loại', align: 'left', get: (r) => r.kind }, { label: 'Nhóm', align: 'left', get: (r) => r.category }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'SL bán', get: (r) => num(r.qty) }, { label: '% DT', get: (r) => pc(r.share) }]} rows={data.byKindCategory} />
                    </Card>
                  </div>
                  <Card title="DOANH THU THEO NHÓM KHÁCH × THÁNG">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <span className="font-medium">{r.label}</span> }, ...data.groupByMonth.months.map((m, i) => ({ label: m, get: (r) => money(r.rev[i]) }))]}
                      rows={[...data.groupByMonth.rows, data.groupByMonth.social, data.groupByMonth.all]} />
                  </Card>
                  <Card title="DOANH THU KHÁCH WG THEO QUỐC GIA">
                    <Tbl cols={[{ label: 'Quốc gia', render: (r) => <span className="font-medium">{r.label}</span> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: 'DT/HĐ', get: (r) => money(r.aov) }, { label: '% DT', get: (r) => pc(r.share) }]} rows={data.wgCountries} />
                  </Card>
                </div>
              )}

              {/* ===== BÁO CÁO THÁNG ===== */}
              {tab === 'month' && (
                <div className="space-y-2">
                  <p className="font-bold text-sm" style={{ color: NAVY }}>{branchInfo?.branch_name} — BÁO CÁO PHÂN TÍCH KINH DOANH {monthLabel(data.ym).toUpperCase()}</p>
                  <Card title={`1. CHỈ TIÊU KINH DOANH CHÍNH${hasCmp ? ` (so với ${cmpTxt})` : ''}`}>
                    <Tbl cols={[{ label: 'Chỉ tiêu', align: 'left', get: (r) => r.a }, { label: 'Tháng này', get: (r) => r.b }, { label: 'Dự tính cả tháng', get: (r) => r.f }, { label: hasCmp ? cmpTxt : 'Tháng so sánh', get: (r) => r.c }, { label: 'Thay đổi', render: (r) => delta(r.d) }]}
                      rows={[
                        { a: 'Doanh thu thuần', b: money(k.cur.rev), f: money(k.forecast), c: hasCmp ? money(k.cmp.rev) : '—', d: hasCmp ? ratio(k.forecast, k.cmp.rev) : null },
                        { a: `Doanh thu trung bình / ngày (${k.daysElapsed} ngày)`, b: money(k.avgPerDay), f: '', c: hasCmp ? money(k.cmpAvgPerDay) : '—', d: hasCmp ? ratio(k.avgPerDay, k.cmpAvgPerDay) : null },
                        { a: 'Số hóa đơn', b: money(k.cur.inv), f: money(k.daysElapsed ? (k.cur.inv / k.daysElapsed) * k.daysInMonth : 0), c: hasCmp ? money(k.cmp.inv) : '—', d: hasCmp ? ratio(k.daysElapsed ? (k.cur.inv / k.daysElapsed) * k.daysInMonth : 0, k.cmp.inv) : null },
                        { a: 'Số khách', b: money(k.cur.people), f: money(k.daysElapsed ? (k.cur.people / k.daysElapsed) * k.daysInMonth : 0), c: hasCmp ? money(k.cmp.people) : '—', d: hasCmp ? ratio(k.daysElapsed ? (k.cur.people / k.daysElapsed) * k.daysInMonth : 0, k.cmp.people) : null },
                        { a: 'AOV (đ/HĐ)', b: money(k.cur.aov), f: '', c: hasCmp ? money(k.cmp.aov) : '—', d: hasCmp ? ratio(k.cur.aov, k.cmp.aov) : null },
                        { a: 'DT bình quân / khách', b: money(k.cur.perGuest), f: '', c: hasCmp ? money(k.cmp.perGuest) : '—', d: hasCmp ? ratio(k.cur.perGuest, k.cmp.perGuest) : null },
                        { a: 'Số món bán ra', b: money(k.itemsSold), f: '', c: hasCmp ? money(k.cmpItemsSold) : '—', d: hasCmp ? ratio(k.itemsSold, k.cmpItemsSold) : null }
                      ]} />
                  </Card>
                  {hasCmp && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                      {[['1b. SO SÁNH DOANH THU THEO TUẦN (Thứ Hai → Chủ nhật)', data.weeksMon], ['1c. SO SÁNH DOANH THU THEO TUẦN (7 ngày từ đầu tháng)', data.weeks7]].map(([title, w]) => (
                        <Card key={title} title={title}>
                          <Tbl cols={[{ label: 'Tuần', get: (r) => r.label }, { label: cmpTxt, align: 'left', render: (r) => <span>{r.c ? r.c.range : '—'}</span> }, { label: `DT ${cmpTxt}`, get: (r) => (r.c ? money(r.c.rev) : '—') }, { label: 'Tháng này', align: 'left', get: (r) => r.range }, { label: 'DT tháng này', get: (r) => money(r.rev) }, { label: 'HĐ', get: (r) => num(r.inv) }, { label: '%', render: (r) => delta(r.c && r.c.rev ? ratio(r.rev, r.c.rev) : null) }]}
                            rows={w.cur.map((r, i) => ({ ...r, c: w.cmp[i] }))} />
                        </Card>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="2. CƠ CẤU DOANH THU (ĐỒ ĂN / ĐỒ UỐNG)"><Tbl cols={[{ label: 'Nhóm', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Tỷ trọng', get: (r) => pc(r.share) }, { label: 'SL bán', get: (r) => num(r.qty) }]} rows={data.byKind} /></Card>
                    <Card title="3. DOANH THU THEO NHÓM THỰC ĐƠN"><Tbl cols={[{ label: 'Nhóm thực đơn', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Tỷ trọng', get: (r) => pc(r.share) }, { label: 'SL bán', get: (r) => num(r.qty) }, ...(hasCmp ? [{ label: `% so ${cmpTxt}`, render: (r) => { const c = data.categoryCmp.find((x) => x.label === r.label); return delta(c && c.rev ? ratio(r.rev, c.rev) : null); } }] : [])]} rows={data.byCategory} /></Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                    <Card title="4. DOANH THU THEO KHU VỰC"><Tbl cols={[{ label: 'Khu vực', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'AOV', get: (r) => money(r.aov) }]} rows={data.byArea} /></Card>
                    <Card title="4b. DOANH THU THEO CA"><Tbl cols={[{ label: 'Ca', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'AOV', get: (r) => money(r.aov) }]} rows={data.byShift} /></Card>
                    <Card title="5. DOANH THU THEO KHUNG GIỜ"><Tbl cols={[{ label: 'Khung giờ', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'AOV', get: (r) => money(r.aov) }]} rows={data.byHour.cur} /></Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="6. DOANH THU THEO THỨ TRONG TUẦN">{weekdayTable([{ label: 'Thứ', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'AOV', get: (r) => money(r.aov) }])}</Card>
                    <Card title="8. XU HƯỚNG DOANH THU THEO THÁNG"><Tbl cols={[{ label: 'Tháng', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: 'AOV', get: (r) => money(r.aov) }]} rows={data.byMonth} /></Card>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="7. TOP 15 MÓN BÁN CHẠY (theo doanh thu)"><Tbl cols={[{ label: 'Hạng', w: 44, align: 'center', render: (_, i) => i + 1 }, { label: 'Món', align: 'left', render: (r) => r.name }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'SL', get: (r) => num(r.qty) }]} rows={data.topRev} /></Card>
                    <Card title="7b. TOP 15 MÓN BÁN CHẠY (theo số lượng)"><Tbl cols={[{ label: 'Hạng', w: 44, align: 'center', render: (_, i) => i + 1 }, { label: 'Món', align: 'left', render: (r) => r.name }, { label: 'SL', get: (r) => num(r.qty) }, { label: 'Doanh thu', get: (r) => money(r.rev) }]} rows={data.topQty} /></Card>
                  </div>
                  <Card title="9. NHẬN XÉT & KHUYẾN NGHỊ">{data.tips.length ? <ul className="list-disc ml-5 space-y-1 p-2">{data.tips.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="p-2 text-gray-500">Chưa đủ dữ liệu.</p>}</Card>
                </div>
              )}

              {/* ===== NHÓM KHÁCH ===== */}
              {tab === 'cust' && (
                <div className="space-y-2">
                  <p className="font-bold text-sm" style={{ color: NAVY }}>{branchInfo?.branch_name} — BÁO CÁO DOANH THU THEO NHÓM KHÁCH — {monthLabel(data.ym)}</p>
                  <p className="text-gray-600">Phân nhóm theo ký hiệu trong Tên khách hàng: WG (vãng lai), FB, TT/TikTok, ZL/Zalo, IG, HL/Hotline, CTV, MKT, GG, KOL/KOC/SOCIAL; không có ký hiệu → Khách khác. Doanh thu = tiền hàng + phí DV − khuyến mại − thuế được giảm.</p>
                  <Card title="DOANH THU THEO NHÓM KHÁCH × TUẦN (7 ngày từ đầu tháng)">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <b>{r.label}</b> }, ...data.weeks7.cur.map((w, i) => ({ label: `${w.label} (${w.range})`, get: (r) => money(r.weeks[i]) })), { label: 'Tổng cộng', get: (r) => money(r.rev) }]}
                      rows={[...data.customerGroups.cur, { label: 'TỔNG MẠNG XÃ HỘI', ...data.customerGroups.social }]} />
                  </Card>
                  <Card title="SỐ HÓA ĐƠN & DOANH THU BÌNH QUÂN THEO NHÓM KHÁCH">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <b>{r.label}</b> }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'DT TB/HĐ', get: (r) => money(r.aov) }, { label: 'DT TB/khách', get: (r) => money(r.perGuest) }, { label: '% DT', get: (r) => pc(r.share) }, ...(hasCmp ? [{ label: `% so ${cmpTxt}`, render: (r) => { const c = data.customerGroups.cmp.find((x) => x.key === r.key); return delta(c && c.rev ? ratio(r.rev, c.rev) : null); } }] : [])]}
                      rows={[...data.customerGroups.cur, { label: 'TỔNG MẠNG XÃ HỘI', ...data.customerGroups.social }]} />
                  </Card>
                  <Card title="DOANH THU THEO NỀN TẢNG MẠNG XÃ HỘI (chưa VAT)">
                    <Tbl cols={[{ label: 'Nền tảng', render: (r) => <b>{r.label}</b> }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'DT TB/HĐ', get: (r) => money(r.aov) }, { label: '% Tổng DT', get: (r) => pc(r.share) }]} rows={data.platforms} foot={socialRow && ['TỔNG MẠNG XÃ HỘI', num(socialRow.inv), num(socialRow.people), money(socialRow.rev), money(socialRow.aov), pc(socialRow.share)]} />
                  </Card>
                  <Card title="DOANH THU NHÓM F&B × TUẦN TRONG THÁNG">
                    <Tbl cols={[{ label: 'Nhóm F&B', render: (r) => <b>{r.label}</b> }, ...data.weeks7.cur.map((w, i) => ({ label: w.label, get: (r) => money(r.weeks[i]) })), { label: 'Tổng cộng', get: (r) => money(r.weeks.reduce((a, v) => a + v, 0)) }]} rows={data.byKindWeek} />
                  </Card>
                  <Card title="CHI TIẾT THEO NHÓM THỰC ĐƠN">
                    <Tbl cols={[{ label: 'Nhóm thực đơn', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'SL bán', get: (r) => num(r.qty) }, { label: '% DT', get: (r) => pc(r.share) }]} rows={data.byCategory} />
                  </Card>
                  <Card title="DOANH THU KHÁCH WG THEO QUỐC GIA × TUẦN">
                    <Tbl cols={[{ label: 'Quốc gia', render: (r) => <b>{r.label}</b> }, ...data.weeks7.cur.map((w, i) => ({ label: w.label, get: (r) => money(r.weeks[i]) })), { label: 'Tổng cộng', get: (r) => money(r.rev) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: '% DT', get: (r) => pc(r.share) }]} rows={data.wgCountries} />
                  </Card>
                </div>
              )}

              {/* ===== SO SÁNH TĂNG / GIẢM ===== */}
              {tab === 'cmp' && (
                <div className="space-y-2">
                  <p className="font-bold text-sm" style={{ color: NAVY }}>{branchInfo?.branch_name} — BÁO CÁO SO SÁNH TĂNG/GIẢM — Năm {data.year}{hasCmp ? ` · ${monthLabel(data.ym)} so với ${cmpTxt}` : ''}</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <Card title="1) SO SÁNH THEO THÁNG (so với tháng trước)">
                      <Tbl cols={[{ label: 'Tháng', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: '% so tháng trước', render: (r) => delta(r.prevPct) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: 'Số khách', get: (r) => num(r.people) }, { label: 'AOV', get: (r) => money(r.aov) }]} rows={data.byMonth} />
                    </Card>
                    <Card title="Biểu đồ doanh thu theo tháng">{monthChart}</Card>
                  </div>
                  <Card title="2) SO SÁNH THEO TUẦN (ISO, so với tuần trước)">
                    <Tbl cols={[{ label: 'Tuần', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: '% so tuần trước', render: (r) => delta(r.prevPct) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: '% HĐ so tuần trước', render: (r) => delta(r.prevInvPct) }]} rows={data.byIsoWeek} />
                  </Card>
                  {hasCmp ? (
                    <Card title={`3) SO SÁNH THEO THỨ TRONG TUẦN: ${monthLabel(data.ym)} so với ${cmpTxt}`}>
                      <Tbl cols={[{ label: 'Thứ', render: (r) => <b>{r.label}</b> }, { label: 'Doanh thu', get: (r) => money(r.rev) }, { label: 'Số ngày', get: (r) => r.days }, { label: 'DT TB/ngày', get: (r) => money(r.avgDay) }, { label: 'Số HĐ', get: (r) => num(r.inv) }, { label: `DT ${cmpTxt}`, get: (r) => money(r.c.rev) }, { label: 'Số ngày', get: (r) => r.c.days }, { label: 'DT TB/ngày', get: (r) => money(r.c.avgDay) }, { label: 'Số HĐ', get: (r) => num(r.c.inv) }, { label: 'Chênh lệch DT', get: (r) => money(r.rev - r.c.rev) }, { label: '% DT', render: (r) => delta(ratio(r.rev, r.c.rev)) }, { label: '% DT TB/ngày', render: (r) => delta(ratio(r.avgDay, r.c.avgDay)) }]}
                        rows={data.byWeekday.cur.map((r, i) => ({ ...r, c: data.byWeekday.cmp[i] }))}
                        foot={['Tổng', money(k.cur.rev), k.daysElapsed, money(k.avgPerDay), num(k.cur.inv), money(k.cmp.rev), k.cmpDays, money(k.cmpAvgPerDay), num(k.cmp.inv), money(k.cur.rev - k.cmp.rev), pc(ratio(k.cur.rev, k.cmp.rev)), pc(ratio(k.avgPerDay, k.cmpAvgPerDay))]} />
                    </Card>
                  ) : <p className="bg-white border rounded p-3 text-gray-600">Chọn "So sánh với tháng" ở bộ lọc phía trên để xem so sánh theo thứ trong tuần giữa hai tháng.</p>}
                  <Card title={`4) MA TRẬN DOANH THU: THỨ × TUẦN TRONG ${monthLabel(data.ym).toUpperCase()}`}>
                    <Tbl cols={[{ label: 'Thứ', render: (r) => <b>{r.label}</b> }, ...data.weeks7.cur.map((w, i) => ({ label: w.label, get: (r) => money(r.weeks[i]) })), { label: 'Tổng', get: (r) => money(r.weeks.reduce((a, v) => a + v, 0)) }]} rows={data.matrixWeekday} />
                  </Card>
                  <Card title="5) DOANH THU THEO NHÓM KHÁCH × THÁNG">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <b>{r.label}</b> }, ...data.groupByMonth.months.map((m, i) => ({ label: m, get: (r) => money(r.rev[i]) }))]} rows={[...data.groupByMonth.rows, data.groupByMonth.social, data.groupByMonth.all]} />
                  </Card>
                  <Card title="6) SỐ HÓA ĐƠN THEO NHÓM KHÁCH × THÁNG">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <b>{r.label}</b> }, ...data.groupByMonth.months.map((m, i) => ({ label: m, get: (r) => num(r.inv[i]) }))]} rows={[...data.groupByMonth.rows, data.groupByMonth.social, data.groupByMonth.all]} />
                  </Card>
                  <Card title="7) % TĂNG/GIẢM DOANH THU NHÓM KHÁCH SO VỚI THÁNG TRƯỚC">
                    <Tbl cols={[{ label: 'Nhóm khách', render: (r) => <b>{r.label}</b> }, ...data.groupByMonth.months.map((m, i) => ({ label: m, render: (r) => (i === 0 ? '—' : delta(r.rev[i - 1] ? ratio(r.rev[i], r.rev[i - 1]) : null)) }))]} rows={[...data.groupByMonth.rows, data.groupByMonth.social, data.groupByMonth.all]} />
                  </Card>
                </div>
              )}

              {/* ===== TỐC ĐỘ BÁN MÓN ===== */}
              {tab === 'speed' && (
                <div className="space-y-2">
                  <p className="font-bold text-sm" style={{ color: NAVY }}>{branchInfo?.branch_name} — PHÂN TÍCH TỐC ĐỘ BÁN MÓN (ABC/PARETO) — {monthLabel(data.ym)}</p>
                  <p className="text-gray-600">Bán chạy = trong 70% sản lượng đầu · Bán chậm = từ 70% đến 95% · Bán rất ít = 5% cuối · Chưa bán được = không có lần bán nào trong kỳ (so với thực đơn CUKCUK). "Bán ít" là cảnh báo theo ngưỡng SL bạn đặt ở bộ lọc.</p>
                  {data.notInMenu.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-yellow-900">
                      <b>⚠ CẢNH BÁO: {data.notInMenu.length} món có bán nhưng chưa có trong danh mục thực đơn:</b> {data.notInMenu.map((x) => `${x.name} (SL ${num(x.qty)})`).join('; ')}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    {[['', 'Tất cả', data.speed.length], ['fast', '🟢 Bán chạy', data.speedSummary.fast], ['slow', '🟡 Bán chậm', data.speedSummary.slow], ['veryslow', '🟠 Bán rất ít', data.speedSummary.veryslow], ['none', '⚫ Chưa bán được', data.speedSummary.none], ['low', `⚠ Bán ít (< ${lowQty})`, data.speedSummary.low]].map(([key, label, n]) => (
                      <button key={key || 'all'} onClick={() => setSpeedClass(key)} className={`px-3 py-1.5 rounded font-bold border ${speedClass === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{label} ({n})</button>
                    ))}
                  </div>
                  {speedRows.length === 0 ? <p className="bg-white border rounded p-4 text-gray-600">Không có món nào.</p> : (
                    <DataTable columns={speedCols} allRows={speedRows} rows={speedVisible} rowKey={(r) => r.code} filters={speedFilters} onFiltersChange={setSpeedFilters} sort={speedSort} onSortChange={setSpeedSort} maxHeight="calc(100vh - 380px)" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
