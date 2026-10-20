import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api, Card, Table, TierBadge, SegmentBadge, Modal, Field, inputCls, money, num, fmtDate } from './ui';

const SORTS = [['spend', 'Tổng chi tiêu'], ['spend12', 'Chi tiêu 12 tháng'], ['visits', 'Số lần ghé'], ['lastVisit', 'Lần ghé gần nhất'], ['points', 'Điểm'], ['avgBill', 'Bill trung bình'], ['name', 'Tên'], ['memberNo', 'Mã thành viên']];

export default function CrmCustomers({ meta, go, isManager }) {
  const [f, setF] = useState({ q: '', branch: '', source: '', tier: '', segment: '', tag: '', owner: '', status: 'active', hasPhone: '', noVisitDays: '', birthdayMonth: '', minSpend: '', maxSpend: '', sort: 'spend', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [more, setMore] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v); });
    return p;
  }, [f]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams(query);
    p.set('page', String(page));
    p.set('pageSize', '50');
    const j = await api('GET', '/api/crm/customers?' + p.toString());
    if (j.success) setData(j.data);
    setLoading(false);
  }, [query, page]);

  useEffect(() => { const t = setTimeout(load, f.q ? 250 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };
  const reset = () => { setF({ q: '', branch: '', source: '', tier: '', segment: '', tag: '', owner: '', status: 'active', hasPhone: '', noVisitDays: '', birthdayMonth: '', minSpend: '', maxSpend: '', sort: 'spend', dir: 'desc' }); setPage(1); };
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-3">
      <Card pad={false}>
        <div className="p-3 flex flex-wrap items-end gap-3">
          <Field label="Tìm khách (tên, SĐT, mã thẻ)" className="flex-1" ><input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Nhập tên, số điện thoại hoặc mã FEN-…" className={inputCls} style={{ minWidth: 220 }} /></Field>
          <Field label="Chi nhánh"><select value={f.branch} onChange={(e) => set('branch', e.target.value)} className={inputCls}><option value="">Tất cả</option>{meta.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></Field>
          <Field label="Hạng thẻ"><select value={f.tier} onChange={(e) => set('tier', e.target.value)} className={inputCls}><option value="">Tất cả</option>{meta.settings.tiers.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></Field>
          <Field label="Phân khúc"><select value={f.segment} onChange={(e) => set('segment', e.target.value)} className={inputCls}><option value="">Tất cả</option>{Object.entries(meta.segments).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Sắp xếp"><select value={f.sort} onChange={(e) => set('sort', e.target.value)} className={inputCls}>{SORTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <button onClick={() => set('dir', f.dir === 'desc' ? 'asc' : 'desc')} className="border rounded-lg px-3 py-1.5 text-sm font-bold bg-white" title="Đảo chiều sắp xếp">{f.dir === 'desc' ? '↓ Giảm dần' : '↑ Tăng dần'}</button>
          <button onClick={() => setMore((v) => !v)} className="border rounded-lg px-3 py-1.5 text-sm font-bold bg-white">⚙ Lọc nâng cao</button>
          <button onClick={() => setShowAdd(true)} className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-4 py-1.5 text-sm font-bold">+ Thêm khách</button>
          {isManager && <a href={'/api/crm/export?' + query.toString()} className="border rounded-lg px-3 py-1.5 text-sm font-bold bg-white">⬇ Xuất Excel (CSV)</a>}
        </div>
        {more && (
          <div className="px-3 pb-3 flex flex-wrap items-end gap-3 border-t pt-3">
            <Field label="Nguồn khách"><select value={f.source} onChange={(e) => set('source', e.target.value)} className={inputCls}><option value="">Tất cả</option>{(data ? data.sources : []).map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Thẻ (tag)"><select value={f.tag} onChange={(e) => set('tag', e.target.value)} className={inputCls}><option value="">Tất cả</option>{(data ? data.tags : []).map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
            <Field label="Phụ trách"><select value={f.owner} onChange={(e) => set('owner', e.target.value)} className={inputCls}><option value="">Tất cả</option>{meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Trạng thái"><select value={f.status} onChange={(e) => set('status', e.target.value)} className={inputCls}><option value="active">Đang chăm sóc</option><option value="vip">VIP</option><option value="blacklist">Danh sách đen</option><option value="inactive">Ngừng chăm sóc</option><option value="all">Tất cả</option></select></Field>
            <Field label="Chi tiêu từ (đ)"><input type="number" value={f.minSpend} onChange={(e) => set('minSpend', e.target.value)} className={inputCls} style={{ width: 130 }} /></Field>
            <Field label="đến (đ)"><input type="number" value={f.maxSpend} onChange={(e) => set('maxSpend', e.target.value)} className={inputCls} style={{ width: 130 }} /></Field>
            <Field label="Lâu chưa quay lại (ngày ≥)"><input type="number" value={f.noVisitDays} onChange={(e) => set('noVisitDays', e.target.value)} className={inputCls} style={{ width: 110 }} /></Field>
            <Field label="Sinh nhật tháng"><select value={f.birthdayMonth} onChange={(e) => set('birthdayMonth', e.target.value)} className={inputCls}><option value="">Tất cả</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</select></Field>
            <label className="flex items-center gap-1.5 text-sm font-semibold pb-2"><input type="checkbox" checked={f.hasPhone === '1'} onChange={(e) => set('hasPhone', e.target.checked ? '1' : '')} /> Chỉ khách có SĐT</label>
            <button onClick={reset} className="text-red-600 font-bold text-sm pb-2">✕ Xóa bộ lọc</button>
          </div>
        )}
      </Card>

      <Card pad={false} title={data ? `${num(data.total)} khách · tổng chi tiêu ${money(data.totalSpend)} đ` : 'Khách hàng'} right={loading ? <span className="text-xs text-gray-500">Đang tải…</span> : null}>
        <Table rows={data ? data.items : []} rowKey={(r) => r.id} onRow={(r) => go('customer', r.id)} empty={loading ? 'Đang tải…' : 'Không có khách nào phù hợp bộ lọc. Khách được tạo tự động từ hóa đơn đã đồng bộ, hoặc bấm "+ Thêm khách".'} cols={[
          { label: 'Khách hàng', render: (r) => <div><div className="font-semibold">{r.name}{r.status === 'vip' ? ' ⭐' : ''}</div><div className="text-xs text-gray-500">{r.memberCode}{r.phone ? ' · ' + r.phone : ''}{r.source ? ' · ' + r.source : ''}</div></div> },
          { label: 'Hạng', render: (r) => <TierBadge tier={r.tier} name={r.tierName} /> },
          { label: 'Phân khúc', render: (r) => <SegmentBadge segment={r.segment} label={meta.segments[r.segment]} /> },
          { label: 'Chi nhánh', render: (r) => <span className="text-xs">{r.branches.map((b) => (meta.branches.find((x) => x.branch_id === b) || {}).branch_name || b).join(', ')}</span> },
          { label: 'Lần ghé', align: 'right', render: (r) => r.visits },
          { label: 'Gần nhất', render: (r) => (r.lastVisit ? <span>{fmtDate(r.lastVisit)} <span className="text-xs text-gray-500">({r.recencyDays}n)</span></span> : '—') },
          { label: 'Bill TB', align: 'right', render: (r) => money(r.avgBill) },
          { label: 'Chi tiêu 12 tháng', align: 'right', render: (r) => money(r.spend12) },
          { label: 'Tổng chi tiêu', align: 'right', render: (r) => <b>{money(r.spend)}</b> },
          { label: 'Điểm', align: 'right', render: (r) => num(r.points) }
        ]} />
        {data && totalPages > 1 && (
          <div className="p-3 flex items-center justify-center gap-3 text-sm">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">‹ Trước</button>
            <span>Trang {page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Sau ›</button>
          </div>
        )}
      </Card>
      {showAdd && <AddCustomer meta={meta} onClose={() => setShowAdd(false)} onDone={(id) => { setShowAdd(false); go('customer', id); }} />}
    </div>
  );
}

function AddCustomer({ meta, onClose, onDone }) {
  const [v, setV] = useState({ name: '', phone: '', email: '', birthday: '', gender: '', company: '', address: '', source: 'Nhập tay', branchId: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const j = await api('POST', '/api/crm/customers', v);
    setBusy(false);
    if (j.success) onDone(j.data.id);
    else if (j.data && j.data.id) { setErr(j.message + ' — bấm để mở hồ sơ.'); setV((x) => ({ ...x, _existing: j.data.id })); } else setErr(j.message);
  };
  return (
    <Modal title="Thêm khách hàng" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Họ tên *" className="col-span-2"><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} /></Field>
        <Field label="Số điện thoại"><input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={inputCls} /></Field>
        <Field label="Email"><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className={inputCls} /></Field>
        <Field label="Ngày sinh"><input type="date" value={v.birthday} onChange={(e) => setV({ ...v, birthday: e.target.value })} className={inputCls} /></Field>
        <Field label="Giới tính"><select value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} className={inputCls}><option value="">—</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></Field>
        <Field label="Công ty"><input value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} className={inputCls} /></Field>
        <Field label="Nguồn"><input value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} className={inputCls} placeholder="Facebook, giới thiệu, khách đoàn…" /></Field>
        <Field label="Chi nhánh phụ trách"><select value={v.branchId} onChange={(e) => setV({ ...v, branchId: e.target.value })} className={inputCls}><option value="">Tất cả</option>{meta.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}</select></Field>
        <Field label="Địa chỉ"><input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className={inputCls} /></Field>
        <Field label="Ghi chú" className="col-span-2"><textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></Field>
      </div>
      <p className="text-xs text-gray-500 mt-2">Nhập số điện thoại để hóa đơn sau này trên POS (tên khách có kèm số điện thoại) tự gắn vào hồ sơ này.</p>
      {err && <p className="text-sm font-semibold text-red-600 mt-2">{err} {v._existing && <button className="underline" onClick={() => onDone(v._existing)}>Mở hồ sơ</button>}</p>}
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 font-bold">Hủy</button><button disabled={busy || !v.name} onClick={save} className="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Lưu</button></div>
    </Modal>
  );
}
