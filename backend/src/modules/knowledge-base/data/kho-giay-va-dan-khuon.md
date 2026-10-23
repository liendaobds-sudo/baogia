# KHỔ GIẤY & DÀN KHUÔN (IMPOSITION)

> Tài liệu bổ sung 2026-08-29. Audit kiến thức AI phát hiện toàn bộ KB **không có một dòng nào**
> về khổ giấy và dàn khuôn, dù đây là nền tảng để giải thích "vì sao 1.000 cái không đắt gấp đôi
> 500 cái" và "vì sao đổi kích thước 1mm lại nhảy giá". Không có kiến thức này, AI trả lời về giá
> theo cảm tính và không giải thích được cấu trúc chi phí.
>
> **Quan trọng:** tài liệu này giải thích CƠ CHẾ, không phải bảng giá. Mọi con số tiền phải lấy từ
> kết quả báo giá của hệ thống, không được suy ra từ đây.

## 1. BỐN LOẠI "KHỔ" DỄ BỊ NHẦM

Bốn khái niệm dưới đây thường bị gọi chung là "khổ", nhưng khác nhau và không được lẫn:

| Tên | Nghĩa | Ví dụ |
|---|---|---|
| Khổ thành phẩm | Kích thước sản phẩm khách nhận, sau khi cắt xong | Danh thiếp 90×54mm |
| Khổ trải (khổ khai triển) | Kích thước khi trải phẳng toàn bộ, gồm cả phần gấp/dán | Hộp nắp gài 10×10×5cm trải ra ~28×26cm |
| Khổ bài in | Khổ trải + bleed + khoảng cách giữa các con (gutter) | 90×54mm + bleed 2mm mỗi cạnh = 94×58mm |
| Khổ tờ nhập | Khổ tờ giấy thật mua từ nhà cung cấp | 65×86cm, 79×109cm, 72×102cm |

Quy tắc: **giá đi từ khổ tờ nhập**, không đi từ khổ thành phẩm. Khách hỏi giá theo thành phẩm,
xưởng tính theo số tờ nhập phải mua.

## 2. SỐ CON TRÊN TỜ (số con/tờ, "up")

Số con/tờ = số lượng sản phẩm xếp được trên một tờ in.

Cách tính: chia khổ tờ **khả dụng** cho khổ bài in, theo cả hai chiều (dọc và ngang), lấy phương án
cho ra nhiều con hơn.

```
số con theo chiều A = floor(rộng_khả_dụng / rộng_bài) × floor(cao_khả_dụng / cao_bài)
số con theo chiều B = floor(rộng_khả_dụng / cao_bài)  × floor(cao_khả_dụng / rộng_bài)
số con/tờ = max(số con theo chiều A, số con theo chiều B)
```

- Luôn **làm tròn XUỐNG** (floor): không có "0,7 con".
- Khổ khả dụng = khổ tờ nhập trừ cắn nhíp và lề máy (mục 3).
- Xoay 90° thường cho ra nhiều con hơn với bài chữ nhật. Đây là lý do một sản phẩm 95×55mm và
  một sản phẩm 90×54mm có thể chênh nhau vài con/tờ, kéo theo chênh giá rõ rệt.

Ý nghĩa nghiệp vụ: **số tờ in cần = ceil(số lượng đặt / số con/tờ)**, rồi cộng bù hao (mục 5).
Vì vậy khi khách tăng số lượng, số tờ tăng nhưng chi phí kẽm/bù máy không tăng ⇒ đơn giá giảm.

## 3. CẮN NHÍP (GRIPPER) VÀ LỀ MÁY

- **Cắn nhíp** là phần mép tờ giấy bị càng nhíp của máy in kẹp để kéo tờ giấy qua. Vùng này
  **không in được**, thường 8–12mm ở một cạnh.
- Máy còn cần lề ở các cạnh còn lại để không phun mực ra ngoài tờ, thường 3–5mm.
- Cắn nhíp chỉ có ở **một** cạnh của tờ, không phải cả bốn. Khi trừ, lấy `max(lề cạnh đó, cắn nhíp)`,
  **không cộng dồn** hai giá trị — cộng dồn sẽ tính thiếu số con/tờ và làm giá bị đội lên.
- Cắn nhíp là lý do khổ khả dụng luôn nhỏ hơn khổ tờ nhập, và là lý do không thể "in tràn hết tờ".

## 4. BLEED VÀ GUTTER TRONG DÀN KHUÔN

- **Bleed (tràn viền)**: 2–3mm mỗi cạnh cho sản phẩm cắt rời. Không có bleed → thành phẩm có sợi
  viền trắng ở mép do sai số dao cắt.
- **Gutter (khoảng cách giữa các con)**: khoảng trống giữa hai bài in liền nhau.
  - Chỉ **cắt thẳng** (namecard, tờ rơi): các con có thể **dùng chung đường cắt**, gutter ≈ 0 và
    bleed dùng chung giữa hai con liền kề.
  - Có **bế khuôn** (hộp, sticker hình, tem bo góc): mỗi con cần đường bế riêng ⇒ gutter 3–5mm.
  - Có **cấn/gấp**: cần thêm khoảng để dao cấn không đè lên con bên cạnh.
- Vì vậy cùng một kích thước, sản phẩm **có bế** luôn ra ít con/tờ hơn sản phẩm **chỉ cắt**.

## 5. BÙ HAO (HAO HỤT GIẤY)

Số tờ giấy phải mua luôn **nhiều hơn** số tờ in lý thuyết, vì:

- **Bù máy (bù bài)**: những tờ đầu chạy để canh màu, canh chồng màu — bỏ đi. In offset thường
  100–300 tờ tùy số màu và độ khó; số này gần như **cố định theo đầu bài**, không theo số lượng.
- **Bù gia công**: mỗi công đoạn sau in (cán, bế, cấn, ép nhũ, đóng cuốn) đều làm hỏng một phần,
  thường 2–5% mỗi công đoạn. Càng nhiều công đoạn, bù hao càng cộng lên.
- **Bù cắt**: sai số dao khi xén thành phẩm.

Hệ quả cần nói với khách:
- Đơn **số lượng nhỏ** có tỉ lệ bù hao rất cao so với số lượng đặt ⇒ đơn giá cao. Đây là lý do
  thật khi khách thắc mắc "sao in 100 cái mà đơn giá gấp mấy lần in 1.000 cái".
- Sản phẩm **nhiều công đoạn gia công** phải cộng bù hao nhiều lần, không phải một lần.
- Xưởng giao **đủ số lượng đặt**; bù hao là chi phí sản xuất, không phải hàng khách nhận thêm.

## 6. CHẾ BẢN & KẼM (chỉ có ở in offset)

- In offset cần **ra kẽm (bản kẽm)**: mỗi màu một bản kẽm cho mỗi mặt. In 4 màu 2 mặt = 8 bản kẽm.
- Chi phí kẽm + bù máy là **chi phí theo đầu bài**, không theo số lượng ⇒ chia cho càng nhiều
  thành phẩm thì đơn giá càng thấp. Đây là toàn bộ lý do "in nhiều rẻ hơn in ít".
- In digital **không cần kẽm**, không cần bù máy đáng kể ⇒ hợp số lượng nhỏ, nhưng đơn giá không
  giảm mạnh khi tăng số lượng vì chi phí gần như tuyến tính theo tờ.
- Khi số lượng lớn dần sẽ có một **điểm hòa vốn** mà offset trở nên rẻ hơn digital. Điểm này phụ
  thuộc số màu, khổ, chất liệu và gia công — **hệ thống tính, AI không được đoán**.

## 7. GHÉP BÀI (GANG RUN)

Nếu tờ in còn chỗ trống, có thể **ghép nhiều bài khác nhau** lên cùng một tờ để chia chi phí kẽm
và bù máy. Điều kiện: cùng chất liệu, cùng định lượng, cùng số màu, cùng loại gia công và cùng
tiến độ. Ghép bài là lý do một số đơn nhỏ vẫn có giá offset tốt nếu chờ được lịch ghép.

## 8. CÁC KHỔ GIẤY THÔNG DỤNG

Khổ giấy nhập (thị trường Việt Nam):

| Khổ tờ nhập | Ghi chú |
|---|---|
| 65 × 86 cm | Khổ phổ biến nhất cho máy in offset 4 màu khổ trung |
| 79 × 109 cm | Khổ lớn, hiệu quả cho bài A4/A3 số lượng lớn |
| 72 × 102 cm | Khổ trung gian, hay dùng cho bìa và bao bì |
| 60 × 84 cm | Khổ nhỏ, máy in nhỏ hoặc giấy mỹ thuật |

Khổ thành phẩm hay gặp (chuỗi ISO A, mm):

| Khổ | Kích thước | Dùng cho |
|---|---|---|
| A6 | 105 × 148 | Tờ rơi nhỏ, voucher, thiệp |
| A5 | 148 × 210 | Tờ rơi, menu nhỏ, sổ tay |
| A4 | 210 × 297 | Tờ rơi, brochure, catalogue, biểu mẫu |
| A3 | 297 × 420 | Poster nhỏ, menu lớn, bảng biểu |
| A2 | 420 × 594 | Poster |
| A1 | 594 × 841 | Poster khổ lớn |
| A0 | 841 × 1189 | Poster/bảng triển lãm |

Quy tắc chuỗi A: khổ liền sau bằng **một nửa** khổ liền trước khi gấp theo chiều dài.

Khổ chuẩn khác:
- **Danh thiếp Việt Nam: 90 × 54mm** (đây là khổ tiêu chuẩn dùng khi khách không nói kích thước).
  Khổ 85 × 55mm là chuẩn quốc tế, ít dùng ở Việt Nam hơn.
- Tờ gấp 3 (trifold) từ A4: thành phẩm 210 × 99mm mỗi tay gấp.
- Phong bì thư A5: 220 × 110mm (DL); phong bì đựng A4: 240 × 340mm.

## 9. NHỮNG ĐIỀU AI TUYỆT ĐỐI KHÔNG ĐƯỢC LÀM

- **Không tự tính ra số tiền** từ số con/tờ, bù hao hay số kẽm. Số con/tờ dùng để **giải thích**,
  còn số tiền chỉ được lấy từ kết quả báo giá của hệ thống.
- **Không tự chọn khổ tờ nhập** giúp khách. Khổ tờ do vật tư trong hệ thống quy định; chọn khổ khác
  sẽ ra số con/tờ khác và lệch hẳn với giá thật.
- **Không nói "1 tờ A4 in được N con"** khi chưa biết khổ tờ nhập, bleed và loại gia công.
- Khi khách hỏi "sao đắt vậy" với số lượng nhỏ: giải thích bằng **kẽm + bù máy + bù hao**, và gợi ý
  tăng số lượng hoặc chuyển in digital, thay vì giảm giá.
