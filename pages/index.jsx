import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Router from 'next/router';
import BackupPanel from '../components/BackupPanel';
import Credit from '../components/Credit';
import { useAuth } from '../components/AuthContext';
import { canUse, hasBranchModules } from '../components/permissions';

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = !!user && user.role === 'admin';
  const can = (k) => canUse(user, k);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ branchId: '', branchName: '', cukcukCompanyCode: '' });

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches');
      const data = await res.json();
      if (data.success) setBranches(data.data);
    } catch (error) {
      console.error('Error fetching branches:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!formData.branchId || !formData.branchName) {
      alert('Vui lòng nhập đầy đủ thông tin');
      return;
    }
    try {
      const res = await fetch('/api/branches/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        alert('Tạo chi nhánh thành công!');
        setFormData({ branchId: '', branchName: '', cukcukCompanyCode: '' });
        setShowCreateForm(false);
        fetchBranches();
      }
    } catch (error) {
      alert('Lỗi tạo chi nhánh: ' + error.message);
    }
  };

  return (
    <>
      <Head>
        <title>Quản Lý Kế Hoạch Mua NVL - Fen Izakaya</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <header className="bg-blue-800 text-white px-8 py-6">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">🍽️ Fen Izakaya</h1>
              <p className="text-blue-200">Hệ Thống Quản Lý Kế Hoạch Mua Nguyên Vật Liệu</p>
            </div>
            <div className="text-sm text-blue-100 flex items-center gap-4">
              <div>
                <p>🤖 Tự động phân loại & tính toán kế hoạch mua</p>
                <p>📊 Tích hợp CUKCUK | 🏪 Quản lý đa chi nhánh</p>
              </div>
              <Credit variant="inline" />
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Danh Sách Chi Nhánh</h2>
            <div className="flex items-center gap-3">
              {isAdmin && <Link href="/crm?view=users"><a className="bg-gray-700 hover:bg-gray-800 text-white px-5 py-2 rounded-lg font-bold shadow-lg">🔐 Tài khoản</a></Link>}
              {isAdmin && <BackupPanel />}
              {isAdmin && (
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-bold shadow-lg"
                >
                  + Tạo Chi Nhánh Mới
                </button>
              )}
            </div>
          </div>

          {showCreateForm && (
            <div className="bg-white p-6 rounded-lg shadow-lg mb-6 border-l-4 border-green-600">
              <h3 className="text-lg font-bold mb-4">Tạo Chi Nhánh Mới</h3>
              <form onSubmit={handleCreateBranch} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Mã Chi Nhánh *</label>
                    <input
                      type="text"
                      placeholder="VD: CN_GOVAP"
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Tên Chi Nhánh *</label>
                    <input
                      type="text"
                      placeholder="VD: Fen Izakaya - Gò Vấp"
                      value={formData.branchName}
                      onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-gray-700 mb-2">Mã Công Ty CUKCUK</label>
                    <input
                      type="text"
                      placeholder="Mã công ty CUKCUK"
                      value={formData.cukcukCompanyCode}
                      onChange={(e) => setFormData({ ...formData, cukcukCompanyCode: e.target.value })}
                      className="w-full border p-2 rounded focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>
                </div>
                <div className="flex gap-4">
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-bold"
                  >
                    ✅ Tạo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="bg-gray-400 hover:bg-gray-500 text-white px-6 py-2 rounded font-bold"
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Đang tải dữ liệu...</p>
            </div>
          ) : branches.length === 0 && !can('crm') ? (
            <div className="bg-white p-8 rounded-lg shadow text-center">
              <p className="text-gray-600 mb-4">Chưa có chi nhánh nào. Hãy tạo chi nhánh mới để bắt đầu.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hasBranchModules(user) && branches.map((branch) => (
                <div
                  key={branch.branch_id}
                  className="bg-white rounded-lg shadow-lg hover:shadow-xl transition overflow-hidden border-t-4 border-blue-600"
                >
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-2">{branch.branch_name}</h3>
                    <p className="text-sm text-gray-500 mb-4">Mã: <span className="font-mono text-gray-700">{branch.branch_id}</span></p>
                    {branch.cukcuk_company_code && (
                      <p className="text-sm text-gray-500 mb-4">
                        CUKCUK: <span className="text-gray-700">{branch.cukcuk_company_code}</span>
                      </p>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {can('plan') && (<Link href={`/purchase-plan?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded font-bold text-sm">
                          📊 Kế Hoạch Mua
                        </a>
                      </Link>)}
                      {can('sales') && (<Link href={`/sales-report?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded font-bold text-sm">
                          💰 Doanh Thu
                        </a>
                      </Link>)}
                      {can('stock') && (<Link href={`/stock-report?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded font-bold text-sm">
                          📦 Tồn Kho
                        </a>
                      </Link>)}
                      {can('books') && (<Link href={`/purchase-books?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded font-bold text-sm">
                          📒 Sổ Mua Hàng
                        </a>
                      </Link>)}
                      {can('suppliers') && (<Link href={`/suppliers?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded font-bold text-sm">
                          🚚 Nhà Cung Cấp
                        </a>
                      </Link>)}
                      {can('revenue') && (<Link href={`/revenue-report?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px', background: '#0f766e' }} className="text-white px-3 py-2 rounded font-bold text-sm">
                          📈 Báo Cáo DT
                        </a>
                      </Link>)}
                      {can('payables') && (<Link href={`/payables?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px' }} className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded font-bold text-sm">
                          💳 Công Nợ NCC
                        </a>
                      </Link>)}
                      {can('sync') && (<Link href={`/sync-cukcuk?branch=${branch.branch_id}`}>
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px', gridColumn: '1 / -1' }} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded font-bold text-sm">
                          🔄 Đồng Bộ
                        </a>
                      </Link>)}
                    </div>
                  </div>
                </div>
              ))}
              {can('crm') && (
                <div className="bg-white rounded-lg shadow-lg hover:shadow-xl transition overflow-hidden" style={{ borderTop: '4px solid #7c3aed' }}>
                  <div className="p-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-2">👥 CRM Khách hàng</h3>
                    <p className="text-sm text-gray-500 mb-4">Quản lý khách hàng, thẻ thành viên, chăm sóc, nhắc việc và cơ hội đặt tiệc cho cả hệ thống nhà hàng.</p>
                    <p className="text-sm text-gray-500 mb-4">Khách lấy tự động từ doanh thu đã đồng bộ</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                      <Link href="/crm">
                        <a style={{ display: 'block', textAlign: 'center', lineHeight: '20px', background: '#7c3aed' }} className="text-white px-3 py-2 rounded font-bold text-sm">
                          👥 Mở CRM Khách Hàng
                        </a>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-12 bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-lg font-bold mb-4">📚 Hướng Dẫn Sử Dụng</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-700">
              <div className="border-l-4 border-blue-600 pl-4">
                <h4 className="font-bold mb-2">1️⃣ Tạo Chi Nhánh</h4>
                <p>Nhập mã chi nhánh, tên chi nhánh và mã CUKCUK (nếu có).</p>
              </div>
              <div className="border-l-4 border-purple-600 pl-4">
                <h4 className="font-bold mb-2">2️⃣ Đồng Bộ CUKCUK</h4>
                <p>Kết nối với hệ thống bán hàng để lấy dữ liệu bán hàng và tồn kho.</p>
              </div>
              <div className="border-l-4 border-green-600 pl-4">
                <h4 className="font-bold mb-2">3️⃣ Tải Định Lượng (BOM)</h4>
                <p>Upload file Excel chứa công thức và định lượng nguyên vật liệu.</p>
              </div>
              <div className="border-l-4 border-yellow-600 pl-4">
                <h4 className="font-bold mb-2">4️⃣ Lập Kế Hoạch Mua</h4>
                <p>Tự động tính toán số lượng mua dựa trên dữ liệu bán hàng và tồn kho.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
