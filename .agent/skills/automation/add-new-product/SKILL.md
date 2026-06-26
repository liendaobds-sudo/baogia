# SKILL: add-new-product

## Purpose
Thêm sản phẩm in ấn mới vào hệ thống ZeplaoPrint — từ ERP integration đến AI detection, constraint rules, và báo giá tự động.

## Use When
- Cần thêm sản phẩm mới vào hệ thống (ví dụ: túi vải, bao thư, in ly...)
- Cần thêm template sản phẩm để AI detect từ tin nhắn khách
- Sản phẩm đã có trong ERP nhưng AI chưa nhận diện được

## Required Inputs
- Tên sản phẩm (tiếng Việt + alias)
- Thông số kỹ thuật chuẩn (size, chất liệu, gsm range, gia công)
- Keywords khách thường dùng khi hỏi
- Quy tắc ràng buộc riêng của sản phẩm
- Product ID trong ERP (nếu có)

## Execution — 6 Bước

### Bước 1: Thêm product template cho AI detection
File: `backend/src/data/knowledge/products.json`
```json
{
    "key": "product_key",
    "displayName": "Tên hiển thị",
    "keywords": ["keyword1", "keyword2"],
    "material": { "name": "Couche", "gsm": [250, 300, 350] },
    "sizes": [{ "name": "9x5.5cm", "w": 9, "h": 5.5 }],
    "finishings": ["cán mờ", "cán bóng", "ép nhũ"],
    "defaultQuantities": [100, 200, 500]
}
```

### Bước 2: Thêm constraint rules
Skill: `skills/knowledge/printing-industry-rules/SKILL.md`
→ Thêm rules vào 3 nơi: JSON, KB markdown, code check

### Bước 3: Map với ERP product
File: `backend/src/modules/suggestions/ai-suggest.service.ts`
→ Thêm vào `erpProductTemplates` mapping

### Bước 4: Cập nhật context-inference keywords
File: `backend/src/modules/suggestions/context-inference.service.ts`
→ Thêm product vào `productAlwaysInclude` trong `buildConstraintRulesContext()`

### Bước 5: Thêm vào KB documents
- Cập nhật file `san-pham-in-an.md` trong KB
- Hoặc tạo file riêng nếu sản phẩm phức tạp

### Bước 6: Test end-to-end
- Test Chat → gửi tin nhắn hỏi sản phẩm mới
- Verify: AI detect đúng sản phẩm
- Verify: báo giá chính xác
- Verify: constraint rules hoạt động
- Verify: KB search trả về thông tin liên quan

## Verification
- [ ] AI detect đúng product từ keywords?
- [ ] Báo giá match ERP?
- [ ] Constraint rules fire đúng?
- [ ] KB search trả về docs liên quan?
- [ ] Sản phẩm hiển thị trong admin UI?

## Anti-patterns
- ❌ Thêm product mà quên constraint rules → AI có thể tư vấn sai
- ❌ Thêm vào 1 nơi mà quên nơi khác → 3 tầng không đồng bộ
- ❌ Keywords quá generic ("in", "giấy") → false positive detection
- ❌ Copy spec sản phẩm cũ mà không customize → sai thông số

## Changelog
- v1.0 (2026-03-19): Initial skill with 6-step process
