import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BranchNav from '../components/BranchNav';
import DataTable, { filterRows, sortRows } from '../components/DataTable';
import SearchSelect from '../components/SearchSelect';
import DateRangeBar, { presetRange } from '../components/DateRangeBar';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const fmtDate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

export default function Payables() {
  const router = useRouter();
  const { branch } = router.query;
  const [branchInfo, setBranchInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState('debt');
  const [debtFilters, setDebtFilters] = useState({});
  const [debtSort, setDebtSort] = useState({ key: 'balance', dir: 'desc' });
  const [payFilters, setPayFilters] = useState({});
  const [paySort, setPaySort] = useState({ key: 'date', dir: 'desc' });
  const [saving, setSaving] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [openText, setOpenText] = useState('');
  const [openAsOf, setOpenAsOf] = useState('2026-09-30');
  const [openMsg, setOpenMsg] = useState('');

  const load = async (f, t) => {
    if (!branch) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (f) qs.set('from', f);
      if (t) qs.set('to', t);
      const json = await (await fetch(`/api/payables/${branch}?${qs.toString()}`)).json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!branch) return;
    fetch(`/api/branches/${branch}`).then((r) => r.json()).then((d) => d.success && setBranchInfo(d.data)).catch(() => {});
    const [f, t] = presetRange('month');
    setFrom(f);
    setTo(t);
    load(f, t);
  }, [branch]);

  const assign = async (refId, supplierCode, ignore) => {
    setSaving(refId);
    try {
      await fetch('/api/payables/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, refId, supplierCode: supplierCode || null, ignore: !!ignore }) });
      await load(from, to);
    } finally {
      setSaving('');
    }
  };

  // Mỗi dòng: Tên NCC [tab/khoảng trắng] số tiền (dán từ Excel). Số cuối dòng là số tiền.
  const parseOpening = (text) => text.split(/\r?\n/).map((line) => {
    const m = line.trim().match(/^(.*?)[\t ]+(-?[\d.,]+)\s*$/);
    if (!m) return null;
    const amount = Number(m[2].replace(/[.,]/g, ''));
    const name = m[1].replace(/^\d+[\t ]+/, '').trim();
    return name && Number.isFinite(amount) && amount !== 0 ? { name, amount: m[2].startsWith('-') ? -Math.abs(amount) : amount } : null;
  }).filter(Boolean);
  const saveOpening = async () => {
    const rows = parseOpening(openText);
    if (!rows.length) { setOpenMsg('❌ Chưa đọc được dòng nào. Mỗi dòng gồm: Tên NCC, dấu tab/khoảng trắng, số tiền.'); return; }
    const j = await (await fetch('/api/payables/opening', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, asOf: openAsOf, rows }) })).json();
    if (!j.success) { setOpenMsg('❌ ' + j.message); return; }
    setOpenModal(false);
    setOpenMsg('');
    await load(from, to);
  };

  const suppliers = data ? data.suppliers : [];
  const payments = data ? data.payments : [];
  const supOptions = useMemo(() => (data ? data.supplierOptions.map((s) => ({ value: s.code, label: s.name })) : []), [data]);

  const debtColumns = [
    { key: 'code', label: 'Mã NCC', width: 96, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.code}</span> },
    { key: 'name', label: 'Nhà cung cấp', type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'opening', label: 'Nợ đầu kỳ', width: 118, type: 'number', align: 'right', render: (r) => (r.opening ? money(r.opening) : <span className="text-gray-300">—</span>) },
    { key: 'goods', label: 'Tiền hàng', width: 118, type: 'number', align: 'right', render: (r) => money(r.goods) },
    { key: 'vat', label: 'Tiền VAT', width: 100, type: 'number', align: 'right', render: (r) => (r.vat ? money(r.vat) : <span className="text-gray-300">—</span>) },
    { key: 'purchases', label: 'Tổng cộng (hàng + VAT)', width: 150, type: 'number', align: 'right', render: (r) => <b>{money(r.purchases)}</b> },
    { key: 'paid', label: 'Đã chi trả (quỹ TM/NH)', width: 150, type: 'number', align: 'right', render: (r) => <span className="text-green-700">{money(r.paid)}</span> },
    { key: 'balance', label: 'Nợ cuối kỳ', width: 124, type: 'number', align: 'right', render: (r) => <b className={r.balance > 0 ? 'text-red-600' : ''}>{money(r.balance)}</b> }
  ];
  const debtVisible = useMemo(
    () => sortRows(filterRows(suppliers, debtColumns, debtFilters), debtColumns, debtSort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers, debtFilters, debtSort]
  );

  const payColumns = [
    { key: 'date', label: 'Ngày', width: 92, type: 'text', render: (r) => fmtDate(r.date) },
    { key: 'ref_no', label: 'Số chứng từ', width: 108, type: 'text', render: (r) => <span className="font-mono">{r.ref_no}</span> },
    { key: 'source', label: 'Quỹ', width: 92, type: 'select', get: (r) => (r.source === 'BANK' ? 'Tiền gửi' : 'Tiền mặt') },
    { key: 'amount', label: 'Số tiền', width: 110, type: 'number', align: 'right', render: (r) => <b>{money(r.amount)}</b> },
    { key: 'reason', label: 'Lý do / Mục chi', type: 'text', get: (r) => `${r.reason || ''} ${r.budget_item ? '[' + r.budget_item + ']' : ''}`, render: (r) => <span>{r.reason}{r.budget_item && <span className="text-gray-500"> [{r.budget_item}]</span>}</span> },
    { key: 'supplier_name', label: 'Nhà cung cấp', width: 300, type: 'text', get: (r) => (r.how === 'ignored' ? '(không phải trả NCC)' : r.supplier_name || '(chưa gán)'), noTitle: true,
      render: (r) => (
        <div className="flex items-center gap-1">
          <SearchSelect className="flex-1" options={supOptions} value={r.supplier_code || ''} onChange={(v) => assign(r.ref_id, v, false)} placeholder={r.how === 'ignored' ? '(không phải trả NCC)' : r.supplier_name ? `${r.supplier_name}${r.how === 'auto' ? ' (tự nhận)' : ''}` : '🔍 Gán NCC…'} />
          {r.how !== 'ignored' ? <button disabled={saving === r.ref_id} onClick={() => assign(r.ref_id, null, true)} title="Không phải trả NCC" className="shrink-0 px-1.5 rounded border bg-white text-gray-500">✕</button>
            : <button disabled={saving === r.ref_id} onClick={() => assign(r.ref_id, null, false)} title="Khôi phục" className="shrink-0 px-1.5 rounded border bg-white text-blue-600">↺</button>}
        </div>
      ) }
  ];
  const payVisible = useMemo(
    () => sortRows(filterRows(payments, payColumns, payFilters), payColumns, paySort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, payFilters, paySort, saving, supOptions]
  );

  const totals = useMemo(() => ({
    opening: debtVisible.reduce((s, r) => s + r.opening, 0),
    goods: debtVisible.reduce((s, r) => s + r.goods, 0),
    vat: debtVisible.reduce((s, r) => s + r.vat, 0),
    purchases: debtVisible.reduce((s, r) => s + r.purchases, 0),
    paid: debtVisible.reduce((s, r) => s + r.paid, 0),
    balance: debtVisible.reduce((s, r) => s + r.balance, 0)
  }), [debtVisible]);
  const unassigned = payments.filter((p) => !p.supplier_code && p.how !== 'ignored');

  return (
    <>
      <Head>
        <title>Theo Dõi Công Nợ</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen bg-gray-100 text-xs">
        <header className="px-6 py-2 text-white" style={{ backgroundColor: '#0073C5' }}>
          <h1 className="text-base font-bold">THEO DÕI CÔNG NỢ NHÀ CUNG CẤP</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · Mua hàng + chứng từ chi quỹ tiền mặt / tiền gửi ngân hàng</p>
        </header>
        <BranchNav branch={branch} active="payables" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1500, margin: '0 auto' }}>
          <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onApply={(f, t) => load(f, t)}>
            <span className="text-gray-600">Nợ cuối kỳ = Nợ đầu kỳ + Tổng cộng (tiền hàng + VAT) − Chi trả đã gán cho NCC (quỹ tiền mặt / tiền gửi).{data && data.openingAsOf ? ` Nợ đầu kỳ chốt đến hết ngày ${fmtDate(data.openingAsOf)}.` : ' Chưa nhập nợ đầu kỳ.'}</span>
          </DateRangeBar>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nợ đầu kỳ</p><p className="text-lg font-bold">{money(totals.opening)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Tiền hàng</p><p className="text-lg font-bold">{money(totals.goods)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Tiền VAT</p><p className="text-lg font-bold">{money(totals.vat)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Tổng cộng phải trả</p><p className="text-lg font-bold text-blue-700">{money(totals.purchases)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Đã chi trả</p><p className="text-lg font-bold text-green-700">{money(totals.paid)} ₫</p></div>
            <div className="bg-white rounded border px-3 py-2"><p className="text-gray-500">Nợ cuối kỳ</p><p className="text-lg font-bold text-red-600">{money(totals.balance)} ₫</p></div>
          </div>

          <div className="bg-white rounded border px-3 py-2 flex flex-wrap items-center gap-2">
            <button onClick={() => setTab('debt')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'debt' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>📋 Công nợ theo NCC</button>
            <button onClick={() => { setOpenModal(true); setOpenMsg(''); }} className="px-3 py-1.5 rounded font-bold border bg-white text-gray-700 ml-auto">📥 Nhập nợ đầu kỳ</button>
            <button onClick={() => setTab('pay')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'pay' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>💵 Chứng từ chi ({payments.length})</button>
            {unassigned.length > 0 && <span className="text-orange-600 font-bold">⚠ {unassigned.length} chứng từ chi chưa gán NCC ({money(unassigned.reduce((s, p) => s + p.amount, 0))} ₫)</span>}
          </div>

          {loading ? (
            <p className="p-4 text-gray-600">Đang tải…</p>
          ) : !data || (suppliers.length === 0 && payments.length === 0) ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu công nợ. Vào mục <b>Đồng bộ & ghép món</b>, cài tiện ích bản <b>1.3.1</b> rồi bấm "Đồng bộ doanh số từ CUKCUK" để lấy công nợ và chứng từ chi.</p>
          ) : tab === 'debt' ? (
            <DataTable
              columns={debtColumns} allRows={suppliers} rows={debtVisible} rowKey={(r) => r.code}
              filters={debtFilters} onFiltersChange={setDebtFilters} sort={debtSort} onSortChange={setDebtSort}
              maxHeight="calc(100vh - 380px)"
              footer={[
                <td key="l" colSpan={2} className="px-2 py-1 text-right">Tổng ({debtVisible.length} NCC):</td>,
                <td key="o" className="px-2 py-1 text-right">{money(totals.opening)}</td>,
                <td key="g" className="px-2 py-1 text-right">{money(totals.goods)}</td>,
                <td key="v" className="px-2 py-1 text-right">{money(totals.vat)}</td>,
                <td key="a" className="px-2 py-1 text-right">{money(totals.purchases)}</td>,
                <td key="b" className="px-2 py-1 text-right">{money(totals.paid)}</td>,
                <td key="c" className="px-2 py-1 text-right">{money(totals.balance)}</td>
              ]}
            />
          ) : (
            <DataTable
              columns={payColumns} allRows={payments} rows={payVisible} rowKey={(r) => r.ref_id}
              filters={payFilters} onFiltersChange={setPayFilters} sort={paySort} onSortChange={setPaySort}
              maxHeight="calc(100vh - 380px)"
            />
          )}
          {openModal && (
            <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-5 space-y-3">
                <h3 className="text-lg font-bold">Nhập nợ đầu kỳ nhà cung cấp</h3>
                <p className="text-gray-600">Dán từ Excel: mỗi dòng gồm <b>Tên nhà cung cấp</b> và <b>số tiền nợ</b> (ví dụ cột "Cuối kỳ" của bảng công nợ tháng trước). Dán lại sẽ thay toàn bộ nợ đầu kỳ cũ. App ghép theo tên NCC; NCC nào không trùng tên với danh sách trên CUKCUK vẫn được hiện thành dòng riêng.</p>
                <div><label className="block font-semibold mb-0.5">Nợ chốt đến hết ngày</label><input type="date" value={openAsOf} onChange={(e) => setOpenAsOf(e.target.value)} className="border px-2 py-1 rounded" /></div>
                <textarea value={openText} onChange={(e) => setOpenText(e.target.value)} rows={12} className="w-full border rounded p-2 font-mono" placeholder={'NHẬT VƯỢNG\t40,674,750\nSIMBA\t34,345,032'} />
                {openMsg && <p className="text-red-600 font-bold">{openMsg}</p>}
                <p className="text-gray-500">Đọc được {parseOpening(openText).length} dòng.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setOpenModal(false)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Hủy</button>
                  <button onClick={saveOpening} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold">Lưu nợ đầu kỳ</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
