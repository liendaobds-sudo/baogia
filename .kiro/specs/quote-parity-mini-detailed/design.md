# Design Document

## Overview

Mục tiêu thiết kế: rút toàn bộ logic **dựng payload tính giá** đang bị nhân đôi giữa Báo_Giá_Mini và Báo_Giá_Chi_Tiết về **một lớp hàm thuần dùng chung** (`frontend/src/lib/quote/buildPricingPayload.ts`), kèm một **Bộ_Đọc_Envelope** dùng chung để chuẩn hóa kết quả engine. Nhờ đó, với cùng Đầu_Vào_Chuẩn_Hóa, hai bề mặt sinh ra payload tương đương và đọc kết quả theo cùng một cách → **cùng sản phẩm + thông số ⇒ cùng giá**.

Thiết kế tuân thủ ràng buộc:
- Không đổi engine giá backend (`PricingFacadeService → PricingService`).
- Không đổi schema DB (`synchronize=false`).
- Không đổi endpoint hiện có (`POST /pricing/calculate`, `POST /quote/pricing-calc`); chỉ thay đổi cách **client** dựng payload và đọc kết quả.

### Bằng chứng lệch giá (đã audit)

| Vấn đề | Báo_Giá_Chi_Tiết | Báo_Giá_Mini | Hệ quả |
|---|---|---|---|
| P1 — bound `inner.page_count` | `max(0, page_count - 4)` | gửi `page_count` đầy đủ | mini tính dư 4 trang ruột → giá cao hơn |
| P1 — bound `inner.print_type` | có | thiếu | engine thiếu thông tin loại in ruột |
| P1 — loose `gap_h/gap_v` | người dùng chỉnh (mặc định 2) | ép cứng `1.5/1.5` | lệch số tờ / hiệu suất dàn khuôn |
| P1 — loose `print_type` | theo state (`'4c'`) | `config.default_print_type \|\| '4c'` | có thể lệch loại in |
| P1 — large_format đơn vị | gửi thẳng theo đơn vị configurator | heuristic ngưỡng (`≤10→m`, `≤300→cm`) | lệch kích thước → lệch diện tích → lệch giá |
| P1 — định danh processing | large_format `{name}`, bound `{id, side}` | luôn `{id}` | engine nhận biểu diễn khác nhau |
| P3 — envelope | `{success, data}` | object trực tiếp | đọc kết quả khác nhau |
| P3 — formatVND | dùng formatVND | `toLocaleString+'đ'` | hiển thị không nhất quán |

## Architecture

```mermaid
flowchart TD
    subgraph MiniSurface["Báo giá mini (chatbot)"]
        MQP[MiniQuotePanel.tsx]
        UQC[useQuoteCalculator.ts]
        QRD[QuoteResultDisplay.tsx]
    end
    subgraph DetailSurface["Báo giá chi tiết (/pricing)"]
        UQCfg[useQuoteConfigurator.ts]
    end
    subgraph Shared["Lớp dùng chung (mới)"]
        BPP[buildPricingPayload.ts<br/>hàm thuần]
        ENV[readPricingResult.ts<br/>Bộ đọc envelope]
        FMT[formatVND - currency.ts]
    end
    subgraph Backend["Engine giá (không đổi)"]
        EP1[POST /pricing/calculate]
        EP2[POST /quote/pricing-calc]
        PE[PricingFacadeService → PricingService]
    end

    UQC -->|Normalized Input| BPP
    UQCfg -->|Normalized Input| BPP
    BPP -->|payload| EP2
    BPP -->|payload| EP1
    EP1 --> PE
    EP2 --> PE
    EP1 -->|{success,data}| ENV
    EP2 -->|object| ENV
    ENV --> QRD
    ENV --> UQCfg
    QRD --> FMT
```

**Nguyên tắc kiến trúc:**
1. **Một nguồn sự thật cho payload.** Mọi quy ước mặc định (gap, `page_count-4`, `print_type`, đơn vị, định danh processing) chỉ tồn tại bên trong Lớp_Dựng_Payload.
2. **Tách chuẩn hóa khỏi I/O.** Mỗi bề mặt chịu trách nhiệm map state UI riêng của nó → Đầu_Vào_Chuẩn_Hóa, rồi giao cho lớp dùng chung. Lớp dùng chung không biết gì về React state hay fetch.
3. **Đọc kết quả thống nhất.** Bộ_Đọc_Envelope hấp thụ khác biệt envelope.

## Components and Interfaces

### C1. `buildPricingPayload.ts` (Lớp_Dựng_Payload)

Hàm thuần, không I/O. Phân nhánh theo `product_type`.

```typescript
// Đơn vị chuẩn hóa tường minh, tránh heuristic theo ngưỡng giá trị
export type LengthUnit = 'mm' | 'cm' | 'm';

export interface Dimension {
  value: number;
  unit: LengthUnit;
}

export interface ProcessingInput {
  id: number;
  name?: string;
  side?: string; // 'single' | 'double' | ...
}

export interface AccessoryInput {
  id: number;
  qty: number;
  name?: string;
  price?: number;
}

export interface LooseInput {
  product_type: 'loose';
  material_id: number;
  paper_size_id?: number;
  quantity: number;
  item_width: Dimension;
  item_height: Dimension;
  print_side: string;
  print_type: string;
  shape: string;
  gap_h?: number; // mm; mặc định thống nhất nếu thiếu
  gap_v?: number; // mm; mặc định thống nhất nếu thiếu
  processing: ProcessingInput[];
  accessories: AccessoryInput[];
}

export interface BoundSectionInput {
  material_id: number;
  paper_size_id: number;
  print_side: string;
  print_type: string;
  processing?: ProcessingInput[];
}

export interface BoundInput {
  product_type: 'bound';
  quantity: number;
  item_width: Dimension;
  item_height: Dimension;
  page_count: number;
  binding_type: string;
  cover: BoundSectionInput;
  inner: BoundSectionInput;
  accessories: AccessoryInput[];
}

export interface LargeFormatInput {
  product_type: 'large_format';
  material_id: number;
  quantity: number;
  width: Dimension;
  height: Dimension;
  print_type: string;
  processing: ProcessingInput[];
  accessories: AccessoryInput[];
}

export type NormalizedInput = LooseInput | BoundInput | LargeFormatInput;

// Hằng số quy ước dùng chung (single source of truth)
export const DEFAULT_GAP_MM = 2;        // thống nhất gap mặc định
export const INNER_PAGE_OFFSET = 4;     // bound: inner = page_count - 4

export type PricingPayload = Record<string, unknown>;

// Hàm chính (phân nhánh nội bộ theo product_type)
export function buildPricingPayload(input: NormalizedInput): PricingPayload;

// Hàm con (export để test riêng)
export function buildLoosePayload(input: LooseInput): PricingPayload;
export function buildBoundPayload(input: BoundInput): PricingPayload;
export function buildLargeFormatPayload(input: LargeFormatInput): PricingPayload;

// Quy đổi đơn vị tường minh
export function toMillimeters(d: Dimension): number; // mm→×1, cm→×10, m→×1000
```

**Quy ước thống nhất do lớp này đảm bảo:**
- `bound`: `inner.page_count = max(0, page_count - INNER_PAGE_OFFSET)`, luôn gắn `inner.print_type` và `inner.print_side`.
- `loose`: `gap_h/gap_v` lấy từ input; nếu thiếu dùng `DEFAULT_GAP_MM`. `print_type` lấy từ input (không tự suy theo config).
- `large_format`: `width/height` quy đổi qua `toMillimeters` theo `unit` tường minh, không dùng ngưỡng magic.
- `processing`: định dạng theo quy ước cố định cho từng `product_type`, gắn `side` khi quy ước yêu cầu.

### C2. `readPricingResult.ts` (Bộ_Đọc_Envelope)

```typescript
export interface NormalizedPricingResult {
  ok: boolean;
  total?: number;
  price_per_item?: number;
  breakdown?: Record<string, unknown>;
  leadtime?: { standardDays: number; expressDays?: number };
  warnings?: string[];
  error?: string;
  requiresManualQuote?: boolean;
  raw: unknown;
}

// Hấp thụ cả {success, data} lẫn object trực tiếp
export function readPricingResult(response: unknown): NormalizedPricingResult;
```

Quy tắc:
- Nếu `response` có `success === true` và `data` → đọc từ `data`.
- Nếu `response` có `success === false` → `{ ok: false, error }`.
- Nếu `response` là object kết quả trực tiếp (có `total`/`breakdown`/`requiresManualQuote`) → dùng trực tiếp.
- Thiếu dữ liệu kết quả → `{ ok: false, error }` chuẩn hóa.

### C3. Tích hợp `useQuoteCalculator.ts` (mini)

- Thay 3 hàm `buildLoosePayload/buildBoundPayload/buildLargeFormatPayload` nội bộ bằng việc map `formData + masterData + template` → `NormalizedInput`, rồi gọi `buildPricingPayload`.
- Đọc phản hồi `POST /quote/pricing-calc` qua `readPricingResult`.

### C4. Tích hợp `useQuoteConfigurator.ts` (chi tiết)

- Thay khối dựng payload `loose/bound/large_format` trong `calculatePrice` bằng map state → `NormalizedInput`, rồi gọi `buildPricingPayload`.
- Đọc phản hồi `POST /pricing/calculate` qua `readPricingResult`.

### C5. `QuoteResultDisplay.tsx` + sinh văn bản chat (mini)

- Thay mọi `Number(x).toLocaleString('vi-VN') + 'đ'` bằng `formatVND(x)` (gồm total, price_per_item, breakdown currency keys, văn bản copy vào chat).

### C6. `MiniQuotePanel.tsx` — trường bắt buộc

- Thay nhánh hardcode suy luận trường bắt buộc bằng đọc cờ `is_required` của field trong metadata template; field không khai báo `is_required` ⇒ không bắt buộc.

### C7. `QuoteService.calculateMiniQuote` (backend) — giữ thông tin ruột/bìa cho parity bound

Đây là thay đổi backend duy nhất, khoanh vùng trong nhánh `bound` của `calculateMiniQuote` (`backend/src/modules/quote/quote.service.ts`).

Hiện tại nhánh `bound` map `inner` chỉ giữ `{ material_id, paper_size_id, print_side }` và `cover` không có `print_type`:

```typescript
// HIỆN TẠI (lột bỏ page_count + print_type)
calcPayload.inner = input.inner.map((i: any) => ({
    material_id: i.material_id,
    paper_size_id: i.paper_size_id || this.getDefaultPaperSizeId(),
    print_side: normalizePrintSide(i.print_side || 'double'),
}));
```

Sửa thành truyền tiếp `page_count`/`print_type` **khi có** (giữ fallback khi vắng):

```typescript
// SAU (giữ thông tin khi FE cung cấp, fallback như cũ khi vắng)
calcPayload.cover = {
    material_id: input.cover.material_id,
    paper_size_id: input.cover.paper_size_id || this.getDefaultPaperSizeId(),
    print_side: normalizePrintSide(input.cover.print_side || 'double'),
    ...(input.cover.print_type ? { print_type: input.cover.print_type } : {}),
    ...(input.cover.processing ? { processing: input.cover.processing } : {}),
};

calcPayload.inner = input.inner.map((i: any) => ({
    material_id: i.material_id,
    paper_size_id: i.paper_size_id || this.getDefaultPaperSizeId(),
    print_side: normalizePrintSide(i.print_side || 'double'),
    ...(i.page_count != null ? { page_count: i.page_count } : {}),
    ...(i.print_type ? { print_type: i.print_type } : {}),
    ...(i.processing ? { processing: i.processing } : {}),
}));
```

Vì `Lớp_Dựng_Payload` đặt `inner.page_count = max(0, page_count - 4)` (như Báo_Giá_Chi_Tiết) và gắn `inner.print_type`, sau thay đổi này engine `bound-calculator` sẽ nhận cùng `inner.page_count` hiệu dụng cho cả hai bề mặt → **parity bound thật sự**. Engine, schema và đường dẫn endpoint không đổi.

## Data Models

### Mapping state UI → Đầu_Vào_Chuẩn_Hóa

**Mini (loose) — hiện tại → chuẩn hóa:**
- `item_width/height`: mini hiện đã `×10` (cm→mm thủ công). Chuyển sang dùng `Dimension {value, unit:'cm'}` và để `toMillimeters` xử lý.
- `gap_h/gap_v`: bỏ ép cứng `1.5`; nếu UI mini chưa có ô nhập gap thì để trống → lớp dùng `DEFAULT_GAP_MM`.
- `print_type`: lấy từ field người dùng nếu có, nếu không dùng giá trị mặc định template, đồng quy ước với chi tiết.

**Chi tiết (loose):** `itemWidth/itemHeight` đang là mm → `Dimension {value, unit:'mm'}`; `gapH/gapV` → `gap_h/gap_v`.

**Mini & Chi tiết (bound):** cả hai map về `BoundInput` với `cover` và `inner` đầy đủ `material_id, paper_size_id, print_side, print_type`. `inner.page_count` do lớp tính, không truyền sẵn.

**Mini (large_format):** thay heuristic bằng khai báo `unit` của configurator (cm theo UI) → `Dimension {value, unit:'cm'}`. **Chi tiết (large_format):** `lfWidth/lfHeight` đang mm → `unit:'mm'`.

### Payload đầu ra (giữ nguyên hợp đồng engine)

Payload trả về phải khớp định dạng engine đang nhận hôm nay (đã xác minh từ code hai hook), ví dụ `bound`:

```json
{
  "type": "bound", "product_type": "bound",
  "quantity": 10, "page_count": 32, "binding_type": "saddle_stitch",
  "item_width": 210, "item_height": 297,
  "cover": { "material_id": 1, "paper_size_id": 2, "print_side": "single", "print_type": "4c" },
  "inner": [{ "material_id": 3, "paper_size_id": 2, "print_side": "double", "print_type": "4c", "page_count": 28 }]
}
```

## Correctness Properties

*Một property là một đặc tính hoặc hành vi phải luôn đúng trên mọi lần thực thi hợp lệ của hệ thống — về bản chất là một phát biểu hình thức về điều hệ thống phải làm. Properties là cầu nối giữa đặc tả cho con người đọc và các bảo đảm đúng đắn kiểm chứng được bằng máy.*

### Property 1: Đối chiếu mini ↔ chi tiết (parity)

*For any* Đầu_Vào_Chuẩn_Hóa hợp lệ và bất kỳ `product_type`, `buildPricingPayload` SHALL trả về payload tương đương khi được gọi cho cùng input — không phụ thuộc bề mặt gọi. Cụ thể payload tương đương về `bound.inner.page_count`, `loose.gap_h/gap_v`, và `large_format.width/height` (mm).

**Validates: Requirements 1.3, 2.1, 3.1, 4.1**

### Property 2: Bound trừ 4 trang ruột

*For any* `BoundInput` hợp lệ với `page_count = p`, payload đầu ra SHALL có `inner[].page_count = max(0, p - 4)`.

**Validates: Requirements 2.1**

### Property 3: Bound luôn có print_type và print_side ruột

*For any* `BoundInput` hợp lệ, mỗi mục `inner[]` trong payload SHALL chứa cả `print_type` và `print_side` đúng theo input.

**Validates: Requirements 2.2, 2.3**

### Property 4: Loose dùng gap từ input, mặc định thống nhất khi thiếu

*For any* `LooseInput`, nếu `gap_h/gap_v` được cung cấp thì payload SHALL dùng đúng giá trị đó; nếu thiếu thì payload SHALL dùng `DEFAULT_GAP_MM` cho cả hai chiều.

**Validates: Requirements 3.1, 3.2**

### Property 5: Quy đổi đơn vị tường minh là đơn điệu và đúng hệ số

*For any* `Dimension {value, unit}` với `value ≥ 0`, `toMillimeters` SHALL bằng `value` (mm), `value*10` (cm), hoặc `value*1000` (m) đúng theo `unit`, độc lập với độ lớn của `value` (không có ngưỡng magic).

**Validates: Requirements 4.1, 4.2**

### Property 6: Định danh processing nhất quán theo product_type

*For any* tập lựa chọn processing trong Đầu_Vào_Chuẩn_Hóa, biểu diễn processing trong payload SHALL giống nhau cho cùng `product_type` bất kể bề mặt gọi, và SHALL chứa `side` khi quy ước của `product_type` yêu cầu.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 7: Bộ đọc envelope hội tụ về cùng kết quả

*For any* đối tượng kết quả giá `r`, `readPricingResult({success:true, data:r})` và `readPricingResult(r)` SHALL trả về cùng một `NormalizedPricingResult` (cùng `total`, `breakdown`, `ok=true`).

**Validates: Requirements 6.1, 6.2, 6.4**

### Property 8: Envelope thất bại/thiếu dữ liệu cho lỗi chuẩn hóa

*For any* phản hồi có `success=false` hoặc không chứa dữ liệu kết quả, `readPricingResult` SHALL trả về `NormalizedPricingResult` với `ok=false` và một trường `error` xác định.

**Validates: Requirements 6.3**

### Property 9: formatVND một ký hiệu tiền tệ duy nhất

*For any* số hữu hạn, chuỗi do `formatVND` trả ra (được Báo_Giá_Mini dùng) SHALL chứa đúng một ký hiệu tiền tệ và biểu diễn `Math.round` của giá trị.

**Validates: Requirements 7.1, 7.2, 7.3**

## Error Handling

- **Đầu vào không hợp lệ (bound thiếu cover/inner):** `buildPricingPayload` ném lỗi xác định (ví dụ `InvalidPayloadError`) thay vì dựng payload với giá trị suy đoán (Req 2.4). Bề mặt gọi bắt lỗi và hiển thị trạng thái "cần báo giá thủ công".
- **Giá trị số rác (NaN, âm):** lớp chuẩn hóa coi đầu vào không hữu hạn là không hợp lệ; `toMillimeters` chỉ xử lý `value ≥ 0`.
- **Lỗi mạng / engine:** giữ hành vi hiện tại của mỗi bề mặt; sau khi nhận phản hồi, `readPricingResult` chuẩn hóa cả nhánh lỗi (`ok=false, error`).
- **Envelope lạ:** nếu không nhận diện được dạng, `readPricingResult` trả `{ ok:false, error:'unrecognized_response' }`.

## Testing Strategy

PBT phù hợp ở đây vì Lớp_Dựng_Payload, `toMillimeters`, Bộ_Đọc_Envelope và `formatVND` đều là **hàm thuần** với không gian đầu vào lớn và nhiều property phổ quát (parity, invariant trừ-4-trang, quy đổi đơn vị, hội tụ envelope).

**Cách tiếp cận kép:**
- **Property tests (fast-check, ≥100 iteration):** hiện thực hóa Property 1–9. Mỗi property là một test riêng, gắn tag `Feature: quote-parity-mini-detailed, Property {n}: {tiêu đề}`.
- **Unit tests (ví dụ cụ thể & edge case):**
  - bound `page_count` nhỏ (`p ≤ 4` → `inner.page_count = 0`).
  - loose không có ô gap → dùng `DEFAULT_GAP_MM`.
  - large_format `Dimension` ở cả ba đơn vị.
  - envelope: 3 dạng (`{success,data}`, object trực tiếp, `{success:false}`).
  - `MiniQuotePanel`: template có/không `is_required`.

**Thư viện:** dùng `fast-check` (không tự viết PBT từ đầu). Mỗi property test cấu hình tối thiểu 100 lần lặp.

**Generators chính:**
- `normalizedInputArb`: sinh `LooseInput | BoundInput | LargeFormatInput` hợp lệ (số ≥ 0, đơn vị tường minh, processing có/không `side`).
- `dimensionArb`: `{ value ∈ [0, 100000], unit ∈ {mm,cm,m} }`.
- `pricingResultArb`: object kết quả giá hợp lệ để bọc trong hai dạng envelope.

## Ghi nhận giới hạn (ngoài phạm vi sửa)

- **Độ trễ master-data mini:** `MASTER_DATA_TTL = 5 phút` khiến Báo_Giá_Mini có thể trễ so với admin sửa, trong khi Báo_Giá_Chi_Tiết tươi. Không bắt buộc đổi backend; ghi nhận là giới hạn đã biết. Tùy chọn nhẹ (ngoài spec này): giảm TTL hoặc invalidate khi admin lưu.- **Auto-detect lệch danh sách live:** `/product-templates/detect` và `/extract-fields` dùng cache in-memory `loadProductTemplates()` tách biệt danh sách sản phẩm live → template tự nhận diện có thể lệch sản phẩm chọn tay. Ghi nhận, không sửa trong spec này.
- **Khoảng trống pipeline đơn:** Báo_Giá_Mini không lưu vào `/erp/orders`, chỉ chèn văn bản vào chat. Ghi nhận là khoảng trống quy trình, liên quan định hướng phân quyền ai-báo-giá / ai-xem-đơn; ngoài phạm vi sửa code lần này.
