/**
 * Máy trạng thái chuyển Khung_Nhìn cho Bố_Cục_Hẹp (single-column).
 * Thuần, không phụ thuộc React → test dễ.
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4_
 */
export type NarrowView = 'list' | 'chat' | 'info';

export type NarrowViewEvent =
    | 'select'        // chọn một hội thoại
    | 'back'          // quay lại danh sách
    | 'openInfo'      // mở khung thông tin
    | 'closeInfo'     // đóng khung thông tin (về chat)
    | 'clearSelected'; // hội thoại đang chọn bị bỏ chọn/xoá

export function nextNarrowView(current: NarrowView, event: NarrowViewEvent): NarrowView {
    switch (event) {
        case 'select':
            return 'chat';
        case 'back':
            return 'list';
        case 'openInfo':
            // Chỉ mở info khi đang xem một hội thoại.
            return current === 'chat' ? 'info' : current;
        case 'closeInfo':
            return current === 'info' ? 'chat' : current;
        case 'clearSelected':
            return 'list';
        default:
            return current;
    }
}
