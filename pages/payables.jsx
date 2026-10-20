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
  const [openSearch, setOpenSearch] = useState('');
  const [onlyDebt, setOnlyDebt] = useState(true);
  const [showPaste, setShowPaste] = useState(false);
  const [rowMsg, setRowMsg] = useState('');

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

  const dayBefore = (d) => (d ? new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : '');
  const saveOpeningRow = async (r, patch) => {
    const amount = patch.amount !== undefined ? patch.amount : r.amount;
    const asOf = patch.as_of || r.as_of || dayBefore(from);
    if (!asOf) { setRowMsg('❌ Hãy chọn ngày chốt nợ'); return; }
    const j = await (await fetch('/api/payables/opening/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, code: r.code, name: r.name, amount, asOf }) })).json();
    setRowMsg(j.success ? '✅ Đã lưu nợ đầu kỳ ' + r.name : '❌ ' + j.message);
    await load(from, to);
  };
  const resetOpeningRow = async (r) => {
    await fetch('/api/payables/opening/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branchId: branch, code: r.code }) });
    setRowMsg('↺ Đã quay về số đồng bộ từ CUKCUK: ' + r.name);
    await load(from, to);
  };
  const SRC = { CUKCUK: ['Đồng bộ CUKCUK', 'text-blue-700'], IMPORT: ['Dán từ Excel', 'text-purple-700'], MANUAL: ['Sửa tay', 'text-orange-600'] };
  const openingRows = data ? data.openingRows || [] : [];
  const openingShown = openingRows.filter((r) => (!onlyDebt || r.amount) && (!openSearch || String(r.name).toLowerCase().includes(openSearch.toLowerCase())));

  const suppliers = data ? data.suppliers : [];
  const payments = data ? data.payments : [];
  const supOptions = useMemo(() => (data ? data.supplierOptions.map((s) => ({ value: s.code, label: s.name })) : []), [data]);

  const debtColumns = [
    { key: 'code', label: 'Mã NCC', width: 96, type: 'text', render: (r) => <span className="font-mono text-blue-700">{r.code}</span> },
    { key: 'name', label: 'Nhà cung cấp', type: 'text', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'opening', label: 'Nợ đầu kỳ', width: 118, type: 'number', align: 'right', render: (r) => (r.opening ? money(r.opening) : <span className="text-gray-300">—</span>) },
    { key: 'goods', label: 'Tiền hàng', width: 118, type: 'number', align: 'right', render: (r) => money(r.goods) },
    { key: 'vat', label: 'Tiền VAT', width: 100, type: 'number', align: 'right', render: (r) => (r.vat ? money(r.vat) : <span className="text-gray-300">—</span>) },
    ...(data && data.ck ? [{ key: 'other', label: 'Phát sinh khác (chi phí, CCDC…)', width: 150, type: 'number', align: 'right', render: (r) => (r.other ? money(r.other) : <span className="text-gray-300">—</span>) }] : []),
    { key: 'purchases', label: data && data.ck ? 'Tổng tăng trong kỳ (CUKCUK)' : 'Tổng cộng (hàng + VAT)', width: 150, type: 'number', align: 'right', render: (r) => <b>{money(r.purchases)}</b> },
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
    other: debtVisible.reduce((s, r) => s + (r.other || 0), 0),
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
        <header className="px-6 py-2 text-white text-center" style={{ backgroundColor: '#0073C5', minHeight: 72, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 className="text-base font-bold">THEO DÕI CÔNG NỢ NHÀ CUNG CẤP</h1>
          <p className="text-blue-200">Chi nhánh: {branchInfo?.branch_name || 'Đang tải…'} · Mua hàng + chứng từ chi quỹ tiền mặt / tiền gửi ngân hàng</p>
        </header>
        <BranchNav branch={branch} active="payables" branchName={branchInfo?.branch_name} />

        <div className="p-4 space-y-2" style={{ maxWidth: 1500, margin: '0 auto' }}>
          <DateRangeBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onApply={(f, t) => load(f, t)}>
            <span className="text-gray-600">Nợ cuối kỳ = Nợ đầu kỳ + Phát sinh tăng − Đã chi trả. Khi đã đồng bộ, các số này lấy theo báo cáo Công nợ nhà cung cấp của CUKCUK nên khớp với CUKCUK; Tiền hàng và VAT lấy từ phiếu mua, phần còn lại là chi phí, CCDC… ghi nợ NCC. Nợ đầu kỳ tự lấy từ công nợ CUKCUK khi đồng bộ (hoặc bạn sửa tay trong nút "Nợ đầu kỳ").</span>
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
            <button onClick={() => { setOpenModal(true); setOpenMsg(''); }} className="px-3 py-1.5 rounded font-bold border bg-white text-gray-700 ml-auto">✏️ Nợ đầu kỳ (tự đồng bộ / sửa)</button>
            <button onClick={() => setTab('pay')} className={`px-3 py-1.5 rounded font-bold border ${tab === 'pay' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700'}`}>💵 Chứng từ chi ({payments.length})</button>
            {unassigned.length > 0 && <span className="text-orange-600 font-bold">⚠ {unassigned.length} chứng từ chi chưa gán NCC ({money(unassigned.reduce((s, p) => s + p.amount, 0))} ₫)</span>}
          </div>

          {loading ? (
            <p className="p-4 text-gray-600">Đang tải…</p>
          ) : !data || (suppliers.length === 0 && payments.length === 0) ? (
            <p className="bg-white rounded border p-6 text-gray-600">Chưa có dữ liệu công nợ. Vào mục <b>Đồng bộ & ghép món</b>, cài tiện ích bản <b>1.9.0</b> rồi bấm "Đồng bộ doanh số từ CUKCUK" để lấy công nợ và chứng từ chi.</p>
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
                ...(data && data.ck ? [<td key="x" className="px-2 py-1 text-right">{money(totals.other)}</td>] : []),
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
              <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-5 space-y-3 max-h-screen overflow-auto">
                <h3 className="text-lg font-bold">Nợ đầu kỳ nhà cung cấp</h3>
                <p className="text-gray-600">Mỗi lần bấm <b>Đồng bộ</b>, app tự lấy nợ đầu kỳ của từng NCC từ công nợ trên CUKCUK (số dư tại ngày trước "Từ ngày" của lần đồng bộ). Bạn có thể <b>sửa tay</b> số tiền hoặc ngày chốt nợ, số sửa tay luôn được ưu tiên và không bị đồng bộ ghi đè. Bấm ↺ để quay về số của CUKCUK.</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input value={openSearch} onChange={(e) => setOpenSearch(e.target.value)} placeholder="Tìm nhà cung cấp…" className="border px-2 py-1 rounded" style={{ width: 240 }} />
                  <label className="flex items-center gap-1 font-semibold"><input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} /> Chỉ NCC có nợ đầu kỳ</label>
                  <span className="text-gray-500">{openingShown.length}/{openingRows.length} NCC</span>
                  {rowMsg && <span className="font-bold">{rowMsg}</span>}
                </div>
                <div className="border rounded overflow-auto" style={{ maxHeight: 380 }}>
                  <table className="w-full border-collapse">
                    <thead><tr className="bg-gray-100 sticky top-0">{['Nhà cung cấp', 'Nợ đầu kỳ (đ)', 'Chốt đến hết ngày', 'Nguồn', ''].map((h) => <th key={h} className="border px-2 py-1 text-left">{h}</th>)}</tr></thead>
                    <tbody>
                      {openingShown.map((r) => (
                        <tr key={r.code + String(r.amount) + String(r.as_of) + r.source}>
                          <td className="border px-2 py-1 font-medium">{r.name}</td>
                          <td className="border px-1 py-0.5"><input type="number" step="any" defaultValue={Number(r.amount) || 0} onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v !== Number(r.amount)) saveOpeningRow(r, { amount: v }); }} className="w-full border rounded text-right" style={{ height: 24, padding: '0 4px' }} /></td>
                          <td className="border px-1 py-0.5"><input type="date" defaultValue={r.as_of || ''} onBlur={(e) => { if (e.target.value && e.target.value !== r.as_of) saveOpeningRow(r, { as_of: e.target.value }); }} className="border rounded" style={{ height: 24 }} /></td>
                          <td className={`border px-2 py-1 font-semibold ${r.source && SRC[r.source] ? SRC[r.source][1] : 'text-gray-400'}`}>{r.source && SRC[r.source] ? SRC[r.source][0] : 'Chưa có'}</td>
                          <td className="border px-2 py-1 text-center">{r.source === 'MANUAL' && <button onClick={() => resetOpeningRow(r)} title="Bỏ số sửa tay, quay về số CUKCUK" className="px-2 rounded border bg-white text-blue-600 font-bold">↺</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <button onClick={() => setShowPaste((v) => !v)} className="font-bold text-blue-700 underline">{showPaste ? '▼' : '▶'} Dán nhanh từ Excel (tên NCC + số tiền)</button>
                  {showPaste && (
                    <div className="space-y-2 mt-2">
                      <p className="text-gray-600">Mỗi dòng gồm <b>Tên nhà cung cấp</b> và <b>số tiền nợ</b>. Dán lại sẽ thay các số đã dán trước đó (số sửa tay không bị ảnh hưởng). App ghép theo tên NCC.</p>
                      <div><label className="block font-semibold mb-0.5">Nợ chốt đến hết ngày</label><input type="date" value={openAsOf} onChange={(e) => setOpenAsOf(e.target.value)} className="border px-2 py-1 rounded" /></div>
                      <textarea value={openText} onChange={(e) => setOpenText(e.target.value)} rows={8} className="w-full border rounded p-2 font-mono" placeholder={'NHẬT VƯỢNG\t40,674,750\nSIMBA\t34,345,032'} />
                      {openMsg && <p className="text-red-600 font-bold">{openMsg}</p>}
                      <div className="flex items-center gap-3"><span className="text-gray-500">Đọc được {parseOpening(openText).length} dòng.</span><button onClick={saveOpening} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold">Lưu số đã dán</button></div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setOpenModal(false)} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 font-bold">Đóng</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
