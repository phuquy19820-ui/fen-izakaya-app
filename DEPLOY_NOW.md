# 🚀 TRIỂN KHAI NGAY - Hướng Dẫn Chi Tiết

**Dự kiến: 20 phút từ đầu đến cuối**

---

## 📋 Bước 1: Tạo Database Trên Neon.tech (5 phút)

### 1a. Đăng Ký Neon.tech
```
1. Vào https://neon.tech
2. Click "Sign up" 
3. Chọn "Continue with GitHub" (dùng tài khoản GitHub của bạn)
   - Email: phuquy19820@gmail.com
   - Cho phép Neon.tech truy cập GitHub
4. Tạo dự án mới:
   - Project Name: fen-izakaya
   - Database name: fen_izakaya_db
   - Username: neon_user (hoặc để mặc định)
5. Click "Create project"
```

### 1b. Lấy Connection String
```
Sau khi tạo xong, bạn sẽ thấy trang "Connection string"

Tìm dòng:
postgresql://neon_user:xxxxxxxxxxxx@ep-xxx-xxx.neon.tech/fen_izakaya_db

📋 Copy toàn bộ dòng này - bạn sẽ cần ở bước tiếp theo!
(Nếu không thấy, click "Connection string" hoặc "Connection details")
```

---

## 📋 Bước 2: Deploy Server Lên Render.com (5 phút)

### 2a. Đăng Ký Render.com
```
1. Vào https://render.com
2. Click "Sign up"
3. Chọn "Sign up with GitHub"
   - Authorize Render to access your repositories
4. Xác nhận email nếu cần
```

### 2b. Tạo Web Service
```
1. Vào https://render.com/dashboard
2. Click "New +" → "Web Service"
3. Chọn repository:
   - Tìm: fen-izakaya-app
   - Click để chọn
4. Cấu hình:
   - Name: fen-izakaya-app
   - Environment: Node
   - Build Command: npm install && npm run build
   - Start Command: npm start
   - Runtime: node-16 (hoặc cao hơn)
5. Scroll xuống "Environment"
6. Thêm biến môi trường:
   - Key: DATABASE_URL
   - Value: [PASTE CONNECTION STRING từ Neon.tech]
   
   (Ví dụ: postgresql://neon_user:xxxx@ep-xxx.neon.tech/fen_izakaya_db)
7. Click "Create Web Service"
```

### 2c. Chờ Deploy
```
- Render sẽ tự động build & deploy
- Bạn sẽ thấy logs chạy
- Chờ đến khi thấy: "✅ Server Running on Port 5000"
- Nó sẽ cho bạn URL: https://fen-izakaya-app.onrender.com (hoặc tương tự)
- Lưu lại URL này!
```

---

## 📋 Bước 3: Khởi Tạo Database (5 phút)

### 3a. Mở Render Shell
```
1. Vào https://render.com/dashboard
2. Click vào project "fen-izakaya-app"
3. Tìm tab "Shell" (bên cạnh "Logs")
4. Click vào "Shell"
```

### 3b. Chạy Khởi Tạo Database
```
Trong Shell, gõ:

npm run init-db

Chờ kết quả:
✅ Database initialized successfully!

(Nếu gặp lỗi, xem phần "Xử Lý Sự Cố" ở cuối file này)
```

---

## 📋 Bước 4: Test Ứng Dụng (5 phút)

### 4a. Vào Trang Chủ
```
1. Vào URL từ Render: https://fen-izakaya-app.onrender.com
   (hoặc bất kỳ URL nào Render đã cho bạn)

2. Bạn sẽ thấy trang chủ với:
   - Logo "🍽️ Fen Izakaya"
   - Nút "Tạo Chi Nhánh Mới"
   - Danh sách chi nhánh (trống lúc đầu)
```

### 4b. Test Tạo Chi Nhánh
```
1. Click "Tạo Chi Nhánh Mới"
2. Nhập:
   - Mã Chi Nhánh: CN_GOVAP
   - Tên Chi Nhánh: Fen Izakaya - Gò Vấp
   - Mã Công Ty CUKCUK: (để trống nếu chưa có)
3. Click "✅ Tạo"
4. Bạn sẽ thấy thông báo "Tạo chi nhánh thành công!"
5. Chi nhánh xuất hiện trong danh sách
```

### 4c. Test 3 Trang Chính
```
Trên card chi nhánh:

1. Click "📊 Kế Hoạch Mua"
   - Phải thấy: Trang lập kế hoạch mua hàng
   - Click "🔄 Tạo Kế Hoạch" (sẽ báo chưa có dữ liệu, bình thường)

2. Quay lại homepage (click logo hoặc browser back)

3. Click "🔄 Đồng Bộ"
   - Phải thấy: Trang đồng bộ CUKCUK
   - 2 tab: Tải BOM & Đồng bộ CUKCUK

✅ Nếu cả 3 trang hoạt động = Ứng dụng sẵn sàng!
```

---

## 🔧 Sử Dụng Thực Tế

### Từng Bước Lập Kế Hoạch Mua Hàng

#### Bước 1: Tải Định Lượng (BOM)
```
1. Vào tab "🔄 Đồng Bộ" của chi nhánh
2. Tab "📄 Tải Định Lượng (BOM)"
3. Upload file Excel với công thức:
   - File phải có cột: Tên NVL, Số lượng, Mã món, Tên món
   - Dữ liệu từ hàng 3 trở đi
4. Click tải
5. Thấy kết quả: tổng số món ăn & nguyên vật liệu
```

#### Bước 2: Đồng Bộ CUKCUK (Nếu Có Tài Khoản)
```
1. Tab "🔄 Đồng Bộ CUKCUK"
2. Nhập thông tin CUKCUK:
   - Mã công ty
   - Tên đăng nhập
   - Mật khẩu
   - Từ ngày - Đến ngày
3. Click "🔄 Đồng Bộ CUKCUK"
4. Nó sẽ lấy dữ liệu bán hàng & tồn kho
```

#### Bước 3: Lập Kế Hoạch Mua
```
1. Vào "📊 Kế Hoạch Mua"
2. Click "🔄 Tạo Kế Hoạch"
3. Chọn chu kỳ:
   - 🔴 ĐỒ TƯƠI (3 Ngày) - Thịt, cá, rau
   - 🔵 ĐỒ KHÔ (7 Ngày) - Gia vị, sốt
4. Xem bảng kết quả:
   - Tồn kho hiện tại
   - Số lượng đề xuất
   - Đơn giá
   - Thành tiền
5. Sửa số lượng nếu cần
6. Click "💾 Lưu Kế Hoạch"
```

---

## ❓ Xử Lý Sự Cố

### Problem: "Database connection failed"
```
Giải pháp:
1. Kiểm tra CONNECTION STRING từ Neon.tech
2. Vào Render dashboard → Environment
3. Xác nhận DATABASE_URL chính xác
4. Click "Redeploy latest commit"
5. Chờ deploy lại
6. Chạy lại: npm run init-db
```

### Problem: "npm run init-db bị lỗi"
```
Giải pháp:
1. Xem error message kỹ
2. Nếu lỗi "ECONNREFUSED" = Database chưa kết nối
   - Kiểm tra DATABASE_URL lại
3. Nếu lỗi "syntax error" = Schema SQL có vấn đề
   - Liên hệ: phuquy19820@gmail.com
```

### Problem: "Trang trắng / không load"
```
Giải pháp:
1. Vào Render → Logs (mở xem)
2. Kiểm tra có error gì
3. Nếu thấy port error = container chưa sẵn sàng
   - Chờ 1-2 phút rồi tải lại
```

### Problem: "Upload BOM không hoạt động"
```
Giải pháp:
1. Đảm bảo file Excel có đúng cấu trúc:
   - Cột: Loại, Mã món, Tên món, Giá bán, Tên NVL, Số lượng
   - Dữ liệu từ hàng 3 trở đi
2. File size ≤ 50MB
3. Nếu vẫn lỗi → liên hệ support
```

---

## ✅ Checklist Triển Khai

Đánh dấu khi hoàn thành:

- [ ] Tạo tài khoản Neon.tech
- [ ] Tạo database fen_izakaya_db
- [ ] Copy CONNECTION STRING từ Neon
- [ ] Tạo tài khoản Render.com
- [ ] Tạo Web Service từ GitHub
- [ ] Paste DATABASE_URL vào Render env
- [ ] Đợi Render build & deploy xong
- [ ] Chạy: npm run init-db
- [ ] Test trang chủ - OK
- [ ] Test tạo chi nhánh - OK
- [ ] Test 3 trang chính - OK
- [ ] App sẵn sàng sử dụng! ✅

---

## 📞 Liên Hệ Hỗ Trợ

**Nếu gặp vấn đề:**
- Email: phuquy19820@gmail.com
- GitHub Issues: https://github.com/phuquy19820-ui/fen-izakaya-app/issues

---

## 🎉 Xong!

Nếu bạn đã hoàn thành đến đây, ứng dụng của bạn đã:

✅ Chạy trực tiếp trên mạng  
✅ Có database PostgreSQL  
✅ API hoạt động  
✅ Frontend hiển thị  
✅ Sẵn sàng sử dụng  

**Chúc mừng! Bạn vừa triển khai một ứng dụng web production! 🚀**

---

**Được tạo:** 03 tháng 10 năm 2026  
**Phiên bản:** 1.0.0  
**Trạng thái:** ✅ Sẵn sàng triển khai
