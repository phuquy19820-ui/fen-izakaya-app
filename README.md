# Fen Izakaya - Web App Lập Kế Hoạch Mua NVL

## 📋 Mô Tả Dự Án

Web App tự động hóa lập kế hoạch mua **Nguyên Vật Liệu (NVL)** cho chuỗi nhà hàng Fen Izakaya (đa chi nhánh), tích hợp với hệ thống CUKCUK để:

- ✅ Tải định lượng món ăn (BOM) từ file Excel
- ✅ Đồng bộ dữ liệu bán hàng & tồn kho từ CUKCUK
- ✅ Tính toán tự động kế hoạch mua hàng theo chu kỳ (tươi sống 3 ngày / khô gia vị 7 ngày)
- ✅ Gợi ý số lượng mua dựa trên nhu cầu & lịch sử bán hàng
- ✅ Cho phép điều chỉnh thủ công & lưu kế hoạch

---

## 🏗️ Cấu Trúc Thư Mục

```
D:\Phần mềm mua hàng\
├── package.json                          # Dependencies & Scripts
├── server.js                             # Express Backend Server
├── schema.sql                            # Database Schema (PostgreSQL)
├── .env.example                          # Template biến môi trường
├── .gitignore                            # Git ignore file
├── README.md                             # File này
│
├── services/
│   ├── bomService.js                     # Xử lý upload & parse BOM từ Excel
│   ├── cukcukService.js                  # Tích hợp API CUKCUK
│   └── purchasePlanService.js            # Logic tính toán kế hoạch mua
│
└── pages/
    └── purchase-plan.jsx                 # React Frontend (Next.js)
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

## 📝 Phiên Bản

v1.0.0 - Initial Release
# Deployment timestamp: Fri Oct  2 22:20:36 SEAST 2026
# Deploy timestamp: Fri Oct  2 22:26:17 SEAST 2026
