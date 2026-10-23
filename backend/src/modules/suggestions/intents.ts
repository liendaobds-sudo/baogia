/**
 * NGUỒN SỰ THẬT DUY NHẤT cho intent của chatbot.
 *
 * Trước đây intent bị phân mảnh thành 5 "từ điển" rời rạc không đồng bộ:
 *   - menu gợi ý trong prompt (prompt-builder)
 *   - schema JSON (string tự do, không enum → LLM trả token gì cũng lọt)
 *   - INTENT_TAG_MAP (auto-tag)
 *   - AUTO_REPLY_INTENTS (whitelist auto-reply)
 *   - memory-extraction trigger
 * Hệ quả: 2 intent mồ côi (`phản_đối`, `hỏi_đơn_hàng`) bị code ép LLM trả ra
 * nhưng không consumer nào nhận; nhiều token trùng khái niệm (phàn_nàn/khiếu_nại/feedback).
 *
 * File này gom tất cả về một enum canonical. MỌI nơi phải import từ đây.
 */

/** Tập intent canonical — giá trị enum chính là token LLM trả về. */
export enum Intent {
    HOI_GIA = 'hỏi_giá',
    HOI_SAN_PHAM = 'hỏi_sản_phẩm',
    HOI_KY_THUAT = 'hỏi_kỹ_thuật',
    HOI_GIA_CONG = 'hỏi_gia_công',
    HOI_VAT_TU = 'hỏi_vật_tư',
    HOI_GIAO_HANG = 'hỏi_giao_hàng',
    HOI_FILE = 'hỏi_file',
    HOI_DON_HANG = 'hỏi_đơn_hàng',
    DAT_HANG = 'đặt_hàng',
    PHAN_NAN = 'phàn_nàn',
    CHAO_HOI = 'chào_hỏi',
    CAM_ON = 'cảm_ơn',
    TAM_BIET = 'tạm_biệt',
    XAC_NHAN = 'xác_nhận',
    TU_VAN = 'tư_vấn',
    QA_TEMPLATE = 'q&a_template',
    CHUNG = 'chung',

    // ─── Bổ sung 2026-08-29 (audit độ thông minh) ───
    // Lý do từng intent, kèm bằng chứng đường chạy đã tồn tại nhưng thiếu nhãn:
    /** Khiếu nại CHẤT LƯỢNG in (sai màu, bế lệch, nhoè). Trước đây gộp vào `phàn_nàn` cùng
     *  chuyện mặc cả giá ⇒ routing và SLA như nhau, dù một bên là lỗi sản xuất phải làm lại. */
    KHIEU_NAI_CHAT_LUONG = 'khiếu_nại_chất_lượng',
    /** Khách xin giảm giá / mặc cả. `detectObjections` đã nhận ra ('price') nhưng chỉ dùng trong
     *  prompt, không có nhãn intent nào ⇒ đổ về `phàn_nàn`. */
    THUONG_LUONG_GIA = 'thương_lượng_giá',
    /** Chính sách: thanh toán, VAT/hoá đơn, bảo hành, đổi trả, in lại. `faq-edge-cases.json` có
     *  4 nhãn riêng cho nhóm này nhưng tất cả im lặng đổ về `chung`. */
    HOI_CHINH_SACH = 'hỏi_chính_sách',
    /** Xin xem mẫu / portfolio. `edgeCases.portfolioRequest` đã có nhưng trả `chung`. */
    HOI_MAU = 'hỏi_mẫu',
    /** Hủy hoặc đổi đơn đã đặt. Trước đây không có nhãn nào. */
    HUY_DOI_DON = 'hủy_đổi_đơn',
    /** Hỏi số lượng tối thiểu / đặt ít được không. `faq-edge-cases` có `hỏi_số_lượng`. */
    HOI_SO_LUONG = 'hỏi_số_lượng',
}

/** Danh sách phẳng — dùng ép `enum` vào JSON schema của LLM (chặn token lạ). */
export const ALL_INTENTS: string[] = Object.values(Intent);

/**
 * Menu intent gợi ý trong prompt (đường ống `intent`), khớp TUYỆT ĐỐI với enum
 * để LLM không bị schema reject. Bỏ các token nội bộ không do LLM sinh (q&a_template).
 */
export const PROMPT_INTENT_MENU: string[] = [
    Intent.HOI_GIA, Intent.HOI_SAN_PHAM, Intent.HOI_KY_THUAT, Intent.HOI_GIA_CONG,
    Intent.HOI_VAT_TU, Intent.HOI_GIAO_HANG, Intent.HOI_FILE, Intent.HOI_DON_HANG,
    Intent.HOI_CHINH_SACH, Intent.HOI_SO_LUONG, Intent.HOI_MAU,
    Intent.DAT_HANG, Intent.HUY_DOI_DON,
    Intent.THUONG_LUONG_GIA, Intent.KHIEU_NAI_CHAT_LUONG, Intent.PHAN_NAN,
    Intent.CHAO_HOI, Intent.CAM_ON,
    Intent.TAM_BIET, Intent.XAC_NHAN, Intent.TU_VAN, Intent.CHUNG,
];

/** Intent được phép AUTO-GỬI cho khách (câu xã giao + template Q&A). */
export const AUTO_REPLY_INTENTS: string[] = [
    Intent.CHAO_HOI, Intent.CAM_ON, Intent.TAM_BIET, Intent.XAC_NHAN, Intent.QA_TEMPLATE,
];

/** Intent kích hoạt trích xuất memory (facts khách hàng) khi hội thoại kết thúc. */
export const MEMORY_TRIGGER_INTENTS: string[] = [
    Intent.DAT_HANG, Intent.PHAN_NAN, Intent.TU_VAN,
];

/**
 * Map intent → tag hội thoại. KHÔNG gian tag GIỮ NGUYÊN như bản cũ
 * (báo_giá / giao_hàng / khiếu_nại / tư_vấn / chào_hỏi / chốt_đơn / chờ_file)
 * để không phá dữ liệu tag lịch sử / filter UI.
 */
export const INTENT_TAG_MAP: Record<string, string> = {
    [Intent.HOI_GIA]: 'báo_giá',
    [Intent.HOI_GIAO_HANG]: 'giao_hàng',
    [Intent.PHAN_NAN]: 'khiếu_nại',
    [Intent.HOI_VAT_TU]: 'tư_vấn',
    [Intent.TU_VAN]: 'tư_vấn',
    [Intent.HOI_GIA_CONG]: 'tư_vấn',
    [Intent.CHAO_HOI]: 'chào_hỏi',
    [Intent.CAM_ON]: 'chào_hỏi',
    [Intent.TAM_BIET]: 'chào_hỏi',
    [Intent.XAC_NHAN]: 'chốt_đơn',
    [Intent.DAT_HANG]: 'chốt_đơn',
    [Intent.HOI_FILE]: 'chờ_file',
    [Intent.QA_TEMPLATE]: 'tư_vấn',
    // Intent bổ sung 2026-08-29 — ánh xạ vào KHÔNG GIAN TAG CŨ, không thêm tag mới
    // (giữ nguyên filter UI + dữ liệu tag lịch sử).
    [Intent.KHIEU_NAI_CHAT_LUONG]: 'khiếu_nại',
    [Intent.THUONG_LUONG_GIA]: 'báo_giá',
    [Intent.HOI_CHINH_SACH]: 'tư_vấn',
    [Intent.HOI_MAU]: 'tư_vấn',
    [Intent.HOI_SO_LUONG]: 'tư_vấn',
    [Intent.HUY_DOI_DON]: 'khiếu_nại',
};

/**
 * Các token cũ/biến thể LLM hoặc code từng dùng → quy về canonical.
 * Giữ để dữ liệu lịch sử + đầu ra LLM lệch vẫn map đúng.
 */
const INTENT_ALIASES: Record<string, Intent> = {
    'phản_đối': Intent.PHAN_NAN,
    'khiếu_nại': Intent.PHAN_NAN,
    'feedback': Intent.PHAN_NAN,
    'báo_giá': Intent.HOI_GIA,
    'chốt_đơn': Intent.DAT_HANG,

    // ─── Alias bổ sung 2026-08-29 (audit) ───
    // Ba từ điển intent song song đã được gom về đây. Trước đó mỗi nhãn dưới đây im lặng rơi về
    // `chung` ⇒ mất tag hội thoại, mất quyền auto-reply, và eval không đo được intent.
    //
    // (a) Nhãn dùng trong `eval/golden-dataset.ts` (14/38 case):
    'hỏi_chất_liệu': Intent.HOI_VAT_TU,
    'hỏi_thời_gian': Intent.HOI_GIAO_HANG,
    'hỏi_dịch_vụ': Intent.TU_VAN,
    // (b) Nhãn dùng trong `src/data/knowledge/faq-edge-cases.json`:
    'hỏi_thanh_toán': Intent.HOI_CHINH_SACH,
    'hỏi_bảo_hành': Intent.HOI_CHINH_SACH,
    'hỏi_thiết_kế': Intent.TU_VAN,
    'hỏi_proof': Intent.HOI_KY_THUAT,
    // (c) Biến thể LLM hay sinh cho các intent mới:
    'mặc_cả': Intent.THUONG_LUONG_GIA,
    'xin_giảm_giá': Intent.THUONG_LUONG_GIA,
    'khiếu_nại_chất_lượng_in': Intent.KHIEU_NAI_CHAT_LUONG,
    'hỏi_chính_sách_thanh_toán': Intent.HOI_CHINH_SACH,
    'xin_mẫu': Intent.HOI_MAU,
    'hủy_đơn': Intent.HUY_DOI_DON,
    'đổi_đơn': Intent.HUY_DOI_DON,
    'hỏi_moq': Intent.HOI_SO_LUONG,
};

const CANONICAL_SET = new Set<string>(ALL_INTENTS);

/**
 * Quy mọi giá trị intent thô (LLM trả / dữ liệu cũ) về đúng tập canonical.
 * Không nhận diện được → `chung` (fallback an toàn, giống hành vi cũ).
 */
export function normalizeIntent(raw: unknown): Intent {
    if (typeof raw !== 'string') return Intent.CHUNG;
    const t = raw.trim();
    if (CANONICAL_SET.has(t)) return t as Intent;
    if (INTENT_ALIASES[t]) return INTENT_ALIASES[t];
    return Intent.CHUNG;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Chủ đề hội thoại (topic) ≠ intent canonical
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * "Chủ đề" phát hiện tại runtime bởi `detectObjections` / `isComparison` trong
 * `AiSuggestService`. Đây KHÔNG phải intent canonical: intent là nhãn LLM trả về và được
 * LƯU vào `ai_suggestions.intent` / `conversations.outcomeData.intentChain`, còn topic chỉ
 * là tín hiệu suy ra từ chính câu khách vừa nhắn.
 *
 * Audit 2026-08-29 — vì sao phải tách rõ: ba nhánh học (`buildOutcomeContext`,
 * `buildSimilarConversationContext`, `retrieveMemoryContext`) đều đối chiếu tham số truyền vào
 * với intent CANONICAL đã lưu, nhưng call-site lại truyền token topic (`'objection'`,
 * `'comparison'`, `'price'`…). Không token nào nằm trong enum ⇒ điều kiện `.includes(...)` và
 * `find({ intent })` KHÔNG BAO GIỜ khớp ⇒ few-shot "ký ức chốt sale" và lời khuyên theo intent
 * chết đúng lúc cần nhất (khách phản đối giá / so sánh đối thủ).
 */
export type ConversationTopic =
    | 'objection'
    | 'comparison'
    | 'price'
    | 'competitor'
    | 'time'
    | 'hesitation'
    | 'quality';

/**
 * Ánh xạ topic → tập intent CANONICAL có ý nghĩa tương đương, để tra cứu dữ liệu học.
 *
 * Cơ sở ánh xạ:
 *  - phản đối / do dự / đối thủ / mặc cả giá → hội thoại đó thường được LLM gắn `phàn_nàn`
 *    hoặc `hỏi_giá` (khách nêu giá để mặc cả).
 *  - so sánh vật tư/phương án → `tư_vấn`, `hỏi_vật_tư`, `hỏi_kỹ_thuật`.
 *  - hỏi thời gian gấp → `hỏi_giao_hàng`.
 *  - lo chất lượng → `phàn_nàn`, `hỏi_kỹ_thuật`.
 */
const TOPIC_TO_INTENTS: Record<ConversationTopic, Intent[]> = {
    objection: [Intent.PHAN_NAN, Intent.THUONG_LUONG_GIA, Intent.HOI_GIA],
    price: [Intent.THUONG_LUONG_GIA, Intent.HOI_GIA, Intent.PHAN_NAN],
    competitor: [Intent.THUONG_LUONG_GIA, Intent.PHAN_NAN, Intent.TU_VAN],
    hesitation: [Intent.PHAN_NAN, Intent.TU_VAN],
    comparison: [Intent.TU_VAN, Intent.HOI_VAT_TU, Intent.HOI_KY_THUAT],
    time: [Intent.HOI_GIAO_HANG],
    quality: [Intent.KHIEU_NAI_CHAT_LUONG, Intent.PHAN_NAN, Intent.HOI_KY_THUAT],
};

const TOPIC_SET = new Set<string>(Object.keys(TOPIC_TO_INTENTS));

/** `true` nếu chuỗi là một topic runtime (không phải intent canonical). */
export function isConversationTopic(raw: unknown): raw is ConversationTopic {
    return typeof raw === 'string' && TOPIC_SET.has(raw);
}

/**
 * Quy một giá trị "chủ đề hoặc intent" về danh sách intent CANONICAL để tra cứu dữ liệu học.
 *
 *  - topic runtime  → tập intent tương đương (bảng trên).
 *  - intent canonical (hoặc alias) → chính nó.
 *  - rỗng/không nhận diện → `[]` (caller hiểu là "không lọc theo intent").
 *
 * Trả `[]` thay vì `['chung']` là chủ đích: `chung` là một intent thật và lọc theo nó sẽ thu hẹp
 * sai; caller nên bỏ lọc để rơi về fallback toàn cục.
 */
export function resolveLearningIntents(raw: unknown): Intent[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const t = raw.trim();
    if (isConversationTopic(t)) return [...TOPIC_TO_INTENTS[t]];
    if (CANONICAL_SET.has(t)) return [t as Intent];
    if (INTENT_ALIASES[t]) return [INTENT_ALIASES[t]];
    return [];
}
