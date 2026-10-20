import React, { useEffect, useState, useCallback } from 'react';
import { api, Card, Modal, Field, inputCls, money, fmtDate, STAGE_LABEL, STAGE_COLOR } from './ui';

const STAGES = ['new', 'consulting', 'quoted', 'deposit', 'won', 'lost'];
const TYPES = ['Đặt tiệc', 'Sự kiện', 'Công ty', 'Đặt bàn đoàn', 'Khác'];

// Bảng cơ hội (pipeline) cho đặt tiệc, sự kiện, khách đoàn, khách công ty
export default function CrmDeals({ meta, go, isManager, branch: tabBranch = '' }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [branch, setBranch] = useState(tabBranch);
  const load = useCallback(async () => { const j = await api('GET', '/api/crm/deals'); if (j.success) setRows(j.data); }, []);
  useEffect(() => { load(); }, [load]);

  const shown = rows.filter((d) => !branch || d.branch_id === branch);
  const move = async (d, stage) => {
    let lostReason = '';
    if (stage === 'lost') { lostReason = window.prompt('Lý do thất bại (không bắt buộc):') || ''; }
    await api('PUT', `/api/crm/deals/${d.id}`, { stage, lostReason });
    load();
  };
  const open = shown.filter((d) => !['won', 'lost'].includes(d.stage));
  const winValue = shown.filter((d) => d.stage === 'won').reduce((a, d) => a + d.expected_value, 0);

  return (
    <div className="space-y-3">
      <Card pad={false}>
        <div className="p-3 flex flex-wrap items-center gap-3">
          {!tabBranch && <select value={branch} onChange={(e) => setBranch(e.target.value)} className={inputCls} style={{ width: 200 }}><option value="">Mọi chi nhánh</option>{meta.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select>}
          <span className="text-sm text-gray-600">Đang theo dõi: <b>{open.length}</b> cơ hội · giá trị dự kiến <b>{money(open.reduce((a, d) => a + d.expected_value, 0))} đ</b> · đã chốt <b className="text-green-700">{money(winValue)} đ</b></span>
          <button onClick={() => setEdit({})} className="ml-auto px-4 py-1.5 rounded-lg bg-blue-700 text-white font-bold text-sm">+ Thêm cơ hội</button>
        </div>
      </Card>
      <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: 'repeat(6, minmax(230px, 1fr))' }}>
        {STAGES.map((s, si) => {
          const col = shown.filter((d) => d.stage === s);
          return (
            <div key={s} className="rounded-xl bg-gray-100 p-2" style={{ minHeight: 300 }}>
              <div className="flex justify-between items-center px-1 pb-2"><b style={{ color: STAGE_COLOR[s] }}>{STAGE_LABEL[s]}</b><span className="text-xs text-gray-500">{col.length} · {money(col.reduce((a, d) => a + d.expected_value, 0))}</span></div>
              <div className="space-y-2">
                {col.map((d) => (
                  <div key={d.id} className="bg-white rounded-lg border shadow-sm p-2.5 text-sm">
                    <button onClick={() => setEdit(d)} className="font-bold text-left hover:underline">{d.title}</button>
                    <div className="text-xs text-gray-500">{d.deal_type}{d.guests ? ' · ' + d.guests + ' khách' : ''}</div>
                    {d.event_date && <div className="text-xs mt-0.5">📅 {fmtDate(d.event_date)}</div>}
                    <div className="text-xs mt-0.5">{d.customer_name ? <button onClick={() => go('customer', d.customer_id)} className="text-blue-700 underline">{d.customer_name}</button> : (d.contact_name || '')}{(d.customer_phone || d.contact_phone) ? ' · ' + (d.customer_phone || d.contact_phone) : ''}</div>
                    <div className="flex justify-between items-center mt-1.5">
                      <b className="text-green-700">{money(d.expected_value)} đ</b>
                      {d.deposit ? <span className="text-xs text-amber-700">Cọc {money(d.deposit)}</span> : null}
                    </div>
                    {d.lost_reason && <div className="text-xs text-red-600 mt-1">Lý do: {d.lost_reason}</div>}
                    <div className="flex gap-1 mt-2">
                      {si > 0 && s !== 'lost' && <button onClick={() => move(d, STAGES[si - 1])} className="px-2 py-0.5 border rounded text-xs">‹</button>}
                      {s !== 'won' && s !== 'lost' && <button onClick={() => move(d, STAGES[si + 1])} className="px-2 py-0.5 border rounded text-xs bg-blue-50 text-blue-700 font-bold">Chuyển ›</button>}
                      {!['won', 'lost'].includes(s) && <button onClick={() => move(d, 'lost')} className="px-2 py-0.5 border rounded text-xs text-red-600 ml-auto">Thất bại</button>}
                      {['won', 'lost'].includes(s) && <button onClick={() => move(d, 'new')} className="px-2 py-0.5 border rounded text-xs ml-auto">Mở lại</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {edit && <DealForm deal={edit.id ? edit : { branch_id: tabBranch }} meta={meta} isManager={isManager} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function DealForm({ deal, meta, isManager, onClose, onDone }) {
  const [v, setV] = useState({ title: deal.title || '', dealType: deal.deal_type || 'Đặt tiệc', branchId: deal.branch_id || '', eventDate: deal.event_date || '', guests: deal.guests || '', expectedValue: deal.expected_value || '', deposit: deal.deposit || '', contactName: deal.contact_name || '', contactPhone: deal.contact_phone || '', notes: deal.notes || '', customerId: deal.customer_id || '' });
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(async () => { const j = await api('GET', '/api/crm/customers?pageSize=10&q=' + encodeURIComponent(q)); if (j.success) setFound(j.data.items); }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const save = async () => {
    const body = { ...v };
    const j = deal.id ? await api('PUT', `/api/crm/deals/${deal.id}`, body) : await api('POST', '/api/crm/deals', body);
    if (!j.success) alert(j.message); else onDone();
  };
  const del = async () => { if (window.confirm('Xóa cơ hội này?')) { await api('DELETE', `/api/crm/deals/${deal.id}`); onDone(); } };
  return (
    <Modal title={deal.id ? 'Sửa cơ hội' : 'Thêm cơ hội'} onClose={onClose} width={640}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên cơ hội *" className="col-span-2"><input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Tiệc sinh nhật 20 người - anh Minh" className={inputCls} /></Field>
        <Field label="Loại"><select value={v.dealType} onChange={(e) => setV({ ...v, dealType: e.target.value })} className={inputCls}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Chi nhánh"><select value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })} className={inputCls}><option value="">—</option>{meta.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></Field>
        <Field label="Ngày tổ chức"><input type="date" value={v.eventDate} onChange={(e) => setV({ ...v, eventDate: e.target.value })} className={inputCls} /></Field>
        <Field label="Số khách"><input type="number" value={v.guests} onChange={(e) => setV({ ...v, guests: e.target.value })} className={inputCls} /></Field>
        <Field label="Giá trị dự kiến (đ)"><input type="number" value={v.expectedValue} onChange={(e) => setV({ ...v, expectedValue: e.target.value })} className={inputCls} /></Field>
        <Field label="Đã đặt cọc (đ)"><input type="number" value={v.deposit} onChange={(e) => setV({ ...v, deposit: e.target.value })} className={inputCls} /></Field>
        <Field label="Gắn với khách hàng trong CRM" className="col-span-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={v.customerId ? `Đang gắn khách #${v.customerId} — gõ để đổi` : 'Gõ tên/số điện thoại để tìm khách…'} className={inputCls} />
          {found.length > 0 && <div className="border rounded-lg mt-1 max-h-40 overflow-auto bg-white">{found.map((c) => <button key={c.id} onClick={() => { setV({ ...v, customerId: c.id, contactName: v.contactName || c.name, contactPhone: v.contactPhone || c.phone }); setQ(''); setFound([]); }} className="block w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm"><b>{c.name}</b> <span className="text-gray-500">{c.memberCode} {c.phone}</span></button>)}</div>}
        </Field>
        <Field label="Người liên hệ"><input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} className={inputCls} /></Field>
        <Field label="SĐT liên hệ"><input value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} className={inputCls} /></Field>
        <Field label="Ghi chú (menu, yêu cầu, trang trí…)" className="col-span-2"><textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></Field>
      </div>
      <div className="flex justify-between mt-4">
        <div>{deal.id && isManager && <button onClick={del} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 font-bold">Xóa</button>}</div>
        <div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 font-bold">Hủy</button><button disabled={!v.title.trim()} onClick={save} className="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Lưu</button></div>
      </div>
    </Modal>
  );
}
