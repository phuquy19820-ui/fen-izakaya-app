const axios = require('axios');
const CUKCUK_API_BASE = process.env.CUKCUK_API_URL || 'https://openapi.cukcuk.vn/api/v1';

class CukCukService {
  static async login(companyCode, username, password) {
    try {
      const response = await axios.post(`${CUKCUK_API_BASE}/auth/login`, {
        CompanyCode: companyCode,
        Username: username,
        Password: password,
        AppId: 'FEN_PURCHASING_APP'
      }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });

      if (response.data && response.data.Success) {
        return {
          success: true,
          accessToken: response.data.Data.AccessToken,
          companyId: response.data.Data.CompanyID
        };
      }
      return { success: false, message: response.data.ErrorMessage || 'Đăng nhập CUKCUK thất bại.' };
    } catch (error) {
      return { success: false, message: 'Không thể kết nối đến máy chủ CUKCUK.' };
    }
  }

  static async getSalesData(token, fromDate, toDate) {
    try {
      const response = await axios.get(`${CUKCUK_API_BASE}/sales/vouchers`, {
        headers: { 'Authorization': `Bearer ${token}` },
        params: { FromDate: fromDate, ToDate: toDate, Status: 2 }
      });

      if (!response.data || !response.data.Data) return [];

      const dishSalesMap = {};
      response.data.Data.forEach(voucher => {
        if (voucher.InvoiceDetails) {
          voucher.InvoiceDetails.forEach(item => {
            const dishId = item.InventoryItemCode;
            const qty = parseFloat(item.Quantity) || 0;
            if (dishSalesMap[dishId]) {
              dishSalesMap[dishId].quantity += qty;
            } else {
              dishSalesMap[dishId] = { dish_id: dishId, dish_name: item.InventoryItemName, quantity: qty };
            }
          });
        }
      });
      return Object.values(dishSalesMap);
    } catch (error) {
      throw new Error('Lỗi khi tải dữ liệu bán hàng từ CUKCUK');
    }
  }

  static async getInventoryBalance(token) {
    try {
      const response = await axios.get(`${CUKCUK_API_BASE}/inventory/balances`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.data || !response.data.Data) return [];
      return response.data.Data.map(item => ({
        material_code: item.MaterialCode || item.InventoryItemCode,
        material_name: item.MaterialName || item.InventoryItemName,
        current_stock: parseFloat(item.ClosingQuantity) || 0
      }));
    } catch (error) {
      throw new Error('Lỗi khi tải tồn kho từ CUKCUK');
    }
  }
}

module.exports = CukCukService;
