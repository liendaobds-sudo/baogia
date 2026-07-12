import React from 'react';
import { render, screen } from '@testing-library/react';
import { OffsetPreviewSVG } from './OffsetPreviewSVG';

/**
 * Parity §8.4: preview bình bài PHẢI vẽ ĐÚNG `soConToLon` ô — đồng nhất với StatCard
 * "Số con/tờ" và CƠ SỞ GIÁ (engine `soConTrenKho`). Trước đây SVG tự fit theo kích thước
 * với gripper riêng → số ô vẽ lệch soConToLon ngay trong cùng panel (mất tin cậy).
 */
describe('OffsetPreviewSVG — số ô khớp soConToLon (parity giá ↔ preview)', () => {
    const count = () => screen.queryAllByTestId('con-cell').length;

    it('vẽ đúng soConToLon ô khi CÓ kích thước con', () => {
        render(<OffsetPreviewSVG sheetW={65} sheetH={86} itemW={9} itemH={5.4} soConToLon={8} />);
        expect(count()).toBe(8);
    });

    it('vẽ đúng soConToLon ô khi KHÔNG có kích thước con (vd SP khác)', () => {
        render(<OffsetPreviewSVG sheetW={79} sheetH={109} soConToLon={6} />);
        expect(count()).toBe(6);
    });

    it('soConToLon=1 → đúng 1 ô', () => {
        render(<OffsetPreviewSVG sheetW={65} sheetH={86} itemW={60} itemH={80} soConToLon={1} />);
        expect(count()).toBe(1);
    });

    it('không có soConToLon lẫn kích thước → không vẽ ô (không nổ)', () => {
        render(<OffsetPreviewSVG sheetW={65} sheetH={86} />);
        expect(count()).toBe(0);
    });
});

/**
 * Task 11.3 (Req 2.3, 10.2): khi engine trả `meta.positions` (Imposition_Service — nguồn sự thật
 * duy nhất), preview PHẢI vẽ TRỰC TIẾP từ positions thay vì tự dàn khuôn lại → số ô === số con engine
 * (parity giá ≡ preview). Đây là nhánh ưu tiên trong OffsetPreviewSVG.
 */
describe('OffsetPreviewSVG — vẽ trực tiếp từ meta.positions (parity nguồn sự thật)', () => {
    const count = () => screen.queryAllByTestId('con-cell').length;

    // positions (mm) do engine tính cho khổ 79×109cm: 9 con (3×3) — đúng số con/tờ engine.
    const positions9 = [
        { x: 10, y: 10, w: 210, h: 297 }, { x: 223, y: 10, w: 210, h: 297 }, { x: 436, y: 10, w: 210, h: 297 },
        { x: 10, y: 310, w: 210, h: 297 }, { x: 223, y: 310, w: 210, h: 297 }, { x: 436, y: 310, w: 210, h: 297 },
        { x: 10, y: 610, w: 210, h: 297 }, { x: 223, y: 610, w: 210, h: 297 }, { x: 436, y: 610, w: 210, h: 297 },
    ];
    const margins = { left: 10, right: 10, top: 10, bottom: 10, gripper: 12, gutter: 3 };

    it('vẽ đúng positions.length ô khi CÓ meta.positions (số ô === số con engine)', () => {
        render(
            <OffsetPreviewSVG
                sheetW={79}
                sheetH={109}
                itemW={21}
                itemH={29.7}
                soConToLon={9}
                positions={positions9}
                marginConfig={margins}
            />,
        );
        // Số ô vẽ === số con engine trả về (positions.length === soConToLon).
        expect(count()).toBe(9);
        expect(count()).toBe(positions9.length);
    });

    it('positions rỗng → rơi về nhánh ước lượng theo soConToLon (vẫn vẽ đúng số con)', () => {
        render(<OffsetPreviewSVG sheetW={79} sheetH={109} itemW={21} itemH={29.7} soConToLon={9} positions={[]} />);
        expect(count()).toBe(9);
    });

    it('positions 1 con → đúng 1 ô (parity ngay cả ca biên)', () => {
        render(
            <OffsetPreviewSVG
                sheetW={65}
                sheetH={86}
                soConToLon={1}
                positions={[{ x: 10, y: 10, w: 600, h: 800 }]}
                marginConfig={margins}
            />,
        );
        expect(count()).toBe(1);
    });
});
