/**
 * Purchase Plan Service - Tính toán kế hoạch mua hàng
 */

class PurchasePlanService {
  async calculateFullPurchasePlan(params) {
    const { branchId, cycleType, materials, salesData, inventoryData, recipes } = params;
    const forecastDays = cycleType === 'FRESH_3DAYS' ? 3 : 7;
    const plans = [];

    for (const material of materials) {
      const currentStock = this.getCurrentStock(material.material_id, inventoryData);
      const avgDailySales = this.calculateAverageDailySales(material.material_id, recipes, salesData);
      const safetyStock = this.calculateSafetyStock(avgDailySales, material.lead_time_days || 1);
      const forecastedDemand = this.calculateForecastedDemand(avgDailySales, forecastDays, material.waste_rate || 5);
      const reorderPoint = this.calculateReorderPoint(avgDailySales, material.lead_time_days || 1, safetyStock);
      const suggestedQty = this.calculatePurchaseQty(currentStock, forecastedDemand, reorderPoint, safetyStock);

      plans.push({
        material_id: material.material_id,
        material_name: material.material_name,
        category: material.category,
        opening_stock: currentStock,
        avg_daily_sales: Math.round(avgDailySales * 100) / 100,
        forecasted_demand: Math.ceil(forecastedDemand),
        safety_stock: Math.ceil(safetyStock),
        reorder_point: Math.ceil(reorderPoint),
        suggested_qty: Math.ceil(Math.max(0, suggestedQty)),
        estimated_cost: Math.ceil(suggestedQty) * (material.unit_cost || 0),
        note: this.generateNote(currentStock, avgDailySales, forecastDays, material.category)
      });
    }

    return plans;
  }

  getCurrentStock(materialId, inventoryData) {
    const latest = inventoryData
      .filter(inv => inv.material_id === materialId)
      .sort((a, b) => new Date(b.period_date) - new Date(a.period_date))[0];
    return latest ? latest.closing_stock : 0;
  }

  calculateAverageDailySales(materialId, recipes, salesData) {
    if (!salesData || salesData.length === 0) return 0;
    const dishesWithMaterial = recipes
      .filter(r => r.ingredients && r.ingredients.some(ing => ing.material_id === materialId))
      .map(r => r.dish_id);
    if (dishesWithMaterial.length === 0) return 0;
    
    let totalDemand = 0, dataPoints = 0;
    for (const sale of salesData) {
      if (dishesWithMaterial.includes(sale.dish_id)) {
        const recipe = recipes.find(r => r.dish_id === sale.dish_id);
        const ingredient = recipe.ingredients.find(ing => ing.material_id === materialId);
        if (ingredient) {
          totalDemand += sale.quantity_sold * ingredient.quantity_per_dish;
          dataPoints++;
        }
      }
    }
    return dataPoints > 0 ? totalDemand / Math.max(dataPoints / 7, 1) : 0;
  }

  calculateSafetyStock(avgDaily, leadTimeDays = 1) {
    return avgDaily * (leadTimeDays + 1);
  }

  calculateForecastedDemand(avgDaily, days, wasteRate = 5) {
    return avgDaily * days * (1 + wasteRate / 100);
  }

  calculateReorderPoint(avgDaily, leadTime, safetyStock) {
    return avgDaily * leadTime + safetyStock;
  }

  calculatePurchaseQty(current, forecast, rop, safety) {
    if (current >= forecast + safety) return 0;
    return Math.max(0, forecast + rop - current);
  }

  generateNote(stock, daily, days, category) {
    if (daily <= 0) return 'ℹ️ Chưa có dữ liệu bán hàng';
    const daysLeft = stock / daily;
    if (daysLeft < 1) return '⚠️ CẢNH BÁO: Tồn không đủ 1 ngày!';
    if (daysLeft < days) return `⚠️ Tồn chỉ ${Math.round(daysLeft)} ngày`;
    if (daysLeft > 14) return '💡 Tồn cao, có thể giảm';
    if (['FRESH_MEAT', 'SEAFOOD'].includes(category)) return '🕐 Kiểm tra hạn sử dụng';
    return '✅ Tồn kho bình thường';
  }
}

module.exports = new PurchasePlanService();
