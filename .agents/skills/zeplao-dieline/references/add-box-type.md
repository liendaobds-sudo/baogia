# Thêm loại hộp mới

Không thêm chỉ bằng một option UI. Trước hết cần mẫu khuôn hoặc quy tắc hình học đã được xác nhận, kích thước lọt lòng, độ dày, mí dán, dung sai và giới hạn sản xuất.

## Điểm tích hợp

1. backend/src/modules/pricing/dieline/types.ts
   - Mở rộng BoxParams.boxType và tham số riêng nếu có.
   - Ghi đơn vị và default; tránh magic number không tên.
2. Generator mới trong backend/src/modules/pricing/dieline/
   - Trả DielineModel hợp lệ, warnings rõ.
   - Dùng helper/constants chung khi đúng nghĩa.
3. backend/src/modules/pricing/dieline/flat-dieline.ts
   - Đăng ký trong GENERATORS; SUPPORTED_BOX_TYPES được suy từ registry.
4. backend/src/modules/pricing/dieline/index.ts
   - Export contract cần dùng ngoài module.
5. backend/src/modules/pricing/controllers/offset.controller.ts
   - Cập nhật label của endpoint GET /pricing/offset/dieline/types.
   - Kiểm validation và endpoint dieline/nesting; không giả định endpoint types đã có frontend consumer.
6. backend/src/modules/pricing/offset-engine/products/hop-giay.ts
   - Xác minh flat size, nesting, So_Con và conversion input cm → BoxParams mm.
7. Product config/whitelist
   - allowedBoxTypes phải đi trọn save → load → form filtering → backend enforcement.
   - Kiểm sanitizer saveProductConfig thực sự giữ field allowedBoxTypes; thiếu/rỗng hiện có thể mang ngữ nghĩa khác giữa settings, configurator và engine.
8. Frontend
   - Cập nhật cả BOX_TYPE_OPTS trong OffsetQuoteConfigurator.tsx và BOX_TYPES trong settings/offset-products/page.tsx, hoặc hợp nhất chúng về registry/API canonical trong một task được duyệt.
   - Kiểm form field, DielinePreview payload, label và edit hydrate.
9. BoxParams parity
   - So field-by-field giữa builder trong hop-giay.ts, endpoint offset.controller.ts và body do DielinePreview.tsx gửi.
   - Param riêng/thickness/default của loại mới phải giống nhau hoặc khác có chủ đích và có test.

## Test

- Cấu trúc generator: bbox dương, path hữu hạn, CUT/CREASE và tham số biên.
- backend/src/modules/pricing/dieline/__tests__/flat-dieline.spec.ts.
- Nesting trên khổ vừa, khổ không vừa, xoay và margin/gripper.
- hop_giay + price-preservation khi mục tiêu không đổi số; nếu số chủ đích đổi, đối chiếu báo giá thật. Chạy cả ImpositionSource legacy/unified.
- Controller nhận đủ param, trả label/model/nesting đúng.
- frontend/src/app/pricing/quotes/_components/DielinePreview.spec.tsx và OffsetQuoteConfigurator spec phải chọn option mới, kiểm payload chứ không chỉ kiểm label.
- Config whitelist có save/load round-trip, case được phép, bị chặn và render đúng.
- Order replay, edit hydrate và PDF giữ đúng boxType/printing_detail.

Chỉ gọi hoàn thành khi generator, endpoint, engine giá, UI và test đều biết loại mới. Nếu chưa có mẫu hình học được xác nhận, tạo thiết kế/placeholder yêu cầu chứ không dựng theo trí nhớ.
