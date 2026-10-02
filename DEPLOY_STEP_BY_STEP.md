# 🚀 HƯỚNG DẪN DEPLOY CHI TIẾT - Từng Bước (15 Phút)

## 🎯 TỔNG QUAN

```
Bước 1 (5 phút)  → Tạo Database trên Neon.tech
Bước 2 (5 phút)  → Push Code lên GitHub
Bước 3 (5 phút)  → Deploy lên Vercel
      ↓
    ✅ App chạy tại: https://fen-izakaya-app.vercel.app
```

---

## 📱 BƯỚC 1: SETUP DATABASE TRÊN NEON.TECH (5 Phút)

### Step 1.1: Tạo Tài Khoản Neon

**Nếu chưa có Neon account:**

1. Mở browser → https://neon.tech
2. Click **"Get started"** (ngoài cùng bên phải)
3. Chọn **"Sign up with GitHub"**
4. Authorize Neon access to GitHub
5. Nhập tên (VD: "Phú Quý")
6. ✅ Setup xong, bạn vào Dashboard

### Step 1.2: Tạo Database Project

1. Dashboard → Click **"Create a project"** (nút xanh)
2. **Project name:** `fen-izakaya-db`
3. **Database name:** giữ mặc định `neondb`
4. **Postgres version:** v15 (để mặc định)
5. **Region:** Chọn **"Singapore"** (gần VN nhất)
6. Click **"Create project"**
7. Chờ 20-30 giây...

### Step 1.3: Tạo Tables (Schema)

1. Dashboard → Project `fen-izakaya-db` → Tab **"SQL Editor"** (trên cùng)
2. Click **"Execute"** hoặc tạo new query
3. **Copy toàn bộ** nội dung file `D:\Phần mềm mua hàng\schema.sql`
4. Paste vào editor
5. Chọn tất cả (Ctrl+A) → Nhấn **"Execute"** (Ctrl+Enter)
6. Chờ khoảng 10 giây
7. ✅ Kết quả: "Successfully executed" + hiển thị tables

### Step 1.4: Load Sample Data (Tuỳ Chọn)

1. **Mở tab SQL Editor mới** (nút dấu + xanh)
2. Copy toàn bộ `D:\Phần mềm mua hàng\seed.sql`
3. Paste vào editor
4. Click **"Execute"**
5. ✅ Dữ liệu mẫu đã load

### Step 1.5: Lấy Connection String ⭐

**RẤT QUAN TRỌNG - Lưu lại dòng này!**

1. Neon Dashboard → Project `fen-izakaya-db`
2. Click tab **"Connection string"** (cạnh SQL Editor)
3. Chọn tab **"PostgreSQL"**
4. Copy toàn bộ string (dạng): 
   ```
   postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/neondb?sslmode=require
   ```
5. **Mở Notepad, paste & lưu** (dùng sau cho Vercel)

✅ **Database đã ready!**

---

## 📦 BƯỚC 2: PUSH CODE LÊN GITHUB (5 Phút)

### Step 2.1: Tạo GitHub Repo

**Nếu chưa có GitHub account:**

1. https://github.com/signup
2. Email → Password → Username: `YOUR_USERNAME` (nhớ lại)
3. Verify email

**Tạo Repository Mới:**

1. Login GitHub → Bấm icon **"+"** (trên cùng phải)
2. Chọn **"New repository"**
3. **Repository name:** `fen-izakaya-app`
4. **Description:** (tùy ý) Web App lập kế hoạch mua NVL
5. **Public** hoặc Private (tuỳ ý)
6. ❌ KHÔNG tích "Initialize with README"
7. Click **"Create repository"**

### Step 2.2: Push Code từ Local

**Mở PowerShell (Quản trị viên):**

```powershell
# Bước 1: Vào folder dự án
cd "D:\Phần mềm mua hàng"

# Bước 2: Khởi tạo git
git init

# Bước 3: Configure git (nếu lần đầu)
git config --global user.name "Your Name"
git config --global user.email "your_email@gmail.com"

# Bước 4: Add tất cả files
git add .

# Bước 5: Commit
git commit -m "Initial commit: Fen Izakaya App v1.0.0"

# Bước 6: Đổi branch name thành 'main'
git branch -M main

# Bước 7: Add remote (thay YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/fen-izakaya-app.git

# Bước 8: Push lên GitHub
git push -u origin main
```

**Nếu bị hỏi password:**
- Dùng **GitHub Personal Access Token** (không phải password)
- Cách tạo: GitHub Settings → Developer Settings → Personal Access Tokens → Generate new token
- Chọn scope: `repo`, `write:repo_hook`
- Copy token, paste vào password prompt

✅ **Code đã lên GitHub!**

---

## 🚀 BƯỚC 3: DEPLOY LÊN VERCEL (5 Phút)

### Step 3.1: Tạo Vercel Account

**Nếu chưa có Vercel:**

1. https://vercel.com/signup
2. Click **"Continue with GitHub"**
3. Authorize Vercel
4. Chọn team (default: Personal)
5. ✅ Vào Dashboard

### Step 3.2: Import GitHub Repository

1. Dashboard Vercel → Click **"Add New..."** (hoặc "+ New Project")
2. Chọn **"Project"**
3. Dưới "**Import Git Repository**" → Paste repo URL:
   ```
   https://github.com/YOUR_USERNAME/fen-izakaya-app
   ```
4. Hoặc kéo xuống → Tìm repo `fen-izakaya-app` → Click chọn
5. Click **"Import"**

### Step 3.3: Cấu Hình Project

**Project Name:** `fen-izakaya-app` (giữ mặc định)

**Framework Preset:** 
- ✅ Vercel phát hiện "Next.js" tự động
- Nếu không → Chọn **"Next.js"**

**Root Directory:** 
- ✅ mặc định "." (đúng)

### Step 3.4: Thêm Environment Variables ⭐ **QUAN TRỌNG**

1. Scroll xuống → Tìm **"Environment Variables"**
2. Thêm từng biến:

**Biến 1: DATABASE_URL**
- Name: `DATABASE_URL`
- Value: Paste connection string từ Neon (từ Step 1.5)
  ```
  postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/neondb?sslmode=require
  ```
- Click **"Add"**

**Biến 2: NODE_ENV**
- Name: `NODE_ENV`
- Value: `production`
- Click **"Add"**

**Biến 3: PORT** (tuỳ chọn)
- Name: `PORT`
- Value: `5000`
- Click **"Add"**

**Biến 4: CUKCUK_API_URL** (nếu dùng CUKCUK)
- Name: `CUKCUK_API_URL`
- Value: `https://openapi.cukcuk.vn/api/v1`
- Click **"Add"**

### Step 3.5: Deploy

1. Click **"Deploy"** (nút biru bên phải)
2. **Chờ 2-3 phút** (thấy chữ "Building...")
3. Khi xong → Thấy **"Congratulations! Your project has been deployed."**
4. ✅ Copy **URL Deployment**: `https://fen-izakaya-app.vercel.app`

---

## 🧪 BƯỚC 4: TEST APP (Tức Thì)

### Test 1: Check Backend API

**Mở Terminal hoặc PowerShell mới:**

```powershell
# Test tạo chi nhánh
curl -X POST "https://fen-izakaya-app.vercel.app/api/branches/create" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"branchId":"CN_TEST","branchName":"Fen Test","cukcukCompanyCode":"TEST001"}' `
  -UseBasicParsing
```

**Nếu thấy:**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Test thành công!"
}
```

✅ **Backend chạy OK!**

### Test 2: Truy Cập Frontend

**Mở browser → Truy cập:**

```
https://fen-izakaya-app.vercel.app/purchase-plan
```

**Bạn sẽ thấy:**
- ✅ Tiêu đề: "LẬP KẾ HOẠCH MUA NGUYÊN VẬT LIỆU"
- ✅ Logo "FEN"
- ✅ Tab "🔴 MUA ĐỒ TƯƠI SỐNG" & "🔵 MUA ĐỒ KHÔ"
- ✅ Bảng với dữ liệu mẫu
- ✅ Có thể sửa số mua

✅ **Frontend chạy OK!**

### Test 3: Tạo Chi Nhánh từ UI (Optional)

Sẽ implement sau, nhưng API đã working!

---

## 📊 KẾT QUẢ CUỐI CÙNG

```
✅ DONE! App của bạn đang chạy live tại:

🌐 Frontend:  https://fen-izakaya-app.vercel.app
📡 API:       https://fen-izakaya-app.vercel.app/api/*
🗄️  Database:  Neon.tech PostgreSQL (Singapore)

Có thể truy cập từ bất kỳ đâu trên thế giới!
```

---

## 🔄 CẬP NHẬT CODE SAU NÀY

**Khi bạn sửa code local → muốn deploy lên:**

```powershell
cd "D:\Phần mềm mua hàng"

# Sửa code...

# Commit
git add .
git commit -m "Update: Describe your changes"

# Push lên GitHub
git push origin main
```

**Vercel tự động:**
- Nhận cảnh báo từ GitHub
- Build & deploy lại tự động (2-3 phút)
- ✅ Changes live

---

## 🆘 TROUBLESHOOTING

### ❌ Deploy Failed - "Cannot find module 'express'"

**Fix:**
```powershell
# Local
cd "D:\Phần mềm mua hàng"
npm install

# Commit & push
git add package-lock.json
git commit -m "Fix: npm install"
git push origin main

# Vercel tự động redeploy
```

### ❌ "Cannot connect to database"

**Fix:**
1. Kiểm tra `DATABASE_URL` ở Vercel environment vars
2. Copy connection string từ Neon lại (có thể lỗi copy)
3. Vercel Settings → Environment Variables → Edit
4. Redeploy

### ❌ "Page not found" khi truy cập

**Fix:**
- Đảm bảo Next.js page tồn tại: `pages/purchase-plan.jsx`
- Kiểm tra URL: `https://fen-izakaya-app.vercel.app/purchase-plan` (chính xác)

---

## ✅ CHECKLIST FINAL

- [ ] Neon account created
- [ ] Database created on Neon
- [ ] schema.sql executed
- [ ] seed.sql loaded
- [ ] Connection string copied
- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Vercel account created
- [ ] Project imported to Vercel
- [ ] Environment variables set
- [ ] Deploy successful
- [ ] API tested & working
- [ ] Frontend loads in browser
- [ ] 🎉 App is LIVE!

---

## 📞 CẦN GIÚP?

- **Neon Issues:** https://neon.tech/docs
- **Vercel Issues:** https://vercel.com/support
- **GitHub Issues:** https://github.com/support
- **Email:** phuquy19820@gmail.com

**Enjoy your app! 🚀**
