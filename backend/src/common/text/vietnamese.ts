/**
 * Chuẩn hoá văn bản tiếng Việt dùng chung cho toàn bộ đường ống AI/KB.
 *
 * Lý do tồn tại (audit 2026-08-29): trước đây chỉ `quote/extractors/product-detector.ts` có
 * `removeAccents` cục bộ. Mọi tầng còn lại (tìm KB, suy luận ngữ cảnh, khớp FAQ/edge-case, mở
 * rộng đồng nghĩa, hard-check ràng buộc in) đều so khớp chuỗi CÓ DẤU ⇒ khách gõ không dấu
 * ("khong can mang", "namecard 300gsm ko can") tạo ra 0 tín hiệu. Đây là cách gõ rất phổ biến
 * trên Zalo/Facebook, nên coi như mất trắng một phần lớn lưu lượng thật.
 *
 * Quy ước:
 *  - `removeAccents`: chỉ bỏ dấu, KHÔNG hạ chữ thường (dùng khi cần giữ nguyên hoa/thường).
 *  - `normalizeVi`: dạng chuẩn để SO KHỚP — hạ chữ thường + bỏ dấu + gộp khoảng trắng.
 *  - `expandAbbreviations`: bung viết tắt chat phổ biến TRƯỚC khi so khớp.
 *  - `matchesAnyTerm`: so khớp một danh sách từ khoá theo cả bản có dấu và bản không dấu.
 */

/** Bỏ dấu tiếng Việt, giữ nguyên hoa/thường. */
export function removeAccents(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

/**
 * Dạng chuẩn để so khớp: hạ chữ thường, bỏ dấu, gộp mọi khoảng trắng về 1 space.
 * Dùng cho MỌI phép `includes()` trên văn bản khách nhập.
 */
export function normalizeVi(str: string): string {
    return removeAccents(String(str ?? '').toLowerCase()).replace(/\s+/g, ' ').trim();
}

/**
 * Viết tắt/biến thể chat phổ biến của khách in ấn.
 *
 * Khoá đã ở dạng KHÔNG DẤU vì được áp sau `normalizeVi`. Giá trị cũng không dấu để phép
 * `includes()` xuôi chiều với các từ khoá đã chuẩn hoá.
 */
const ABBREVIATION_MAP: Record<string, string> = {
    // Phủ định — nhóm gây sai nghiêm trọng nhất khi bị bỏ qua
    ko: 'khong',
    k0: 'khong',
    khg: 'khong',
    // Sản phẩm
    nc: 'namecard',
    ctlg: 'catalogue',
    cata: 'catalogue',
    cv: 'card visit',
    // Thuộc tính
    sl: 'so luong',
    kt: 'kich thuoc',
    dl: 'dinh luong',
    // Đơn vị / quy cách
    '2m': '2 mat',
    '1m': '1 mat',
};

/**
 * Viết tắt bị LOẠI có chủ đích vì đa nghĩa, bung ra sẽ tạo tín hiệu sai:
 *  - `cm`  → centimet (đơn vị) vs "cán mờ"
 *  - `cb`  → "cán bóng" vs "cơ bản"
 *  - `kg`  → kilogram vs "không"
 *  - `bc`  → báo cáo vs brochure
 *  - `hong`/`hem` → phủ định vùng miền, nhưng "hồng" là màu ⇒ bỏ dấu sẽ trùng.
 * Giữ danh sách này tường minh để lần sau không ai vô tình thêm lại.
 */
const AMBIGUOUS_ABBR = new Set(['bc', 'cm', 'cb', 'kg', 'hong', 'hem']);

/**
 * Bung viết tắt trên văn bản ĐÃ chuẩn hoá (`normalizeVi`).
 *
 * Trả về chuỗi gồm cả bản gốc và bản đã bung, nối bằng space — để `includes()` bắt được cả
 * hai cách viết mà không phá vị trí ký tự của bất kỳ bên nào.
 */
export function expandAbbreviations(normalized: string): string {
    const tokens = normalized.split(' ');
    const extras: string[] = [];
    for (const token of tokens) {
        if (AMBIGUOUS_ABBR.has(token)) continue;
        const full = ABBREVIATION_MAP[token];
        if (full) extras.push(full);
    }
    return extras.length > 0 ? `${normalized} ${extras.join(' ')}` : normalized;
}

/**
 * Dạng dùng để so khớp cuối cùng: chuẩn hoá + bung viết tắt.
 * Đây là hàm nên gọi ở mọi call-site so khớp từ khoá với tin nhắn khách.
 */
export function toMatchText(str: string): string {
    return expandAbbreviations(normalizeVi(str));
}

/**
 * So khớp một danh sách từ khoá với văn bản, chấp nhận cả có dấu và không dấu.
 *
 * @param haystack  Văn bản gốc của khách (chưa cần chuẩn hoá).
 * @param terms     Danh sách từ khoá (có dấu hoặc không đều được).
 */
export function matchesAnyTerm(haystack: string, terms: readonly string[]): boolean {
    if (!haystack || !terms || terms.length === 0) return false;
    const lower = haystack.toLowerCase();
    const match = toMatchText(haystack);
    for (const term of terms) {
        if (!term) continue;
        if (lower.includes(term.toLowerCase())) return true;
        if (match.includes(normalizeVi(term))) return true;
    }
    return false;
}

/**
 * Tách token để tìm kiếm: chuẩn hoá, bung viết tắt, bỏ dấu câu, loại token 1 ký tự.
 * Trả về CẶP token (bản có dấu, bản không dấu) để tầng tìm kiếm tính IDF trên bản không dấu
 * mà vẫn giữ được token gốc khi cần log/giải thích.
 */
export function tokenizeForSearch(query: string): { raw: string[]; normalized: string[] } {
    const raw = String(query ?? '')
        .toLowerCase()
        .split(/[\s,;.!?()[\]"'“”/\\|+*]+/)
        .filter((w) => w.length > 1);
    const normalized = toMatchText(String(query ?? ''))
        .split(/[\s,;.!?()[\]"'“”/\\|+*]+/)
        .filter((w) => w.length > 1);
    return { raw, normalized: [...new Set(normalized)] };
}
