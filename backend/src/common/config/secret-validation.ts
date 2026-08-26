/**
 * secret-validation — kiểm tra CHẤT LƯỢNG secret lúc khởi động (audit 2026-07-25).
 *
 * BỐI CẢNH: `jwt.strategy.ts` và `auth.service.requireRefreshSecret()` đã fail-fast khi secret
 * KHÔNG TỒN TẠI, nhưng không kiểm nội dung. Thực tế `.env` đang nằm trên đường nạp config
 * (`app.module.ts` envFilePath) chứa `JWT_SECRET` dạng placeholder ("your…"). Nếu file cấu hình
 * dev này đi lên production thì app vẫn khởi động bình thường với secret ai cũng đoán được
 * ⇒ giả mạo token tuỳ ý.
 *
 * QUY TẮC:
 *  - Mọi môi trường: thiếu secret ⇒ ném lỗi (giữ hành vi fail-fast cũ).
 *  - CHỈ ở production: thêm 2 điều kiện — độ dài tối thiểu và không khớp mẫu placeholder.
 *    Dev/test KHÔNG bị siết để không phá môi trường làm việc và test hiện có.
 *
 * Hàm thuần (nhận `isProduction` qua tham số, không tự đọc process.env) để test được.
 */

/** Độ dài tối thiểu cho secret HS256 ở production. */
export const MIN_SECRET_LENGTH = 32;

/**
 * Mẫu secret mặc định/ví dụ thường gặp trong file `.env.example` và hướng dẫn.
 * So khớp KHÔNG phân biệt hoa/thường, theo chuỗi con.
 */
const PLACEHOLDER_PATTERNS = [
    'your', 'change_me', 'changeme', 'change-me', 'example', 'placeholder',
    'secret_here', 'secrethere', 'todo', 'xxx', 'replace_me', 'replaceme',
    'dev_secret', 'test_secret', 'insecure', 'default',
];

export function looksLikePlaceholderSecret(value: string): boolean {
    const v = value.toLowerCase();
    return PLACEHOLDER_PATTERNS.some((p) => v.includes(p));
}

/**
 * Xác thực một secret bắt buộc; trả về chính secret đó khi hợp lệ.
 *
 * @param name tên biến môi trường (dùng trong thông báo lỗi — KHÔNG log giá trị)
 * @param value giá trị đọc từ config
 * @param isProduction có đang chạy production hay không
 * @throws Error khi thiếu, hoặc (production) quá ngắn / là placeholder
 */
export function requireSecret(name: string, value: string | undefined | null, isProduction: boolean): string {
    if (!value) {
        throw new Error(
            `${name} must be set in environment variables. Cannot start with insecure default.`,
        );
    }

    if (!isProduction) return value;

    if (value.length < MIN_SECRET_LENGTH) {
        throw new Error(
            `${name} quá ngắn cho production (${value.length} < ${MIN_SECRET_LENGTH} ký tự). ` +
            `Sinh secret mạnh, ví dụ: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
        );
    }

    if (looksLikePlaceholderSecret(value)) {
        throw new Error(
            `${name} trông giống secret mẫu/placeholder — TỪ CHỐI khởi động ở production. ` +
            `Đặt secret thật (đừng dùng giá trị trong .env.example).`,
        );
    }

    return value;
}
