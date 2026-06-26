# Technical Design — Customer Master tại Zeplao

> ⚠️ **ĐÃ ĐỔI HƯỚNG (2026-06-21) — thiết kế bên dưới KHÔNG còn áp dụng.** Cách "lấy `contacts` (chat)
> làm master + `customers.contact_id` + Kênh_Thủ_Công + `CustomerDirectoryService`" đã bị gỡ bỏ hoàn toàn
> (DB + code). Lý do: `contacts` là danh bạ chat, không phải hồ sơ khách.
>
> **Thiết kế thực tế đang chạy:** `customers` là nguồn khách hàng duy nhất; cả Zeplao lẫn Báo giá đọc
> chung `GET /erp/customers`. Zeplao thêm trang `/(app)/customers`; "Danh bạ liên hệ" ẩn khỏi menu
> (route/bảng `contacts` giữ cho Inbox). Không có khoá liên kết contacts↔customers ở thời điểm này
> (có thể thêm `contacts.customer_id` sau nếu cần nối đoạn chat ↔ khách).

## Overview

Đưa **Zeplao (App CSKH)** thành nguồn sự thật (master) cho **định danh khách hàng**, để **App Báo giá tham chiếu** thay vì giữ một bản ghi rời rạc có thể phân kỳ. Thiết kế bám sát ràng buộc đã trace từ code thật (NestJS + Postgres, một tiến trình, một DB).

Nguyên tắc kim chỉ nam:
- **Một nguồn sự thật vật lý cho danh tính** → đọc sống qua JOIN, không sao chép ⇒ không phân kỳ.
- **Không phá liên kết báo giá hiện có** → giữ nguyên `quotes.customer_id` (int → `customers.id`).
- **Thêm trước – dọn sau** (đồng nhất nguyên tắc spec `product-rescope-cskh-quote`): cấu trúc trước, nhất quán sau, gỡ trùng cuối.
- **In-process** → Cầu_Đồng_Bộ là service gọi thẳng + JOIN, KHÔNG HTTP/event bus.

Hiện trạng đã trace:

| Thực thể | Bảng / PK | Vai trò | Trường khoá |
|---|---|---|---|
| `Contact` | `contacts` / **UUID** | Master định danh (Zalo, CRM, AI) | unique `(channel_id, external_user_id)` — cả hai NOT NULL |
| `Customer` | `customers` / **int**, 34 cột | Bản ghi giao dịch | `code`, `taxCode`, `currentDebt`, `creditLimit`, `rfm_*`, `priceGroupId` |
| `Quote` | `quotes` / int | Báo giá/đơn | `customer_id` → `customers.id`; **đã snapshot** `customer_name/phone/unit/tax_code/address` |
| `Channel` | `channels` / UUID | Kênh | `type` enum `zalo_oa|facebook_page|zalo_personal`; `external_id`,`name`,`type` NOT NULL |

Vấn đề: không có khoá liên kết `contacts ↔ customers`; `CustomerSyncController` gọi `pricingApi.get/post` (stub trả `{}`) ⇒ chết.

## Architecture

```
        ┌──────────────────── Backend NestJS (1 tiến trình, 1 Postgres) ────────────────────┐
        │                                                                                    │
 Zeplao │  ContactsModule (MASTER danh tính)        QuoteModule / PricingModule (GIAO DỊCH)  │
 (CSKH) │   - contacts (UUID)  ◄───────────┐         - customers (int) ─► quotes.customer_id │
        │   - Kênh_Thủ_Công (khách phi-Zalo)│        - customers.contact_id (UUID) ──────────┼─► contacts
        │                                    │                                               │
        │        CustomerDirectoryService (Cầu_Đồng_Bộ in-process)                           │
        │         - searchByIdentity (đọc contacts)                                          │
        │         - resolveMaster(phone|zalo) → contactId (upsert qua Kênh_Thủ_Công nếu cần) │
        │         - getIdentityForCustomers(ids[]) → JOIN customers.contact_id → contacts    │
        └────────────────────────────────────────────────────────────────────────────────┘
```

- **Đọc danh tính ở Báo giá:** `customers` JOIN `contacts` ON `customers.contact_id = contacts.id` → tên/SĐT/email/avatar từ master.
- **Tạo khách ở Báo giá:** `resolveMaster(phone)` upsert Contact (Zalo nếu có, ngược lại Kênh_Thủ_Công) → tạo/link `customers.contact_id`.
- **`quotes.customer_id` không đổi**; snapshot trên quote vẫn giữ (chủ đích: phản ánh thông tin tại thời điểm lập báo giá).

Cầu_Đồng_Bộ đặt ở module master (`contacts`), export cho `QuoteModule`/`PricingModule`. Mọi truy cập là gọi service in-process, không HTTP — thay hẳn đường `CustomerSyncController` đã chết.

## Components and Interfaces

### CustomerDirectoryService (Cầu_Đồng_Bộ)
Đặt tại `backend/src/modules/contacts/`, export qua `ContactsModule`.

```ts
interface MasterIdentity {        // đọc từ contacts (master)
  contactId: string; displayName: string; phone?: string;
  email?: string; avatarUrl?: string; source?: string;
}
interface CustomerWithIdentity { customerId: number; contactId: string;
  identity: MasterIdentity; financial: { code; taxCode; currentDebt; creditLimit; priceGroupId; rfmSegment } }

class CustomerDirectoryService {
  searchByIdentity(q: string): Promise<Array<MasterIdentity & { linkedCustomerId?: number }>>;        // R3
  resolveMaster(i: { phone?; name; email?; zalo?: {channelId; externalUserId} }): Promise<string>;     // R6/R11 → contactId
  ensureCustomerLinked(customerId: number, contactId: string): Promise<void>;                          // R2/R4
  getIdentityForCustomers(ids: number[]): Promise<Map<number, MasterIdentity>>;                         // R1/R10
  findDuplicateLinks(): Promise<Array<{ contactId: string; customerIds: number[] }>>;                   // R7.3
}
```

- Mọi phương thức **fail-hard có thông báo** khi master lỗi (R8, R9.4) — KHÔNG trả rỗng âm thầm.
- `resolveMaster`: tìm Contact theo `manual_<phone>` (hoặc Zalo identity) → có thì trả; chưa có thì tạo Contact trên Kênh_Thủ_Công. Idempotent theo SĐT chuẩn hoá.

### Điểm tích hợp đã có (sửa, không viết lại)
- `CustomerSyncController` (`contacts/`): route `GET /contacts/pricing-customers` → gọi `searchByIdentity`; **xoá** nhánh `pricingApi.get/post` (R9.3).
- `CustomersService.createCustomer` (`pricing/services/`): bắt buộc có `contact_id`; nếu thiếu → `resolveMaster` trước (R6.5).
- `CustomersService.autoResolveFromQuote`: chèn `resolveMaster(phone)` trước khi tạo Customer; giữ nguyên upgrade lifecycle/interaction.
- Frontend `pricing/customers/page.tsx` + `_components/CustomerModal.tsx`: hiển thị danh tính từ master + cờ trạng thái liên kết (R3.2).

## Data Models

### Khoá liên kết
- DDL (SQL migration có guard tại `backend/db/`, KHÔNG bật synchronize):
  - `ALTER TABLE customers ADD COLUMN contact_id uuid NULL;`
  - `CREATE INDEX idx_customers_contact_id ON customers(contact_id);`
  - `ALTER TABLE customers ADD CONSTRAINT fk_customers_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE RESTRICT;`
- Entity `Customer`: `@Column({ name: 'contact_id', type: 'uuid', nullable: true }) contactId: string;`
- Nullable trong giai đoạn di trú (R7.6); siết NOT NULL ở Phase 3.

### Kênh_Thủ_Công
- `ChannelType.MANUAL = 'manual'` (cột `type` là varchar → không vỡ schema).
- Seed đúng MỘT channel: `type='manual'`, `name='Khách trực tiếp'`, `external_id='manual'`; cache id trong service.
- Contact phi-Zalo: `external_user_id = manual_<phone_chuẩn_hoá>`; thiếu SĐT → `manual_<uuid>`. Unique `(channel_id, external_user_id)` ⇒ idempotent (R11).

### Bảng đối soát thủ công
- `customer_link_conflicts(customer_id int, candidate_contact_ids uuid[], detected_at timestamptz)` — chứa case backfill khớp >1 (R7.4). Có thể dùng bảng hoặc log có cấu trúc.

### KHÔNG đụng tới
`quotes.customer_id`, toàn bộ trường tài chính trên `customers`, RFM, `customer_price_groups`, snapshot danh tính trên `quotes` (R4.2, R5).

## Correctness Properties

### Property 1: Một master duy nhất
Với mọi khách hàng có thật, tồn tại đúng một `contacts` row làm master; mọi `customers` liên kết đều trỏ về một `contact_id`.
**Validates: Requirements 1.4, 2.1**

### Property 2: Không sao chép, không lệch
Giá trị danh tính Báo giá đọc ra luôn bằng giá trị `contacts` tại thời điểm đọc (đọc qua JOIN).
**Validates: Requirements 1.3, 10.2**

### Property 3: Bảo toàn liên kết báo giá
Với mọi quote đã có `customer_id`, giá trị `customer_id` không đổi do tính năng này; truy được về master qua `customers.contact_id`.
**Validates: Requirements 4.2, 4.3, 4.4**

### Property 4: Không khách mồ côi
Không tồn tại `customers` row được tạo qua luồng chuẩn mà `contact_id` IS NULL sau Phase 1 hoàn tất.
**Validates: Requirements 6.5**

### Property 5: Idempotent master phi-Zalo
Hai lần `resolveMaster` cùng SĐT chuẩn hoá trả cùng `contactId`, không sinh master thứ hai.
**Validates: Requirements 11.4**

### Property 6: Bảo toàn tài chính
Tổng/nội dung trường tài chính của mỗi `customers` row trước và sau di trú bằng nhau.
**Validates: Requirements 5.1, 7.5**

## Error Handling

- **Master offline (R8):** `CustomerDirectoryService` ném lỗi có thông báo. Báo giá: chặn search/gắn-mới, hiển thị "Nguồn khách hàng (Zeplao) đang không sẵn sàng"; vẫn cho xem/sửa báo giá đã gắn (dùng snapshot quote + `customers` đã link). Tự phục hồi khi master trở lại, không cần thao tác tay (R8.3, R8.4).
- **Cầu_Đồng_Bộ thất bại (R9.4):** trả lỗi mô tả nguyên nhân, KHÔNG trả "thành công với mảng rỗng" như controller cũ.
- **Tạo customer thiếu `contact_id` (R6.5):** từ chối thao tác, thông báo nguyên nhân.
- **Backfill khớp >1 contact (R7.4):** không tự gán; đẩy vào `customer_link_conflicts`; tiếp tục chạy phần còn lại (không abort toàn bộ).
- **Sửa danh tính sai luồng ở Báo giá (R10.3):** từ chối, giữ giá trị master.
- DDL/migration: chạy script có guard, có backup `customers` trước backfill để hoàn tác.

## Testing Strategy

- **Unit:** `resolveMaster` (Zalo có/không, idempotent theo phone — P5); `getIdentityForCustomers` JOIN trả đúng master; `findDuplicateLinks`.
- **Property-based (fast-check, khớp hạ tầng test sẵn có):** P5 (idempotent), P1 (một master) trên tập input SĐT/định danh ngẫu nhiên.
- **Migration test:** seed `customers` legacy (khớp-1, khớp-0, khớp-nhiều) → backfill → assert P3/P4/P6 + conflict list đúng.
- **Integration:** tạo báo giá với khách mới từ Báo giá → có Contact (Kênh_Thủ_Công) + Customer link + quote.customer_id giữ nguyên.
- **Behavior:** master offline → search/gắn-mới bị chặn, báo giá đã gắn vẫn xem/sửa được.
- Mỗi phase: chạy `npm run build` + `npm test` (đảm bảo 46 suite/531 test vẫn xanh) + luồng E2E tạo báo giá có khách.

## Migration Plan (3 phase — R7, an toàn hoàn tác)

**Phase 1 — Cấu trúc (rủi ro thấp):** DDL `contact_id` + index + FK; enum `manual`; seed Kênh_Thủ_Công; dựng `CustomerDirectoryService`; thay `CustomerSyncController` chết. Backfill idempotent (backup trước): khớp-1 → gán; khớp-0 → tạo master Kênh_Thủ_Công; khớp-nhiều → conflict list. Giữ nguyên cột danh tính trên `customers` (raw SQL `lookupByPhone/smartLookup` của pipeline AI vẫn chạy).

**Phase 2 — Nhất quán:** đọc danh tính Báo giá qua JOIN `contacts`; chặn sửa danh tính sai luồng (đẩy về cập nhật Contact); cột danh tính `customers` thành read-through cache.

**Phase 3 — Dọn:** siết `customers.contact_id` NOT NULL; cân nhắc gỡ cột danh tính trùng trên `customers` sau khi xác nhận không còn raw SQL phụ thuộc. Cập nhật `backend/db/schema.postgres.sql`.

## Mapping Yêu cầu → Thiết kế

| Req | Thoả bởi |
|---|---|
| 1, 10 | Đọc danh tính sống qua JOIN (Overview, Architecture, Phase 2) |
| 2 | `customers.contact_id` + `findDuplicateLinks` (Data Models, Components) |
| 3 | `searchByIdentity` (Components) |
| 4 | Giữ `quotes.customer_id` + snapshot (Architecture) |
| 5 | Không đụng trường tài chính (Data Models) |
| 6, A | `resolveMaster` + chặn customer thiếu `contact_id` (Components, Error Handling) |
| 7, B | Di trú 3 phase + bảng conflict (Migration Plan) |
| 8 | Fail-hard + fallback xem/sửa đã gắn (Error Handling) |
| 9 | `CustomerDirectoryService` thay controller chết (Components) |
| 11, C | Kênh_Thủ_Công + `external_user_id=manual_<phone>` (Data Models) |
