import { countRectInRect, pressPerParent, conPerParentSheet } from '../sheet-imposition';

/**
 * GĐ B — engine tự tính số con từ HÌNH HỌC (thay số tĩnh so_con_* nhập tay).
 *
 * Ba mức con, ngữ nghĩa khác nhau (KHÔNG lẫn):
 *  - con/khổ xả  : dàn con (khuôn) lên bài in — CÓ nhíp/lề (tờ vào máy in). → luotIn.
 *  - khổ xả/tờ nhập : cắt tờ nhập ra bài in — KHÔNG nhíp (xả chỉ là cắt). Khổ xả ≡ khổ nhập → 1.
 *  - con/tờ nhập : = con/khổ xả × khổ xả/tờ nhập. → đếm giấy (giá = giá tờ nhập × số tờ nhập).
 */
describe('countRectInRect — đếm hình chữ nhật trong khổ (2 hướng, không nhíp)', () => {
    it('lưới thẳng: 200×100 trong 640×420 → 3×4=12 (hướng 0°) hoặc xoay', () => {
        // 0°: floor(640/200)=3, floor(420/100)=4 → 12. 90°: floor(640/100)=6, floor(420/200)=2 → 12. Max=12.
        expect(countRectInRect(200, 100, 640, 420)).toBe(12);
    });

    it('xoay cho nhiều hơn: chọn hướng tối ưu', () => {
        // item 300×100 trong 700×400. 0°: floor(700/300)=2 × floor(400/100)=4 = 8.
        // 90° (100×300): floor(700/100)=7 × floor(400/300)=1 = 7. Max = 8.
        expect(countRectInRect(300, 100, 700, 400)).toBe(8);
    });

    it('item lớn hơn khổ ở cả hai hướng → 0', () => {
        expect(countRectInRect(800, 800, 700, 400)).toBe(0);
    });

    it('gap (khe cắt) làm giảm số miếng', () => {
        // 100×100 trong 420×420, gap 0: floor(420/100)=4 → 16.
        expect(countRectInRect(100, 100, 420, 420, 0)).toBe(16);
        // gap 25: floor((420+25)/(100+25))=floor(445/125)=3 → 9.
        expect(countRectInRect(100, 100, 420, 420, 25)).toBe(9);
    });

    it('kích thước không hợp lệ → 0', () => {
        expect(countRectInRect(0, 100, 400, 400)).toBe(0);
        expect(countRectInRect(100, 100, 0, 400)).toBe(0);
    });
});

describe('pressPerParent — số bài in xả từ 1 tờ nhập (KHÔNG nhíp)', () => {
    it('khổ xả TRÙNG khổ nhập → 1 (in thẳng trên tờ nhập, không cắt)', () => {
        expect(pressPerParent(790, 1090, 790, 1090)).toBe(1);
    });

    it('khổ xả trùng khổ nhập nhưng xoay (790×1090 vs 1090×790) → 1', () => {
        expect(pressPerParent(1090, 790, 790, 1090)).toBe(1);
    });

    it('79×109 xả ra bài 54×79 → 2 tờ (xoay bài cho khít cạnh dài)', () => {
        // parent 790×1090, press 540×790. 90°(790×540): floor(790/790)=1 × floor(1090/540)=2 = 2.
        expect(pressPerParent(540, 790, 790, 1090)).toBe(2);
    });

    it('bài in lớn hơn tờ nhập → 0 (cấu hình sai, caller xử lý)', () => {
        expect(pressPerParent(900, 1200, 790, 1090)).toBe(0);
    });
});

describe('conPerParentSheet — con/tờ nhập = con/khổ xả × khổ xả/tờ nhập', () => {
    it('nhân đúng 2 mức', () => {
        // 6 con/bài in × 2 bài in/tờ nhập = 12 con/tờ nhập.
        expect(conPerParentSheet(6, 2)).toBe(12);
    });

    it('in thẳng (hệ số xả = 1) → con/tờ nhập = con/khổ xả', () => {
        expect(conPerParentSheet(8, 1)).toBe(8);
    });

    it('mức con 0 → 0 (không chia được)', () => {
        expect(conPerParentSheet(0, 2)).toBe(0);
        expect(conPerParentSheet(6, 0)).toBe(0);
    });
});
