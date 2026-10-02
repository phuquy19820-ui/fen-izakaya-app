import React, { useState, useMemo } from 'react';
import Head from 'next/head';

export default function PurchasePlanMisaUI() {
  const [cycleType, setCycleType] = useState('FRESH_3DAYS');
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentBranch, setCurrentBranch] = useState({ branch_id: 'CN_GOVAP', branch_name: 'Fen Izakaya - Gò Vấp' });

  const [planData, setPlanData] = useState([
    { material_id: 'TH00002', material_name: 'Thịt ba chỉ bò Mỹ lát', category_group: 'MEAT', purchase_cycle: 'FRESH_3DAYS', unit_purchase: 'kg', current_stock: 1.5, projected_demand: 8.0, suggested_qty: 6.5, final_purchase_qty: 6.5, estimated_price: 220000, note: '' },
    { material_id: 'RC00014', material_name: 'Hành lá tươi', category_group: 'VEGETABLE', purchase_cycle: 'FRESH_3DAYS', unit_purchase: 'kg', current_stock: 0.8, projected_demand: 3.0, suggested_qty: 2.2, final_purchase_qty: 3.0, estimated_price: 35000, note: 'Tiệc cuối tuần' },
    { material_id: 'GBB00021', material_name: 'Bột Ớt 7 Vị NANAMI TOGARASHI 300G', category_group: 'DRY_SPICE', purchase_cycle: 'WEEKLY_7DAYS', unit_purchase: 'gói', current_stock: 1, projected_demand: 4, suggested_qty: 3, final_purchase_qty: 3, estimated_price: 115000, note: '' }
  ]);

  const filteredData = useMemo(() => {
    return planData.filter(item => {
      const matchCycle = item.purchase_cycle === cycleType;
      const matchGroup = selectedGroup === 'ALL' || item.category_group === selectedGroup;
      const matchSearch = item.material_name.toLowerCase().includes(searchTerm.toLowerCase()) || item.material_id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchCycle && matchGroup && matchSearch;
    });
  }, [planData, cycleType, selectedGroup, searchTerm]);

  const handleQtyChange = (materialId, value) => {
    const numericVal = parseFloat(value) || 0;
    setPlanData(prev => prev.map(item => item.material_id === materialId ? { ...item, final_purchase_qty: numericVal } : item));
  };

  return (
    <>
      <Head>
        <title>Kế Hoạch Mua NVL - MISA UI</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>

      <div className="min-h-screen bg-gray-100 flex flex-col text-xs font-sans">
        <header className="bg-blue-800 text-white px-6 py-3 flex justify-between items-center" style={{ backgroundColor: '#0073C5' }}>
          <div className="flex items-center space-x-3">
            <span className="bg-white text-blue-800 p-1 font-bold text-base rounded">FEN</span>
            <div>
              <h1 className="text-base font-bold">LẬP KẾ HOẠCH MUA NGUYÊN VẬT LIỆU</h1>
              <p className="text-blue-200">Chi nhánh: {currentBranch.branch_name}</p>
            </div>
          </div>
          <button className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded font-bold">Lưu Kế Hoạch</button>
        </header>

        <div className="bg-white px-6 pt-3 flex justify-between border-b">
          <div className="flex space-x-2">
            <button onClick={() => setCycleType('FRESH_3DAYS')} className={`px-4 py-2 font-bold border-b-2 ${cycleType === 'FRESH_3DAYS' ? 'border-blue-600 text-blue-600' : 'text-gray-500'}`}>🔴 MUA ĐỒ TƯƠI SỐNG (3 Ngày)</button>
            <button onClick={() => setCycleType('WEEKLY_7DAYS')} className={`px-4 py-2 font-bold border-b-2 ${cycleType === 'WEEKLY_7DAYS' ? 'border-blue-600 text-blue-600' : 'text-gray-500'}`}>🔵 MUA ĐỒ KHÔ / GIA VỊ (7 Ngày)</button>
          </div>
          <input type="text" placeholder="Tìm NVL..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="border p-1.5 rounded mb-2 w-60" />
        </div>

        <div className="flex-1 p-6 overflow-auto">
          <table className="w-full bg-white border border-gray-300 rounded text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b font-bold uppercase text-gray-700">
                <th className="p-2 border-r">Mã NVL</th>
                <th className="p-2 border-r">Tên Nguyên Vật Liệu</th>
                <th className="p-2 border-r text-center">ĐVT</th>
                <th className="p-2 border-r text-right">Tồn Kho</th>
                <th className="p-2 border-r text-right">Đề Xuất</th>
                <th className="p-2 border-r text-right bg-green-50">Thực Mua (Sửa)</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(row => (
                <tr key={row.material_id} className="border-b hover:bg-blue-50">
                  <td className="p-2 border-r font-mono text-blue-700">{row.material_id}</td>
                  <td className="p-2 border-r font-medium">{row.material_name}</td>
                  <td className="p-2 border-r text-center">{row.unit_purchase}</td>
                  <td className="p-2 border-r text-right">{row.current_stock}</td>
                  <td className="p-2 border-r text-right font-bold text-yellow-800">{row.suggested_qty}</td>
                  <td className="p-1 border-r bg-green-50">
                    <input type="number" value={row.final_purchase_qty} onChange={(e) => handleQtyChange(row.material_id, e.target.value)} className="w-full text-right font-bold p-1 border rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
