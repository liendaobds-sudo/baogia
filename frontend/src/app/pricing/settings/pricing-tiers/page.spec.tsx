/**
 * Component test cho `PricingTiersPage` (tầng 2) — badge lệch giá vốn + nút đồng bộ.
 *
 * cost_drift do backend trả (findAllTiers JOIN materials.cost_price). FE dùng để:
 *  - Hiện badge "giá vốn đã đổi" ở nhóm có tier lệch.
 *  - Nút "Đồng bộ giá vốn" gọi POST /erp/pricing-tiers/sync-cost với material_id của nhóm.
 * Không drift → không badge, không nút.
 */

import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// --- Bắt các lần gọi api để khẳng định endpoint đồng bộ. ---
const getCalls: string[] = [];
const postCalls: { url: string; body: unknown }[] = [];
jest.mock('../../_components/apiClient', () => ({
    api: {
        get: jest.fn((url: string) => {
            getCalls.push(url);
            if (url.startsWith('/erp/pricing-tiers')) {
                return Promise.resolve({
                    success: true,
                    data: [
                        // Nhóm 1 (material 1): lệch giá vốn.
                        { id: 1, materialId: 1, paperSizeId: 10, technology: 'digital_toner', printSide: 'single', printType: '4c', quantityFrom: 1, quantityTo: 999999, pricePerSheet: 2700, paperCost: 2000, inkCost: 700, current_cost_price: 3200, cost_drift: true },
                        // Nhóm 2 (material 2): không lệch.
                        { id: 2, materialId: 2, paperSizeId: 10, technology: 'digital_toner', printSide: 'single', printType: '4c', quantityFrom: 1, quantityTo: 999999, pricePerSheet: 1500, paperCost: 1500, inkCost: 0, current_cost_price: 1500, cost_drift: false },
                    ],
                });
            }
            if (url.startsWith('/erp/paper-sizes')) return Promise.resolve({ success: true, data: [{ id: 10, name: 'A4' }] });
            if (url.startsWith('/erp/printers')) return Promise.resolve({ success: true, data: [{ id: 9, name: 'Konica C3070', costBasis: 'sheet' }] });
            return Promise.resolve({ success: true, data: [] });
        }),
        post: jest.fn((url: string, body: unknown) => {
            postCalls.push({ url, body });
            if (url === '/erp/pricing-tiers/suggest') {
                return Promise.resolve({ success: true, data: { breakdown: { paperCost: 300, inkCost: 125, machineCost: 250, laborCost: 360, overheadCost: 300, total: 1335 } } });
            }
            return Promise.resolve({ success: true, data: { synced: 1 } });
        }),
        put: jest.fn(() => Promise.resolve({ success: true, data: {} })),
        delete: jest.fn(() => Promise.resolve({ success: true, data: {} })),
    },
}));

// Materials nạp qua helper dùng chung — trả tên để nhóm hiển thị.
jest.mock('../../_components/fetchQuoteMaterials', () => ({
    fetchQuoteMaterials: jest.fn(() => Promise.resolve([
        { id: 1, name: 'Couche 200', cost_price: 3200 },
        { id: 2, name: 'Ford 80', cost_price: 1500 },
    ])),
}));

import PricingTiersPage from './page';

describe('PricingTiersPage — badge lệch giá vốn + đồng bộ', () => {
    beforeEach(() => {
        getCalls.length = 0;
        postCalls.length = 0;
    });

    it('nhóm có cost_drift → hiện badge "giá vốn đã đổi"', async () => {
        render(<PricingTiersPage />);
        await waitFor(() => expect(screen.getByText('Couche 200')).toBeInTheDocument());
        expect(screen.getByText(/giá vốn đã đổi/)).toBeInTheDocument();
    });

    it('nhóm KHÔNG lệch → không có badge', async () => {
        render(<PricingTiersPage />);
        await waitFor(() => expect(screen.getByText('Ford 80')).toBeInTheDocument());
        // Chỉ nhóm 1 lệch → đúng 1 badge trên toàn trang.
        expect(screen.getAllByText(/giá vốn đã đổi/)).toHaveLength(1);
    });

    it('bấm "Đồng bộ giá vốn" → POST /erp/pricing-tiers/sync-cost với material_id của nhóm', async () => {
        render(<PricingTiersPage />);
        await waitFor(() => expect(screen.getByText('Couche 200')).toBeInTheDocument());

        fireEvent.click(screen.getByText(/Đồng bộ giá vốn/));

        await waitFor(() => expect(postCalls.length).toBeGreaterThan(0));
        const sync = postCalls.find(c => c.url === '/erp/pricing-tiers/sync-cost');
        expect(sync).toBeDefined();
        expect(sync!.body).toEqual({ material_id: 1 });
    });
});

describe('PricingTiersPage — tầng 3: gợi ý giá định mức từ chi phí', () => {
    beforeEach(() => {
        getCalls.length = 0;
        postCalls.length = 0;
    });

    it('bấm "Gợi ý giá định mức từ chi phí" → POST /erp/pricing-tiers/suggest với material_id', async () => {
        render(<PricingTiersPage />);
        await waitFor(() => expect(screen.getByText('Couche 200')).toBeInTheDocument());

        // Mở form thêm mới.
        fireEvent.click(screen.getByRole('button', { name: /Thêm định mức mới/ }));
        // Chọn vật tư — bắt buộc để nút Gợi ý bật. Trang có select lọc ở header nên KHÔNG
        // dùng index; lấy đúng select vật tư qua option con của nó ('Couche 200').
        const matSelect = (screen.getByRole('option', { name: 'Couche 200' }) as HTMLOptionElement).closest('select')!;
        fireEvent.change(matSelect, { target: { value: '1' } });

        fireEvent.click(screen.getByText(/Gợi ý giá định mức từ chi phí/));

        await waitFor(() => expect(postCalls.some(c => c.url === '/erp/pricing-tiers/suggest')).toBe(true));
        const sug = postCalls.find(c => c.url === '/erp/pricing-tiers/suggest');
        expect((sug!.body as any).material_id).toBe(1);
    });

    it('hỗ trợ chế độ Nhập nhanh 1 ô/mốc và Tạo 5 mốc SL chuẩn 1-click', async () => {
        render(<PricingTiersPage />);
        await waitFor(() => expect(screen.getByText('Couche 200')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Thêm định mức mới/ }));
        // Mặc định ở chế độ Nhập nhanh (1 ô/mốc)
        expect(screen.getByText(/Giá vốn\/tờ:/)).toBeInTheDocument();

        // Bấm Tạo 5 mốc SL chuẩn → sinh 5 dòng mốc số lượng
        fireEvent.click(screen.getByRole('button', { name: /Tạo 5 mốc SL chuẩn/ }));
        expect(screen.getAllByText(/Giá vốn\/tờ:/)).toHaveLength(5);

        // Chuyển sang Chi tiết 5 thành phần → hiện đủ cột Giấy, Mực, Máy, Công, Overhead
        fireEvent.click(screen.getByRole('button', { name: /Chi tiết 5 thành phần/ }));
        expect(screen.getAllByText('Overhead')).toHaveLength(5);
    });
});
