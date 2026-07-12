# Implementation Plan: Offset Imposition Gripper Unification

## Overview

Triển khai theo lộ trình an toàn về giá: trước tiên dựng **Imposition_Service** thuần (mm, tất định) và **impositionSelector** với `ImpositionSource='legacy'` mặc định để giá live KHÔNG đổi và golden cũ vẫn xanh; sau đó nối vào 5 hàm sản phẩm, mở rộng meta cho parity, cập nhật preview/PDF tiêu thụ `meta.soConToLon`, dựng Shadow_Mode + Business_Validation_Gate, cuối cùng re-baseline golden có giải trình khi flip sang `unified`. Mỗi bước xây trên bước trước và kết thúc bằng wiring vào engine; mọi correctness property được cài bằng một property-based test (fast-check, ≥100 vòng).

Ngôn ngữ: **TypeScript** (theo codebase NestJS hiện có; design dùng TypeScript trực tiếp).

## Tasks

- [x] 1. Mở rộng kiểu dữ liệu nền (Margin_Config, Params, KhoIn, QuoteMeta)
  - [x] 1.1 Thêm các trường imposition vào model dữ liệu trong `pricing-data.ts`
    - Thêm `gripperCm?`, `gutterCm?` vào interface `KhoIn`
    - Thêm `ImpositionSource?: 'legacy' | 'unified'`, `ShadowMode?`, `Gripper_Cm?`, `Gutter_Cm?` vào `Params` (mở rộng index signature để chứa chuỗi cho `ImpositionSource`)
    - Mở rộng `QuoteMeta` với `impositionSource?`, `marginConfig?`, `positions?`, `shadow?`
    - Export interface `MarginConfig` (left/right/top/bottom/gripper/gutter — mm)
    - _Requirements: 1.1, 1.3, 5.2, 6.1_

- [x] 2. Xây Imposition_Service (hàm thuần, nguồn sự thật duy nhất)
  - [x] 2.1 Triển khai `resolveMarginConfig` trong `offset-engine/imposition.ts`
    - Map `kho.margin*` cm→mm (×10, thiếu→0); `gripper = (kho.gripperCm ?? params.Gripper_Cm ?? 1.2) × 10`; `gutter = (kho.gutterCm ?? params.Gutter_Cm ?? 0.3) × 10`
    - Ném `OffsetPricingError` mô tả khổ + field khi bất kỳ giá trị < 0
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x]* 2.2 Viết property test cho `resolveMarginConfig`
    - **Property 1: Margin_Config được suy từ nguồn cấu hình (mapping + mặc định + đổi đơn vị)**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
    - File: `offset-engine/__tests__/imposition.property.spec.ts`

  - [x] 2.3 Triển khai `imposeUnified` (mô hình dàn khuôn vật lý, snap mm, 2 hướng)
    - Trừ left+right khỏi bề rộng, top+bottom+gripper khỏi bề cao; gutter giữa các con
    - Chuyển cm→mm nguyên với epsilon snap trước khi `floor` (tất định)
    - Thử hướng 0° và 90°, chọn nhiều con hơn (tie → 0°); tính `soConToLon`, `soConBaiIn` (0 nếu thiếu press*), trả `orientation`, `usableArea`, `positions`
    - Ném `OffsetPricingError` khi `usableW ≤ 0 || usableH ≤ 0`
    - _Requirements: 2.1, 2.5, 2.6, 1.6_

  - [x]* 2.4 Viết property test cho lỗi vùng in không hợp lệ
    - **Property 2: Lề/gripper/gutter không hợp lệ bị từ chối bằng lỗi mô tả**
    - **Validates: Requirements 1.6**
    - File: `offset-engine/__tests__/imposition.property.spec.ts`

  - [x]* 2.5 Viết property test cho lựa chọn hướng đặt
    - **Property 3: Imposition chọn hướng đặt nhiều con hơn**
    - **Validates: Requirements 2.1, 2.5**
    - File: `offset-engine/__tests__/imposition.property.spec.ts`

  - [x]* 2.6 Viết property test cho tính tất định
    - **Property 4: Imposition tất định, không nhạy thứ tự phép tính float**
    - **Validates: Requirements 2.6, 10.4**
    - File: `offset-engine/__tests__/imposition.property.spec.ts`

  - [x]* 2.7 Viết property test cho tính đơn điệu theo lề/gripper/gutter
    - **Property 5: Tăng lề/gripper/gutter không làm tăng số con**
    - **Validates: Requirements 1.1, 3.2**
    - File: `offset-engine/__tests__/imposition.property.spec.ts`

  - [x]* 2.8 Viết unit test ví dụ cụ thể cho `imposeUnified`
    - Ca gripper 12mm trên khổ 79×109 cho số con đã biết; ca sản phẩm vừa khít; ca quá khổ
    - _Requirements: 2.1, 2.5_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Xây impositionSelector (chọn nguồn + shadow)
  - [x] 4.1 Triển khai `resolveSoCon` trong `offset-engine/imposition-selector.ts`
    - Đọc `source` và `shadow` từ `data.tyLe.params`; tính `unified` qua `imposeUnified`, `legacy` qua `imposeFromKhoIn`
    - Trả `So_Con` theo `source`; gắn `shadow{}` khi `ShadowMode` bật; trả `positions`, `marginConfig`, `source`
    - `ImpositionSource` giá trị lạ → mặc định an toàn `'legacy'` + cảnh báo log; không âm thầm fallback khi `unified` lỗi hình học (fail fast)
    - Ghi log so sánh qua `Logger` khi shadow bật
    - _Requirements: 5.1, 5.3, 6.1, 6.2, 6.3, 9.4_

  - [x]* 4.2 Viết property test cho So_Con = 0 dẫn tới lỗi
    - **Property 7: So_Con = 0 dẫn tới lỗi mô tả, không chia cho 0**
    - **Validates: Requirements 3.4**
    - File: `offset-engine/__tests__/imposition-selector.property.spec.ts`

  - [x]* 4.3 Viết property test cho cờ nguồn mặc định
    - **Property 10: Cờ nguồn mặc định quyết định So_Con cho mọi loại sản phẩm**
    - **Validates: Requirements 6.1, 6.2, 6.3, 9.1**
    - File: `offset-engine/__tests__/imposition-selector.property.spec.ts`

  - [x]* 4.4 Viết property test cho parity một nguồn So_Con
    - **Property 11: Một nguồn So_Con duy nhất cho cả giá và preview (parity)**
    - **Validates: Requirements 2.2, 9.4, 10.1**
    - File: `offset-engine/__tests__/imposition-selector.property.spec.ts`

- [x] 5. Nạp Margin_Config + cờ cấu hình qua ConfigStore
  - [x] 5.1 Mở rộng `config-store.service.ts` để map gripper/gutter và cờ imposition
    - Map `paper_sizes` lề (đã có) + đọc gripper/gutter từ cột mới (nếu có) hoặc fallback `params.Gripper_Cm`/`Gutter_Cm`
    - Tách `offset.ImpositionSource` (chuỗi, từ `pricing_config.config_value` TEXT) khỏi params số, giống cách `WasteStages` được tách
    - Đọc `offset.ShadowMode`, `offset.Gripper_Cm`, `offset.Gutter_Cm`
    - _Requirements: 1.4, 5.4, 6.4_

  - [x]* 5.2 Viết integration test cho reload cấu hình không cần redeploy
    - Sửa `pricing_config`/`paper_sizes`, gọi `refreshFromConfigStore`, xác nhận giá trị mới được dùng cho giá + preview
    - _Requirements: 1.4, 5.4, 6.4_

- [x] 6. Tích hợp resolveSoCon vào các hàm sản phẩm phẳng
  - [x] 6.1 Nối `to-roi.ts` và `sp-khac.ts` dùng `resolveSoCon`
    - Thay `imposeFromKhoIn` / `soConKhoTinh` bằng `resolveSoCon` (giữ fallback bảng tĩnh qua `fallback*`)
    - Dùng `So_Con` đồng thời cho `buildWaste(...)` và `res.meta.soConToLon`; gắn `meta.shadow/positions/marginConfig/impositionSource`
    - _Requirements: 9.1, 9.4, 10.1, 5.2_

  - [x] 6.2 Nối `bi-thu-folder.ts` và `hop-giay.ts` dùng `resolveSoCon`
    - Thay imposition trực tiếp bằng `resolveSoCon`; giữ fallback bảng tĩnh
    - Gắn `meta.shadow/positions/marginConfig/impositionSource`
    - _Requirements: 9.1, 9.4, 10.1, 5.2_

  - [x] 6.3 Nối `tui-giay.ts` dùng primitive imposition
    - Trong `buildTuiOptions`/`soConBai`, áp `Margin_Config` (lề/gripper/gutter) qua `imposeUnified` primitive thay khe hở phẳng; giữ `khoTraiTui` đặc thù
    - Gắn `meta` tương ứng cho tui_giay
    - _Requirements: 9.2, 9.3, 9.4_

  - [x]* 6.4 Viết property test cho tui_giay tôn trọng mô hình lề/gripper/gutter
    - **Property 12: tui_giay tôn trọng cùng mô hình lề/gripper/gutter**
    - **Validates: Requirements 9.2, 9.3**
    - File: `offset-engine/__tests__/tui-imposition.property.spec.ts`

- [x] 7. Đảm bảo cascade tiêu thụ đúng nguồn So_Con
  - [x] 7.1 Xác nhận `waste-cascade.ts` dùng So_Con từ selector và chặn So_Con = 0
    - `Sheets_Net = ceil(piecesIntoPress / So_Con)`; khi So_Con = 0 → `OffsetPricingError`, engine trả `success=false` (không chia 0, không giá 0)
    - Giữ nguyên logic cascade/bù hao, chỉ đổi nguồn So_Con
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 7.2 Mở rộng property test cascade cho công thức và đơn điệu Sheets_Net
    - **Property 6: Sheets_Net đúng công thức và đơn điệu theo So_Con; bất biến ranh giới cascade được giữ**
    - **Validates: Requirements 3.1, 3.2, 3.3**
    - File: `offset-engine/__tests__/waste-cascade.property.spec.ts` (mở rộng)

- [x] 8. Bảo toàn bất biến VAT một nguồn
  - [x] 8.1 Xác nhận `totals.ts` giữ VAT-exclusive sau khi đổi nguồn So_Con
    - `vatPct = vatRate ?? 0`, áp đúng một lần; không lấy VAT từ `pricing_config`/tenant/hằng số
    - _Requirements: 4.1, 4.2, 4.3_

  - [x]* 8.2 Mở rộng property test totals cho bất biến VAT
    - **Property 8: VAT một nguồn, áp đúng một lần, tỉ lệ bất biến theo imposition**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - File: `offset-engine/__tests__/totals.property.spec.ts` (mở rộng)

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Shadow_Mode không đổi giá xuất ra
  - [x] 10.1 Wiring Shadow_Mode trong engine + đính `meta.shadow`
    - Khi `ShadowMode` bật: tính cả hai nguồn, trả giá theo nguồn mặc định, đính `meta.shadow` (legacy/unified/delta) không tác động giá
    - _Requirements: 5.1, 5.2, 5.3_

  - [x]* 10.2 Viết property test Shadow_Mode không đổi giá
    - **Property 9: Shadow_Mode không làm đổi giá xuất ra**
    - **Validates: Requirements 5.2**
    - File: `offset-engine/__tests__/imposition-selector.property.spec.ts`

  - [x]* 10.3 Viết smoke/example test cho shadow log (mock logger)
    - Xác nhận shadow tính cả hai nguồn và ghi log so sánh
    - _Requirements: 5.1, 5.3_

- [x] 11. Parity preview/PDF tiêu thụ meta
  - [x] 11.1 Cập nhật `OffsetPreviewSVG.tsx` và `DielinePreview.tsx` render từ meta
    - Render từ `meta.soConToLon` + `meta.positions` thay vì tự gọi nesting để đếm số con
    - _Requirements: 2.3, 10.2_

  - [x] 11.2 Cập nhật `quote-pdf.service.ts` in `meta.soConToLon`
    - In số con/tờ từ kết quả engine, không tự tính lại
    - _Requirements: 2.4, 10.3_

  - [x]* 11.3 Viết component test parity preview + example test PDF
    - `OffsetPreviewSVG`/`DielinePreview` render `meta.soConToLon`; `quote-pdf.service` đọc `meta.soConToLon`; một ca end-to-end đối chiếu giá/preview/PDF cùng số con
    - _Requirements: 2.3, 2.4, 10.2, 10.3, 10.5_

- [x] 12. Cổng kiểm chứng nghiệp vụ ±2%
  - [x] 12.1 Dựng harness `__tests__/business-validation.gate.spec.ts`
    - 5–10 ca báo giá xưởng thật (input + giá thật); so `khachTra` (unified) với giá thật; `|Δ%| ≤ 2%` → đạt, vượt → đánh dấu `review`
    - Ghi bảng kết quả (sản phẩm, khổ, giá thật, giá mới, %Δ)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 13. Re-baseline golden có giải trình (flip sang unified)
  - [x] 13.1 Cập nhật golden + giải trình khi flip `ImpositionSource='unified'`
    - Xác nhận golden xanh với `legacy` trước khi flip (hành vi giá không đổi)
    - Cập nhật `GOLDEN` trong `offset-price-preservation.golden.spec.ts` bằng số tính lại; giữ `PRECISION=6` (không nới tolerance); thêm bảng giải trình từng giá đổi trong mô tả test
    - Chạy lại các property suite hiện có (`totals.property`, `lookups.property`, `vat.property`, cascade) ở nguyên số vòng/tolerance
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test sub-tasks) and can be skipped for faster MVP, nhưng property tests phủ vùng tới hạn về giá nên được khuyến nghị mạnh.
- Lộ trney an toàn: build với `ImpositionSource='legacy'` (mặc định) → golden xanh, giá live không đổi; bật Shadow để đối chiếu; chạy Business_Validation_Gate; chỉ flip `unified` qua cấu hình (không redeploy); rollback bằng cấu hình.
- Mỗi correctness property được cài bằng đúng một property-based test, gắn comment `// Feature: offset-imposition-gripper-unification, Property {n}: ...`, fast-check ≥100 vòng.
- Imposition_Service là hàm thuần, không gọi trực tiếp `dieline/nesting.ts`; preview/PDF lấy số con từ `meta`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.5", "2.6", "2.7", "2.8", "5.1"] },
    { "id": 3, "tasks": ["4.1", "5.2"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["6.4", "7.1", "8.1", "10.1", "11.1", "11.2", "12.1"] },
    { "id": 6, "tasks": ["7.2", "8.2", "10.2", "10.3", "11.3", "13.1"] }
  ]
}
```
