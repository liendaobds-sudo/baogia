/**
 * Component test cho `MaterialsPage` — lọc tàn dư Offset theo năng lực tenant.
 *
 * Materials lọc theo API param (`scope`), KHÔNG lọc client-side như finishings. Nên
 * kiểm ở hai mặt:
 *  - Khi tenant CHỈ bật digital: thanh chọn hệ in bị ẩn, và request `/erp/materials`
 *    mang `scope=loose` (ép đúng hệ in khả dụng — không lọt vật tư offset).
 *  - Khi tenant bật CẢ HAI: thanh chọn hệ in hiện, request không bị ép scope.
 *
 * _Requirements: tenant-app-scope / method-capability leak-through_
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

// --- Mock cờ hiển thị theo Phương_Pháp_In (seam duy nhất quyết định ẩn/hiện). ---
let mockVisibility = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
jest.mock('@/lib/scope/use-method-visibility', () => ({
    useMethodVisibility: () => mockVisibility,
}));

// --- Bắt URL các lần gọi api.get để khẳng định tham số `scope`. ---
const getCalls: string[] = [];
jest.mock('../_components/apiClient', () => ({
    api: {
        get: jest.fn((url: string) => {
            getCalls.push(url);
            if (url.startsWith('/erp/material-categories')) {
                return Promise.resolve({ success: true, data: [{ code: 'giay', name: 'Giấy' }] });
            }
            if (url.startsWith('/erp/paper-sizes')) return Promise.resolve({ success: true, data: [] });
            if (url.startsWith('/erp/units')) return Promise.resolve({ success: true, data: [] });
            if (url.startsWith('/erp/materials')) return Promise.resolve({ success: true, data: [] });
            return Promise.resolve({ success: true, data: [] });
        }),
        post: jest.fn(() => Promise.resolve({ success: true, data: {} })),
        put: jest.fn(() => Promise.resolve({ success: true, data: {} })),
        delete: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    },
}));

jest.mock('../_components/MaterialEditModal', () => () => null);
jest.mock('../_components/StockActionModal', () => () => null);

import MaterialsPage from './page';

/** URL gọi tới /erp/materials gần nhất (chứa querystring scope). */
function lastMaterialsUrl(): string | undefined {
    return [...getCalls].reverse().find((u) => u.startsWith('/erp/materials'));
}

describe('MaterialsPage — lọc tàn dư Offset theo năng lực tenant', () => {
    beforeEach(() => {
        getCalls.length = 0;
        mockVisibility = { showDigital: true, showOffset: true, bothMethods: true, loaded: true };
    });

    it('tenant bật CẢ HAI hệ in → hiện thanh chọn hệ in ("In Offset")', async () => {
        render(<MaterialsPage />);
        await waitFor(() => expect(screen.getByText(/In Offset/)).toBeInTheDocument());
        expect(screen.getByText(/In nhanh/)).toBeInTheDocument();
    });

    it('tenant CHỈ bật digital → ẩn thanh chọn hệ in (không nút "In Offset")', async () => {
        mockVisibility = { showDigital: true, showOffset: false, bothMethods: false, loaded: true };
        render(<MaterialsPage />);
        await waitFor(() => expect(lastMaterialsUrl()).toBeDefined());
        expect(screen.queryByText(/🖨️ In Offset/)).not.toBeInTheDocument();
    });

    it('tenant CHỈ bật digital → request /erp/materials mang scope=loose (không lọt vật tư offset)', async () => {
        mockVisibility = { showDigital: true, showOffset: false, bothMethods: false, loaded: true };
        render(<MaterialsPage />);
        await waitFor(() => expect(lastMaterialsUrl()).toBeDefined());
        expect(lastMaterialsUrl()).toContain('scope=loose');
    });

    it('tenant CHỈ bật offset → request /erp/materials mang scope=offset', async () => {
        mockVisibility = { showDigital: false, showOffset: true, bothMethods: false, loaded: true };
        render(<MaterialsPage />);
        await waitFor(() => expect(lastMaterialsUrl()).toBeDefined());
        expect(lastMaterialsUrl()).toContain('scope=offset');
    });
});
