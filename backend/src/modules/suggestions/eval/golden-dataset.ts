/**
 * Golden Dataset — bo cau hoi vang tieng Viet nganh in (CSKH), kieu khach Zalo that.
 *
 * Dung lam "oracle" cho eval retrieval (RAG) va groundedness.
 * - relevantDocTitles: tieu de tai lieu KB DUNG ra phai duoc truy hoi.
 * - mustContain: tu/cum BAT BUOC xuat hien trong cac chunk tra ve (groundedness).
 * - intent: nhan y dinh ky vong.
 *
 * Tai lieu KB hien co (title = ten file khong duoi):
 *   bang-gia-tham-khao, cau-hoi-thuong-gap, chat-lieu-in-an, gia-cong-sau-in,
 *   quy-cach-ky-thuat, quy-tac-rang-buoc-nganh-in, san-pham-in-an,
 *   so-sanh-chat-lieu, thoi-gian-giao-hang, faq-khach-hang.
 *
 * Cau hoi co tinh "doi thuong": viet tat, thieu dau, sai chinh ta nhe — giong Zalo that.
 */

export interface GoldenCase {
    id: string;
    question: string;
    relevantDocTitles: string[];
    mustContain: string[];
    intent: string;
}

export const GOLDEN_DATASET: GoldenCase[] = [
    // ── Hỏi giá ──
    { id: 'g01', question: 'In card visit 2 mặt cán mờ giá bao nhiêu?', relevantDocTitles: ['bang-gia-tham-khao', 'san-pham-in-an'], mustContain: ['card', 'cán'], intent: 'hỏi_giá' },
    { id: 'g09', question: 'In tem nhãn decal số lượng ít có được không, giá thế nào?', relevantDocTitles: ['bang-gia-tham-khao', 'san-pham-in-an'], mustContain: ['decal'], intent: 'hỏi_giá' },
    { id: 'g11', question: 'gia in to roi a5 1000 to bao nhieu', relevantDocTitles: ['bang-gia-tham-khao'], mustContain: ['rơi'], intent: 'hỏi_giá' },
    { id: 'g12', question: 'in brochure gập 3 báo giá giúp mình', relevantDocTitles: ['bang-gia-tham-khao', 'san-pham-in-an'], mustContain: ['brochure'], intent: 'hỏi_giá' },
    { id: 'g13', question: 'in hộp giấy số lượng ít giá sao shop', relevantDocTitles: ['bang-gia-tham-khao', 'san-pham-in-an'], mustContain: ['hộp'], intent: 'hỏi_giá' },
    { id: 'g14', question: 'in standee 60x160 nhiêu tiền', relevantDocTitles: ['bang-gia-tham-khao', 'san-pham-in-an'], mustContain: ['standee'], intent: 'hỏi_giá' },
    { id: 'g15', question: 'in catalogue 20 trang 100 cuốn giá', relevantDocTitles: ['bang-gia-tham-khao'], mustContain: ['catalogue'], intent: 'hỏi_giá' },

    // ── Hỏi chất liệu ──
    { id: 'g02', question: 'Giấy Couche với Bristol khác nhau thế nào?', relevantDocTitles: ['so-sanh-chat-lieu', 'chat-lieu-in-an'], mustContain: ['couche', 'bristol'], intent: 'hỏi_vật_tư' },
    { id: 'g08', question: 'In standee, banner khổ lớn dùng chất liệu gì?', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['bạt'], intent: 'hỏi_vật_tư' },
    { id: 'g16', question: 'couche 150 voi 200 loai nao dep hon', relevantDocTitles: ['so-sanh-chat-lieu', 'chat-lieu-in-an'], mustContain: ['couche'], intent: 'hỏi_vật_tư' },
    { id: 'g17', question: 'decal sữa với decal trong khác gì', relevantDocTitles: ['chat-lieu-in-an', 'so-sanh-chat-lieu'], mustContain: ['decal'], intent: 'hỏi_vật_tư' },
    { id: 'g18', question: 'in túi giấy nên dùng giấy gì cho cứng', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['giấy'], intent: 'hỏi_vật_tư' },
    { id: 'g19', question: 'giấy ivory là giấy gì', relevantDocTitles: ['chat-lieu-in-an'], mustContain: ['ivory'], intent: 'hỏi_vật_tư' },
    { id: 'g20', question: 'in name card giấy mỹ thuật được không', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['card'], intent: 'hỏi_vật_tư' },

    // ── Hỏi kỹ thuật ──
    { id: 'g03', question: 'Định lượng giấy gsm là gì, in tờ rơi nên chọn loại nào?', relevantDocTitles: ['chat-lieu-in-an', 'quy-cach-ky-thuat'], mustContain: ['gsm'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g06', question: 'In offset khác in kỹ thuật số (digital) chỗ nào, khi nào nên dùng?', relevantDocTitles: ['quy-cach-ky-thuat', 'san-pham-in-an'], mustContain: ['offset'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g07', question: 'Số trang ruột sách phải là bội số của mấy khi đóng ghim giữa?', relevantDocTitles: ['quy-tac-rang-buoc-nganh-in', 'quy-cach-ky-thuat'], mustContain: ['4'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g21', question: 'file thiet ke gui in can dinh dang gi', relevantDocTitles: ['quy-cach-ky-thuat'], mustContain: ['file'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g22', question: 'in 2 mặt khác in 1 mặt thế nào', relevantDocTitles: ['quy-cach-ky-thuat', 'san-pham-in-an'], mustContain: ['mặt'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g23', question: 'khổ giấy a3 a4 sra3 là sao', relevantDocTitles: ['quy-cach-ky-thuat'], mustContain: ['khổ'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g24', question: 'in offset số lượng tối thiểu bao nhiêu', relevantDocTitles: ['quy-tac-rang-buoc-nganh-in', 'quy-cach-ky-thuat'], mustContain: ['offset'], intent: 'hỏi_kỹ_thuật' },
    { id: 'g25', question: 'cần chừa xén tràn lề bao nhiêu mm', relevantDocTitles: ['quy-cach-ky-thuat', 'quy-tac-rang-buoc-nganh-in'], mustContain: ['xén'], intent: 'hỏi_kỹ_thuật' },

    // ── Hỏi gia công ──
    { id: 'g04', question: 'Cán màng bóng và cán mờ khác gì? Có làm tăng giá không?', relevantDocTitles: ['gia-cong-sau-in', 'so-sanh-chat-lieu'], mustContain: ['cán', 'màng'], intent: 'hỏi_gia_công' },
    { id: 'g10', question: 'Đóng cuốn catalogue nên dùng đóng ghim hay keo gáy?', relevantDocTitles: ['gia-cong-sau-in', 'quy-cach-ky-thuat'], mustContain: ['ghim', 'keo'], intent: 'hỏi_gia_công' },
    { id: 'g26', question: 'ép kim là gì có đẹp không', relevantDocTitles: ['gia-cong-sau-in'], mustContain: ['ép'], intent: 'hỏi_gia_công' },
    { id: 'g27', question: 'bế nổi với cán mờ cái nào sang hơn', relevantDocTitles: ['gia-cong-sau-in', 'so-sanh-chat-lieu'], mustContain: ['bế'], intent: 'hỏi_gia_công' },
    { id: 'g28', question: 'catalogue nhiều trang nên đóng lò xo hay keo', relevantDocTitles: ['gia-cong-sau-in'], mustContain: ['keo'], intent: 'hỏi_gia_công' },
    { id: 'g29', question: 'in xong có cán mờ liền được ko', relevantDocTitles: ['gia-cong-sau-in'], mustContain: ['cán'], intent: 'hỏi_gia_công' },
    { id: 'g30', question: 'gấp tờ rơi làm mấy kiểu', relevantDocTitles: ['gia-cong-sau-in', 'san-pham-in-an'], mustContain: ['gấp'], intent: 'hỏi_gia_công' },

    // ── Hỏi thời gian ──
    { id: 'g05', question: 'Đặt in brochure thì mấy ngày lấy được hàng?', relevantDocTitles: ['thoi-gian-giao-hang'], mustContain: ['ngày'], intent: 'hỏi_giao_hàng' },
    { id: 'g31', question: 'in name card lay lien trong ngay duoc ko', relevantDocTitles: ['thoi-gian-giao-hang', 'san-pham-in-an'], mustContain: ['card'], intent: 'hỏi_giao_hàng' },
    { id: 'g32', question: 'in offset số lượng lớn mấy ngày xong', relevantDocTitles: ['thoi-gian-giao-hang'], mustContain: ['ngày'], intent: 'hỏi_giao_hàng' },
    { id: 'g33', question: 'có ship hàng tận nơi không bao lâu nhận', relevantDocTitles: ['thoi-gian-giao-hang', 'faq-khach-hang'], mustContain: ['ngày'], intent: 'hỏi_giao_hàng' },

    // ── Sản phẩm / FAQ chung ──
    { id: 'g34', question: 'shop in được những sản phẩm gì', relevantDocTitles: ['san-pham-in-an'], mustContain: ['in'], intent: 'hỏi_sản_phẩm' },
    { id: 'g35', question: 'có nhận thiết kế không hay chỉ in', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['thiết kế'], intent: 'tư_vấn' },
    { id: 'g36', question: 'đặt hàng thanh toán kiểu gì', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['thanh toán'], intent: 'hỏi_chính_sách' },
    { id: 'g37', question: 'in sai có được in lại không', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['in'], intent: 'hỏi_chính_sách' },
    { id: 'g38', question: 'in tem decal cuộn dán ly trà sữa được ko', relevantDocTitles: ['san-pham-in-an', 'chat-lieu-in-an'], mustContain: ['decal'], intent: 'hỏi_sản_phẩm' },
];

/* ────────────────────────────────────────────────────────────────────────────
 * NEGATIVE DATASET — bo sung 2026-08-29 (audit do thong minh chatbot)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Van de duoc phat hien: GOLDEN_DATASET chi co case POSITIVE ("khach hoi X, KB phai tra ve Y").
 * Khong co MOT case nao do nhung loi dat gia nhat cua mot bot ban hang:
 *   - bao gia khi CHUA du thong tin (bia so tien);
 *   - hoi lai thong tin khach DA noi (hoi thua);
 *   - nhan yeu cau BAT KHA THI ve ky thuat (decal 2 mat, banner can mang);
 *   - hua tien do khong lam duoc;
 *   - tu van ngoai chu de;
 *   - khong chuyen nhan vien khi khach buc xuc.
 *
 * Dataset nay mo ta KY VONG PHAI-KHONG (`mustNotContain`) va PHAI-HOI (`mustAsk`), cham duoc
 * OFFLINE bang cac ham thuan (`checkPrintingConstraints`, `validateAiResult`) — xem
 * `negative-dataset.spec.ts`. Khong can goi provider co phi.
 */

export interface NegativeCase {
    id: string;
    question: string;
    /** Nhan intent canonical ky vong. */
    intent: string;
    /** Cac slot BAT BUOC phai hoi lai (dung cho eval online + doi chieu missing_info). */
    mustAsk: string[];
    /** Cum tu TUYET DOI khong duoc xuat hien trong cau tra loi (chu thuong, khong dau cung tinh). */
    mustNotContain: string[];
    /**
     * `true` neu day la yeu cau BAT KHA THI ve ky thuat → hard check
     * `checkPrintingConstraints` PHAI sinh canh bao. Duoc test offline.
     */
    expectConstraintWarning?: boolean;
    /** `true` neu phai chuyen nhan vien (khong de bot tu doi dap). */
    expectEscalate?: boolean;
    /**
     * Khoa edge-case trong `faq-edge-cases.json` PHAI khop (vd `offTopic`).
     * Do offline bang `ContextInferenceService.matchEdgeCase` — khong can DB, khong can provider.
     */
    expectEdgeCase?: string;
    /** `true` neu tuyet doi khong duoc neu bat ky so tien nao (chua co bao gia hop le). */
    forbidPrice?: boolean;
    /** Ly do nghiep vu — de nguoi doc hieu vi sao case nay ton tai. */
    reason: string;
}

export const NEGATIVE_DATASET: NegativeCase[] = [
    // ── Thiếu thông tin ⇒ phải hỏi, KHÔNG được báo giá ──
    {
        id: 'n01', question: 'in cho mình 500 cái nhé', intent: 'hỏi_giá',
        mustAsk: ['product'], mustNotContain: ['đồng', 'vnd'], forbidPrice: true,
        reason: 'Chưa biết in SẢN PHẨM gì. Bot phải hỏi sản phẩm, không được đoán rồi báo giá.',
    },
    {
        id: 'n02', question: 'báo giá hộp giấy giúp mình', intent: 'hỏi_giá',
        mustAsk: ['size', 'quantity'], mustNotContain: ['đồng', 'vnd'], forbidPrice: true,
        reason: 'Hộp không có dài×rộng×cao thì không dựng được khuôn bế ⇒ không thể có giá.',
    },
    {
        id: 'n03', question: 'giá rẻ nhất của shop là bao nhiêu', intent: 'hỏi_giá',
        mustAsk: ['product', 'quantity'], mustNotContain: ['đồng', 'vnd'], forbidPrice: true,
        reason: 'Không có sản phẩm + số lượng thì "giá rẻ nhất" là câu hỏi không có đáp số.',
    },
    {
        id: 'n04', question: 'cho em xin bảng giá tất cả sản phẩm', intent: 'hỏi_giá',
        mustAsk: ['product'], mustNotContain: ['đồng', 'vnd'], forbidPrice: true,
        reason: 'Bảng giá trong tài liệu nội bộ là THAM KHẢO, không phải nguồn báo giá. '
            + 'Bot đọc số từ KB ra cho khách là lỗi nghiêm trọng nhất của đường giá.',
    },

    // ── Bất khả thi về kỹ thuật ⇒ hard check phải bắt ──
    {
        id: 'n05', question: 'in decal 2 mặt cho mình', intent: 'hỏi_kỹ_thuật',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Decal mặt sau là keo dán ⇒ không in 2 mặt được. Nhận đơn kiểu này là làm sai hàng.',
    },
    {
        id: 'n06', question: 'in banner hiflex cán mờ 2 mặt', intent: 'hỏi_gia_công',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Hiflex không cán màng và chỉ in 1 mặt.',
    },
    {
        id: 'n07', question: 'in namecard giấy couche 150gsm', intent: 'hỏi_vật_tư',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Danh thiếp 150gsm quá mềm. Phải cảnh báo và đề xuất 300gsm.',
    },
    {
        id: 'n08', question: 'in catalogue 10 trang đóng ghim giữa', intent: 'hỏi_gia_công',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Đóng ghim cần số trang chia hết cho 4. 10 trang là không làm được.',
    },
    {
        id: 'n09', question: 'in phiếu bảo hành cán mờ 2 mặt để khách viết tay vào', intent: 'hỏi_gia_công',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Bề mặt cán không bám mực bút bi ⇒ phiếu điền tay không được cán mặt cần viết.',
    },
    {
        id: 'n10', question: 'in ảnh sản phẩm full màu trên giấy kraft nâu', intent: 'hỏi_vật_tư',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Kraft làm màu chìm, ảnh full-color sẽ tối và bẩn. Phải cảnh báo trước khi in.',
    },
    {
        id: 'n11', question: 'in standee in 2 mặt luôn nha', intent: 'hỏi_kỹ_thuật',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Standee chỉ in 1 mặt.',
    },
    {
        id: 'n12', question: 'lam poster can bong ma in 2 mat', intent: 'hỏi_kỹ_thuật',
        mustAsk: [], mustNotContain: [], expectConstraintWarning: true,
        reason: 'Case KHÔNG DẤU có chủ đích: trước audit 2026-08-29 mọi hard check chạy trên chuỗi '
            + 'có dấu nên câu này không kích hoạt cảnh báo nào.',
    },

    // ── Không được hứa / không được tự quyết ──
    {
        id: 'n13', question: 'in hộp cứng bồi 1000 cái xong trong ngày mai nhé', intent: 'hỏi_giao_hàng',
        mustAsk: [], mustNotContain: ['chắc chắn kịp', 'cam kết xong'],
        reason: 'Hộp cứng có công bồi thủ công, không thể xong trong 1 ngày. Bot không được hứa tiến độ.',
    },
    {
        id: 'n14', question: 'giảm giá 30% thì mình chốt luôn', intent: 'thương_lượng_giá',
        mustAsk: [], mustNotContain: ['đồng ý giảm 30', 'ok giảm 30'], forbidPrice: true,
        reason: 'Chiết khấu là quyết định của người bán, bot không được tự cam kết mức giảm.',
    },
    {
        id: 'n15', question: 'shop tính hoá đơn VAT mấy phần trăm', intent: 'hỏi_chính_sách',
        mustAsk: [], mustNotContain: ['8%'],
        reason: 'VAT đến từ báo giá và chỉ áp một lần. Con số 8% cũ trong tài liệu KB đã được gỡ '
            + '2026-08-29; bot nêu lại là lệch với số tiền hệ thống tính.',
    },

    // ── Ngoài chủ đề / cần chuyển người ──
    {
        id: 'n16', question: 'hôm nay thời tiết Hà Nội thế nào bạn', intent: 'chung',
        mustAsk: [], mustNotContain: ['nhiệt độ', 'trời nắng', 'trời mưa'], expectEdgeCase: 'offTopic',
        reason: 'Ngoài chủ đề in ấn. Bot phải lịch sự kéo về nghiệp vụ, không trả lời lan sang việc khác.',
    },
    {
        id: 'n17', question: 'làm ăn kiểu gì mà tệ thế, trả tiền lại đây', intent: 'khiếu_nại_chất_lượng',
        mustAsk: [], mustNotContain: [], expectEscalate: true,
        reason: 'Khách bức xúc + yêu cầu hoàn tiền ⇒ chuyển nhân viên, tuyệt đối không để bot đối đáp.',
    },
];
