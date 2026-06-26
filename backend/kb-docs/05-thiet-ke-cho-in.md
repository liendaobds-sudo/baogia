# HƯỚNG DẪN CHUẨN BỊ FILE THIẾT KẾ CHO IN ẤN — KPrint

> Tài liệu dành cho Designer và khách hàng tự thiết kế.
> Chuẩn bị file đúng = in đẹp + không mất phí sửa file.

## 1. HỆ MÀU: CMYK vs RGB — LỖI PHỔ BIẾN NHẤT

### RGB (Red, Green, Blue)
- Dùng cho: Màn hình, web, social media, TV
- Dải màu: Rộng hơn CMYK → có nhiều màu rực rỡ mà CMYK không in được
- File RGB gửi in → MÀU SẼ BỊ TỐI, BỊ XỈN khi chuyển sang CMYK

### CMYK (Cyan, Magenta, Yellow, Key/Black)
- Dùng cho: TẤT CẢ ấn phẩm in (offset, digital, khổ lớn)
- Dải màu: Hẹp hơn RGB → một số màu neon, xanh dương rực không in được
- BẮT BUỘC phải thiết kế bằng CMYK từ đầu

### Cách chuyển RGB → CMYK:
- Illustrator: File → Document Color Mode → CMYK Color
- Photoshop: Image → Mode → CMYK Color
- Kiểm tra lại: Một số màu sẽ bị thay đổi sau khi chuyển, cần điều chỉnh lại

### Lỗi thường gặp:
- Ảnh tải từ Google/internet = RGB 72 DPI → in sẽ mờ + lệch màu
- Thiết kế trên Canva = RGB → cần xuất PDF rồi chuyển sang CMYK
- Logo màu cam rực trên màn hình → in ra sẽ bị tối hơn (cam CMYK bị hạn chế)

## 2. BLEED & SAFE ZONE — TẠI SAO QUAN TRỌNG

### Bleed (Tràn lề) — 2-3mm mỗi cạnh
- Là vùng mở rộng ngoài đường cắt, để khi cắt xén không bị lộ viền trắng
- BẮT BUỘC khi: Hình ảnh hoặc nền màu chạy sát mép giấy
- Thiết lập: File → Document Setup → Bleed: 3mm (all sides)

### Safe Zone (Vùng an toàn) — 3-5mm từ mép cắt vào trong
- Tất cả chữ, logo, thông tin quan trọng PHẢI nằm TRONG safe zone
- Nếu đặt chữ sát mép → có thể bị cắt mất khi xén giấy
- Khuyến nghị: Chữ cách mép tối thiểu 4-5mm

### Ví dụ namecard 90x54mm:
- Kích thước file PHẢI là: 96x60mm (đã tính bleed 3mm mỗi bên)
- Safe zone: 82x46mm (cách mép cắt 4mm)
- Chữ/logo phải nằm trong vùng 82x46mm

## 3. ĐỘ PHÂN GIẢI — TỐI THIỂU 300 DPI

### Quy tắc:
- In offset/digital: 300 DPI bắt buộc
- In khổ lớn (banner, bạt): 150 DPI (vì nhìn từ xa)
- In billboard: 72 DPI (nhìn rất xa)

### Cách kiểm tra:
- Photoshop: Image → Image Size → xem Resolution
- Illustrator: Window → Document Info → xem Linked Images
- Nếu < 300 DPI → ảnh sẽ bị vỡ, mờ, pixelated khi in

### Nguồn ảnh chất lượng cao (300 DPI+):
- Shutterstock, Adobe Stock, iStock (trả phí)
- Unsplash, Pexels (miễn phí, đủ 300 DPI)
- Tự chụp bằng điện thoại/camera (thường >= 72 DPI, cần kiểm tra)
- TUYỆT ĐỐI KHÔNG dùng ảnh kéo từ Google (72 DPI, bản quyền)

## 4. FONT CHỮ — EMBED vs OUTLINE

### Vấn đề:
Khi gửi file cho xưởng in, nếu máy in không có font → chữ bị thay đổi hoàn toàn

### 2 Cách xử lý:
1. **Outline/Convert to Curves** (Khuyên dùng nhất):
   - Illustrator: Select All → Type → Create Outlines (Ctrl+Shift+O)
   - CorelDraw: Select All → Convert to Curves
   - Chữ biến thành vector → không phụ thuộc font
   - Nhược điểm: Không sửa chữ được sau khi outline

2. **Embed (Nhúng font)**:
   - Chỉ áp dụng khi xuất PDF
   - PDF → File → Save As → PDF/X-1a (tự embed font)
   - Một số font có bản quyền không cho embed

### Tip:
- Luôn gửi kèm file font cho xưởng (folder Fonts riêng)
- Hoặc outline trước khi gửi → an toàn nhất

## 5. PANTONE vs CMYK — KHI NÀO DÙNG

### In CMYK (4 màu process):
- Phối 4 kênh mực: C, M, Y, K → tạo triệu màu
- Phù hợp: Ảnh chụp, gradient, thiết kế nhiều màu
- Hạn chế: Một số màu đặc biệt không pha chính xác được

### In Pantone (màu pha riêng):
- Pha mực riêng theo mã Pantone trước khi in
- Phù hợp: Logo brand cần CHUẨN MÀU tuyệt đối (VD: Coca-Cola Red = PMS 484)
- Mỗi màu Pantone = 1 bản kẽm riêng → tốn chi phí
- Có những màu Pantone mà CMYK KHÔNG THỂ pha được (neon, metallic)

### Khi nào dùng Pantone:
- Brand identity (logo, bộ nhận diện thương hiệu)
- In số lượng lớn cần đồng nhất màu qua nhiều lần in
- Màu kim loại (vàng, bạc) hoặc màu neon

### Khi nào dùng CMYK:
- In ảnh chụp, catalogue, tờ rơi thông thường
- In digital (máy digital chỉ in CMYK)
- Budget hạn chế (Pantone đắt hơn)

## 6. OVERPRINT & TRAPPING

### Overprint (In chồng):
- Mực in ĐÈ LÊN nhau thay vì knock-out (khoét lỗ)
- Mặc định: Chữ đen (K100) nên bật Overprint → không bị lệch trắng viền
- Không nên overprint màu sáng trên nền tối → ra màu lạ

### Trapping (Chồng mép):
- Kỹ thuật overlap nhẹ giữa 2 vùng màu sát nhau
- Tránh khe trắng khi in offset bị lệch tí xíu (misregistration)
- Thường 0.1-0.25mm
- Phần mềm in (RIP) thường tự xử lý Trapping

### Rich Black vs K100:
- K100 (chỉ mực đen): Đen nhạt, hơi trong, dùng cho chữ nhỏ
- Rich Black (C60 M40 Y40 K100): Đen sâu sắc, dùng cho nền đen lớn
- KHÔNG dùng C100 M100 Y100 K100 (300%+ ink) → giấy ướt, mực không khô

## 7. FORMAT FILE GỬI XƯỞng IN

### Khuyên dùng (ưu tiên từ trên xuống):
1. **PDF/X-1a hoặc PDF/X-4**: Chuẩn in ấn quốc tế, embed font, CMYK
2. **AI** (Adobe Illustrator): File gốc vector, dễ sửa
3. **PSD** (Photoshop): File gốc pixel, cần flatten layers
4. **CDR** (CorelDraw): Phổ biến ở VN

### Không nên gửi:
- JPG/PNG (mất chất lượng, không có bleed, RGB)
- File Canva (cần xuất PDF trước)
- File Word/PowerPoint (không chuẩn in)

### Checklist trước khi gửi file:
- [ ] Hệ màu đã CMYK chưa?
- [ ] Độ phân giải ảnh >= 300 DPI?
- [ ] Bleed 3mm mỗi cạnh?
- [ ] Chữ cách mép >= 4mm?
- [ ] Font đã Outline hoặc Embed?
- [ ] Overprint chữ đen đã bật?
- [ ] Không dùng ảnh Google 72 DPI?
- [ ] File xuất PDF/X-1a?

## 8. CHUYỂN ĐỔI MÀU MÀN HÌNH → IN THỰC TẾ

### Tại sao màu in khác màu trên màn hình?
- Màn hình phát sáng (RGB) → mắt thấy rực rỡ hơn
- Giấy phản chiếu ánh sáng (CMYK) → màu luôn trầm hơn
- Mỗi loại giấy hấp thụ mực khác nhau → couche bóng cho màu tươi hơn couche mờ

### Cách giảm lệch màu:
- Thiết kế bằng CMYK từ đầu
- Calibrate màn hình bằng Spyder hoặc X-Rite
- Yêu cầu xưởng in proof (bản in thử) trước khi in số lượng lớn
- In trên giấy trắng sáng (Ivory, Art) cho màu chuẩn hơn Duplex
- Chấp nhận dung sai 5-10% giữa màn hình và in thực tế (chuẩn ngành)
