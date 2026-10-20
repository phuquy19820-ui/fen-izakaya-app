import React, { useEffect, useState, useCallback } from 'react';
import MemberCard, { downloadCardPng, CopyLink } from './MemberCard';
import { api, Card, Kpi, Table, TierBadge, SegmentBadge, Badge, Field, inputCls, ChartBox, money, num, fmtDate, fmtDateTime, TYPE_LABEL, STAGE_LABEL, STAGE_COLOR } from './ui';

const TABS = [['overview', 'Hồ sơ'], ['visits', 'Lịch sử ghé'], ['favorites', 'Món yêu thích'], ['interactions', 'Tương tác'], ['tasks', 'Công việc'], ['deals', 'Cơ hội'], ['points', 'Điểm & hạng']];

export default function CrmCustomerDetail({ id, meta, go, isManager }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('overview');

  const load = useCallback(async () => {
    const j = await api('GET', `/api/crm/customers/${id}`);
    if (j.success) setD(j.data); else setErr(j.message);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="p-4"><p className="text-red-600">{err}</p><button onClick={() => go('customers')} className="text-blue-700 font-bold mt-2">← Về danh sách khách</button></div>;
  if (!d) return <p className="p-4 text-gray-500">Đang tải…</p>;
  const c = d.customer;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = `${origin}/card/${c.cardToken}`;
  const branchName = (b) => (meta.branches.find((x) => x.branch_id === b) || {}).branch_name || b;

  return (
    <div className="space-y-3">
      <button onClick={() => go('customers')} className="text-blue-700 font-bold text-sm">← Danh sách khách hàng</button>

      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-4 items-start">
        <div className="space-y-3">
          <MemberCard id="card-crm" name={c.name} memberCode={c.memberCode} tier={c.tier} tierName={c.tierName} points={c.points} since={c.firstVisit || String(c.createdAt || '').slice(0, 10)} link={link} brand={d.settings.brand} />
          <div className="flex flex-wrap gap-2">
            <CopyLink link={link} />
            <button onClick={() => downloadCardPng('card-crm', `the-${c.memberCode}.png`)} className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 font-bold">⬇ Tải ảnh thẻ</button>
            <a href={link} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 font-bold">👁 Xem như khách</a>
          </div>
          {c.nextTier ? (
            <div className="bg-white border rounded-xl p-3">
              <div className="flex justify-between text-xs font-semibold"><span>{c.tierName}</span><span>{c.nextTier.name}</span></div>
              <div className="rounded-full bg-gray-200 mt-1.5 overflow-hidden" style={{ height: 8 }}><div style={{ width: Math.min(100, Math.round((c.tierMetric / c.nextTier.min) * 100)) + '%', height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)' }} /></div>
              <p className="text-xs text-gray-600 mt-1.5">Còn <b>{money(c.nextTier.need)} đ</b> để lên hạng {c.nextTier.name}. Mốc tính hạng: {{ best_month12: 'chi tiêu trong một tháng (12 tháng gần nhất)', rolling12: 'tổng 12 tháng gần nhất', lifetime: 'tổng từ trước đến nay' }[d.settings.tierPeriod]}: <b>{money(c.tierMetric)} đ</b>.</p>
            </div>
          ) : <p className="bg-white border rounded-xl p-3 text-sm font-semibold">🎉 Đã đạt hạng cao nhất</p>}
        </div>

        <div className="space-y-3">
          <div className="bg-white border rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold">{c.name}</h2>
              <TierBadge tier={c.tier} name={c.tierName} />
              <SegmentBadge segment={c.segment} label={meta.segments[c.segment]} />
              {c.status !== 'active' && <Badge color={c.status === 'vip' ? '#d97706' : '#dc2626'}>{{ vip: 'VIP', blacklist: 'Danh sách đen', inactive: 'Ngừng chăm sóc' }[c.status]}</Badge>}
              {c.tierOverride && <Badge color="#8b5cf6">Hạng chỉnh tay</Badge>}
            </div>
            <p className="text-sm text-gray-600 mt-1">{c.memberCode}{c.phone ? ' · 📞 ' + c.phone : ''}{c.email ? ' · ✉️ ' + c.email : ''}{c.source ? ' · Nguồn: ' + c.source : ''}{c.refBy ? ' · Giới thiệu: ' + c.refBy : ''}</p>
            <div className="flex flex-wrap gap-1 mt-1">{c.tags.map((t) => <Badge key={t} color="#0ea5e9">{t}</Badge>)}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label="Tổng chi tiêu" value={money(c.spend) + ' đ'} sub={`${c.invoices} hóa đơn`} />
            <Kpi label="Chi tiêu 12 tháng" value={money(c.spend12) + ' đ'} color="#16a34a" />
            <Kpi label="Số lần ghé" value={num(c.visits)} sub={c.firstVisit ? 'Từ ' + fmtDate(c.firstVisit) : ''} color="#8b5cf6" />
            <Kpi label="Bill trung bình" value={money(c.avgBill) + ' đ'} sub={`${num(c.guests)} lượt khách`} color="#d97706" />
            <Kpi label="Lần ghé gần nhất" value={c.lastVisit ? fmtDate(c.lastVisit) : '—'} sub={c.recencyDays !== null ? `${c.recencyDays} ngày trước` : ''} color="#0ea5e9" />
            <Kpi label="Điểm tích lũy" value={num(c.points)} sub={`1 điểm = ${money(d.settings.pointsRate)} đ`} color="#dc2626" />
          </div>
          <Card title="Chi tiêu theo chi nhánh">
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(c.byBranch).map(([b, v]) => <div key={b} className="border rounded-lg px-3 py-2"><div className="font-bold">{branchName(b)}</div><div>{money(v.spend)} đ · {v.visits} lần · gần nhất {fmtDate(v.lastVisit)}</div></div>)}
              {Object.keys(c.byBranch).length === 0 && <span className="text-gray-500">Chưa có hóa đơn nào gắn với khách này.</span>}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b">
        {TABS.map(([k, label]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-bold rounded-t-lg ${tab === k ? 'bg-white border border-b-0 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>{label}{k === 'interactions' ? ` (${d.interactions.length})` : k === 'tasks' ? ` (${d.tasks.filter((t) => t.status === 'open').length})` : ''}</button>)}
      </div>

      {tab === 'overview' && <Overview d={d} meta={meta} isManager={isManager} reload={load} go={go} />}
      {tab === 'visits' && <Visits d={d} branchName={branchName} />}
      {tab === 'favorites' && <Favorites d={d} />}
      {tab === 'interactions' && <Interactions d={d} reload={load} isManager={isManager} />}
      {tab === 'tasks' && <Tasks d={d} meta={meta} reload={load} />}
      {tab === 'deals' && <Deals d={d} go={go} />}
      {tab === 'points' && <Points d={d} reload={load} isManager={isManager} />}
    </div>
  );
}

function Overview({ d, meta, isManager, reload, go }) {
  const c = d.customer;
  const [v, setV] = useState({ name: c.name, phone: c.phone, email: c.email, gender: c.gender, birthday: c.birthday, address: c.address, company: c.company, source: c.source, notes: c.notes, preferences: c.preferences, allergies: c.allergies, tags: c.tags.join(', '), status: c.status, ownerId: c.ownerId || '', tierOverride: c.tierOverride });
  const [msg, setMsg] = useState('');
  const save = async () => {
    const j = await api('PUT', `/api/crm/customers/${c.id}`, { ...v, tags: v.tags.split(',').map((t) => t.trim()).filter(Boolean), ownerId: v.ownerId || null });
    setMsg(j.success ? '✅ Đã lưu' : '❌ ' + j.message);
    if (j.success) reload();
  };
  const del = async () => {
    if (!window.confirm('Xóa / ngừng chăm sóc khách này?')) return;
    const j = await api('DELETE', `/api/crm/customers/${c.id}`);
    alert(j.message || (j.success ? 'Đã xong' : 'Lỗi'));
    if (j.success) go('customers');
  };
  return (
    <Card title="Thông tin khách hàng">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Họ tên"><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} /></Field>
        <Field label="Số điện thoại"><input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={inputCls} /></Field>
        <Field label="Email"><input value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} className={inputCls} /></Field>
        <Field label="Ngày sinh"><input type="date" value={v.birthday} onChange={(e) => setV({ ...v, birthday: e.target.value })} className={inputCls} /></Field>
        <Field label="Giới tính"><select value={v.gender} onChange={(e) => setV({ ...v, gender: e.target.value })} className={inputCls}><option value="">—</option><option value="Nam">Nam</option><option value="Nữ">Nữ</option></select></Field>
        <Field label="Công ty"><input value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} className={inputCls} /></Field>
        <Field label="Địa chỉ" className="md:col-span-2"><input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className={inputCls} /></Field>
        <Field label="Nguồn khách"><input value={v.source} onChange={(e) => setV({ ...v, source: e.target.value })} className={inputCls} /></Field>
        <Field label="Sở thích ăn uống (món/rượu yêu thích, chỗ ngồi…)" className="md:col-span-3"><textarea rows={2} value={v.preferences} onChange={(e) => setV({ ...v, preferences: e.target.value })} className={inputCls} /></Field>
        <Field label="⚠ Dị ứng / kiêng kỵ" className="md:col-span-3"><textarea rows={2} value={v.allergies} onChange={(e) => setV({ ...v, allergies: e.target.value })} className={inputCls} /></Field>
        <Field label="Ghi chú chung" className="md:col-span-3"><textarea rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} /></Field>
        <Field label="Thẻ (tags), cách nhau dấu phẩy"><input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="VIP, khách công ty, thích sake" className={inputCls} /></Field>
        <Field label="Trạng thái"><select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} className={inputCls}><option value="active">Đang chăm sóc</option><option value="vip">VIP</option><option value="blacklist">Danh sách đen</option><option value="inactive">Ngừng chăm sóc</option></select></Field>
        <Field label="Nhân viên phụ trách"><select value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} className={inputCls}><option value="">Chưa gán</option>{meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        {isManager && <Field label="Chỉnh hạng thẻ thủ công (bỏ qua chi tiêu)"><select value={v.tierOverride} onChange={(e) => setV({ ...v, tierOverride: e.target.value })} className={inputCls}><option value="">Tự động theo chi tiêu</option>{d.settings.tiers.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}</select></Field>}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={save} className="px-5 py-2 rounded-lg bg-blue-700 text-white font-bold">Lưu thay đổi</button>
        {isManager && <button onClick={del} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 font-bold">Xóa / ngừng chăm sóc</button>}
        {msg && <span className="font-semibold text-sm">{msg}</span>}
      </div>
    </Card>
  );
}

function Visits({ d, branchName }) {
  const [open, setOpen] = useState(null);
  return (
    <Card title={`Lịch sử ghé quán (${d.visits.length} hóa đơn gần nhất)`} pad={false}>
      {d.visits.length === 0 ? <p className="p-4 text-gray-500">Chưa có hóa đơn.</p> : d.visits.map((v) => {
        const k = v.branch_id + v.d + v.ref_no;
        return (
          <div key={k} className="border-b">
            <button onClick={() => setOpen(open === k ? null : k)} className="w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50">
              <b className="w-24">{fmtDate(v.d)}</b><span className="text-sm text-gray-600">{branchName(v.branch_id)} · {v.area || ''} {v.time_in ? '· ' + v.time_in : ''}</span>
              <span className="text-sm">{v.people} khách</span><span className="ml-auto font-bold">{money(v.rev)} đ</span><span className="text-gray-400">{open === k ? '▲' : '▼'}</span>
            </button>
            {open === k && <div className="px-6 pb-3 text-sm"><table className="w-full"><tbody>{v.items.map((it, i) => <tr key={i} className="border-t"><td className="py-1">{it.name}</td><td className="text-right w-16">{num(it.qty)}</td><td className="text-right w-28">{money(it.amount)}</td></tr>)}{v.items.length === 0 && <tr><td className="text-gray-500 py-1">Chưa có chi tiết món</td></tr>}</tbody></table>{v.discount ? <p className="text-xs text-amber-700 mt-1">Khuyến mại: {money(v.discount)} đ · Hóa đơn {v.ref_no}</p> : <p className="text-xs text-gray-500 mt-1">Hóa đơn {v.ref_no}</p>}</div>}
          </div>
        );
      })}
    </Card>
  );
}

function Favorites({ d }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title="Món khách hay gọi" pad={false}>
        <Table rows={d.favorites} rowKey={(r) => r.name} empty="Chưa có dữ liệu món." cols={[
          { label: 'Món', render: (r) => <span className="font-semibold">{r.name}</span> }, { label: 'Nhóm', render: (r) => <span className="text-xs text-gray-500">{r.kind}</span> },
          { label: 'Số lượng', align: 'right', render: (r) => num(r.qty) }, { label: 'Thành tiền', align: 'right', render: (r) => money(r.amount) }]} />
      </Card>
      <Card title="Chi tiêu 12 tháng gần nhất">
        <ChartBox type="bar" height={260} data={{ labels: d.monthly.map((m) => m.ym.slice(5) + '/' + m.ym.slice(2, 4)), datasets: [{ label: 'Chi tiêu (đ)', data: d.monthly.map((m) => Math.round(m.spend)), backgroundColor: '#3b82f6' }] }} options={{ plugins: { legend: { display: false } } }} />
      </Card>
    </div>
  );
}

function Interactions({ d, reload, isManager }) {
  const [v, setV] = useState({ type: 'note', content: '', rating: '', followUpDate: '' });
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    const j = await api('POST', `/api/crm/customers/${d.customer.id}/interactions`, v);
    setBusy(false);
    if (!j.success) { alert(j.message); return; }
    setV({ type: 'note', content: '', rating: '', followUpDate: '' });
    reload();
  };
  const del = async (id) => { if (window.confirm('Xóa ghi nhận này?')) { await api('DELETE', `/api/crm/interactions/${id}`); reload(); } };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3">
      <Card title="Ghi nhận tương tác mới">
        <div className="space-y-2">
          <Field label="Loại"><select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={inputCls}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Nội dung"><textarea rows={4} value={v.content} onChange={(e) => setV({ ...v, content: e.target.value })} className={inputCls} placeholder="Đã gọi mời khách đặt tiệc cuối tháng…" /></Field>
          {(v.type === 'feedback' || v.type === 'complaint') && <Field label="Đánh giá (1-5 sao)"><select value={v.rating} onChange={(e) => setV({ ...v, rating: e.target.value })} className={inputCls}><option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'⭐'.repeat(n)}</option>)}</select></Field>}
          <Field label="Hẹn liên hệ lại (tự tạo công việc)"><input type="date" value={v.followUpDate} onChange={(e) => setV({ ...v, followUpDate: e.target.value })} className={inputCls} /></Field>
          <button disabled={busy || !v.content.trim()} onClick={add} className="w-full py-2 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Lưu tương tác</button>
        </div>
      </Card>
      <Card title="Lịch sử chăm sóc" pad={false}>
        {d.interactions.length === 0 ? <p className="p-4 text-gray-500">Chưa có tương tác nào.</p> : d.interactions.map((i) => (
          <div key={i.id} className="px-4 py-3 border-b">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><b className="text-gray-800 text-sm">{TYPE_LABEL[i.type] || i.type}</b>{i.rating ? <span>{'⭐'.repeat(i.rating)}</span> : null}<span>{fmtDateTime(i.created_at)}</span><span>· {i.user_name}</span>{i.follow_up_date && <Badge color="#f59e0b">Hẹn {fmtDate(i.follow_up_date)}</Badge>}{isManager && <button onClick={() => del(i.id)} className="ml-auto text-red-500">Xóa</button>}</div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{i.content}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Tasks({ d, meta, reload }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const add = async () => { const j = await api('POST', '/api/crm/tasks', { customerId: d.customer.id, title, dueDate: due }); if (!j.success) alert(j.message); else { setTitle(''); setDue(''); reload(); } };
  const toggle = async (t) => { await api('PUT', `/api/crm/tasks/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' }); reload(); };
  return (
    <Card title="Công việc liên quan đến khách này">
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Việc cần làm…" className={inputCls} style={{ maxWidth: 360 }} />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} style={{ maxWidth: 160 }} />
        <button disabled={!title.trim()} onClick={add} className="px-4 py-1.5 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">+ Thêm việc</button>
      </div>
      {d.tasks.length === 0 ? <p className="text-gray-500 text-sm">Chưa có công việc.</p> : d.tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 border-t py-2 text-sm">
          <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} />
          <span className={t.status === 'done' ? 'line-through text-gray-400' : 'font-semibold'}>{t.title}</span>
          {t.due_date && <Badge color={t.status !== 'done' && String(t.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10) ? '#dc2626' : '#64748b'}>{fmtDate(t.due_date)}</Badge>}
        </div>
      ))}
    </Card>
  );
}

function Deals({ d, go }) {
  return (
    <Card title="Cơ hội / đơn tiệc của khách" right={<button onClick={() => go('deals')} className="text-blue-700 text-xs font-bold">Mở bảng cơ hội →</button>} pad={false}>
      <Table rows={d.deals} rowKey={(r) => r.id} empty="Khách này chưa có cơ hội nào. Vào mục Cơ hội để tạo đặt tiệc/sự kiện và chọn khách này." cols={[
        { label: 'Cơ hội', render: (r) => <span className="font-semibold">{r.title}</span> }, { label: 'Loại', render: (r) => r.deal_type }, { label: 'Ngày', render: (r) => fmtDate(r.event_date) },
        { label: 'Giai đoạn', render: (r) => <span style={{ color: STAGE_COLOR[r.stage] }} className="font-semibold">{STAGE_LABEL[r.stage]}</span> }, { label: 'Dự kiến', align: 'right', render: (r) => money(r.expected_value) }]} />
    </Card>
  );
}

function Points({ d, reload, isManager }) {
  const [pts, setPts] = useState('');
  const [reason, setReason] = useState('');
  const c = d.customer;
  const save = async () => { const j = await api('POST', `/api/crm/customers/${c.id}/points`, { points: pts, reason }); if (!j.success) alert(j.message); else { setPts(''); setReason(''); reload(); } };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card title="Điểm tích lũy">
        <p className="text-3xl font-extrabold text-red-600">{num(c.points)} điểm</p>
        <p className="text-sm text-gray-600 mt-1">Tự động tích điểm: 1 điểm cho mỗi {money(d.settings.pointsRate)} đ chi tiêu. Cộng/trừ thủ công (đổi quà, tặng điểm) hiển thị bên dưới.</p>
        {isManager && (
          <div className="flex flex-wrap gap-2 mt-3">
            <input type="number" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="+100 hoặc -50" className={inputCls} style={{ maxWidth: 140 }} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (đổi quà, tặng sinh nhật…)" className={inputCls} style={{ maxWidth: 280 }} />
            <button disabled={!pts} onClick={save} className="px-4 py-1.5 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Ghi nhận</button>
          </div>
        )}
        <h4 className="font-bold text-sm mt-4 mb-1">Lịch sử cộng/trừ thủ công</h4>
        {d.ledger.length === 0 ? <p className="text-gray-500 text-sm">Chưa có.</p> : d.ledger.map((l) => <div key={l.id} className="flex justify-between border-t py-1.5 text-sm"><span>{l.reason}<span className="text-xs text-gray-500"> · {fmtDateTime(l.created_at)} · {l.user_name}</span></span><b className={l.points > 0 ? 'text-green-700' : 'text-red-600'}>{l.points > 0 ? '+' : ''}{l.points}</b></div>)}
      </Card>
      <Card title="Hạng thẻ & quyền lợi">
        <div className="space-y-2">
          {d.settings.tiers.map((t) => (
            <div key={t.key} className={`rounded-lg border p-3 ${t.key === c.tier ? 'border-yellow-500 bg-yellow-50' : ''}`}>
              <div className="flex justify-between font-bold"><span>{t.key === c.tier ? '▶ ' : ''}{t.name}</span><span className="text-sm text-gray-600">{t.min ? 'từ ' + money(t.min) + ' đ' : 'Mặc định'}</span></div>
              <ul className="text-xs text-gray-600 mt-1 list-disc ml-5">{t.perks.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
