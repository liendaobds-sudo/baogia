const API = 'http://localhost:4000/api/v1';
async function login() {
    const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@zalohub.vn', password: 'admin123' }) });
    return (await res.json()).accessToken;
}

const QA = [
    // ═══ SO SÁNH CHẤT LIỆU ═══
    { title: "So sánh: Decal giấy vs Decal nhựa", triggerKeywords: "decal giay va nhua, decal giay hay nhua, khac nhau decal, so sanh decal, nen dung decal gi, decal nao ben hon, chon decal nao", content: "Dạ, đây là so sánh chi tiết giữa 2 loại Decal phổ biến nhất ạ:\n\n📋 DECAL GIẤY:\n• Giá thành: RẺ hơn ~30-40%.\n• Bề mặt: Mịn, in màu đẹp tự nhiên.\n• Hạn chế: Sợ nước, dễ rách, phai màu khi phơi nắng.\n• Dùng cho: Hộp carton, bao bì khô ráo, sản phẩm dùng trong nhà.\n\n💧 DECAL NHỰA (PP/PVC):\n• Giá thành: Cao hơn giấy.\n• Bề mặt: Bóng hoặc mờ, chống nước 100%, dai xé không rách.\n• Dùng cho: Chai lọ, mỹ phẩm, thực phẩm đông lạnh, sản phẩm tiếp xúc nước.\n\n👉 Quy tắc chọn: Sản phẩm có dính nước/ẩm → chọn nhựa. Khô ráo → chọn giấy tiết kiệm.\nSản phẩm của mình thuộc loại nào ạ? 🤔", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Cán mờ vs Cán bóng", triggerKeywords: "can mo hay bong, khac nhau can mang, so sanh can mang, mang mo va bong, nen can mo hay bong, can mo dep hon, can bong dep hon", content: "Dạ, so sánh 2 loại cán màng phổ biến nhất ạ:\n\n🌞 CÁN BÓNG:\n• Hiệu ứng: Bề mặt sáng loáng, phản chiếu ánh sáng.\n• Màu sắc: Rực rỡ, đậm, nổi bật.\n• Phù hợp: Tờ rơi bắt mắt, poster, bao bì thực phẩm.\n• Nhược: Dễ bám vân tay, lóa mắt khi chụp ảnh.\n\n🌙 CÁN MỜ:\n• Hiệu ứng: Bề mặt mịn, hấp thụ ánh sáng.\n• Màu sắc: Nhẹ nhàng, tông trầm thanh lịch.\n• Phù hợp: Namecard, hộp cao cấp, catalogue sang trọng.\n• Ưu: Không lóa, không bám vân tay.\n\n👉 Quy tắc: Muốn nổi bật → bóng. Muốn sang trọng → mờ.\nThiết kế của anh/chị thiên về tone màu gì ạ? 🎨", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Giấy Couche vs Giấy Art", triggerKeywords: "couche hay art, couche va art, khac nhau couche art, so sanh couche, giay art la gi, giay couche la gi, chon couche hay art", content: "Dạ, thực ra Couche và Art rất giống nhau, chỉ khác ở xuất xứ ạ:\n\n📄 GIẤY COUCHE:\n• Xuất xứ: Thường là giấy nội địa hoặc nhập từ TQ/Indonesia.\n• Bề mặt: Tráng phủ 2 mặt, bóng mịn.\n• Giá: RẺ hơn, phổ biến nhất.\n• Dùng cho: Tờ rơi, catalogue, poster - đa số ấn phẩm thông dụng.\n\n📄 GIẤY ART (Art Paper):\n• Xuất xứ: Thường nhập từ Nhật, Hàn, châu Âu.\n• Bề mặt: Tráng phủ mịn hơn, độ trắng cao hơn.\n• Giá: Cao hơn Couche ~10-20%.\n• Dùng cho: Catalogue cao cấp, bao bì mỹ phẩm cần màu chuẩn.\n\n👉 Tóm lại: Cùng định lượng, Art chất lượng nhỉnh hơn nhưng đắt hơn. Kinh phí vừa phải → Couche là đủ.\nMình đang in sản phẩm gì ạ? 📖", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Giấy Ivory vs Giấy Duplex", triggerKeywords: "ivory hay duplex, ivory va duplex, so sanh ivory, giay ivory la gi, giay duplex la gi, khac nhau ivory, giay lam hop", content: "Dạ, đây là 2 loại giấy chuyên dùng làm hộp bao bì ạ:\n\n⚪ GIẤY IVORY (SBS - Solid Bleached Sulfate):\n• 2 mặt đều TRẮNG, mịn.\n• In offset 2 mặt đẹp, màu chuẩn.\n• Giá: ĐẮT hơn.\n• Dùng cho: Hộp mỹ phẩm, dược phẩm, thực phẩm cao cấp (cần đạt chuẩn an toàn).\n\n🔲 GIẤY DUPLEX:\n• Mặt trước TRẮNG (in được), mặt sau XÁM.\n• In 1 mặt, mặt sau giấu bên trong hộp.\n• Giá: RẺ hơn nhiều.\n• Dùng cho: Hộp giày, hộp điện tử, bao bì không cần in 2 mặt.\n\n👉 Hộp cần 2 mặt đẹp → Ivory. Chỉ cần 1 mặt → Duplex tiết kiệm.\nHộp của mình cần nhìn đẹp cả trong lẫn ngoài không ạ? 📦", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Giấy Kraft trắng vs Kraft nâu", triggerKeywords: "kraft trang hay nau, so sanh kraft, giay kraft nau, giay kraft trang, kraft la gi, white kraft, brown kraft, chon kraft nao", content: "Dạ, Giấy Kraft là loại giấy sợi dài siêu dai, rất khó xé rách ạ:\n\n🤎 KRAFT NÂU:\n• Màu nâu tự nhiên đặc trưng, không tẩy trắng.\n• Phong cách: Mộc mạc, organic, handmade, eco-friendly.\n• Dùng cho: Túi giấy, bao bì thực phẩm sạch, thương hiệu xanh.\n\n🤍 KRAFT TRẮNG:\n• Đã qua tẩy trắng, in màu rực rỡ hơn.\n• Phong cách: Sạch sẽ, hiện đại.\n• Dùng cho: Túi giấy cao cấp, hộp quà, bao bì thời trang.\n\n👉 Thương hiệu thiên về tự nhiên → nâu. Hiện đại sạch sẽ → trắng.\nPhong cách thương hiệu của mình theo hướng nào ạ? 🌿", category: "kỹ thuật", autoReply: true },

    // ═══ SO SÁNH QUY CÁCH / KỸ THUẬT ═══
    { title: "So sánh: Ép kim nóng vs Ép kim lạnh", triggerKeywords: "ep kim nong, ep kim lanh, cold foil, hot foil, khac nhau ep kim, so sanh ep kim, loai ep kim nao", content: "Dạ, có 2 công nghệ ép kim khác nhau ạ:\n\n🔥 ÉP KIM NÓNG (Hot Foil Stamping):\n• Dùng nhiệt + áp lực để ép nhũ xuống giấy.\n• Tạo hiệu ứng lõm nhẹ, xúc giác rõ ràng.\n• Màu sắc: Đa dạng (vàng, bạc, đồng, hologram...).\n• Phù hợp: Namecard, bìa sách, hộp cao cấp, thiệp cưới.\n\n❄️ ÉP KIM LẠNH (Cold Foil):\n• Dùng keo UV để dính nhũ, chạy trên máy in offset.\n• Nhanh hơn, phù hợp số lượng lớn.\n• Hạn chế: Ít màu hơn, không có hiệu ứng lõm.\n\n👉 Cần sang trọng xúc giác → nóng. Số lượng lớn tối ưu giá → lạnh.\nSản phẩm của mình là gì ạ? ✨", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Bấm ghim vs Keo gáy vs Lò xo", triggerKeywords: "bam ghim hay keo gay, so sanh dong gay, ghim va keo, lo xo hay keo, cach dong sach, dong cuon nao tot, chon kieu dong", content: "Dạ, so sánh 3 kiểu đóng gáy phổ biến ạ:\n\n📎 BẤM GHIM GIỮA:\n• Phù hợp: Cuốn mỏng dưới 40 trang (16-36 trang lý tưởng).\n• Ưu: Rẻ nhất, nhanh nhất. Cuốn mở phẳng 180°.\n• Nhược: Quá nhiều trang sẽ bị phồng.\n\n📚 ĐÓNG KEO GÁY (Perfect Binding):\n• Phù hợp: Cuốn dày 40-300 trang.\n• Ưu: Gáy vuông đẹp, in được tên sách lên gáy.\n• Nhược: Không mở phẳng hoàn toàn, trang dễ bung nếu chất lượng keo kém.\n\n🌀 ĐÓNG LÒ XO:\n• Phù hợp: Sổ, menu, tài liệu training.\n• Ưu: Lật 360°, dễ dùng, thêm/bớt trang được.\n• Nhược: Nhìn ít sang trọng hơn.\n\nCuốn của mình bao nhiêu trang và mục đích sử dụng gì ạ? 📖", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: In phun vs In lụa vs In chuyển nhiệt (trên áo)", triggerKeywords: "in ao, in phun, in lua, in chuyen nhiet, dtg, in nhiet, in áo thun, so sanh in ao, in ao nao tot, in dong phuc", content: "Dạ, 3 công nghệ in trên vải/áo phổ biến ạ:\n\n🖨️ IN PHUN TRỰC TIẾP (DTG):\n• Phù hợp: Hình full màu, gradient, ảnh chụp.\n• Ưu: Chi tiết cao, không giới hạn màu.\n• Nhược: Đắt, chậm, chỉ tốt trên vải cotton trắng.\n\n🎨 IN LỤA (Silkscreen):\n• Phù hợp: Logo 1-3 màu, nét to bản, số lượng lớn.\n• Ưu: Rẻ khi in đại trà, mực bền, màu đậm.\n• Nhược: Nhiều màu = nhiều khuôn = tốn phí.\n\n🔥 IN CHUYỂN NHIỆT (Heat Transfer):\n• Phù hợp: Ảnh full màu, số lượng ít.\n• Ưu: Nhanh, in 1 cái cũng được.\n• Nhược: Bề mặt hơi cứng, bong tróc sau nhiều lần giặt.\n\nMình in cho đồng phục hay bán lẻ, số lượng bao nhiêu ạ? 👕", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: UV cục bộ vs UV toàn phần", triggerKeywords: "uv cuc bo hay toan phan, so sanh uv, uv toan phan la gi, phu uv het, uv spot va flood, chon uv nao", content: "Dạ, 2 loại phủ UV khác nhau ạ:\n\n🔦 UV CỤC BỘ (Spot UV):\n• Chỉ phủ UV lên MỘT PHẦN thiết kế (logo, text, hình).\n• Tạo hiệu ứng: Tương phản bóng/mờ cực đẹp trên nền cán mờ.\n• Giá: Đắt hơn (cần làm bản kẽm riêng).\n• Dùng cho: Namecard, hộp cao cấp, bìa catalogue.\n\n☀️ UV TOÀN PHẦN (Flood UV):\n• Phủ UV phủ đều TOÀN BỘ bề mặt.\n• Tạo hiệu ứng: Bóng loáng đều, bảo vệ bề mặt.\n• Giá: Rẻ hơn UV cục bộ.\n• Dùng cho: Bìa sách, poster, bao bì cần chống xước.\n\n👉 Cần điểm nhấn nghệ thuật → UV cục bộ. Cần bảo vệ toàn bộ → UV toàn phần.\nMình muốn tạo hiệu ứng gì ạ? ✨", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: In PP vs In Bạt Hiflex", triggerKeywords: "pp hay hiflex, so sanh pp va bat, in pp la gi, hiflex la gi, khac nhau pp hiflex, in ngoai troi chon gi, in trong nha", content: "Dạ, đây là 2 chất liệu in khổ lớn phổ biến nhất ạ:\n\n🏠 IN PP (Polypropylene) CÁN MÀNG:\n• Chất liệu: Nhựa PP mỏng, nhẹ.\n• Độ nét: CỰC CAO (1440 DPI), màu tươi sáng.\n• Phù hợp: Dán trong nhà, dán kính, dán tường showroom.\n• Hạn chế: Mỏng, không chịu được mưa gió.\n\n🌧️ IN BẠT HIFLEX:\n• Chất liệu: Bạt nhựa PVC dày, siêu bền.\n• Độ nét: Thấp hơn PP (720 DPI), nhìn xa vẫn đẹp.\n• Phù hợp: Banner ngoài trời, băng rôn, quảng cáo chịu mưa nắng.\n• Ưu: Rẻ, bền, chống nước hoàn toàn.\n\n👉 Trong nhà cần nét → PP. Ngoài trời chịu thời tiết → Hiflex.\nVị trí treo/dán của mình ở đâu ạ? 📍", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Ép nhũ vàng vs Ép nhũ bạc vs Hologram", triggerKeywords: "nhu vang hay bac, chon mau nhu, ep nhu mau gi, vang va bac, hologram la gi, nhu 7 mau, so sanh nhu", content: "Dạ, 3 loại nhũ ép kim phổ biến nhất ạ:\n\n🥇 NHŨ VÀNG (Gold):\n• Cảm giác: Sang trọng, quyền lực, cổ điển.\n• Phù hợp: Thiệp cưới, hộp yến, rượu, mỹ phẩm cao cấp.\n• Tip: Đẹp nhất trên nền giấy tối màu (đen, xanh navy, đỏ đô).\n\n🥈 NHŨ BẠC (Silver):\n• Cảm giác: Hiện đại, tối giản, công nghệ.\n• Phù hợp: Bao bì điện tử, namecard công ty tech, hộp mỹ phẩm Hàn.\n• Tip: Đẹp trên nền trắng hoặc xám.\n\n🌈 NHŨ HOLOGRAM (7 Màu):\n• Cảm giác: Bắt mắt, lấp lánh đổi màu theo góc nhìn.\n• Phù hợp: Tem chống giả, bao bì nổi bật, thẻ VIP.\n\nPhong cách thương hiệu của mình thiên về cổ điển hay hiện đại ạ? 💫", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: In 4 màu (CMYK) vs In Pantone", triggerKeywords: "cmyk hay pantone, so sanh cmyk pantone, in 4 mau hay pantone, khac nhau cmyk pantone, khi nao dung pantone", content: "Dạ, đây là câu hỏi rất hay ạ:\n\n🖨️ IN 4 MÀU (CMYK - Process Color):\n• Cách hoạt động: Phối 4 kênh mực Cyan, Magenta, Yellow, Black.\n• Ưu: In được triệu màu, ảnh chụp, gradient. Tiết kiệm.\n• Nhược: Một số màu đặc biệt (cam rực, xanh neon, vàng chanh) không pha được chính xác.\n\n🎯 IN MÀU PHA (Pantone - Spot Color):\n• Cách hoạt động: Pha mực riêng theo mã Pantone trước khi in.\n• Ưu: Màu cực CHUẨN, đồng nhất 100% giữa các lần in.\n• Nhược: Mỗi màu Pantone = 1 đơn vị kẽm riêng, tốn chi phí.\n\n👉 In ảnh/nhiều màu → CMYK. Cần chuẩn màu brand identity → thêm Pantone.\nThiết kế của mình có yêu cầu chuẩn màu đặc biệt không ạ? 🎨", category: "kỹ thuật", autoReply: true },

    { title: "So sánh: Couche 150gsm vs 200gsm vs 300gsm", triggerKeywords: "chon gsm nao, 150 hay 200, 200 hay 300, giay bao nhieu gsm, do day phu hop, nen dung giay may gsm, day mong the nao", content: "Dạ, hướng dẫn chọn GSM theo sản phẩm ạ:\n\n📄 COUCHE 100-120gsm (Mỏng như tờ tạp chí):\n• Dùng cho: Tờ rơi phát ngoài đường, ruột catalogue số lượng lớn.\n• Đặc điểm: Nhẹ, tiết kiệm, dễ gấp.\n\n📋 COUCHE 150-200gsm (Dày vừa, đàn hồi tốt):\n• Dùng cho: Tờ rơi cao cấp, ruột catalogue, flyer để showroom.\n• Đặc điểm: Cầm chắc tay, không mềm oặt.\n\n📒 COUCHE 250-350gsm (Dày cứng như bìa):\n• Dùng cho: Namecard, bìa catalogue, hộp giấy, postcard.\n• Đặc điểm: Đứng form, ép kim/dập nổi được.\n\n👉 Phát tay → 100-150gsm. Để bàn → 200gsm. Namecard/hộp → 300gsm.\nSản phẩm của mình dùng cho mục đích gì ạ? 📏", category: "kỹ thuật", autoReply: true },
];

async function seed() {
    console.log('Logging in...');
    const token = await login();
    if (!token) { console.error('Login failed!'); return; }
    const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    const existing = await fetch(`${API}/canned-responses`, { headers: h });
    const existingData = await existing.json();
    const existingTitles = new Set(Array.isArray(existingData) ? existingData.map(e => e.title) : []);
    console.log('Existing:', existingTitles.size, 'items');

    let created = 0, skipped = 0;
    for (const qa of QA) {
        if (existingTitles.has(qa.title)) { skipped++; continue; }
        try {
            const res = await fetch(`${API}/canned-responses`, {
                method: 'POST', headers: h,
                body: JSON.stringify({ ...qa, isGlobal: true, shortcut: '/' }),
            });
            if (res.ok) { console.log('OK', qa.title); created++; }
            else { console.error('FAIL', qa.title); }
        } catch (err) { console.error('ERR', qa.title); }
    }
    console.log('\nDone! Created:', created, '| Skipped:', skipped, '| Total now:', existingTitles.size + created);
    process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
