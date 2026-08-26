---
name: zeplao-pricing
description: "Làm việc an toàn với báo giá ZeplaoPrint: digital, offset, large-format, VAT, chiết khấu, bù hao, unit, method plugin, cart/order/PDF và parity frontend-backend. Dùng khi sửa hoặc chẩn đoán bất kỳ con số giá nào. Không dùng KB hay tài liệu mẫu làm nguồn công thức."
---

# Báo giá ZeplaoPrint

Giá là vùng tới hạn. Trước khi sửa, xác định bề mặt gọi, họ engine, field được consumer đọc và nơi số tiền được chốt.

## Hai họ engine và các đường vào

- Digital loose/bound/large_format: backend/src/modules/pricing/services/pricing-facade.service.ts cùng calculator/service liên quan.
- Offset to_roi/bi_thu_folder/sp_khac/hop_giay/tui_giay: backend/src/modules/pricing/offset-engine/engine-offset.service.ts và products/.
- Tầng method-agnostic: backend/src/quote/method-registry.service.ts, plugins/ và VAT cấp báo giá.
- Chatbot/mini quote: backend/src/modules/quote; offset không được định tuyến mù qua digital facade.
- Lưu quote/order và PDF: backend/src/modules/pricing/services/orders.service.ts và quote-pdf.service.ts.

Frontend có nhiều consumer: mini quote trong inbox, configurator digital, configurator offset, compare, cart, edit/hydrate và danh sách/PDF. Không giả định field có tên total ở mọi response mang cùng nghĩa.

## Bất biến bắt buộc

1. VAT từ input báo giá, áp đúng một lần. Đọc references/vat-parity.md khi chạm VAT, discount, item_total hoặc grand_total.
2. Với đường có contract replay, server recompute giá từ `printing_detail` trước khi lưu; không tin `item_total` do browser gửi. Offset thiếu config phải lỗi. Digital legacy thiếu `printing_detail.pricingPayload` hiện được bỏ qua để tương thích, nên không tuyên bố mọi item digital đều đã recompute hoặc âm thầm xóa seam này.
3. Plugin chỉ bọc engine hiện hữu. Thay plugin/capability không được đổi số học engine cho input giống nhau.
4. Thiếu config, vật liệu, khổ hoặc số con phải trả lỗi/requiresManualQuote; không fallback 0 đồng hoặc engine khác.
5. Offset waste là cascade theo công đoạn; không cộng một phần trăm hao phẳng lần nữa.
6. Chiết khấu offset chỉ áp đúng base do totals.ts quy định, không tự mở rộng sang giấy/kẽm/vật tư.
7. Cache pricebook/master data phải scope tenant và invalidation đúng.
8. Đơn vị phải tường minh. Dieline dùng mm; nhiều input offset dùng cm; mini loose và configurator chi tiết có seam đơn vị khác nhau. Chuyển đổi một lần ở biên.
9. Quote units dùng helper canonical trong backend/src/modules/pricing/lib/quote-units.ts và frontend/src/lib/quote/quote-units.ts; không suy unit từ label PDF.
10. OffsetPreviewSVG dùng meta/positions của engine khi có. DielinePreview là một endpoint/payload riêng; phải kiểm parity BoxParams và số con thay vì giả định nó cùng nguồn với price flow/PDF.

## Quy trình thay đổi

1. Viết chuỗi entry → payload → engine → response → consumer → persistence/PDF.
2. Chụp input và các số trung gian hiện tại; tìm golden/property test gần nhất.
3. Sửa ở nguồn sự thật thấp nhất có thể: pure lookup/calculator trước wrapper/UI.
4. Nếu đổi DTO, sửa builder/reader và printing_detail replay cùng lượt.
5. Kiểm case hợp lệ, thiếu dữ liệu, biên số lượng/khổ, VAT 0, nhiều item và tenant khác.
6. Chạy ma trận trong zeplao-testing; nếu golden đổi, giải thích delta nghiệp vụ trước khi sửa expected.

## Nguồn đọc theo tình huống

- Bản đồ hiện tại: STRUCTURE.md, nhưng kiểm code vì tài liệu có thể trôi.
- Đặc tả offset gốc: báo giá/PRICING_SPEC.md; code/test hiện tại thắng khi đã có thay đổi chủ đích.
- Method plugin/VAT: .kiro/specs/print-method-unification.
- Imposition thống nhất: .kiro/specs/offset-imposition-gripper-unification.
- Waste: docs/offset-waste-model.md.
- Audit giá: audit-rules.md, không dùng số test/version hardcode trong file làm bằng chứng hiện tại.

Chuyển zeplao-dieline khi thay khổ trải/nesting/box generator; chuyển zeplao-data-tenancy khi chạm cache hoặc cấu hình theo tenant.
