import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import MemberCard, { SaveCardButton } from '../../components/crm/MemberCard';

const money = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const PERIOD = { best_month12: 'chi tiêu trong một tháng (12 tháng gần nhất)', rolling12: 'tổng chi tiêu 12 tháng gần nhất', lifetime: 'tổng chi tiêu từ trước đến nay' };

// Trang thẻ thành viên công khai: khách mở bằng link hoặc quét QR trên điện thoại
export default function CardPage() {
  const router = useRouter();
  const { token } = router.query;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`/api/card/${token}`).then((r) => r.json()).then((j) => { if (j.success) setData(j.data); else setError(j.message || 'Không tìm thấy thẻ'); }).catch(() => setError('Không kết nối được máy chủ'));
  }, [token]);

  const link = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <Head>
        <title>Thẻ thành viên</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>
      <div className="min-h-screen flex flex-col items-center p-4" style={{ background: 'radial-gradient(circle at 50% 0%, #1e293b, #020617 70%)' }}>
        {error && <p className="text-white mt-20 text-center">{error}</p>}
        {!data && !error && <p className="text-gray-300 mt-20">Đang tải thẻ…</p>}
        {data && (
          <div className="w-full flex flex-col items-center gap-4 mt-6" style={{ maxWidth: 440 }}>
            <MemberCard id="card-public" brand={data.brand} name={data.name} memberCode={data.memberCode} tier={data.tier} tierName={data.tierName} points={data.points} since={data.since} link={link} />
            <SaveCardButton card={{ brand: data.brand, name: data.name, memberCode: data.memberCode, tier: data.tier, tierName: data.tierName, points: data.points, since: data.since, link }} filename={`the-thanh-vien-${data.memberCode}.png`} className="px-5 py-2 rounded-full bg-white text-gray-900 font-bold text-sm shadow">⬇ Lưu thẻ về điện thoại</SaveCardButton>

            <div className="w-full rounded-2xl p-4 text-white" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>
              {data.next ? (
                <>
                  <div className="flex justify-between text-sm font-semibold"><span>Hạng {data.tierName}</span><span>Hạng {data.next.name}</span></div>
                  <div className="mt-2 rounded-full overflow-hidden" style={{ height: 10, background: 'rgba(255,255,255,.18)' }}><div style={{ width: data.next.pct + '%', height: '100%', background: 'linear-gradient(90deg,#fbbf24,#f59e0b)' }} /></div>
                  <p className="text-xs mt-2 text-gray-300">Còn <b className="text-white">{money(data.next.need)}đ</b> nữa để lên hạng {data.next.name} ({PERIOD[data.period] || ''}).</p>
                </>
              ) : <p className="text-sm font-semibold">🎉 Bạn đang ở hạng cao nhất: {data.tierName}</p>}
            </div>

            <div className="w-full rounded-2xl p-4 text-white" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>
              <h2 className="font-bold mb-2">Quyền lợi hạng {data.tierName}</h2>
              <ul className="space-y-1.5 text-sm">
                {data.perks.map((p, i) => <li key={i} className="flex gap-2"><span>✨</span><span>{p}</span></li>)}
              </ul>
            </div>

            <div className="w-full rounded-2xl p-4 text-white" style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)' }}>
              <h2 className="font-bold mb-2">Các hạng thành viên</h2>
              <div className="space-y-1 text-sm">
                {data.tiers.map((t) => (
                  <div key={t.key} className={`flex justify-between ${t.key === data.tier ? 'font-bold text-yellow-300' : 'text-gray-300'}`}>
                    <span>{t.key === data.tier ? '▶ ' : ''}{t.name}</span><span>{t.min ? `từ ${money(t.min)}đ` : 'Mặc định'}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 pb-6 text-center">Xuất trình thẻ hoặc số điện thoại {data.phone ? `(${data.phone})` : ''} khi thanh toán để được tích điểm và hưởng ưu đãi.</p>
          </div>
        )}
      </div>
    </>
  );
}
