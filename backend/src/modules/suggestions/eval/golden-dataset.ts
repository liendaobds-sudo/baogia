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
    { id: 'g02', question: 'Giấy Couche với Bristol khác nhau thế nào?', relevantDocTitles: ['so-sanh-chat-lieu', 'chat-lieu-in-an'], mustContain: ['couche', 'bristol'], intent: 'hỏi_chất_liệu' },
    { id: 'g08', question: 'In standee, banner khổ lớn dùng chất liệu gì?', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['bạt'], intent: 'hỏi_chất_liệu' },
    { id: 'g16', question: 'couche 150 voi 200 loai nao dep hon', relevantDocTitles: ['so-sanh-chat-lieu', 'chat-lieu-in-an'], mustContain: ['couche'], intent: 'hỏi_chất_liệu' },
    { id: 'g17', question: 'decal sữa với decal trong khác gì', relevantDocTitles: ['chat-lieu-in-an', 'so-sanh-chat-lieu'], mustContain: ['decal'], intent: 'hỏi_chất_liệu' },
    { id: 'g18', question: 'in túi giấy nên dùng giấy gì cho cứng', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['giấy'], intent: 'hỏi_chất_liệu' },
    { id: 'g19', question: 'giấy ivory là giấy gì', relevantDocTitles: ['chat-lieu-in-an'], mustContain: ['ivory'], intent: 'hỏi_chất_liệu' },
    { id: 'g20', question: 'in name card giấy mỹ thuật được không', relevantDocTitles: ['chat-lieu-in-an', 'san-pham-in-an'], mustContain: ['card'], intent: 'hỏi_chất_liệu' },

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
    { id: 'g05', question: 'Đặt in brochure thì mấy ngày lấy được hàng?', relevantDocTitles: ['thoi-gian-giao-hang'], mustContain: ['ngày'], intent: 'hỏi_thời_gian' },
    { id: 'g31', question: 'in name card lay lien trong ngay duoc ko', relevantDocTitles: ['thoi-gian-giao-hang', 'san-pham-in-an'], mustContain: ['card'], intent: 'hỏi_thời_gian' },
    { id: 'g32', question: 'in offset số lượng lớn mấy ngày xong', relevantDocTitles: ['thoi-gian-giao-hang'], mustContain: ['ngày'], intent: 'hỏi_thời_gian' },
    { id: 'g33', question: 'có ship hàng tận nơi không bao lâu nhận', relevantDocTitles: ['thoi-gian-giao-hang', 'faq-khach-hang'], mustContain: ['ngày'], intent: 'hỏi_thời_gian' },

    // ── Sản phẩm / FAQ chung ──
    { id: 'g34', question: 'shop in được những sản phẩm gì', relevantDocTitles: ['san-pham-in-an'], mustContain: ['in'], intent: 'hỏi_sản_phẩm' },
    { id: 'g35', question: 'có nhận thiết kế không hay chỉ in', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['thiết kế'], intent: 'hỏi_dịch_vụ' },
    { id: 'g36', question: 'đặt hàng thanh toán kiểu gì', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['thanh toán'], intent: 'hỏi_chính_sách' },
    { id: 'g37', question: 'in sai có được in lại không', relevantDocTitles: ['faq-khach-hang', 'cau-hoi-thuong-gap'], mustContain: ['in'], intent: 'hỏi_chính_sách' },
    { id: 'g38', question: 'in tem decal cuộn dán ly trà sữa được ko', relevantDocTitles: ['san-pham-in-an', 'chat-lieu-in-an'], mustContain: ['decal'], intent: 'hỏi_sản_phẩm' },
];
