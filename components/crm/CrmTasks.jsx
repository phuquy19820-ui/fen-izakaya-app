import React, { useEffect, useState, useCallback } from 'react';
import ContactBar from './Contact';
import { api, Card, Badge, Modal, Field, inputCls, fmtDate } from './ui';

const PRIO = { high: ['Cao', '#dc2626'], normal: ['Thường', '#64748b'], low: ['Thấp', '#0ea5e9'] };

export default function CrmTasks({ meta, go, isManager }) {
  const [status, setStatus] = useState('open');
  const [scope, setScope] = useState(isManager ? 'all' : 'mine');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const j = await api('GET', `/api/crm/tasks?status=${status}&scope=${scope}`);
    if (j.success) setRows(j.data);
    setLoading(false);
  }, [status, scope]);
  useEffect(() => { load(); }, [load]);

  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const toggle = async (t) => { await api('PUT', `/api/crm/tasks/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' }); load(); };
  const del = async (t) => { if (window.confirm('Xóa công việc này?')) { await api('DELETE', `/api/crm/tasks/${t.id}`); load(); } };
  const generate = async () => {
    const j = await api('POST', '/api/crm/tasks/generate');
    setMsg(j.success ? `✅ Đã tạo ${j.data.created} công việc chăm sóc (sinh nhật sắp tới, khách có nguy cơ rời bỏ).` : '❌ ' + j.message);
    load();
  };

  return (
    <div className="space-y-3">
      <Card pad={false}>
        <div className="p-3 flex flex-wrap items-center gap-2">
          {[['open', 'Đang mở'], ['done', 'Đã xong'], ['all', 'Tất cả']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-lg border font-bold text-sm ${status === k ? 'bg-blue-700 text-white border-blue-700' : 'bg-white'}`}>{l}</button>)}
          {isManager && <select value={scope} onChange={(e) => setScope(e.target.value)} className={inputCls} style={{ width: 170 }}><option value="all">Công việc của mọi người</option><option value="mine">Chỉ của tôi</option></select>}
          <button onClick={generate} className="px-3 py-1.5 rounded-lg border bg-white font-bold text-sm">✨ Tự tạo việc chăm sóc</button>
          <button onClick={() => setShow(true)} className="ml-auto px-4 py-1.5 rounded-lg bg-blue-700 text-white font-bold text-sm">+ Thêm công việc</button>
        </div>
        {msg && <p className="px-3 pb-2 text-sm font-semibold">{msg}</p>}
      </Card>
      <Card pad={false}>
        {loading ? <p className="p-4 text-gray-500">Đang tải…</p> : rows.length === 0 ? <p className="p-4 text-gray-500">Không có công việc nào.</p> : rows.map((t) => {
          const overdue = t.status === 'open' && t.due_date && t.due_date < today;
          return (
            <div key={t.id} className="flex items-start gap-3 px-4 py-2.5 border-b hover:bg-gray-50">
              <input type="checkbox" className="mt-1" checked={t.status === 'done'} onChange={() => toggle(t)} />
              <div className="flex-1 min-w-0">
                <div className={t.status === 'done' ? 'line-through text-gray-400' : 'font-semibold'}>{t.title}</div>
                {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  {t.customer_name && <button onClick={() => go('customer', t.customer_id)} className="text-blue-700 font-semibold underline">{t.customer_name}{t.customer_phone ? ' · ' + t.customer_phone : ''}</button>}
                  {t.assignee_name && <span className="text-gray-500">👤 {t.assignee_name}</span>}
                  <Badge color={PRIO[t.priority][1]}>{PRIO[t.priority][0]}</Badge>
                </div>
                {t.customer_phone && t.status !== 'done' && <div className="mt-1.5"><ContactBar compact customer={{ id: t.customer_id, name: t.customer_name, phone: t.customer_phone }} settings={meta.settings} /></div>}
              </div>
              {t.due_date && <Badge color={overdue ? '#dc2626' : t.due_date === today ? '#f59e0b' : '#64748b'}>{fmtDate(t.due_date)}{overdue ? ' · quá hạn' : ''}</Badge>}
              <button onClick={() => del(t)} className="text-gray-400 hover:text-red-600 text-sm">✕</button>
            </div>
          );
        })}
      </Card>
      {show && <AddTask meta={meta} onClose={() => setShow(false)} onDone={() => { setShow(false); load(); }} />}
    </div>
  );
}

function AddTask({ meta, onClose, onDone }) {
  const [v, setV] = useState({ title: '', description: '', dueDate: '', priority: 'normal', assigneeId: meta.user.id });
  const save = async () => { const j = await api('POST', '/api/crm/tasks', v); if (!j.success) alert(j.message); else onDone(); };
  return (
    <Modal title="Thêm công việc" onClose={onClose} width={480}>
      <div className="space-y-3">
        <Field label="Tiêu đề *"><input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} className={inputCls} /></Field>
        <Field label="Mô tả"><textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} className={inputCls} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Hạn"><input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} className={inputCls} /></Field>
          <Field label="Ưu tiên"><select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} className={inputCls}><option value="high">Cao</option><option value="normal">Thường</option><option value="low">Thấp</option></select></Field>
          <Field label="Giao cho"><select value={v.assigneeId} onChange={(e) => setV({ ...v, assigneeId: Number(e.target.value) })} className={inputCls}>{meta.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 font-bold">Hủy</button><button disabled={!v.title.trim()} onClick={save} className="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Lưu</button></div>
    </Modal>
  );
}
