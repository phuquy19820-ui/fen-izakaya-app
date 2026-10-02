# 🔧 Hướng Dẫn Thiết Lập Environment Variables Trên Render

Nếu ứng dụng báo lỗi **"DATABASE_URL not set"**, bạn cần set nó trên Render dashboard.

## Bước 1: Vào Render Dashboard

```
1. Vào https://render.com
2. Đăng nhập tài khoản
3. Click vào project "fen-izakaya-app-v2"
```

## Bước 2: Vào Settings (Cấu Hình)

```
1. Tìm tab "Environment" hoặc "Settings"
2. Tìm phần "Environment Variables"
```

## Bước 3: Thêm DATABASE_URL

```
Tạo biến mới:
- Key: DATABASE_URL
- Value: postgresql://neondb_owner:npg_hx4GMlNFS2cO@ep-gentle-sun-b3nuwdkl-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

(Hoặc sử dụng connection string từ Neon.tech của bạn)
```

## Bước 4: Lưu & Redeploy

```
1. Click "Save" hoặc "Apply"
2. Render sẽ tự động redeploy
3. Chờ ~5 phút
4. Trang lại: https://fen-izakaya-app-v2.onrender.com
```

## 📍 Nếu vẫn lỗi:

Kiểm tra:
- ✅ DATABASE_URL đã được set? 
- ✅ Connection string chính xác?
- ✅ Neon.tech database active?

Nếu vẫn không được, hãy liên hệ: phuquy19820@gmail.com

---

**Note:** render.yaml có DATABASE_URL, nhưng Render dashboard thường không tự động load nó. Bạn cần set thủ công trên dashboard hoặc tệp render.yaml phải được commit và Render sẽ tự động apply.
