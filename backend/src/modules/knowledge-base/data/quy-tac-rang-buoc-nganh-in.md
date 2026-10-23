# Quy tắc ràng buộc ngành in ấn

## Cán màng (Lamination)

- [LAM-001] Giấy dưới 80gsm → KHÔNG nên cán màng (cong vênh, co rút không đều), nên phủ UV thay thế. Giấy 120-200gsm cán mờ/bóng bình thường (tờ rơi, poster). Ngưỡng 80gsm là mốc thống nhất giữa tài liệu này, `printing-constraints.json` và hard check trong code.
- [LAM-002] Decal/sticker → CHỈ cán 1 mặt (mặt in). Mặt sau là keo dán, không thể cán.
- [LAM-003] Banner/hiflex/bạt → KHÔNG cán màng (vật liệu đã chống nước sẵn). Standee PP → THƯỜNG cán mờ/bóng để bảo vệ hình ảnh và tăng thẩm mỹ.
- [LAM-004] Khách nói "cán 2 mặt" → hiểu là in 2 mặt + cán cả 2 mặt, KHÔNG hỏi lại số mặt in.
- [LAM-005] Poster treo tường → thường KHÔNG cán. Cán sẽ phản sáng khó nhìn. Trừ poster trưng bày dài hạn.
- [LAM-006] Cán mờ + ép nhũ/UV cục bộ → combo phổ biến nhất, tạo tương phản đẹp.
- [LAM-007] Sản phẩm cần viết bút bi → KHÔNG cán mặt cần viết. Bề mặt cán không bám mực bút bi.
- [LAM-008] Catalogue/brochure nhiều trang → CHỈ cán bìa, ruột KHÔNG cán. Ruột cán sẽ quá dày, khó lật.

## Định lượng giấy (GSM)

- [GSM-001] Giấy ≥ 200gsm + cần gấp → BẮT BUỘC phải cấn (scoring) trước khi gấp. Không cấn sẽ bị gãy, nứt.
- [GSM-002] Namecard → tối thiểu 250gsm, khuyến nghị 300gsm. Mỏng hơn sẽ mềm nhũn, thiếu chuyên nghiệp.
- [GSM-003] Tờ rơi phát tay → 100-200gsm, phổ biến nhất 150gsm. Quá dày sẽ nặng, quá mỏng sẽ nhăn.
- [GSM-004] Menu nhà hàng → tối thiểu 250gsm + cán mờ 2 mặt. Menu bị cầm, lật liên tục, dính nước/dầu.
- [GSM-005] Ruột catalogue/sách → 120-170gsm. Quá dày sẽ phồng sách, quá mỏng sẽ nhìn thấu.
- [GSM-006] Bìa catalogue/sách → 250-350gsm + cán mờ/bóng. Bìa cần cứng để bảo vệ ruột.
- [GSM-007] Hộp giấy/bao bì → tối thiểu 300gsm hoặc giấy duplex/ivory. Hộp cần giữ form, chịu lực.

## Số mặt in

- [SIDE-001] Decal/sticker/tem nhãn → CHỈ in 1 mặt. Mặt sau là keo dán.
- [SIDE-002] In khổ lớn (hiflex, PP, canvas, banner) → CHỈ in 1 mặt. Máy in khổ lớn chỉ in 1 mặt.
- [SIDE-003] Namecard/danh thiếp → mặc định in 2 mặt. In 1 mặt là lãng phí.
- [SIDE-004] Standee/X-banner → CHỈ in 1 mặt. Không ai nhìn mặt sau.
- [SIDE-005] Poster → CHỈ in 1 mặt. Poster treo tường, chỉ nhìn mặt trước.

## Đóng cuốn (Binding)

- [BIND-001] Đóng ghim (saddle stitch) → tổng số trang BẮT BUỘC chia hết cho 4. VD: 8, 12, 16, 20, 24... 48 trang.
- [BIND-002] Đóng ghim + >48 trang → KHÔNG khuyến khích, nên đổi sang đóng keo. Quá nhiều tờ sẽ phồng bụng.
- [BIND-003] Đóng keo nhiệt → tối thiểu 40 trang, ruột giấy nên ≤ 170gsm.
- [BIND-004] Sổ tay/planner/menu lật → đóng lò xo hoặc Wire-O. Mở phẳng 360°.
- [BIND-005] Sách cao cấp/annual report → đóng keo gáy vuông + bìa cứng.
- [BIND-006] Số trang lẻ → phải thêm trang trắng. In luôn in trên tờ giấy 2 mặt.

## Ép nhũ / UV cục bộ

- [FOIL-001] Ép nhũ → chữ/logo tối thiểu 5pt, đường nét tối thiểu 0.5mm. Chi tiết quá nhỏ sẽ bị mờ/dính.
- [FOIL-002] Ép nhũ → cần làm khuôn (die) riêng, tính 1 lần.
- [FOIL-003] UV cục bộ → NÊN kết hợp trên nền cán MỜ. UV trên nền cán bóng không thấy hiệu ứng.
- [FOIL-004] UV cục bộ → cần file riêng đánh dấu vùng UV (file vector đen trắng).
- [FOIL-005] Dập nổi (emboss) / dập chìm (deboss) → giấy tối thiểu 250gsm. Giấy mỏng không đủ độ dày để tạo hiệu ứng rõ nét.

## Bế (Die-cut)

- [DIE-001] Bế die-cut → cần file vector đường bế riêng (contour line).
- [DIE-002] Sticker lột từng cái → bế kiss-cut (cắt lớp decal, KHÔNG cắt backing).
- [DIE-003] Sticker tờ A4 nhiều hình → kiss-cut từng hình + die-cut viền tờ A4.
- [DIE-004] Namecard bo góc → R3mm phổ biến nhất.

## Tương thích chất liệu

- [MAT-001] Giấy kraft → màu in sẽ TỐI HƠN trên màn hình. Dùng thiết kế tông tối hoặc in nền trắng trước.
- [MAT-002] Giấy offset (không tráng) → KHÔNG in ảnh full-color chất lượng cao. Chỉ phù hợp in chữ, biểu mẫu.
- [MAT-003] Decal dán chai/hũ thực phẩm → BẮT BUỘC dùng PVC chống nước. Decal giấy sẽ bong.
- [MAT-004] Sản phẩm ngoài trời >3 tháng → dùng PVC + mực eco-solvent + cán UV chống phai.
- [MAT-005] Túi giấy chịu lực → dùng kraft ≥250gsm hoặc ivory + gia cố quai.
- [MAT-006] Decal trong suốt → chỉ đẹp trên bề mặt sáng màu.
- [MAT-007] In trên nhựa PP → KHÔNG dùng mực thường, cần mực UV hoặc eco-solvent.

## Số lượng & Kỹ thuật in

- [QTY-001] Số lượng <200 → in digital (KTS), không nên in offset.
- [QTY-002] Số lượng ≥500 → nên in offset, đơn giá giảm đáng kể vì chi phí kẽm và bù máy chia đều cho nhiều thành phẩm. (Bổ sung 2026-08-29: quy tắc này có trong `printing-constraints.json` nhưng bị thiếu ở đây, tạo lỗ hổng đúng ở ngưỡng khách hay hỏi nhất.)
- [QTY-003] Mỗi tờ khác nhau (tên riêng, mã serial) → BẮT BUỘC in digital, KHÔNG in offset.
- [QTY-004] In gấp (<24h) → in digital, phụ thu 30-50%.
- [QTY-005] KHÔNG tự nêu số tiền hay mức chiết khấu. Điểm hòa vốn giữa offset và digital phụ thuộc số màu, khổ, chất liệu, gia công — do hệ thống tính, không được suy ra bằng cảm tính.

## Khổ thành phẩm chuẩn

- [SIZE-001] Danh thiếp Việt Nam → **90 × 54mm** là khổ tiêu chuẩn dùng khi khách không nói kích thước. (85 × 55mm là chuẩn quốc tế, ít dùng hơn ở Việt Nam.)
- [SIZE-002] Tờ rơi → A5 (148 × 210mm) hoặc A4 (210 × 297mm) là hai khổ phổ biến nhất.
- [SIZE-003] Tờ gấp 3 (trifold) từ A4 → mỗi tay gấp 210 × 99mm.
- [SIZE-004] Phong bì thư → 220 × 110mm (DL, đựng A5 gấp); phong bì đựng A4 nguyên tờ → 240 × 340mm.
- [SIZE-005] Hộp giấy → BẮT BUỘC có đủ dài × rộng × cao và nói rõ là lòng trong hay ngoài hộp. Không có ba số này thì không dựng được khuôn bế, tức không có giá.
- Chi tiết khổ tờ nhập, số con/tờ, cắn nhíp, bù hao: xem tài liệu "kho-giay-va-dan-khuon".

## Màu sắc & File thiết kế

- [CLR-001] File RGB → PHẢI convert sang CMYK trước khi in.
- [CLR-002] Cần màu chính xác (logo brand) → dùng mã Pantone.
- [CLR-003] Text/logo sát mép cắt (<3mm) → có thể bị cắt mất khi xén giấy.
- [CLR-004] In chữ đen → dùng K100%, KHÔNG dùng rich black (CMYK).
- [CLR-005] File từ web/Facebook → KHÔNG in được chất lượng, chỉ 72 dpi.

## Lỗi phổ biến của khách

- [ERR-001] File Word/PowerPoint → sẽ bị lệch font, layout. Yêu cầu export PDF.
- [ERR-002] Ảnh chụp phone → thường OK nếu ≥4MP, nhưng ảnh zoom/crop nhiều có thể vỡ hạt.
- [ERR-003] In 1-5 tờ → vẫn in được (digital) nhưng đơn giá rất cao.
- [ERR-004] Khách muốn "giống y hệt màn hình" → màu in LUÔN khác, sai lệch 5-15% là bình thường.

## Thời gian sản xuất

- [TIME-001] In offset → 3-5 ngày làm việc.
- [TIME-002] In digital số lượng ít → 1-2 ngày, có thể trong ngày.
- [TIME-003] Có ép nhũ/dập nổi/bế khuôn → THÊM 2-3 ngày.
- [TIME-004] Sách/catalogue nhiều trang → 5-10 ngày.
- [TIME-005] In khổ lớn → 1-3 ngày.
