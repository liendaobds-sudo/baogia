# Requirements Document

## Introduction

Tài liệu này mô tả yêu cầu cho **nâng cấp toàn diện nhánh báo giá IN OFFSET** của ZeplaoPrint
(gọi tắt là `EngineOffset`), nhằm hiện thực **trung thành bảng giá thật của tiệm** trong file Excel
`Báo giá OFFSET v7.2 (chuẩn hóa)`. Engine offset hiện tại
(`offset-loose-calculator`, `offset-box-calculator`, `offset-helper`) tính sơ sài theo mô hình máy
generic và **lệch giá so với bảng giá tiệm**, nên sẽ được thay ruột hoàn toàn.

Phương án đã chốt với người dùng (Phương án A): **thay thế lõi tính giá offset** bằng engine
"bảng giá tiệm" theo Excel, **GIỮ nguyên các endpoint `/pricing/offset/*`** (calculate + master-data +
CRUD admin) nhưng đổi mô hình dữ liệu/cấu hình bên dưới. Engine cũ được **giữ tạm** cho tới khi engine
mới khớp Excel rồi mới gỡ (không phá vỡ runtime trong lúc chuyển). KHÔNG cần tương thích đơn offset
đã tạo bằng engine cũ.

Quyết định lưu trữ cấu hình (đã chốt): **bảng cấu hình offset mới trong cơ sở dữ liệu** (vì
`synchronize=false`, kèm **migration SQL idempotent** và **seed từ `báo giá/data/*.json`**), engine
thuần nhận một cấu trúc `PricingData` (nạp từ DB lúc chạy, nạp trực tiếp JSON khi chạy golden test).
Admin sửa giá/định mức trực tiếp trên các bảng cấu hình này qua CRUD. Cách này tối giản cho tiệm in nhỏ:
JSON là nguồn mặc định để seed, DB cho phép override.

Phạm vi **KHÔNG** bao gồm: đổi schema digital (`unified_products`, `pricing_tiers`...) và đổi engine
digital `/pricing/calculate`. Offset là nhánh độc lập.

Chuẩn nghiệm thu chính: với **bộ input mặc định** của từng sheet Excel, đơn giá một sản phẩm
(`donGia1SP`) do `EngineOffset` trả về phải **khớp Excel với sai số tối đa 1đ**, theo thứ tự port:
Tờ rơi → Bì thư/Folder → Sản phẩm khác → Hộp → Túi.

## Glossary

- **EngineOffset**: Lớp hàm thuần TypeScript thực hiện toàn bộ logic tính giá offset theo bảng giá tiệm, tách khỏi NestJS/DB.
- **PricingData**: Cấu trúc dữ liệu cung cấp toàn bộ hằng số và bảng tra cứu cho `EngineOffset`; nạp từ DB lúc chạy hoặc từ JSON khi kiểm thử.
- **ConfigStore**: Tầng lưu trữ cấu hình offset trong cơ sở dữ liệu (các bảng cấu hình offset mới) cùng migration và seed.
- **Controller**: Lớp mỏng `OffsetController` (NestJS) phục vụ các endpoint `/pricing/offset/*`.
- **Configurator**: Thành phần frontend `OffsetQuoteConfigurator` thu thập input và hiển thị báo giá.
- **EngineCu**: Engine offset hiện tại (`offset-loose-calculator`, `offset-box-calculator`, `offset-helper`, `offset-master-data`).
- **donGia1SP**: Đơn giá một sản phẩm bằng khách trả chia cho số lượng đặt hàng.
- **SoLuong**: Số lượng sản phẩm khách đặt, đơn vị cái.
- **LuotIn**: Số lượt in bằng số lượng chia số con khổ bình nhân số mặt in.
- **MocSoLuong**: Dãy 17 ngưỡng số lượng chọn bậc đơn giá: [1, 299, 499, 699, 999, 1999, 2999, 4999, 6999, 9999, 19999, 29999, 39999, 49999, 69999, 99999, 999999].
- **BillingMode**: Cách tính tiền một công đoạn, gồm `minCharge`, `perUnit`, `external`.
- **XLBM**: Công đoạn xử lý bề mặt (cán bóng, cán mờ, phủ UV, phủ water base).
- **VatTuBeMat**: Vật tư bề mặt (màng cán) có đơn giá theo kg và số mặt (1 mặt hoặc 2 mặt).
- **SoConTrenKho**: Số con bài xếp được trên một khổ giấy lớn, tính bằng hàm xếp con tối ưu.
- **KhoBinh**: Khổ in (khổ bình bài). **KhoGiayLon**: Khổ tờ giấy gốc. **KhoChuanHoa**: Chuỗi khổ đã chuẩn hóa để tra cứu nhất quán.
- **QuoteResult**: Kết quả báo giá gồm danh sách dòng chi phí và các tổng (chưa VAT, hao hụt, VAT, tổng gồm VAT, chiết khấu, khách trả, donGia1SP).
- **GoldenTest**: Bài kiểm thử so sánh `donGia1SP` của `EngineOffset` với giá trị Excel cho bộ input mặc định.
- **FeatureFlag**: Cờ cấu hình chọn engine xử lý request (`EngineCu` hoặc `EngineOffset`) trong giai đoạn chuyển đổi.

## Requirements

### Requirement 1: Tầng lưu trữ cấu hình offset (ConfigStore) và seed

**User Story:** Là quản trị viên, tôi muốn toàn bộ bảng giá/định mức offset được lưu trong cơ sở dữ liệu và nạp sẵn từ dữ liệu Excel, để có thể chỉnh sửa mà không phải build lại ứng dụng.

#### Acceptance Criteria

1. THE ConfigStore SHALL lưu trữ tám nhóm cấu hình offset: vật tư offset, khổ in và định mức, định mức sản phẩm khổ cố định, bảng công đoạn gia công, kẽm và vật tư bề mặt, ép kim, tham số chung, và phí cố định.
2. WHEN ConfigStore được khởi tạo lần đầu, THE ConfigStore SHALL seed dữ liệu mặc định từ các file `materials_clean.json`, `kho_in.json`, `fixed_sizes.json`, `gia_cong.json`, `kem.json`, `ep_kim.json`, `ty_le.json`, `phi_co_dinh.json`.
3. WHEN migration cấu hình offset chạy lại trên cơ sở dữ liệu đã có bảng cấu hình, THE ConfigStore SHALL giữ nguyên dữ liệu hiện có mà không tạo trùng bảng hoặc trùng bản ghi seed.
4. THE ConfigStore SHALL không thay đổi schema của module digital (`unified_products`, `pricing_tiers`).
5. WHEN `EngineOffset` cần dữ liệu lúc chạy, THE ConfigStore SHALL cung cấp PricingData từ cấu hình trong cơ sở dữ liệu.

### Requirement 2: Tra giá vật liệu theo mã và alias

**User Story:** Là người báo giá, tôi muốn tra đơn giá giấy theo mã vật liệu, để tính chi phí giấy chính xác kể cả khi dùng mã cũ.

#### Acceptance Criteria

1. WHEN một mã vật liệu trùng trường `code` của một bản ghi, THE EngineOffset SHALL trả về giá trị `priceVAT` của bản ghi đó.
2. WHEN một mã vật liệu nằm trong danh sách `aliases` của một bản ghi, THE EngineOffset SHALL trả về giá trị `priceVAT` của bản ghi đó.
3. IF một mã vật liệu không khớp `code` lẫn `aliases` của bất kỳ bản ghi nào, THEN THE EngineOffset SHALL báo lỗi mô tả mã vật liệu không tồn tại.

### Requirement 3: Chọn bậc đơn giá gia công theo MocSoLuong

**User Story:** Là người báo giá, tôi muốn chọn đúng bậc đơn giá theo số lượng, để khớp công thức LOOKUP của Excel.

#### Acceptance Criteria

1. WHEN một số lượng và một dãy `tiers` được cung cấp, THE EngineOffset SHALL chọn chỉ số bậc là vị trí của ngưỡng lớn nhất trong MocSoLuong nhỏ hơn hoặc bằng số lượng đó.
2. WHEN chỉ số bậc chọn được vượt quá độ dài dãy `tiers`, THE EngineOffset SHALL giới hạn chỉ số tại phần tử cuối cùng của dãy `tiers`.
3. THE EngineOffset SHALL chọn bậc đơn giá dựa trên MocSoLuong chứ không dựa trên trường `min` hoặc `max` của các phần tử `tiers`.

### Requirement 4: Tính chi phí công đoạn gia công theo BillingMode

**User Story:** Là người báo giá, tôi muốn tính tiền mỗi công đoạn theo đúng kiểu tính phí của nó, để không nhân nhầm đơn giá trọn gói với số lượng.

#### Acceptance Criteria

1. WHERE công đoạn có BillingMode là `minCharge`, WHEN số lượng nhỏ hơn `MOQ_GiaCong`, THE EngineOffset SHALL trả về giá tối thiểu của công đoạn theo tham số `minChargeParam`.
2. WHERE công đoạn có BillingMode là `minCharge`, WHEN số lượng lớn hơn hoặc bằng `MOQ_GiaCong`, THE EngineOffset SHALL trả về đơn giá bậc nhân với số lượng.
3. WHERE công đoạn có BillingMode là `perUnit`, THE EngineOffset SHALL trả về đơn giá bậc nhân với số lượng.
4. WHERE công đoạn có BillingMode là `external`, THE EngineOffset SHALL tính chi phí công đoạn đó bằng quy tắc riêng của công đoạn thay vì công thức gia công chung.

### Requirement 5: Tính chi phí kẽm in (làm kẽm và bình bài)

**User Story:** Là người báo giá, tôi muốn tính tiền kẽm và bình bài theo loại kẽm, để chi phí in khớp bảng giá tiệm.

#### Acceptance Criteria

1. WHEN tính chi phí làm kẽm, THE EngineOffset SHALL trả về đơn giá một kẽm theo loại kẽm nhân với số kẽm in.
2. THE EngineOffset SHALL xác định loại kẽm nhỏ hoặc lớn từ trường `loaiKem` của bản ghi `kho_in` tương ứng với khổ in.
3. WHEN số lượt in nhỏ hơn hoặc bằng `MOQ_BinhBai`, THE EngineOffset SHALL trả về giá gốc bình bài tra theo bảng kẽm nhỏ hoặc kẽm lớn theo số kẽm.
4. WHEN số lượt in lớn hơn `MOQ_BinhBai`, THE EngineOffset SHALL trả về giá gốc bình bài nhân số lượt in chia cho `MOQ_BinhBai`.

### Requirement 6: Tính chi phí ép kim với đơn vị hỗn hợp

**User Story:** Là người báo giá, tôi muốn tính ép kim đúng đơn vị tính, để không nhân giá trọn gói với số lượng.

#### Acceptance Criteria

1. WHEN vị trí ép kim là "Không", THE EngineOffset SHALL trả về chi phí ép kim bằng 0.
2. WHEN số lượng nhỏ hơn 100, THE EngineOffset SHALL trả về giá trọn gói `duoi100` của vị trí ép kim mà không nhân số lượng.
3. WHEN số lượng từ 100 đến nhỏ hơn 500, THE EngineOffset SHALL trả về đơn giá `tu100_499` nhân số lượng.
4. WHEN số lượng từ 500 đến nhỏ hơn 1000, THE EngineOffset SHALL trả về đơn giá `tu500_999` nhân số lượng.
5. WHEN số lượng lớn hơn hoặc bằng 1000, THE EngineOffset SHALL trả về đơn giá `tren1000` nhân số lượng.

### Requirement 7: Tính chi phí vật tư bề mặt (cán màng)

**User Story:** Là người báo giá, tôi muốn tính tiền cán màng theo diện tích, để chi phí xử lý bề mặt khớp Excel.

#### Acceptance Criteria

1. WHEN vật tư bề mặt khác "Không", THE EngineOffset SHALL tính chi phí vật tư bề mặt bằng diện tích mét vuông của khổ in nhân đơn giá theo kg nhân số mặt nhân số tờ lớn.
2. WHEN vật tư bề mặt là "Không", THE EngineOffset SHALL trả về chi phí vật tư bề mặt bằng 0.
3. WHERE vật tư bề mặt là loại cán 2 mặt, THE EngineOffset SHALL nhân đơn giá XLBM với 2 trước khi áp giá tối thiểu `GiaMin_XLBM`.

### Requirement 8: Tính tỷ lệ hao hụt theo số lượng

**User Story:** Là người báo giá, tôi muốn áp tỷ lệ hao hụt theo bậc số lượng, để dự phòng đúng theo chính sách.

#### Acceptance Criteria

1. WHEN một số lượng được cung cấp, THE EngineOffset SHALL chọn tỷ lệ hao hụt ứng với ngưỡng lớn nhất trong bảng hao hụt nhỏ hơn hoặc bằng số lượng đó.
2. THE EngineOffset SHALL tính giá trị hao hụt bằng tổng chi phí chưa VAT nhân tỷ lệ hao hụt đã chọn.

### Requirement 9: Chuẩn hóa định dạng khổ trước khi tra kho_in

**User Story:** Là lập trình viên, tôi muốn chuẩn hóa chuỗi khổ trước khi tra cứu, để tránh diện tích bằng 0 do lệch định dạng giữa các file.

#### Acceptance Criteria

1. WHEN một chuỗi khổ được dùng để tra `kho_in`, THE EngineOffset SHALL chuẩn hóa chuỗi khổ về một định dạng thống nhất trước khi tra cứu.
2. WHEN chuỗi khổ ở `fixed_sizes` có định dạng khác chuỗi khổ ở `kho_in` nhưng cùng kích thước, THE EngineOffset SHALL tra cứu được cùng một bản ghi `kho_in`.
3. IF một chuỗi khổ sau khi chuẩn hóa không khớp bất kỳ bản ghi `kho_in` nào, THEN THE EngineOffset SHALL báo lỗi mô tả khổ không tra cứu được.

### Requirement 10: Hàm xếp con tối ưu cho khổ tùy chỉnh

**User Story:** Là người báo giá túi và hộp, tôi muốn tự xác định số con tối ưu trên khổ giấy lớn, để không phụ thuộc bảng định mức cố định.

#### Acceptance Criteria

1. WHEN nhận khổ giấy lớn và kích thước con bài, THE EngineOffset SHALL tính số con bằng giá trị lớn nhất giữa hai chiều xếp với khe hở mặc định 0.3cm.
2. WHEN thử các khổ giấy lớn trong `kho_in`, THE EngineOffset SHALL chọn khổ cho số con trên đơn vị diện tích tốt nhất.
3. WHEN một chiều của con bài lớn hơn cả hai chiều của khổ giấy lớn, THE EngineOffset SHALL trả về số con bằng 0 cho khổ đó.

### Requirement 11: Quy ước tổng cuối, chiết khấu và đơn giá sản phẩm

**User Story:** Là người báo giá, tôi muốn tính tổng tiền cuối cùng và đơn giá sản phẩm theo quy ước thống nhất, để mọi loại sản phẩm cho ra con số nhất quán.

#### Acceptance Criteria

1. THE EngineOffset SHALL tính tổng chưa VAT bằng tổng các dòng chi phí thành phần.
2. WHEN đã có tổng chưa VAT, THE EngineOffset SHALL tính VAT bằng tổng chưa VAT nhân `TyLe_VAT`.
3. WHEN tính chiết khấu, THE EngineOffset SHALL áp tỷ lệ chiết khấu chỉ trên chi phí sản xuất và thiết kế, không áp trên chi phí giấy, kẽm và vật tư.
4. WHEN tỷ lệ chiết khấu nhập vào vượt `TyLe_ChietKhau_Max`, THE EngineOffset SHALL giới hạn tỷ lệ chiết khấu tại `TyLe_ChietKhau_Max`.
5. WHEN đã có tổng gồm VAT và chiết khấu, THE EngineOffset SHALL tính khách trả bằng tổng gồm VAT trừ chiết khấu, và donGia1SP bằng khách trả chia cho số lượng đặt hàng.

### Requirement 12: Báo giá Tờ rơi / Tờ gấp / Letter

**User Story:** Là người báo giá, tôi muốn báo giá tờ rơi khổ cố định, để khách nhận đơn giá khớp Excel.

#### Acceptance Criteria

1. WHEN nhận input tờ rơi hợp lệ, THE EngineOffset SHALL tra khổ in, khổ giấy lớn và số con từ `fixed_sizes.toRoi` theo kích thước đã chọn.
2. THE EngineOffset SHALL tính lượt in, số tờ lớn, chi phí giấy, chi phí kẽm, chi phí vật tư bề mặt, khuôn, bình bài, gia công bề mặt, bế, thành phẩm gấp, cắt xén, đóng gói và thiết kế theo công thức sheet tờ rơi.
3. WHEN hoàn tất tính toán, THE EngineOffset SHALL trả về QuoteResult gồm danh sách dòng chi phí và donGia1SP.
4. WHEN dùng bộ input mặc định của sheet tờ rơi, THE EngineOffset SHALL trả về donGia1SP khớp Excel với sai số tối đa 1đ.

### Requirement 13: Báo giá Bì thư / Folder

**User Story:** Là người báo giá, tôi muốn báo giá bì thư và folder khổ cố định, để khách nhận đơn giá khớp Excel.

#### Acceptance Criteria

1. WHEN nhận input bì thư hoặc folder hợp lệ, THE EngineOffset SHALL tra khổ và số con từ `fixed_sizes.biThuFolder` theo kích thước đã chọn.
2. WHERE sản phẩm là bì thư hoặc folder, THE EngineOffset SHALL áp công đoạn dán thay cho công đoạn gấp.
3. WHEN hoàn tất tính toán, THE EngineOffset SHALL trả về QuoteResult gồm danh sách dòng chi phí và donGia1SP.
4. WHEN dùng bộ input mặc định của sheet bì thư hoặc folder, THE EngineOffset SHALL trả về donGia1SP khớp Excel với sai số tối đa 1đ.

### Requirement 14: Báo giá Sản phẩm khác

**User Story:** Là người báo giá, tôi muốn báo giá sản phẩm khổ in nhập trực tiếp, để xử lý các mặt hàng không thuộc khổ cố định.

#### Acceptance Criteria

1. WHEN nhận input sản phẩm khác hợp lệ, THE EngineOffset SHALL tra số con, khổ giấy lớn và số con khổ giấy lớn từ `kho_in` theo khổ in đã chọn.
2. THE EngineOffset SHALL tính chi phí ép kim theo quy tắc đơn vị hỗn hợp cho sản phẩm khác.
3. WHEN hoàn tất tính toán, THE EngineOffset SHALL trả về QuoteResult gồm danh sách dòng chi phí và donGia1SP.
4. WHEN dùng bộ input mặc định của sheet sản phẩm khác, THE EngineOffset SHALL trả về donGia1SP khớp Excel với sai số tối đa 1đ.

### Requirement 15: Báo giá Hộp giấy

**User Story:** Là người báo giá, tôi muốn báo giá hộp giấy khổ tùy chỉnh, để khách nhận đơn giá khớp Excel.

#### Acceptance Criteria

1. WHEN nhận kích thước hộp, THE EngineOffset SHALL tính khổ trải theo loại hộp với công thức tương ứng đáy thường hoặc đáy gài/dán.
2. WHEN cần chọn khổ in, THE EngineOffset SHALL dùng hàm xếp con tối ưu để chọn khổ giấy lớn cho hộp.
3. THE EngineOffset SHALL áp phí khuôn bế hộp `Gia_Khuon_Hop`, công đoạn dán hộp `DANTD` theo giá tối thiểu `GiaMin_DanHop`, và hỗ trợ bồi 2 lớp.
4. WHEN dùng bộ input mặc định của sheet hộp giấy, THE EngineOffset SHALL trả về donGia1SP khớp Excel với sai số tối đa 1đ.

### Requirement 16: Báo giá Túi giấy

**User Story:** Là người báo giá, tôi muốn báo giá túi giấy khổ tùy chỉnh, để khách nhận đơn giá khớp Excel.

#### Acceptance Criteria

1. WHEN nhận kích thước túi, THE EngineOffset SHALL tính khổ trải với chiều cao trải bằng cao cộng mí cộng hông nhân 0.85 và chiều rộng trải bằng rộng nhân 2 cộng hông nhân 2 cộng 1.5.
2. WHEN cần chọn khổ in, THE EngineOffset SHALL dùng hàm xếp con tối ưu để chọn khổ giấy lớn cho túi.
3. THE EngineOffset SHALL áp công đoạn thành phẩm túi `TP_TUI`, phí thiết kế mặc định `Gia_ThietKe`, và cộng chi phí dây xách và thùng caton theo số lượng và đơn giá nhập vào.
4. WHERE túi dùng khổ ghép thủ công không có trong `kho_in`, THE EngineOffset SHALL xử lý khổ "(dán nối)" bằng quy tắc riêng thay vì tra `kho_in`.
5. WHEN dùng bộ input mặc định của sheet túi giấy, THE EngineOffset SHALL trả về donGia1SP khớp Excel với sai số tối đa 1đ.

### Requirement 17: Endpoint tính giá và định tuyến theo loại

**User Story:** Là frontend, tôi muốn gọi một endpoint duy nhất với trường loại sản phẩm, để nhận về báo giá đầy đủ.

#### Acceptance Criteria

1. THE Controller SHALL giữ nguyên prefix endpoint `/pricing/offset/calculate`.
2. WHEN nhận request có trường `type` thuộc tập {`to_roi`, `bi_thu_folder`, `sp_khac`, `hop_giay`, `tui_giay`}, THE Controller SHALL gọi hàm `EngineOffset` tương ứng với loại đó.
3. WHEN `EngineOffset` trả về QuoteResult, THE Controller SHALL trả breakdown đầy đủ gồm danh sách dòng chi phí và các tổng cho frontend.
4. IF trường `type` không thuộc tập hợp lệ, THEN THE Controller SHALL trả lỗi mô tả loại sản phẩm không được hỗ trợ.

### Requirement 18: Master-data và CRUD admin cho cấu hình offset

**User Story:** Là quản trị viên, tôi muốn xem và sửa cấu hình giá/định mức offset qua API, để cập nhật bảng giá tiệm khi cần.

#### Acceptance Criteria

1. WHEN frontend gọi endpoint master-data offset, THE Controller SHALL trả về cấu hình offset hiện hành từ ConfigStore để đổ vào các dropdown nhập liệu.
2. WHEN quản trị viên tạo, sửa hoặc xóa một bản ghi cấu hình offset qua endpoint CRUD admin, THE ConfigStore SHALL lưu thay đổi vào cơ sở dữ liệu.
3. WHEN một bản ghi cấu hình offset đã thay đổi, THE EngineOffset SHALL dùng giá trị cấu hình mới cho các lần tính tiếp theo.
4. THE Controller SHALL yêu cầu xác thực cho các endpoint CRUD admin cấu hình offset.

### Requirement 19: Dựng lại Configurator frontend với năm form nhập liệu

**User Story:** Là người dùng, tôi muốn nhập liệu theo từng loại sản phẩm offset đúng với các trường của Excel, để báo giá khớp và dễ thao tác.

#### Acceptance Criteria

1. THE Configurator SHALL giữ nguyên là điểm vào báo giá offset trên frontend.
2. WHEN người dùng chọn một trong năm loại sản phẩm, THE Configurator SHALL hiển thị form nhập liệu tương ứng với các trường input của loại đó.
3. WHEN người dùng gửi form báo giá, THE Configurator SHALL gọi endpoint `/pricing/offset/calculate` với trường `type` và các trường input của loại sản phẩm.
4. WHEN nhận QuoteResult từ backend, THE Configurator SHALL hiển thị danh sách dòng chi phí và donGia1SP.

### Requirement 20: Chuẩn nghiệm thu khớp Excel và thứ tự port

**User Story:** Là chủ tiệm, tôi muốn đơn giá khớp bảng giá Excel hiện hành theo từng loại, để tin tưởng vào hệ thống báo giá mới.

#### Acceptance Criteria

1. THE EngineOffset SHALL cho ra donGia1SP khớp Excel với sai số tối đa 1đ cho mỗi loại sản phẩm khi dùng bộ input mặc định của sheet tương ứng.
2. THE GoldenTest SHALL được tạo cho năm loại sản phẩm theo thứ tự Tờ rơi, Bì thư/Folder, Sản phẩm khác, Hộp, Túi.
3. WHERE chưa rút được con số Excel chính xác cho một loại, THE GoldenTest SHALL được tạo dưới dạng khung kiểm thử kèm đánh dấu TODO để điền giá trị kỳ vọng sau.

### Requirement 21: Giữ tạm và gỡ bỏ engine cũ an toàn

**User Story:** Là lập trình viên, tôi muốn chuyển đổi engine an toàn, để không phá vỡ runtime trong lúc engine mới chưa khớp Excel.

#### Acceptance Criteria

1. WHILE engine mới chưa khớp Excel cho toàn bộ năm loại, THE Controller SHALL giữ EngineCu khả dụng để xử lý request.
2. WHERE FeatureFlag chọn EngineOffset, THE Controller SHALL định tuyến request `/pricing/offset/calculate` tới EngineOffset.
3. WHEN toàn bộ GoldenTest của năm loại sản phẩm đã khớp Excel, THE Controller SHALL gỡ bỏ EngineCu khỏi luồng xử lý request.
4. WHEN EngineCu được gỡ bỏ, THE EngineOffset SHALL là engine duy nhất phục vụ tính giá offset.
