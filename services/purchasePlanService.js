class PurchasePlanService {
  static calculatePlan(materials, salesDemandMap, inventoryMap, cycleType, forecastDays = 7) {
    const planDetails = [];

    materials.forEach(mat => {
      if (mat.purchase_cycle !== cycleType) return;

      const matId = mat.material_id;
      const currentStockRecipeUnit = inventoryMap[matId]?.current_stock || 0;
      const avgDailyDemand = (salesDemandMap[matId] || 0) / 7;
      const projectedDemandRecipeUnit = avgDailyDemand * forecastDays;

      const wasteRate = parseFloat(mat.waste_rate) || 0;
      const demandWithWaste = projectedDemandRecipeUnit * (1 + wasteRate / 100);

      const safetyStockDays = cycleType === 'FRESH_3DAYS' ? 0.5 : 2;
      const safetyStock = (parseFloat(mat.safety_stock) || (avgDailyDemand * safetyStockDays));

      let netRequirementRecipeUnit = demandWithWaste + safetyStock - currentStockRecipeUnit;
      if (netRequirementRecipeUnit < 0) netRequirementRecipeUnit = 0;

      const conversionRate = parseFloat(mat.conversion_rate) || 1000;
      const suggestedPurchaseQty = netRequirementRecipeUnit / conversionRate;

      const roundedSuggestedQty = cycleType === 'WEEKLY_7DAYS'
        ? Math.ceil(suggestedPurchaseQty * 2) / 2
        : Math.round(suggestedPurchaseQty * 100) / 100;

      planDetails.push({
        material_id: matId,
        material_name: mat.material_name,
        category_group: mat.category_group,
        purchase_cycle: mat.purchase_cycle,
        unit_purchase: mat.unit_purchase,
        current_stock: Math.round((currentStockRecipeUnit / conversionRate) * 100) / 100,
        projected_demand: Math.round((demandWithWaste / conversionRate) * 100) / 100,
        suggested_qty: roundedSuggestedQty,
        final_purchase_qty: roundedSuggestedQty,
        note: ''
      });
    });

    return planDetails;
  }
}

module.exports = PurchasePlanService;
