const XLSX = require('xlsx');

function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function autoDetectCategory(materialCode, materialName) {
  const code = (materialCode || '').toUpperCase();
  const name = (materialName || '').toLowerCase();

  if (code.startsWith('RC') || /rau|củ|cà|hành|tỏi|ớt|ngò|nấm|măng|bí|dưa|lolo|bắp|tắc|gừng|sả|riềng/.test(name)) {
    return { group: 'VEGETABLE', cycle: 'FRESH_3DAYS' };
  }
  if (/thịt|bò|ba rọi|heo|lợn|gà|vịt|sườn|bacon|xá xíu|phèo|gân|dồi|pate/.test(name)) {
    return { group: 'MEAT', cycle: 'FRESH_3DAYS' };
  }
  if (/cá|tôm|mực|cua|ghẹ|hàu|cò|sò|lươn|sứa|ốc|caviar|mentaiko/.test(name)) {
    return { group: 'SEAFOOD', cycle: 'FRESH_3DAYS' };
  }
  if (code.startsWith('GBB') || /sốt|sauce|bột|dầu|mắm|đường|muối|tiêu|rượu|mè|phô mai|bơ|mirin|sake|kem/.test(name)) {
    return { group: 'DRY_SPICE', cycle: 'WEEKLY_7DAYS' };
  }

  return { group: 'DRY_SPICE', cycle: 'WEEKLY_7DAYS' };
}

async function parseAndSaveBOM(fileBuffer, branchId, db) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { range: 2 });

  let currentDish = null;
  let summary = { totalDishes: 0, totalMaterials: 0, newMaterialsCreated: 0 };

  for (const row of sheetData) {
    const dishType = row['Loại (*)'];
    const dishCode = row['Mã món (*)'];
    const dishName = row['Tên món (*)'];
    const dishPrice = row['Giá bán (*)'] ? parseFloat(String(row['Giá bán (*)']).replace(/[^0-9]/g, '')) : 0;
    const dishUnit = row['Đơn vị tính (*)'];

    if (dishType === 'Món ăn' || dishCode) {
      currentDish = { dish_id: dishCode, dish_name: dishName, dish_price: dishPrice, dish_unit: dishUnit };
      summary.totalDishes++;
    }

    const matName = row['Tên NVL'];
    let matCode = row['Mã NVL'];
    const recipeUnit = row['Đơn vị tính'] || 'gr';
    const quantity = parseFloat(row['Số lượng']) || 0;

    if (currentDish && matName && quantity > 0) {
      const normName = normalizeString(matName);
      if (!matCode) matCode = 'RAW_' + normName.substring(0, 15).toUpperCase();

      let existingMat = await db.query('SELECT * FROM raw_materials WHERE material_id = $1 OR normalized_name = $2', [matCode, normName]);
      let finalMatId = matCode;

      if (existingMat.rows.length === 0) {
        const detected = autoDetectCategory(matCode, matName);
        const purchaseUnit = (recipeUnit === 'gr' ? 'kg' : (recipeUnit === 'ml' ? 'lít' : recipeUnit));
        const conversionRate = (recipeUnit === 'gr' || recipeUnit === 'ml') ? 1000 : 1;

        await db.query(`
          INSERT INTO raw_materials (material_id, material_name, normalized_name, category_group, purchase_cycle, unit_recipe, unit_purchase, conversion_rate, is_auto_created)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        `, [matCode, matName, normName, detected.group, detected.cycle, recipeUnit, purchaseUnit, conversionRate]);

        summary.newMaterialsCreated++;
      } else {
        finalMatId = existingMat.rows[0].material_id;
      }

      await db.query(`
        INSERT INTO bill_of_materials (branch_id, dish_id, dish_name, dish_unit, dish_price, material_id, quantity_per_dish)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [branchId, currentDish.dish_id, currentDish.dish_name, currentDish.dish_unit, currentDish.dish_price, finalMatId, quantity]);

      summary.totalMaterials++;
    }
  }

  return summary;
}

module.exports = { parseAndSaveBOM, autoDetectCategory, normalizeString };
