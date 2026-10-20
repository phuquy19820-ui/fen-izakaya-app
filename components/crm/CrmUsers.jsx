import React, { useEffect, useState, useCallback } from 'react';
import { api, Card, Table, Badge, Modal, Field, inputCls, fmtDateTime } from './ui';
import { MODULES } from '../permissions';

const ROLE = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

// Quản lý tài khoản (chỉ Admin)
export default function CrmUsers({ meta }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => { const j = await api('GET', '/api/users'); if (j.success) setRows(j.data); }, []);
  useEffect(() => { load(); }, [load]);
  const branchName = (b) => (meta.branches.find((x) => x.branch_id === b) || {}).branch_name || b;

  return (
    <div className="space-y-3">
      <Card pad={false} title="Tài khoản người dùng" right={<button onClick={() => setEdit({ isNew: true })} className="px-4 py-1.5 rounded-lg bg-blue-700 text-white font-bold text-sm">+ Tạo tài khoản</button>}>
        <p className="px-4 pt-3 text-sm text-gray-600">Tài khoản Quản lý/Nhân viên chỉ thấy chức năng CRM và chỉ xem được khách của chi nhánh được gán. Admin dùng được mọi chức năng.</p>
        <Table rows={rows} rowKey={(r) => r.id} onRow={(r) => setEdit(r)} cols={[
          { label: 'Tên đăng nhập', render: (r) => <b>{r.username}</b> }, { label: 'Họ tên', render: (r) => r.full_name },
          { label: 'Vai trò', render: (r) => <Badge color={r.role === 'admin' ? '#dc2626' : r.role === 'manager' ? '#d97706' : '#0ea5e9'}>{ROLE[r.role]}</Badge> },
          { label: 'Chức năng được dùng', render: (r) => (r.role === 'admin' ? 'Tất cả' : (r.permissions || ['crm']).map((k) => (MODULES.find((m) => m.key === k) || {}).label || k).join(', ') || <span className="text-red-500">Chưa cấp</span>) },
          { label: 'Chi nhánh được xem', render: (r) => (r.role === 'admin' ? 'Tất cả' : (r.branch_ids || []).map(branchName).join(', ') || <span className="text-red-500">Chưa gán</span>) },
          { label: 'Trạng thái', render: (r) => (r.active ? <Badge color="#16a34a">Hoạt động</Badge> : <Badge color="#64748b">Đã khóa</Badge>) },
          { label: 'Đăng nhập gần nhất', render: (r) => <span className="text-xs text-gray-500">{r.last_login ? fmtDateTime(r.last_login) : 'Chưa đăng nhập'}</span> }
        ]} />
      </Card>
      {edit && <UserForm user={edit} meta={meta} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function UserForm({ user, meta, onClose, onDone }) {
  const isNew = !!user.isNew;
  const isAdminUser = !isNew && String(user.username).toLowerCase() === 'admin';
  const [v, setV] = useState({ username: user.username || '', fullName: user.full_name || '', role: user.role || 'staff', branchIds: user.branch_ids || [], permissions: user.permissions || ['crm'], phone: user.phone || '', active: user.active !== false, password: '' });
  const [msg, setMsg] = useState('');
  const togglePerm = (k) => setV({ ...v, permissions: v.permissions.includes(k) ? v.permissions.filter((x) => x !== k) : [...v.permissions, k] });
  const toggleBranch = (b) => setV({ ...v, branchIds: v.branchIds.includes(b) ? v.branchIds.filter((x) => x !== b) : [...v.branchIds, b] });

  const save = async () => {
    const j = isNew ? await api('POST', '/api/users', v) : await api('PUT', `/api/users/${user.id}`, v);
    if (!j.success) { setMsg('❌ ' + j.message); return; }
    onDone();
  };
  const reset = async () => {
    const p = window.prompt('Nhập mật khẩu mới cho tài khoản này (ít nhất 8 ký tự):');
    if (!p) return;
    const j = await api('POST', `/api/users/${user.id}/reset-password`, { password: p });
    setMsg(j.success ? '✅ ' + j.message : '❌ ' + j.message);
  };
  const del = async () => {
    if (!window.confirm(`Xóa tài khoản ${user.username}?`)) return;
    const j = await api('DELETE', `/api/users/${user.id}`);
    if (!j.success) setMsg('❌ ' + j.message); else onDone();
  };

  return (
    <Modal title={isNew ? 'Tạo tài khoản mới' : 'Sửa tài khoản: ' + user.username} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên đăng nhập *"><input disabled={!isNew} value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} className={inputCls} placeholder="vd: lan.nguyen" /></Field>
        <Field label="Họ tên"><input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} className={inputCls} /></Field>
        {isNew && <Field label="Mật khẩu ban đầu * (≥ 8 ký tự)" className="col-span-2"><input type="text" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className={inputCls} /><div className="text-xs text-gray-500 mt-0.5">Người dùng có thể tự đổi mật khẩu sau khi đăng nhập (nút "Đổi mật khẩu" góc dưới bên trái).</div></Field>}
        <Field label="Vai trò"><select disabled={isAdminUser} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} className={inputCls}><option value="staff">Nhân viên — xem/ghi chú khách của chi nhánh được gán</option><option value="manager">Quản lý — thêm quyền xuất danh sách, chỉnh điểm, xóa</option><option value="admin">Quản trị viên — toàn quyền</option></select></Field>
        <Field label="Số điện thoại"><input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} className={inputCls} /></Field>
        {v.role !== 'admin' && (
          <Field label="Chức năng (tab) được phép sử dụng" className="col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 border rounded-lg p-3 bg-gray-50">
              {MODULES.map((m) => <label key={m.key} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v.permissions.includes(m.key)} onChange={() => togglePerm(m.key)} /> {m.icon} {m.label}</label>)}
            </div>
            <div className="flex gap-3 text-xs mt-1"><button type="button" onClick={() => setV({ ...v, permissions: MODULES.map((m) => m.key) })} className="text-blue-700 font-bold">Chọn tất cả</button><button type="button" onClick={() => setV({ ...v, permissions: ['crm'] })} className="text-gray-600 font-bold">Chỉ CRM</button><button type="button" onClick={() => setV({ ...v, permissions: [] })} className="text-red-600 font-bold">Bỏ hết</button></div>
            <div className="text-xs text-gray-500 mt-0.5">Người dùng chỉ thấy các tab được tick và chỉ dùng dữ liệu của chi nhánh được gán bên dưới.</div>
          </Field>
        )}
        {v.role !== 'admin' && (
          <Field label="Chi nhánh được xem" className="col-span-2">
            <div className="flex flex-wrap gap-3">{meta.branches.map((b) => <label key={b.branch_id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v.branchIds.includes(b.branch_id)} onChange={() => toggleBranch(b.branch_id)} /> {b.branch_name}</label>)}</div>
          </Field>
        )}
        {!isNew && !isAdminUser && <label className="flex items-center gap-2 text-sm font-semibold col-span-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Cho phép đăng nhập (bỏ chọn để khóa tài khoản)</label>}
      </div>
      {msg && <p className="mt-3 font-semibold text-sm">{msg}</p>}
      <div className="flex justify-between mt-4">
        <div className="flex gap-2">{!isNew && <button onClick={reset} className="px-3 py-2 rounded-lg border font-bold text-sm">🔑 Đặt lại mật khẩu</button>}{!isNew && !isAdminUser && <button onClick={del} className="px-3 py-2 rounded-lg border border-red-300 text-red-600 font-bold text-sm">Xóa</button>}</div>
        <div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 font-bold">Đóng</button><button onClick={save} disabled={isNew && (!v.username || v.password.length < 8)} className="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold disabled:opacity-50">Lưu</button></div>
      </div>
    </Modal>
  );
}
