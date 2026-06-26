# Đặc tả logic tính giá — Báo giá Offset (để port sang Next.js)

Tài liệu này mô tả **dữ liệu** và **logic tính giá** bóc ra từ file `Báo giá OFFSET v7.2 (chuan hoa).xlsx`,
dùng làm nguồn chuẩn để dựng lại bằng TypeScript. Mỗi loại sản phẩm có một form riêng nhưng dùng
chung tầng dữ liệu (`/data/*.json`) và các hàm tra cứu/tính chung.

> Quy ước: tiền VND. "SL" = số lượng đặt hàng. "Khổ bình" = khổ in. "Khổ giấy lớn" = khổ tờ giấy gốc.

---

## 1. Tầng dữ liệu (`/data`)

| File | Mô tả | Khóa tra cứu |
|---|---|---|
| `materials_clean.json` | Vật liệu (đã gộp alias), giá VAT/chưa VAT, gsm, khổ tờ | `code` (+ `aliases`) |
| `vat_tu.json` | Bảng giá vật tư gốc đầy đủ (161 dòng) | `name` |
| `kho_in.json` | Khổ in → số con, diện tích (m²), loại kẽm | `khoIn` |
| `fixed_sizes.json` | Khổ cố định cho tờ rơi & bì thư/folder | `kichThuoc` |
| `kem.json` | Giá kẽm nhỏ/lớn theo số kẽm, vật tư bề mặt, đơn giá 1 kẽm | `soKem` / `ten` |
| `gia_cong.json` | 14 công đoạn × 16 bậc SL + `billingMode` | `code` |
| `ep_kim.json` | Giá ép kim theo vị trí & SL | `viTri` |
| `ty_le.json` | Hằng số: hao hụt, MOQ, VAT, chiết khấu, `mocSoLuong` | `params.*` |
| `phi_co_dinh.json` | Phí khuôn bế, thiết kế | `code` |

### Hằng số (`ty_le.json → params`)
| Tham số | Giá trị | Ý nghĩa |
|---|---|---|
| `TyLe_VAT` | 0.08 | Thuế VAT 8% |
| `TyLe_ChietKhau` | 0.05 | Chiết khấu mặc định (đã thống nhất cho mọi sheet) |
| `TyLe_ChietKhau_Max` | 0.10 | Trần chiết khấu |
| `MOQ_GiaCong` | 1000 | Dưới mức này, công đoạn `minCharge` dùng giá tối thiểu |
| `MOQ_BinhBai_Nho` | 3000 | Lượt in tối thiểu máy nhỏ (ngưỡng tính bình bài) |
| `MOQ_BinhBai_Lon` | 3000 | Lượt in tối thiểu máy lớn |
| `GiaMin_XLBM` | 250000 | Giá tối thiểu xử lý bề mặt |
| `GiaMin_Be` | 250000 | Giá tối thiểu bế |
| `GiaMin_DanHop` | 250000 | Giá tối thiểu dán hộp |
| `GiaMin_DongGoi` | 100000 | Giá tối thiểu đóng gói |

---

## 2. Các hàm tra cứu cốt lõi (lib/lookups)

### 2.1 Tra giá vật liệu
```
giaGiay(code) = materials_clean.find(m => m.code===code || m.aliases.includes(code)).priceVAT
```

### 2.2 Tra bậc giá gia công — QUAN TRỌNG
Excel dùng `LOOKUP(SL, MocSoLuong, dãy 16 đơn giá)`. `MocSoLuong` là **17 ngưỡng** trong
`ty_le.json`: `[1,299,499,699,999,1999,2999,4999,6999,9999,19999,29999,39999,49999,69999,99999,999999]`.
Cơ chế: tìm ngưỡng **lớn nhất ≤ SL**, lấy đơn giá ở **đúng vị trí đó** trong dãy `tiers` của công đoạn.

```ts
function pickRate(sl: number, tiers: {price:number}[], mocSoLuong: number[]): number {
  let idx = 0;
  for (let i = 0; i < mocSoLuong.length; i++) if (sl >= mocSoLuong[i]) idx = i;
  return tiers[Math.min(idx, tiers.length - 1)].price;   // dãy tiers có 16 phần tử
}
```
> Lưu ý: chọn bậc theo **`mocSoLuong`** (không phải theo `min/max` trong `tiers`); hai cái lệch nhẹ ở biên,
> phải theo `mocSoLuong` để khớp Excel.

### 2.3 Tính tiền một công đoạn (theo `billingMode`)
```ts
function chiPhiGiaCong(code, sl, params, giaCong, mocSoLuong): number {
  const rec = giaCong.find(g => g.code === code);
  const rate = pickRate(sl, rec.tiers, mocSoLuong);   // đơn giá/cái
  if (rec.billingMode === "minCharge") {
    return sl < params.MOQ_GiaCong ? params[rec.minChargeParam] : rate * sl;
  }
  // perUnit: luôn đơn giá/cái × SL
  return rate * sl;
  // external (EPKIM): KHÔNG dùng hàm này — xem 2.5
}
```

### 2.4 Kẽm in
- Loại kẽm (nhỏ/lớn): lấy từ `kho_in[khoIn].loaiKem`. (Excel bản cũ suy bằng IF chuỗi — nên thay bằng tra `kho_in`.)
- Đơn giá 1 kẽm: `kem.donGia1Kem.kemNho` (50000) / `kemLon` (100000) — dùng cho **chi phí làm kẽm** = đơn giá × số kẽm.
- Bình bài: `kem.kemNho[soKem].donGia` (kẽm nhỏ) hoặc `kem.kemLon[soKem].donGia` (kẽm lớn) → giá gốc bình bài.
  - `chiPhiBinhBai = luotIn <= MOQ_BinhBai ? giaGoc : (luotIn * giaGoc) / MOQ_BinhBai`

### 2.5 Ép kim (`ep_kim.json`) — ĐƠN VỊ HỖN HỢP
Cột `duoi100` là **giá trọn gói** (vd 200000), các cột còn lại là **đơn giá/cái** (1300/1000/250).
```ts
function chiPhiEpKim(viTri, sl, epKim): number {
  if (viTri === "Không") return 0;
  const row = epKim.rows.find(r => r.viTri === viTri);
  if (sl < 100)  return row.duoi100;            // trọn gói, KHÔNG nhân SL
  if (sl < 499)  return row.tu100_499 * sl;
  if (sl < 999)  return row.tu500_999 * sl;
  return row.tren1000 * sl;
}
```

### 2.6 Hao hụt
```ts
haoHut(sl) = ty_le.haoHut (mảng {mocSoLuong,tyLe}) → LOOKUP ngưỡng lớn nhất ≤ sl → tyLe
```

---

## 3. Thuật toán: TỜ RƠI / TỜ GẤP / LETTER (khổ cố định)

**Input người dùng:** `kichThuoc` (chọn từ `fixed_sizes.toRoi`), `materialCode`, `soMatIn` (1/2),
`soLuong`, `soKemIn`, `vatTuBeMat`, `khuon` (Có/Không), `thanhPhamGap` (Không/TP thủ công/TP máy),
`catXen` (Có/Không), `dongGoi` (Có/Không), `thietKe` (số tiền).

**Tra khổ** (từ `fixed_sizes.toRoi` theo `kichThuoc`):
```
khoBinh         = row.khoIn
khoGiayLon      = row.khoGiayLon
soConKhoBinh    = row.soConBaiIn        // F
soConKhoGiayLon = row.soConToLon        // G = F × hệ số chia
```

**Các bước tính** (đối chiếu công thức Excel sheet "Báo giá tờ rơi"):
| # | Khoản | Công thức |
|---|---|---|
| 1 | Lượt in | `luotIn = soLuong / soConKhoBinh * soMatIn` |
| 2 | Số tờ lớn | `soToLon = ROUNDUP(soLuong / soConKhoGiayLon)` |
| 3 | **CP giấy** | `giaGiay(material) * soToLon` |
| 4 | **CP kẽm** | `donGia1Kem(loaiKem) * soKemIn` |
| 5 | **CP vật tư bề mặt** | `dienTich(khoBinh) * donGiaKg(vatTuBeMat) * soMatIn * soToLon` |
| 6 | **Khuôn** | `khuon==="Có" ? Gia_Khuon(400000) : 0` |
| 7 | **Bình bài + in** | xem 2.4 (theo `luotIn`, `soKemIn`, loại kẽm) |
| 8 | **Gia công bề mặt** | công đoạn `XLBM` (minCharge); nhân 2 nếu vật tư bề mặt là loại "2m" |
| 9 | **Bế** | `be==="Có"` → công đoạn `BE` (minCharge) |
| 10 | **Thành phẩm gấp** | TP thủ công→`TP_TC` (perUnit); TP máy→`TP_MAY` (perUnit, có min khi <MOQ trả 1 đơn giá) |
| 11 | **Cắt/xén** | `catXen==="Có"` → công đoạn `CATXEN` (perUnit) |
| 12 | **Đóng gói** | `dongGoi==="Có"` → công đoạn `DONGGOI` (minCharge) |
| 13 | Thiết kế | `thietKe - thietKe*VAT` |
| 14 | **Tổng chưa VAT** | tổng khoản 3→13 |
| 15 | Hao hụt | `tongChuaVAT * haoHut(soLuong)` |
| 16 | VAT | `tongChuaVAT * TyLe_VAT` |
| 17 | Tổng gồm VAT | `tongChuaVAT + haoHut + VAT` |
| 18 | Chiết khấu | `(SX + thiết kế) * TyLe_ChietKhau` — chỉ tính trên khoản 7→13, KHÔNG gồm giấy/kẽm |
| 19 | Khách trả | `tongGomVAT - chietKhau` |
| 20 | **Đơn giá 1 SP** | `khachTra / soLuong` |

> Chi tiết khoản 8 (gia công bề mặt): đơn giá XLBM nhân **×2** nếu vật tư bề mặt cán 2 mặt
> (tên chứa "2m"), ×1 nếu 1 mặt; rồi áp `minCharge` với `GiaMin_XLBM`.

---

## 4. Khác biệt giữa các loại sản phẩm

Tất cả dùng chung khung khoản 14→20 (tổng, hao hụt, VAT, chiết khấu, đơn giá). Khác nhau ở phần đầu:

**Bì thư + Folder** (khổ cố định, `fixed_sizes.biThuFolder`):
- Tra khổ theo `kichThuoc`; có thêm cột `soConKhoGiayLon` (L) dùng trực tiếp.
- Có công đoạn **dán** (`TP_TC`) thay cho "gấp"; folder có logic kẽm riêng.

**Túi giấy** (khổ tùy chỉnh — nhập cao/rộng/hông/mí):
- Tính **khổ trải** từ kích thước: `caoTrai = cao + mi + hong*0.85`, `rongTrai = rong*2 + hong*2 + 1.5`.
- Tự chọn khổ in tối ưu bằng cách thử xếp con lên các khổ giấy lớn (bảng phụ O13:R23 trong Excel — đây là phần **phải port thành hàm** "xếp con tối ưu", xem mục 5).
- Có thêm: **dây xách** (nhập SL+đơn giá), **thùng caton** (nhập SL+đơn giá), **thiết kế** mặc định `Gia_ThietKe` (500000).
- Công đoạn thành phẩm = `TP_TUI`.

**Hộp giấy** (khổ tùy chỉnh):
- Khổ trải theo loại hộp: Hộp đáy thường `dọc = cao + hông*2 + 3`; đáy gài/dán `dọc = cao + hông + 1.5 + hông*0.75`. `ngang = rộng*2 + hông*2 + 1.5`.
- Khuôn bế dùng `Gia_Khuon_Hop` (500000). Có **dán hộp** (`DANTD`, minCharge `GiaMin_DanHop`), **bồi 2 lớp**.

**SP khác** (khổ tùy chỉnh, nhập khổ in trực tiếp):
- Nhập `khoIn` (chọn từ `kho_in`), tra `soCon`, `khoGiayLon`, `soConKhoGiayLon` từ `kho_in.json`.
- Có ép kim (mục 2.5), thiết kế nhập tay.

---

## 5. Điểm cần xử lý kỹ khi port (đừng bê nguyên công thức Excel)

1. **Diện tích vật tư bề mặt (tờ rơi/bì thư) đang có thể = 0 trong Excel.** Công thức tra
   `VLOOKUP(khoBinh, DM_KhoIn,...)` nhưng `khoBinh` ở `fixed_sizes` viết dạng `"43 x 65cm"` còn
   `kho_in` viết `"43cm x 65cm"` → không khớp → trả 0. Khi port, **chuẩn hóa định dạng khổ** rồi tra
   `kho_in[khoBinh].dienTichM2` cho đúng. (Đây là lỗi tiềm ẩn của Excel, app nên sửa.)

2. **Hàm "xếp con tối ưu" cho túi/hộp (khổ tùy chỉnh).** Excel dùng bảng phụ với công thức
   `MAX(FLOOR(W/(w+0.3)) * FLOOR(H/(h+0.3)), ...)` (thử cả 2 chiều, khe hở `+0.3cm`). Cần viết thành hàm:
   ```ts
   function soConTrenKho(khoW, khoH, baiW, baiH, gap=0.3): number {
     const a = Math.floor(khoW/(baiW+gap)) * Math.floor(khoH/(baiH+gap));
     const b = Math.floor(khoW/(baiH+gap)) * Math.floor(khoH/(baiW+gap));
     return Math.max(a, b);
   }
   ```
   Chạy với từng khổ giấy lớn trong `kho_in`, chọn khổ cho số con/đơn vị diện tích tốt nhất.

3. **Đơn vị hỗn hợp** đã đánh dấu trong dữ liệu: `gia_cong[].billingMode` và mục 2.5 (ép kim).
   Tuyệt đối không nhân SL với các giá trị "trọn gói".

4. **Mã alias vật liệu**: dùng `materials_clean.json` (đã gộp). Khi import đơn cũ có mã "Duplex 250",
   map qua `aliases`.

5. **Chiết khấu chỉ áp lên chi phí sản xuất + thiết kế**, không áp lên giấy/kẽm/vật tư
   (xem khoản 18). Mỗi sheet có vùng cộng hơi khác — kiểm lại theo từng loại.

6. **Các mục "(dán nối)" trong túi giấy** không có trong `kho_in`; là khổ ghép thủ công — cần xử lý riêng.

---

## 6. Chữ ký hàm đề xuất (lib/pricing)

```ts
interface QuoteLine { label: string; qty?: number; unitPrice?: number; amount: number; }
interface QuoteResult {
  lines: QuoteLine[];
  tongChuaVAT: number; haoHut: number; vat: number; tongGomVAT: number;
  chietKhau: number; khachTra: number; donGia1SP: number;
}
function tinhToRoi(input: ToRoiInput, data: PricingData): QuoteResult;
function tinhBiThuFolder(input, data): QuoteResult;
function tinhTuiGiay(input, data): QuoteResult;
function tinhHopGiay(input, data): QuoteResult;
function tinhSpKhac(input, data): QuoteResult;
```

`PricingData` = nạp toàn bộ `/data/*.json` một lần (constants + lookups).

---

## 7. Cách kiểm thử (bắt buộc khi port)
Với mỗi loại, lấy đúng bộ input mặc định đang có trong sheet Excel tương ứng, chạy hàm TS và
**so khớp `donGia1SP` với Excel** (sai số ~1đ do làm tròn). Chỉ khi khớp mới chuyển loại tiếp theo.
Đề xuất thứ tự port: Tờ rơi → Bì thư → SP khác → Hộp → Túi (túi phức tạp nhất).
