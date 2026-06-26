# Requirements Document

## Introduction

Spec này hợp nhất logic dựng payload tính giá và quy ước master-data giữa **hai bề mặt báo giá** của hệ thống:

- **Báo giá mini** (chatbot trong inbox CSKH): dựng payload tại `useQuoteCalculator.ts`, gọi `POST /quote/pricing-calc`.
- **Báo giá chi tiết** (trang `/pricing`): dựng payload tại `useQuoteConfigurator.ts`, gọi `POST /pricing/calculate`.

Cả hai endpoint cuối cùng đều chạy qua **cùng một engine giá** (`PricingFacadeService → PricingService`) và đọc **cùng một nguồn sản phẩm** (`unified_products` + `product_ai_fields` qua `ProductsService.findAllProducts()`). Tuy nhiên, payload gửi vào engine được **dựng độc lập ở hai frontend** nên phát sinh lệch giá cho cùng một sản phẩm + thông số.

**Mục tiêu:** cùng một sản phẩm với cùng thông số đầu vào phải cho **cùng một giá**, bất kể được tính ở Báo giá mini hay Báo giá chi tiết.

**Phạm vi (rất quan trọng):**
- Đây là spec **trọng tâm frontend**: rút logic dựng payload trùng lặp về **một lớp dùng chung thuần (pure functions)**.
- **KHÔNG** thay đổi engine giá backend (`PricingFacadeService`/`PricingService`/`bound-calculator`).
- **KHÔNG** thay đổi schema DB (`synchronize=false`).
- **KHÔNG** thay đổi hợp đồng endpoint (`POST /pricing/calculate`, `POST /quote/pricing-calc` giữ nguyên đường dẫn và hình dạng request/response công khai).
- **Ngoại lệ có khoanh vùng (Requirement 10):** một thay đổi backend tối thiểu trong `QuoteService.calculateMiniQuote` — ngừng "lột bỏ" `inner.page_count`/`inner.print_type`/`cover.print_type` ở nhánh `bound` — là BẮT BUỘC để đạt parity hàng cuốn, vì việc chuẩn hóa này nằm ở backend chứ không ở frontend. Thay đổi này không đụng engine, không đụng schema, và giữ nguyên fallback khi các trường vắng mặt.
- Một số vấn đề P2/P3 chỉ **ghi nhận giới hạn** thay vì sửa, nếu việc sửa vượt ngoài phạm vi an toàn.

## Glossary

- **Lớp_Dựng_Payload (Shared Payload Builder)**: tập hợp hàm thuần dự kiến đặt tại `frontend/src/lib/quote/buildPricingPayload.ts`, nhận đầu vào chuẩn hóa và trả về payload theo `product_type`, được **cả** Báo giá mini và Báo giá chi tiết gọi.
- **Báo_Giá_Mini**: luồng báo giá trong chatbot inbox (`useQuoteCalculator.ts`, `useQuoteData.ts`, `QuoteResultDisplay.tsx`, `MiniQuotePanel.tsx`), gọi `POST /quote/pricing-calc`.
- **Báo_Giá_Chi_Tiết**: luồng báo giá trang `/pricing` (`useQuoteConfigurator.ts`), gọi `POST /pricing/calculate`.
- **product_type**: loại sản phẩm, một trong `loose` (hàng rời), `bound` (hàng cuốn), `large_format` (khổ lớn).
- **Đầu_Vào_Chuẩn_Hóa (Normalized Input)**: cấu trúc dữ liệu đầu vào thống nhất cho Lớp_Dựng_Payload, với đơn vị, kiểu và tên trường đã được quy ước rõ ràng (kích thước theo mm, processing theo định danh thống nhất, v.v.).
- **Bộ_Đọc_Envelope (Response Reader)**: hàm thuần dùng chung chuẩn hóa việc đọc kết quả engine, xử lý cả dạng `{success, data}` (từ `/pricing/calculate`) lẫn dạng object trực tiếp (từ `/quote/pricing-calc`).
- **formatVND**: hàm định dạng tiền tệ dùng chung tại `frontend/src/lib/format/currency.ts`, trả về chuỗi VND có hậu tố ` ₫`.
- **page_count**: tổng số trang của sản phẩm hàng cuốn (gồm cả bìa).
- **inner.page_count**: số trang ruột, theo quy ước Báo_Giá_Chi_Tiết bằng `max(0, page_count - 4)`.
- **gap_h / gap_v**: khoảng cách dàn khuôn theo chiều ngang/dọc (mm) khi xếp sản phẩm rời trên tờ in.
- **Định_Danh_Processing**: cách định danh một tùy chọn gia công gửi vào engine (theo `id`, theo `name`, hoặc kèm `side`).
- **MASTER_DATA_TTL**: thời gian sống bộ nhớ đệm master-data của Báo_Giá_Mini (hiện 5 phút).

## Requirements

### Requirement 1: Lớp dựng payload dùng chung

**User Story:** Là một lập trình viên, tôi muốn một lớp dựng payload thuần dùng chung cho cả hai bề mặt báo giá, để loại bỏ logic trùng lặp và mọi sai khác mặc định gây lệch giá.

#### Acceptance Criteria

1. THE Lớp_Dựng_Payload SHALL cung cấp hàm thuần dựng payload cho `product_type` `loose`, `bound`, và `large_format` từ Đầu_Vào_Chuẩn_Hóa.
2. THE Lớp_Dựng_Payload SHALL là hàm thuần không thực hiện I/O, không gọi mạng, và không đọc trạng thái ngoài.
3. WHEN Đầu_Vào_Chuẩn_Hóa giống nhau được truyền cho cùng một `product_type`, THE Lớp_Dựng_Payload SHALL trả về payload tương đương bất kể được gọi từ Báo_Giá_Mini hay Báo_Giá_Chi_Tiết.
4. WHEN Báo_Giá_Mini dựng payload tính giá, THE Báo_Giá_Mini SHALL gọi Lớp_Dựng_Payload thay vì dựng payload nội bộ.
5. WHEN Báo_Giá_Chi_Tiết dựng payload tính giá, THE Báo_Giá_Chi_Tiết SHALL gọi Lớp_Dựng_Payload thay vì dựng payload nội bộ.

### Requirement 2: Thống nhất quy ước hàng cuốn (bound)

**User Story:** Là một nhân viên báo giá, tôi muốn hàng cuốn cho cùng giá ở cả hai bề mặt, để khách hàng không nhận được giá lệch nhau cho cùng sản phẩm.

#### Acceptance Criteria

1. WHEN dựng payload cho `product_type` `bound`, THE Lớp_Dựng_Payload SHALL đặt `inner.page_count` bằng `max(0, page_count - 4)`.
2. WHEN dựng payload cho `product_type` `bound`, THE Lớp_Dựng_Payload SHALL gắn `inner.print_type` cho mỗi mục ruột.
3. WHEN dựng payload cho `product_type` `bound`, THE Lớp_Dựng_Payload SHALL đặt `inner.print_side` cho mỗi mục ruột theo Đầu_Vào_Chuẩn_Hóa.
4. WHEN dựng payload `bound` mà thiếu thông tin bìa hoặc ruột bắt buộc, THEN THE Lớp_Dựng_Payload SHALL báo lỗi đầu vào không hợp lệ thay vì tạo payload với giá trị suy đoán.

### Requirement 3: Thống nhất quy ước hàng rời (loose)

**User Story:** Là một nhân viên báo giá, tôi muốn hàng rời cho cùng giá ở cả hai bề mặt, để giá dàn khuôn và loại in không lệch nhau.

#### Acceptance Criteria

1. THE Lớp_Dựng_Payload SHALL dùng giá trị `gap_h` và `gap_v` từ Đầu_Vào_Chuẩn_Hóa cho `product_type` `loose`.
2. WHERE Đầu_Vào_Chuẩn_Hóa không cung cấp `gap_h` hoặc `gap_v`, THE Lớp_Dựng_Payload SHALL áp dụng cùng một giá trị gap mặc định thống nhất cho cả hai bề mặt.
3. THE Lớp_Dựng_Payload SHALL xác định `print_type` cho `loose` theo cùng một quy tắc cho cả hai bề mặt.
4. WHEN dựng payload cho `product_type` `loose`, THE Lớp_Dựng_Payload SHALL biểu diễn `item_width` và `item_height` theo cùng một đơn vị (mm) cho cả hai bề mặt.

### Requirement 4: Thống nhất quy ước khổ lớn (large_format)

**User Story:** Là một nhân viên báo giá, tôi muốn khổ lớn cho cùng giá ở cả hai bề mặt, để việc quy đổi đơn vị không gây lệch giá.

#### Acceptance Criteria

1. THE Lớp_Dựng_Payload SHALL biểu diễn `width` và `height` của `large_format` theo cùng một đơn vị (mm) cho cả hai bề mặt.
2. WHEN Đầu_Vào_Chuẩn_Hóa cung cấp kích thước theo một đơn vị đã khai báo tường minh, THE Lớp_Dựng_Payload SHALL quy đổi sang mm bằng hệ số chuyển đổi tường minh thay vì heuristic theo ngưỡng giá trị.
3. THE Lớp_Dựng_Payload SHALL xác định `print_type` cho `large_format` theo cùng một quy tắc cho cả hai bề mặt.

### Requirement 5: Thống nhất định danh processing

**User Story:** Là một lập trình viên, tôi muốn định danh gia công thống nhất giữa hai bề mặt, để engine nhận cùng một biểu diễn cho cùng một lựa chọn gia công.

#### Acceptance Criteria

1. THE Lớp_Dựng_Payload SHALL biểu diễn mỗi mục processing theo cùng một định dạng định danh cho cùng một `product_type` ở cả hai bề mặt.
2. WHERE quy ước của một `product_type` yêu cầu thuộc tính `side` cho processing, THE Lớp_Dựng_Payload SHALL gắn `side` theo Đầu_Vào_Chuẩn_Hóa.
3. WHEN cùng một lựa chọn gia công được cung cấp qua Đầu_Vào_Chuẩn_Hóa, THE Lớp_Dựng_Payload SHALL tạo cùng một biểu diễn processing bất kể bề mặt gọi.

### Requirement 6: Chuẩn hóa đọc kết quả engine (envelope)

**User Story:** Là một lập trình viên, tôi muốn một hàm dùng chung đọc kết quả engine, để hai dạng envelope khác nhau không gây ra cách xử lý kết quả khác nhau.

#### Acceptance Criteria

1. WHEN nhận phản hồi dạng `{success, data}`, THE Bộ_Đọc_Envelope SHALL trích xuất đối tượng kết quả từ trường `data`.
2. WHEN nhận phản hồi dạng object kết quả trực tiếp, THE Bộ_Đọc_Envelope SHALL trả về chính đối tượng đó.
3. IF phản hồi báo trạng thái thất bại hoặc thiếu dữ liệu kết quả, THEN THE Bộ_Đọc_Envelope SHALL trả về biểu diễn lỗi chuẩn hóa.
4. WHEN cùng một kết quả giá được bao bởi hai dạng envelope khác nhau, THE Bộ_Đọc_Envelope SHALL trả về cùng một đối tượng kết quả chuẩn hóa.

### Requirement 7: Định dạng tiền tệ nhất quán ở Báo giá mini

**User Story:** Là một nhân viên CSKH, tôi muốn tiền tệ ở báo giá mini hiển thị nhất quán với phần còn lại của ứng dụng, để khách hàng thấy định dạng giá thống nhất.

#### Acceptance Criteria

1. WHEN hiển thị giá trị tiền tệ trong `QuoteResultDisplay`, THE Báo_Giá_Mini SHALL dùng `formatVND` thay vì `toLocaleString('vi-VN')` kèm hậu tố `đ` tự ghép.
2. WHEN sinh văn bản báo giá chèn vào chat, THE Báo_Giá_Mini SHALL dùng `formatVND` cho mọi giá trị tiền tệ.
3. THE Báo_Giá_Mini SHALL hiển thị mỗi giá trị tiền tệ với đúng một ký hiệu tiền tệ.

### Requirement 8: Trường bắt buộc theo metadata template

**User Story:** Là một nhân viên CSKH, tôi muốn báo giá mini xác định trường bắt buộc theo metadata template, để cảnh báo "thiếu trường bắt buộc" phản ánh đúng cấu hình sản phẩm.

#### Acceptance Criteria

1. WHEN xác định trường bắt buộc cho một template, THE Báo_Giá_Mini SHALL dùng cờ `is_required` trong metadata template thay vì danh sách nhánh hardcode.
2. WHEN một template không khai báo `is_required` cho một trường, THE Báo_Giá_Mini SHALL coi trường đó là không bắt buộc.

### Requirement 10: Giữ trường ruột/bìa khi chuẩn hóa mini ở backend (parity bound thật)

**User Story:** Là một nhân viên báo giá, tôi muốn hàng cuốn báo qua chatbot cho đúng giá như trang chi tiết, để không phát sinh chênh lệch do lớp chuẩn hóa backend.

#### Bối cảnh

`QuoteService.calculateMiniQuote` (đường `/quote/pricing-calc` mà Báo_Giá_Mini dùng) hiện **lột bỏ** `inner.page_count`, `inner.print_type` và `cover.print_type` khi map payload, khiến engine `bound-calculator` tự chia trọn `page_count` cho ruột (không trừ 4 trang bìa). Trong khi Báo_Giá_Chi_Tiết gọi thẳng `/pricing/calculate` nên giữ `inner.page_count = page_count - 4`. Do đó parity hàng cuốn KHÔNG thể đạt nếu chỉ sửa frontend.

#### Acceptance Criteria

1. WHEN `calculateMiniQuote` chuẩn hóa payload `bound` và một mục `inner` có `page_count`, THE `calculateMiniQuote` SHALL truyền tiếp `inner.page_count` xuống engine thay vì loại bỏ.
2. WHEN `calculateMiniQuote` chuẩn hóa payload `bound` và một mục `inner` có `print_type`, THE `calculateMiniQuote` SHALL truyền tiếp `inner.print_type` xuống engine.
3. WHEN `calculateMiniQuote` chuẩn hóa payload `bound` và `cover` có `print_type`, THE `calculateMiniQuote` SHALL truyền tiếp `cover.print_type` xuống engine.
4. WHERE một trường ruột/bìa không được cung cấp, THE `calculateMiniQuote` SHALL giữ nguyên hành vi fallback hiện tại (không phá vỡ các luồng đang gọi).
5. THE thay đổi này SHALL chỉ giới hạn trong `QuoteService.calculateMiniQuote` (không đổi engine `bound-calculator`, không đổi schema DB, không đổi endpoint).

### Requirement 9: Ghi nhận giới hạn ngoài phạm vi

**User Story:** Là một chủ sản phẩm, tôi muốn các giới hạn đã biết được ghi nhận rõ ràng, để các quyết định ngoài phạm vi sửa lần này được theo dõi minh bạch.

#### Acceptance Criteria

1. THE Tài_Liệu_Thiết_Kế SHALL ghi nhận giới hạn về độ trễ master-data của Báo_Giá_Mini do `MASTER_DATA_TTL` (5 phút) so với master-data tươi của Báo_Giá_Chi_Tiết.
2. THE Tài_Liệu_Thiết_Kế SHALL ghi nhận giới hạn về cache in-memory `loadProductTemplates()` của auto-detect có thể lệch so với danh sách sản phẩm live.
3. THE Tài_Liệu_Thiết_Kế SHALL ghi nhận khoảng trống quy trình rằng Báo_Giá_Mini không lưu vào pipeline đơn (`/erp/orders`) mà chỉ chèn văn bản vào chat.

### Requirement 10: Backend giữ thông tin ruột/bìa cho parity hàng cuốn

**User Story:** Là một nhân viên báo giá, tôi muốn hàng cuốn báo qua chatbot cho cùng giá với trang chi tiết, để khách không nhận giá lệch — kể cả khi việc chuẩn hóa diễn ra ở backend.

#### Bối cảnh kỹ thuật

Đường đi của Báo_Giá_Mini (`POST /quote/pricing-calc`) đi qua `QuoteService.calculateMiniQuote`, hàm này hiện **lột bỏ** `inner.page_count` và `inner.print_type` (và không truyền `cover.print_type`) trước khi gọi engine. Engine `bound-calculator` khi **không** nhận `inner.page_count` sẽ tự phân bổ trọn `page_count` cho ruột (không trừ 4 trang bìa) → mini tính dư trang ruột so với Báo_Giá_Chi_Tiết. Vì việc lột bỏ nằm ở backend, parity hàng cuốn KHÔNG thể đạt được chỉ bằng thay đổi frontend.

#### Acceptance Criteria

1. WHEN `calculateMiniQuote` xử lý payload `bound` mà mỗi mục `inner` có `page_count`, THE QuoteService SHALL truyền tiếp `inner.page_count` đó tới engine thay vì bỏ đi.
2. WHEN một mục `inner` có `print_type`, THE QuoteService SHALL truyền tiếp `inner.print_type` tới engine.
3. WHEN `cover` có `print_type`, THE QuoteService SHALL truyền tiếp `cover.print_type` tới engine.
4. WHERE một mục `inner` (hoặc `cover`) KHÔNG có `page_count`/`print_type`, THE QuoteService SHALL giữ nguyên hành vi fallback hiện tại (không phá vỡ các luồng đang gọi mà không có các trường này).
5. WHEN cùng một sản phẩm `bound` với cùng thông số được tính qua Báo_Giá_Mini và Báo_Giá_Chi_Tiết, THE hệ thống SHALL trả về cùng `inner.page_count` hiệu dụng tại engine (`max(0, page_count - 4)` cho trường hợp một ruột).
