# 🚀 Bắt Đầu Nhanh - Fen Izakaya Purchase Planning

**Hệ thống đã hoàn thiện 100%. Hãy làm theo các bước dưới để chạy ngay!**

## 📦 Những Gì Đã Sẵn Sàng

✅ **Backend API** - Express.js với 11 API endpoints  
✅ **Frontend UI** - Next.js với 3 trang chính  
✅ **Database Schema** - PostgreSQL với 11 bảng  
✅ **Services** - 4 service modules hoàn chỉnh  
✅ **Documentation** - Hướng dẫn chi tiết  

---

## 🚀 Chạy Ngay (Local Development)

### 1. Chuẩn Bị Database

**Option A: Neon.tech (Cloud - Khuyến Nghị)**

```bash
# Truy cập https://neon.tech
# 1. Tạo tài khoản & dự án
# 2. Copy Connection String (PostgreSQL format)
# 3. Paste vào .env (DATABASE_URL)
```

**Option B: PostgreSQL Local**

```bash
# Windows: Download từ https://www.postgresql.org/download/windows/
# Sau cài đặt:
# 1. Mở pgAdmin hoặc terminal
# 2. Tạo database: CREATE DATABASE fen_izakaya_db;
# 3. Database URL: postgresql://postgres:password@localhost:5432/fen_izakaya_db
```

### 2. Cấu Hình .env

```bash
# Copy template
cp .env.example .env

# Mở .env và cập nhật:
DATABASE_URL=<your-database-url>
PORT=5000
NODE_ENV=development
```

### 3. Cài Đặt & Chạy

```bash
# Cài dependencies
npm install

# Khởi tạo database
npm run init-db

# Chạy development server
npm run dev

# Truy cập http://localhost:5000
```

---

## ☁️ Deploy Lên Render.com (Production)

### 1. Chuẩn Bị

- GitHub account (có rồi ✅)
- Neon.tech database (hoặc PostgreSQL khác)

### 2. Deploy Database (Neon.tech)

```
1. Vào https://neon.tech
2. Tạo Project mới
3. Copy Connection String
4. Giữ lại cho bước sau
```

### 3. Deploy Server (Render.com)

```
1. Truy cập https://render.com
2. Sign up với GitHub
3. Click "New +" → Web Service
4. Chọn: phuquy19820-ui/fen-izakaya-app
5. Cấu hình:
   - Name: fen-izakaya-app (hoặc tên khác)
   - Environment: Node
   - Build Command: npm install && npm run build
   - Start Command: npm start
   - Runtime: node-16+ (tùy chọn)

6. Environment Variables:
   DATABASE_URL=<từ Neon.tech>
   PORT=5000
   NODE_ENV=production

7. Click "Create Web Service"
8. Chờ ~3-5 phút build & deploy
9. Truy cập URL được cấp (VD: https://fen-izakaya-app.onrender.com)
```

### 4. Database Setup Trên Production

Sau khi deploy, chạy một lần init-db:

```bash
# Trên Render console:
npm run init-db
```

---

## 📋 Danh Sách Check Before Live

- [ ] Database URL có trong .env
- [ ] npm install chạy thành công
- [ ] npm run init-db chạy không lỗi
- [ ] npm run dev chạy OK trên local
- [ ] Có thể vào http://localhost:5000
- [ ] GitHub push hoàn tất
- [ ] Render.com deployment thành công

---

## 🎯 Các Bước Sử Dụng (Sau Deploy)

### Trang chủ (http://yourapp.com)

1. ✅ **Tạo Chi Nhánh** - Nhập mã & tên chi nhánh
2. 📄 **Chọn Chi Nhánh** → Click "🔄 Đồng Bộ"

### Trang Đồng Bộ (/sync-cukcuk)

1. 📊 **Tải BOM** - Upload file Excel định lượng
2. 🔄 **Đồng Bộ CUKCUK** - Login & lấy dữ liệu
   - Mã công ty CUKCUK
   - Tên đăng nhập
   - Mật khẩu
   - Khoảng ngày

### Trang Kế Hoạch Mua (/purchase-plan)

1. 🔄 **Tạo Kế Hoạch** - Click nút "Tạo Kế Hoạch"
2. 📊 **Xem Chi Tiết** - Bảng hiển thị đề xuất mua
3. ✏️ **Sửa Số Lượng** - Click vào ô "Thực Mua"
4. 💾 **Lưu** - Click nút "Lưu Kế Hoạch"

---

## 🔧 Troubleshooting

### Lỗi "Database connection failed"

```bash
# Kiểm tra:
1. DATABASE_URL trong .env đúng
2. Database server đang chạy
3. Chạy lại: npm run init-db
```

### Lỗi "Port 5000 already in use"

```bash
# Thay port trong .env:
PORT=3000  # hoặc port khác
```

### Lỗi khi tải BOM

```bash
# Đảm bảo:
1. File là Excel/CSV
2. Có cột: Tên NVL, Số lượng, Mã món
3. Data từ hàng 3 trở đi
4. File ≤ 50MB
```

### Render deployment fail

```bash
# Kiểm tra Render logs:
1. Vào Render.com → Project
2. Xem "Events" & "Logs"
3. Kiểm tra lỗi build/start
4. Đảm bảo DATABASE_URL đúng
```

---

## 📞 URLs Quan Trọng

| Thành Phần | URL |
|-----------|-----|
| GitHub | https://github.com/phuquy19820-ui/fen-izakaya-app |
| Neon.tech DB | https://neon.tech |
| Render.com Deploy | https://render.com |
| CUKCUK API Doc | https://openapi.cukcuk.vn/docs |

---

## ✨ Tính Năng API (Sẵn Sàng)

```
POST   /api/branches/create                    # Tạo chi nhánh
GET    /api/branches                           # Danh sách chi nhánh
GET    /api/branches/:branchId                 # Chi tiết chi nhánh

POST   /api/bom/upload                         # Upload BOM
GET    /api/materials/:branchId                # Danh sách NVL
POST   /api/materials/classify                 # Phân loại NVL

POST   /api/cukcuk/sync                        # Đồng bộ CUKCUK
POST   /api/purchase-plans/generate            # Tạo kế hoạch mua
GET    /api/purchase-plans/:branchId           # Lấy kế hoạch
GET    /api/inventory/:branchId                # Tồn kho
POST   /api/inventory/record                   # Ghi nhận tồn kho
```

---

## 🎉 Congratulations!

Bạn đã hoàn thành một hệ thống quản lý kế hoạch mua hàng chuyên nghiệp!

**Tiếp theo:**
- Deploy lên Render.com
- Kết nối CUKCUK của bạn
- Tạo chi nhánh & tải BOM
- Lập kế hoạch mua tự động

**Hỗ trợ:** phuquy19820@gmail.com

---

**Made with ❤️ for Fen Izakaya**
