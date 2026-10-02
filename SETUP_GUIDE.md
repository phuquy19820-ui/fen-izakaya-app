# 🍽️ Fen Izakaya - Hệ Thống Quản Lý Kế Hoạch Mua NVL

**Hệ thống web tự động phân loại nguyên vật liệu, tính toán kế hoạch mua dựa trên dữ liệu bán hàng từ CUKCUK.**

## 📋 Tính Năng

✅ **Quản lý đa chi nhánh** - Độc lập dữ liệu theo chi nhánh  
✅ **Tích hợp CUKCUK** - Đồng bộ dữ liệu bán hàng & tồn kho tự động  
✅ **Phân loại NVL** - Tự động phân loại 8 loại nguyên vật liệu theo chuẩn quốc tế  
✅ **Tính toán thông minh** - EOQ, Safety Stock, Reorder Point  
✅ **Upload BOM** - Tải công thức & định lượng từ Excel  
✅ **Giao diện MISA** - UI chuẩn mực, dễ sử dụng  

---

## 🚀 Cài Đặt Nhanh (Quick Start)

### 1️⃣ Yêu Cầu Hệ Thống

- Node.js 16+ 
- PostgreSQL 12+ (hoặc Neon.tech)
- npm hoặc yarn

### 2️⃣ Cài Đặt Dependencies

```bash
npm install
```

### 3️⃣ Cấu Hình Cơ Sở Dữ Liệu

Copy `.env.example` thành `.env` và cập nhật:

```bash
cp .env.example .env
```

Mở `.env` và cập nhật:

```env
# Database - Neon.tech hoặc PostgreSQL local
DATABASE_URL=postgresql://user:password@localhost:5432/fen_izakaya_db

# Server
PORT=5000
NODE_ENV=development

# CUKCUK API
CUKCUK_API_URL=https://openapi.cukcuk.vn/api/v1
```

### 4️⃣ Khởi Tạo Cơ Sở Dữ Liệu

```bash
node init-db.js
```

### 5️⃣ Chạy Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

Truy cập: `http://localhost:5000`

---

## 📚 Hướng Dẫn Sử Dụng

### Bước 1: Tạo Chi Nhánh

1. Vào trang chủ → Click "Tạo Chi Nhánh Mới"
2. Nhập:
   - **Mã Chi Nhánh** (VD: `CN_GOVAP`)
   - **Tên Chi Nhánh** (VD: `Fen Izakaya - Gò Vấp`)
   - **Mã Công Ty CUKCUK** (nếu có)

### Bước 2: Tải Định Lượng (BOM)

1. Chọn chi nhánh → Click "Đồng Bộ"
2. Chọn tab "📄 Tải Định Lượng (BOM)"
3. Upload file Excel chứa công thức & định lượng
   - Format: Cột "Tên NVL", "Số lượng", "Mã món", v.v.
   - File mẫu: `RECIPE FEN IZAKAYA- HÀ NỘI.xlsx`

### Bước 3: Đồng Bộ CUKCUK

1. Vào "Đồng Bộ" → Tab "🔄 Đồng Bộ Dữ Liệu CUKCUK"
2. Nhập thông tin CUKCUK:
   - Mã công ty
   - Tên đăng nhập
   - Mật khẩu
   - Khoảng ngày
3. Click "🔄 Đồng Bộ CUKCUK"

### Bước 4: Lập Kế Hoạch Mua

1. Chọn chi nhánh → Click "📊 Kế Hoạch Mua"
2. Click "🔄 Tạo Kế Hoạch"
3. Chọn chu kỳ:
   - 🔴 **ĐỒ TƯƠI (3 Ngày)** - Thịt, cá, rau, v.v.
   - 🔵 **ĐỒ KHÔ (7 Ngày)** - Gia vị, sốt, v.v.
4. Xem đề xuất & sửa số lượng nếu cần
5. Click "💾 Lưu Kế Hoạch"

---

## 🗂️ Cấu Trúc Thư Mục

```
fen-izakaya-app/
├── pages/                    # Frontend (Next.js)
│   ├── index.jsx            # Danh sách chi nhánh
│   ├── purchase-plan.jsx    # Lập kế hoạch mua
│   └── sync-cukcuk.jsx      # Đồng bộ CUKCUK & tải BOM
├── services/                # Business logic
│   ├── materialClassificationService.js  # Phân loại NVL
│   ├── purchasePlanService.js           # Tính toán kế hoạch mua
│   ├── cukcukService.js                 # Tích hợp CUKCUK API
│   └── bomService.js                    # Parse BOM từ Excel
├── schema.sql               # Cấu trúc cơ sở dữ liệu
├── server.js                # Express API server
├── package.json             # Dependencies
├── .env.example             # Template biến môi trường
└── init-db.js              # Script khởi tạo DB
```

---

## 📊 API Endpoints

### Chi Nhánh (Branches)

```
GET  /api/branches                      # Lấy danh sách chi nhánh
GET  /api/branches/:branchId            # Lấy chi tiết chi nhánh
POST /api/branches/create               # Tạo chi nhánh mới
```

### Nguyên Vật Liệu (Materials)

```
GET  /api/materials/:branchId           # Danh sách NVL theo chi nhánh
POST /api/materials/classify            # Phân loại NVL tự động
```

### Định Lượng (BOM)

```
POST /api/bom/upload                    # Tải file Excel/CSV
```

### Đồng Bộ CUKCUK

```
POST /api/cukcuk/sync                   # Đồng bộ dữ liệu bán hàng & tồn kho
```

### Kế Hoạch Mua (Purchase Plans)

```
POST /api/purchase-plans/generate       # Tạo kế hoạch mua
GET  /api/purchase-plans/:branchId      # Lấy kế hoạch đã tạo
```

### Tồn Kho (Inventory)

```
GET  /api/inventory/:branchId           # Lấy tồn kho hiện tại
POST /api/inventory/record              # Ghi nhận tồn kho
```

---

## 🗄️ Cơ Sở Dữ Liệu

### Các Bảng Chính

- **branches** - Chi nhánh & thông tin CUKCUK
- **raw_materials** - Danh sách NVL + phân loại
- **bill_of_materials** - Định lượng (BOM)
- **cukcuk_daily_sales** - Dữ liệu bán hàng
- **inventory_tracking** - Theo dõi tồn kho
- **purchase_plans** - Lịch sử kế hoạch mua
- **recipes** - Công thức món ăn
- **recipe_ingredients** - Chi tiết nguyên liệu trong công thức

---

## 🚢 Triển Khai

### Trên Render.com

1. Tạo tài khoản tại [render.com](https://render.com)
2. Tạo PostgreSQL Database
3. Deploy từ GitHub:
   - Chọn Git Repository
   - Cấu hình biến môi trường (DATABASE_URL, PORT, etc.)
   - Chạy lệnh build: `npm install && npm run build`
   - Chạy lệnh start: `npm start`

### Trên Vercel (Frontend)

1. Deploy Next.js frontend riêng
2. API server vẫn chạy trên Render.com

---

## ⚙️ Phân Loại NVL (Material Classification)

Hệ thống tự động phân loại 8 loại:

| Loại | Chu Kỳ Mua | Hạn Sử Dụng | Hao Hụt |
|------|-----------|-----------|---------|
| 🥩 Thịt Tươi | 3 ngày | 3 ngày | 5% |
| 🐟 Hải Sản | 3 ngày | 2 ngày | 10% |
| 🥬 Rau/Quả | 3 ngày | 3 ngày | 8% |
| 🌿 Thảo Mộc | 3 ngày | 3 ngày | 15% |
| 🌶️ Gia Vị Khô | 7 ngày | 90 ngày | 2% |
| 📦 Hàng Khô | 7 ngày | 60 ngày | 3% |
| ❄️ Đông Lạnh | 7 ngày | 20 ngày | 2% |
| 🍲 Sốt/Condiment | 7 ngày | 30 ngày | 2% |

---

## 🧮 Công Thức Tính Toán

### Safety Stock (Tồn Kho An Toàn)
```
Safety Stock = Avg Daily Sales × (Lead Time + 1)
```

### Forecasted Demand (Nhu Cầu Dự Báo)
```
Forecasted Demand = Avg Daily Sales × Forecast Days × (1 + Waste Rate%)
```

### Reorder Point (Điểm Đặt Hàng Lại)
```
Reorder Point = Avg Daily Sales × Lead Time + Safety Stock
```

### Suggested Purchase Qty (Số Lượng Đề Xuất)
```
Suggested Qty = MAX(0, Forecasted Demand + Reorder Point - Current Stock)
```

---

## 🐛 Xử Lý Sự Cố

### Lỗi "Database connection failed"

```bash
# Kiểm tra DATABASE_URL trong .env
# Đảm bảo PostgreSQL đang chạy
# Chạy: node init-db.js
```

### Lỗi khi tải file BOM

```bash
# Đảm bảo file Excel có cột: Tên NVL, Số lượng, Mã món
# Format Excel: rows từ hàng 3 trở đi
# File tối đa 50MB
```

### Lỗi CUKCUK sync

```bash
# Kiểm tra thông tin đăng nhập CUKCUK
# Đảm bảo tài khoản CUKCUK có quyền API
# Kiểm tra khoảng ngày hợp lệ
```

---

## 📞 Hỗ Trợ

Liên hệ: phuquy19820@gmail.com

---

**Made with ❤️ for Fen Izakaya**
