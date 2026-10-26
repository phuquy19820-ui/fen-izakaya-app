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
        <p className="text-sm text-gray-600 mb-3">Chính sách hạng FEN: hạng tính theo <b>chi tiêu tích lũy 12 tháng gần nhất</b>. Khách mới lần đầu có <b>một hóa đơn trên mức "hóa đơn đầu tiên"</b> của hạng nào thì được xếp thẳng hạng đó (hiệu lực 12 tháng). Hạng Signature duy trì khi đủ 35 triệu/năm, nếu thấp hơn sẽ rớt về Diamond; dưới 15 triệu/năm thì không còn thẻ. Khách VIP chiến lược / Celeb được xét chọn thủ công ở hồ sơ khách. Hạng đầu tiên (0 đ) nghĩa là chưa có thẻ.</p>
        <div className="grid grid-cols-2 gap-3 mb-3" style={{ maxWidth: 520 }}>
          <Field label="Thẻ có hiệu lực (tháng)"><input type="number" value={s.cardMonths} onChange={(e) => setS({ ...s, cardMonths: Number(e.target.value) })} className={inputCls} /></Field>
          <Field label="Báo trước khi hết hạn (ngày)"><input type="number" value={s.expiryWarnDays} onChange={(e) => setS({ ...s, expiryWarnDays: Number(e.target.value) })} className={inputCls} /></Field>
        </div>
        <div className="space-y-3">
          {s.tiers.map((t, i) => (
            <div key={i} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 border rounded-xl p-3">
              <div className="grid grid-cols-2 gap-3 content-start">
                <Field label="Tên hạng"><input value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} className={inputCls} /></Field>
                <Field label={i === 0 ? 'Mức chi tiêu (mặc định, không đổi)' : 'Chi tiêu từ (đ)'}>
                  <input type="number" disabled={i === 0} value={t.min} onChange={(e) => setTier(i, { min: Number(e.target.value) })} className={inputCls} />
                  <div className="text-xs text-gray-500 mt-0.5">{money(t.min)} đ</div>
                </Field>
                {i > 0 && <Field label="Hóa đơn đầu tiên (khách mới) trên (đ)"><input type="number" value={t.newBillMin || 0} onChange={(e) => setTier(i, { newBillMin: Number(e.target.value) })} className={inputCls} /><div className="text-xs text-gray-500 mt-0.5">{money(t.newBillMin || 0)} đ</div></Field>}
                {i > 0 && <Field label="Giảm giá trên tổng hóa đơn (%)"><input type="number" value={t.discountPct || 0} onChange={(e) => setTier(i, { discountPct: Number(e.target.value) })} className={inputCls} /></Field>}
                {i > 0 && <Field label="Voucher sinh nhật (đ, hiệu lực 30 ngày)"><input type="number" value={t.birthdayVoucher || 0} onChange={(e) => setTier(i, { birthdayVoucher: Number(e.target.value) })} className={inputCls} /><div className="text-xs text-gray-500 mt-0.5">{money(t.birthdayVoucher || 0)} đ</div></Field>}
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
      <Card title="Mẫu tin nhắn liên hệ nhanh (Zalo / SMS / Facebook)">
        <p className="text-sm text-gray-600 mb-3">Nhân viên bấm nút Zalo / SMS / Facebook trong hồ sơ khách hoặc danh sách công việc, app mở sẵn cuộc trò chuyện và chép tin nhắn mẫu. Biến dùng được: <b>{'{ten}'}</b> tên khách, <b>{'{hang}'}</b> hạng thẻ, <b>{'{quan}'}</b> tên thương hiệu, <b>{'{the}'}</b> link thẻ thành viên.</p>
        <div className="space-y-2">
          {(s.messageTemplates || []).map((t, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-2 items-start">
              <input value={t.name} onChange={(e) => setS({ ...s, messageTemplates: s.messageTemplates.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={inputCls} placeholder="Tên mẫu" />
              <textarea rows={2} value={t.text} onChange={(e) => setS({ ...s, messageTemplates: s.messageTemplates.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className={inputCls} />
              <button onClick={() => setS({ ...s, messageTemplates: s.messageTemplates.filter((_, j) => j !== i) })} className="text-red-600 font-bold text-sm">Xóa</button>
            </div>
          ))}
        </div>
        <button onClick={() => setS({ ...s, messageTemplates: [...(s.messageTemplates || []), { name: 'Mẫu mới', text: 'Xin chào {ten}, ' }] })} className="mt-2 px-4 py-2 rounded-lg border bg-white font-bold">+ Thêm mẫu tin</button>
      </Card>
      <div className="flex items-center gap-3"><button onClick={save} className="px-6 py-2.5 rounded-lg bg-blue-700 text-white font-bold">Lưu cài đặt</button>{msg && <span className="font-semibold text-sm">{msg}</span>}</div>
    </div>
  );
}
