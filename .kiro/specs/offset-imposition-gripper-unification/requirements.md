# Requirements Document

## Introduction

Engine tính giá offset của ZeplaoPrint hiện tính "số con/tờ" (dàn khuôn / imposition) bằng một hàm lưới đơn giản `soConTrenKho()` và `imposeFromKhoIn()` trong `backend/src/modules/pricing/offset-engine/lookups.ts`. Hàm này CHỈ trừ lề giấy cấu hình (thường = 0) và dùng khe hở cố định 0.3cm; nó BỎ QUA lề tay-kê và cắn-nhíp (gripper). Trong khi đó công cụ dàn khuôn vật lý `nestRectOnSheet()` / `nestOnSheet()` (`backend/src/modules/pricing/dieline/nesting.ts`, cấu hình `DEFAULT_NESTING_CONFIG`) mô hình hóa đúng máy in offset: lề 10mm mỗi cạnh, gripper 12mm cạnh đầu, gutter 3mm giữa các con. Hệ quả đã được audit xác minh: cùng một sản phẩm + khổ giấy cho ra ba con số "con/tờ" khác nhau (cơ sở tính giá `meta.soConToLon`, tab `DielinePreview` `countPerSheet`, và lưới `OffsetPreviewSVG`); GIÁ lại tính trên con số lạc quan (cao) nhất, khiến giá báo có thể thấp hơn sản lượng xưởng thực tế cho phép.

Tính năng này thống nhất imposition về MỘT NGUỒN SỰ THẬT DUY NHẤT (mô hình dàn khuôn vật lý có lề/gripper/gutter), để **giá ≡ preview ≡ sản lượng máy in thực tế**. Đây là vùng tới hạn về giá (audit-rules §4, §7, §8): thay đổi này SẼ làm dịch số giá offset; phải re-baseline golden test có giải trình, giữ bất biến VAT, cấu hình được lề/gripper/gutter theo từng khổ in, có chế độ chạy song song (shadow) để đối chiếu trước khi đổi mặc định, có cổng kiểm chứng nghiệp vụ và đường rollback.

## Glossary

- **Engine_Offset**: Cụm engine tính giá offset (`EngineOffsetService` + `offset-engine/*`: `lookups.ts`, `totals.ts`, `waste-cascade.ts`, `products/*`).
- **Imposition_Service**: Hàm/dịch vụ dàn khuôn THỐNG NHẤT mới, là nguồn sự thật duy nhất tính số con/tờ và số con/bài-in, dùng chung bởi cả tính giá và preview.
- **Nesting_Tool**: Công cụ dàn khuôn vật lý hiện có (`nestRectOnSheet()` / `nestOnSheet()` trong `dieline/nesting.ts`) mô hình hóa máy in offset.
- **Legacy_Grid**: Hàm imposition lưới cũ (`soConTrenKho()`, `imposeFromKhoIn()`, `soConKhoTinh()`) chỉ trừ lề giấy + gap 0.3cm.
- **So_Con**: Số con (đơn vị thành phẩm) trên một tờ giấy lớn (tương đương `soConToLon` / `countPerSheet`).
- **So_Con_Bai_In**: Số con trên một khổ bài in (khổ trung gian sau khi pha tờ lớn).
- **Margin_Config**: Bộ thông số lề tay-kê (trái/phải/trên/dưới), cắn-nhíp (gripper) và gutter, cấu hình được theo từng khổ in.
- **Kho_In**: Bản ghi khổ in trong PricingData; đã có sẵn `marginLeft/Right/Top/Bottom` (từ `paper_sizes.margin_*`).
- **Shadow_Mode**: Chế độ chạy song song Legacy_Grid và Imposition_Service trên cùng dữ liệu để so sánh, KHÔNG đổi giá xuất ra.
- **Golden_Test**: `backend/src/modules/pricing/offset-engine/__tests__/offset-price-preservation.golden.spec.ts` — pin số giá engine offset trên input cố định.
- **Re_Baseline**: Quy trình tính lại số kỳ vọng của Golden_Test có giải trình từng thay đổi, KHÔNG nới lỏng tolerance.
- **VAT_Invariant**: Bất biến "VAT một nguồn" (audit-rules §7): Engine_Offset là VAT-exclusive; VAT chỉ áp một lần ở tầng báo giá.
- **Business_Validation_Gate**: Cổng kiểm chứng nghiệp vụ — đối chiếu giá mới với 5–10 báo giá xưởng thật, mục tiêu sai lệch ±2%.
- **Product_Type**: Loại sản phẩm offset: `to_roi`, `bi_thu_folder`, `sp_khac`, `hop_giay`, `tui_giay`.
- **Tui_Giay_Path**: Đường imposition riêng của `tui_giay` (`buildTuiOptions` / `TUI_NEST_OPTIONS`).
- **Preview**: Thành phần hiển thị dàn khuôn ở frontend (`OffsetPreviewSVG.tsx`, `DielinePreview.tsx`) trong `OffsetQuoteConfigurator.tsx`.
- **PDF_Render**: Kết xuất PDF báo giá ở backend (`quote-pdf.service.ts`).
- **Sheets_Net**: Số tờ giấy ròng cần in `= ceil(piecesIntoPress / So_Con)` (trong `totals.ts` / `waste-cascade.ts`).

## Requirements

### Requirement 1: Nguồn cấu hình lề / gripper / gutter theo khổ in

**User Story:** Là quản trị viên định giá, tôi muốn cấu hình lề tay-kê, cắn-nhíp và gutter cho từng khổ in, để imposition phản ánh đúng máy in của xưởng mà không phải sửa code.

#### Acceptance Criteria

1. THE Engine_Offset SHALL đọc Margin_Config (lề trái, lề phải, lề trên, lề dưới, gripper, gutter) cho mỗi Kho_In từ nguồn cấu hình quản trị sửa được, không lấy giá trị mã hóa cứng.
2. WHERE một Kho_In đã có `marginLeft`, `marginRight`, `marginTop`, `marginBottom` từ `paper_sizes.margin_*`, THE Engine_Offset SHALL dùng các giá trị đó làm lề tay-kê cho Kho_In tương ứng.
3. IF một Kho_In thiếu giá trị gripper hoặc gutter trong nguồn cấu hình, THEN THE Engine_Offset SHALL áp giá trị mặc định gripper 12mm và gutter 3mm.
4. WHEN quản trị viên cập nhật Margin_Config cho một Kho_In qua endpoint cấu hình (`cfg/*` của `offset.controller.ts`), THE Engine_Offset SHALL dùng giá trị mới cho các lần tính giá và preview sau đó mà không cần triển khai lại mã nguồn.
5. THE Engine_Offset SHALL biểu diễn mọi giá trị Margin_Config theo đơn vị milimet và chuyển đổi nhất quán sang đơn vị nội bộ của hàm dàn khuôn.
6. IF một giá trị Margin_Config nhỏ hơn 0 hoặc khiến vùng in khả dụng nhỏ hơn hoặc bằng 0, THEN THE Engine_Offset SHALL trả về lỗi mô tả rõ khổ in và thông số sai.

### Requirement 2: Hàm imposition thống nhất làm nguồn sự thật duy nhất

**User Story:** Là kỹ sư định giá, tôi muốn một hàm dàn khuôn duy nhất dùng chung cho cả tính giá và preview, để số con/tờ không còn mâu thuẫn giữa các thành phần.

#### Acceptance Criteria

1. THE Imposition_Service SHALL tính So_Con và So_Con_Bai_In cho một sản phẩm phẳng dựa trên mô hình dàn khuôn vật lý có trừ lề tay-kê, gripper và gutter theo Margin_Config.
2. WHEN Engine_Offset cần So_Con để tính giá, THE Engine_Offset SHALL lấy giá trị từ Imposition_Service.
3. WHEN Preview hiển thị số con/tờ, THE Preview SHALL hiển thị giá trị do Imposition_Service tính.
4. WHEN PDF_Render kết xuất số con/tờ, THE PDF_Render SHALL kết xuất giá trị do Imposition_Service tính.
5. THE Imposition_Service SHALL thử cả hai hướng đặt con (0° và 90°) và chọn hướng cho ra số con/tờ lớn hơn.
6. WHEN cùng một bộ input (kích thước thành phẩm, Kho_In, Margin_Config) được cung cấp, THE Imposition_Service SHALL trả về cùng một So_Con qua mọi lần gọi (xác định, không phụ thuộc thứ tự phép tính float).

### Requirement 3: Giá tính trên số con đã tôn trọng lề/gripper

**User Story:** Là chủ xưởng, tôi muốn giá báo dựa trên sản lượng thực tế của máy in, để giá không thấp hơn chi phí thật.

#### Acceptance Criteria

1. THE Engine_Offset SHALL tính `Sheets_Net = ceil(piecesIntoPress / So_Con)` dùng So_Con từ Imposition_Service.
2. WHEN So_Con giảm so với Legacy_Grid cho cùng sản phẩm và khổ, THE Engine_Offset SHALL phản ánh số tờ giấy tăng tương ứng vào chi phí giấy và mô hình bù hao cascade (`waste-cascade.ts`, `tongHopKetQua` trong `totals.ts`).
3. THE Engine_Offset SHALL giữ logic mô hình bù hao cascade và tổng hợp kết quả đúng đắn sau khi thay đổi nguồn So_Con.
4. IF Imposition_Service trả về So_Con bằng 0 cho một sản phẩm vừa với khổ giấy, THEN THE Engine_Offset SHALL trả về lỗi mô tả thay vì chia cho 0 hoặc trả giá bằng 0.

### Requirement 4: Bất biến VAT không đổi

**User Story:** Là kế toán, tôi muốn thay đổi imposition không động đến cách áp VAT, để hóa đơn không bị sai thuế hay tính VAT hai lần.

#### Acceptance Criteria

1. THE Engine_Offset SHALL giữ trạng thái VAT-exclusive: `vatPct = vatRate ?? 0` trong `totals.ts`, không lấy VAT từ `pricing_config`, tenant settings hay hằng số mã hóa cứng.
2. WHEN imposition thay đổi So_Con và do đó thay đổi giá trước VAT, THE Engine_Offset SHALL áp VAT đúng một lần ở tầng báo giá theo `vat_rate` nhập lúc báo giá.
3. WHEN chạy với cùng `vatRate` đầu vào trước và sau thay đổi imposition, THE Engine_Offset SHALL cho ra cùng tỷ lệ VAT trên giá trước VAT (không xuất hiện nguồn VAT mới).

### Requirement 5: Chế độ chạy song song (shadow) để đối chiếu

**User Story:** Là kỹ sư phát hành, tôi muốn chạy song song imposition cũ và mới trên dữ liệu thật trước khi đổi mặc định, để đánh giá tác động giá mà chưa thay đổi giá xuất ra.

#### Acceptance Criteria

1. WHERE Shadow_Mode được bật, THE Engine_Offset SHALL tính cả So_Con theo Legacy_Grid và So_Con theo Imposition_Service cho mỗi yêu cầu tính giá.
2. WHILE Shadow_Mode được bật, THE Engine_Offset SHALL trả ra giá dựa trên nguồn imposition đang đặt làm mặc định và đính kèm số liệu so sánh (So_Con cũ, So_Con mới, chênh lệch giá) trong metadata mà không thay đổi giá xuất ra.
3. THE Engine_Offset SHALL ghi lại số liệu so sánh Shadow_Mode để phân tích chênh lệch giữa hai phương pháp imposition.
4. THE Engine_Offset SHALL cho phép bật hoặc tắt Shadow_Mode qua cấu hình mà không cần triển khai lại mã nguồn.

### Requirement 6: Đổi mặc định an toàn và rollback

**User Story:** Là kỹ sư phát hành, tôi muốn chuyển nguồn imposition mặc định và quay lui được, để giảm rủi ro khi phát hành thay đổi nhạy cảm về giá.

#### Acceptance Criteria

1. THE Engine_Offset SHALL hỗ trợ một cờ cấu hình chọn nguồn imposition mặc định giữa Legacy_Grid và Imposition_Service.
2. WHEN cờ cấu hình đặt nguồn mặc định là Imposition_Service, THE Engine_Offset SHALL dùng So_Con từ Imposition_Service cho mọi giá xuất ra.
3. WHEN cờ cấu hình đặt nguồn mặc định là Legacy_Grid, THE Engine_Offset SHALL khôi phục hành vi tính giá tương đương trước thay đổi.
4. THE Engine_Offset SHALL cho phép chuyển đổi nguồn imposition mặc định mà không cần triển khai lại mã nguồn.

### Requirement 7: Re-baseline golden test có giải trình

**User Story:** Là người bảo trì engine giá, tôi muốn golden test được tính lại kèm giải trình, để mọi thay đổi số giá đều có chủ đích và truy vết được.

#### Acceptance Criteria

1. WHEN nguồn imposition mặc định chuyển sang Imposition_Service, THE Golden_Test SHALL được cập nhật bằng số kỳ vọng tính lại từ hành vi mới.
2. THE Re_Baseline SHALL kèm giải trình bằng văn bản cho mỗi giá trị golden thay đổi, nêu rõ lý do thay đổi là đúng.
3. THE Re_Baseline SHALL giữ nguyên độ chặt tolerance của Golden_Test (không nới lỏng để "cho xanh").
4. WHEN Golden_Test chạy sau Re_Baseline, THE Golden_Test SHALL đạt với chênh lệch trong tolerance ban đầu.
5. THE Engine_Offset SHALL giữ các property test giá (`break-even.property`, `totals.property`, `vat.property`) đạt mà không giảm số vòng chạy hay nâng tolerance.

### Requirement 8: Cổng kiểm chứng nghiệp vụ ±2%

**User Story:** Là chủ xưởng, tôi muốn giá mới được đối chiếu với báo giá thật trước khi áp dụng, để đảm bảo giá khớp thực tế kinh doanh.

#### Acceptance Criteria

1. THE Business_Validation_Gate SHALL đối chiếu giá do Imposition_Service tạo ra với từ 5 đến 10 báo giá xưởng thật.
2. WHEN sai lệch giá so với mỗi báo giá xưởng thật nằm trong khoảng ±2%, THE Business_Validation_Gate SHALL ghi nhận trường hợp đó là đạt.
3. IF sai lệch giá của một trường hợp vượt quá ±2%, THEN THE Business_Validation_Gate SHALL đánh dấu trường hợp đó để rà soát trước khi cho phép đổi nguồn mặc định.
4. THE Business_Validation_Gate SHALL ghi lại kết quả đối chiếu (sản phẩm, khổ, giá thật, giá mới, % sai lệch) cho từng trường hợp.

### Requirement 9: Áp dụng theo từng loại sản phẩm, bao gồm tui_giay

**User Story:** Là kỹ sư định giá, tôi muốn imposition thống nhất áp dụng nhất quán cho mọi loại sản phẩm offset, để không loại nào còn dùng số con lạc quan sai.

#### Acceptance Criteria

1. THE Engine_Offset SHALL dùng So_Con từ Imposition_Service cho các Product_Type `to_roi`, `bi_thu_folder`, `sp_khac` và `hop_giay`.
2. THE Engine_Offset SHALL xác định rõ Tui_Giay_Path (`buildTuiOptions` / `TUI_NEST_OPTIONS`) có hợp nhất về Imposition_Service hay không, và áp dụng quyết định đó nhất quán cho Product_Type `tui_giay`.
3. WHERE Tui_Giay_Path giữ đường imposition riêng, THE Engine_Offset SHALL áp cùng Margin_Config lề/gripper/gutter cho Tui_Giay_Path để số con/tờ phản ánh ràng buộc máy in vật lý.
4. WHEN một Product_Type được tính giá, THE Engine_Offset SHALL dùng đúng một nguồn So_Con cho cả tính giá và preview của Product_Type đó.

### Requirement 10: Parity giá ≡ preview ≡ PDF

**User Story:** Là nhân viên báo giá, tôi muốn số con/tờ ở preview, ở cơ sở tính giá và ở PDF luôn trùng nhau, để không gặp ba con số mâu thuẫn cho cùng sản phẩm.

#### Acceptance Criteria

1. WHEN một sản phẩm offset được tính giá, THE Engine_Offset SHALL cho ra So_Con dùng làm cơ sở giá BẰNG So_Con hiển thị ở Preview.
2. WHEN Preview hiển thị dàn khuôn cho một sản phẩm, THE Preview SHALL hiển thị cùng So_Con với cơ sở tính giá (`OffsetPreviewSVG` và `DielinePreview` báo cùng một con số).
3. WHEN PDF_Render kết xuất số con/tờ, THE PDF_Render SHALL kết xuất cùng So_Con với cơ sở tính giá và Preview.
4. THE Engine_Offset SHALL áp dụng snap/làm tròn ở biên nhất quán giữa đường tính giá và đường preview để nhiễu thứ tự phép tính float không làm lệch So_Con giữa hai đường.
5. WHEN đối chiếu trên artifact thật (số con/tờ, khổ bình, vị trí con), THE Engine_Offset SHALL cho ra cùng số con/tờ giữa cơ sở giá, Preview và PDF_Render.
