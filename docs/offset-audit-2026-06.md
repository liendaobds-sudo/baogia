# Audit toàn diện — Tính năng Báo giá IN OFFSET

_Soạn 2026-06-22. Phạm vi: dữ liệu/cấu hình → engine → form → lưu → hiển thị. Mức độ: 🔴 nghiêm trọng · 🟠 cao · 🟡 trung bình · 🟢 thấp/thông tin._

Bối cảnh: nhiều mục đã được sửa ở các đợt trước (xem `offset-waste-model.md` §0–20). Tài liệu này tổng hợp các vấn đề **CÒN LẠI**, tập trung vào tầng dữ liệu/cấu hình — nơi phát sinh lỗi "(null)" và "khổ in lạ" người dùng thấy.

---

## A. TẦNG DỮ LIỆU & CẤU HÌNH (gốc rễ nhiều lỗi)

### 🔴 A1 — "Split-brain" khổ in: engine đọc một nơi, seed/CRUD ghi nơi khác
- Engine đọc khổ in từ `paper_sizes WHERE scope_offset = true` (`config-store.service.ts:77`).
- `seedDefaults` lại INSERT khổ in vào bảng RIÊNG `offset_cfg_kho_in` (`:311`); CRUD `upsertKhoIn`/`deleteKhoIn` (`:427`,`:435`) cũng ghi bảng chết này.
- ⇒ Dữ liệu khổ in seed/CRUD **không bao giờ tới engine**. Lúc chạy, khổ in chỉ đến từ: (a) fallback JSON `data/kho_in.json`, hoặc (b) các dòng `paper_sizes` do admin tạo qua màn Khổ Giấy (tab Offset).
- **Hệ quả thực tế người dùng gặp**: dropdown "Khổ in" hiện 43×65/52×74/65×100/79×109 (khổ giấy chung) với `loai_kem` rỗng → "(null)". Đó là các `paper_sizes` được gắn cờ offset NHƯNG thiếu metadata offset (loại kẽm, chia tờ, số con).
- **Khuyến nghị**: bỏ bảng `offset_cfg_kho_in`; cho `seedDefaults` + CRUD ghi thẳng `paper_sizes` (scope_offset=true, kèm loai_kem/kho_giay_lon/chia_to/so_con). Hoặc tối thiểu: seed `loai_kem`/`so_con` cho các dòng paper_sizes offset.

### 🟠 A2 — Cột offset của `paper_sizes` KHÔNG có trong schema chuẩn
- `db/schema.postgres.sql:571–589` (paper_sizes) thiếu `scope_offset`, `kho_giay_lon`, `chia_to`, `so_con_bai_in`, `so_con_to_lon`, `loai_kem`. Chúng chỉ được thêm bởi script rời `migrate-paper-sizes.js:9` + `migrate-fields.js:6–10`.
- Trên DB dựng từ schema chuẩn, truy vấn `:77` ném lỗi → bị `safeQuery` nuốt (`:55`) → âm thầm fallback JSON. Khó phát hiện, dễ "chạy nhưng sai nguồn".
- **Khuyến nghị**: đưa các cột này vào schema/entity chính thức (entity `PaperSize` đã khai báo, nhưng snapshot schema chưa) + 1 migration chuẩn thay cho script rời.

### 🟠 A3 — `sp_khac`/`hộp` chế độ TĨNH chia cho 0 khi khổ thiếu `so_con`
- `sp-khac.ts`: `soConBaiIn = kho.soConBaiIn`; `luotIn = ceil(sl / soConBaiIn * soMat)`. Nếu khổ (paper_sizes offset chung) có `so_con_bai_in` null→0 → `sl/0 = Infinity` → giá Infinity/NaN. `soCon = kho.soConToLon = 0` cũng làm `buildWaste` sai.
- Chỉ an toàn khi người dùng NHẬP kích thước (nhánh động). Với dữ liệu hiện tại (so_con rỗng) + không nhập kích thước → báo giá hỏng.
- **Khuyến nghị**: khi `so_con*` ≤ 0 và không có kích thước → ném lỗi rõ ("khổ chưa cấu hình số con, hãy nhập kích thước"), không trả Infinity.

### 🟡 A4 — `offset_cfg_gia_cong` là bảng CHẾT
- Có trong schema (`:1352`) nhưng KHÔNG được đọc lẫn ghi (gia công offset dùng `processing_options`). Migration đã ghi chú "ĐÃ BỎ" nhưng bảng còn sót.
- **Khuyến nghị**: drop bảng + dọn tham chiếu để tránh hiểu nhầm.

### 🟠 A5 — KHÔNG có UI cấu hình metadata offset cho gia công
- Engine cần `scope_offset` + `billing_mode`/`moq_param`/`min_charge_param` trên `processing_options` (`:80`), nhưng màn `settings/finishings` chỉ có code/name/category/unit/baseCost/status — KHÔNG có các trường đó.
- ⇒ Chỉ `seedDefaults` set được; admin không thể thêm/sửa công đoạn offset hay đổi cách tính (minCharge/perUnit). Trái nguyên tắc "mọi thứ cấu hình được".
- **Khuyến nghị**: bổ sung toggle "Dùng Offset" + chọn billing_mode + MOQ/GiaMin param vào màn gia công (hoặc một màn định mức offset riêng).

### 🟡 A6 — `loai_kem` không được seed cho `paper_sizes`
- Không seed/SQL nào điền `loai_kem` vào `paper_sizes` (chỉ điền vào bảng chết `offset_cfg_kho_in`). ⇒ khổ offset thực tế thường thiếu loại kẽm → "(null)" (đã vá hiển thị) + engine fallback 'Kẽm lớn' khi suy (có thể sai tiền kẽm).
- **Khuyến nghị**: gắn liền A1 — seed loai_kem vào paper_sizes; engine cảnh báo khi thiếu.

---

## B. ENGINE / TÍNH GIÁ

### 🟡 B1 — Fallback `loaiKem` âm thầm
`to-roi`/`bi-thu` suy `kemType = timKhoIn(khoBinh)?.loaiKem ?? input.kemType ?? 'Kẽm lớn'`. Khi khổ thiếu loại kẽm → mặc định 'Kẽm lớn' (giá kẽm cao hơn) mà không cảnh báo. Nên log/đánh dấu để người dùng biết đang dùng mặc định.

### 🟢 B2 — `safeQuery` nuốt mọi lỗi
Tiện cho fallback nhưng giấu lỗi schema (A2). Nên log cảnh báo 1 lần khi 1 nhóm phải fallback vì lỗi truy vấn (phân biệt "DB rỗng" vs "truy vấn lỗi").

### 🟢 B3 — Cột `so_con_*` tĩnh phần lớn đã bị thay bằng dàn khuôn động
Sau đợt imposition động, các đường tĩnh chỉ còn dùng cho chế độ "khổ có sẵn"/sp_khac không nhập kích thước. Cân nhắc lộ trình bỏ hẳn số tĩnh để 1 nguồn sự thật (hình học), tránh lệch.

---

## C. FORM BÁO GIÁ / UI

### 🟡 C1 — Nhãn khổ in "(null)" — ĐÃ VÁ
Đã đổi nhãn ở configurator + settings: chỉ hiện loại kẽm khi có. Gốc rễ vẫn là A1/A6 (dữ liệu).

### 🟡 C2 — Dropdown "Khổ in" trộn khổ giấy lớn
Vì nguồn là `paper_sizes(scope_offset)` chung. Cần phân định rõ "khổ in/bài in" vs "khổ giấy lớn" (A1). Hiện người dùng có thể chọn nhầm khổ giấy lớn làm khổ in.

### 🟢 C3 — Đã có whitelist 3 tầng (UI/auto-chọn/validate) — OK.

---

## D. LƯU / HIỂN THỊ (đã sửa đợt rà luồng — xác nhận đóng)

- 🔴→✅ Lưu offset 400 (mapItem spread camelCase) — đã sửa.
- 🟠→✅ Mất chi tiết offset — lưu vào `printing_detail`.
- 🟠→✅ Server tính lại giá (chống sửa giá).
- 🟠→✅ Hiển thị offset (detail UI + PDF) + tổng/VAT đúng ngữ nghĩa.

### 🟡 D1 — Round-trip SỬA báo giá offset còn vỡ
Trang sửa `new/page.tsx` hydrate đọc `config_params`/`calculation_details` — không khớp `printing_detail` của offset ⇒ không mở lại để sửa được. Cần trang sửa offset riêng (hoặc map `printing_detail` khi hydrate + route về trang offset).

### 🟡 D2 — Validate server còn yếu
Chỉ FE + recompute; backend chưa bắt buộc khách/SL>0. Nên thêm ràng buộc tối thiểu phía server.

---

## E. ƯU TIÊN XỬ LÝ (đề xuất)

1. 🔴 **A1 + A6** — ✅ ĐÃ XỬ. `seedDefaults` + CRUD `upsertKhoIn/deleteKhoIn` nay ghi `paper_sizes` (scope_offset, kèm loai_kem/kho_giay_lon/chia_to/so_con), bỏ bảng chết `offset_cfg_kho_in`. Seed dùng `ON CONFLICT (code) DO UPDATE` + COALESCE để điền metadata offset cho khổ đã có. Test: 2 ca mới (đọc paper_sizes + seed đúng bảng).
2. 🟠 **A3** — ✅ ĐÃ XỬ. `sp_khac`/`hộp` ném lỗi rõ khi khổ thiếu số con thay vì chia-0 (Infinity). Test: 1 ca.
3. 🟠 **A2** — ✅ ĐÃ XỬ. `seedDefaults` chạy `ALTER TABLE paper_sizes ADD COLUMN IF NOT EXISTS ...` (idempotent) cho cột offset; cập nhật schema snapshot `paper_sizes`.
4. 🟡 **A4** — ✅ ĐÃ XỬ (đánh dấu). Schema snapshot ghi rõ `offset_cfg_kho_in` + `offset_cfg_gia_cong` DEPRECATED (không seed/đọc; có thể DROP an toàn). Không DROP bảng live (tránh phá huỷ).
5. 🟠 **A5** — ✅ ĐÃ XỬ. Bổ sung 4 trường offset (`scope_offset`/`billing_mode`/`moq_param`/`min_charge_param`) vào `CreateProcessingOptionDto`+`UpdateProcessingOptionDto` (nới whitelist, an toàn) và vào FIELDS màn `settings/finishings`. Admin bật "Dùng cho In Offset" + chọn cách tính + param MOQ/GiaMin cho công đoạn. (Repo `processing_options` đã có cột; engine đọc qua scope_offset.)
6. 🟡 **D1** — ✅ ĐÃ XỬ. Round-trip sửa offset: nút "Chỉnh sửa" route báo giá `In Offset` về `/pricing/quotes/offset?edit=ID`; trang offset hydrate khách + giỏ hàng từ `printing_detail` (config/result/unitPrice); lưu bằng **PUT** (update, server tính lại giá) khi edit. Bổ sung `vat_rate/vat_amount/shipping_fee/grand_total/type` vào `UpdateQuoteDto` để PUT không bị whitelist chặn.
7. 🟡 **B1, B2, D2** — 🟢 nhỏ, để sau (cảnh báo fallback, siết validate server).

**Kiểm chứng cụm đã xử (A1–A5, D1, A6):** module pricing **180 pass**; frontend configurator **5 pass**; diagnostics sạch. Lưu ý: A5/D1 là thay đổi UI/luồng cần verify trên app chạy thật (đặc biệt A5 trên màn dùng chung digital, và D1 PUT update).
