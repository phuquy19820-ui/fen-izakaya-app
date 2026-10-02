# 📡 API Documentation

Base URL: `http://localhost:5000`

---

## 1️⃣ Tạo Chi Nhánh Mới

### Request

```http
POST /api/branches/create
Content-Type: application/json
```

**Body:**
```json
{
  "branchId": "CN_GOVAP",
  "branchName": "Fen Izakaya - Gò Vấp",
  "cukcukCompanyCode": "FEN001"
}
```

### Response

**Success (201):**
```json
{
  "success": true,
  "message": "Đã tạo chi nhánh Fen Izakaya - Gò Vấp thành công!"
}
```

**Error (500):**
```json
{
  "success": false,
  "message": "Error message here"
}
```

### Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `branchId` | String | ✅ | Mã chi nhánh (Ví dụ: CN_GOVAP, CN_BD) |
| `branchName` | String | ✅ | Tên chi nhánh |
| `cukcukCompanyCode` | String | ❌ | Mã công ty trong CUKCUK |

---

## 2️⃣ Upload File BOM (Định Lượng)

### Request

```http
POST /api/bom/upload
Content-Type: multipart/form-data
```

**Form Data:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | File | ✅ | File Excel (.xlsx) |
| `branchId` | String | ✅ | Mã chi nhánh (CN_GOVAP) |

**Excel Format (Sheet 1):**

Dòng 1: Header
```
Loại (*) | Mã món (*) | Tên món (*) | Giá bán (*) | Tên NVL | Mã NVL | Số lượng | Đơn vị tính
```

Dòng 2+: Data
```
Món ăn | SUKIYAKI_001 | Sukiyaki Bò Hoa | 450000 | Thịt ba chỉ bò Mỹ | TH00002 | 250 | gr
       |              |                 |        | Hành lá tươi     | RC00014 | 30  | gr
Món ăn | SASHIMI_001  | Sashimi Hải Sản  | 380000 | Cá Hồi Nõn       | HS00005 | 150 | gr
```

### Response

**Success (200):**
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

**Error (400):**
```json
{
  "success": false,
  "message": "Thiếu file hoặc Chi nhánh"
}
```

**Error (500):**
```json
{
  "success": false,
  "message": "Error processing file"
}
```

### Notes

- File phải có format `.xlsx`
- Dòng 1 = Header (bỏ qua)
- Dòng 2+ = Dữ liệu
- Nếu `Mã NVL` để trống → tự tạo từ `Tên NVL` normalize
- `autoDetectCategory()` tự động phân loại (MEAT/SEAFOOD/VEGETABLE/DRY_SPICE)

---

## 3️⃣ Đồng Bộ CUKCUK

### Request

```http
POST /api/cukcuk/sync
Content-Type: application/json
```

**Body:**
```json
{
  "branchId": "CN_GOVAP",
  "companyCode": "FEN001",
  "username": "user@cukcuk.vn",
  "password": "password123",
  "fromDate": "2026-09-25",
  "toDate": "2026-10-02"
}
```

### Response

**Success (200):**
```json
{
  "success": true,
  "message": "Đồng bộ CUKCUK thành công!"
}
```

**Error (401 - Auth Failed):**
```json
{
  "success": false,
  "message": "Đăng nhập CUKCUK thất bại."
}
```

**Error (500):**
```json
{
  "success": false,
  "message": "Không thể kết nối đến máy chủ CUKCUK."
}
```

### Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `branchId` | String | ✅ | Mã chi nhánh |
| `companyCode` | String | ✅ | Mã công ty CUKCUK |
| `username` | String | ✅ | Email/username CUKCUK |
| `password` | String | ✅ | Password CUKCUK |
| `fromDate` | Date | ✅ | Từ ngày (YYYY-MM-DD) |
| `toDate` | Date | ✅ | Đến ngày (YYYY-MM-DD) |

### Dữ Liệu Đồng Bộ

1. **Bán Hàng** → Bảng `cukcuk_daily_sales`
   - Lấy tất cả hóa đơn đã thanh toán (Status = 2)
   - Group by Dish ID, Sum Quantity

2. **Tồn Kho** → Bảng `inventory_tracking`
   - Lấy tồn cuối kỳ của tất cả NVL
   - Insert hoặc Update nếu đã tồn tại

---

## 4️⃣ Tạo Kế Hoạch Mua Hàng

### Request

```http
POST /api/purchase-plans/generate
Content-Type: application/json
```

**Body:**
```json
{
  "branchId": "CN_GOVAP",
  "cycleType": "FRESH_3DAYS"
}
```

Hoặc:
```json
{
  "branchId": "CN_GOVAP",
  "cycleType": "WEEKLY_7DAYS"
}
```

### Response

**Success (200):**
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
    },
    {
      "material_id": "RC00014",
      "material_name": "Hành lá tươi",
      "category_group": "VEGETABLE",
      "purchase_cycle": "FRESH_3DAYS",
      "unit_purchase": "kg",
      "current_stock": 0.8,
      "projected_demand": 3.0,
      "suggested_qty": 2.2,
      "final_purchase_qty": 3.0,
      "note": "Tiệc cuối tuần"
    },
    {
      "material_id": "GBB00021",
      "material_name": "Bột Ớt 7 Vị NANAMI TOGARASHI",
      "category_group": "DRY_SPICE",
      "purchase_cycle": "WEEKLY_7DAYS",
      "unit_purchase": "gói",
      "current_stock": 1,
      "projected_demand": 4,
      "suggested_qty": 3,
      "final_purchase_qty": 3,
      "note": ""
    }
  ]
}
```

**Error (500):**
```json
{
  "success": false,
  "message": "Error message"
}
```

### Parameters

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `branchId` | String | ✅ | CN_GOVAP, CN_BD, ... |
| `cycleType` | String | ✅ | `FRESH_3DAYS` hoặc `WEEKLY_7DAYS` |

### Response Fields

| Field | Type | Notes |
|-------|------|-------|
| `material_id` | String | Mã NVL |
| `material_name` | String | Tên NVL |
| `category_group` | String | MEAT / SEAFOOD / VEGETABLE / DRY_SPICE |
| `purchase_cycle` | String | Chu kỳ mua hàng |
| `unit_purchase` | String | Đơn vị mua (kg, lít, gói, ...) |
| `current_stock` | Number | Tồn kho hiện tại |
| `projected_demand` | Number | Dự báo nhu cầu (3 hoặc 7 ngày) |
| `suggested_qty` | Number | **Số đề xuất** (đã tính toán) |
| `final_purchase_qty` | Number | Số mua cuối cùng (user sửa) |
| `note` | String | Ghi chú |

### Công Thức Tính Toán

```
1. Avg Daily Sales = ∑ Bán Hàng 7 Ngày / 7

2. Projected Demand = Avg × Days (3 hoặc 7)

3. With Waste = Projected × (1 + WasteRate%)

4. Safety Stock = Avg × SafetyDays
   - FRESH_3DAYS: 0.5 ngày
   - WEEKLY_7DAYS: 2 ngày

5. Net Requirement = (With Waste + Safety) - Current Stock

6. Suggested = Net / ConversionRate

7. Rounded Suggested:
   - FRESH_3DAYS: Math.round(x * 100) / 100
   - WEEKLY_7DAYS: Math.ceil(x * 2) / 2
```

---

## 📊 Ví Dụ Luồng Hoàn Chỉnh

### 1. Tạo Chi Nhánh

```bash
curl -X POST http://localhost:5000/api/branches/create \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "CN_GOVAP",
    "branchName": "Fen Izakaya - Gò Vấp",
    "cukcukCompanyCode": "FEN001"
  }'
```

### 2. Upload BOM

```bash
curl -X POST http://localhost:5000/api/bom/upload \
  -F "file=@D:\my_bom.xlsx" \
  -F "branchId=CN_GOVAP"
```

### 3. Đồng Bộ CUKCUK (tuỳ chọn)

```bash
curl -X POST http://localhost:5000/api/cukcuk/sync \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "CN_GOVAP",
    "companyCode": "FEN001",
    "username": "user@cukcuk.vn",
    "password": "password",
    "fromDate": "2026-09-25",
    "toDate": "2026-10-02"
  }'
```

### 4. Tạo Kế Hoạch

```bash
curl -X POST http://localhost:5000/api/purchase-plans/generate \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": "CN_GOVAP",
    "cycleType": "FRESH_3DAYS"
  }'
```

---

## 🔐 Bảo Mật

- ✅ Sử dụng HTTPS trong production
- ✅ Không log passwords trong console
- ✅ Validate input từ client
- ✅ Xử lý errors không leak thông tin nhạy cảm

---

## ⚠️ Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (missing fields, invalid format) |
| 401 | Unauthorized (CUKCUK login failed) |
| 500 | Server Error |

---

## 🧪 Test Với Postman

### Bước 1: Tạo Collection

**New Collection** → `Fen Izakaya API`

### Bước 2: Add Requests

1. **Create Branch**
   - POST: `http://localhost:5000/api/branches/create`
   - Body: JSON (xem ở trên)

2. **Upload BOM**
   - POST: `http://localhost:5000/api/bom/upload`
   - Body: form-data
     - `file`: [chọn Excel file]
     - `branchId`: CN_GOVAP

3. **Generate Plan**
   - POST: `http://localhost:5000/api/purchase-plans/generate`
   - Body: JSON (xem ở trên)

### Bước 3: Run

Click **Send** trên từng request

---

## 📞 Support

Email: phuquy19820@gmail.com
