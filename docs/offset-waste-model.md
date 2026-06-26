# Thiết kế nâng cấp: Mô hình Định mức & Bù hao theo Công đoạn cho Báo giá Offset

> Trạng thái: ĐỀ XUẤT (chờ duyệt) · Phạm vi: `backend/src/modules/pricing/offset-engine` + tầng cấu hình định mức + frontend Offset
> Mục tiêu: chuyển từ "máy tính báo giá theo Excel" sang "mô hình định mức sản xuất" — bù hao tính theo từng công đoạn, đúng dòng số lượng thực tế của xưởng.

---

## 1. Mục tiêu

Nâng cấp engine offset để phản ánh đúng cách xưởng in tính chi phí và bù hao:

1. **Bù hao theo công đoạn (stage-level waste).** Mỗi công đoạn có tỷ lệ hao riêng và đơn vị áp riêng:
   - Công đoạn *trước & trong in* (pha giấy, in, cán màng) → bù hao **theo tờ in**.
   - Công đoạn *sau in* (bế, dán, gấp, ép kim, đóng gói) → bù hao **theo số lượng thành phẩm** (số con).
2. **Dòng số lượng truyền qua công đoạn (quantity cascade).** Số lượng "tốt" cần ở cuối kéo ngược lên đầu: mỗi công đoạn phải sản xuất dư để bù hao của chính nó + đủ đầu vào cho công đoạn sau.
3. **Một nguồn định mức thống nhất, sửa được qua admin** — không hardcode, không lệch bảng đọc/ghi.
4. **Tách giá vốn → giá bán** rõ ràng, kiểm soát biên lợi nhuận.
5. **Giữ khả năng kiểm chứng**: golden test theo phiên bản; mô hình mới chạy song song để đối chiếu trước khi thay thế.

Tài liệu này mô tả mô hình đích, mô hình dữ liệu, thuật toán, ví dụ số, và kế hoạch triển khai theo giai đoạn.

---

## 2. Hiện trạng (tóm tắt chẩn đoán)

Tham chiếu mã: `offset-engine/products/*.ts`, `offset-engine/totals.ts`, `offset-engine/lookups.ts`, `offset-engine/config-store.service.ts`, `offset-engine/pricing-data.ts`.

| # | Vấn đề | Bằng chứng | Hệ quả |
|---|--------|-----------|--------|
| H1 | **Không có bù hao theo công đoạn.** Bế/dán/TP/đóng gói tính `đơn giá × sl` (số lượng đặt gốc, nguyên) | `to-roi.ts`/`sp-khac.ts`/`hop-giay.ts`: `chiPhiGiaCong('BE', sl, d)` | Công đoạn sau in không được bù hao đúng |
| H2 | **Hao hụt là một % phẳng cuối kỳ** áp lên toàn bộ subtotal | `totals.ts`: `haoHut = tongChuaVAT × tyLeHaoHut(sl)` | Không tách được hao in/cán vs hao thành phẩm |
| H3 | **Double-count hao tờ** trên 3/5 sản phẩm | `soToLon` đã gồm `soToHaoHut`, rồi totals lại cộng % phẳng lên cả tiền giấy | Báo giá phồng; không nhất quán giữa 5 loại |
| H4 | **Quy tắc chọn bậc hao ngược nhau** | inline: `find(h => sl <= h.mocSoLuong)`; totals: `if sl >= mocSoLuong` (lookups.haoHut) | Cùng "tỷ lệ hao" ra 2 giá trị |
| H5 | **Schema không có trường hao theo công đoạn** | interface `GiaCong` chỉ có `tiers/billingMode/moq/minCharge` | Không thể khai báo định mức công đoạn |
| H6 | **Số con/tờ của hộp giấy lấy từ bảng khổ cố định, không từ kích thước hộp** | `hop-giay.ts`: `void khoTraiHop(input); void soConTrenKho;` rồi dùng `kho.soConToLon` | Định mức giấy hộp sai theo kích thước |
| H7 | **Khổ in đọc/ghi lệch bảng** | đọc `paper_sizes WHERE scope_offset`; seed+CRUD ghi `offset_cfg_kho_in` | Sửa khổ qua admin không vào giá |
| H8 | **VAT giấy có thể tính 2 lần** | `giaGiay` trả `priceVAT`; `totals` cộng VAT lên cả giấy | Giá giấy lệch |
| H9 | **Định mức hardcode/JSON-only** | `TUI_NEST_OPTIONS` trong `tui-giay.ts`; `mocSoLuong` chỉ JSON | Không sửa được khi đổi máy/khổ |
| H10 | **Không có giá vốn → giá bán theo markup** cho offset | chỉ có chiết khấu ngược trong `totals` | Khó kiểm soát biên lợi nhuận |

Lưu ý: các **công thức số học từng sản phẩm** được port khá chắc và có golden test. Vấn đề nằm ở **mô hình hao hụt + tầng dữ liệu**, không phải lỗi số học từng dòng — nên golden vẫn xanh mà vận hành vẫn sai.

---

## 3. Nguyên lý mô hình "siêu cấp"

### 3.1 Hai trục của bù hao

Mỗi công đoạn được mô tả bởi **đơn vị áp** và **tham số hao**:

- **Đơn vị áp (`basis`)**:
  - `sheet` — tính trên *tờ in* (pha giấy, in, cán màng, tráng phủ).
  - `piece` — tính trên *số lượng thành phẩm/con* (bế, dán, gấp, ép kim, bắt số, đóng gói).
- **Tham số hao của công đoạn**:
  - `makeready` — số lượng hao cố định để canh máy/khuôn (vd 50 tờ canh kẽm, 100 con canh bế), theo đơn vị `basis`.
  - `wasteRate` — tỷ lệ hao chạy (%), theo đơn vị `basis`.
  - Cả hai có thể theo bậc số lượng (tier) nếu cần.

### 3.2 Dòng số lượng truyền ngược (quantity cascade)

Ta cần `Q` thành phẩm **tốt** ở cuối. Duyệt **ngược** từ công đoạn cuối lên đầu, mỗi công đoạn phải sản xuất dư để bù hao của nó và đủ nuôi công đoạn sau:

```
need_out(stage_cuối)      = Q                      (số con tốt cần giao)
need_in(stage)            = need_out(stage) / (1 − wasteRate_piece(stage)) + makeready_piece(stage)
need_out(stage_trước)     = need_in(stage)         (cùng đơn vị piece)
```

Khi tới ranh giới **in** (chuyển từ piece → sheet):

```
pieces_vào_in            = need_in(công_đoạn_piece_đầu_tiên)   // tổng số con phải in ra
sheets_in_cần (net)      = ceil( pieces_vào_in / soCon_trên_tờ )
sheets_in (gross)        = sheets_in_cần / (1 − wasteRate_sheet_in) + makeready_sheet_in
```

Sau đó các công đoạn `sheet` phía trước in (cán màng, pha giấy) dùng `sheets_in (gross)` (hoặc gross-up tiếp nếu cán có hao riêng).

Nguyên tắc cốt lõi: **đầu vào của công đoạn N = đầu ra tốt của công đoạn N + hao của công đoạn N**, và đầu ra tốt của N = đầu vào của N+1. Đây chính là "bù hao công đoạn" mà xưởng dùng.

### 3.3 Chi phí mỗi công đoạn

```
cost(stage) = rate(stage, qty_basis) × qty_in(stage)        // perUnit
            | max(minCharge, rate × qty_in(stage))           // minCharge khi qty < MOQ
            | fixed                                           // trọn gói
```

Trong đó `qty_in(stage)` là số lượng *thực sự đi qua* công đoạn theo `basis` (đã gồm hao của chính nó và hạ nguồn) — KHÁC với `sl` gốc.

### 3.4 Bỏ % hao phẳng cuối kỳ

`totals` **không** còn cộng `haoHut = subtotal × %`. Toàn bộ hao đã được phân bổ vào từng dòng qua `qty_in`. `tongChuaVAT = Σ cost(stage) + chi phí vật tư`. Dòng "Hao hụt" trên báo giá trở thành **thông tin tổng hợp** (tổng phần chênh do bù hao), không phải một phép nhân riêng → hết double-count (H2, H3, H4).

### 3.5 Giá vốn → giá bán

```
giá_vốn       = Σ chi phí công đoạn + vật tư
giá_bán_trước_CK = applyMarkup(giá_vốn, method, %, min_margin, rounding)   // dùng chung config với in nhanh
VAT           = giá_bán_trước_CK × vat_rate
chiết_khấu    = base_chiết_khấu × rate(≤ max)
khách_trả     = giá_bán_trước_CK + VAT − chiết_khấu
đơn_giá_1SP   = khách_trả / Q
```

VAT áp **một lần** trên giá bán; giá giấy lấy **chưa VAT** (`priceNoVAT`) để không double VAT (H8).

---

## 4. Mô hình dữ liệu mới

### 4.1 Khai báo công đoạn (`StageDef`) — thay/mở rộng `GiaCong`

```ts
type WasteBasis = 'sheet' | 'piece';

interface WasteSpec {
  makeready: number;        // hao cố định (theo basis), có thể 0
  wasteRate: number;        // 0..1, hao chạy theo basis
  tiers?: Array<{ from: number; makeready?: number; wasteRate?: number }>; // theo bậc SL (tùy chọn)
}

interface StageDef {
  code: string;             // 'IN', 'CAN_MANG', 'BE', 'DAN', 'GAP', 'EP_KIM', 'DONG_GOI', ...
  name: string;
  basis: WasteBasis;        // 'sheet' | 'piece'  → quyết định bù hao tính trên gì
  billingMode: 'perUnit' | 'minCharge' | 'fixed' | 'external';
  priceTiers: Array<{ from: number; to: number | null; price: number }>;
  minChargeParam?: string;
  moqParam?: string;
  waste: WasteSpec;         // ← MỚI: định mức hao của công đoạn
  appliesWhen?: string;     // điều kiện bật (vd chỉ khi có cán màng)
}
```

### 4.2 Quy trình sản phẩm (`RouteDef`) — thứ tự công đoạn

```ts
interface RouteStageRef {
  stageCode: string;
  optional?: boolean;       // người dùng bật/tắt khi báo giá
  default?: boolean;
}

interface RouteDef {
  productType: 'to_roi' | 'bi_thu_folder' | 'sp_khac' | 'hop_giay' | 'tui_giay';
  stages: RouteStageRef[];  // THỨ TỰ sản xuất, từ pha giấy → in → cán → bế → dán → đóng gói
}
```

`RouteDef` cho phép định nghĩa rõ chuỗi công đoạn và ranh giới sheet↔piece, thay cho việc mỗi product hardcode trình tự.

### 4.3 Định mức imposition (số con/tờ) — chuẩn hoá

- Số con/tờ cho **mọi** loại sản phẩm phải suy từ **kích thước trải thực** vs **khổ giấy lớn**, dùng chung hàm `soConTrenKho` (đã có trong `lookups.ts`).
- Sửa H6: hộp giấy phải dùng `khoTraiHop()` → `soConTrenKho(khoGiay, khoTrai)` thay vì `kho.soConToLon` cố định.
- Bảng "bài in" túi (`TUI_NEST_OPTIONS`) đưa vào DB (bảng `offset_cfg_nest` hoặc cấu hình khổ), bỏ hardcode (H9).

### 4.4 Hợp nhất nguồn định mức (sửa H7)

Chốt **một bảng nguồn cho mỗi khái niệm**, đọc và ghi cùng chỗ:

| Khái niệm | Bảng nguồn DUY NHẤT | Ghi chú |
|-----------|---------------------|---------|
| Giấy in offset | `materials` (scope_offset), giá ở `priceNoVAT`/cột chuẩn | Tách rõ cột giá offset vs in nhanh hoặc tài liệu hoá |
| Khổ in / số con | `paper_sizes` (scope_offset) | Gỡ `offset_cfg_kho_in` hoặc trỏ CRUD về `paper_sizes` |
| Công đoạn + hao | `offset_cfg_stage` (mới) + tiers | Thay diễn giải mơ hồ trên `processing_options` |
| Quy trình | `offset_cfg_route` (mới) | |
| Kẽm / vật tư bề mặt / ép kim | `offset_cfg_*` hiện có | Giữ |
| Mốc số lượng | `offset_cfg_moc_so_luong` (mới) | Bỏ JSON-only |
| Tham số (VAT, markup, MOQ) | `pricing_config` (`offset.*`) | Dùng chung markup config với in nhanh |

> Nguyên tắc: **đường đọc của engine và đường ghi của admin phải trỏ cùng một bảng.**

---

## 5. Thuật toán tính giá mới (pipeline công đoạn)

Pseudo-code engine `calculateOffsetV2(input, route, pricingData)`:

```
Q = input.soLuong                       // số con tốt cần giao
khoTrai = tinhKhoTrai(productType, input)        // kích thước trải thực (cm)
soCon = soConTrenKho(khoGiayLon, khoTrai)        // số con/tờ THỰC (không dùng bảng cố định)

// 1) CASCADE NGƯỢC qua các công đoạn 'piece' (từ cuối → ranh giới in)
qtyPiece = Q
for stage in reverse(stages where basis == 'piece' and enabled):
    qtyOut = qtyPiece
    qtyIn  = qtyOut / (1 - stage.wasteRate) + stage.makeready
    cost[stage] = price(stage, qtyIn) theo billingMode
    qtyPiece = qtyIn                    // đầu vào của stage này = đầu ra của stage trước

piecesVaoIn = qtyPiece                  // tổng số con phải in ra

// 2) RANH GIỚI piece → sheet
sheetsNet = ceil(piecesVaoIn / soCon)

// 3) CASCADE NGƯỢC qua các công đoạn 'sheet' (in, cán, pha giấy)
qtySheet = sheetsNet
for stage in reverse(stages where basis == 'sheet' and enabled):
    qtyOut = qtySheet
    qtyIn  = qtyOut / (1 - stage.wasteRate) + stage.makeready
    cost[stage] = price(stage, qtyIn)
    qtySheet = qtyIn

sheetsGross = qtySheet                  // tổng tờ giấy phải xuất kho

// 4) VẬT TƯ
cost.giay     = giaGiayChuaVAT(materialCode) * sheetsGross
cost.canMang  = (nếu có) dienTich(khoGiay) * donGiaKg * soMat * sheetsIn   // dùng số tờ tại công đoạn cán
cost.kem      = donGia1Kem(loaiKem) * soKem
cost.binhBai  = binhBai(loaiKem, soKem, luotIn)
cost.epKim    = epKim(viTri, Q)         // theo số thành phẩm

// 5) TỔNG → GIÁ BÁN
giaVon   = Σ cost
giaBan   = applyMarkup(giaVon, config)
vat      = giaBan * vatRate
ck       = baseCK(giaBan) * min(rate, maxRate)
khachTra = giaBan + vat - ck
donGia1SP = khachTra / Q
```

Điểm khác cốt lõi so với hiện tại:
- `soCon` luôn từ kích thước trải thực (sửa H6).
- Mỗi `cost[stage]` dùng `qtyIn` riêng (bù hao công đoạn — H1).
- `totals` không còn % hao phẳng (sửa H2, H3, H4).
- `giaVon → giaBan` qua markup dùng chung config (H10); giấy chưa VAT (H8).

---

## 6. Ví dụ minh hoạ số

**Đơn:** 1.000 hộp giấy, in 4 màu 1 mặt, có cán màng, bế, dán máy, đóng gói.
**Định mức (giả định):**
- Số con/tờ thực (từ khổ trải) = 4.
- In (sheet): makeready 200 tờ, wasteRate 3%.
- Cán màng (sheet): wasteRate 2% (trên số tờ vào cán).
- Bế (piece): makeready 100 con, wasteRate 2%.
- Dán máy (piece): wasteRate 3%.
- Đóng gói (piece): wasteRate 0%.

**Cascade ngược (piece):**
```
need_out(đóng_gói) = 1000
need_in(đóng_gói)  = 1000 / (1-0)    + 0   = 1000
need_in(dán)       = 1000 / (1-0.03) + 0   ≈ 1031
need_in(bế)        = 1031 / (1-0.02) + 100 ≈ 1152   ← số con phải in
```
**Ranh giới:** `sheetsNet = ceil(1152 / 4) = 288 tờ`
**Cascade ngược (sheet):**
```
need_in(cán) = 288 / (1-0.02)        ≈ 294
need_in(in)  = 294 / (1-0.03) + 200  ≈ 503  ← số tờ giấy xuất kho (gross)
```
- Tiền giấy = 503 × đơn giá tờ (chưa VAT).
- Tiền bế = đơn giá bế × **1152** (không phải × 1000).
- Tiền dán = đơn giá dán × **1031**.
- Tiền cán = diện tích × kg × 1 mặt × **294**.

So với hiện tại (bế/dán đều × 1000 rồi cộng % phẳng cuối kỳ), mô hình mới phản ánh đúng số lượng thực qua từng công đoạn và bỏ double-count.

---

## 7. Tương thích & kiểm chứng

1. **Chạy song song (shadow).** Giữ engine cũ (`calculate`), thêm `calculateV2`. Endpoint trả cả hai (hoặc cờ `?engine=v2`) để đối chiếu trên dữ liệu thật trước khi chuyển.
2. **Golden test phiên bản hoá.** Golden hiện tại khoá hành vi cũ; thêm bộ golden V2 từ các phiếu báo giá xưởng thật (đối chiếu với giá xưởng đang chốt tay), KHÔNG sửa golden cũ.
3. **Property tests** cho cascade:
   - Đơn điệu: tăng `wasteRate` của một công đoạn ⇒ `qtyIn` và giá không giảm.
   - Bảo toàn ranh giới: `pieces_vào_in ≥ Q`; `sheetsGross ≥ sheetsNet ≥ ceil(Q/soCon)`.
   - `wasteRate = 0, makeready = 0` ⇒ cascade thoái biến về `qtyIn = Q` (khớp mô hình "không hao").
4. **Đối chiếu nghiệp vụ.** Lấy 5–10 đơn đã sản xuất thật, so giá V2 với giá xưởng tính tay; sai số mục tiêu ±2%.

---

## 8. Kế hoạch triển khai theo giai đoạn

| GĐ | Nội dung | Đụng công thức? | Rủi ro |
|----|----------|-----------------|--------|
| 0 | **Sửa lỗi tầng dữ liệu không đụng công thức**: khổ in split-brain (H7), lưu offset về `/erp/orders`, VAT giấy chưa-VAT (H8) | Thấp | Thấp |
| 1 | **Mô hình dữ liệu mới**: `StageDef`/`RouteDef`/bảng `offset_cfg_stage|route|moc_so_luong`; migration + seed từ định mức Excel hiện tại | Không | TB |
| 2 | **Engine V2 (shadow)**: cascade công đoạn, `soCon` từ kích thước trải thực (sửa H6), bỏ % hao phẳng | Cao | Cao |
| 3 | **Golden V2 + property tests + đối chiếu đơn thật** | — | TB |
| 4 | **Giá vốn → giá bán markup** dùng chung config (H10) | TB | TB |
| 5 | **Admin "Định mức Offset" hợp nhất** (công đoạn, hao, quy trình, mốc SL, bài in túi) — bỏ hardcode (H9) | Không | TB |
| 6 | **Chuyển đổi**: bật V2 mặc định sau khi đối chiếu đạt; giữ V1 sau cờ tắt một thời gian | — | TB |

Khuyến nghị bắt đầu **GĐ0** (lỗi rõ ràng, không đụng số) song song với việc chốt **mô hình dữ liệu GĐ1** trên giấy.

---

## 9. Câu hỏi cần chốt với nghiệp vụ (trước GĐ1)

1. Danh sách công đoạn chuẩn và **đơn vị áp** của từng công đoạn (sheet/piece) cho từng loại sản phẩm.
2. **Định mức hao** thực tế của từng công đoạn: makeready (cố định) + tỷ lệ chạy, có theo bậc số lượng không?
3. Makeready in: cố định hay theo **số màu/số kẽm/số lượt** (hiện hardcode 50 tờ)?
4. Bù hao có **cộng dồn** qua công đoạn (cascade) hay xưởng chốt một tỷ lệ tổng? (Tài liệu này giả định cascade.)
5. Giá giấy nhập theo **tờ / ream / kg**? Có cần mô hình pha cắt từ khổ giấy nguyên không?
6. Offset dùng **markup biên lợi nhuận** hay giữ mô hình **chiết khấu ngược** hiện tại?
7. Khổ in: chốt nguồn `paper_sizes` (gỡ `offset_cfg_kho_in`) — đồng ý không?

---

## 10. Phụ lục — Bản đồ thay đổi mã (dự kiến)

- `pricing-data.ts`: thêm `StageDef`, `RouteDef`, `WasteSpec`; `OffsetMaterial.priceNoVAT` thành nguồn giá chuẩn.
- `lookups.ts`: thêm `quantityCascade()`, `stageCost()`; tái dùng `soConTrenKho` cho mọi sản phẩm.
- `totals.ts`: bỏ `haoHut` phẳng; thêm `applyMarkup` + tổng hợp giá bán.
- `products/*.ts`: chuyển từ công thức cứng sang khai báo `RouteDef` + gọi engine cascade chung. Giữ hàm cũ sau cờ `engine=v1` để shadow.
- `config-store.service.ts`: đọc/ghi `offset_cfg_stage|route|moc_so_luong`; gỡ split-brain khổ in.
- `controllers/offset.controller.ts`: thêm cờ `engine`, CRUD định mức công đoạn/quy trình.
- Frontend: màn "Định mức Offset" hợp nhất; configurator hiển thị bù hao theo công đoạn trong breakdown.

---

## 11. Tiến độ thực hiện (cập nhật)

### Đã làm
- **Lõi cascade** `offset-engine/waste-cascade.ts`: `cascade()`, `cascadeProduct()`, `qtyOf()` — thuần, có `__tests__/waste-cascade.property.spec.ts` (6 test: bất biến qtyIn≥qtyOut, thoái biến không hao, đơn điệu, ranh giới piece→sheet, chống chia 0, ví dụ tài liệu). ✅ xanh.
- **Tổng V2** `totals.ts → tongHopKetQuaV2()`: bỏ % hao phẳng (hết double-count), VAT một lần; `haoHut` chỉ là thông tin.
- **Hộp giấy V2 (shadow)** `products/hop-giay-v2.ts → tinhHopGiayV2()`:
  - Sửa **A8/H6**: số con/tờ suy từ kích thước trải thực (`khoTraiHop` + `soConTrenKho`) — ví dụ 15 con/tờ thay vì 12 cố định của V1.
  - Bù hao theo công đoạn: in/cán theo tờ (cascade), bế/dán/đóng gói theo số con; rate cấu hình qua `params.Hao_*` (mặc định an toàn, không tự bịa hao thành phẩm).
  - `__tests__/hop-giay-v2.spec.ts` (5 test) ✅ xanh, gồm khẳng định **không double-count** (`tongGomVAT = tongChuaVAT × 1.08`).
  - Nối engine qua cờ `engine='v2'` (mặc định vẫn V1 — **không đổi hành vi live**).

### Định mức hao cần nghiệp vụ cung cấp (đang dùng mặc định)
- `Hao_In_Makeready` (tờ canh in, mặc định 100), `Hao_In_Rate` (mặc định = đường cong `haoHut(sl)`), `Hao_Can_Rate` (0), `Hao_Be_Makeready`/`Hao_Be_Rate`/`Hao_Dan_Rate`/`Hao_DongGoi_Rate` (0). Lưu `pricing_config` key `offset.<Hao_*>` để override.

### Còn lại
- Bật `engine='v2'` mặc định sau khi nghiệp vụ chốt rate + đối chiếu đơn thật (hiện đã chạy thử được qua toggle + cấu hình được qua admin).

### Cập nhật: Admin định mức + toggle V2 (đã làm)
- **Backend**: `ConfigStore.upsertParam/deleteParam` (lưu `pricing_config` key `offset.*`); endpoint `GET/POST /pricing/offset/cfg/waste-stages` (đọc/ghi định mức hao công đoạn, có mặc định), `POST/DELETE /pricing/offset/cfg/param`. Engine V2 đọc các param `Hao_*` này (hao chạy IN vẫn theo đường cong sản lượng).
- **Frontend báo giá**: toggle “⚙️ Bù hao công đoạn (V2)” trên `OffsetQuoteConfigurator` → gửi `engine:'v2'` sang `/pricing/offset/calculate` để chạy thử song song V1.
- **Frontend admin**: trang `settings/waste-stages` chỉnh định mức hao từng công đoạn (rate %/makeready), link từ `settings/waste-config`.
- Toàn module pricing: 159 pass, 0 fail, 3 golden Excel skip (tham khảo).

### Cập nhật: ĐÃ rollout cascade cho CẢ 5 sản phẩm offset (shadow)
- `tinhToRoiV2`, `tinhBiThuFolderV2`, `tinhSpKhacV2`, `tinhHopGiayV2`, `tinhTuiGiayV2` — đều dùng lõi cascade + `tongHopKetQuaV2` (bỏ % hao phẳng) + helper chung `products/_v2-common.ts`.
- Nối engine qua cờ `engine='v2'` cho cả 5 type (mặc định vẫn V1 — không đổi hành vi live).
- Tests: `waste-cascade.property` (6), `hop-giay-v2` (5), `v2-products` (5) — tất cả ✅. Toàn module pricing: 159 pass, 0 fail.
- Golden Excel (`golden-hop/to-roi/sp-khac`, số Excel trong `engine-offset.service`) đã chuyển sang **THAM KHẢO** (`describe.skip` + chú thích) vì Excel chỉ là tham khảo, không phải đích.

### Định mức hao — MỖI CÔNG ĐOẠN MỘT BẢNG MỐC RIÊNG (đã sửa đúng)
Bỏ mô hình "đường cong chung × hệ số". Nay **mỗi công đoạn có bảng mốc số lượng RIÊNG**: `tiers: [{from, rate}]` (bế có mốc riêng, dán có mốc riêng, in riêng...). Tra theo mốc lớn nhất ≤ số lượng đơn. Makeready (canh máy/khuôn) cố định riêng cho IN/BE.
- Lưu JSON `pricing_config` key `offset.WasteStages` = `Record<code, {makeready, tiers:[{from,rate}]}>`.
- `PricingData.wasteStages`; `_v2-common.wasteRate(d, code, sl)` tra bảng riêng; mặc định IN theo `tyLe.haoHut`, còn lại 0 khi chưa cấu hình.
- Backend: `ConfigStore.saveWasteStages`, endpoint `GET/POST /pricing/offset/cfg/waste-stages` (trao đổi %; codes IN/CAN/XLBM/BE/DAN/TP/CATXEN/DONGGOI, kèm basis + makeready).
- Frontend `settings/waste-stages`: mỗi công đoạn 1 thẻ riêng — badge "theo tờ/theo con", makeready (IN/BE), **bảng mốc riêng** (thêm/xoá/sửa dòng `từ số lượng → %`).
- Test: `v2-products` chứng minh mỗi công đoạn tra mốc riêng (bế ≠ dán), công đoạn chưa cấu hình = 0.

### Basis (theo tờ / theo con) CHỌN ĐƯỢC mỗi công đoạn — đã làm
- `WasteStageConfig.basis?: 'sheet'|'piece'` (thiếu → mặc định theo công đoạn). `effectiveBasis()` + `buildWaste()` định tuyến ĐỘNG: công đoạn vào chuỗi tờ hay con theo lựa chọn; chi phí dòng dùng số lượng ở đúng basis đã chọn.
- 5 product dùng chung `buildWaste(d, sl, soCon, defs)` (defs = công đoạn + basis mặc định) — bỏ split cứng.
- UI `settings/waste-stages`: mỗi thẻ công đoạn có **2 nút THEO TỜ / THEO CON** đổi qua lại; lưu kèm basis.
- Backend GET/POST `cfg/waste-stages` trả & nhận `basis` (chỉ lưu khi khác mặc định). Test `v2-products` chứng minh đổi BE sang theo tờ → tính ở thang số tờ.

---

## 12. Hợp nhất: bù hao theo công đoạn là ENGINE CHÍNH (đã xoá engine cũ)

- Engine cũ (một % hao phẳng) **đã xoá hoàn toàn**. Logic bù hao theo công đoạn được gộp vào file sản phẩm chính (`products/{to-roi,bi-thu-folder,sp-khac,hop-giay,tui-giay}.ts`) dưới tên hàm gốc `tinh*` — **không còn hậu tố/“V2”** ở code, file hay UI.
- `totals.ts`: chỉ còn `tongHopKetQua` (không cộng % hao phẳng; nhận `wasteInfo` để hiển thị).
- Helper `_v2-common.ts` → đổi tên `_waste-stages.ts`.
- `EngineOffsetService.calculate` gọi thẳng `tinh*` (bỏ cờ `engine`/shadow).
- Frontend: **gỡ toggle “Bù hao công đoạn (V2)”** trên `OffsetQuoteConfigurator` (engine chính luôn dùng), gỡ payload `engine`.
- Tests: xoá golden Excel (tham khảo, hành vi engine cũ); còn `hop-giay.spec`, `offset-waste.spec`, `waste-cascade.property`, `totals.property`, `engine-offset.service.spec` (bất biến). Toàn module pricing: **154 pass, 0 fail, 0 skip**.

---

## 13. Tối ưu form báo giá: suy định mức thay vì bắt nhập (đã làm)

Bỏ các trường kỹ thuật khỏi form, để engine tự suy:

- **Loại kẽm (nhỏ/lớn)**: SUY từ khổ in (`timKhoIn(fs.khoIn).loaiKem`) cho tờ rơi & bì thư/folder — bỏ dropdown "Loại kẽm". (sp_khác/hộp/túi vốn đã tự suy.) `kemType` thành optional, derive-first.
- **Số kẽm**: thay ô nhập số thô bằng dropdown **"Kiểu in (số màu)"** (1 / 2 / 4 màu (CMYK) / 5 / 6) — lấy từ `pricebook.soMauOptions` (backend). Bỏ "Số bộ kẽm" (mặc định 1), bỏ "Số màu"/"Số kẽm in" thủ công ở cả 5 form.
- **Bài in túi**: TỰ chọn bài cho số con/tờ lớn nhất khi không truyền `baiIn` — bỏ dropdown "Bài in". `baiIn` thành optional.

Engine không đổi công thức — chỉ đổi *nguồn input* (suy thay vì nhập); cùng dữ liệu cho cùng kết quả. Test: `offset-waste.spec` thêm ca "suy loại kẽm từ khổ" + "tự chọn bài in túi". Backend 43 pass; frontend configurator spec 3 pass.

## 14. Phí cố định + chiết khấu CẤU HÌNH ĐƯỢC (Đợt 4 — đã làm)

Mục tiêu: mọi thiết lập đều custom được từ Settings, KHÔNG gán cứng.

**Backend**
- `ConfigStore.upsertPhiCoDinh(code, ten, giaTri)` → ghi `setup_fees` (category='offset').
- `OffsetController`:
  - `GET /pricing/offset/cfg/fees` → trả `{ fees:[Gia_Khuon, Gia_Khuon_Hop, Gia_ThietKe], chietKhauDefault, chietKhauMax }` (chiết khấu đổi sang **%** cho UI).
  - `POST /pricing/offset/cfg/fees` → lưu phí (round VND) + chiết khấu (% → phân số) vào `setup_fees` + `pricing_config` (`offset.TyLe_ChietKhau`, `offset.TyLe_ChietKhau_Max`).

**Engine**
- `sp_khac.khuon?: number|boolean` — `true` → `phi('Gia_Khuon')`; tất cả 4 sản phẩm có khuôn dùng `phi(...)` thay số cứng.
- 4 sản phẩm: `thietKe?` optional, fallback `?? phi('Gia_ThietKe')`.
- `totals.tongHopKetQua`: khi form KHÔNG gửi `chietKhauRate` → dùng `TyLe_ChietKhau` cấu hình, **cap** ở `TyLe_ChietKhau_Max`.

**Frontend**
- Trang mới `settings/offset-fees/page.tsx` — chỉnh phí khuôn (thường/hộp) + phí thiết kế mặc định + chiết khấu mặc định/trần (%).
- Form báo giá: bỏ ô "Chiết khấu (0–1)" ở cả 5 form; sp_khác khuôn Num→Checkbox; seed `thietKe` từ pricebook khi load; bỏ `chietKhauRate` khỏi payload (engine tự áp mức cấu hình).
- Nav: thêm "Bù Hao Offset (Công Đoạn)" + "Phí & Chiết Khấu Offset" vào `PricingSidebar`; link đối xứng giữa `waste-stages` ↔ `offset-fees`.

Kiểm chứng: backend 43 pass; frontend configurator spec 3 pass; diagnostics sạch trên các file đã sửa.

### Còn lại (đề xuất tiếp — Đợt 5)
- Product config offset (whitelist vật tư/gia công + default + khoá field) để form về tối giản. Là tính năng lớn → nên tách spec riêng.

## 15. Cấu hình form THEO LOẠI SẢN PHẨM (Đợt 5 — đã làm)

Mục tiêu: admin tự whitelist tài nguyên + đặt mặc định + ẩn/khoá field cho từng loại; form báo giá tự tối giản. KHÔNG gán cứng, KHÔNG đổi công thức engine.

**Mô hình dữ liệu** (`OffsetProductConfig`, khóa theo loại `to_roi|bi_thu_folder|sp_khac|hop_giay|tui_giay`):
- `allowedMaterials / allowedVatTuBeMat / allowedEpKim / allowedKhoIn / allowedKichThuoc` — mảng rỗng/thiếu = cho phép TẤT CẢ.
- `defaults` — giá trị điền sẵn theo field.
- `hidden` — ẩn field; `locked` — hiện nhưng read-only.
- Lưu JSON `pricing_config` key `offset.ProductConfig` (đúng pattern `WasteStages`). Engine BỎ QUA — chỉ frontend dùng.

**Backend**
- `pricing-data.ts`: thêm interface `OffsetProductConfig` + `PricingData.productConfig?`.
- `ConfigStore`: `loadPricingData` parse key `ProductConfig` (tách khỏi params); `saveProductConfig(config)`.
- `OffsetController`: pricebook trả thêm `productConfig`; `GET/POST /pricing/offset/cfg/product-config` (POST sanitize: lọc loại hợp lệ, dedupe mảng allowed, chỉ giữ default kiểu nguyên thủy, bỏ loại rỗng).

**Frontend**
- `useOffsetPricebook`: thêm `OffsetProductConfig` + `Pricebook.productConfig`.
- `OffsetQuoteConfigurator`: helper `makeUI(pb, cfg)` lọc danh sách (materials/khoIn/kichThuoc/vatTuBeMat/epKim) theo allowed + `show/lock` field; `Num/Sel/Chk` nhận `disabled`; 5 form bọc `ui.show()/ui.lock()`; seed `defaults` theo loại 1 lần khi nạp pricebook (gộp với seed Gia_ThietKe).
- Trang mới `settings/offset-products/page.tsx`: tabs 5 loại; whitelist checkbox (chọn tất cả / bỏ tick), bảng field (Mặc định / Ẩn / Khoá) data-driven từ `FIELDS` catalog.
- Nav: thêm "Cấu Hình Sản Phẩm Offset" vào `PricingSidebar`; link đối xứng từ `offset-fees`.

Kiểm chứng: backend offset-engine 43 pass + config-store 6 pass (thêm ca parse productConfig); frontend configurator 4 pass (thêm ca ẩn field theo `productConfig.hidden`); diagnostics sạch toàn bộ file đã sửa/ tạo.


## 16. Dàn khuôn ĐỘNG theo hình học — bỏ tàn dư Excel 1 nhà in (phương án B — đã làm)

Vấn đề: số con/tờ của tờ rơi / bì thư / SP khác lấy từ cột tĩnh `so_con_to_lon` / `so_con_bai_in` chép từ Excel của MỘT nhà in. Sản phẩm phục vụ NHIỀU nhà in → cần suy động: kích thước thành phẩm → khổ trải → lọt khổ giấy cho phép → số con/tờ.

**Quyết định nghiệp vụ (user):** tờ rơi/bì thư giữ **2 chế độ song song** — chọn khổ TĨNH có sẵn HOẶC nhập kích thước (động). SP khác: nhập kích thước thì tính động, không thì giữ số tĩnh.

**Engine (backend)**
- `lookups.ts`: thêm `imposeFromKhoIn(kho, baiW, baiH, gap=0.3)` → `{ soConBaiIn, soConToLon }` tính từ khổ in & khổ giấy lớn của bản ghi `KhoIn` vs kích thước phẳng sản phẩm (dùng `soConTrenKho`, thử 2 chiều).
- `to-roi.ts` / `bi-thu-folder.ts`: input thêm `khoIn? rong? cao?` (bì thư thêm `loai?`), `kichThuoc` thành optional.
  - Có `kichThuoc` → nhánh TĨNH (tra bảng, **giữ nguyên 100%** → test cũ xanh).
  - Không `kichThuoc` → nhánh ĐỘNG: bắt buộc `khoIn + rong + cao`; `imposeFromKhoIn` ra số con; lỗi nếu sản phẩm quá lớn.
- `sp-khac.ts`: input thêm `rong? cao?`. Có kích thước hợp lệ → ghi đè `soCon/soConBaiIn` bằng số tính động; không thì giữ `kho.soConToLon` tĩnh.
- meta trả thêm `itemW/itemH` để preview vẽ đúng con thật.

**Frontend**
- Tờ rơi/Bì thư: nút **"Khổ có sẵn" / "Nhập kích thước"** (`SizeModeToggle`); chế độ nhập hiện Khổ in + Rộng + Cao (+ Loại cho bì thư). `buildPayload` bỏ `kichThuoc` khi chế độ nhập để engine đi nhánh động; validation theo chế độ.
- SP khác: thêm ô **Rộng/Cao (0 = tự động)**.
- Panel "Gợi ý khổ giấy": SP khác có kích thước → tính **số con/tờ thật** theo hình học (thay "0 con/tờ"), 🏆 phản ánh khổ tối ưu thật.

Kiểm chứng: backend offset-engine **54 pass** (thêm suite `imposition-dynamic` 10 ca: hình học, 2 chế độ tờ rơi, bì thư động, sp_khác ghi đè); frontend configurator **5 pass** (thêm ca toggle chế độ nhập). Diagnostics sạch.

**Còn lại (chưa làm trong đợt này):**
- Túi giấy vẫn dùng bảng `TUI_NEST_OPTIONS` chép từ Excel (khổ ứng viên chưa cấu hình được) — đã động phần nesting nhưng danh sách khổ còn cứng.
- Engine chưa tôn trọng `OffsetProductConfig.allowedKhoIn/allowedMaterials` khi tính (mới chỉ lọc UI). Bước hợp nhất sâu hơn: cho engine duyệt khổ giấy nhà in cấu hình + áp lề/gripper (cột margin đã có trong DB nhưng `KhoIn` đang bỏ, dùng khe hở phẳng 0.3cm).


## 17. Túi giấy động hóa + lề/gripper + gap cấu hình (đã làm — nốt phần còn lại của phương án B)

**Lề/gripper vào dàn khuôn động**
- `KhoIn` thêm `marginLeft/Right/Top/Bottom?` (cm). `ConfigStore` map từ `paper_sizes.margin_*` (mm → cm ÷10). Admin chỉnh ngay ở màn **Khổ Giấy** hiện có (không cần UI mới).
- `imposeFromKhoIn` trừ lề khỏi vùng in trước khi tiling (thiếu lề = 0 → giữ nguyên hành vi cũ).
- Khe hở giữa con CẤU HÌNH ĐƯỢC qua param `Gap_Cm` (mặc định 0.3) — áp ở to_roi/bi_thu/sp_khac (chế độ động) và túi.

**Túi giấy: bỏ phụ thuộc bảng Excel cứng**
- Thêm `buildTuiOptions(d, gripperCm=1)`: sinh danh sách "bài in" ĐỘNG từ khổ giấy nhà in cấu hình (`d.khoIn`). Mỗi khổ → 2 phương án (thường + dán nối), với:
  - `numW/numH` = khổ in − gripper (lề khổ nếu có, không thì 1cm/trục).
  - `heSo` (số bài in/tờ lớn) = `soConTrenKho(khổ giấy lớn, khổ in, gap=0)` — hình học, cắt sát. (Đã verify khớp đúng heSo Excel cho các khổ trùng: 43×65→2, 39.5×54→4, 28×60→6.)
  - `kemLon` suy từ `loaiKem`; `khoArea` = khổ in (để tra diện tích/giá).
- `tinhTuiGiay` dùng `buildTuiOptions(d)` (fallback `TUI_NEST_OPTIONS` chỉ khi nhà in chưa cấu hình khổ nào). Khớp `baiIn` linh hoạt (exact → chuẩn hóa). `TUI_NEST_OPTIONS` giữ lại làm fallback/back-compat.
- Controller `pricebook.tuiBaiIn` lấy từ danh sách động.

**Kiểm chứng:** offset-engine **58 pass** (imposition-dynamic +4: lề giảm số con, buildTuiOptions 2 phương án/khổ + heSo hình học + numW/numH/kemLon); cả module pricing **171 pass**; diagnostics sạch.

**Trạng thái đồng bộ imposition offset = HOÀN TẤT theo phương án B:**
- Cả 5 loại đều có đường tính số con/tờ theo HÌNH HỌC từ khổ giấy nhà in cấu hình (tờ rơi/bì thư: chế độ nhập; SP khác: khi có kích thước; hộp/túi: luôn động).
- Lề/gripper + khe hở đều cấu hình được. Excel chỉ còn là fallback khi DB trống.
- Lưu ý: số tiền báo giá offset CÓ THỂ KHÁC bản Excel cũ (đúng chủ trương "Excel chỉ tham khảo"). Chế độ "khổ tĩnh" của tờ rơi/bì thư vẫn giữ nguyên số cũ cho ai cần.


## 18. Engine tôn trọng whitelist khổ in khi tự chọn (đã làm)

`tinhTuiGiay` (loại duy nhất engine TỰ chọn khổ tối ưu) giờ lọc ứng viên theo `d.productConfig['tui_giay'].allowedKhoIn` trước khi chọn — nếu nhà in giới hạn khổ cho túi thì engine chỉ duyệt trong các khổ đó (khớp chuẩn hóa, tránh lọc đến rỗng → fallback toàn bộ). `OffsetProductConfig` từ chỗ "chỉ ảnh hưởng UI" nay đã ảnh hưởng cả engine ở nhánh auto-chọn.

Các loại còn lại (SP khác/hộp) người dùng tự chọn khổ từ dropdown đã whitelist ở UI → engine nhận khổ hợp lệ sẵn, không auto-chọn nên không cần lọc.

Kiểm chứng: offset-engine **60 pass** (thêm 2 ca whitelist khổ túi); module pricing **173 pass**.


## 19. Engine VALIDATE input theo whitelist (hardening — đã làm)

`EngineOffsetService.calculate()` gọi `validateAgainstConfig(input, d)` trước khi định tuyến: nếu loại sản phẩm có whitelist, các giá trị gửi lên phải nằm trong danh sách cho phép, nếu không → `success=false` kèm thông báo. Nhờ vậy cấu hình nhà in là NGUỒN QUYỀN LỰC kể cả khi gọi `/pricing/offset/calculate` trực tiếp (bỏ qua UI đã lọc).

- Kiểm: `materialCode`↔`allowedMaterials`, `khoIn`↔`allowedKhoIn` (khớp chuẩn hóa), `kichThuoc`↔`allowedKichThuoc`, `epKimViTri`↔`allowedEpKim`, `vatTuBeMat`↔`allowedVatTuBeMat`.
- Mảng allowed* rỗng/thiếu = cho phép tất cả; giá trị rỗng / `'Không'` luôn hợp lệ (không ép buộc field tuỳ chọn).
- Tập trung ở engine service — các hàm sản phẩm thuần không đổi (golden/property test giữ nguyên).

Kiểm chứng: offset-engine **61 pass** (thêm ca giấy ngoài whitelist → lỗi); module pricing **174 pass**.

`OffsetProductConfig` giờ tác động ĐỦ 3 tầng: UI (lọc/ẩn/khoá/mặc định) → engine auto-chọn (túi) → engine validate (mọi loại).


## 20. Rà luồng LƯU báo giá offset + 3 fix (đã làm)

Rà luồng `offset/page.tsx → POST /erp/orders → OrdersService.createQuote → quote_items`. Phát hiện & xử lý:

**Fix 1 — Lưu offset luôn HTTP 400 (NGHIÊM TRỌNG).** `mapItem` spread `...configParams` (camelCase) vướng `forbidNonWhitelisted` của `QuoteItemDto` (snake_case). → `mapItem` chỉ gửi field whitelisted + gói `{offset, config, result, unitPrice}` vào `printing_detail` (JSON tự do, được lưu). Đồng thời sửa nguồn: cart lưu `configParams = buildPayload(type, st)` (đúng input engine, đặc biệt túi cần nest `dayXach/thungCaton`) — trước đây lưu state thô không tái tính được.

**Fix 2 — Server TÍNH LẠI giá offset khi lưu (chống sửa giá).** `OrdersService` inject `EngineOffsetService`; `recomputeOffsetItems()` tính lại từng item từ `printing_detail.config`, ghi đè `item_total` + `result/unitPrice`, KHÔNG tin số client. `createQuote`/`updateQuote` dựng `total/vat/grand` từ tổng tính lại. Offset: `total` = Σ khachTra (đã gồm VAT), `grand = total − chiết khấu đơn + ship` (KHÔNG cộng VAT lần nữa). Cấu hình lỗi → ném lỗi (không âm thầm tin client).

**Fix 3 — Hiển thị offset (detail UI + PDF).**
- `fetchDetail` (QuoteOrderListView) trước bỏ rơi `vat_rate/vat_amount/shipping_fee/grand_total` → TỔNG CỘNG thiếu ship + ẩn dòng VAT/ship. Nay map đủ; mỗi item thêm `offsetSpec` (dựng từ `printing_detail`).
- Item offset render chuỗi quy cách (KT/khổ/giấy/số màu/loại kẽm/số con·tờ) ở cả tab khách & nội bộ thay vì "Khổ in: x mm" rỗng.
- Tổng kết offset: nhãn "Thành tiền (đã gồm VAT)", VAT là dòng "Trong đó thuế GTGT" (không cộng thêm) → tạm tính + ship = tổng cộng khớp. Áp cho cả detail UI và PDF server (`quote-pdf.service`).

Kiểm chứng: module pricing **177 pass** (thêm `orders-offset-recompute` 3 ca + sửa `create-order.dto.spec` cho constructor 4 đối số); frontend configurator **5 pass**; diagnostics sạch.

**Còn lại (chưa làm — không nằm trong phạm vi lưu):**
- Validate server cứng hơn (bắt buộc khách/SL > 0) — hiện chỉ FE + recompute.
- Round-trip SỬA báo giá offset: trang in-nhanh `new/page.tsx` hydrate đọc `config_params`/`calculation_details` (không khớp `printing_detail`) → offset chưa mở lại để sửa được. Cần trang sửa offset riêng hoặc map `printing_detail` khi hydrate.


## 21. Audit toàn diện offset + xử cụm dữ liệu (đã làm — xem offset-audit-2026-06.md)

Đã audit đầu-cuối và xử **cụm gốc rễ** (data/engine):

- **A1+A6 (🔴 split-brain khổ in)** — `seedDefaults` + CRUD `upsertKhoIn/deleteKhoIn` nay ghi `paper_sizes` (scope_offset, kèm `loai_kem/kho_giay_lon/chia_to/so_con`) — ĐÚNG nguồn engine đọc; bỏ ghi bảng chết `offset_cfg_kho_in`. Seed `ON CONFLICT (code) DO UPDATE` + COALESCE để bồi metadata offset cho khổ đã có (sửa gốc "(null)"). `deleteKhoIn` bỏ cờ thay vì xoá.
- **A2 (🟠 schema)** — `seedDefaults` ALTER ADD COLUMN IF NOT EXISTS cho cột offset của `paper_sizes`; cập nhật schema snapshot.
- **A3 (🟠 chia-0)** — `sp_khac`/`hộp` ném lỗi rõ khi khổ thiếu số con thay vì trả Infinity.
- **A4 (🟡 bảng chết)** — đánh dấu `offset_cfg_kho_in`/`offset_cfg_gia_cong` DEPRECATED trong schema (không DROP live).
- **Vá hiển thị (🟡)** — nhãn khổ in chỉ hiện loại kẽm khi có (hết "(null)").

Kiểm chứng: module pricing **180 pass** (thêm 2 ca A1 đọc/seed paper_sizes + 1 ca A3 chia-0). Diagnostics sạch. Chưa chạy tích hợp Postgres thật (seed) — kiểm bằng mock + đối chiếu SQL.

**CÒN LẠI (2 tính năng, cần làm có khảo sát + app chạy để verify):**
- **A5** — UI cấu hình metadata offset cho gia công (scope_offset/billing_mode/MOQ). Rủi ro: màn `settings/finishings` DÙNG CHUNG với in nhanh; `forbidNonWhitelisted` + kiểu boolean `scope_offset` + field form hiện chưa khớp DTO → cần verify trực tiếp, không sửa mù.
- **D1** — Round-trip SỬA báo giá offset (hydrate `printing_detail` + route về trang offset).


## 22. Tổ chức lại menu + UI cấu hình Kẽm/Vật tư bề mặt/Ép kim (đã làm)

- **Menu trái**: chẻ phần Cài đặt thành 3 nhóm rõ — **Cài đặt chung** (Khổ Giấy, Danh Mục/Định Mức Gia Công, Loại Vật Tư, Đơn Vị, Công Ty), **In Nhanh / Khổ Lớn** (định mức in nhanh/khổ lớn, bù hao, loại in/công nghệ/hệ màu), **In Offset** (Cấu Hình Sản Phẩm, Kẽm/Vật Tư/Ép Kim, Bù Hao Theo Công Đoạn, Phí & Chiết Khấu). Màn dùng chung KHÔNG nhân đôi. Chỉ refactor `PricingSidebar` (không đổi route). Sidebar spec sửa nhãn 'Cài đặt'→'Cài đặt chung', 5 pass.
- **UI mới `settings/offset-materials`**: cấu hình Kẽm (đơn giá 1 kẽm nhỏ/lớn + bảng giá bình bài theo số kẽm), Vật tư bề mặt (tên/đơn giá-kg/số mặt), Ép kim (vị trí × 4 bậc số lượng). Nạp từ `pricebook`; lưu qua `cfg/param` (DonGia1Kem_*), `cfg/kem`, `cfg/vat-tu-be-mat`, `cfg/ep-kim` (endpoint + ConfigStore CRUD đã có sẵn, bảng `offset_cfg_kem/vat_tu_be_mat/ep_kim` nhất quán — không split-brain). Đóng nốt khoảng trống "chỉ seed, chưa có màn" của kẽm/vtbm/epkim.

Diagnostics sạch toàn bộ.
