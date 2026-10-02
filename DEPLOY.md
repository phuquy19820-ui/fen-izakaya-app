# 🚀 DEPLOYMENT - Cài Đặt App Lên Cloud

## 📍 Kiến Trúc Deploy

```
┌──────────────────────────────────────────────────────────────┐
│                    Fen Izakaya App                           │
└──────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        ↓                        ↓
    Neon.tech              Vercel / Render.com
  (PostgreSQL)         (Node.js + Next.js)
  - Schema              - Backend (server.js)
  - Data                - Frontend (pages/)
  - 8 Tables            - Services (bomService, etc)
```

---

## 📝 YÊU CẦU TRƯỚC KHI DEPLOY

- ✅ GitHub account (để push code)
- ✅ Vercel hoặc Render account
- ✅ Neon.tech account
- ✅ Git cài trên máy

---

## 🔧 BƯỚC 1: SETUP NEON.TECH (Database)

### 1.1 Tạo Tài Khoản Neon

1. Truy cập: **https://neon.tech**
2. Click **"Sign Up"** → Dùng GitHub hoặc Email
3. Xác nhận email

### 1.2 Tạo Project

1. Dashboard → **"Create Project"**
2. Nhập tên: `fen-izakaya-db`
3. Region: Chọn gần nhất (VN chọn Singapore)
4. PostgreSQL version: v15+
5. Click **"Create project"**

### 1.3 Lấy Connection String

1. Project → **"Connection string"** tab
2. Copy `PostgreSQL` connection string (dạng):
   ```
   postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/fen_izakaya_db?sslmode=require
   ```
3. **Lưu lại** - dùng sau

### 1.4 Chạy SQL Schema

1. Neon Dashboard → **"SQL Editor"**
2. Copy toàn bộ nội dung file `schema.sql`
3. Paste vào SQL Editor
4. Click **"Execute"** (hoặc Ctrl+Enter)
5. Chờ khoảng 10 giây → ✅ Tables tạo xong

### 1.5 Load Sample Data (Optional)

1. Mở **SQL Editor** → Tab mới
2. Copy nội dung file `seed.sql`
3. Paste & Execute
4. ✅ Dữ liệu mẫu đã load

---

## 🚀 BƯỚC 2: SETUP GITHUB REPOSITORY

### 2.1 Tạo GitHub Repo

1. Truy cập: **https://github.com/new**
2. Repository name: `fen-izakaya-app`
3. Description: "Web App lập kế hoạch mua NVL cho chuỗi nhà hàng"
4. Public hoặc Private (tuỳ ý)
5. **Create repository**

### 2.2 Push Code Lên GitHub

```bash
# Mở PowerShell, vào folder dự án
cd "D:\Phần mềm mua hàng"

# Khởi tạo git
git init

# Add tất cả files
git add .

# Commit
git commit -m "Initial commit: Fen Izakaya App v1.0"

# Add remote (thay YOUR_USERNAME & REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/fen-izakaya-app.git

# Push lên main branch
git branch -M main
git push -u origin main
```

✅ **Code đã lên GitHub!**

---

## 🎯 BƯỚC 3: DEPLOY LÊN VERCEL (Khuyên Dùng)

### 3.1 Connect GitHub với Vercel

1. Truy cập: **https://vercel.com**
2. Click **"Sign Up"** → Chọn "GitHub"
3. Xác thực GitHub
4. Cho phép Vercel truy cập repositories

### 3.2 Import Project

1. Dashboard → **"Add New..."** → **"Project"**
2. Chọn repository: `fen-izakaya-app`
3. Click **"Import"**

### 3.3 Cấu Hình Build Settings

**Framework Preset:** Next.js

**Environment Variables** (Click "Add"):

```
DATABASE_URL = postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/fen_izakaya_db?sslmode=require
PORT = 5000
NODE_ENV = production
CUKCUK_API_URL = https://openapi.cukcuk.vn/api/v1
```

**Build Command:**
```
npm run build
```

**Start Command:**
```
npm start
```

### 3.4 Deploy

1. Click **"Deploy"**
2. Chờ 2-3 phút build & deploy
3. ✅ Xong! Vercel cho bạn URL: `https://fen-izakaya-app.vercel.app`

---

## 🎯 HOẶC DEPLOY LÊN RENDER (Giải Pháp Khác)

### 3.1 Connect GitHub với Render

1. Truy cập: **https://render.com**
2. Click **"Sign Up"** → Chọn "GitHub"
3. Xác thực & kết nối GitHub

### 3.2 Tạo Web Service

1. Dashboard → **"New +"** → **"Web Service"**
2. Chọn repository: `fen-izakaya-app`
3. Click **"Connect"**

### 3.3 Cấu Hình

**Name:** fen-izakaya-app

**Environment:** Node

**Build Command:**
```
npm install && npm run build
```

**Start Command:**
```
npm start
```

**Environment Variables:**

```
DATABASE_URL = postgresql://neon_user:password@ep-xxx.us-east-1.neon.tech/fen_izakaya_db?sslmode=require
PORT = 5000
NODE_ENV = production
CUKCUK_API_URL = https://openapi.cukcuk.vn/api/v1
```

### 3.4 Deploy

1. Click **"Create Web Service"**
2. Chờ build (3-5 phút)
3. ✅ URL: `https://fen-izakaya-app.onrender.com`

---

## ⚙️ BƯỚC 4: CONFIGURE BIẾN MÔI TRƯỜNG

### Vercel

1. Dashboard → Project Settings → **"Environment Variables"**
2. Thêm từng biến:
   - `DATABASE_URL` = (Connection string từ Neon)
   - `PORT` = 5000
   - `NODE_ENV` = production
   - `CUKCUK_API_URL` = https://openapi.cukcuk.vn/api/v1

### Render

1. Dashboard → Web Service → **"Environment"**
2. Thêm tất cả biến (như trên)

---

## 🧪 BƯỚC 5: TEST APP

### Test 1: Check Health

```bash
# Truy cập backend health check
curl https://fen-izakaya-app.vercel.app/api/branches/create
# Nếu có response → ✅ Backend chạy
```

### Test 2: Tạo Chi Nhánh

```bash
curl -X POST https://fen-izakaya-app.vercel.app/api/branches/create \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "CN_GOVAP",
    "branchName": "Fen Izakaya - Gò Vấp",
    "cukcukCompanyCode": "FEN001"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Izakaya - Gò Vấp thành công!"
}
```

### Test 3: Truy Cập Frontend

Mở browser:
```
https://fen-izakaya-app.vercel.app/purchase-plan
```

✅ Bạn sẽ thấy giao diện lập kế hoạch!

---

## 📊 KẾT QUẢ CUỐI CÙNG

```
┌────────────────────────────────────────────────┐
│  Frontend (Next.js + React)                    │
│  URL: https://fen-izakaya-app.vercel.app      │
│                                                │
│  ├─ /purchase-plan (Giao diện lập kế hoạch)  │
│  └─ API Backend (server.js)                   │
│      ├─ POST /api/branches/create             │
│      ├─ POST /api/bom/upload                  │
│      ├─ POST /api/cukcuk/sync                 │
│      └─ POST /api/purchase-plans/generate     │
└────────────────────────────────────────────────┘
                        │
                        ↓
        ┌───────────────────────────────┐
        │  PostgreSQL Database           │
        │  Neon.tech                     │
        │                               │
        │  ✓ 8 Tables (branches, etc)   │
        │  ✓ Sample Data (seed.sql)     │
        │  ✓ Auto Backups               │
        └───────────────────────────────┘
```

---

## 🔗 CUSTOM DOMAIN (Optional)

### Vercel

1. Settings → **"Domains"**
2. Add custom domain: `fen-izakaya.yourdomain.com`
3. Cấu hình DNS records (hướng dẫn bên Vercel)

### Render

1. Settings → **"Custom Domains"**
2. Add domain & cấu hình DNS

---

## 🐛 TROUBLESHOOTING

### ❌ "Cannot connect to database"

**Fix:**
- Kiểm tra `DATABASE_URL` chính xác
- Neon → SQL Editor → Test query: `SELECT 1`
- Vercel/Render → Redeploy

### ❌ "Build failed"

**Fix:**
```bash
# Local test
npm install
npm run build
npm start
```

Nếu lỗi local → Fix lỗi → Push GitHub → Redeploy

### ❌ "Module not found: axios"

**Fix:**
- Check `package.json` có `axios`?
- Chạy `npm install` local
- Push lên GitHub
- Redeploy

---

## 📈 SCALING UP (Nếu Cần)

**Neon.tech:**
- Tự động scale storage
- Upgrade plan nếu cần compute power

**Vercel:**
- Free tier: up to 100GB bandwidth
- Pro: $20/month

**Render:**
- Free tier: auto sleep sau 15 phút
- Paid: $7+/month

---

## 🎯 CHECKLIST FINAL

- [ ] Neon.tech database created
- [ ] schema.sql executed
- [ ] seed.sql loaded (optional)
- [ ] GitHub repo created
- [ ] Code pushed to GitHub
- [ ] Vercel/Render connected
- [ ] Environment variables set
- [ ] Build successful
- [ ] API endpoints tested
- [ ] Frontend loads (http://localhost:3000)
- [ ] App live & working! 🎉

---

## 📞 SUPPORT

Email: phuquy19820@gmail.com

Vercel Support: https://vercel.com/support
Render Support: https://render.com/docs
Neon Support: https://neon.tech/docs
