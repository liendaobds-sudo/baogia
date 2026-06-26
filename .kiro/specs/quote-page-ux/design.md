# Tài liệu Thiết kế — quote-page-ux

## Overview

Tài liệu này thiết kế các cải thiện UI/UX cho module `App_BaoGia` theo 11 requirement đã duyệt.
Mục tiêu: nhanh, ít thao tác, phản hồi rõ ràng cho mô hình xưởng in nhỏ, đồng thời sửa các lỗi
đúng đắn dữ liệu phát hiện trong audit. Mọi thay đổi tập trung ở **frontend**; chỉ chạm backend khi
cần điều hòa endpoint tạo báo giá về nguồn được bảo vệ RBAC, và khi đó thay đổi phải **tối thiểu và
an toàn schema** (`synchronize=false`, không thêm/sửa bảng/cột).

### Kết quả điều tra (Investigation Summary)

Thiết kế dưới đây dựa trên việc đọc trực tiếp mã nguồn hiện trạng:

1. **Endpoint `/quotes/save` KHÔNG tồn tại trong backend.** Tìm toàn bộ `backend/src` không có
   `@Controller('quotes')` hay route `save` nào. Trang tạo (`frontend/src/app/pricing/quotes/new/page.tsx`)
   đang `POST ${API_URL}/quotes/save` → route chết (404). Đây chính là lỗi "báo giá tạo xong không
   thấy trong danh sách" mà Requirement 3 mô tả.

2. **Nguồn chuẩn (canonical) là `POST /erp/orders`.** Trong
   `backend/src/modules/pricing/controllers/orders.controller.ts`, `ErpOrdersController` gắn
   `@UseGuards(AuthGuard('jwt'), PermissionsGuard)` ở cấp controller; route `create` (`@Post()`) đã gắn
   `@Permissions('quote.create')`. Service `OrdersService.createQuote` ghi `INSERT INTO quotes (...)` —
   **cùng bảng `quotes`** mà `findAllQuotes` (route `GET /erp/orders`) đọc ra. Vậy danh sách và tạo mới
   dùng chung một nguồn nếu chuyển create sang `/erp/orders`.

3. **Quyết định reconcile: chọn (a)** — chuyển luồng tạo của frontend sang `POST /erp/orders`, ánh xạ
   payload sang `CreateQuoteDto`. Lý do: `/erp/orders` đã được RBAC bảo vệ sẵn (`quote.create`), cùng
   nguồn dữ liệu với danh sách, không phát sinh route/bảng mới. Phương án (b) (thêm guard vào
   `/quotes/save`) bị loại vì route đó không tồn tại và vẫn là nguồn thứ hai gây phân mảnh dữ liệu.

4. **`ValidationPipe` toàn cục bật `whitelist:true, forbidNonWhitelisted:true, transform:true`**
   (`backend/src/main.ts`). Hệ quả: gửi field lạ → **400**; field không khai trong DTO → bị loại bỏ.
   `CreateQuoteDto` hiện **thiếu** `vat_rate`, `vat_amount`, `shipping_fee`, `grand_total` — dù
   `createQuote` đọc các field này và bảng `quotes` đã có sẵn các cột đó. Vì vậy cần một thay đổi backend
   **tối thiểu, an toàn schema**: thêm các field optional này vào `CreateQuoteDto` (không động cột/bảng).

5. **`GET /erp/orders` lọc `status` bằng so khớp đơn trị** (`q.status = CAST($n AS TEXT)` trong
   `findAllQuotes`), **không** hỗ trợ nhiều trạng thái. Danh sách hiện nạp `?status=<đơn>&page&limit` rồi
   `filterByView` client-side → bản ghi của một nhóm nhưng nằm ngoài trang đầu bị mất (lỗi Requirement 1).
   Cần cho phép truyền **danh sách trạng thái** để truy vấn nhóm-aware nhất quán với phân trang.

### Phạm vi thay đổi backend (được phép, tối thiểu, an toàn schema)

Chỉ hai thay đổi, đều không đụng schema:

- **B1 — Mở rộng `CreateQuoteDto`**: thêm `vat_rate?`, `vat_amount?`, `shipping_fee?`, `grand_total?`
  (đều `@IsOptional() @Type(() => Number) @IsNumber()`). Cột đã tồn tại; service đã đọc. Chỉ gỡ rào
  `forbidNonWhitelisted`.
- **B2 — `findAllQuotes` nhận `status` đa trị**: nếu `status` chứa dấu phẩy thì tách và dùng
  `q.status = ANY($n::text[])`; ngược lại giữ nguyên so khớp đơn trị. Tương thích ngược 100%.

Mọi thứ khác là frontend.

## Architecture

```mermaid
flowchart TD
    subgraph FE[Frontend - App_BaoGia]
        L[QuoteOrderListView<br/>list + detail]
        N[new/page.tsx<br/>Create flow]
        CI[CustomerInfo<br/>shared component]
        TX[ToastProvider + ConfirmModal<br/>app-level UX]
        H1[useDebouncedValue]
        H2[viewToStatuses]
        H3[validateQuoteDraft]
        H4[formatVND]
    end
    subgraph BE[Backend - đã RBAC hoá]
        OC[ErpOrdersController<br/>@Permissions]
        OS[OrdersService<br/>quotes table]
    end

    L -- "GET /erp/orders?status=<group>&page&limit" --> OC
    L -- "POST /erp/orders/:id/{approve,reject,...}" --> OC
    N -- "POST /erp/orders (quote.create)" --> OC
    L --> H2
    L --> H1
    N --> H3
    N --> CI
    L --> H4
    N --> H4
    L --> TX
    N --> TX
    OC --> OS
    OS --> DB[(quotes / quote_items)]
```

Nguyên tắc kiến trúc:

- **Hàm thuần tách khỏi UI**: `viewToStatuses`, `validateQuoteDraft`, `formatVND` là pure functions,
  không phụ thuộc React/DOM → dễ kiểm thử property-based.
- **Một nguồn ghi duy nhất**: mọi lệnh tạo/đổi vòng đời đi qua `/erp/orders` (RBAC).
- **UX dùng chung ở cấp app**: `ToastProvider` (context) + `ConfirmModal` thay cho `alert`/`prompt`.
- **Bảo toàn ràng buộc kế thừa**: `FrozenRouteGuard`, cấu trúc hai route, `statusGroup`/`filterByView`,
  ẩn/hiện nút theo `usePermissions`.

## Components and Interfaces

### 1. `viewToStatuses` — ánh xạ Khung_Nhìn → tập trạng thái truy vấn (Req 1)

Bổ sung vào `frontend/src/lib/scope/quote-view.ts`, dùng lại đúng `QUOTE_STATUSES` / `ORDER_STATUSES`
hiện có (Req 1.4):

```ts
// frontend/src/lib/scope/quote-view.ts
import type { ViewKey } from './types';

/**
 * Tập trạng thái cần truy vấn từ Nguồn_Báo_Giá cho một Khung_Nhìn.
 * - 'quote' → toàn bộ QUOTE_STATUSES
 * - 'order' → toàn bộ ORDER_STATUSES
 * - 'all'   → [] (rỗng = không lọc status; trả mọi bản ghi, Req 1.5)
 * Pure, không mutate, không I/O.
 * _Requirements: 1.1, 1.3, 1.4, 1.5_
 */
export function viewToStatuses(view: ViewKey): string[] {
  switch (view) {
    case 'quote': return [...QUOTE_STATUSES];
    case 'order': return [...ORDER_STATUSES];
    case 'all':   return [];
  }
}
```

Cách danh sách dùng (trong `QuoteOrderListView.fetchQuotes`): trạng thái truy vấn hiệu dụng =
bộ lọc trạng thái đơn lẻ nếu người dùng chọn cụ thể, ngược lại là tập của Khung_Nhìn:

```ts
const effectiveStatuses = statusFilter
  ? [statusFilter]                 // người dùng chọn 1 trạng thái cụ thể
  : viewToStatuses(view);          // theo nhóm Khung_Nhìn

const params = new URLSearchParams();
if (effectiveStatuses.length > 0) params.set('status', effectiveStatuses.join(','));
if (search) params.set('keyword', search);
if (fromDate) params.set('date_from', fromDate);
if (toDate) params.set('date_to', toDate);
params.set('page', String(page));
params.set('limit', '30');
// ... GET /erp/orders?${params}
```

`filterByView(quotes, view, q => q.status)` **vẫn giữ** làm lớp an toàn cuối ở client (Req 1.1, 1.4):
nếu backend trả dư trạng thái thì client vẫn lọc đúng nhóm.

Backend (B2) — thay đổi tối thiểu trong `findAllQuotes`:

```ts
if (filters.status) {
  const statuses = filters.status.split(',').map(s => s.trim()).filter(Boolean);
  if (statuses.length === 1) {
    params.push(statuses[0]);
    query += ` AND q.status = CAST(${p()} AS TEXT)`;
  } else if (statuses.length > 1) {
    params.push(statuses);
    query += ` AND q.status = ANY(${p()}::text[])`;
  }
}
```

> Vì sao chọn "đa trị qua một query" thay vì "gọi nhiều request rồi merge"? Một query giữ **phân trang
> và tổng số nhất quán** cho cả nhóm (Req 2.2/2.3); merge nhiều luồng phân trang sẽ làm range/total
> sai và không thể prev/next mạch lạc. Thay đổi an toàn schema (chỉ logic truy vấn, dùng cột `status`
> sẵn có), tương thích ngược (đơn trị vẫn chạy).

### 2. Phân trang / tải thêm cho `QuoteOrderListView` (Req 2)

Backend đã trả `pagination: { page, limit, total, total_pages, has_prev, has_next }`. Frontend bổ sung:

```ts
const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasPrev: false, hasNext: false });

// trong fetchQuotes, sau khi đọc json:
const pg = json.data.pagination;
setTotal(pg?.total ?? items.length);
setPagination({
  total: pg?.total ?? items.length,
  totalPages: pg?.total_pages ?? 1,
  hasPrev: pg?.has_prev ?? false,
  hasNext: pg?.has_next ?? false,
});
```

UI thanh phân trang (hiển thị range + total + prev/next, Req 2.1, 2.2, 2.3):

```tsx
const start = pagination.total === 0 ? 0 : (page - 1) * 30 + 1;
const end = Math.min(page * 30, pagination.total);
// ...
<div className="px-5 py-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100">
  <span aria-live="polite">{start}–{end} / {pagination.total} bản ghi</span>
  <div className="flex gap-1.5">
    <button disabled={!pagination.hasPrev} aria-label="Trang trước"
      onClick={() => setPage(p => Math.max(1, p - 1))}
      className="px-2.5 py-1 rounded border disabled:opacity-40">‹ Trước</button>
    <button disabled={!pagination.hasNext} aria-label="Trang sau"
      onClick={() => setPage(p => p + 1)}
      className="px-2.5 py-1 rounded border disabled:opacity-40">Sau ›</button>
  </div>
</div>
```

**Reset trang về 1** khi đổi search/ngày/trạng thái/Khung_Nhìn (Req 2.4): gom vào một effect

```ts
// Reset về trang đầu khi đổi bất kỳ tiêu chí lọc nào
useEffect(() => { setPage(1); }, [debouncedSearch, fromDate, toDate, statusFilter, view]);
```

### 3. Điều hòa luồng tạo Báo giá (Req 3)

**Thay** `POST /quotes/save` bằng `POST /erp/orders` với payload ánh xạ sang `CreateQuoteDto`.

Bảng ánh xạ payload (state trang tạo → `CreateQuoteDto`):

| State trang tạo            | Field CreateQuoteDto / cột `quotes` | Ghi chú |
|----------------------------|--------------------------------------|---------|
| `customerName`             | `customer_name`                      | ✓ có cột |
| `customerPhone`            | `customer_phone`                     | ✓ |
| `customerUnit`             | `customer_unit`                      | ✓ |
| `customerTaxCode`          | `tax_code`                           | ✓ (đổi tên) |
| `customerAddress`          | `customer_address`                   | ✓ |
| `notes`                    | `customer_note`                      | ✓ (đổi tên) |
| `quoteTab`/loại            | `type`                               | map sang nhãn loại (vd 'In nhanh') |
| `subtotal`                 | `total`                              | ✓ |
| `vatRate`                  | `vat_rate`                           | **cần B1** (cột có sẵn, service đã đọc) |
| `vatAmount`                | `vat_amount`                         | **cần B1** |
| `shippingFee`              | `shipping_fee`                       | **cần B1** |
| `grandTotal`               | `grand_total`                        | **cần B1** |
| `items[]`                  | `items: QuoteItemDto[]`              | xem mapping item bên dưới |
| `customerCode`             | — (không có cột trong INSERT)        | **Gap**: không persist; giữ ở UI/auto-resolve |
| `customerType`             | — (không có cột)                     | **Gap**: chỉ điều khiển hiển thị field |
| `customerEmail`            | — (không có cột)                     | **Gap**: không persist (giữ hành vi hiện tại) |
| `customerContact`          | — (không có cột)                     | **Gap**: không persist |

Mapping item (cart `{ name, type, quantity, unitPrice, total, configParams, details }` → `QuoteItemDto`).
Lưu ý: `_insertQuoteItems` đọc các field **phẳng** (snake_case) như `product_name`, `item_total`,
`quantity`, `item_type`, `material_id`, `paper_size_name`, `processing_details`, `printing_detail`,
`item_width`… `QuoteItemDto` đã khai sẵn đúng các field này. Vì vậy **phải trải phẳng** `configParams`
(không bọc trong `config_params`/`calculation_details` như payload legacy, vì `forbidNonWhitelisted`
sẽ loại bỏ field lạ và mất dữ liệu pricing — Req 11.4):

```ts
const mapItem = (it: CartItem): QuoteItemDto => ({
  ...(it.configParams as Record<string, unknown>), // các field cấu hình phẳng từ QuoteConfigurator
  product_name: it.name,
  item_type: it.type,
  product_type: it.type,
  quantity: it.quantity,
  item_total: it.total,
});
```

> **Gap pricing cần xác minh khi implement**: `QuoteConfigurator` phải sinh `configParams` theo đúng
> khóa snake_case của `QuoteItemDto`. Nếu cart đang lưu cấu hình dưới dạng nested khác, task triển khai
> phải thêm adapter trải phẳng — KHÔNG đổi logic tính giá (Req 11.4), chỉ đổi hình dạng truyền tải.

Gọi tạo:

```ts
const res = await fetch(`${API_URL}/erp/orders`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    type: mapTabToType(quoteTab),
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_unit: customerUnit,
    tax_code: customerTaxCode,
    customer_address: customerAddress,
    customer_note: notes,
    total: subtotal,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    shipping_fee: shippingFee,
    grand_total: grandTotal,
    items: items.map(mapItem),
  }),
});
```

Ẩn lối tạo khi thiếu quyền (Req 3.4): nút "Tạo mới" trong `QuoteOrderListView` và entrypoint điều hướng
chỉ render khi `hasPermission('quote.create')`:

```tsx
const { hasPermission } = usePermissions();
const canCreate = hasPermission('quote.create');
// ...
{canCreate && (
  <Link href="/pricing/quotes/new" /* ... */>Tạo mới</Link>
)}
```

Ranh giới bảo mật thật vẫn là backend: `@Permissions('quote.create')` trả **403** cho người không có
quyền (Req 3.3) — ẩn UI chỉ là UX. Sau khi tạo thành công, danh sách `fetchQuotes()` lại đọc cùng bảng
`quotes` nên báo giá mới xuất hiện (Req 3.1).

### 4. ConfirmModal + Toast (Req 4)

Một `ToastProvider` nhẹ (React context) + `ConfirmModal` dùng lại được, không cần thư viện ngoài.

```ts
// frontend/src/lib/ui/toast.tsx
type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string };
interface ToastApi { show: (kind: Toast['kind'], message: string) => void; }
const ToastCtx = createContext<ToastApi | null>(null);
export function useToast(): ToastApi { /* throw nếu thiếu provider */ }
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((kind, message) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, kind, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  // render vùng thông báo với role="status"/aria-live="polite"
}
```

```ts
// frontend/src/lib/ui/ConfirmModal.tsx
interface ConfirmModalProps {
  open: boolean;
  title: string;
  requireReason?: boolean;         // bật ô nhập lý do (từ chối/hủy)
  reasonLabel?: string;
  confirmLabel?: string;
  pending?: boolean;               // hiển thị trạng thái đang xử lý
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}
```

Áp dụng cho action bar trong `QuoteOrderListView`:

- "Từ chối" / "Hủy" → mở `ConfirmModal` với `requireReason` thay cho `prompt` (Req 4.1).
- Mỗi nút vòng đời dùng state `pendingAction` để **disable + spinner** trong lúc gọi (Req 4.4):

```ts
const [pendingAction, setPendingAction] = useState<string | null>(null);
async function runLifecycle(key: string, fn: () => Promise<Response>, okMsg: string) {
  if (pendingAction) return;                 // chặn double-click
  setPendingAction(key);
  try {
    const res = await fn();
    if (!res.ok) throw new Error(await extractError(res));
    await Promise.all([fetchDetail(detail.id), fetchQuotes()]);
    toast.show('success', okMsg);            // Req 4.2
  } catch (e) {
    toast.show('error', e instanceof Error ? e.message : 'Thao tác thất bại'); // Req 4.3, 4.5
  } finally {
    setPendingAction(null);
  }
}
```

Gỡ bỏ toàn bộ `alert`/`prompt` hiện có trong `QuoteOrderListView` và `new/page.tsx`.

### 5. Kiểm tra trường bắt buộc khi tạo (Req 5)

Pure function trong `frontend/src/lib/quote/validate.ts`:

```ts
export interface QuoteDraft {
  customerName: string;
  itemsCount: number;          // số hạng mục trong cart
}
export interface QuoteDraftErrors {
  customerName?: string;
  items?: string;
}
/**
 * Trả về object lỗi rỗng ⇔ draft hợp lệ. customerName coi như trống nếu toàn whitespace.
 * _Requirements: 5.1, 5.2, 5.3, 5.4_
 */
export function validateQuoteDraft(draft: QuoteDraft): QuoteDraftErrors {
  const errors: QuoteDraftErrors = {};
  if (draft.customerName.trim().length === 0) errors.customerName = 'Vui lòng nhập tên khách hàng';
  if (draft.itemsCount <= 0) errors.items = 'Báo giá cần ít nhất một hạng mục';
  return errors;
}
export const isQuoteDraftValid = (d: QuoteDraft) => Object.keys(validateQuoteDraft(d)).length === 0;
```

UI: hiển thị lỗi inline ngay dưới ô tên khách (Req 5.2); nút "LƯU BÁO GIÁ" `disabled` khi
`!isQuoteDraftValid(...)` hoặc đang lưu (Req 5.3, 5.4). Khi bấm lưu lúc không hợp lệ → chặn (Req 5.1).

### 6. Thành_Phần_Thông_Tin_Khách dùng chung (Req 6)

Hợp nhất khối inline trong `new/page.tsx` và `CustomerInfoSidebar.tsx` thành **một** component
`frontend/src/app/pricing/_components/CustomerInfo.tsx`, giữ nguyên ref API hiện có
(`getPayload(): CustomerInfoPayload`, `setCustomerData(d)`), giữ đủ các trường (phân loại, mã KH, tên,
điện thoại, đơn vị, MST, địa chỉ, email, người đại diện, ghi chú, VAT, phí giao hàng — Req 6.3).

**Chủ đề màu: chọn `indigo`** (giải quyết lệch indigo/purple — Req 6.2). Lý do: `new/page.tsx` đã dùng
indigo-600 cho header + nút Lưu + gradient sidebar; `QuoteOrderListView` dùng indigo cho accent chọn dòng
(`bg-indigo-50`, `border-l-indigo-600`) và badge; chỉ `CustomerInfoSidebar` lạc tông purple. Vậy chuẩn hóa
indigo là thay đổi ít nhất và nhất quán toàn module.

```ts
export interface CustomerInfoHandle {
  getPayload(): CustomerInfoPayload;        // giữ nguyên contract
  setCustomerData(d: Partial<CustomerInfoPayload>): void;
  getDraftState(): { customerName: string }; // phục vụ validateQuoteDraft
}
export const CustomerInfo = forwardRef<CustomerInfoHandle, CustomerInfoProps>(/* ... */);
```

`new/page.tsx` và bất kỳ nơi dùng `CustomerInfoSidebar` đều import component mới; xóa bản trùng lặp.

### 7. Bộ_Định_Dạng_Tiền_Tệ dùng chung (Req 7)

```ts
// frontend/src/lib/format/currency.ts
/**
 * Định dạng VND nhất quán toàn App_BaoGia. Một ký hiệu duy nhất: '₫'.
 * Làm tròn về số nguyên đồng; nhóm hàng nghìn theo 'vi-VN'.
 * Deterministic & parseable: gỡ ký tự không phải số rồi parse lại = Math.round(amount).
 * _Requirements: 7.1, 7.2_
 */
export function formatVND(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  return `${rounded.toLocaleString('vi-VN')} ₫`;
}
```

Thay thế:
- `QuoteOrderListView`: bỏ `formatCurrency = amount.toLocaleString('vi-VN') + ' đ'` → dùng `formatVND`.
- `new/page.tsx` & `CustomerInfo`: bỏ `new Intl.NumberFormat(..., { style:'currency', currency:'VND' })`
  (ký hiệu '₫' có khoảng trắng không ngắt) → dùng `formatVND`.

Một quy ước ký hiệu duy nhất `'₫'` ở mọi nơi (Req 7.2).

### 8. Debounce ô tìm kiếm (Req 8)

```ts
// frontend/src/lib/hooks/useDebouncedValue.ts
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

`QuoteOrderListView`: `search` cập nhật tức thời cho input; `debouncedSearch = useDebouncedValue(search, 300)`
là thứ đưa vào `params.keyword` và vào dependency của `fetchQuotes`. Người dùng gõ liên tục → chỉ một
request sau khi ngừng gõ > 300ms (Req 8.1, 8.2).

### 9. Accessibility (Req 9)

- Mọi nút action có nhãn văn bản hoặc `aria-label` (không chỉ emoji): ví dụ `aria-label="Gửi duyệt"`,
  `aria-label="Từ chối báo giá"` (Req 9.1, 9.3).
- Badge trạng thái: **văn bản + màu** (đã có nhãn tiếng Việt) — đảm bảo không chỉ dựa màu (Req 9.2).
- Nút chỉ-icon (thu gọn sidebar, prev/next, xóa hạng mục): thêm `aria-label` + `title` tooltip (Req 9.3).
- Thứ tự Tab hợp lý theo trình tự đọc: tìm kiếm → bộ lọc → Khung_Nhìn → danh sách → chi tiết → action;
  tránh `tabIndex` dương tùy tiện (Req 9.4).

### 10. Tính đáp ứng màn hình nhỏ (Req 10)

- `QuoteOrderListView`: hai khung list/detail hiện `flex` cố định + list `w-[400px]`. Chuyển sang:
  - `md+`: hai pane song song như cũ.
  - `< md`: list chiếm toàn chiều rộng; khi chọn một dòng, **chi tiết hiện dạng overlay/drawer**
    phủ lên (nút "Đóng" quay lại danh sách). Dùng class responsive Tailwind + state `mobileDetailOpen`.
- `new/page.tsx`: sidebar `w-[280px] lg:w-[320px]` đã thu gọn được; trên màn nhỏ cho sidebar thành
  drawer/accordion và vùng configurator co giãn không tràn (Req 10.2).
- Giữ nguyên hoạt động sidebar của `PricingLayout` (Req 10.3) — chỉ thêm lớp responsive, không gỡ.

### 11. Phi chức năng (Req 11)

- Giữ ẩn/hiện nút cam kết theo `quote.approve`/`order.approve` qua `usePermissions`/`hasPermission`
  (Req 11.1) — không đổi.
- Giữ `FrozenRouteGuard` và cấu trúc hai route `/pricing/quotes`, `/pricing/orders` (Req 11.2).
- Thay đổi giới hạn ở frontend trừ B1+B2 tối thiểu, an toàn schema (Req 11.3).
- Không đổi logic tính giá và schema; tái dùng pure function sẵn có (`statusGroup`, `filterByView`,
  pricing services) (Req 11.4).

## Data Models

Không có model dữ liệu/bảng mới (Req 3.5, 11.4). Chỉ các kiểu frontend hỗ trợ:

```ts
// Khung nhìn (đã có)
type ViewKey = 'quote' | 'order' | 'all';

// Phân trang phản chiếu pagination backend trả về
interface ListPagination {
  total: number; totalPages: number; hasPrev: boolean; hasNext: boolean;
}

// Bản nháp tạo báo giá (đầu vào validate — pure)
interface QuoteDraft { customerName: string; itemsCount: number; }
interface QuoteDraftErrors { customerName?: string; items?: string; }

// UX dùng chung
type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; message: string; }
```

Mở rộng DTO backend (B1, không đổi cột):

```ts
export class CreateQuoteDto {
  // ... các field hiện có ...
  @IsOptional() @Type(() => Number) @IsNumber() vat_rate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() vat_amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() shipping_fee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() grand_total?: number;
}
```

## Correctness Properties

*Một property là đặc tính/hành vi phải luôn đúng trên mọi lần thực thi hợp lệ của hệ thống — một
phát biểu hình thức về việc hệ thống PHẢI làm gì. Property là cầu nối giữa đặc tả cho người đọc và
bảo đảm đúng đắn kiểm chứng được bằng máy.*

Phạm vi property-based testing ở feature này chỉ áp dụng cho các phần **thuần (pure)** thực sự:
`viewToStatuses`, `validateQuoteDraft`, `formatVND`. Các phần UI/RBAC/tích hợp/layout dùng
unit/integration/smoke (xem Testing Strategy). `useDebouncedValue` phụ thuộc thời gian nên dùng unit
test với fake timers thay vì PBT. Thư viện: **fast-check** (đã có trong `frontend/package.json`), tối
thiểu 100 vòng/property.

### Property 1: viewToStatuses nhất quán với statusGroup (phân hoạch hai chiều)

*Với mọi* trạng thái `s` mà `statusGroup(s)` thuộc `{'quote','order'}`, thì `viewToStatuses(statusGroup(s))`
phải chứa `s`; và *với mọi* view `v ∈ {'quote','order'}` cùng *mọi* phần tử `s ∈ viewToStatuses(v)`, phải
có `statusGroup(s) === v`; đồng thời `viewToStatuses('all')` phải bằng `[]`.

**Validates: Requirements 1.1, 1.3, 1.4, 1.5**

### Property 2: validateQuoteDraft hợp lệ khi và chỉ khi không có trường bắt buộc trống

*Với mọi* bản nháp `draft`, kết quả `validateQuoteDraft(draft)` rỗng (draft hợp lệ) **khi và chỉ khi**
`draft.customerName` sau khi `trim()` khác rỗng VÀ `draft.itemsCount > 0`; ngược lại phải có đúng khóa
lỗi cho mỗi trường vi phạm (tên toàn whitespace ⇒ có `customerName`; không có hạng mục ⇒ có `items`).

**Validates: Requirements 5.1, 5.3, 5.4**

### Property 3: formatVND xác định, một ký hiệu, và parse lại được

*Với mọi* số hữu hạn `amount`, `formatVND(amount)` phải: (a) xác định (gọi nhiều lần cùng input cho cùng
chuỗi); (b) kết thúc bằng đúng một ký hiệu `' ₫'` (đúng một ký hiệu tiền tệ trong chuỗi); (c) khi gỡ mọi
ký tự không phải chữ số và parse lại thì bằng `Math.round(amount)`.

**Validates: Requirements 7.1, 7.2**

## Error Handling

- **Tạo báo giá (POST /erp/orders)**:
  - `403` (thiếu `quote.create`): hiển thị Thông_Báo lỗi "Bạn không có quyền tạo báo giá"; đồng thời lối
    tạo đã bị ẩn ở UI (Req 3.3, 3.4).
  - `400` (validation DTO): đọc `message` từ thân phản hồi và hiển thị toast lỗi mô tả (Req 4.3, 4.5).
  - Lỗi mạng/timeout: bắt `catch`, toast lỗi, **không** điều hướng, **không** clear cart.
- **Hành động vòng đời (submit/approve/reject/send/accept/complete/cancel/clone)**:
  - Mọi nhánh đi qua `runLifecycle`: `!res.ok` → ném lỗi với thông điệp trích từ phản hồi → toast lỗi;
    thành công → toast thành công + refetch. Không nuốt lỗi (Req 4.5).
  - Trong lúc chờ: nút `disabled` + spinner, chặn double-submit (Req 4.4).
- **Validation tạo (client)**: `validateQuoteDraft` chặn lưu khi tên khách trống/không có hạng mục;
  hiển thị lỗi inline; nút Lưu `disabled` (Req 5.1–5.4) — tránh round-trip 400 không cần thiết.
- **Tải danh sách/chi tiết**: lỗi fetch → danh sách rỗng an toàn + toast info/lỗi nhẹ, không crash.
- **`extractError(res)`**: helper đọc `{ message } | { error }` từ JSON, fallback theo `res.status`.

## Testing Strategy

Cách tiếp cận kép: **unit/property** cho phần thuần, **integration/component/smoke** cho phần UI/IO.

### Property-based tests (fast-check, ≥100 vòng)

Mỗi test gắn tag tham chiếu property thiết kế.

- **Property 1** — `frontend/src/lib/scope/quote-view.test.ts`
  `// Feature: quote-page-ux, Property 1: viewToStatuses nhất quán với statusGroup`
  Generator: chuỗi trạng thái bất kỳ (gồm các trạng thái hợp lệ lẫn lạ/rỗng) + chọn view ∈ {quote,order,all}.
- **Property 2** — `frontend/src/lib/quote/validate.test.ts`
  `// Feature: quote-page-ux, Property 2: validateQuoteDraft hợp lệ ⇔ không trường bắt buộc trống`
  Generator: `customerName` gồm chuỗi tùy ý + chuỗi toàn whitespace; `itemsCount` số nguyên ≥ 0.
- **Property 3** — `frontend/src/lib/format/currency.test.ts`
  `// Feature: quote-page-ux, Property 3: formatVND xác định, một ký hiệu, parse lại được`
  Generator: số hữu hạn (gồm 0, âm, lớn, có phần thập phân).

### Unit tests (ví dụ/edge, không PBT)

- `useDebouncedValue` (Req 8.1, 8.2): jest fake timers — nhiều cập nhật trong < delay chỉ emit giá trị
  cuối **một lần** sau khi yên ≥ delay.
- Tính `start/end` range phân trang (Req 2.2): trang đầu, trang cuối lẻ, `total=0`.

### Component/integration tests (@testing-library/react)

- Phân trang: total>limit hiện control; bấm Sau → fetch page+1; đổi filter/view/search → page reset 1
  (Req 2.1, 2.3, 2.4).
- Ẩn lối tạo theo quyền (Req 3.4); nút cam kết theo `quote.approve`/`order.approve` (Req 11.1).
- ConfirmModal thay prompt, Toast thành công/lỗi, pending chặn double-click (Req 4.1–4.5).
- Validation inline + nút Lưu disabled (Req 5.2, 5.3).
- `CustomerInfo` render đủ field và `getPayload()` trả đủ khóa `CustomerInfoPayload` (Req 6.3).
- Accessibility: mọi nút action có accessible name; badge trạng thái có text; nút icon có aria-label
  (Req 9.1, 9.2, 9.3).

### Smoke / kiểm thủ công (Playwright)

- Reconcile create: `POST /erp/orders` với token có `quote.create` → 2xx và báo giá xuất hiện trong
  danh sách; token thiếu quyền → 403 (Req 3.1, 3.2, 3.3).
- Responsive ở viewport nhỏ: list/detail xếp chồng/drawer, trang tạo không tràn, sidebar PricingLayout
  vẫn hoạt động (Req 10.1, 10.2, 10.3).
- Hồi quy: hai route `/pricing/quotes`, `/pricing/orders` + `FrozenRouteGuard` còn hiệu lực (Req 11.2);
  build backend chạy, **không migration/đổi cột** sau B1/B2 (Req 3.5, 11.3); test pricing hiện có không
  đổi (Req 11.4).

### Lưu ý không đổi schema (explicit)

Toàn bộ thiết kế **không thêm/sửa bảng hay cột**. Hai thay đổi backend duy nhất:
B1 thêm field optional vào `CreateQuoteDto` (cột đã tồn tại, `forbidNonWhitelisted` ngừng loại bỏ),
B2 cho `findAllQuotes` nhận `status` đa trị (chỉ logic truy vấn trên cột `status` sẵn có). `synchronize`
giữ `false`. Không có migration mới.
