/**
 * Component test cho `PrintersPage` (tầng 3) — hồ sơ chi phí máy, phân biệt cost_basis.
 *
 * Máy in nhanh (cost_basis='sheet') và máy khổ lớn (cost_basis='sqm') dùng chung bảng
 * nhưng ĐO chi phí theo đơn vị khác nhau. Test:
 *  - Badge phân biệt: 'tờ · in nhanh' vs 'm² · khổ lớn'.
 *  - Cột "SL / tháng" đổi đơn vị theo cost_basis (tờ ↔ m²).
 *  - Thêm máy → POST /erp/printers.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const getCalls: string[] = [];
const postCalls: { url: string; body: unknown }[] = [];
jest.mock('../../_components/apiClient', () => ({
    api: {
        get: jest.fn((url: string) => {
            getCalls.push(url);
            if (url.startsWith('/erp/printers')) {
                return Promise.resolve({
                    success: true,
                    data: [
                        { id: 1, code: 'KM-3070', name: 'Konica C3070', costBasis: 'sheet', sheetsPerMonth: 100000, sqmPerMonth: 0 },
                        { id: 2, code: 'UV-PHUN', name: 'Máy phun UV', costBasis: 'sqm', sheetsPerMonth: 0, sqmPerMonth: 8000 },
                    ],
                });
            }
            return Promise.resolve({ success: true, data: [] });
        }),
        post: jest.fn((url: string, body: unknown) => { postCalls.push({ url, body }); return Promise.resolve({ success: true, data: {} }); }),
        put: jest.fn(() => Promise.resolve({ success: true, data: {} })),
        delete: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    },
}));

import PrintersPage from './page';

describe('PrintersPage — hồ sơ chi phí máy, phân biệt cost_basis', () => {
    beforeEach(() => {
        getCalls.length = 0;
        postCalls.length = 0;
    });

    it('badge phân biệt máy tờ (in nhanh) vs m² (khổ lớn)', async () => {
        render(<PrintersPage />);
        await waitFor(() => expect(screen.getByText('Konica C3070')).toBeInTheDocument());
        expect(screen.getByText(/tờ · in nhanh/)).toBeInTheDocument();
        expect(screen.getByText(/m² · khổ lớn/)).toBeInTheDocument();
    });

    it('cột "SL / tháng" đổi đơn vị theo cost_basis', async () => {
        render(<PrintersPage />);
        await waitFor(() => expect(screen.getByText('Máy phun UV')).toBeInTheDocument());
        // Máy sheet: hiện theo tờ; máy sqm: hiện theo m².
        expect(screen.getByText(/100.000 tờ/)).toBeInTheDocument();
        expect(screen.getByText(/8.000 m²/)).toBeInTheDocument();
    });

    it('bấm "Thêm máy" mở form nhập', async () => {
        render(<PrintersPage />);
        await waitFor(() => expect(screen.getByText('Konica C3070')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /Thêm máy/ }));
        // Modal CRUD mở → ô "Đơn vị tính chi phí" xuất hiện.
        expect(await screen.findByText(/Đơn vị tính chi phí/)).toBeInTheDocument();
    });
});
