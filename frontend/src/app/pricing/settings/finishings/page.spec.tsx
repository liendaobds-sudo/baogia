/**
 * Component test — lọc tàn dư Offset ở trang Cấu Hình Gia Công (trang DÙNG CHUNG).
 *
 * Trang này không route-gate được (chứa cả gia công In Nhanh lẫn Offset), nên phải lọc
 * nội dung theo Phương_Pháp_In khả dụng của tenant qua `useMethodVisibility`:
 *  - Tenant chỉ bật digital → ẩn thanh tab, KHÔNG hiện "In Offset".
 *  - Tenant bật cả hai → hiện đủ 3 tab (Tất cả / In Nhanh / In Offset).
 *
 * Khóa hành vi ẩn/hiện để chống regression tàn dư Offset. Mock ở seam `useMethodVisibility`
 * (điều khiển trạng thái) + apiClient/child components (cô lập trang khỏi DB/UI con).
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';

// --- Mock seam năng lực: điều khiển qua biến mock* (được phép trong factory jest.mock). ---
let mockVisibility = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
jest.mock('@/lib/scope/use-method-visibility', () => ({
    useMethodVisibility: () => mockVisibility,
}));

// --- Mock apiClient: dữ liệu tối thiểu — 1 dòng digital + 1 dòng offset. ---
jest.mock('../../_components/apiClient', () => ({
    api: {
        get: jest.fn((url: string) => {
            if (url.includes('processing-options')) {
                return Promise.resolve({
                    success: true,
                    data: [
                        { id: 1, code: 'GC-01', name: 'Cán màng', category: 'lamination', price: 1000, scope_offset: false },
                        { id: 2, code: 'GC-02', name: 'Bế Offset', category: 'cutting', price: 0, scope_offset: true, billing_mode: 'perUnit' },
                    ],
                });
            }
            return Promise.resolve({ success: true, data: [] });
        }),
        delete: jest.fn(() => Promise.resolve({ success: true })),
    },
}));

// --- Mock child components: cô lập trang khỏi chi tiết bảng/modal. ---
jest.mock('../../_components/DataTable', () => ({
    DataTable: ({ data }: { data: unknown[] }) => (
        <div data-testid="data-table">{`rows:${data.length}`}</div>
    ),
}));
jest.mock('../../_components/CrudModal', () => ({
    DeleteConfirm: () => null,
}));
jest.mock('./_components/FinishingModal', () => ({
    FinishingModal: () => null,
}));

import FinishingsPage from './page';

describe('FinishingsPage — lọc tàn dư Offset theo năng lực tenant', () => {
    beforeEach(() => {
        mockVisibility = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
    });

    it('tenant bật CẢ HAI hệ in → hiện đủ 3 tab gồm "In Offset"', async () => {
        render(<FinishingsPage />);
        await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
        expect(screen.getByText(/In Offset \(/)).toBeInTheDocument();
        expect(screen.getByText(/In Nhanh \(/)).toBeInTheDocument();
    });

    it('tenant CHỈ bật digital → KHÔNG hiện tab "In Offset"', async () => {
        mockVisibility = { showDigital: true, showOffset: false, bothMethods: false, loaded: true };
        render(<FinishingsPage />);
        await waitFor(() => expect(screen.getByTestId('data-table')).toBeInTheDocument());
        // Thanh tab bị ẩn hoàn toàn → không còn nút tab "In Offset (n)".
        expect(screen.queryByText(/In Offset \(/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Tất cả \(/)).not.toBeInTheDocument();
    });

    it('tenant chỉ digital → bảng chỉ chứa dòng In Nhanh (lọc bỏ dòng offset)', async () => {
        mockVisibility = { showDigital: true, showOffset: false, bothMethods: false, loaded: true };
        render(<FinishingsPage />);
        // 2 dòng tải về (1 digital + 1 offset) nhưng chỉ 1 dòng digital được hiển thị.
        await waitFor(() => expect(screen.getByTestId('data-table')).toHaveTextContent('rows:1'));
    });
});
