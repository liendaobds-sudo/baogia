/**
 * Bộ_Định_Dạng_Tiền_Tệ dùng chung cho toàn App_BaoGia.
 *
 * Định dạng một giá trị tiền tệ VND theo quy ước thống nhất:
 * - Làm tròn về số nguyên đồng (`Math.round`).
 * - Nhóm hàng nghìn theo locale `'vi-VN'` (`toLocaleString`).
 * - Kết thúc bằng đúng một ký hiệu tiền tệ duy nhất `' ₫'`.
 * - Input không hữu hạn (`NaN`, `±Infinity`) được coi là `0`.
 *
 * Hàm thuần & xác định (deterministic): cùng input luôn cho cùng output,
 * không phụ thuộc trạng thái ngoài, không I/O. Gỡ mọi ký tự không phải chữ số
 * rồi parse lại sẽ bằng `Math.round(amount)`.
 *
 * _Requirements: 7.1, 7.2_
 */
export function formatVND(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  return `${rounded.toLocaleString('vi-VN')} ₫`;
}
