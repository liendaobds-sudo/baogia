# Implementation Plan — Customer Master tại Zeplao

> ⚠️ **ĐÃ ĐỔI HƯỚNG & HOÀN TÁC (2026-06-21).** Toàn bộ 15 task bên dưới (hướng "contacts làm master")
> đã được **triển khai rồi GỠ BỎ** sau khi chủ dự án chỉ ra sai khái niệm. Trạng thái thực tế hiện nay:
> - DB dev: đã xoá kênh `manual` + 10 contact giả, DROP `customers.contact_id`, DROP `customer_link_conflicts`.
> - Backend: đã xoá `CustomerDirectoryService`/module, `customer-sync.controller`, các migration/seed/backfill;
>   `customers.service`/`quote.service` về trạng thái độc lập như trước. Build + 532 test xanh.
> - Frontend: ẩn "Danh bạ liên hệ", thêm trang Zeplao "Khách hàng" (`/(app)/customers`) đọc `/erp/customers`.
>
> Hướng đúng cuối cùng: **`customers` là nguồn duy nhất, dùng chung 2 app; Zeplao có màn hình Khách hàng;
> Inbox thay cho danh bạ chat.** Các task bên dưới chỉ giữ để tham khảo lịch sử.

## Overview

Thực thi theo 3 phase an toàn "thêm trước – dọn sau". Sau mỗi task: `npm run build` + `npm test` (giữ 46 suite/531 test xanh). DB thật là Postgres, `synchronize:false` → mọi thay đổi schema qua SQL migration có guard trong `backend/db/`, KHÔNG bật synchronize. Phase 1 đưa cấu trúc + Cầu_Đồng_Bộ vào mà không phá luồng hiện có; Phase 2 chuyển sang đọc nhất quán từ master; Phase 3 dọn trùng.

## Tasks

### Phase 1 — Cấu trúc (rủi ro thấp)

- [x] 1. Mở rộng `ChannelType` và seed Kênh_Thủ_Công
  - Thêm `MANUAL = 'manual'` vào enum `ChannelType` (`backend/src/entities/channel.entity.ts`)
  - Script seed idempotent tạo đúng MỘT channel `type='manual'`, `name='Khách trực tiếp'`, `external_id='manual'` (skip nếu đã có)
  - _Requirements: 11.1_

- [x] 2. Thêm khoá liên kết `customers.contact_id`
  - SQL migration có guard `backend/db/<date>_customers_contact_link.sql`: `ADD COLUMN contact_id uuid NULL` + index + FK → `contacts(id) ON DELETE RESTRICT` (idempotent)
  - Thêm field `contactId` vào entity `Customer` (`@Column({ name: 'contact_id', type: 'uuid', nullable: true })`)
  - Cập nhật `backend/db/schema.postgres.sql`
  - _Requirements: 2.1, 2.2_

- [x] 3. Bảng đối soát xung đột
  - SQL migration tạo `customer_link_conflicts(customer_id int, candidate_contact_ids uuid[], detected_at timestamptz default now())` (idempotent)
  - _Requirements: 7.4_

- [x] 4. `CustomerDirectoryService` — skeleton + `resolveMaster`
  - Tạo service trong `backend/src/modules/contacts/`, export qua `ContactsModule`
  - `resolveMaster({phone?, name, email?, zalo?})`: chuẩn hoá phone → tìm Contact theo Zalo identity hoặc `manual_<phone>`; chưa có → tạo Contact trên Kênh_Thủ_Công (`manual_<phone>` | `manual_<uuid>`); trả `contactId`; idempotent
  - Unit + property-based (fast-check): 2 lần cùng phone → cùng contactId (Property 5)
  - _Requirements: 6.1, 6.2, 11.2, 11.3, 11.4_

- [x] 5. `CustomerDirectoryService` — đọc danh tính & tìm kiếm
  - `getIdentityForCustomers(ids[])`: JOIN `customers.contact_id → contacts`
  - `searchByIdentity(q)`: query `contacts` theo tên/phone/email, kèm `linkedCustomerId` + cờ liên kết
  - `findDuplicateLinks()`: nhóm `customers` theo `contact_id`, trả nhóm >1
  - Mọi method fail-hard có thông báo khi lỗi (không trả rỗng âm thầm)
  - _Requirements: 1.3, 2.3, 3.1, 3.2, 9.1, 9.2_

- [x] 6. Bắt buộc `contact_id` khi tạo Customer
  - `CustomersService.createCustomer`: thiếu `contact_id` → gọi `resolveMaster` trước; vẫn thiếu → ném lỗi mô tả
  - `CustomersService.autoResolveFromQuote`: chèn `resolveMaster(phone)` trước khi tạo Customer; giữ nguyên upgrade lifecycle/interaction
  - Unit: tạo customer không có contact → bị chặn (Property 4)
  - _Requirements: 6.5, 4.1_

- [x] 7. Thay `CustomerSyncController` chết
  - `GET /contacts/pricing-customers` → gọi `searchByIdentity` (bỏ nhánh `pricingApi.get`)
  - `POST /contacts/sync-to-pricing`: bỏ/thay nhánh `pricingApi.post` stub; nếu giữ → trả lỗi mô tả khi lỗi, không "success rỗng"
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 8. Script backfill di trú (idempotent, có backup)
  - Backup `customers` ra `backend/_archive/` trước khi chạy
  - Khớp đúng-1 → set `contact_id`; khớp-0 → tạo master Kênh_Thủ_Công rồi set; khớp->1 → ghi `customer_link_conflicts`; customer không phone → master `manual_<uuid>`
  - Chạy lại an toàn (bỏ qua row đã có `contact_id`)
  - Migration test: seed legacy (khớp-1/0/nhiều) → assert Property 3, 4, 6 + conflict list
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 11.5_

- [x] 9. Verify Phase 1
  - Chạy backfill trên DB dev; assert không còn customer thiếu `contact_id` (trừ conflict)
  - `npm run build` + `npm test` xanh; E2E: tạo báo giá khách mới từ Báo giá → có Contact + Customer link + `quotes.customer_id` giữ nguyên
  - _Requirements: 4.2, 6.5_

### Phase 2 — Nhất quán

- [x] 10. Báo giá đọc danh tính từ master
  - `pricing/customers` list/detail + `page.tsx` + `CustomerModal.tsx`: hiển thị danh tính từ `getIdentityForCustomers` (JOIN contacts) + cờ trạng thái liên kết
  - _Requirements: 1.3, 3.2, 10.2_

- [x] 11. Chặn sửa danh tính sai luồng ở Báo giá
  - `CustomersService.updateCustomer`: loại Trường_Định_Danh khỏi field ghi được → chỉ cho cập nhật Trường_Tài_Chính
  - Unit: cố cập nhật tên qua Báo giá → bị từ chối, giữ giá trị master
  - _Requirements: 5.4, 10.3_

- [x] 12. Hành vi khi master offline
  - Service ném lỗi rõ ràng; Báo giá chặn search/gắn-mới + thông báo; báo giá đã gắn vẫn xem/sửa; tự phục hồi khi master trở lại
  - Behavior test
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 13. Cột danh tính trên `customers` thành read-through cache
  - Đồng bộ 1 chiều danh tính từ master vào cache khi đọc/ghi tài chính; không cho ghi ngược
  - _Requirements: 1.1, 10.1_

### Phase 3 — Dọn

- [x] 14. Siết ràng buộc & dọn trùng
  - Sau khi mọi customer có `contact_id` (conflict đã xử lý): migration siết `customers.contact_id` NOT NULL
  - Rà soát raw SQL còn đọc cột danh tính (`lookupByPhone`, `smartLookup`) → chuyển qua master nếu còn phụ thuộc
  - Cân nhắc gỡ cột danh tính trùng; cập nhật `schema.postgres.sql`
  - _Requirements: 2.1, 6.5_

- [x] 15. Đối soát Kênh_Thủ_Công ↔ Zalo
  - Khách phi-Zalo phát sinh hội thoại Zalo → hợp nhất master Kênh_Thủ_Công với Contact Zalo theo phone, không tạo trùng
  - _Requirements: 11.5, 7.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3"], "rationale": "Schema/seed độc lập: manual channel, contact_id, bảng conflict" },
    { "wave": 2, "tasks": ["4"], "rationale": "resolveMaster cần manual channel (1) + cột contact_id (2)" },
    { "wave": 3, "tasks": ["5", "6"], "rationale": "Đọc/tìm kiếm và bắt buộc contact_id đều dựa trên resolveMaster (4)" },
    { "wave": 4, "tasks": ["7", "8"], "rationale": "Thay controller cần search (5); backfill cần resolve (4), search/duplicate (5), bảng conflict (3)" },
    { "wave": 5, "tasks": ["9"], "rationale": "Verify Phase 1 sau khi 4-8 xong" },
    { "wave": 6, "tasks": ["10", "12", "13", "15"], "rationale": "Phase 2 đọc master + offline + cache; 15 chỉ cần resolveMaster (4) nhưng gom vào sau verify" },
    { "wave": 7, "tasks": ["11"], "rationale": "Chặn sửa danh tính sau khi FE đọc master (10)" },
    { "wave": 8, "tasks": ["14"], "rationale": "Phase 3 siết NOT NULL + dọn trùng, cần 10/11/13 xong" }
  ]
}
```

Phụ thuộc tóm tắt: 1,2 → 4 → 5,6 → 7,8 → 9 → 10,12,13 → 11 → 14; (15 cần 4).

## Notes

- Raw SQL: cú pháp Postgres, `$1`, identifier camelCase đặt nháy kép, `is_active` theo kiểu cột.
- Không bật `synchronize`. Migration có guard, idempotent, có backup trước khi backfill.
- Mỗi task hoàn tất phải giữ build + test xanh trước khi sang task kế.
- Phase 1 KHÔNG đụng `quotes.customer_id` và trường tài chính; giữ cột danh tính trên `customers` để pipeline AI (raw SQL) không gãy — chỉ refactor ở Phase 2/3.
