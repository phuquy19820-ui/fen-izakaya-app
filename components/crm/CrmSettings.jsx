import React, { useEffect, useState } from 'react';
import MemberCard from './MemberCard';
import { api, Card, Field, inputCls, money } from './ui';

const PERIODS = [
  ['best_month12', 'Chi tiêu trong MỘT THÁNG (tháng cao nhất trong 12 tháng gần nhất) — ví dụ chi 10 triệu/tháng lên hạng Bạc'],
  ['rolling12', 'Tổng chi tiêu 12 tháng gần nhất'],
  ['lifetime', 'Tổng chi tiêu từ trước đến nay']
];

// Cài đặt hạng thẻ thành viên (Admin): tự nhập mức chi tiêu để đạt từng hạng
export default function CrmSettings({ meta, reloadMeta }) {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('GET', '/api/crm/settings').then((j) => j.success && setS(j.data)); }, []);
  if (!s) return <p className="p-4 text-gray-500">Đang tải…</p>;

  const setTier = (i, patch) => setS({ ...s, tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addTier = () => setS({ ...s, tiers: [...s.tiers, { key: 'tier' + (s.tiers.length + 1), name: 'Hạng mới', min: (s.tiers[s.tiers.length - 1].min || 0) + 10000000, perks: [] }] });
  const delTier = (i) => { if (s.tiers.length <= 2) return; setS({ ...s, tiers: s.tiers.filter((_, j) => j !== i) }); };
  const save = async () => {
    const j = await api('PUT', '/api/crm/settings', s);
    setMsg(j.success ? '✅ Đã lưu cài đặt. Hạng thẻ của khách được tính lại ngay.' : '❌ ' + j.message);
    if (j.success) { setS(j.data); reloadMeta(); }
  };

  return (
    <div className="space-y-3">
      <Card title="Hạng thẻ thành viên">
        <p className="text-sm text-gray-600 mb-3">Nhập mức chi tiêu để đạt từng hạng. Hạng đầu tiên là mặc định (0 đ). Mã hạng 5 mức cố định theo thứ tự: Thành viên → Bạc → Vàng → Kim cương → Luxury, bạn có thể đổi tên, đổi mức, thêm hoặc bớt hạng.</p>
        <Field label="Cách tính hạng" className="mb-3">
          <select value={s.tierPeriod} onChange={(e) => setS({ ...s, tierPeriod: e.target.value })} className={inputCls}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <div className="space-y-3">
          {s.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 border rounded-xl p-3">
              <div className="grid grid-cols-2 gap-3 content-start">
                <Field label="Tên hạng"><input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} className={inputCls} /></Field>
                <Field label={i === 0 ? 'Mức chi tiêu (mặc định, không đổi)' : 'Chi tiêu từ (đ)'}>
                  <input type="number" disabled={i === 0} value={t.min} onChange={(e) => setTier(i, { min: Number(e.target.value) })} className={inputCls} />
                  <div className="text-xs text-gray-500 mt-0.5">{money(t.min)} đ</div>
                </Field>
                <Field label="Quyền lợi (mỗi dòng một quyền lợi)" className="col-span-2"><textarea rows={4} value={t.perks.join('\n')} onChange={(e) => setTier(i, { perks: e.target.value.split('\n') })} className={inputCls} /></Field>
                <div className="col-span-2 text-right">{i > 0 && s.tiers.length > 2 && <button onClick={() => delTier(i)} className="text-red-600 text-sm font-bold">Xóa hạng này</button>}</div>
              </div>
              <div className="flex items-start justify-center"><MemberCard id={'preview-' + i} brand={s.brand} name="NGUYỄN VĂN A" memberCode="FEN-000123" tier={t.key} tierName={t.name} points={1250} since="2026-01-15" /></div>
            </div>
          ))}
        </div>
        <button onClick={addTier} className="mt-3 px-4 py-2 rounded-lg border bg-white font-bold">+ Thêm hạng</button>
      </Card>

      <Card title="Điểm thưởng & phân khúc khách">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Tên thương hiệu trên thẻ"><input value={s.brand} onChange={(e) => setS({ ...s, brand: e.target.value })} className={inputCls} /></Field>
          <Field label="Chi bao nhiêu đ = 1 điểm"><input type="number" value={s.pointsRate} onChange={(e) => setS({ ...s, pointsRate: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Khách mới: trong (ngày) kể từ lần đầu"><input type="number" value={s.newDays} onChange={(e) => setS({ ...s, newDays: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Có nguy cơ rời bỏ: không ghé quá (ngày)"><input type="number" value={s.winbackDays} onChange={(e) => setS({ ...s, winbackDays: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Đã mất: không ghé quá (ngày)"><input type="number" value={s.lostDays} onChange={(e) => setS({ ...s, lostDays: Number(e.target.value) })} className={inputCls} /></Field>
        </div>
      </Card>
      <div className="flex items-center gap-3"><button onClick={save} className="px-6 py-2.5 rounded-lg bg-blue-700 text-white font-bold">Lưu cài đặt</button>{msg && <span className="font-semibold text-sm">{msg}</span>}</div>
    </div>
  );
}
