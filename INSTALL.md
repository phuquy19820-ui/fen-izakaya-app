# 📚 Hướng Dẫn Cài Đặt Chi Tiết

## 🔧 Yêu Cầu Hệ Thống

- **Node.js**: v14+ (khuyến nghị v16+)
- **npm**: v6+
- **PostgreSQL**: v12+ (có database client)
- **Windows 10+** hoặc **Linux/Mac**

---

## ⚙️ Bước 1: Cài Đặt PostgreSQL

### Windows

1. Tải từ: [postgresql.org/download/windows](https://postgresql.org/download/windows)
2. Chạy installer, thiết lập:
   - **Password**: nhớ password cho user `postgres`
   - **Port**: mặc định `5432`
3. Kiểm tra: Mở PowerShell, chạy
   ```powershell
   psql --version
   ```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Mac

```bash
brew install postgresql
brew services start postgresql
```

---

## ⚙️ Bước 2: Tạo Database

### 2.1 Mở PostgreSQL CLI

**Windows (PowerShell):**
```powershell
psql -U postgres
```

**Linux/Mac:**
```bash
sudo -u postgres psql
```

### 2.2 Chạy SQL Tạo Database

```sql
CREATE DATABASE fen_izakaya_db ENCODING 'UTF8';
\c fen_izakaya_db
\i 'D:/Phần mềm mua hàng/schema.sql'
\dt
```

Nếu hiển thị các bảng (`branches`, `raw_materials`, ...) → **Thành công!**

Thoát:
```
\q
```

---

## 🚀 Bước 3: Cài Đặt Project

### 3.1 Mở Command Prompt / PowerShell

```powershell
cd "D:\Phần mềm mua hàng"
```

### 3.2 Cài Dependencies

```bash
npm install
```

Chờ khoảng 1-2 phút...

---

## ⚡ Bước 4: Cấu Hình Biến Môi Trường

### 4.1 Tạo file `.env`

Sao chép `.env.example`:

```powershell
copy .env.example .env
```

### 4.2 Chỉnh Sửa `.env`

Mở file `D:\Phần mềm mua hàng\.env` với Notepad/VS Code:

```env
# DATABASE (quan trọng!)
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/fen_izakaya_db

# Thay "your_password" bằng password bạn đặt khi cài PostgreSQL

# SERVER
PORT=5000
NODE_ENV=development

# CUKCUK API (lấy từ tài khoản CUKCUK của bạn)
CUKCUK_API_URL=https://openapi.cukcuk.vn/api/v1
CUKCUK_COMPANY_CODE=YOUR_COMPANY_CODE
CUKCUK_USERNAME=your_email@cukcuk.vn
CUKCUK_PASSWORD=your_password
```

**Kiểm tra kết nối Database:**

```powershell
psql -U postgres -d fen_izakaya_db -c "SELECT * FROM branches;"
```

---

## 🎯 Bước 5: Chạy Server

### 5.1 Development Mode (Tự động reload khi sửa code)

```bash
npm run dev
```

Bạn sẽ thấy:
```
[Server Running] Port 5000
```

### 5.2 Production Mode

```bash
npm start
```

---

## 🌐 Bước 6: Test API

Mở **Postman** hoặc **Insomnia**, test endpoint:

### Test 1: Tạo Chi Nhánh Mẫu

```http
POST http://localhost:5000/api/branches/create
Content-Type: application/json

{
  "branchId": "CN_GOVAP",
  "branchName": "Fen Izakaya - Gò Vấp",
  "cukcukCompanyCode": "FEN001"
}
```

**Response (Thành công):**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Izakaya - Gò Vấp thành công!"
}
```

### Test 2: Kiểm tra Database

```powershell
psql -U postgres -d fen_izakaya_db -c "SELECT * FROM branches;"
```

Nên thấy:
```
 branch_id | branch_name | cukcuk_company_code | created_at
-----------+-------------+---------------------+----------
 CN_GOVAP  | Fen Izakaya | FEN001              | 2026-10-02
```

---

## 📱 Bước 7: Chạy Frontend (Next.js)

### 7.1 Mở terminal thứ 2, vào folder project

```powershell
cd "D:\Phần mềm mua hàng"
```

### 7.2 Chạy Next.js

```bash
npm run dev
```

Truy cập: http://localhost:3000

---

## 🧪 Bước 8: Upload BOM Mẫu (Optional)

### 8.1 Tạo File Excel Mẫu

File `sample_bom.xlsx` có cấu trúc:

| Loại (*) | Mã món (*) | Tên món (*) | Giá bán (*) | Tên NVL | Mã NVL | Số lượng | Đơn vị tính |
|----------|-----------|-----------|-----------|---------|--------|---------|-----------|
| Món ăn | SUKIYAKI_01 | Sukiyaki Bò Hoa | 450000 | Thịt ba chỉ bò Mỹ | TH00002 | 250 | gr |
| | | | | Hành lá tươi | RC00014 | 30 | gr |
| Món ăn | SASHIMI_01 | Sashimi Hải Sản | 380000 | Cá Hồi Nõn | HS00005 | 150 | gr |

### 8.2 Test Upload

```http
POST http://localhost:5000/api/bom/upload
Content-Type: multipart/form-data

Form Data:
- file: sample_bom.xlsx (chọn file)
- branchId: CN_GOVAP
```

**Response:**
```json
{
  "success": true,
  "message": "Tải định lượng thành công!",
  "data": {
    "totalDishes": 2,
    "totalMaterials": 3,
    "newMaterialsCreated": 3
  }
}
```

---

## 🔌 Tích Hợp CUKCUK (Nếu Có Tài Khoản)

### Bước 1: Lấy Credentials

- Đăng nhập CUKCUK → Settings
- Tìm **API Key** hoặc **OAuth Token**
- Cập nhật `.env`:

```env
CUKCUK_COMPANY_CODE=your_code
CUKCUK_USERNAME=your_email@cukcuk.vn
CUKCUK_PASSWORD=your_password
```

### Bước 2: Test Sync

```http
POST http://localhost:5000/api/cukcuk/sync
Content-Type: application/json

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

## ✅ Kiểm Tra Hoàn Thành

Khi thấy dòng sau, bạn đã setup thành công:

```
[Server Running] Port 5000
```

---

## 🐛 Troubleshooting

### ❌ "error: ECONNREFUSED 127.0.0.1:5432"

**Nguyên nhân:** PostgreSQL không chạy

**Fix:**
```powershell
# Windows - Tìm Services, restart PostgreSQL
# Hoặc:
pg_ctl -D "C:\Program Files\PostgreSQL\16\data" start
```

### ❌ "password authentication failed"

**Nguyên nhân:** Password sai

**Fix:**
- Đặt lại password PostgreSQL:
  ```powershell
  psql -U postgres
  ALTER USER postgres WITH PASSWORD 'new_password';
  \q
  ```
- Update `.env` với password mới

### ❌ "ENOENT: no such file or directory"

**Nguyên nhân:** File `.env` không tồn tại

**Fix:**
```powershell
copy .env.example .env
# Rồi chỉnh sửa `.env`
```

### ❌ "Port 5000 already in use"

**Fix:**
```powershell
# Tìm process chạy trên port 5000
netstat -ano | findstr :5000

# Kill process (thay PID = số hiển thị)
taskkill /PID [PID] /F
```

---

## 📞 Hỗ Trợ

Email: phuquy19820@gmail.com
