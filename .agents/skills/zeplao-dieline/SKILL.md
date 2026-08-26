---
name: zeplao-dieline
description: "Bất biến khuôn bế và bình bài ZeplaoPrint: DielineModel, CUT/CREASE/BLEED, box generator, flat size, nesting, gripper/gutter, So_Con và preview SVG. Dùng khi sửa backend/src/modules/pricing/dieline, offset imposition hoặc frontend preview hình học. Không áp dụng cho 3D/Rust/sidecar."
---

# Dieline và imposition ZeplaoPrint

Nguồn hình học nằm ở backend/src/modules/pricing/dieline/. Kết quả này nối trực tiếp vào hop_giay, tính số con/tờ, endpoint preview và frontend DielinePreview/OffsetPreviewSVG.

## Hợp đồng hình học

- DielineModel gồm panels, allPaths, boundingBox, params và warnings.
- PathSegment dùng CUT, CREASE hoặc BLEED; line/arc/bezier.
- Dieline và BoxParams dùng mm. Offset pricebook thường nhập kích thước cm và đổi ×10 tại biên.
- boundingBox phải bao mọi path thực; không dùng fixture bbox phi thực tế để khóa hành vi sai.
- Không trả NaN/Infinity, panel rỗng hoặc segment suy biến ở input biên.
- CUT ngoài phải nối kín theo test connectivity/tolerance được viết cho generator; CREASE phải gắn với biên/pivot có nghĩa. File validateParams.ts hiện không đủ để chứng minh topology và có thể chưa nằm trên đường gọi, nên không được viện tên file validator làm bằng chứng.
- Với bezier, endpoints trong points và controlPoints phải nhất quán.
- warnings dành cho rủi ro sản xuất; lỗi input/hình học không thể tính phải fail có mô tả.

Mockup3d, foldPhase, Rust parity và build sidecar không thuộc kiến trúc dự án này.

## Imposition và preview

- Kết quả So_Con cuối của price flow đi qua backend/src/modules/pricing/offset-engine/imposition-selector.ts, nhưng hop_giay còn tính dieline nesting/fallback ở thượng nguồn. Trace cả hai trước khi nói có một nguồn duy nhất.
- Unified imposition mô hình lề, gripper và gutter; geometry invalid hoặc So_Con = 0 phải fail, không âm thầm fallback legacy khi unified là nguồn đang chọn.
- Shadow mode chỉ đo chênh lệch, không đổi giá của source hiện hành.
- Tăng margin/gripper/gutter không được làm tăng số con; thử cả hai hướng xoay và giữ kết quả deterministic.
- positions/marginConfig trong meta là nguồn ưu tiên cho OffsetPreviewSVG. Khi có positions, frontend vẽ trực tiếp; không dàn lại.
- DielinePreview gọi endpoint /pricing/offset/dieline theo một payload riêng và tự nhận model/nesting riêng. Nó không mặc nhiên dùng cùng BoxParams hay positions với price flow. Đối chiếu field-by-field, số con, khổ và vị trí trước khi tuyên bố parity với engine/PDF.
- Với khuôn không lọt khổ, kiểm hành vi hiện tại ở cả legacy/unified và fallback trong hop_giay. Không mặc định rectangle/static fallback hay giá 0 là hợp lệ; chốt business outcome rồi khóa bằng test.

## Khi sửa

1. Đo model/flat size/nesting thực tế trên một case chuẩn và case biên.
2. Tách rõ thay đổi generator, imposition hay visual fallback.
3. Giữ conversion cm↔mm ở seam hiện có và kiểm thứ tự phép float tại ranh giới vừa khít.
4. Chạy flat-dieline/nesting/imposition property test, hop-giay test và frontend preview spec; bổ sung negative case NaN/zero/segment suy biến/bbox/CUT connectivity khi thay generator.
5. Nếu thay đổi làm lệch giá, dùng zeplao-pricing và xem golden trước khi chấp nhận delta.

Đọc references/add-box-type.md khi thêm box type mới.
