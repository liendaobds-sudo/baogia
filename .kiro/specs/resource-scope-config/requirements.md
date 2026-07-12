# Requirements Document

## Introduction

Tài liệu này định nghĩa yêu cầu cho việc **phân loại phạm vi áp dụng tài nguyên dùng chung (resource scope configuration)** của hệ ZeplaoPrint — nền tảng báo giá/CSKH cho ngành in ấn (backend NestJS + frontend Next.js, PostgreSQL `zeplao_erp`). Công cụ báo giá phục vụ nhiều phương pháp in: In nhanh/digital (theo loại tờ rời `loose`, đóng cuốn `bound`, khổ lớn `large_format`) và Offset.

**Vấn đề gốc:** Tài nguyên dùng chung — đặc biệt là Gia_Công (`processing_options`), và tương tự Vật_Tư (`materials`), Khổ_Giấy (`paper_sizes`) — được phân loại phạm vi áp dụng bằng các Cờ_Phạm_Vi (`scope_loose`, `scope_bound`, `scope_large_format` kiểu smallint 0/1; `scope_offset` kiểu boolean). Tuy nhiên **hai nguồn dữ liệu đang dùng quy tắc lọc khác nhau**:

- **Màn cài đặt sản phẩm in nhanh** (frontend `ProductModal.tsx`, tab "Cấu hình & Ràng buộc", mục "Gia công được phép") nạp danh sách từ endpoint `/erp/processing-options` (`ProcessingOptionsService.findAll()` = `repository.find()`) → trả **TẤT CẢ** gia công, KHÔNG lọc theo Cờ_Phạm_Vi, KHÔNG lọc trạng-thái-hoạt-động. (Hiện frontend tự lọc lại bằng `scopedProcessing` ở phía client, nhưng quy tắc nằm rải rác và không phải nguồn sự thật.)
- **Màn báo giá in nhanh** lấy gia công từ `/pricing/master-data` (`PricingFacadeService.getMasterData`) → cố tình loại gia công CHỈ-offset bằng điều kiện `WHERE is_active = 1 AND NOT (scope_offset = true AND COALESCE(scope_loose,0)=0 AND COALESCE(scope_bound,0)=0 AND COALESCE(scope_large_format,0)=0)`; các form còn lọc thêm (`BoundForm` theo `scope_bound=1`, `LargeFormatForm` theo `scope_large_format=1`).

**Hệ quả:** người dùng tick được gia công CHỈ-offset (BẾ, ÉP KIM, DÁN HỘP TỰ ĐỘNG, ĐÓNG GÓI, QC, các thành phẩm…) ở màn cài đặt sản phẩm in nhanh, nhưng màn báo giá in nhanh **không bao giờ hiển thị** chúng → triệu chứng "tick rồi mà không hiện". Ground-truth DB đã xác minh: các mục id 39–52 (XLBM, BOI, EPKIM, BE, DANTD, QC, DONGGOI, CATXEN, TP_TC, TP_TUI, TP_MAY, TP_CUON, TP_LOXO, TP_DUCKEO) có `scope_offset=true` và mọi scope in nhanh = 0 nên bị loại khỏi báo giá in nhanh; các mục id 2–25 có scope in nhanh phù hợp.

**Mục tiêu:** Thiết lập một **mô hình phân loại Cờ_Phạm_Vi tài nguyên rõ ràng, là nguồn sự thật duy nhất**, sao cho: (1) mọi nơi đọc cùng một Quy_Tắc_Phạm_Vi nhất quán — thứ tick được ở cài đặt phải hiển thị được ở báo giá tương ứng; (2) màn cài đặt chỉ hiển thị tài nguyên hợp lệ với phương pháp in / loại sản phẩm đang cấu hình; (3) phân loại rạch ròi một tài nguyên thuộc phương pháp in nào, với định nghĩa rõ "chỉ-offset" và "dùng cho in nhanh theo loại"; (4) có màn quản trị gán Cờ_Phạm_Vi tường minh cho từng tài nguyên.

**Nguyên tắc xuyên suốt:** KHÔNG đập đi xây lại; bảo toàn giá đang đúng (golden test offset không đổi). VAT và công thức giá **không nằm trong phạm vi** spec này — đây là spec phân loại + cài đặt. An toàn dữ liệu trên PostgreSQL: `synchronize=false`, không phá schema; raw SQL theo cú pháp Postgres, cột `is_active` smallint so sánh `=1`, cột `scope_offset` boolean so sánh `=true`. Spec này độc lập nhưng **phải nhất quán** với mô hình "Tài nguyên dùng chung" của spec `print-method-unification` (`materials`/`paper_sizes`/`processing_options` dùng cờ `scope_*` để phân loại; offset đọc `scope_offset=true`) và không mâu thuẫn với nó.

Tài liệu này đặc tả **hành vi nghiệp vụ mong muốn** ("what"); chi tiết kỹ thuật (mô hình dữ liệu, API, truy vấn) để dành cho giai đoạn Design.

## Glossary

- **Hệ_Thống (System):** Toàn bộ hệ ZeplaoPrint, gồm frontend Next.js và backend NestJS dùng chung.
- **Tài_Nguyên_Dùng_Chung (Shared Resource):** Dữ liệu nền dùng cho mọi Phương_Pháp_In, gồm Gia_Công (`processing_options`), Vật_Tư (`materials`), Khổ_Giấy (`paper_sizes`). Mỗi khái niệm có một nguồn duy nhất, không nhân đôi theo từng engine.
- **Gia_Công (Processing Option):** Một công đoạn gia công/thành phẩm trong bảng `processing_options` (ví dụ cán màng, bế, ép kim, đóng cuốn).
- **Vật_Tư (Material):** Một vật tư/giấy in trong bảng `materials`.
- **Khổ_Giấy (Paper Size):** Một khổ giấy trong bảng `paper_sizes`.
- **Phương_Pháp_In (Print Method):** Cách thức sản xuất quyết định công thức tính giá. Trong phạm vi spec này gồm In_Nhanh và Offset.
- **In_Nhanh (Digital):** Phương pháp in kỹ thuật số, gồm ba Loại_Sản_Phẩm: Tờ_Rời (`loose`), Đóng_Cuốn (`bound`), Khổ_Lớn (`large_format`).
- **Offset:** Phương pháp in offset.
- **Loại_Sản_Phẩm (Product Type):** Phân loại của một Sản_Phẩm in nhanh, nhận một trong ba giá trị `loose`, `bound`, `large_format` (trường `quote_type`).
- **Cờ_Phạm_Vi (Scope Flag):** Thuộc tính trên một Tài_Nguyên_Dùng_Chung khai báo tài nguyên đó áp dụng cho phạm vi nào: `scope_loose`, `scope_bound`, `scope_large_format` (smallint 0/1) và `scope_offset` (boolean).
- **Phạm_Vi (Scope):** Một trong các phạm vi áp dụng: Tờ_Rời, Đóng_Cuốn, Khổ_Lớn (thuộc In_Nhanh) và Offset.
- **Quy_Tắc_Phạm_Vi (Scope Rule):** Logic chuẩn, dùng chung, xác định một Tài_Nguyên_Dùng_Chung có thuộc một Phạm_Vi (hoặc một Loại_Sản_Phẩm) hay không, dựa trên các Cờ_Phạm_Vi của tài nguyên đó. Là nguồn sự thật duy nhất được mọi nơi áp dụng.
- **Tài_Nguyên_Chỉ_Offset (Offset-only Resource):** Tài nguyên có `scope_offset=true` và toàn bộ Cờ_Phạm_Vi in nhanh bằng 0 (`scope_loose=0`, `scope_bound=0`, `scope_large_format=0`); không bao giờ áp dụng cho báo giá in nhanh.
- **Tài_Nguyên_Trong_Phạm_Vi (In-scope Resource):** Đối với một Phạm_Vi/Loại_Sản_Phẩm cho trước, là tài nguyên mà Quy_Tắc_Phạm_Vi xác định là thuộc Phạm_Vi/Loại_Sản_Phẩm đó.
- **Trạng_Thái_Hoạt_Động (Active Flag):** Cờ `is_active` của tài nguyên (smallint, `1` = hoạt động).
- **Màn_Cài_Đặt_Sản_Phẩm (Product Setup Screen):** Màn cấu hình sản phẩm in nhanh (`ProductModal.tsx`), nơi Admin tick các Tài_Nguyên_Dùng_Chung được phép cho một Sản_Phẩm (allowed_processing, allowed_materials, allowed_paper_sizes).
- **Màn_Báo_Giá (Quote Screen):** Màn tạo báo giá in nhanh, nơi NV_Báo_Giá chọn Tài_Nguyên_Dùng_Chung khi lập báo giá.
- **Màn_Quản_Trị_Phạm_Vi (Scope Admin Screen):** Màn quản trị để gán Cờ_Phạm_Vi cho từng Tài_Nguyên_Dùng_Chung một cách tường minh.
- **Danh_Sách_Được_Phép (Allowed List):** Tập Tài_Nguyên_Dùng_Chung mà Admin đã tick cho một Sản_Phẩm tại Màn_Cài_Đặt_Sản_Phẩm (lưu trong `quote_config.allowed_*`).
- **Admin:** Vai trò quản trị cấu hình Tài_Nguyên_Dùng_Chung và Cờ_Phạm_Vi.
- **NV_Báo_Giá:** Nhân viên tạo báo giá cho khách.

## Requirements

### Requirement 1: Quy tắc phạm vi là nguồn sự thật duy nhất

**User Story:** Là Admin, tôi muốn một quy tắc phân loại phạm vi tài nguyên duy nhất được áp dụng ở mọi nơi, để thứ tick được ở màn cài đặt luôn hiển thị được ở màn báo giá tương ứng, không còn cảnh "tick rồi mà không hiện".

#### Acceptance Criteria

1. THE Hệ_Thống SHALL định nghĩa một Quy_Tắc_Phạm_Vi duy nhất, theo đó một Tài_Nguyên_Dùng_Chung được xác định là thuộc một Phạm_Vi cho trước KHI VÀ CHỈ KHI Cờ_Phạm_Vi tương ứng với Phạm_Vi đó của tài nguyên có giá trị bật (true).
2. THE Màn_Cài_Đặt_Sản_Phẩm SHALL áp dụng cùng một Quy_Tắc_Phạm_Vi giống hệt Màn_Báo_Giá khi xác định tập Tài_Nguyên_Trong_Phạm_Vi cho cùng một Loại_Sản_Phẩm, sao cho tập kết quả tại hai màn là trùng khớp hoàn toàn.
3. WHEN một Tài_Nguyên_Dùng_Chung thuộc Tài_Nguyên_Trong_Phạm_Vi của một Loại_Sản_Phẩm theo Quy_Tắc_Phạm_Vi, THE Hệ_Thống SHALL làm cho tài nguyên đó có thể được chọn và sử dụng tại Màn_Cài_Đặt_Sản_Phẩm của Loại_Sản_Phẩm đó.
4. WHEN một Tài_Nguyên_Dùng_Chung thuộc Tài_Nguyên_Trong_Phạm_Vi của một Loại_Sản_Phẩm theo Quy_Tắc_Phạm_Vi, THE Hệ_Thống SHALL làm cho tài nguyên đó có thể được chọn và sử dụng tại Màn_Báo_Giá của cùng Loại_Sản_Phẩm đó.
5. WHEN một Tài_Nguyên_Dùng_Chung không thuộc Tài_Nguyên_Trong_Phạm_Vi của một Loại_Sản_Phẩm theo Quy_Tắc_Phạm_Vi, THE Hệ_Thống SHALL loại tài nguyên đó khỏi cả Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá của cùng Loại_Sản_Phẩm đó.
6. THE Hệ_Thống SHALL áp dụng Quy_Tắc_Phạm_Vi nhất quán cho cả ba nhóm Tài_Nguyên_Dùng_Chung: Gia_Công, Vật_Tư và Khổ_Giấy.
7. IF Cờ_Phạm_Vi tương ứng của một Tài_Nguyên_Dùng_Chung bị thiếu, rỗng hoặc null, THEN THE Hệ_Thống SHALL coi tài nguyên đó là không thuộc Phạm_Vi đang xét và loại nó khỏi cả Màn_Cài_Đặt_Sản_Phẩm lẫn Màn_Báo_Giá.
8. WHEN Admin thay đổi một Cờ_Phạm_Vi của một Tài_Nguyên_Dùng_Chung tại Màn_Cài_Đặt_Sản_Phẩm và lưu thành công, THE Hệ_Thống SHALL áp dụng kết quả phân loại theo Quy_Tắc_Phạm_Vi mới tại Màn_Báo_Giá của cùng Loại_Sản_Phẩm trong lần tải dữ liệu kế tiếp của Màn_Báo_Giá.

### Requirement 2: Phân loại tài nguyên theo phương pháp in và loại sản phẩm

**User Story:** Là Admin, tôi muốn biết rõ một tài nguyên thuộc phương pháp in nào và loại sản phẩm nào, để phân loại tài nguyên dùng chung một cách rạch ròi thay vì dựa vào dữ liệu scope rải rác khó kiểm soát.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL coi một Cờ_Phạm_Vi đang ở trạng thái Bật khi giá trị của nó bằng 1 (đối với cờ smallint) hoặc bằng true (đối với cờ boolean), và ở trạng thái Tắt khi giá trị bằng 0, false hoặc NULL.
2. THE Hệ_Thống SHALL xác định một Tài_Nguyên_Dùng_Chung thuộc Phạm_Vi Offset khi và chỉ khi Cờ_Phạm_Vi `scope_offset` của tài nguyên đó đang ở trạng thái Bật.
3. THE Hệ_Thống SHALL xác định một Tài_Nguyên_Dùng_Chung thuộc Phạm_Vi Tờ_Rời khi và chỉ khi Cờ_Phạm_Vi `scope_loose` của tài nguyên đó đang ở trạng thái Bật.
4. THE Hệ_Thống SHALL xác định một Tài_Nguyên_Dùng_Chung thuộc Phạm_Vi Đóng_Cuốn khi và chỉ khi Cờ_Phạm_Vi `scope_bound` của tài nguyên đó đang ở trạng thái Bật.
5. THE Hệ_Thống SHALL xác định một Tài_Nguyên_Dùng_Chung thuộc Phạm_Vi Khổ_Lớn khi và chỉ khi Cờ_Phạm_Vi `scope_large_format` của tài nguyên đó đang ở trạng thái Bật.
6. THE Hệ_Thống SHALL phân loại một Tài_Nguyên_Dùng_Chung là Tài_Nguyên_Chỉ_Offset khi `scope_offset` đang ở trạng thái Bật và đồng thời cả ba Cờ_Phạm_Vi `scope_loose`, `scope_bound`, `scope_large_format` đều ở trạng thái Tắt.
7. WHERE từ hai Cờ_Phạm_Vi trở lên của một Tài_Nguyên_Dùng_Chung đang ở trạng thái Bật, THE Hệ_Thống SHALL ghi nhận tài nguyên đó thuộc tất cả các Phạm_Vi tương ứng với các Cờ_Phạm_Vi đang Bật của tài nguyên đó.
8. IF toàn bộ Cờ_Phạm_Vi của một Tài_Nguyên_Dùng_Chung đều ở trạng thái Tắt, THEN THE Hệ_Thống SHALL phân loại tài nguyên đó là Không_Thuộc_Phạm_Vi_Nào và không gán nó cho bất kỳ Phạm_Vi nào.

### Requirement 3: Loại tài nguyên chỉ-offset khỏi luồng in nhanh

**User Story:** Là NV_Báo_Giá làm báo giá in nhanh, tôi muốn không thấy các gia công chỉ dành cho offset, để không tick nhầm những thứ không bao giờ áp dụng được cho báo giá in nhanh.

#### Acceptance Criteria

1. WHEN Màn_Báo_Giá in nhanh hiển thị danh sách Tài_Nguyên_Dùng_Chung (Gia_Công, Vật_Tư hoặc Khổ_Giấy), THE Hệ_Thống SHALL loại bỏ mọi Tài_Nguyên_Chỉ_Offset khỏi danh sách và giữ lại các tài nguyên không phải Tài_Nguyên_Chỉ_Offset thuộc Phạm_Vi đang xét.
2. WHEN Màn_Cài_Đặt_Sản_Phẩm in nhanh hiển thị danh sách Tài_Nguyên_Dùng_Chung để tick, THE Hệ_Thống SHALL loại bỏ mọi Tài_Nguyên_Chỉ_Offset khỏi danh sách và giữ lại các tài nguyên không phải Tài_Nguyên_Chỉ_Offset thuộc Phạm_Vi đang xét.
3. WHILE Loại_Sản_Phẩm đang xét trong luồng in nhanh là Tờ_Rời, THE Hệ_Thống SHALL chỉ hiển thị các Gia_Công thuộc Phạm_Vi Tờ_Rời theo Quy_Tắc_Phạm_Vi và loại bỏ các Gia_Công không thuộc Phạm_Vi đó.
4. WHILE Loại_Sản_Phẩm đang xét trong luồng in nhanh là Đóng_Cuốn, THE Hệ_Thống SHALL chỉ hiển thị các Gia_Công thuộc Phạm_Vi Đóng_Cuốn theo Quy_Tắc_Phạm_Vi và loại bỏ các Gia_Công không thuộc Phạm_Vi đó.
5. WHILE Loại_Sản_Phẩm đang xét trong luồng in nhanh là Khổ_Lớn, THE Hệ_Thống SHALL chỉ hiển thị các Gia_Công thuộc Phạm_Vi Khổ_Lớn theo Quy_Tắc_Phạm_Vi và loại bỏ các Gia_Công không thuộc Phạm_Vi đó.
6. WHEN Hệ_Thống hiển thị Tài_Nguyên_Dùng_Chung trong luồng in nhanh (gồm Màn_Báo_Giá và Màn_Cài_Đặt_Sản_Phẩm), THE Hệ_Thống SHALL chỉ hiển thị các tài nguyên có Trạng_Thái_Hoạt_Động bằng 1 và loại bỏ các tài nguyên có Trạng_Thái_Hoạt_Động khác 1.

### Requirement 4: Màn cài đặt chỉ hiển thị tài nguyên hợp lệ với cấu hình hiện tại

**User Story:** Là Admin, tôi muốn màn cài đặt chỉ cho tick những tài nguyên thật sự dùng được với phương pháp in / loại sản phẩm đang cấu hình, để không tạo ra sản phẩm tick lung tung mà báo giá không dùng được.

#### Acceptance Criteria

1. WHEN Admin chọn một Loại_Sản_Phẩm tại Màn_Cài_Đặt_Sản_Phẩm, THE Hệ_Thống SHALL hiển thị danh sách Tài_Nguyên_Dùng_Chung để tick chỉ gồm Tài_Nguyên_Trong_Phạm_Vi của Loại_Sản_Phẩm đó theo Quy_Tắc_Phạm_Vi, có Trạng_Thái_Hoạt_Động bằng 1, áp dụng cho cả ba nhóm Gia_Công, Vật_Tư và Khổ_Giấy.
2. WHEN Admin thay đổi Loại_Sản_Phẩm tại Màn_Cài_Đặt_Sản_Phẩm, THE Hệ_Thống SHALL cập nhật ngay trong cùng phiên danh sách Tài_Nguyên_Dùng_Chung hiển thị để khớp Loại_Sản_Phẩm mới theo Quy_Tắc_Phạm_Vi, loại bỏ các tài nguyên không còn thuộc Phạm_Vi của Loại_Sản_Phẩm mới.
3. IF Danh_Sách_Được_Phép của một Sản_Phẩm chứa một Tài_Nguyên_Dùng_Chung không còn thuộc Tài_Nguyên_Trong_Phạm_Vi của Loại_Sản_Phẩm đó, THEN THE Hệ_Thống SHALL hiển thị dấu hiệu trực quan đánh dấu tài nguyên đó là ngoài phạm vi và một thông báo nêu rõ tài nguyên nào ngoài phạm vi tại Màn_Cài_Đặt_Sản_Phẩm.
4. WHEN Admin lưu một Sản_Phẩm mà Danh_Sách_Được_Phép chỉ gồm các Tài_Nguyên_Dùng_Chung thuộc Tài_Nguyên_Trong_Phạm_Vi của Loại_Sản_Phẩm đó, THE Hệ_Thống SHALL lưu Sản_Phẩm và hiển thị xác nhận lưu thành công.
5. IF Admin lưu một Sản_Phẩm mà Danh_Sách_Được_Phép còn chứa Tài_Nguyên_Dùng_Chung ngoài Tài_Nguyên_Trong_Phạm_Vi của Loại_Sản_Phẩm đó, THEN THE Hệ_Thống SHALL từ chối lưu, hiển thị thông báo lỗi chỉ rõ tài nguyên vi phạm và giữ nguyên dữ liệu chưa lưu.

### Requirement 5: Màn quản trị gán phạm vi tường minh

**User Story:** Là Admin, tôi muốn một màn quản trị để gán phạm vi áp dụng cho từng gia công (và vật tư, khổ giấy) một cách tường minh, để kiểm soát phân loại tập trung thay vì sửa dữ liệu scope rải rác.

#### Acceptance Criteria

1. THE Màn_Quản_Trị_Phạm_Vi SHALL hiển thị danh sách Tài_Nguyên_Dùng_Chung kèm các Cờ_Phạm_Vi hiện tại (`scope_loose`, `scope_bound`, `scope_large_format`, `scope_offset`) của từng tài nguyên.
2. WHEN Admin đặt các Cờ_Phạm_Vi cho một Tài_Nguyên_Dùng_Chung tại Màn_Quản_Trị_Phạm_Vi và lưu, THE Hệ_Thống SHALL lưu giá trị Cờ_Phạm_Vi mới cho tài nguyên đó và hiển thị thông báo xác nhận lưu thành công trong vòng 3 giây.
3. WHEN thao tác lưu Cờ_Phạm_Vi của một Tài_Nguyên_Dùng_Chung hoàn tất thành công, THE Hệ_Thống SHALL áp dụng giá trị mới cho mọi lần Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá truy cập tài nguyên đó bắt đầu sau thời điểm lưu, mà không làm thay đổi các phiên Màn_Cài_Đặt_Sản_Phẩm và Màn_Báo_Giá đang mở trước thời điểm lưu.
4. THE Màn_Quản_Trị_Phạm_Vi SHALL hiển thị nhãn phân loại suy ra từ Quy_Tắc_Phạm_Vi cho từng Tài_Nguyên_Dùng_Chung, gồm việc tài nguyên đó là Tài_Nguyên_Chỉ_Offset hay thuộc các Phạm_Vi in nhanh nào.
5. THE Màn_Quản_Trị_Phạm_Vi SHALL cho phép Admin gán Cờ_Phạm_Vi cho cả ba nhóm Tài_Nguyên_Dùng_Chung: Gia_Công, Vật_Tư và Khổ_Giấy.
6. IF Admin lưu một Tài_Nguyên_Dùng_Chung với toàn bộ Cờ_Phạm_Vi đều tắt (`scope_offset=false` và `scope_loose=0`, `scope_bound=0`, `scope_large_format=0`), THEN THE Hệ_Thống SHALL hiển thị cảnh báo cho biết tài nguyên đó sẽ không thuộc bất kỳ Phạm_Vi nào và sẽ không hiển thị ở bất kỳ luồng báo giá nào, đồng thời yêu cầu Admin xác nhận trước khi hoàn tất lưu.
7. IF thao tác lưu Cờ_Phạm_Vi cho một Tài_Nguyên_Dùng_Chung thất bại, THEN THE Hệ_Thống SHALL giữ nguyên giá trị Cờ_Phạm_Vi trước khi lưu cho tài nguyên đó và hiển thị thông báo lỗi cho biết việc lưu không thành công.
8. IF Admin gửi giá trị Cờ_Phạm_Vi không hợp lệ (giá trị `scope_offset` khác true/false hoặc các cờ `scope_loose`, `scope_bound`, `scope_large_format` khác 0 hoặc 1), THEN THE Hệ_Thống SHALL từ chối lưu, giữ nguyên giá trị Cờ_Phạm_Vi hiện tại và hiển thị thông báo lỗi cho biết giá trị Cờ_Phạm_Vi không hợp lệ.

### Requirement 6: An toàn dữ liệu và nhất quán với mô hình tài nguyên dùng chung

**User Story:** Là Admin, tôi muốn việc phân loại phạm vi tuân thủ ràng buộc dữ liệu hiện có và mô hình tài nguyên dùng chung, để không phá schema, không làm sai giá đang đúng và không mâu thuẫn với các phần khác của hệ.

#### Acceptance Criteria

1. THE Hệ_Thống SHALL giữ Gia_Công, Vật_Tư và Khổ_Giấy ở một nguồn duy nhất cho mỗi khái niệm và phân loại Phạm_Vi bằng các Cờ_Phạm_Vi `scope_*` trên chính nguồn đó, không nhân đôi danh mục theo từng Phương_Pháp_In.
2. THE Hệ_Thống SHALL diễn giải Cờ_Phạm_Vi `scope_offset` như kiểu boolean và các Cờ_Phạm_Vi `scope_loose`, `scope_bound`, `scope_large_format` như kiểu smallint chỉ nhận đúng một trong hai giá trị 0 hoặc 1.
3. WHEN Hệ_Thống xác định một Tài_Nguyên_Dùng_Chung thuộc Phạm_Vi Offset, THE Hệ_Thống SHALL dùng điều kiện `scope_offset = true`.
4. THE Hệ_Thống SHALL áp dụng việc phân loại Phạm_Vi mà không thay đổi cấu trúc bảng `processing_options`, `materials`, `paper_sizes` ngoài các Cờ_Phạm_Vi đã tồn tại.
5. WHEN áp dụng việc phân loại Phạm_Vi, THE Hệ_Thống SHALL sinh ra kết quả giá của luồng báo giá Offset bằng đúng kết quả giá của cùng luồng đó trước khi áp dụng phân loại, với chênh lệch bằng 0 cho cùng một tập dữ liệu đầu vào.
6. IF một Cờ_Phạm_Vi `scope_offset` mang giá trị NULL hoặc một Cờ_Phạm_Vi smallint (`scope_loose`, `scope_bound`, `scope_large_format`) mang giá trị NULL hoặc khác 0 và 1, THEN THE Hệ_Thống SHALL coi Tài_Nguyên đó là không thuộc Phạm_Vi tương ứng và phát chỉ báo lỗi dữ liệu cho biết Tài_Nguyên và Cờ_Phạm_Vi vi phạm, đồng thời giữ nguyên giá đang đúng.
7. WHILE một Tài_Nguyên_Dùng_Chung chưa được gán bất kỳ Cờ_Phạm_Vi `scope_*` nào, THE Hệ_Thống SHALL coi Tài_Nguyên đó là không thuộc mọi Phạm_Vi và không đưa vào kết quả phân loại của bất kỳ Phương_Pháp_In nào.
