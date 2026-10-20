// Các chức năng (tab) có thể cấp quyền riêng cho từng tài khoản. key phải trùng với MODULES ở services/authService.js
export const MODULES = [
  { key: 'plan', label: 'Kế hoạch mua', icon: '📊', paths: ['/purchase-plan', '/beverage-config'] },
  { key: 'sales', label: 'Doanh thu theo món', icon: '💰', paths: ['/sales-report'] },
  { key: 'revenue', label: 'Báo cáo doanh thu', icon: '📈', paths: ['/revenue-report'] },
  { key: 'stock', label: 'Tồn kho', icon: '📦', paths: ['/stock-report'] },
  { key: 'books', label: 'Sổ mua hàng', icon: '📒', paths: ['/purchase-books'] },
  { key: 'suppliers', label: 'Nhà cung cấp', icon: '🚚', paths: ['/suppliers'] },
  { key: 'payables', label: 'Công nợ NCC', icon: '💳', paths: ['/payables'] },
  { key: 'sync', label: 'Đồng bộ & ghép món', icon: '🔄', paths: ['/sync-cukcuk'] },
  { key: 'crm', label: 'CRM Khách hàng', icon: '👥', paths: ['/crm'] }
];

export const canUse = (user, key) => !!user && (user.role === 'admin' || (user.permissions || []).includes(key));
export const hasBranchModules = (user) => !!user && (user.role === 'admin' || (user.permissions || []).some((p) => p !== 'crm'));

// Trang nào cần chức năng nào (null = trang chung: danh sách chi nhánh)
export function moduleForPath(path) {
  if (path === '/') return 'home';
  const m = MODULES.find((x) => x.paths.some((p) => path === p || path.startsWith(p + '/')));
  return m ? m.key : null;
}

// Trang đầu tiên người dùng được vào
export const homeFor = (user) => (user && user.role === 'admin' ? '/' : (hasBranchModules(user) ? '/' : '/crm'));

// Trang có được phép không (Admin luôn được)
export function pathAllowed(user, path) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const k = moduleForPath(path);
  if (k === 'home') return hasBranchModules(user);
  if (!k) return false;
  return canUse(user, k);
}
