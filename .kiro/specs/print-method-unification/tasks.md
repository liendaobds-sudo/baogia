# Implementation Plan: Hợp nhất Phương pháp in (Print Method Unification)

## Overview

Kế hoạch triển khai bám sát thiết kế 4 tầng (Sản phẩm / Thông số / Phương pháp in / Giá) và lộ trình 4 phase. Nguyên tắc xuyên suốt: **bọc hai engine hiện hữu** (`PricingFacadeService` digital, `EngineOffsetService` offset) thành Method Plugin, **không sửa số học**, mọi tham số giá đọc từ cấu hình, VAT áp một lần ở tầng báo giá.

Stack: TypeScript — backend NestJS (`backend/src`), frontend Next.js (`frontend/src`). Property test dùng `fast-check` (đã có trong `frontend/src/lib/scope/*.spec.ts` và `offset-engine/__tests__/*.property.spec.ts`); golden test mở rộng từ `offset-engine/__tests__/`.

Mỗi task xây trên task trước và kết thúc bằng việc wiring vào hệ; không để code mồ côi.

## Tasks

- [x] 1. Nền tảng tầng method-agnostic (interface + registry)
  - [x] 1.1 Định nghĩa các kiểu hợp đồng MethodPlugin
    - Tạo `backend/src/quote/types/method-plugin.types.ts` với `MethodId`, `ProductRef`, `Specification`, `PricingConfigView`, `PriceResult`, interface `MethodPlugin` đúng như Design (Components and Interfaces)
    - Không phụ thuộc engine cụ thể; `PriceResult` mang `priceBeforeVat` (VAT để tầng báo giá áp)
    - _Requirements: 3.3, 1.5, 3.6_

  - [x] 1.2 Hiện thực MethodRegistry
    - Tạo `backend/src/quote/method-registry.service.ts`: `register(plugin)`, `getPlugin(methodId)`, `appliesTo(methodId, product, spec)`, `listMethodIds()`
    - Đăng ký plugin theo `methodId ∈ {digital, offset}`, mở rộng được; ném lỗi rõ khi `methodId` chưa đăng ký
    - _Requirements: 1.5, 3.6, 4.6_

  - [x]* 1.3 Viết unit test cho MethodRegistry
    - Test đăng ký/tra cứu plugin, lỗi khi method chưa đăng ký, `appliesTo` định tuyến đúng
    - _Requirements: 1.5, 4.6_

- [x] 2. Cờ Năng lực sản xuất (CapabilityService) — Phase 1
  - [x] 2.1 Tạo bảng và entity method_capabilities
    - Thêm migration `backend/migrations/method_capabilities.sql` đúng lược đồ Design (UNIQUE (unit_id, method_id), default `enabled=false`)
    - Tạo entity `backend/src/entities/method-capability.entity.ts` và đăng ký trong `entities/index.ts`
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Hiện thực CapabilityService
    - Tạo `backend/src/quote/capability.service.ts`: `getEnabledMethods(unitId)`, `isEnabled(unitId, methodId)`, `setFlag(unitId, methodId, enabled)`, `listFlags(unitId)`
    - `unitId` mặc định `'default'`; mặc định chưa có bản ghi ⇒ `enabled=false` (Đơn_Vị 0-phương-pháp hợp lệ)
    - `setFlag(..., false)` ném `LastEnabledMethodError` nếu đó là phương pháp khả dụng cuối cùng của Đơn_Vị đã có ≥1 phương pháp
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8_

  - [x]* 2.3 Viết property test cho toggle round-trip
    - **Property 1: Toggle capability round-trip**
    - **Validates: Requirements 1.2, 1.3**

  - [x]* 2.4 Viết property test cho tính duy nhất trạng thái
    - **Property 2: Đúng một trạng thái cho mỗi cặp (Đơn_Vị, Phương_Pháp)**
    - **Validates: Requirements 1.1**

  - [x]* 2.5 Viết property test cho ràng buộc phương pháp cuối cùng
    - **Property 3: Không tắt được phương pháp khả dụng cuối cùng**
    - **Validates: Requirements 1.6**

  - [x]* 2.6 Viết unit test cho biên cấu hình Đơn_Vị
    - Test Đơn_Vị 0-phương-pháp không vướng ràng buộc cuối cùng; ba cấu hình chỉ-digital / chỉ-offset / cả-hai
    - _Requirements: 1.4, 1.7_

- [x] 3. API năng lực và wiring QuoteModule — Phase 1
  - [x] 3.1 Tạo QuoteController + QuoteModule với endpoint năng lực
    - Tạo `backend/src/quote/quote.module.ts` và `backend/src/quote/quote.controller.ts`
    - `GET /quote/capabilities` (liệt kê cờ + tập khả dụng), `PUT /quote/capabilities/:methodId` (admin bật/tắt)
    - Map `LastEnabledMethodError` → HTTP 409 với thông báo rõ; DTO validate input
    - Đăng ký QuoteModule trong `backend/src/app.module.ts`
    - _Requirements: 1.2, 1.3, 1.6, 1.8, 2.1_

  - [x]* 3.2 Viết integration test cho endpoint năng lực
    - Test GET/PUT end-to-end với DB seed; xác nhận 409 khi tắt phương pháp cuối
    - _Requirements: 1.6, 1.8_

- [x] 4. IA phản ứng theo Cờ Năng lực (frontend) — Phase 1
  - [x] 4.1 Bổ sung trường method vào Scope Registry
    - Thêm trường tuỳ chọn `method?: MethodId` cho mục nav trong `frontend/src/lib/scope/` và hàm `methodOfNavItem(navItem)`
    - Không tạo cơ chế ẩn menu mới; tái dùng `resolveMenu()`
    - _Requirements: 2.3_

  - [x] 4.2 Hiện thực filterMenuByCapability
    - Thêm `filterMenuByCapability(items, enabledMethods, methodOfNavItem)` chạy sau `resolveMenu()` như Design
    - Giữ nguyên mục không gắn method; loại mục có method ngoài tập khả dụng
    - _Requirements: 2.1, 2.2, 2.6_

  - [x]* 4.3 Viết property test cho lọc menu theo năng lực
    - **Property 4: Menu suy dẫn chỉ chứa phương pháp khả dụng**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.4 Hiện thực route guard theo method
    - Thêm `isMethodRoute(path) → MethodId | null` và logic guard: cho phép khi method thuộc tập khả dụng, ngược lại quyết định redirect về Cổng_Tạo_Báo_Giá
    - Tái dùng mẫu `isFrozenRoute`
    - _Requirements: 2.4, 2.5_

  - [x]* 4.5 Viết property test cho route guard
    - **Property 5: Chặn truy cập route phương pháp không khả dụng**
    - **Validates: Requirements 2.4, 2.5**

  - [x] 4.6 Kết nối menu + guard với dữ liệu năng lực
    - Gọi `GET /quote/capabilities` để lấy `enabledMethods`, truyền vào `filterMenuByCapability` và guard ở layout điều hướng
    - _Requirements: 2.1, 2.2, 2.6_

- [x] 5. Checkpoint — Phase 1 giao được
  - Ensure all tests pass, ask the user if questions arise.
  - Xác nhận Đơn_Vị chỉ thấy phương pháp được bật; luồng báo giá cũ vẫn chạy (Req 9.3, 9.4)

- [x] 6. Bọc engine thành Method Plugin — Phase 2
  - [x] 6.1 Hiện thực DigitalMethodPlugin
    - Tạo `backend/src/quote/plugins/digital-method.plugin.ts` bọc `PricingFacadeService.calculatePrice`
    - Ánh xạ `Specification` → `CalculatePriceInput`; tách VAT: lấy `selling_subtotal`/`cost_subtotal`, đặt `priceBeforeVat` trước VAT; KHÔNG đổi số học markup/giá vốn
    - `appliesTo`: `quoteType ∈ {loose, bound, large_format}`; đọc tham số từ config (chiết khấu key `discount_rate`)
    - Đăng ký vào MethodRegistry
    - _Requirements: 6.1, 6.2, 7.2, 8.4_

  - [x] 6.2 Hiện thực OffsetMethodPlugin
    - Tạo `backend/src/quote/plugins/offset-method.plugin.ts` bọc `EngineOffsetService.calculate`
    - Ánh xạ `Specification` → 1 trong 5 input theo `quoteType`; lấy `tongChuaVAT` làm `priceBeforeVat`; truyền `vatRate=0` ở chế độ hợp nhất, giữ hành vi cũ khi gọi trực tiếp `/pricing/offset/calculate`
    - `appliesTo`: 5 loại; trả `false`+lý do khi thiếu tham số/ngoài whitelist `productConfig`; chuyển `OffsetPricingError` → `ok:false`+lý do
    - Đăng ký vào MethodRegistry
    - _Requirements: 6.1, 6.2, 5.5, 7.2_

  - [x]* 6.3 Viết golden test bảo toàn giá (zero-tolerance)
    - **Property 8: Bảo toàn giá khi bọc engine (zero-tolerance trên golden)**
    - **Validates: Requirements 6.1, 6.2, 9.5**

  - [x]* 6.4 Viết property test cho đọc tham số từ cấu hình
    - **Property 13: Tham số giá đọc từ cấu hình**
    - **Validates: Requirements 7.2, 7.3**

  - [x]* 6.5 Viết property test cho tài nguyên dùng chung
    - **Property 14: Tài nguyên dùng chung phản ánh cho mọi plugin**
    - **Validates: Requirements 3.4, 3.5**

  - [x]* 6.6 Viết unit test ánh xạ Specification → input từng plugin
    - Test ánh xạ digital và offset, edge case dimension/quantity, giá trị ngoài whitelist
    - _Requirements: 3.2, 5.5_

- [x] 7. Cổng tạo báo giá hợp nhất — Phase 2
  - [x] 7.1 Thêm endpoint định tuyến tính giá
    - Mở rộng `quote.controller.ts`: `GET /quote/methods?productCode=` (phương pháp khả dụng & áp dụng được), `POST /quote/calculate` (định tuyến 1 phương pháp qua MethodRegistry)
    - Chặn truy cập phương pháp không khả dụng (giao CapabilityService) trước khi gọi plugin
    - _Requirements: 4.3, 4.6, 4.7, 6.1_

  - [x]* 7.2 Viết property test entry point chỉ cho chọn phương pháp khả dụng
    - **Property 7: Entry point chỉ cho chọn phương pháp khả dụng**
    - **Validates: Requirements 4.7**

  - [x] 7.3 Hiện thực luồng Cổng tạo báo giá (frontend)
    - Tạo trang Cổng_Tạo_Báo_Giá: chọn Sản_Phẩm trước → gọi `GET /quote/methods` → áp logic định tuyến: 1 phương pháp ⇒ vào thẳng Configurator; ≥2 ⇒ bắt chọn method hoặc so sánh; 0 ⇒ thông báo
    - Cho phép trạng thái chưa chọn (Req 4.3); hiển thị đúng Configurator theo method đã chọn
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x]* 7.4 Viết property test định tuyến entry point
    - **Property 6: Định tuyến entry point theo số phương pháp khả dụng**
    - **Validates: Requirements 4.4, 4.5**

  - [x]* 7.5 Viết integration test cho /quote/calculate
    - Test wiring end-to-end qua MethodRegistry tới engine thật (digital + offset) với DB seed; xác nhận `/pricing/calculate` và `/pricing/offset/calculate` cũ vẫn hoạt động
    - _Requirements: 4.6, 6.1, 9.3, 9.4_

- [x] 8. Checkpoint — Phase 2 giao được
  - Ensure all tests pass, ask the user if questions arise.
  - Xác nhận một entry point định tuyến đúng tới Configurator hiện có

- [x] 9. Hợp nhất mô hình sản phẩm — Phase 3
  - [x] 9.1 Đưa 5 loại offset vào unified_products
    - Thêm migration/seed `backend/migrations/unified_products_offset.sql` cho `to_roi, bi_thu_folder, sp_khac, hop_giay, tui_giay` với `quoteType` tương ứng
    - `allowed_materials/allowed_paper_sizes/allowed_processing` trỏ tới Tài_Nguyên_Dùng_Chung; KHÔNG thêm trường khoá-engine vào sản phẩm
    - _Requirements: 3.1, 3.4, 9.1, 9.5_

  - [x]* 9.2 Viết test xác minh di trú Phase 3
    - Test 5 loại offset đã vào `unified_products` và giá qua catalog method-agnostic khớp golden offset (zero-tolerance)
    - _Requirements: 9.5, 9.6_

- [x] 10. So sánh giá đa phương pháp và điểm hoà vốn — Phase 4
  - [x] 10.1 Hiện thực ComparatorService
    - Tạo `backend/src/quote/comparator.service.ts`: tính giá đa phương pháp trên cùng một bộ Thông_Số; chọn phương pháp `priceBeforeVat` nhỏ nhất; loại phương pháp `ok:false` kèm lý do, vẫn giữ phần còn lại; nếu chỉ 1 phương pháp áp dụng ⇒ trả giá đơn (không bảng so sánh)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

  - [x]* 10.2 Viết property test so sánh dùng chung Thông số
    - **Property 9: So sánh dùng chung một bộ Thông số**
    - **Validates: Requirements 5.4**

  - [x]* 10.3 Viết property test chọn phương pháp rẻ hơn và loại phương pháp lỗi
    - **Property 10: Comparator chọn đúng phương pháp rẻ hơn và loại phương pháp lỗi**
    - **Validates: Requirements 5.2, 5.5**

  - [x] 10.4 Hiện thực dò điểm hoà vốn
    - Bổ sung tính `Điểm_Hoà_Vốn q*` trên dải số lượng cho cặp phương pháp; báo "không có điểm hoà vốn" khi không đảo chiều trong dải
    - _Requirements: 5.3_

  - [x]* 10.5 Viết property test tính đúng điểm hoà vốn
    - **Property 11: Tính đúng điểm hoà vốn**
    - **Validates: Requirements 5.3**

  - [x] 10.6 Áp VAT cấp báo giá
    - Hiện thực mô hình VAT cấp báo giá: `vatAmount = round((Σ priceBeforeVat) × vat_rate)`, `grandTotal = Σ priceBeforeVat + vatAmount`; VAT lưu ở mục khách hàng, áp một lần cho mọi dòng/phương pháp
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x]* 10.7 Viết property test VAT áp một lần
    - **Property 12: VAT áp đúng một lần trên giá sau chiết khấu**
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 11. Wiring so sánh giá + UI — Phase 4
  - [x] 11.1 Thêm endpoint /quote/compare
    - Mở rộng `quote.controller.ts`: `POST /quote/compare` gọi ComparatorService; trả bảng so sánh + break-even + VAT cấp báo giá
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 8.3_

  - [x] 11.2 Hiện thực Price Comparator UI (frontend)
    - Bảng so sánh giá đa phương pháp, đánh dấu phương án rẻ hơn theo số lượng, hiển thị điểm hoà vốn; nêu lý do phương pháp bị loại; trường VAT ở mục khách hàng
    - Kết nối từ Cổng_Tạo_Báo_Giá khi NV chọn chế độ so sánh
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 8.1_

  - [x]* 11.3 Viết integration test cho /quote/compare
    - Test end-to-end so sánh digital vs offset trên cùng Thông_Số với DB seed; xác nhận VAT áp một lần
    - _Requirements: 5.1, 8.4_

- [x] 12. Checkpoint cuối — Phase 4 giao được
  - Ensure all tests pass, ask the user if questions arise.
  - Xác nhận bảng so sánh + break-even hoạt động; toàn bộ golden test zero-tolerance vẫn đạt; route báo giá cũ còn nguyên

## Notes

- Tasks đánh dấu `*` là tùy chọn (test) và có thể bỏ qua để có MVP nhanh hơn; task cốt lõi không bao giờ bị đánh dấu `*`.
- Mỗi task tham chiếu sub-requirement cụ thể để truy vết.
- Checkpoint đặt ở cuối mỗi phase để bảo đảm mỗi phase giao được độc lập (Req 9.3) và luồng cũ vẫn chạy (Req 9.4).
- Mỗi correctness property hiện thực bằng **một** property-based test, tối thiểu 100 iteration, gắn tag `Feature: print-method-unification, Property {n}`.
- Golden test (Property 8) giữ zero-tolerance; thất bại ngoài dự kiến chặn phát hành (Req 6.3, 6.4) — thực thi ở tầng CI.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "4.2", "4.4"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6", "3.1", "4.3", "4.5", "6.1", "6.2"] },
    { "id": 3, "tasks": ["3.2", "4.6", "6.3", "6.4", "6.5", "6.6", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "9.1", "10.1", "10.4", "10.6"] },
    { "id": 5, "tasks": ["7.4", "7.5", "9.2", "10.2", "10.3", "10.5", "10.7", "11.1"] },
    { "id": 6, "tasks": ["11.2"] },
    { "id": 7, "tasks": ["11.3"] }
  ]
}
```
