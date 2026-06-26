/**
 * Seed Q&A Templates for KPrint / ZaloHub
 * Run: node seed-qa-templates.js
 */
const API = 'http://localhost:4000/api/v1';

// Login first to get token
async function login() {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@zalohub.vn', password: 'admin123' }),
    });
    const data = await res.json();
    return data.accessToken || data.access_token || data.token;
}

const QA_TEMPLATES = [
    // ═══ CHÍNH SÁCH ═══
    {
        title: 'Xuất hóa đơn VAT',
        triggerKeywords: 'xuất hóa đơn, VAT, hóa đơn đỏ, hóa đơn GTGT, invoice',
        content: 'Dạ bên em có xuất hóa đơn VAT ạ. Phí xuất hóa đơn là 8% trên tổng giá trị đơn hàng. Bạn vui lòng cung cấp thông tin:\n- Tên công ty\n- Mã số thuế\n- Địa chỉ công ty\n- Email nhận hóa đơn\nEm sẽ xuất hóa đơn trong vòng 3-5 ngày làm việc sau khi hoàn thành đơn ạ!',
        category: 'chính sách',
        autoReply: true,
    },
    {
        title: 'Thời gian giao hàng',
        triggerKeywords: 'bao lâu, mấy ngày, thời gian giao, khi nào nhận, giao hàng, deadline, gấp không',
        content: 'Dạ thời gian sản xuất tùy theo sản phẩm ạ:\n• Namecard, tờ rơi: 2-3 ngày làm việc\n• Catalogue, brochure: 3-5 ngày làm việc\n• Hộp, bao bì: 5-7 ngày làm việc\n• In khổ lớn (banner, poster): 1-2 ngày\n\nNếu bạn cần GẤP, bên em có dịch vụ in nhanh (phụ phí 20-30%) — giao trong 24h cho hầu hết sản phẩm. Bạn cần gấp không ạ?',
        category: 'chính sách',
        autoReply: false,
    },
    {
        title: 'Phí vận chuyển',
        triggerKeywords: 'phí ship, phí vận chuyển, giao hàng, ship, freeship, miễn phí giao',
        content: 'Dạ chính sách vận chuyển bên em:\n• Đơn hàng trên 500.000đ: MIỄN PHÍ giao hàng nội thành\n• Đơn dưới 500.000đ: phí ship 25.000-40.000đ tùy khu vực\n• Giao tỉnh: theo bảng giá GHTK/GHN (thường 30.000-60.000đ)\n• Đơn trên 2 triệu: freeship toàn quốc\n\nBạn ở khu vực nào để em tính phí chính xác ạ?',
        category: 'chính sách',
        autoReply: false,
    },
    {
        title: 'Thanh toán',
        triggerKeywords: 'thanh toán, chuyển khoản, tiền mặt, payment, trả tiền, đặt cọc, cọc',
        content: 'Dạ bên em hỗ trợ nhiều hình thức thanh toán:\n• Chuyển khoản ngân hàng (ưu tiên)\n• Tiền mặt khi nhận hàng (COD)\n• Ví MoMo / ZaloPay\n\nĐối với đơn hàng trên 1 triệu, bên em yêu cầu đặt cọc 50% trước khi sản xuất ạ. Bạn muốn thanh toán bằng hình thức nào?',
        category: 'chính sách',
        autoReply: true,
    },
    {
        title: 'Chính sách đổi trả',
        triggerKeywords: 'đổi trả, bảo hành, lỗi in, in sai, không đúng, hoàn tiền, khiếu nại',
        content: 'Dạ chính sách đổi trả/bảo hành bên em:\n• Nếu LỖI DO BÊN EM (in sai, màu lệch so với proof, lỗi kỹ thuật): in lại MIỄN PHÍ 100%\n• Nếu lỗi do file khách gửi (sai nội dung, thiếu bleed): không đổi trả\n• Khiếu nại trong vòng 48h kể từ khi nhận hàng\n\nBên em luôn gửi bản proof (bản in thử) để bạn duyệt trước khi in hàng loạt, đảm bảo đúng yêu cầu ạ!',
        category: 'chính sách',
        autoReply: true,
    },
    {
        title: 'Số lượng in tối thiểu',
        triggerKeywords: 'số lượng tối thiểu, in ít, 1 tờ, vài tờ, in thử, MOQ',
        content: 'Dạ số lượng tối thiểu tùy theo sản phẩm:\n• In digital (namecard, tờ rơi A4/A5): từ 50 tờ\n• In offset (catalogue, brochure): từ 200 bản\n• Hộp/bao bì: từ 300 hộp\n• In khổ lớn (banner, poster): từ 1 tấm\n• Decal/sticker: từ 100 tờ\n\nNếu bạn cần in số lượng ít hơn, bên em vẫn nhận nhưng giá/tờ sẽ cao hơn do setup máy. Bạn cần in gì và bao nhiêu ạ?',
        category: 'chính sách',
        autoReply: false,
    },
    {
        title: 'Giờ làm việc',
        triggerKeywords: 'giờ làm việc, mấy giờ, mở cửa, đóng cửa, thứ 7, chủ nhật, cuối tuần',
        content: 'Dạ giờ làm việc bên em:\n• Thứ 2 - Thứ 6: 8:00 - 17:30\n• Thứ 7: 8:00 - 12:00\n• Chủ nhật: Nghỉ\n\nBạn có thể nhắn tin qua Zalo bất cứ lúc nào, em sẽ phản hồi trong giờ làm việc sớm nhất ạ! 😊',
        category: 'chung',
        autoReply: true,
    },
    {
        title: 'Địa chỉ công ty',
        triggerKeywords: 'địa chỉ, ở đâu, chỗ nào, xưởng in, văn phòng, ghé, đến lấy',
        content: 'Dạ địa chỉ bên em:\n📍 Xưởng in: [Địa chỉ xưởng]\n📍 Văn phòng giao dịch: [Địa chỉ VP]\n\nBạn có thể ghé trực tiếp để xem mẫu in và tư vấn. Nếu bạn muốn, em sẽ gửi link Google Maps nhé!',
        category: 'chung',
        autoReply: true,
    },

    // ═══ KỸ THUẬT ═══
    {
        title: 'Yêu cầu file thiết kế',
        triggerKeywords: 'file thiết kế, gửi file, format file, định dạng, AI, PSD, PDF, corel',
        content: 'Dạ bạn gửi file theo yêu cầu sau để in đạt chất lượng tốt nhất:\n✅ Định dạng: PDF, AI (Adobe Illustrator), PSD, CDR (CorelDraw)\n✅ Độ phân giải: tối thiểu 300dpi\n✅ Hệ màu: CMYK (không dùng RGB)\n✅ Bleed (tràn lề): 3mm mỗi bên\n✅ Font chữ: đã chuyển sang đường cong (outline/convert to curves)\n\nNếu bạn chưa có file thiết kế, bên em có dịch vụ thiết kế với phí từ 200.000đ/mẫu. Bạn đã có file chưa ạ?',
        category: 'kỹ thuật',
        autoReply: true,
    },
    {
        title: 'In offset vs in digital',
        triggerKeywords: 'offset, digital, khác nhau, nên chọn, loại in nào, kỹ thuật in',
        content: 'Dạ 2 kỹ thuật in chính:\n\n🔵 IN OFFSET:\n• Số lượng lớn (>500 tờ): giá rẻ hơn\n• Chất lượng màu cực tốt, sắc nét\n• Thời gian: 3-5 ngày (cần làm kẽm)\n• Phù hợp: catalogue, brochure, sách, bao bì\n\n🟢 IN DIGITAL:\n• Số lượng ít (<500 tờ): linh hoạt\n• Không cần làm kẽm, in nhanh\n• Thời gian: 1-2 ngày\n• Phù hợp: namecard, tờ rơi, thiệp mời\n\n➡️ Bạn cần in bao nhiêu bản để em tư vấn kỹ thuật phù hợp nhất ạ?',
        category: 'kỹ thuật',
        autoReply: false,
    },
    {
        title: 'Giấy couche',
        triggerKeywords: 'giấy couche, couché, giấy bóng, giấy mờ, couche 150, couche 200, couche 300',
        content: 'Dạ giấy couche là loại giấy phổ biến nhất trong in ấn, có 2 loại:\n\n✨ COUCHE BÓNG: bề mặt bóng láng, màu sắc rực rỡ. Phù hợp in ảnh, catalogue, tờ rơi.\n🌫️ COUCHE MỜ: bề mặt mịn, không phản sáng, sang trọng hơn. Phù hợp namecard, brochure cao cấp.\n\nĐịnh lượng phổ biến:\n• 150gsm: tờ rơi, poster (mỏng, nhẹ)\n• 200gsm: catalogue, menu\n• 250-300gsm: namecard, bìa catalogue, thiệp\n• 350gsm: hộp, tag sản phẩm\n\nBạn muốn in sản phẩm gì để em gợi ý loại giấy phù hợp ạ?',
        category: 'kỹ thuật',
        autoReply: false,
    },
    {
        title: 'Cán mờ / Cán bóng',
        triggerKeywords: 'cán mờ, cán bóng, cán màng, laminate, phủ bóng, phủ mờ, gia công sau in',
        content: 'Dạ cán mờ/cán bóng là lớp màng phủ lên bề mặt giấy sau khi in:\n\n🌫️ CÁN MỜ: bề mặt mịn, sang trọng, không phản sáng. Phù hợp namecard, bìa catalogue cao cấp.\n✨ CÁN BÓNG: bề mặt bóng loáng, làm nổi bật màu sắc. Phù hợp tờ rơi, poster, menu.\n\nNgoài ra còn có gia công đặc biệt:\n• Ép nhũ vàng/bạc\n• Dập nổi (emboss)\n• Bế (die-cut)\n• Phủ UV cục bộ\n\nPhí gia công thêm khoảng 200-500đ/tờ tùy loại. Bạn muốn gia công gì thêm ạ?',
        category: 'kỹ thuật',
        autoReply: false,
    },
    {
        title: 'Ép nhũ',
        triggerKeywords: 'ép nhũ, nhũ vàng, nhũ bạc, foil, hot stamp, nhũ kim loại',
        content: 'Dạ ép nhũ (hot stamping foil) là kỹ thuật tạo hiệu ứng kim loại sang trọng trên giấy:\n\n🥇 Nhũ vàng: phổ biến nhất, sang trọng\n🥈 Nhũ bạc: hiện đại, thanh lịch\n🌈 Nhũ hologram: hiệu ứng cầu vồng bắt mắt\n🔴 Nhũ màu (đỏ, xanh...): nổi bật, cá tính\n\nÉp nhũ thường dùng cho: namecard, thiệp cưới, bìa sách, nhãn sản phẩm, hộp quà.\n\nPhí ép nhũ tùy diện tích. Bạn muốn ép nhũ cho sản phẩm gì ạ?',
        category: 'kỹ thuật',
        autoReply: false,
    },
    {
        title: 'Hệ màu CMYK vs RGB',
        triggerKeywords: 'CMYK, RGB, hệ màu, màu in ra khác, lệch màu, sai màu',
        content: 'Dạ đây là câu hỏi rất hay! 😊\n\n🖥️ RGB: hệ màu của MÀN HÌNH (đỏ, xanh lá, xanh dương). File từ Canva, web thường dùng RGB.\n🖨️ CMYK: hệ màu của IN ẤN (cyan, magenta, vàng, đen). File in PHẢI ở CMYK.\n\n⚠️ Nếu gửi file RGB để in → máy in tự chuyển sang CMYK → MÀU SẼ BỊ LỆCH (thường tối hơn, trầm hơn).\n\n✅ Cách khắc phục: Trong phần mềm thiết kế, chuyển sang CMYK trước khi xuất file. Nếu bạn chưa biết cách, cứ gửi file cho em, bên em sẽ kiểm tra và điều chỉnh giúp ạ!',
        category: 'kỹ thuật',
        autoReply: true,
    },
    {
        title: 'Bleed / Tràn lề',
        triggerKeywords: 'bleed, tràn lề, bleed 3mm, safe zone, an toàn, bị cắt',
        content: 'Dạ Bleed (tràn lề) là phần mở rộng thiết kế ra ngoài đường cắt:\n\n📐 Bleed chuẩn: 3mm mỗi bên\n📐 Safe zone: nội dung quan trọng (text, logo) cách mép cắt ít nhất 5mm\n\nVD: Namecard 90x54mm → file thiết kế cần là 96x60mm (thêm 3mm mỗi bên)\n\n⚠️ Nếu KHÔNG có bleed: khi cắt sẽ bị viền trắng ở mép\n✅ Nếu CÓ bleed: cắt đẹp, gọn, không lộ mép\n\nBạn cần em kiểm tra file giúp không ạ?',
        category: 'kỹ thuật',
        autoReply: true,
    },

    // ═══ SẢN PHẨM ═══
    {
        title: 'In namecard',
        triggerKeywords: 'namecard, name card, danh thiếp, card visit, business card, in card',
        content: 'Dạ bên em chuyên in namecard với nhiều lựa chọn:\n\n📋 Kích thước: 90x54mm (chuẩn quốc tế)\n📋 Giấy phổ biến:\n• Couche 300gsm + cán mờ/bóng: từ 150.000đ/hộp 200 cái\n• Art 350gsm: từ 200.000đ/hộp\n• Mỹ thuật (cotton, linen): từ 350.000đ/hộp\n\n🌟 Gia công thêm: ép nhũ, bo góc, dập nổi, UV cục bộ\n\nBạn có sẵn file thiết kế chưa, hay cần em thiết kế giúp ạ?',
        category: 'giá cả',
        autoReply: false,
    },
    {
        title: 'In tờ rơi / flyer',
        triggerKeywords: 'tờ rơi, flyer, in leaflet, tờ bướm, in tờ, in quảng cáo',
        content: 'Dạ báo giá in tờ rơi bên em:\n\n📄 Tờ rơi A5 (148x210mm) - Couche 150gsm:\n• 500 tờ: ~450.000đ (900đ/tờ)\n• 1.000 tờ: ~650.000đ (650đ/tờ)\n• 5.000 tờ: ~1.800.000đ (360đ/tờ)\n\n📄 Tờ rơi A4 (210x297mm) - Couche 150gsm:\n• 500 tờ: ~700.000đ\n• 1.000 tờ: ~1.000.000đ\n\n* Giá chỉ mang tính tham khảo, giá chính xác tùy chất liệu và gia công. Bạn cần in bao nhiêu tờ, khổ nào ạ?',
        category: 'giá cả',
        autoReply: false,
    },
    {
        title: 'In catalogue',
        triggerKeywords: 'catalogue, catalog, in sách, in brochure, in booklet, in menu',
        content: 'Dạ in catalogue/brochure bên em:\n\n📖 Catalogue gấp 3 (A4 gấp): từ 1.500đ/tờ (SL 500)\n📖 Catalogue 8 trang A4: từ 8.000đ/cuốn (SL 500)\n📖 Catalogue 16 trang A4: từ 14.000đ/cuốn (SL 500)\n📖 Catalogue 24+ trang: liên hệ báo giá chi tiết\n\nGiấy thường dùng: couche 200gsm (ruột) + 300gsm (bìa) + cán mờ\nĐóng: ghim lò xo / keo gáy / khâu chỉ\n\nBạn cần catalogue bao nhiêu trang, số lượng bao nhiêu cuốn ạ?',
        category: 'giá cả',
        autoReply: false,
    },
    {
        title: 'In banner / khổ lớn',
        triggerKeywords: 'banner, băng rôn, hiflex, bạt, standee, poster lớn, backdrop, in khổ lớn',
        content: 'Dạ in khổ lớn bên em:\n\n🖼️ Banner hiflex (bạt): 50.000-80.000đ/m²\n🖼️ Banner PP (trong nhà): 80.000-120.000đ/m²\n🖼️ Standee 60x160cm: 150.000-200.000đ/cái (kèm chân)\n🖼️ Backdrop sự kiện: từ 150.000đ/m²\n🖼️ Poster (couche/PP dán): 100.000-150.000đ/m²\n\nIn khổ lớn thường giao trong 1-2 ngày. Bạn cần in kích thước bao nhiêu và dùng trong nhà hay ngoài trời ạ?',
        category: 'giá cả',
        autoReply: false,
    },
    {
        title: 'In decal / sticker',
        triggerKeywords: 'decal, sticker, nhãn dán, tem, label, in tem, in nhãn',
        content: 'Dạ in decal/sticker bên em:\n\n🏷️ Decal giấy (trong nhà): từ 500đ/tờ A4\n🏷️ Decal nhựa PVC (chống nước): từ 1.000đ/tờ A4\n🏷️ Decal trong suốt: từ 1.200đ/tờ A4\n🏷️ Decal bế theo hình: phí bế thêm 200-500đ/tờ\n\nBạn cần in decal dùng cho mục đích gì (dán sản phẩm, dán xe, dán tường...)? Em sẽ tư vấn chất liệu phù hợp nhất ạ!',
        category: 'giá cả',
        autoReply: false,
    },
    {
        title: 'In hộp / bao bì',
        triggerKeywords: 'hộp, bao bì, in hộp, hộp giấy, packaging, hộp sản phẩm, hộp carton',
        content: 'Dạ in hộp/bao bì bên em có nhiều loại:\n\n📦 Hộp giấy duplex (1 mặt): từ 3.000đ/hộp (SL 500+)\n📦 Hộp giấy art (2 mặt trắng): từ 5.000đ/hộp (SL 500+)\n📦 Hộp kraft (tự nhiên): từ 2.500đ/hộp\n📦 Hộp cứng bồi: từ 15.000đ/hộp\n\nGia công: cán mờ/bóng, ép nhũ, dập nổi, bế hình\nSố lượng tối thiểu: 300 hộp\n\nBạn có mẫu hộp hoặc kích thước cụ thể chưa ạ?',
        category: 'giá cả',
        autoReply: false,
    },

    // ═══ DỊCH VỤ ═══
    {
        title: 'Dịch vụ thiết kế',
        triggerKeywords: 'thiết kế, design, chưa có file, nhờ thiết kế, tư vấn thiết kế, cần mẫu',
        content: 'Dạ bên em có dịch vụ thiết kế chuyên nghiệp:\n\n🎨 Namecard: 200.000đ/mẫu\n🎨 Tờ rơi/flyer A5: 300.000đ/mẫu\n🎨 Catalogue 8-12 trang: 1.500.000-3.000.000đ\n🎨 Logo: 500.000-2.000.000đ\n🎨 Bao bì: 500.000-1.500.000đ\n\nQuy trình:\n1. Bạn gửi yêu cầu + tham khảo (nếu có)\n2. Em gửi bản nháp trong 1-2 ngày\n3. Bạn feedback → chỉnh sửa (2 lần miễn phí)\n4. Duyệt final → in\n\nBạn cần thiết kế sản phẩm gì ạ?',
        category: 'chung',
        autoReply: false,
    },
    {
        title: 'In mẫu thử / proof',
        triggerKeywords: 'in thử, mẫu thử, proof, duyệt mẫu, xem trước, in demo',
        content: 'Dạ bên em có chính sách in mẫu thử:\n\n✅ Proof kỹ thuật số (PDF): MIỄN PHÍ — em gửi file qua Zalo/email để bạn duyệt\n🖨️ In thử 1-2 tờ (digital): 50.000-100.000đ tùy kích thước\n🖨️ In thử offset (proof kẽm): 200.000-500.000đ\n\nBên em LUÔN gửi proof để bạn xác nhận trước khi in hàng loạt, đảm bảo đúng 100% yêu cầu ạ! Bạn muốn em gửi proof dạng nào?',
        category: 'chung',
        autoReply: true,
    },
    {
        title: 'In gấp / in nhanh',
        triggerKeywords: 'in gấp, in nhanh, cần gấp, khẩn, urgent, express, hỏa tốc',
        content: 'Dạ bên em có dịch vụ IN GẤP:\n\n⚡ Namecard, tờ rơi: giao trong 24h\n⚡ Catalogue, brochure: giao trong 48h\n⚡ Banner, poster: giao trong 4-6 tiếng\n\nPhụ phí in gấp: 20-30% tùy sản phẩm\n\n⚠️ Lưu ý: bạn cần gửi file hoàn chỉnh (không cần chỉnh sửa) để đảm bảo kịp deadline.\n\nBạn cần in gấp sản phẩm gì, deadline khi nào ạ?',
        category: 'chung',
        autoReply: false,
    },
    {
        title: 'Chào hỏi chung',
        triggerKeywords: 'xin chào, hello, hi, chào shop, chào bạn, alo',
        content: 'Xin chào bạn! 👋 Cảm ơn bạn đã liên hệ KPrint.\nBên em chuyên in ấn: namecard, tờ rơi, catalogue, banner, bao bì, decal và nhiều sản phẩm khác.\n\nBạn cần tư vấn về sản phẩm nào ạ? Em sẵn lòng hỗ trợ! 😊',
        category: 'chung',
        autoReply: true,
    },
    {
        title: 'Cảm ơn / Kết thúc',
        triggerKeywords: 'cảm ơn, thanks, thank you, ok em, bye, tạm biệt, hẹn gặp',
        content: 'Dạ không có gì ạ! 😊 Cảm ơn bạn đã quan tâm đến dịch vụ bên em.\nNếu có thêm câu hỏi hay cần báo giá, bạn cứ nhắn tin bất cứ lúc nào nhé. Chúc bạn một ngày tốt lành! ❤️',
        category: 'chung',
        autoReply: true,
    },
    {
        title: 'Báo giá',
        triggerKeywords: 'báo giá, giá bao nhiêu, chi phí, bao nhiêu tiền, price, quotation, bảng giá',
        content: 'Dạ để em báo giá chính xác, bạn vui lòng cho em biết:\n\n1️⃣ Sản phẩm cần in (namecard, tờ rơi, catalogue, hộp...?)\n2️⃣ Số lượng\n3️⃣ Kích thước\n4️⃣ Chất liệu (nếu biết)\n5️⃣ Gia công thêm (cán mờ, ép nhũ...?)\n\nHoặc bạn gửi file mẫu/hình tham khảo, em sẽ tư vấn và báo giá nhanh nhất ạ! 📩',
        category: 'giá cả',
        autoReply: true,
    },
];

async function seed() {
    console.log('🔐 Logging in...');
    const token = await login();
    if (!token) { console.error('❌ Login failed!'); return; }
    console.log('✅ Logged in');

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };

    // Check existing
    const existing = await fetch(`${API}/canned-responses`, { headers });
    const existingData = await existing.json();
    console.log(`📋 Existing Q&A: ${Array.isArray(existingData) ? existingData.length : 0}`);

    let created = 0;
    let skipped = 0;

    for (const qa of QA_TEMPLATES) {
        // Check if already exists by title
        if (Array.isArray(existingData) && existingData.some(e => e.title === qa.title)) {
            console.log(`⏭️ Skipped (exists): ${qa.title}`);
            skipped++;
            continue;
        }

        try {
            const res = await fetch(`${API}/canned-responses`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...qa, isGlobal: true, shortcut: '/' }),
            });
            if (res.ok) {
                console.log(`✅ Created: ${qa.title}`);
                created++;
            } else {
                const err = await res.text();
                console.error(`❌ Failed: ${qa.title} — ${err}`);
            }
        } catch (err) {
            console.error(`❌ Error: ${qa.title} — ${err.message}`);
        }
    }

    console.log(`\n🎉 Done! Created: ${created}, Skipped: ${skipped}, Total templates: ${QA_TEMPLATES.length}`);
}

seed();
