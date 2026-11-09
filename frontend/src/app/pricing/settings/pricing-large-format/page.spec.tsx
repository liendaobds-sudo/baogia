/**
 * Component test cho `PricingLargeFormatPage` (tầng 3 khổ lớn).
 *
 * Rủi ro tiền bạc: khổ lớn KHÔNG auto-sync giá vốn (giá/m² là giá gộp), nên cảnh báo
 * "bán dưới giá vốn" là lớp bảo vệ duy nhất. Test:
 *  - Badge "⚠ dưới giá vốn" hiện khi có mốc giá/m² < current_cost_price; KHÔNG hiện khi ≥.
 *  - Dòng "Giá vốn vật liệu (tham chiếu)" render khi có cost.
 *  - Nút "✨ Gợi ý giá định mức" → POST /erp/large-format-pricing/suggest đúng body,
 *    điền breakdown 4 thành phần vào mốc.
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
            if (url.startsWith('/erp/large-format-pricing')) {
                return Promise.resolve({
                    success: true,
                    data: [
                        // Nhóm material 1: có mốc giá/m² 45.000 < giá vốn 52.000 → BÁN LỖ.
                        { id: 1, materialId: 1, areaFrom: 0, areaTo: 10, pricePerSqm: 45000, current_cost_price: 52000 },
                        { id: 2, materialId: 1, areaFrom: 10, areaTo: 999999, pricePerSqm: 60000, current_cost_price: 52000 },
                        // Nhóm material 2: mốc giá/m² 80.000 ≥ giá vốn 50.000 → an toàn.
                        { id: 3, materialId: 2, areaFrom: 0, areaTo: 999999, pricePerSqm: 80000, current_cost_price: 50000 },
                    ],
                });
            }
            if (url.startsWith('/erp/printers')) return Promise.resolve({ success: true, data: [{ id: 9, name: 'Máy phun UV', costBasis: 'sqm' }] });
            return Promise.resolve({ success: true, data: [] });
        }),
        post: jest.fn((url: string, body: unknown) => {
            postCalls.push({ url, body });
            if (url === '/erp/large-format-pricing/suggest') {
                return Promise.resolve({ success: true, data: { breakdown: { materialCost: 50000, machineCost: 2800, laborCost: 2400, overheadCost: 3000, total: 58200 } } });
            }
            return Promise.resolve({ success: true, data: {} });
        }),
        put: jest.fn(() => Promise.resolve({ success: true, data: {} })),
        delete: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    },
}));

jest.mock('../../_components/fetchQuoteMaterials', () => ({
    fetchQuoteMaterials: jest.fn(() => Promise.resolve([
        { id: 1, name: 'Bạt Hiflex', cost_price: 52000 },
        { id: 2, name: 'Decal PP', cost_price: 50000 },
    ])),
}));

import PricingLargeFormatPage from './page';

describe('PricingLargeFormatPage — cảnh báo dưới giá vốn + gợi ý', () => {
    beforeEach(() => {
        getCalls.length = 0;
        postCalls.length = 0;
    });

    it('nhóm có mốc giá/m² < giá vốn → badge "⚠ dưới giá vốn"', async () => {
        render(<PricingLargeFormatPage />);
        await waitFor(() => expect(screen.getByText('Bạt Hiflex')).toBeInTheDocument());
        expect(screen.getByText(/dưới giá vốn/)).toBeInTheDocument();
    });

    it('chỉ nhóm bán lỗ có badge — nhóm giá ≥ giá vốn KHÔNG có', async () => {
        render(<PricingLargeFormatPage />);
        await waitFor(() => expect(screen.getByText('Decal PP')).toBeInTheDocument());
        // Chỉ nhóm 1 (Bạt Hiflex) lỗ → đúng 1 badge toàn trang.
        expect(screen.getAllByText(/dưới giá vốn/)).toHaveLength(1);
    });

    it('dòng "Giá vốn vật liệu" tham chiếu render cho nhóm có cost', async () => {
        render(<PricingLargeFormatPage />);
        await waitFor(() => expect(screen.getByText('Bạt Hiflex')).toBeInTheDocument());
        // Cả 2 nhóm đều có current_cost_price → 2 dòng tham chiếu.
        expect(screen.getAllByText(/Giá vốn vật liệu:/).length).toBeGreaterThanOrEqual(2);
    });

    it('bấm "Gợi ý giá định mức" → POST /erp/large-format-pricing/suggest với material_id', async () => {
        render(<PricingLargeFormatPage />);
        await waitFor(() => expect(screen.getByText('Bạt Hiflex')).toBeInTheDocument());

        // Mở form thêm mới.
        fireEvent.click(screen.getByRole('button', { name: /Thêm định mức mới/ }));
        // Chọn vật tư (bắt buộc để gợi ý). Select không có accessible name (label không liên
        // kết htmlFor) → lấy combobox đầu tiên trong form (vật tư là select đầu, máy là select sau).
        const matSelect = screen.getAllByRole('combobox')[0];
        fireEvent.change(matSelect, { target: { value: '1' } });

        fireEvent.click(screen.getByText(/Gợi ý giá định mức/));

        await waitFor(() => expect(postCalls.some(c => c.url === '/erp/large-format-pricing/suggest')).toBe(true));
        const sug = postCalls.find(c => c.url === '/erp/large-format-pricing/suggest');
        expect((sug!.body as any).material_id).toBe(1);
    });

    it('hỗ trợ chế độ Nhập nhanh 1 ô/m² và Tạo 4 mốc m² chuẩn 1-click', async () => {
        render(<PricingLargeFormatPage />);
        await waitFor(() => expect(screen.getByText('Bạt Hiflex')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Thêm định mức mới/ }));
        expect(screen.getByText(/Đơn giá vốn \/ m² \(₫\)/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Tạo 4 mốc m² chuẩn/ }));
        expect(screen.getAllByText(/Đơn giá vốn \/ m² \(₫\)/)).toHaveLength(4);

        fireEvent.click(screen.getByRole('button', { name: /Chi tiết 4 thành phần/ }));
        expect(screen.getAllByText('Overhead')).toHaveLength(4);
    });
});
