import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import MonthPicker from '../components/MonthPicker';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const mil = (n) => ((Number(n) || 0) / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const ymLabel = (ym) => `${ym.slice(5)}/${ym.slice(0, 4)}`;

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
function ChartBox({ type, data, options, height = 280 }) {
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

const LEVEL = {
  high: { icon: '🔴', label: 'Nghiêm trọng', cls: 'bg-red-50 border-red-300 text-red-900' },
  warn: { icon: '🟠', label: 'Cần chú ý', cls: 'bg-yellow-50 border-yellow-300 text-yellow-900' },
  info: { icon: '🔵', label: 'Lưu ý', cls: 'bg-blue-50 border-blue-200 text-blue-900' }
};
const VERDICT = {
  red: { cls: 'bg-red-600', text: '🔴 DÒNG TIỀN ĐANG CÓ VẤN ĐỀ', sub: 'Có từ 2 cảnh báo nghiêm trọng — cần xử lý sớm.' },
  yellow: { cls: 'bg-yellow-500', text: '🟠 DÒNG TIỀN CẦN THEO DÕI SÁT', sub: 'Chưa nguy cấp nhưng có dấu hiệu căng thẳng.' },
  green: { cls: 'bg-green-600', text: '🟢 DÒNG TIỀN TƯƠNG ĐỐI KHỎE', sub: 'Chưa thấy cảnh báo nghiêm trọng trong kỳ đã chọn.' }
};

export default function Cashflow() {
  const router = useRouter();
  const { branch } = router.query;
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [months, setMonths] = useState(6);
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (y, m, n) => {
    if (!branch) return;
    setLoading(true); setError('');
    try {
      const j = await (await fetch(`/api/cashflow/${branch}?year=${y}&month=${m}&months=${n}`)).json();
      if (j.success) setData(j.data); else setError(j.message || 'Lỗi');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    load(year, month, months);
  }, [branch]);
  const pick = (y, m) => { setYear(y); setMonth(m); load(y, m, months); };
  const pickN = (n) => { setMonths(n); load(year, month, n); };

  const rows = data ? data.rows : [];
  const L = rows.length ? rows[rows.length - 1] : null;
  const K = data ? data.kpi : null;
  const labels = rows.map((r) => ymLabel(r.ym));

  return (
    <>
      <Head>
        <title>Phân tích dòng tiền</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="text-base font-bold">PHÂN TÍCH DÒNG TIỀN VÀO - RA CỦA DOANH NGHIỆP</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · doanh thu, chi quỹ, công nợ NCC, tồn kho NVL - hàng hóa - CCDC</p>
        </header>
        <BranchNav branch={branch} active="cashflow" branchName={branchInfo?.branch_name} />
        <div className="p-4 space-y-3" style={{ maxWidth: 1500, margin: '0 auto' }}>
          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-3">
            <span className="font-semibold">Tháng cuối kỳ:</span>
            <MonthPicker year={year} month={month} onChange={pick} />
            <span className="font-semibold ml-2">Xem:</span>
            {[3, 6, 12].map((n) => <button key={n} onClick={() => pickN(n)} className={`px-3 py-1 rounded border font-bold ${months === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>{n} tháng</button>)}
          </div>

          {error && <p className="bg-red-50 border border-red-300 text-red-700 rounded p-2">❌ {error}</p>}
          {loading ? <p className="p-4 text-gray-600">Đang phân tích (lần đầu có thể mất vài giây)…</p> : data && L && (
            <>
              <div className={`${VERDICT[data.verdict].cls} text-white rounded p-3`}>
                <div className="text-base font-bold">{VERDICT[data.verdict].text}</div>
                <div>{VERDICT[data.verdict].sub} Tháng {ymLabel(L.ym)}: thu {mil(L.revenue)} triệu, chi {mil(L.pay_total)} triệu, dòng tiền thuần <b>{L.net < 0 ? '-' : '+'}{mil(Math.abs(L.net))} triệu</b>. {data.counts.high} cảnh báo nghiêm trọng, {data.counts.warn} cần chú ý.</div>
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tiền vào (doanh thu thuần)</div><div className="text-lg font-bold text-green-700">{money(L.revenue)}</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tiền ra (chi quỹ)</div><div className="text-lg font-bold text-orange-700">{money(L.pay_total)}</div><div className="text-gray-500">{K.outPct !== null ? `${(K.outPct * 100).toFixed(0)}% doanh thu` : ''}</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Dòng tiền thuần tháng</div><div className={`text-lg font-bold ${L.net < 0 ? 'text-red-600' : 'text-blue-800'}`}>{money(L.net)}</div><div className="text-gray-500">Lũy kế {data.months} tháng: {money(K.cumNet)}</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Công nợ NCC cuối tháng</div><div className="text-lg font-bold">{money(L.debt_end)}</div><div className="text-gray-500">{K.dpo !== null ? `≈ ${K.dpo.toFixed(0)} ngày mua hàng` : ''}</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Tồn kho cuối tháng</div><div className="text-lg font-bold">{L.stock_close !== null ? money(L.stock_close) : '—'}</div><div className="text-gray-500">{K.dio !== null ? `NVL + hàng hóa đủ dùng ≈ ${K.dio.toFixed(0)} ngày` : ''}</div></div>
                <div className="bg-white rounded border p-3"><div className="text-gray-500">Giá vốn / doanh thu</div><div className={`text-lg font-bold ${K.cogsPct > 0.4 ? 'text-red-600' : ''}`}>{K.cogsPct !== null ? (K.cogsPct * 100).toFixed(1) + '%' : '—'}</div><div className="text-gray-500">giá trị xuất kho NVL + hàng hóa</div></div>
              </div>

              <div className="bg-white rounded border">
                <h3 className="px-3 py-2 font-bold text-sm border-b">Cảnh báo & nhận định ({data.alerts.length})</h3>
                <div className="p-2 space-y-1.5">
                  {data.alerts.length === 0 && <p className="text-green-700 font-bold p-2">✅ Không có cảnh báo nào trong kỳ đã chọn.</p>}
                  {data.alerts.map((a, i) => (
                    <div key={i} className={`border rounded p-2 ${LEVEL[a.level].cls}`}>
                      <div className="font-bold">{LEVEL[a.level].icon} {a.title}</div>
                      <div>{a.detail}</div>
                      {a.advice && <div className="mt-0.5 italic">→ {a.advice}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
                <div className="bg-white rounded border p-2">
                  <h3 className="font-bold text-sm mb-1">Tiền vào - tiền ra - dòng tiền thuần (triệu đồng)</h3>
                  <ChartBox type="bar" data={{ labels, datasets: [
                    { label: 'Tiền vào (doanh thu)', data: rows.map((r) => r.revenue / 1e6), backgroundColor: '#16a34a' },
                    { label: 'Chi trả NCC', data: rows.map((r) => r.pay_ncc / 1e6), backgroundColor: '#f97316' },
                    { label: 'Chi khác', data: rows.map((r) => r.pay_other / 1e6), backgroundColor: '#a855f7' },
                    { type: 'line', label: 'Dòng tiền thuần', data: rows.map((r) => r.net / 1e6), borderColor: '#1d4ed8', backgroundColor: '#1d4ed8', tension: 0.2 }
                  ] }} />
                </div>
                <div className="bg-white rounded border p-2">
                  <h3 className="font-bold text-sm mb-1">Công nợ NCC và tồn kho cuối tháng (triệu đồng)</h3>
                  <ChartBox type="line" data={{ labels, datasets: [
                    { label: 'Công nợ NCC', data: rows.map((r) => r.debt_end / 1e6), borderColor: '#dc2626', backgroundColor: '#dc2626', tension: 0.2 },
                    { label: 'Tồn kho (tổng)', data: rows.map((r) => (r.stock_close === null ? null : r.stock_close / 1e6)), borderColor: '#0891b2', backgroundColor: '#0891b2', tension: 0.2 },
                    { label: 'Mua hàng trong tháng', data: rows.map((r) => r.purchases / 1e6), borderColor: '#9ca3af', backgroundColor: '#9ca3af', borderDash: [5, 4], tension: 0.2 }
                  ] }} />
                </div>
              </div>

              <div className="bg-white rounded border">
                <h3 className="px-3 py-2 font-bold text-sm border-b">Bảng dòng tiền theo tháng (đồng)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="w-full" style={{ minWidth: 1250 }}>
                    <thead className="bg-gray-100"><tr>
                      {['Tháng', 'Tiền vào (doanh thu thuần)', 'Mua hàng (phát sinh nợ)', 'Chi trả NCC', 'Chi khác', 'Tổng tiền ra', 'Dòng tiền thuần', 'Lũy kế', 'Công nợ NCC cuối tháng', 'Nợ tăng/giảm', 'Tồn NVL thực phẩm', 'Tồn hàng hóa/đồ uống', 'Tồn CCDC', 'Xuất kho (giá vốn)', '% giá vốn'].map((h) => <th key={h} className="px-2 py-1.5 text-right first:text-left border-b">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.ym} className="border-b hover:bg-gray-50">
                          <td className="px-2 py-1 font-bold">{ymLabel(r.ym)}</td>
                          <td className="px-2 py-1 text-right">{money(r.revenue)}</td>
                          <td className="px-2 py-1 text-right">{money(r.purchases)}</td>
                          <td className="px-2 py-1 text-right">{money(r.pay_ncc)}</td>
                          <td className="px-2 py-1 text-right">{money(r.pay_other)}</td>
                          <td className="px-2 py-1 text-right font-bold">{money(r.pay_total)}</td>
                          <td className={`px-2 py-1 text-right font-bold ${r.net < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(r.net)}</td>
                          <td className={`px-2 py-1 text-right ${r.cum < 0 ? 'text-red-600' : ''}`}>{money(r.cum)}</td>
                          <td className="px-2 py-1 text-right">{money(r.debt_end)}</td>
                          <td className={`px-2 py-1 text-right ${r.debt_change > 0 ? 'text-red-600' : 'text-green-700'}`}>{r.debt_change > 0 ? '+' : ''}{money(r.debt_change)}</td>
                          <td className="px-2 py-1 text-right">{r.stock_by_group ? money(r.stock_by_group.food) : '—'}</td>
                          <td className="px-2 py-1 text-right">{r.stock_by_group ? money(r.stock_by_group.drink) : '—'}</td>
                          <td className="px-2 py-1 text-right">{r.stock_by_group ? money(r.stock_by_group.ccdc) : '—'}</td>
                          <td className="px-2 py-1 text-right">{r.cogs !== null ? money(r.cogs) : '—'}</td>
                          <td className={`px-2 py-1 text-right ${r.cogs !== null && r.revenue > 0 && r.cogs / r.revenue > 0.4 ? 'text-red-600 font-bold' : ''}`}>{r.cogs !== null && r.revenue > 0 ? (r.cogs / r.revenue * 100).toFixed(1) + '%' : '—'}</td>
                        </tr>
                      ))}
                      <tr className="bg-blue-50 font-bold">
                        <td className="px-2 py-1">Tổng cộng</td>
                        <td className="px-2 py-1 text-right">{money(rows.reduce((a, r) => a + r.revenue, 0))}</td>
                        <td className="px-2 py-1 text-right">{money(rows.reduce((a, r) => a + r.purchases, 0))}</td>
                        <td className="px-2 py-1 text-right">{money(rows.reduce((a, r) => a + r.pay_ncc, 0))}</td>
                        <td className="px-2 py-1 text-right">{money(rows.reduce((a, r) => a + r.pay_other, 0))}</td>
                        <td className="px-2 py-1 text-right">{money(rows.reduce((a, r) => a + r.pay_total, 0))}</td>
                        <td className="px-2 py-1 text-right">{money(K.cumNet)}</td>
                        <td colSpan={8}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
                <div className="bg-white rounded border">
                  <h3 className="px-3 py-2 font-bold text-sm border-b">Khoản chi khác (chưa gán NCC) lớn nhất trong kỳ</h3>
                  <table className="w-full"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Khoản mục</th><th className="px-2 py-1 text-right">Số tiền</th></tr></thead>
                    <tbody>{data.topOther.map((x) => <tr key={x.name} className="border-t"><td className="px-2 py-1">{x.name}</td><td className="px-2 py-1 text-right">{money(x.amount)}</td></tr>)}
                      {data.topOther.length === 0 && <tr><td colSpan={2} className="px-2 py-2 text-gray-500">Không có.</td></tr>}</tbody></table>
                  {data.ignoredAmt > 0 && <p className="px-3 py-2 text-gray-500 border-t">Chưa tính {money(data.ignoredAmt)} đ chứng từ đã đánh dấu "không phải trả NCC" (ở mục Công nợ NCC).</p>}
                </div>
                <div className="bg-white rounded border">
                  <h3 className="px-3 py-2 font-bold text-sm border-b">NCC còn nợ nhiều nhất cuối tháng {ymLabel(L.ym)}</h3>
                  <table className="w-full"><thead className="bg-gray-100"><tr><th className="px-2 py-1 text-left">Nhà cung cấp</th><th className="px-2 py-1 text-right">Dư nợ</th><th className="px-2 py-1 text-right">Tỷ trọng</th></tr></thead>
                    <tbody>{data.topSuppliers.map((x) => <tr key={x.name} className="border-t"><td className="px-2 py-1">{x.name}</td><td className="px-2 py-1 text-right">{money(x.balance)}</td><td className="px-2 py-1 text-right">{(x.share * 100).toFixed(0)}%</td></tr>)}
                      {data.topSuppliers.length === 0 && <tr><td colSpan={3} className="px-2 py-2 text-gray-500">Không có công nợ.</td></tr>}</tbody></table>
                </div>
              </div>

              <div className="bg-white rounded border p-3 text-gray-600 space-y-1">
                <p><b>Cách tính:</b> Tiền vào = doanh thu thuần theo hóa đơn CUKCUK (tiền hàng − khuyến mại + phí dịch vụ − thuế được giảm), coi như thu trong tháng. Tiền ra = chứng từ chi quỹ tiền mặt / tiền gửi đã đồng bộ (trả NCC + chi khác). Dòng tiền thuần = vào − ra.</p>
                <p>Công nợ NCC = dư nợ cuối tháng ở mục Công nợ NCC. Tồn kho lấy từ báo cáo nhập - xuất - tồn của CUKCUK, chia NVL thực phẩm / hàng hóa (đồ uống) / CCDC; xuất kho (giá vốn) = tồn đầu + nhập − tồn cuối của NVL thực phẩm và hàng hóa.</p>
                <p>Ngưỡng cảnh báo tham khảo: giá vốn &gt; 40% (nghiêm trọng &gt; 45%) doanh thu; nợ NCC &gt; 30 ngày (nghiêm trọng &gt; 45 ngày); tồn kho &gt; 30 ngày (nghiêm trọng &gt; 45 ngày); dòng tiền thuần âm. <b>Lưu ý:</b> app chưa có số dư quỹ tiền mặt / ngân hàng, lương và thuế chỉ được tính nếu đã chi qua quỹ và đồng bộ chứng từ; đây là nhận định từ số liệu sẵn có, không thay thế sổ kế toán.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
