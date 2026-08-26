# VAT, discount và parity số tiền

## Phân biệt các hợp đồng

### Tầng method-agnostic

backend/src/quote/vat.ts nhận vat_rate dạng phần trăm, ví dụ 8 hoặc 10. DigitalMethodPlugin và OffsetMethodPlugin trả priceBeforeVat; tầng quote áp VAT một lần.

### Engine offset trực tiếp

backend/src/modules/pricing/offset-engine/totals.ts nhận vatRate dạng phân số, ví dụ 0.08. Kết quả chứa:

- tongChuaVAT;
- vat;
- tongGomVAT;
- chietKhau;
- khachTra;
- donGia1SP.

Đây là hợp đồng engine, không phải số cuối mà quote persistence luôn dùng.

`chietKhauRate` ở input engine là tỷ lệ chiết khấu nội bộ offset và chỉ tác động lên base do `totals.ts` quy định. Nó khác `discount_amount`/`discount_value` ở header báo giá, vốn áp trên subtotal đã gom item. Không lấy cùng một lựa chọn UI áp ở cả item engine và header trừ khi business contract chủ đích yêu cầu hai lần chiết khấu và test khóa điều đó.

### Quote/order được lưu

OrdersService lưu item_total trước VAT, sau phần chiết khấu engine hợp lệ. Header quote áp vat_rate của khách một lần, sau đó cộng phí/chiết khấu cấp quote theo hợp đồng hiện hành.

Frontend offset phải dùng frontend/src/lib/quote/offset-quote-total.ts để quy đổi về cùng quy ước persistence/PDF. Không hiển thị trực tiếp result.khachTra làm tổng chốt cho khách.

Đường method-plugin hiện không đồng nhất với lưu trực tiếp: `OffsetMethodPlugin` trả `priceBeforeVat = tongChuaVAT` và `discountAmount = 0`, còn `OrdersService.recomputeOffsetItems` lưu item net bằng `tongChuaVAT - chietKhau`. Khi sửa tầng hợp nhất, phải quyết định contract rồi kiểm riêng; không suy parity giữa hai đường chỉ vì cùng gọi engine.

## Các seam phải rà cùng nhau

- backend/src/quote/vat.ts và plugin specs.
- backend/src/modules/pricing/offset-engine/totals.ts.
- backend/src/modules/pricing/services/orders.service.ts.
- backend/src/modules/pricing/services/quote-pdf.service.ts.
- frontend/src/lib/quote/offset-quote-total.ts.
- frontend/src/app/pricing/quotes/_store/useQuoteCart.ts.
- frontend/src/app/pricing/quotes/new, offset và start.

printing_detail phải giữ đủ config/payload/result để edit hydrate và backend replay. DTO order dùng snake_case và global ValidationPipe forbidNonWhitelisted; không spread object camelCase tùy ý vào body.

## Test tối thiểu

- backend/src/quote/vat.spec.ts.
- backend/src/quote/plugins/__tests__/price-preservation.golden.spec.ts.
- backend/src/modules/pricing/offset-engine/__tests__/offset-price-preservation.golden.spec.ts.
- backend/src/modules/pricing/offset-engine/__tests__/totals.property.spec.ts.
- backend/src/modules/pricing/services/__tests__/orders-offset-recompute.spec.ts.
- backend/src/modules/pricing/services/__tests__/quote-pdf-parity.spec.ts hiện chỉ khóa parity `soConToLon`, không chứng minh parity tiền.
- frontend/src/lib/quote/offset-quote-total.test.ts.
- test trang/hook trực tiếp tiêu thụ con số đã đổi.

Khi chạm discount + VAT, bổ sung hoặc xác nhận các canary sau:

- component không render `result.khachTra` làm tổng chốt;
- create và update gửi/lưu discount + VAT không áp cùng chiết khấu hai lần;
- header do `OrdersService` tính khớp subtotal item của configurator;
- HTML/PDF đọc đúng `grand_total` đã lưu bằng một test tiền riêng, không dựa vào tên file parity hình học.

Khi số lệch, so breakdown và basis VAT/discount trước khi chỉnh rounding. Chênh đúng discount × VAT thường là dấu hiệu đang trộn khachTra của engine với grand total của quote.
