# ✅ CHECKLIST PRE-DEPLOYMENT - Test Local Trước Deploy

Chạy các bước này **local** trước khi push lên GitHub & deploy!

---

## 🎯 QUICK CHECK (2 Phút)

### Check 1: Package.json Complete

```powershell
cd "D:\Phần mềm mua hàng"

# Verify dependencies có đủ
type package.json | findstr "express"
type package.json | findstr "pg"
type package.json | findstr "axios"
type package.json | findstr "next"
```

✅ **Tất cả có** → OK

### Check 2: Database Local Ready

```bash
# Test kết nối local database
psql -U postgres -d fen_izakaya_db -c "SELECT COUNT(*) FROM raw_materials;"
```

✅ **Kết quả > 0** → Có dữ liệu

### Check 3: .env Correct

```powershell
type .env | findstr "DATABASE_URL"
type .env | findstr "NODE_ENV"
```

✅ **Đều có** → OK

---

## 🧪 FULL TESTING SUITE (10 Phút)

### Test 1: Build Verification

```bash
npm run build
```

**Expected:**
```
   ▲ Next.js 14.0.0
   - Compiling app
   - Compiling server
   ✓ Compiled successfully
```

❌ **Nếu lỗi:**
```bash
npm install
npm run build
```

### Test 2: Start Server Local

**Terminal 1:**
```bash
npm run dev
```

**Expected:**
```
[Server Running] Port 5000
```

❌ **Nếu lỗi port:**
```bash
# Tìm process dùng port 5000
netstat -ano | findstr :5000

# Kill process (thay PID)
taskkill /PID [PID] /F
```

### Test 3: API Endpoint Testing

**Terminal 2 (new PowerShell):**

#### Test 3a: Health Check

```bash
curl http://localhost:5000
```

#### Test 3b: Create Branch

```bash
curl -X POST http://localhost:5000/api/branches/create `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"branchId":"CN_TEST","branchName":"Fen Test","cukcukCompanyCode":"TEST"}' `
  -UseBasicParsing
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Test thành công!"
}
```

#### Test 3c: Generate Purchase Plan

```bash
curl -X POST http://localhost:5000/api/purchase-plans/generate `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"branchId":"CN_GOVAP","cycleType":"FRESH_3DAYS"}' `
  -UseBasicParsing
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "material_id": "TH00002",
      "material_name": "Thịt ba chỉ bò Mỹ lát",
      ...
    }
  ]
}
```

### Test 4: Frontend Check

**Browser:**
```
http://localhost:3000/purchase-plan
```

**Expected:**
- ✅ Page loads without errors
- ✅ Tiêu đề "LẬP KẾ HOẠCH MUA NGUYÊN VẬT LIỆU"
- ✅ Tab tươi/khô hiển thị
- ✅ Bảng dữ liệu mẫu
- ✅ Console không có red errors

### Test 5: Database Queries

```bash
# Trong PowerShell, test database
psql -U postgres -d fen_izakaya_db -c "SELECT * FROM branches LIMIT 1;"
```

---

## 🔍 CODE QUALITY CHECK (5 Phút)

### Check Node Version

```bash
node --version
# Expected: v14+
```

### Check npm Packages

```bash
npm list
# Kiểm tra không có warning đỏ
```

### Check .env Variables

```bash
# Windows PowerShell - xem biến môi trường
$env:DATABASE_URL
$env:NODE_ENV
```

### Check File Structure

```bash
tree /L 2
```

**Expected:**
```
D:.
├── server.js
├── package.json
├── schema.sql
├── .env
├── vercel.json
├── services/
│   ├── bomService.js
│   ├── cukcukService.js
│   └── purchasePlanService.js
└── pages/
    ├── _app.jsx
    └── purchase-plan.jsx
```

---

## 📋 GIT STATUS CHECK

```bash
# Check status
git status

# Should see:
# On branch main
# nothing to commit, working tree clean
```

---

## 🚨 COMMON ISSUES & FIXES

### Issue 1: "Port 5000 already in use"

```bash
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill it
taskkill /PID [PID] /F

# Or use different port
PORT=5001 npm run dev
```

### Issue 2: "Cannot find module"

```bash
# Clear node_modules
rm -r node_modules
rm package-lock.json

# Reinstall
npm install

# Try again
npm run dev
```

### Issue 3: Database connection error

```bash
# Check PostgreSQL running
pg_isready

# If not, start it
pg_ctl -D "C:\Program Files\PostgreSQL\16\data" start

# Test connection
psql -U postgres -d fen_izakaya_db
```

### Issue 4: API returns empty data

```bash
# Check if seed.sql loaded
psql -U postgres -d fen_izakaya_db -c "SELECT COUNT(*) FROM raw_materials;"

# If 0, load seed.sql again
psql -U postgres -d fen_izakaya_db -f seed.sql
```

---

## 🎯 FINAL CHECKLIST BEFORE DEPLOY

**Database:**
- [ ] PostgreSQL running locally
- [ ] Database `fen_izakaya_db` created
- [ ] Tables created (schema.sql executed)
- [ ] Sample data loaded (seed.sql)
- [ ] Can query: `SELECT COUNT(*) FROM branches;`

**Backend:**
- [ ] `npm install` completed
- [ ] `npm run build` successful
- [ ] `npm run dev` starts on port 5000
- [ ] API endpoints respond correctly
- [ ] No console errors

**Frontend:**
- [ ] Page loads at http://localhost:3000/purchase-plan
- [ ] UI displays correctly
- [ ] No JavaScript errors
- [ ] Data table shows sample data

**Git:**
- [ ] All files added: `git add .`
- [ ] Committed: `git commit -m "Initial commit"`
- [ ] Ready to push: `git push origin main`

**Environment:**
- [ ] .env file created from .env.example
- [ ] DATABASE_URL correct
- [ ] NODE_ENV set to production
- [ ] No secrets in .env (use env vars on Vercel)

**Deployment Prep:**
- [ ] Neon.tech account ready + connection string copied
- [ ] GitHub account ready + repo created
- [ ] Vercel account ready
- [ ] Vercel OAuth connected to GitHub

---

## ✅ READY TO DEPLOY?

**If all checks pass:**
```bash
cd "D:\Phần mềm mua hàng"

# Push to GitHub
git add .
git commit -m "Final version: Ready for deployment"
git push origin main

# Then follow DEPLOY_STEP_BY_STEP.md
```

---

## 🎉 SUCCESS INDICATORS

✅ Local tests all pass
✅ No console errors
✅ Database connected
✅ API responds
✅ Frontend renders

**→ YOU'RE READY TO DEPLOY!**

---

📞 Issues? Email: phuquy19820@gmail.com
