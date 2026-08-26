---
name: zeplao-add-product
description: "Thêm sản phẩm in thương mại hoặc quote type mới vào ZeplaoPrint xuyên catalog, engine giá, method/capability, frontend, AI và constraint. Dùng khi sản phẩm mới/chưa được AI, mini quote hay configurator nhận. Không dùng cho việc chỉ thêm subtype boxType trong hop_giay; trường hợp đó dùng zeplao-dieline."
---

# Thêm sản phẩm in mới

Không có một checklist áp dụng giống nhau cho mọi sản phẩm. Phân loại trước:

1. Box subtype trong hop_giay: chỉ thêm boxType/generator vào loại sản phẩm Hộp giấy hiện hữu; không tự tạo catalog, quote type hay AI product mới.
2. Catalog/AI-only: sản phẩm dùng engine và quote type đã có, chỉ cần master data/template/field.
3. Digital/large-format: dùng PricingFacadeService và master data hiện có.
4. Offset: map vào một trong 5 type hiện hữu hoặc cần thuật toán sản phẩm thứ sáu.
5. Manual quote: chưa đủ rule/dữ liệu để tự tính; phải giữ requiresManualQuote.

Nếu người dùng chưa cung cấp đủ quy cách, có thể dựng khung dữ liệu/test nhưng không tự bịa công thức, giá, MOQ hoặc hình học.

## Thông tin đầu vào

- Tên tiếng Việt, code ổn định và alias/keyword thực tế.
- Phương pháp in, quote type và unit bán.
- Kích thước/đơn vị, vật liệu, gia công, số mặt, số lượng.
- Nguồn giá và công thức được duyệt; trường hợp manual.
- Constraint kỹ thuật và edge case.
- Tenant/capability/scope nào được dùng.

## Điểm tích hợp theo nhu cầu

### Catalog và AI detection

Product runtime đến từ ProductsService/DB và được AiSuggestService nạp thành template động. Dùng API/admin ProductModal và các entity/service canonical thay vì chỉ sửa JSON.

- backend/src/modules/pricing/services/products.service.ts.
- backend/src/modules/pricing/controllers/products.controller.ts.
- frontend/src/app/pricing/products/.
- backend/src/modules/quote/extractors/product-detector.ts.

backend/src/data/knowledge/products.json là knowledge nội dung cho context; cập nhật khi cần tư vấn, không coi nó là nguồn catalog runtime.

### Mini quote và AI fields

Rà constants/registry mini quote, product AI fields, DTO/controller và frontend form. Field code, required/default/options/source table phải khớp cả loader và parser.

### Engine giá

- Digital: PricingFacadeService và calculator đúng product_type.
- Offset hiện hữu: product config/whitelist và input của type tương ứng.
- Offset type mới: cần engine product, union input, method mapping/plugin, DTO/API, UI, order replay, PDF và golden/property test. Đây là thay đổi kiến trúc, không chỉ master data.

### Dieline

Nếu chỉ thêm box subtype cho hop_giay, không chạy toàn bộ checklist catalog. Nạp zeplao-dieline, zeplao-pricing, zeplao-frontend và zeplao-testing; đọc tài liệu add-box-type do zeplao-dieline định tuyến.

### Constraint và KB

Dùng zeplao-ai-pipeline và đọc tài liệu printing-rules do skill đó định tuyến. KB không được làm nguồn giá.

## Điều kiện hoàn thành

- Catalog/admin tạo và đọc lại đúng trong tenant.
- AI detect đúng alias cụ thể và không false-positive với từ chung.
- Form hỏi đủ field, giữ đơn vị, payload qua ValidationPipe.
- Engine trả đúng breakdown hoặc requiresManualQuote có lý do.
- Lưu/edit hydrate/PDF giữ printing_detail và server recompute.
- Scope/method capability không cho truy cập sai.
- Test dương, âm, biên và regression giá/AI đều đạt ở mức được phép.
