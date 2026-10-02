# 🚀 Quick Start - Bắt Đầu Nhanh (5 Phút)

## ✅ Những Gì Đã Có

Bộ mã nguồn hoàn chỉnh gồm:

```
✓ Backend (Express.js)    - 4 API chính
✓ Frontend (Next.js React)- 1 trang lập kế hoạch
✓ Database Schema (SQL)   - 8 bảng
✓ Services (3 modules)    - BOM, CUKCUK, Purchase Plan
✓ Config (.env template)  - Biến môi trường
✓ Documentation (4 files) - Hướng dẫn chi tiết
```

---

## 🎯 Bắt Đầu Trong 5 Phút

### **Phút 1-2: Cài Đặt**

```powershell
cd "D:\Phần mềm mua hàng"
npm install
```

### **Phút 3: Cấu Hình Database**

Mở PowerShell, chạy:

```powershell
# Tạo database
psql -U postgres -c "CREATE DATABASE fen_izakaya_db ENCODING 'UTF8';"

# Tạo các bảng
psql -U postgres -d fen_izakaya_db -f schema.sql

# Load dữ liệu mẫu (optional)
psql -U postgres -d fen_izakaya_db -f seed.sql
```

### **Phút 4: Cấu Hình `.env`**

```powershell
copy .env.example .env
# Mở D:\Phần mềm mua hàng\.env với Notepad
# Sửa: DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/fen_izakaya_db
```

### **Phút 5: Chạy Server**

```powershell
npm run dev
```

Bạn sẽ thấy:
```
[Server Running] Port 5000
```

✅ **XONG!** Server chạy tại `http://localhost:5000`

---

## 🧪 Test Ngay Sau Khi Chạy

### Test 1: Tạo Chi Nhánh (Browser)

Mở **Postman** hoặc `curl`:

```bash
POST http://localhost:5000/api/branches/create
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "branchName": "Fen Izakaya - Gò Vấp",
  "cukcukCompanyCode": "FEN001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Izakaya - Gò Vấp thành công!"
}
```

### Test 2: Tạo Kế Hoạch Mua (Dùng dữ liệu mẫu)

```bash
POST http://localhost:5000/api/purchase-plans/generate
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "cycleType": "FRESH_3DAYS"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "material_id": "TH00002",
      "material_name": "Thịt ba chỉ bò Mỹ lát",
      "category_group": "MEAT",
      "current_stock": 2.5,
      "projected_demand": 8.0,
      "suggested_qty": 6.5,
      "final_purchase_qty": 6.5
    },
    ...
  ]
}
```

---

## 📱 Chạy Frontend

Mở terminal thứ 2:

```powershell
cd "D:\Phần mềm mua hàng"
npm run dev
```

Truy cập: **http://localhost:3000/purchase-plan**

Bạn sẽ thấy:
- ✅ Bảng lập kế hoạch (mẫu)
- ✅ Tab: Tươi / Khô
- ✅ Tìm kiếm NVL
- ✅ Sửa số mua
- ✅ Nút Lưu

---

## 📚 Tiếp Theo: Hướng Dẫn Chi Tiết

| File | Mục Đích |
|------|---------|
| **README.md** | Tổng quan dự án & API |
| **INSTALL.md** | Hướng dẫn cài đặt từng bước |
| **STRUCTURE.md** | Cấu trúc code & database |
| **QUICK_START.md** | File này (bắt đầu nhanh) |

---

## 🔌 Tích Hợp CUKCUK (Tuỳ Chọn)

Nếu có tài khoản CUKCUK:

1. Cập nhật `.env`:
   ```env
   CUKCUK_COMPANY_CODE=YOUR_CODE
   CUKCUK_USERNAME=your_email@cukcuk.vn
   CUKCUK_PASSWORD=your_password
   ```

2. Gọi API:
   ```bash
   POST /api/cukcuk/sync
   {
     "branchId": "CN_GOVAP",
     "companyCode": "FEN001",
     "username": "your_email@cukcuk.vn",
     "password": "your_password",
     "fromDate": "2026-09-25",
     "toDate": "2026-10-02"
   }
   ```

---

## 🐛 Gặp Lỗi? Check List

- [ ] PostgreSQL đang chạy? → `psql --version`
- [ ] Database tồn tại? → `psql -l | grep fen_izakaya_db`
- [ ] `.env` có `DATABASE_URL`? → `type .env`
- [ ] Port 5000 trống? → `netstat -ano | findstr :5000`
- [ ] Node 14+? → `node --version`

---

## 📞 Hỗ Trợ

📧 Email: phuquy19820@gmail.com

---

## 📦 File Structure Tóm Gọn

```
D:\Phần mềm mua hàng\
├── server.js (Backend)
├── schema.sql (Database)
├── seed.sql (Sample Data)
├── pages/purchase-plan.jsx (Frontend)
├── services/ (3 modules)
│   ├── bomService.js
│   ├── cukcukService.js
│   └── purchasePlanService.js
├── .env (Config - tạo từ .env.example)
├── package.json
├── next.config.js
└── README.md, INSTALL.md, STRUCTURE.md
```

---

**🎉 Bây giờ bạn đã sẵn sàng để bắt đầu!**

Tiếp theo:
1. ✅ Chạy `npm install` & `npm run dev`
2. ✅ Test API với Postman
3. ✅ Tìm hiểu thêm ở `README.md`
