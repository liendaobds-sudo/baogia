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
    Intent.DAT_HANG, Intent.PHAN_NAN, Intent.CHAO_HOI, Intent.CAM_ON,
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
