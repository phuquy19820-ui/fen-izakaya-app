# 🍽️ Fen Izakaya - Hệ Thống Quản Lý Kế Hoạch Mua NVL

![Status](https://img.shields.io/badge/status-completed-brightgreen)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 📋 Mô Tả Dự Án

**Ứng dụng web tự động hóa lập kế hoạch mua Nguyên Vật Liệu (NVL)** cho chuỗi nhà hàng Fen Izakaya (đa chi nhánh), tích hợp với hệ thống CUKCUK.

### ✨ Tính Năng Chính

- ✅ **Quản lý đa chi nhánh** - Dữ liệu độc lập theo chi nhánh
- ✅ **Phân loại NVL tự động** - 8 loại theo chuẩn quốc tế (FAO)
- ✅ **Tải BOM từ Excel** - Upload & parse tự động công thức & định lượng
- ✅ **Tích hợp CUKCUK** - Đồng bộ dữ liệu bán hàng & tồn kho
- ✅ **Tính toán thông minh** - EOQ, Safety Stock, Reorder Point
- ✅ **Chu kỳ mua** - Tươi sống 3 ngày / Khô gia vị 7 ngày
- ✅ **Giao diện MISA** - UI chuẩn mực, responsive, dễ sử dụng
- ✅ **Sẵn deploy** - Render.com + Neon.tech

---

## 🏗️ Cấu Trúc Thư Mục

```
fen-izakaya-app/
├── pages/                                # Frontend (Next.js)
│   ├── index.jsx                         # 🏠 Dashboard - Danh sách chi nhánh
│   ├── purchase-plan.jsx                 # 📊 Lập kế hoạch mua hàng
│   ├── sync-cukcuk.jsx                   # 🔄 Đồng bộ CUKCUK & tải BOM
│   ├── _app.jsx                          # App wrapper
│   └── _document.jsx                     # Document template
│
├── services/                             # Business Logic & Services
│   ├── materialClassificationService.js  # 🏷️  Phân loại 8 loại NVL tự động
│   ├── purchasePlanService.js            # 📈 Tính toán kế hoạch mua (EOQ, SS, ROP)
│   ├── cukcukService.js                  # 🔗 Tích hợp CUKCUK API
│   └── bomService.js                     # 📄 Parse & upload BOM từ Excel/CSV
│
├── server.js                             # 🚀 Express API Server (11 endpoints)
├── schema.sql                            # 🗄️  PostgreSQL Schema (11 tables)
├── init-db.js                            # ⚙️  Database initialization script
│
├── package.json                          # 📦 Dependencies & npm scripts
├── next.config.js                        # ⚙️  Next.js configuration
├── .env.example                          # 🔑 Environment variables template
├── .gitignore                            # 📝 Git ignore file
│
├── QUICKSTART.md                         # 🚀 Bắt đầu nhanh (3 bước)
├── SETUP_GUIDE.md                        # 📚 Hướng dẫn chi tiết & troubleshooting
└── README.md                             # 📖 File này
```

---

## 📦 Cài Đặt & Chạy

### 1. **Cài Đặt Node.js Dependencies**

```bash
cd "D:\Phần mềm mua hàng"
npm install
```

### 2. **Thiết Lập Database PostgreSQL**

- Tạo database mới: `fen_izakaya_db`
- Chạy script SQL:

```bash
psql -U postgres -d fen_izakaya_db -f schema.sql
```

### 3. **Cấu Hình Biến Môi Trường**

Sao chép `.env.example` thành `.env`:

```bash
copy .env.example .env
```

Chỉnh sửa `.env`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/fen_izakaya_db
PORT=5000
CUKCUK_COMPANY_CODE=your_company_code
CUKCUK_USERNAME=your_username
CUKCUK_PASSWORD=your_password
```

### 4. **Chạy Backend Server**

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm start
```

Server sẽ chạy tại: `http://localhost:5000`

---

## 🔌 API Endpoints

### 1. **Tạo Chi Nhánh Mới**

```http
POST /api/branches/create
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "branchName": "Fen Izakaya - Gò Vấp",
  "cukcukCompanyCode": "COMPANY_CODE_123"
}
```

### 2. **Upload File BOM (Định Lượng)**

```http
POST /api/bom/upload
Content-Type: multipart/form-data

Form Data:
- file: [Excel file]
- branchId: "CN_GOVAP"
```

Yêu cầu Excel có các cột:
- `Loại (*)` → "Món ăn"
- `Mã món (*)` → Mã món
- `Tên món (*)` → Tên món
- `Giá bán (*)` → Giá
- `Tên NVL` → Tên nguyên vật liệu
- `Mã NVL` → Mã NVL
- `Số lượng` → Số lượng cần dùng
- `Đơn vị tính` → gr, ml, cái, ...

### 3. **Đồng Bộ CUKCUK**

```http
POST /api/cukcuk/sync
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "companyCode": "COMPANY_CODE",
  "username": "user@cukcuk.vn",
  "password": "password123",
  "fromDate": "2026-09-25",
  "toDate": "2026-10-02"
}
```

### 4. **Tạo Kế Hoạch Mua Hàng**

```http
POST /api/purchase-plans/generate
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "cycleType": "FRESH_3DAYS"  // hoặc "WEEKLY_7DAYS"
}
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "material_id": "TH00002",
      "material_name": "Thịt ba chỉ bò Mỹ lát",
      "category_group": "MEAT",
      "purchase_cycle": "FRESH_3DAYS",
      "unit_purchase": "kg",
      "current_stock": 1.5,
      "projected_demand": 8.0,
      "suggested_qty": 6.5,
      "final_purchase_qty": 6.5,
      "note": ""
    }
  ]
}
```

---

## 💡 Logic Tính Toán Kế Hoạch Mua

```
Công Thức:
----------

Nhu Cầu Tiên Lượng = TB Bán Hàng Ngày × Số Ngày Dự Báo
  ↓
Nhu Cầu + Hao Hụt = Nhu Cầu × (1 + Tỉ Lệ Hao Hụt %)
  ↓
An Toàn Dự Trữ = TB Bán Ngày × Ngày An Toàn (0.5 ngày tươi / 2 ngày khô)
  ↓
Nhu Cầu Thuần = (Nhu Cầu + Hao Hụt + An Toàn) - Tồn Kho Hiện Tại
  ↓
Số Mua Đề Xuất = Nhu Cầu Thuần / Tỷ Lệ Chuyển Đổi

Đặc Biệt:
- Tươi Sống (3 ngày): Làm tròn đến 0.01
- Khô Gia Vị (7 ngày): Làm tròn đến 0.5
```

---

## 🔄 Quy Trình Sử Dụng

1. **Bước 1**: Tạo chi nhánh → `/api/branches/create`
2. **Bước 2**: Upload file BOM → `/api/bom/upload`
3. **Bước 3**: Đồng bộ CUKCUK → `/api/cukcuk/sync`
4. **Bước 4**: Tạo kế hoạch → `/api/purchase-plans/generate`
5. **Bước 5**: Xem & điều chỉnh trong giao diện, sau đó lưu

---

## 🗄️ Danh Sách Bảng Database

| Bảng | Mô Tả |
|------|-------|
| `branches` | Danh mục chi nhánh |
| `raw_materials` | Master NVL (tất cả loại) |
| `material_aliases` | Mã ánh xạ / Fuzzy matching NVL |
| `bill_of_materials` | Định lượng món ăn theo chi nhánh |
| `cukcuk_daily_sales` | Dữ liệu bán hàng hàng ngày |
| `inventory_tracking` | Tồn kho hàng ngày |
| `purchase_plans` | Header kế hoạch mua |
| `purchase_plan_details` | Chi tiết từng NVL trong kế hoạch |

---

## 🎯 Nhóm Hàng & Chu Kỳ Mua

### Auto-Detection bởi `autoDetectCategory()`:

| Nhóm | Ký Hiệu | Chu Kỳ | Ví Dụ |
|------|---------|--------|-------|
| **Rau Củ** | RC | 3 Ngày | Hành lá, Gừng, Rau |
| **Thịt** | TH | 3 Ngày | Thịt Bò, Gà, Heo |
| **Hải Sản** | HS | 3 Ngày | Tôm, Cá, Mực |
| **Gia Vị Khô** | GBB | 7 Ngày | Bột Ớt, Mirin, Sake |

---

## 🔐 Bảo Mật

- Không commit `.env` lên Git
- Sử dụng biến môi trường cho tất cả credentials
- Không lưu mật khẩu CUKCUK trong database
- HTTPS cho kết nối CUKCUK API

---

## 🐛 Troubleshooting

**Lỗi: "Không thể kết nối database"**
- Kiểm tra PostgreSQL đang chạy
- Verify `DATABASE_URL` trong `.env`
- Chạy `schema.sql` để tạo table

**Lỗi: "Đăng nhập CUKCUK thất bại"**
- Verify credentials trong `.env`
- Kiểm tra CUKCUK API URL có khả dụng

**Lỗi: "Thiếu file Excel hoặc Chi nhánh"**
- Đảm bảo upload file BOM kèm `branchId`
- File phải có đúng cấu trúc cột

---

## 📧 Liên Hệ

**Developer**: phuquy19820@gmail.com

---

## 🚀 Bắt Đầu Nhanh (3 Bước)

### Bước 1: Cài Đặt
```bash
git clone https://github.com/phuquy19820-ui/fen-izakaya-app.git
cd fen-izakaya-app
npm install
```

### Bước 2: Cấu Hình Database
```bash
cp .env.example .env
# Sửa .env - cập nhật DATABASE_URL
npm run init-db
```

### Bước 3: Chạy
```bash
npm run dev
# Truy cập http://localhost:5000
```

**Xem chi tiết:** [QUICKSTART.md](QUICKSTART.md)

---

## ☁️ Deploy Production

### Render.com + Neon.tech
1. Database: Neon.tech (PostgreSQL)
2. Server: Render.com (Node.js + Next.js)
3. Cấu hình: 5 phút, deployment tự động từ GitHub

**Xem chi tiết:** [SETUP_GUIDE.md](SETUP_GUIDE.md)

---

## 📊 API Endpoints (11 endpoints)

```
GET    /api/branches                    # Danh sách chi nhánh
POST   /api/branches/create             # Tạo chi nhánh mới
GET    /api/branches/:branchId          # Chi tiết chi nhánh

GET    /api/materials/:branchId         # Danh sách NVL
POST   /api/materials/classify          # Phân loại NVL tự động

POST   /api/bom/upload                  # Upload Excel/CSV

POST   /api/cukcuk/sync                 # Đồng bộ dữ liệu CUKCUK

POST   /api/purchase-plans/generate     # Tạo kế hoạch mua
GET    /api/purchase-plans/:branchId    # Lấy kế hoạch đã tạo

GET    /api/inventory/:branchId         # Tồn kho hiện tại
POST   /api/inventory/record            # Ghi nhận tồn kho
```

---

## 📄 Tài Liệu Khác

| File | Nội Dung |
|------|---------|
| [QUICKSTART.md](QUICKSTART.md) | Bắt đầu trong 3 bước |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Hướng dẫn chi tiết & deploy |
| [schema.sql](schema.sql) | Cấu trúc 11 bảng PostgreSQL |

---

## 🏆 Hoàn Thành 100%

✅ Backend API - Tất cả 11 endpoints  
✅ Frontend UI - 3 trang chính + responsive design  
✅ Database - Cấu trúc hoàn chỉnh  
✅ Services - Tất cả business logic  
✅ Documentation - Hướng dẫn chi tiết  
✅ Deployment Ready - Sẵn deploy Render + Neon  

---

## 📞 Hỗ Trợ

**Developer:** phuquy19820@gmail.com

---

## 📝 Phiên Bản

v1.0.0 - Complete Release (Oct 03, 2026)
- Tất cả tính năng hoàn thành
- Sẵn sàng triển khai production
- Deploy ready trên Render.com + Neon.tech
