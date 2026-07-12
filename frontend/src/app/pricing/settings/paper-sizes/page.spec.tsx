/**
 * Component test — PaperSizesPage lọc tab theo Phương_Pháp_In khả dụng (tenant-app-scope /
 * print-method-unification). Trang DÙNG CHUNG (không route-gate), nên phải tự ẩn tab
 * "In Offset" khi tenant chỉ bật digital, và ngược lại.
 *
 * Kiểm 3 trạng thái: cả hai bật → 2 tab; chỉ digital → không tab, chỉ nội dung digital;
 * chỉ offset → không tab, chỉ nội dung offset.
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import type { MethodVisibility } from '@/lib/scope/use-method-visibility';

let mockVis: MethodVisibility = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
jest.mock('@/lib/scope/use-method-visibility', () => ({
    useMethodVisibility: () => mockVis,
}));

// Child bảng khổ giấy: thay bằng marker để chỉ kiểm tab/nội dung nào được render.
jest.mock('./_components/DigitalPaperSizes', () => ({
    DigitalPaperSizes: () => <div data-testid="digital-content">DIGITAL</div>,
}));
jest.mock('./_components/OffsetPaperSizes', () => ({
    OffsetPaperSizes: () => <div data-testid="offset-content">OFFSET</div>,
}));

import PaperSizesPage from './page';

describe('PaperSizesPage — lọc tab theo Phương_Pháp_In', () => {
    it('cả hai bật → hiện đủ 2 tab, mặc định nội dung digital', () => {
        mockVis = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
        render(<PaperSizesPage />);
        expect(screen.getByText('In Offset')).toBeInTheDocument();
        expect(screen.getByText('In Kỹ Thuật Số (Digital)')).toBeInTheDocument();
        expect(screen.getByTestId('digital-content')).toBeInTheDocument();
    });

    it('chỉ digital → ẩn thanh tab, chỉ render nội dung digital (không lộ Offset)', () => {
        mockVis = { showDigital: true, showOffset: false, bothMethods: false, loaded: true };
        render(<PaperSizesPage />);
        // Không còn nút tab "In Offset".
        expect(screen.queryByText('In Offset')).not.toBeInTheDocument();
        expect(screen.getByTestId('digital-content')).toBeInTheDocument();
        expect(screen.queryByTestId('offset-content')).not.toBeInTheDocument();
    });

    it('chỉ offset → ẩn thanh tab, chỉ render nội dung offset', () => {
        mockVis = { showDigital: false, showOffset: true, bothMethods: false, loaded: true };
        render(<PaperSizesPage />);
        expect(screen.queryByText('In Kỹ Thuật Số (Digital)')).not.toBeInTheDocument();
        expect(screen.getByTestId('offset-content')).toBeInTheDocument();
        expect(screen.queryByTestId('digital-content')).not.toBeInTheDocument();
    });

    it('chưa nạp xong (fail-open) → hiện đủ tab để tránh ẩn nhầm', () => {
        mockVis = { showDigital: true, showOffset: true, bothMethods: true, loaded: false };
        render(<PaperSizesPage />);
        expect(screen.getByText('In Offset')).toBeInTheDocument();
    });
});
