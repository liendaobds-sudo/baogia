# Audit Tính năng Báo giá (Báo giá Kỹ Thuật Số + Offset)

> Phạm vi: `backend/src/modules/pricing` (digital + offset engine), `backend/src/modules/quote`, frontend `frontend/src/app/pricing/quotes/**`.
> Phương pháp: đọc trực tiếp mã nguồn hiện trạng. Mỗi phát hiện có dẫn chứng file.
> Tài liệu đào sâu mô hình bù hao theo công đoạn: xem `docs/offset-waste-model.md`.

---

## 0. Tóm tắt điều hành

Tính năng báo giá đã **tách đúng chủ đích** thành hai nhánh độc lập: **BG Kỹ Thuật Số** (in nhanh) và **BG Offset**, mỗi nhánh có engine, dữ liệu, API, configurator riêng. Việc tách là điểm mạnh, không phải vấn đề.

Vấn đề nằm ở **mức độ hoàn thiện không đồng đều giữa hai nhánh** và ở **tầng dữ liệu/định mức**:

- Nhánh **in nhanh** đã được nâng cấp UX + nối đúng API lưu (`/erp/orders`).
- Nhánh **offset** bị bỏ lại: **lưu vào route chết (404)**, UX cũ, và mô hình định mức/bù hao chưa đạt chuẩn sản xuất.
- Lõi tính toán từng sản phẩm (cả 2 engine) khá chắc và có test; cái gãy là **tích hợp, dữ liệu, và mô hình hao hụt**.

Xếp hạng mức độ: 🔴 chặn · 🟠 cao · 🟡 trung bình · ⚪ thấp.

| # | Phát hiện | Mức | Khu vực |
|---|-----------|-----|---------|
| A1 | Lưu báo giá Offset gọi route chết `/quotes/save` (404) → không vào danh sách | 🔴 | FE offset |
| A2 | VAT offset có nguy cơ tính 2 lần (trang offset cộng VAT lên kết quả engine đã gồm VAT) | 🟠 | FE offset + engine |
| A3 | `getBindingCost` nuốt lỗi → chi phí đóng cuốn = 0đ nếu thiếu bảng `binding_types` | 🟠 | BE in nhanh |
| A4 | Hai triết lý giá khác nhau (markup vs chiết khấu) + VAT khai báo 2 nơi | 🟠 | cả 2 engine |
| A5 | Bù hao **không theo công đoạn**; dùng % phẳng cuối kỳ | 🟠 | engine offset |
| A6 | Double-count hao tờ (3/5 sản phẩm) + quy tắc chọn bậc hao ngược nhau | 🟠 | engine offset |
| A7 | Khổ in offset **đọc/ghi lệch bảng** (`paper_sizes` vs `offset_cfg_kho_in`) | 🟠 | config-store |
| A8 | Số con/tờ hộp giấy lấy từ bảng cố định, không từ kích thước hộp thật | 🟠 | engine offset |
| A9 | Giá giấy offset đọc `priceVAT` rồi totals cộng VAT lần nữa | 🟡 | engine offset |
| A10 | Định mức rải ~10 nguồn + hardcode (`TUI_NEST_OPTIONS`, `mocSoLuong`) | 🟡 | config |
| A11 | Vật tư: giá offset ở `materials.pricePerSheet`, in nhanh ở `pricing_tiers` (cùng dòng, 2 cột) | 🟡 | dữ liệu |
| A12 | Trang offset: `@ts-nocheck`, `alert()`, không validate khách, không có edit mode | 🟡 | FE offset |
| A13 | `QuoteCartItem.configParams/details: any` — không schema giữa configurator ↔ lưu | 🟡 | FE |
| A14 | Độ sâu sản xuất: makeready cứng 50 tờ, không pha cắt giấy nguyên, không markup offset | 🟡 | engine offset |
| A15 | Hao hụt phẳng của digital (`waste_offset_percent`) là code chết với engine offset | ⚪ | dữ liệu |

---

## 1. Kiến trúc & phân tách hai nhánh

| | In nhanh (digital) | Offset |
|---|---|---|
| Engine | `PricingFacadeService` + `PricingService` (port từ PHP) | `EngineOffsetService` + `offset-engine/products/*.ts` (Excel v7.2) |
| Nguồn giá | `pricing_tiers`, `processing_options`, `accessories`, `large_format_pricing` | `PricingData` từ `ConfigStore`/JSON |
| API | `POST /pricing/calculate`, `GET /pricing/master-data` | `POST /pricing/offset/calculate`, `GET /pricing/offset/pricebook` |
| Nhánh con | `loose` / `bound` / `large_format` | `to_roi` / `bi_thu_folder` / `sp_khac` / `hop_giay` / `tui_giay` |
| Trang | `/pricing/quotes/new` | `/pricing/quotes/offset` |
| Phân luồng vật tư | `material.scopeLoose/scopeBound/scopeLargeFormat` | `material.scopeOffset` |

**Đánh giá:** tách biệt tốt ở mọi tầng (entity scope, engine, API prefix `/pricing/offset` độc lập, service, hook, trang). Đây là kiến trúc đúng cho hai mô hình giá khác bản chất. Vấn đề là **đồng bộ mức hoàn thiện** giữa hai nhánh (xem A1, A12).

---

## 2. Luồng lưu báo giá (workflow) — 🔴 A1

- **In nhanh** (`new/page.tsx`): đã chuyển sang `POST /erp/orders`, ánh xạ `CreateQuoteDto`, item trải phẳng theo `QuoteItemDto`, có toast/validate/edit-mode (theo spec `quote-page-ux` task 7.x).
- **Offset** (`offset/page.tsx` dòng 32): vẫn `POST /quotes/save`.

Backend **không có** route `quotes/save`. Các route lưu thật:
- `POST /api/v1/quote` (số ít) — `quoteCrudService.createQuote`
- `POST /api/v1/erp/orders` — cái in nhanh dùng

⇒ Báo giá Offset bấm Lưu sẽ **404, không bao giờ vào "Danh sách BG"**. Đây là bug chặn, đúng triệu chứng Requirement 3 đã từng sửa cho in nhanh nhưng bỏ quên offset.

**Sửa:** đưa `offset/page.tsx` về `/erp/orders` với cùng ánh xạ `CreateQuoteDto` + item trải phẳng như `new/page.tsx`; chốt một đường biên VAT (xem A2); bỏ `@ts-nocheck`; thêm `validateQuoteDraft` + toast (xem A12).

---

## 3. VAT & giá bán

### 3.1 VAT offset tính 2 lần — 🟠 A2
Engine offset đã trả `tongGomVAT`/`khachTra` (đã gồm VAT, `totals.ts`). Nhưng `offset/page.tsx` (dòng 29–31) lại tự cộng VAT lên `getTotalAmount()`:
```js
const vatAmount = subtotal * (customerData.vat_rate / 100);
const grandTotal = subtotal + vatAmount + shipping_fee;
```
Tùy `item.total` lưu vào cart là `khachTra` (đã VAT) hay `tongChuaVAT`, có thể **VAT chồng VAT**. Cần chốt một điểm áp VAT duy nhất.

### 3.2 Hai triết lý giá + VAT khai báo 2 nơi — 🟠 A4
- In nhanh: giá vốn → **markup/margin** (`calculateSellingPrice`) → VAT, điều khiển bởi `pricing_config`.
- Offset: engine tự tính `tongChuaVAT → vat → chiết khấu → khachTra` bên trong, dùng `PricingData.params.TyLe_VAT`/`TyLe_ChietKhau`.

VAT nằm ở **hai nơi**: `pricing_config.vat_rate` (digital) và `params.TyLe_VAT` (offset). Markup không áp cho offset. Khó kiểm soát biên lợi nhuận đồng nhất.

### 3.3 Giá giấy offset double-VAT — 🟡 A9
`giaGiay` trả `priceVAT` (đã gồm VAT); `totals` lại cộng VAT lên cả tiền giấy ⇒ giấy bị VAT 2 lần. Nên dùng `priceNoVAT` làm gốc.

---

## 4. Bù hao & định mức (offset) — 🟠 A5, A6, A8

> Chi tiết mô hình nâng cấp: `docs/offset-waste-model.md`.

- **A5 — Không có bù hao theo công đoạn.** Bế/dán/TP/đóng gói tính `đơn giá × sl` (số lượng gốc); không có cơ chế "số con vào công đoạn = đầu ra tốt + hao công đoạn". Toàn bộ hao gộp vào **một % phẳng** ở `totals.ts`.
- **A6 — Double-count + quy tắc ngược.** `to_roi/sp_khac/hop_giay` đã cộng bù hao tờ vào `soToLon`, rồi totals cộng % phẳng lên cả tiền giấy (2 lần); `bi_thu_folder/tui_giay` chỉ áp 1 lần ⇒ 5 sản phẩm không nhất quán. Lookup hao inline dùng `sl <= mocSoLuong` còn `lookups.haoHut` dùng `sl >= mocSoLuong` ⇒ hai tỷ lệ khác nhau cho cùng đơn.
- **A8 — Số con/tờ hộp sai.** `hop-giay.ts` tính khổ trải + xếp con rồi **vứt đi** (`void khoTraiHop(input); void soConTrenKho;`), dùng `kho.soConToLon` cố định ⇒ hộp to/nhỏ trên cùng khổ ra cùng số con/tờ ⇒ định mức giấy sai. (Túi giấy lại tính từ kích thước thật — không nhất quán.)

---

## 5. Tầng dữ liệu / cấu hình định mức — 🟠 A7, 🟡 A10, A11

- **A7 — Khổ in split-brain.** `loadPricingData` đọc khổ từ `paper_sizes WHERE scope_offset`; nhưng `seedDefaults` + `upsertKhoIn/deleteKhoIn` (`/pricing/offset/cfg/kho-in`) ghi vào `offset_cfg_kho_in`. ⇒ Sửa khổ qua admin **không vào giá**; `offset_cfg_kho_in` là bảng "ghi mà không đọc".
- **A10 — Định mức phân tán ~10 nguồn + hardcode.** materials, paper_sizes, processing_options+processing_pricing, offset_cfg_kem, offset_cfg_vat_tu_be_mat, offset_cfg_ep_kim, waste_rules, pricing_config, setup_fees; `mocSoLuong` chỉ JSON; `TUI_NEST_OPTIONS` hardcode trong `tui-giay.ts`. Không có một màn "Định mức Offset".
- **A11 — Vật tư hai cột giá.** Giá offset đọc `materials.pricePerSheet`, in nhanh đọc `pricing_tiers` — cùng dòng vật tư, hai cơ chế giá; admin phải tự nhớ sửa ô nào.
- **A15 — Code chết.** `calculateWasteSheets` có nhánh `printMethod:'offset'` nhưng engine offset không dùng → cấu hình `waste_offset_percent` vô tác dụng với offset.

---

## 6. In nhanh (digital) — 🟠 A3

- **A3 — `getBindingCost` nuốt lỗi.** `pricing.service.ts`: query `binding_types`, nếu bảng không tồn tại thì `catch {}` → **trả 0đ tiền đóng cuốn** âm thầm. Nhánh `bound` có thể báo giá thiếu toàn bộ chi phí gia công đóng cuốn. (Ngược với pattern phòng thủ "không trả 0 âm thầm" mà code áp ở chỗ khác.) Cần xác minh `binding_types` tồn tại + seed, và đổi sang cảnh báo/yêu cầu báo giá tay khi thiếu.
- Các nhánh `loose`/`large_format` xử lý phòng thủ tốt (cảnh báo rollWidth nhập nhầm mét, per_m2 cần diện tích tờ, không trả 0đ khi thiếu đơn giá m²).

---

## 7. UI/UX & an toàn kiểu — 🟡 A12, A13

- **A12 — Offset tụt lại so với in nhanh.** Trang offset: `// @ts-nocheck` (tắt type-check), `alert()` thay toast, nút Lưu chỉ disable khi `items.length===0` (không `validateQuoteDraft` ⇒ lưu được báo giá không tên khách), không có edit mode (`?edit=`) như in nhanh.
- **A13 — Cart không schema.** `QuoteCartItem.configParams/details: any`; in nhanh `mapItem` trải phẳng theo `QuoteItemDto`, nhưng item offset có shape khác ⇒ không gì đảm bảo khớp khi lưu. Nên định nghĩa type cho `configParams`/`details` theo từng `type`.
- In nhanh đã có: `ToastProvider`, `ConfirmModal`, `formatVND`, `validateQuoteDraft`, debounce, phân trang, a11y (aria-label, badge text), responsive drawer, ẩn nút theo RBAC.

---

## 8. Độ sâu cho sản xuất thực — 🟡 A14

Hiện ở mức "máy tính báo giá theo Excel", chưa phải "mô hình định mức sản xuất":
- Makeready in cứng 50 tờ, không theo số màu/kẽm/lượt.
- Chi phí giấy = đơn giá tờ × số tờ, **không** truy lên giấy nguyên khổ + sơ đồ pha cắt.
- Không tách giá vốn → giá bán theo markup cho offset (chỉ chiết khấu ngược).
- Thiếu: phí film/bình, phụ phí số màu pha (Pantone), mực theo độ phủ, công theo ca máy.
- Bù hao theo công đoạn (cốt lõi định mức xưởng) chưa mô hình hoá — xem `offset-waste-model.md`.

---

## 9. Kế hoạch xử lý đề xuất (toàn tính năng)

Sắp theo tác động & rủi ro. Mục bù hao/định mức chi tiết ở `offset-waste-model.md`.

| Đợt | Hạng mục | Phát hiện | Đụng công thức? | Rủi ro |
|-----|----------|-----------|-----------------|--------|
| 0 | Lưu offset về `/erp/orders` + chốt 1 đường biên VAT + bỏ `@ts-nocheck` + validate/toast | A1, A2, A12 | Không | Thấp |
| 0 | Khổ in: chốt nguồn `paper_sizes`, gỡ/redirect `offset_cfg_kho_in` | A7 | Không | Thấp |
| 0 | Giá giấy offset dùng `priceNoVAT` | A9 | Thấp | Thấp |
| 0 | Xác minh + seed `binding_types`; bỏ nuốt lỗi `getBindingCost` | A3 | Thấp | Thấp |
| 1 | Mô hình dữ liệu định mức (`StageDef`/`RouteDef`/mốc SL/bài in túi vào DB) | A5, A8, A10, A11 | Không | TB |
| 2 | Engine offset V2: cascade bù hao theo công đoạn, số con từ kích thước thật, bỏ % phẳng (shadow) | A5, A6, A8 | Cao | Cao |
| 3 | Golden V2 + property test + đối chiếu đơn thật | — | — | TB |
| 4 | Giá vốn → giá bán markup dùng chung config; thống nhất VAT một nguồn | A4 | TB | TB |
| 5 | Màn "Định mức Offset" hợp nhất; schema cho `configParams`/`details` | A10, A13 | Không | TB |
| 6 | Độ sâu sản xuất: makeready theo màu/kẽm, pha cắt giấy nguyên | A14 | Cao | Cao |

**Khuyến nghị:** làm **Đợt 0** ngay (toàn lỗi rõ ràng, rủi ro thấp, không đụng công thức nên không lệch golden test), song song chốt **mô hình dữ liệu Đợt 1** trên giấy (mục 9 của `offset-waste-model.md`).

---

## 10. Phụ lục — Bản đồ file liên quan

- Engine in nhanh: `modules/pricing/services/pricing-facade.service.ts`, `modules/pricing/pricing.service.ts`, `services/bound-calculator.service.ts`
- Engine offset: `modules/pricing/offset-engine/{engine-offset.service,lookups,totals,config-store.service,default-data,pricing-data}.ts`, `offset-engine/products/*.ts`
- Cầu nối: `modules/quote/pricing-api.service.ts`, `modules/quote/quote.service.ts`
- Controller offset: `modules/pricing/controllers/offset.controller.ts`
- FE in nhanh: `frontend/src/app/pricing/quotes/new/page.tsx`, `_hooks/useQuoteConfigurator.ts`, `_components/QuoteConfigurator.tsx`
- FE offset: `frontend/src/app/pricing/quotes/offset/page.tsx`, `_components/OffsetQuoteConfigurator.tsx`, `_hooks/useOffsetPricebook.ts`
- Cart: `frontend/src/app/pricing/quotes/_store/useQuoteCart.ts`
- Entity scope: `backend/src/entities/material.entity.ts`
