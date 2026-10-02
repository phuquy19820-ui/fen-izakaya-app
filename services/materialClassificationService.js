/**
 * Material Classification Service
 * Phân loại NVL tự động dựa trên tên và tính chất
 * Theo tiêu chuẩn quốc tế (FAO Classification)
 */

const MATERIAL_CATEGORIES = {
  FRESH_MEAT: {
    code: 'FRESH_MEAT',
    name: 'Thịt Tươi',
    keywords: ['thịt', 'ba chỉ', 'sườn', 'bò', 'heo', 'gà', 'vịt', 'cừu', 'nạm'],
    shelf_life_days: 3,
    purchase_cycle: 'FRESH_3DAYS',
    waste_percentage: 5
  },

  SEAFOOD: {
    code: 'SEAFOOD',
    name: 'Hải Sản',
    keywords: ['cá', 'tôm', 'mực', 'sò', 'cua', 'hàu', 'nauy', 'trích', 'ghẹ', 'tép', 'nghêu'],
    shelf_life_days: 2,
    purchase_cycle: 'FRESH_3DAYS',
    waste_percentage: 10
  },

  VEGETABLE: {
    code: 'VEGETABLE',
    name: 'Rau Cải Quả',
    keywords: ['rau', 'cải', 'cà', 'cà chua', 'dưa', 'khoai', 'khoai tây', 'nấm', 'hành', 'tỏi', 'lá'],
    shelf_life_days: 3,
    purchase_cycle: 'FRESH_3DAYS',
    waste_percentage: 8
  },

  HERB_SEASONING: {
    code: 'HERB_SEASONING',
    name: 'Thảo Mộc & Gia Vị Tươi',
    keywords: ['thơm', 'hương', 'lá', 'tía tô', 'rau mùi', 'rau thơm', 'hành lá', 'tỏi xanh'],
    shelf_life_days: 3,
    purchase_cycle: 'FRESH_3DAYS',
    waste_percentage: 15
  },

  SPICE_DRY: {
    code: 'SPICE_DRY',
    name: 'Gia Vị Khô',
    keywords: ['gia vị', 'mù tạt', 'tiêu', 'sắc', 'hương liệu', 'bột', 'muối', 'đường', 'bột ngoài', 'bột gạo'],
    shelf_life_days: 90,
    purchase_cycle: 'WEEKLY_7DAYS',
    waste_percentage: 2
  },

  DRY_GOODS: {
    code: 'DRY_GOODS',
    name: 'Hàng Khô',
    keywords: ['khô', 'nước mắm', 'nước tương', 'dầu', 'dầu ăn', 'nước', 'xoài', 'cà chua khô', 'hải quân khô'],
    shelf_life_days: 60,
    purchase_cycle: 'WEEKLY_7DAYS',
    waste_percentage: 3
  },

  FROZEN: {
    code: 'FROZEN',
    name: 'Đông Lạnh',
    keywords: ['đông lạnh', 'lạnh', 'frozen', 'tuyết', 'đá'],
    shelf_life_days: 20,
    purchase_cycle: 'WEEKLY_7DAYS',
    waste_percentage: 2
  },

  SAUCE_CONDIMENT: {
    code: 'SAUCE_CONDIMENT',
    name: 'Sốt & Condiment',
    keywords: ['sốt', 'condiment', 'mayo', 'nước chấm', 'tương', 'chua', 'tươi'],
    shelf_life_days: 30,
    purchase_cycle: 'WEEKLY_7DAYS',
    waste_percentage: 2
  }
};

/**
 * Phân loại nguyên vật liệu
 * @param {string} materialName - Tên nguyên vật liệu
 * @returns {Object} - Thông tin phân loại
 */
function classifyMaterial(materialName) {
  if (!materialName) return getDefaultCategory();

  const nameLower = materialName.toLowerCase();

  // Tìm match chính xác hoặc gần đúng
  for (const [key, category] of Object.entries(MATERIAL_CATEGORIES)) {
    for (const keyword of category.keywords) {
      if (nameLower.includes(keyword)) {
        return {
          code: category.code,
          name: category.name,
          shelf_life_days: category.shelf_life_days,
          purchase_cycle: category.purchase_cycle,
          waste_percentage: category.waste_percentage,
          confidence: 'high'
        };
      }
    }
  }

  return getDefaultCategory();
}

/**
 * Lấy category mặc định
 */
function getDefaultCategory() {
  return {
    code: 'DRY_GOODS',
    name: 'Hàng Khô',
    shelf_life_days: 60,
    purchase_cycle: 'WEEKLY_7DAYS',
    waste_percentage: 3,
    confidence: 'low'
  };
}

/**
 * Chuẩn hóa tên nguyên vật liệu (loại bỏ ký tự đặc biệt, normalize)
 * @param {string} name - Tên gốc
 * @returns {string} - Tên chuẩn hóa
 */
function normalizeMaterialName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Loại bỏ ký tự đặc biệt
    .replace(/\s+/g, ' ')     // Chuẩn hóa khoảng trắng
    .replace(/^\s+|\s+$/g, ''); // Loại bỏ khoảng trắng đầu/cuối
}

/**
 * Tính độ tương tự giữa 2 tên (Fuzzy matching)
 * Sử dụng Levenshtein distance
 * @param {string} str1
 * @param {string} str2
 * @returns {number} - Độ tương tự (0-1)
 */
function calculateSimilarity(str1, str2) {
  const norm1 = normalizeMaterialName(str1);
  const norm2 = normalizeMaterialName(str2);

  if (norm1 === norm2) return 1;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);
  return 1 - (distance / maxLength);
}

/**
 * Tính Levenshtein distance
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(n + 1)
    .fill(0)
    .map(() => Array(m + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[0][i] = i;
  for (let j = 0; j <= n; j++) dp[j][0] = j;

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[j][i] = dp[j - 1][i - 1];
      } else {
        dp[j][i] = Math.min(dp[j - 1][i], dp[j][i - 1], dp[j - 1][i - 1]) + 1;
      }
    }
  }

  return dp[n][m];
}

/**
 * Tìm duplicate/similar materials
 * @param {string} materialName - Tên cần kiểm tra
 * @param {Array} existingMaterials - Danh sách NVL hiện có
 * @param {number} threshold - Ngưỡng tương tự (0-1), mặc định 0.75
 * @returns {Array} - Danh sách NVL tương tự
 */
function findSimilarMaterials(materialName, existingMaterials, threshold = 0.75) {
  return existingMaterials
    .map(material => ({
      ...material,
      similarity: calculateSimilarity(materialName, material.material_name)
    }))
    .filter(m => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

module.exports = {
  MATERIAL_CATEGORIES,
  classifyMaterial,
  normalizeMaterialName,
  calculateSimilarity,
  findSimilarMaterials,
  getDefaultCategory
};
