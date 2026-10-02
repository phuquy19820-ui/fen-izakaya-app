# 📁 Cấu Trúc Dự Án Chi Tiết

```
D:\Phần mềm mua hàng\
│
├── 📄 package.json                          ← Dependencies & Scripts npm
├── 📄 server.js                             ← Backend Express Server (PORT 5000)
├── 📄 schema.sql                            ← Database Schema PostgreSQL
├── 📄 seed.sql                              ← Dữ liệu mẫu cho testing
├── 📄 next.config.js                        ← Cấu hình Next.js
│
├── 📄 .env.example                          ← Template biến môi trường
├── 📄 .gitignore                            ← Git ignore rules
│
├── 📋 README.md                             ← Tổng quan dự án
├── 📋 INSTALL.md                            ← Hướng dẫn cài đặt chi tiết
├── 📋 STRUCTURE.md                          ← File này
│
│
├── 📂 services\                             ← Tầng logic & API integration
│   ├── bomService.js                        ← Parse upload BOM Excel
│   │                                          • normalizeString() - Chuẩn hóa tên NVL
│   │                                          • autoDetectCategory() - Auto detect nhóm hàng
│   │                                          • parseAndSaveBOM() - Import BOM to DB
│   │
│   ├── cukcukService.js                     ← Tích hợp CUKCUK API
│   │                                          • login() - Đăng nhập CUKCUK
│   │                                          • getSalesData() - Tải dữ liệu bán hàng
│   │                                          • getInventoryBalance() - Tải tồn kho
│   │
│   └── purchasePlanService.js               ← Tính toán kế hoạch mua
│                                              • calculatePlan() - Tính toán đề xuất số mua
│
│
├── 📂 pages\                                ← Frontend (Next.js React)
│   ├── _app.jsx                             ← Next.js App wrapper
│   └── purchase-plan.jsx                    ← Giao diện lập kế hoạch
│                                              • Tab: Đồ tươi / Đồ khô
│                                              • Tìm kiếm NVL
│                                              • Bảng hiển thị & sửa số mua
│                                              • Lưu kế hoạch
│
│
└── 📂 (Generated)
    └── .next\                               ← Build output (auto-gen)
    └── node_modules\                        ← npm packages (auto-gen)
    └── .env                                 ← Biến môi trường (tạo từ .env.example)
```

---

## 📊 Luồng Dữ Liệu

```
┌─────────────────────────────────────────────────────────────────┐
│                     CUKCUK System                               │
│                   (Accounting Software)                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ API: salesData & inventoryBalance
                         ↓
        ┌─────────────────────────────────────┐
        │  /api/cukcuk/sync                   │
        │  cukcukService.js                   │
        └────────────────┬────────────────────┘
                         │
                         ↓
        ┌─────────────────────────────────────────────┐
        │  PostgreSQL Database                        │
        │  ├─ cukcuk_daily_sales (bán hàng)          │
        │  ├─ inventory_tracking (tồn kho)           │
        │  ├─ raw_materials (master NVL)             │
        │  └─ bill_of_materials (định lượng BOM)     │
        └────┬───────────────────────────────────────┘
             │
             ├──────────────────────────────┐
             │                              │
             ↓                              ↓
    ┌──────────────────┐        ┌────────────────────┐
    │ /api/bom/upload  │        │ /api/purchase-     │
    │ bomService.js    │        │ plans/generate     │
    │                  │        │ purchasePlanService│
    │ • Parse Excel    │        │                    │
    │ • Auto-category  │        │ • Calc forecasts   │
    │ • Save to DB     │        │ • Suggest qty      │
    └────────┬─────────┘        └────────┬───────────┘
             │                           │
             └──────────────┬────────────┘
                            │
                            ↓
        ┌─────────────────────────────────────┐
        │  Frontend (Next.js React)           │
        │  purchase-plan.jsx                  │
        │                                     │
        │  ┌─ Màn hình lập kế hoạch         │
        │  ├─ Tab: Tươi / Khô               │
        │  ├─ Bảng sửa số mua               │
        │  └─ Nút Lưu                       │
        └─────────────────────────────────────┘
```

---

## 🔄 Quy Trình Sử Dụng (Happy Path)

```
1️⃣  User Tạo Chi Nhánh Mới
    └─→ POST /api/branches/create
        └─→ Lưu branch vào DB

2️⃣  User Upload File BOM Excel
    └─→ POST /api/bom/upload (multipart/form-data)
        ├─→ bomService.parseAndSaveBOM()
        ├─→ autoDetectCategory() → MEAT / SEAFOOD / VEGETABLE / DRY_SPICE
        ├─→ Tạo raw_materials nếu chưa tồn tại
        └─→ Lưu bill_of_materials (định lượng món ăn)

3️⃣  User Đồng Bộ CUKCUK (tuỳ chọn)
    └─→ POST /api/cukcuk/sync
        ├─→ cukcukService.login()
        ├─→ getSalesData() → lưu vào cukcuk_daily_sales
        └─→ getInventoryBalance() → lưu vào inventory_tracking

4️⃣  User Tạo Kế Hoạch Mua
    └─→ POST /api/purchase-plans/generate?cycleType=FRESH_3DAYS
        ├─→ Lấy materials từ DB
        ├─→ Tính avg daily sales (7 ngày gần nhất)
        ├─→ Tính projected demand (forecast 3 hoặc 7 ngày)
        ├─→ Công thức: 
        │   Nhu Cầu = (avg × ngày) + Hao Hụt + An Toàn - Tồn Hiện Tại
        ├─→ Làm tròn theo chu kỳ
        └─→ Trả về danh sách đề xuất

5️⃣  User Xem & Sửa Kế Hoạch (Frontend)
    └─→ Hiển thị bảng từ bước 4
        ├─→ User sửa số mua (final_purchase_qty)
        └─→ Lưu kế hoạch

6️⃣  User Xuất/In Kế Hoạch
    └─→ Export thành PDF/Excel
        └─→ Gửi cho nhà cung cấp
```

---

## 📑 Danh Sách Bảng Database

### `branches` - Danh Mục Chi Nhánh
```
branch_id (PK)      : Mã chi nhánh (VD: CN_GOVAP)
branch_name         : Tên chi nhánh
cukcuk_company_code : Mã công ty trong CUKCUK
created_at          : Ngày tạo
```

### `raw_materials` - Master Nguyên Vật Liệu
```
material_id         : Mã NVL (PK)
material_name       : Tên NVL
normalized_name     : Tên chuẩn hóa (tìm kiếm)
category_group      : MEAT / SEAFOOD / VEGETABLE / DRY_SPICE
purchase_cycle      : FRESH_3DAYS / WEEKLY_7DAYS
unit_recipe         : Đơn vị trong công thức (gr, ml, cái)
unit_purchase       : Đơn vị mua (kg, lít, gói)
conversion_rate     : Hệ số chuyển đổi (VD: gr→kg = 1000)
safety_stock        : Dự trữ an toàn
waste_rate          : Tỉ lệ hao hụt (%)
is_auto_created     : Được tạo tự động từ BOM
is_merged           : Đã hợp nhất/deprecated
created_at          : Ngày tạo
```

### `material_aliases` - Mã Ánh Xạ (Fuzzy Matching)
```
id (PK)             : Auto increment
master_material_id  : FK → raw_materials
alias_code          : Mã khác (VD: mã CUKCUK)
alias_name          : Tên khác
source              : CUKCUK / MANUAL
created_at          : Ngày tạo
```

### `bill_of_materials` - Định Lượng Món Ăn
```
id (PK)             : Auto increment
branch_id           : FK → branches
dish_id             : Mã món
dish_name           : Tên món
dish_unit           : Đơn vị (Phần, Cái, ...)
dish_price          : Giá bán
material_id         : FK → raw_materials
quantity_per_dish   : Số lượng NVL/Phần
updated_at          : Ngày cập nhật
```

### `cukcuk_daily_sales` - Bán Hàng Hàng Ngày
```
id (PK)             : Auto increment
branch_id           : FK → branches
dish_id             : Mã món
dish_name           : Tên món
quantity_sold       : Số lượng bán
sale_date           : Ngày
```

### `inventory_tracking` - Tồn Kho
```
id (PK)             : Auto increment
branch_id           : FK → branches
material_id         : FK → raw_materials
period_date         : Ngày
closing_stock       : Tồn cuối kỳ
UNIQUE(branch_id, material_id, period_date)
```

### `purchase_plans` - Header Kế Hoạch Mua
```
plan_id (PK)        : Auto increment
branch_id           : FK → branches
plan_name           : Tên kế hoạch
cycle_type          : FRESH_3DAYS / WEEKLY_7DAYS
start_date          : Ngày bắt đầu
end_date            : Ngày kết thúc
status              : DRAFT / APPROVED / COMPLETED
created_at          : Ngày tạo
```

### `purchase_plan_details` - Chi Tiết Kế Hoạch
```
id (PK)             : Auto increment
plan_id             : FK → purchase_plans
material_id         : FK → raw_materials
opening_stock       : Tồn đầu kỳ
sales_forecast_qty  : Nhu cầu dự báo
suggested_qty       : Số đề xuất
final_purchase_qty  : Số mua cuối cùng (người dùng sửa)
note                : Ghi chú
```

---

## 🔧 Các Service & Utilities

### `bomService.js`

```javascript
// Chuẩn hóa tên (tìm kiếm)
normalizeString("Thịt Ba Chỉ Bò Mỹ") 
→ "thitbachibomy"

// Auto phát hiện nhóm & chu kỳ
autoDetectCategory("TH00002", "Thịt ba chỉ bò")
→ { group: 'MEAT', cycle: 'FRESH_3DAYS' }

// Parse & Lưu BOM từ Excel Buffer
parseAndSaveBOM(buffer, 'CN_GOVAP', db)
→ { totalDishes: 3, totalMaterials: 8, newMaterialsCreated: 5 }
```

### `cukcukService.js`

```javascript
// Đăng nhập CUKCUK
login(companyCode, username, password)
→ { success: true, accessToken: "...", companyId: 123 }

// Lấy dữ liệu bán hàng (7 ngày qua)
getSalesData(token, fromDate, toDate)
→ [
    { dish_id: "SUKIYAKI_001", dish_name: "Sukiyaki Bò", quantity: 110 },
    ...
  ]

// Lấy tồn kho hiện tại
getInventoryBalance(token)
→ [
    { material_code: "TH00002", material_name: "Thịt Ba Chỉ", current_stock: 2500 },
    ...
  ]
```

### `purchasePlanService.js`

```javascript
// Tính kế hoạch mua cho một chu kỳ
calculatePlan(materials, salesDemandMap, inventoryMap, 'FRESH_3DAYS', 3)
→ [
    {
      material_id: 'TH00002',
      material_name: 'Thịt ba chỉ bò Mỹ',
      current_stock: 2.5,        // kg
      projected_demand: 8.0,      // kg
      suggested_qty: 6.5,         // kg (đề xuất)
      final_purchase_qty: 6.5     // kg (người dùng sửa)
    },
    ...
  ]
```

---

## 🚀 Scripts & Commands

```bash
# Cài dependencies
npm install

# Dev mode (auto reload, console logs)
npm run dev

# Production mode
npm start

# Database - Tạo tables
psql -U postgres -d fen_izakaya_db -f schema.sql

# Database - Load sample data
psql -U postgres -d fen_izakaya_db -f seed.sql

# Test API
curl -X POST http://localhost:5000/api/branches/create \
  -H "Content-Type: application/json" \
  -d '{"branchId":"CN_GOVAP","branchName":"Fen Gò Vấp"}'
```

---

## 📝 Ghi Chú Quan Trọng

1. **Conversion Rate**: 
   - Gr → Kg: 1000
   - Ml → Lít: 1000
   - Cái → Cái: 1

2. **Purchase Cycle**:
   - `FRESH_3DAYS`: Thịt, Hải sản, Rau (mua 3 ngày)
   - `WEEKLY_7DAYS`: Gia vị, Sốt, Rượu (mua 7 ngày)

3. **Safety Stock** (Dự Trữ):
   - Tươi sống: 0.5 ngày
   - Khô gia vị: 2 ngày

4. **Rounding**:
   - Tươi: 0.01 (0.01, 0.02, ..., 1.50, ...)
   - Khô: 0.5 (0.5, 1.0, 1.5, ...)
