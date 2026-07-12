# Implementation Plan: Resource Scope Config

## Overview

Triển khai một Quy_Tắc_Phạm_Vi thuần (pure function) làm nguồn sự thật duy nhất để phân loại Tài_Nguyên_Dùng_Chung (`processing_options`, `materials`, `paper_sizes`) theo Phạm_Vi (`offset`, `loose`, `bound`, `large_format`). Cách tiếp cận: dựng module canonical ở backend trước, mirror sang frontend, khoá chống-lệch bằng vector dùng chung, rồi nối vào các endpoint erp/master-data và hai màn UI (ProductModal, ScopeAdminScreen). Ngôn ngữ: TypeScript (NestJS backend + Next.js frontend), khớp codebase và pseudocode TypeScript trong design. KHÔNG đổi schema; bảo toàn giá offset đang đúng.

## Tasks

- [x] 1. Dựng module canonical Quy_Tắc_Phạm_Vi (backend, pure)
  - [x] 1.1 Tạo module và các hàm phân loại cốt lõi
    - Tạo `backend/src/modules/pricing/scope/resource-scope-rule.ts`
    - Định nghĩa types `Scope`, `ProductType`, `ScopeFlags`, `ScopedResource`
    - Implement `isOn`, `isActive`, `resourceInScope`, `isOffsetOnly`, `classifyResource`, `deriveScopeLabel` (hàm thuần, không phụ thuộc TypeORM)
    - _Requirements: 1.1, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.6, 5.4, 6.2, 6.3, 6.6, 6.7_

  - [x]* 1.2 Viết property test cho isOn
    - **Property 1: Chuẩn hoá Bật/Tắt của Cờ_Phạm_Vi**
    - **Validates: Requirements 2.1, 6.2**
    - File `resource-scope-rule.isOn.property.spec.ts`; fast-check ≥ 200 iteration; tag `Feature: resource-scope-config, Property 1`

  - [x]* 1.3 Viết property test cho resourceInScope
    - **Property 2: Thuộc Phạm_Vi khi và chỉ khi cờ tương ứng Bật**
    - **Validates: Requirements 1.1, 1.7, 2.2, 2.3, 2.4, 2.5, 6.3, 6.6, 6.7**
    - File `resource-scope-rule.in-scope.property.spec.ts`; generator cờ từ `fc.constantFrom(0,1,true,false,null,undefined)`

  - [x]* 1.4 Viết property test cho classifyResource
    - **Property 3: classifyResource trả về đúng tập các phạm vi đang Bật**
    - **Validates: Requirements 2.7, 2.8, 6.7**
    - File `resource-scope-rule.classify.property.spec.ts`

  - [x]* 1.5 Viết property test cho isOffsetOnly
    - **Property 4: Định nghĩa Tài_Nguyên_Chỉ_Offset**
    - **Validates: Requirements 2.6**
    - File `resource-scope-rule.offset-only.property.spec.ts`

  - [x]* 1.6 Viết property test cho tính group-agnostic
    - **Property 7: Quy_Tắc_Phạm_Vi bất biến theo kiểu cờ (smallint vs boolean)**
    - **Validates: Requirements 1.6**
    - File `resource-scope-rule.group-agnostic.property.spec.ts`; so khớp classify giữa biểu diễn 0/1 và false/true

- [x] 2. Hàm lọc và validate dùng chung (build trên module 1.1)
  - [x] 2.1 Implement filterForProductType
    - Thêm `filterForProductType<T extends ScopedResource>(resources, productType)` vào `resource-scope-rule.ts`
    - Giữ lại r ⇔ `isActive(r) && resourceInScope(r, productType)` (loại Chỉ-Offset và is_active≠1 tự nhiên)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_

  - [x]* 2.2 Viết property test cho filterForProductType
    - **Property 5: Lọc theo Loại_Sản_Phẩm chỉ giữ tài nguyên trong phạm vi và đang hoạt động**
    - **Validates: Requirements 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2**
    - File `resource-scope-rule.filter.property.spec.ts`

  - [x]* 2.3 Viết property test cho parity giữa Màn_Cài_Đặt và Màn_Báo_Giá
    - **Property 6: Màn_Cài_Đặt và Màn_Báo_Giá cho tập trùng khớp**
    - **Validates: Requirements 1.2**
    - File `resource-scope-rule.screen-parity.property.spec.ts`

  - [x] 2.4 Implement validateAllowedList
    - Thêm `validateAllowedList(allowed, resourcesById, productType)` trả `{ ok, outOfScope }` không mutate input
    - _Requirements: 4.3, 4.4, 4.5_

  - [x]* 2.5 Viết property test cho validateAllowedList
    - **Property 8: Validate Danh_Sách_Được_Phép xác định đúng phần tử ngoài phạm vi**
    - **Validates: Requirements 4.3, 4.4, 4.5**
    - File `validate-allowed-list.property.spec.ts`

  - [x] 2.6 Implement validateScopeFlags
    - Thêm `validateScopeFlags(input)` trả `{ ok, invalidFlags }`; hợp lệ khi 3 cờ smallint ∈ {0,1} và scope_offset ∈ {true,false} (hoặc vắng mặt)
    - _Requirements: 5.8, 6.2_

  - [x]* 2.7 Viết property test cho validateScopeFlags
    - **Property 9: Validate giá trị Cờ_Phạm_Vi đầu vào**
    - **Validates: Requirements 5.8, 6.2**
    - File `validate-scope-flags.property.spec.ts`

- [x] 3. Mirror frontend và vector chống-lệch
  - [x] 3.1 Tạo file vector dùng chung
    - Tạo `scope-rule-vectors.json` (danh sách `{ flags, expectedScopes, expectedOffsetOnly }`), commit ở cả backend và frontend
    - _Requirements: 1.1, 1.2_

  - [x] 3.2 Implement mirror frontend
    - Tạo `frontend/src/lib/scope/resource-scope.ts` — sao chép giống hệt từng dòng các hàm thuần (isOn, isActive, resourceInScope, isOffsetOnly, classifyResource, deriveScopeLabel, filterForProductType, validateAllowedList, validateScopeFlags)
    - _Requirements: 1.1, 1.2, 1.6, 2.1, 2.6, 4.3, 5.4_

  - [x]* 3.3 Viết parity test hai phía qua vector
    - **Property 10: Quy tắc backend và frontend không lệch nhau (drift guard)**
    - **Validates: Requirements 1.1, 1.2**
    - File `resource-scope-parity.property.spec.ts` ở cả backend và frontend; chạy toàn bộ `scope-rule-vectors.json` qua canonical và mirror, khẳng định classify + isOffsetOnly trùng khớp

- [x] 4. Checkpoint - Đảm bảo module quy tắc và mirror ổn định
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Hợp nhất nguồn đọc backend qua Quy_Tắc_Phạm_Vi
  - [x] 5.1 Thêm lọc scope/activeOnly cho endpoint processing-options
    - Sửa `materials.controller.ts` (`findAll`) + `MaterialsService.findAllProcessingOptions` nhận `ScopeListQuery { scope?, activeOnly? }`; lọc qua `filterForProductType`/`resourceInScope`; không scope = tương thích ngược (trả tất cả)
    - _Requirements: 1.3, 1.4, 3.1, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_

  - [x] 5.2 Thêm lọc scope/activeOnly cho endpoint materials và paper-sizes
    - Áp dụng cùng `ScopeListQuery` và lọc qua canonical rule cho GET `/erp/materials` và GET `/erp/paper-sizes`
    - _Requirements: 1.3, 1.4, 1.6, 3.1, 3.6, 4.1, 4.2_

  - [x] 5.3 Refactor PricingFacadeService.getMasterData dùng canonical rule
    - Thay raw SQL `NOT (scope_offset = true AND ...)` trong `pricing-facade.service.ts` bằng lời gọi `filterForProductType`/`resourceInScope`; giữ điều kiện `is_active = 1` và offset `scope_offset = true` (Postgres)
    - _Requirements: 1.2, 3.1, 3.2, 6.1, 6.3, 6.4_

  - [x]* 5.4 Viết integration test một-nguồn-sự-thật cho master-data vs erp
    - Khẳng định `master-data` và `/erp/processing-options?scope=loose` trả cùng tập tài nguyên
    - _Requirements: 1.2, 3.1_

- [x] 6. Endpoint PATCH scope (Màn_Quản_Trị_Phạm_Vi)
  - [x] 6.1 Thêm PATCH /erp/{resource}/:id/scope cho ba nhóm
    - Thêm `UpdateScopeDto`; gọi `validateScopeFlags` trước khi ghi; 422 + `invalidFlags` nếu không hợp lệ (giữ giá trị cũ); trả tài nguyên sau cập nhật + `deriveScopeLabel`
    - _Requirements: 5.1, 5.2, 5.5, 5.8, 6.2_

  - [x]* 6.2 Viết integration test cho PATCH scope
    - PATCH invalid → 422 giữ giá trị cũ; PATCH valid → GET lần kế tiếp phản ánh giá trị mới
    - _Requirements: 1.8, 5.2, 5.3, 5.7, 5.8_

- [x] 7. Validate lưu sản phẩm theo phạm vi (POST/PUT /erp/products)
  - [x] 7.1 Gắn validateAllowedList vào luồng lưu sản phẩm
    - Trước khi lưu, validate `allowed_processing`/`allowed_materials`/`allowed_paper_sizes` theo `quote_type`; nếu có phần tử ngoài phạm vi → 422 + danh sách vi phạm, KHÔNG ghi
    - _Requirements: 4.4, 4.5_

  - [x]* 7.2 Viết integration test cho validate lưu sản phẩm
    - allowed sạch → lưu thành công; allowed có phần tử ngoài phạm vi → 422 + danh sách `outOfScope`, dữ liệu không đổi
    - _Requirements: 4.4, 4.5_

- [x] 8. Checkpoint - Đảm bảo backend tích hợp đầy đủ
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend — Màn_Cài_Đặt_Sản_Phẩm (ProductModal)
  - [x] 9.1 Thay vá tạm scopedProcessing bằng filterForProductType
    - Trong `frontend/src/app/pricing/products/ProductModal.tsx`: bỏ useMemo `scopedProcessing`; dùng `filterForProductType(processing, form.quote_type)` (áp dụng tương tự materials/paper_sizes); cập nhật danh sách ngay khi đổi `quote_type`
    - _Requirements: 1.2, 1.3, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2_

  - [x] 9.2 Đánh dấu ngoài phạm vi và chặn lưu
    - Dùng `validateAllowedList` để hiển thị badge "ngoài phạm vi" + thông báo cho phần tử trong `allowed_*` vi phạm; chặn lưu khi còn vi phạm, hiển thị lỗi nêu tên tài nguyên
    - _Requirements: 4.3, 4.5_

  - [x]* 9.3 Viết unit test cho ProductModal
    - Render danh sách từ `filterForProductType`; badge ngoài phạm vi; chặn lưu khi vi phạm
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 10. Frontend — Màn_Quản_Trị_Phạm_Vi (ScopeAdminScreen)
  - [x] 10.1 Tạo màn quản trị gán cờ phạm vi
    - Tạo `ScopeAdminScreen` (mới): bảng 3 nhóm tài nguyên + cờ hiện tại + nhãn `deriveScopeLabel`; sửa cờ gọi `PATCH .../:id/scope`; xác nhận lưu thành công trong 3s
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 10.2 Cảnh báo tắt-hết-cờ và xử lý lỗi lưu
    - Cảnh báo + yêu cầu xác nhận khi lưu tài nguyên tắt hết cờ; toast lỗi giữ nguyên giá trị cũ khi PATCH thất bại; chặn gửi khi giá trị cờ không hợp lệ
    - _Requirements: 5.6, 5.7, 5.8_

  - [x]* 10.3 Viết unit test cho ScopeAdminScreen
    - Render cờ + nhãn; confirm khi tắt-hết-cờ; toast giữ giá trị cũ khi lỗi; áp dụng giá trị mới ở lần tải kế tiếp
    - _Requirements: 1.8, 5.3, 5.4, 5.6, 5.7_

- [x] 11. Bảo toàn giá Offset (golden test)
  - [x]* 11.1 Viết golden test bảo toàn giá Offset
    - **Property 11: Bảo toàn giá Offset sau khi áp dụng phân loại**
    - **Validates: Requirements 6.5**
    - File `offset-price-preservation.golden.spec.ts`; chạy engine offset trước/sau tích hợp trên tập input cố định, khẳng định chênh lệch giá = 0

- [x] 12. Final checkpoint - Đảm bảo toàn bộ test pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Các task gắn `*` là optional (test) và có thể bỏ qua khi cần MVP nhanh, nhưng vẫn nằm trong dependency graph.
- Mỗi property của design (P1–P11) là một sub-task riêng, gắn số property và requirements clause tương ứng để truy vết.
- Property test đặt sát task implement tương ứng để bắt lỗi sớm.
- Golden test (P11) dùng input cố định, không chạy nhiều iteration — cơ chế canh không-hồi-quy cho cam kết bảo toàn giá offset.
- KHÔNG đổi schema; chỉ dùng các cờ `scope_*` và `is_active` đã tồn tại.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "2.1", "2.4", "2.6", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "2.7", "3.2"] },
    { "id": 3, "tasks": ["3.3", "5.1", "5.2", "5.3", "6.1", "7.1", "9.1", "10.1"] },
    { "id": 4, "tasks": ["5.4", "6.2", "7.2", "9.2", "10.2", "11.1"] },
    { "id": 5, "tasks": ["9.3", "10.3"] }
  ]
}
```
