/**
 * OffsetQuoteConfigurator — component test.
 *
 * Tabs loại sản phẩm nằm ở thanh tiêu đề của trang (controlled qua prop `activeType`).
 * Component render đúng form theo `activeType`; tự tính giá (debounce) khi đủ cấu hình.
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

jest.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ token: 't' }),
}));
jest.mock('@/lib/api', () => ({ API_URL: 'http://api.test' }));

import { OffsetQuoteConfigurator } from './OffsetQuoteConfigurator';
import { useQuoteCart } from '../_store/useQuoteCart';

const PRICEBOOK = {
    materials: [{ code: 'C150', materialName: 'Couche 150', aliases: [], type: 'couche', gsm: 150, priceVAT: 1000, sheetWidth: 65, sheetHeight: 86 }],
    khoIn: [{ khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm', soConBaiIn: 2, soConToLon: 4, loaiKem: 'Kẽm lớn' }],
    fixedSizes: {
        toRoi: [{ kichThuoc: 'A5 tờ rơi', khoIn: '43cm x 65cm', khoGiayLon: '65cm x 86cm' }],
        biThuFolder: [{ kichThuoc: 'Bì thư A4', khoIn: '43cm x 65cm', loai: 'bithu' }],
    },
    giaCong: [],
    vatTuBeMat: [{ ten: 'Không', donGiaKg: 0, soMat: null }],
    kem: { kemNho: [], kemLon: [], donGia1Kem: { kemNho: 50000, kemLon: 100000 } },
    epKim: { tiers: [], rows: [{ viTri: '1 vị trí' }] },
    haoHut: [],
    params: { TyLe_VAT: 0.08 },
    mocSoLuong: [],
    phiCoDinh: [],
    tuiBaiIn: ['43 x 65cm', '52 x 72cm'],
};

function mockFetch() {
    (global as any).fetch = jest.fn((url: string) => {
        if (url.includes('/pricing/offset/pricebook')) {
            return Promise.resolve({ json: () => Promise.resolve({ success: true, data: PRICEBOOK }) });
        }
        if (url.includes('/pricing/offset/calculate')) {
            return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { lines: [], tongChuaVAT: 0, haoHut: 0, vat: 0, tongGomVAT: 0, chietKhau: 0, khachTra: 0, donGia1SP: 0 } }) });
        }
        return Promise.resolve({ json: () => Promise.resolve({}) });
    });
}

describe('OffsetQuoteConfigurator', () => {
    beforeEach(() => {
        useQuoteCart.setState(useQuoteCart.getInitialState(), true);
    });

    afterEach(() => jest.resetAllMocks());

    it('render form Tờ rơi khi activeType="to_roi"', async () => {
        mockFetch();
        render(<OffsetQuoteConfigurator activeType="to_roi" />);
        await waitFor(() => expect(screen.getByText('Kích thước')).toBeInTheDocument());
        expect(screen.getByText('Giấy in')).toBeInTheDocument();
        expect(screen.getByText(/Tên File/i)).toBeInTheDocument();
    });

    it('render trường đặc trưng SP khác khi activeType="sp_khac"', async () => {
        mockFetch();
        render(<OffsetQuoteConfigurator activeType="sp_khac" />);
        expect(await screen.findByText('Kiểu in (số màu)')).toBeInTheDocument();
        expect(screen.getByText('Ép kim')).toBeInTheDocument();
    });

    it('render trường đặc trưng Hộp giấy khi activeType="hop_giay"', async () => {
        mockFetch();
        render(<OffsetQuoteConfigurator activeType="hop_giay" />);
        expect(await screen.findByText('Kiểu hộp (khuôn bế)')).toBeInTheDocument();
    });

    it('ẩn field theo productConfig.hidden', async () => {
        (global as any).fetch = jest.fn((url: string) => {
            if (url.includes('/pricing/offset/pricebook')) {
                return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { ...PRICEBOOK, productConfig: { to_roi: { hidden: ['catXen'] } } } }) });
            }
            if (url.includes('/pricing/offset/calculate')) {
                return Promise.resolve({ json: () => Promise.resolve({ success: true, data: { lines: [], tongChuaVAT: 0, haoHut: 0, vat: 0, tongGomVAT: 0, chietKhau: 0, khachTra: 0, donGia1SP: 0 } }) });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        });
        render(<OffsetQuoteConfigurator activeType="to_roi" />);
        await waitFor(() => expect(screen.getByText('Kích thước')).toBeInTheDocument());
        expect(screen.queryByText('Cắt xén')).not.toBeInTheDocument();
        expect(screen.getByText('Bế / khuôn')).toBeInTheDocument();
    });

    it('tờ rơi: chuyển "Nhập kích thước" hiện ô Rộng/Cao (khổ in chọn qua thẻ gợi ý)', async () => {
        mockFetch();
        render(<OffsetQuoteConfigurator activeType="to_roi" />);
        await waitFor(() => expect(screen.getByText('Kích thước')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Nhập kích thước'));
        expect(screen.getByText('Rộng (cm)')).toBeInTheDocument();
        expect(screen.getByText('Cao (cm)')).toBeInTheDocument();
        // Khổ in nay chọn qua thẻ gợi ý, không còn dropdown — hiện dòng "Khổ in: ...".
        expect(screen.getByText(/Khổ in:/)).toBeInTheDocument();
        // Chế độ tĩnh ẩn đi → không còn dropdown "Kích thước".
        expect(screen.queryByText('Kích thước')).not.toBeInTheDocument();
    });

    it('payload engine chỉ lấy offsetEngineDiscountRate, không lấy chiết khấu đầu báo giá', async () => {
        useQuoteCart.getState().setHeaderDiscount('percent', 25);
        useQuoteCart.getState().setOffsetEngineDiscountRate(7);

        const calculateBodies: Record<string, unknown>[] = [];
        const readyPricebook = {
            ...PRICEBOOK,
            productConfig: {
                to_roi: {
                    allowedMaterials: ['C150'],
                    allowedKhoIn: ['43cm x 65cm'],
                    allowedKichThuoc: ['A5 tờ rơi'],
                    defaults: {
                        materialCode: 'C150',
                        khoIn: '43cm x 65cm',
                        kichThuoc: 'A5 tờ rơi',
                    },
                },
            },
        };
        (global as any).fetch = jest.fn((url: string, init?: RequestInit) => {
            if (url.includes('/pricing/offset/pricebook')) {
                return Promise.resolve({
                    json: () => Promise.resolve({ success: true, data: readyPricebook }),
                });
            }
            if (url.includes('/pricing/offset/calculate')) {
                calculateBodies.push(JSON.parse(String(init?.body)));
                return Promise.resolve({
                    json: () => Promise.resolve({
                        success: true,
                        data: {
                            lines: [], tongChuaVAT: 0, haoHut: 0, vat: 0,
                            tongGomVAT: 0, chietKhau: 0, khachTra: 0, donGia1SP: 0,
                        },
                    }),
                });
            }
            return Promise.resolve({ json: () => Promise.resolve({}) });
        });

        render(<OffsetQuoteConfigurator activeType="to_roi" />);

        await waitFor(() => expect(calculateBodies.length).toBeGreaterThan(0), {
            timeout: 2500,
        });
        const lastPayload = calculateBodies[calculateBodies.length - 1];
        expect(lastPayload.chietKhauRate).toBe(0.07);
        expect(lastPayload).not.toHaveProperty('headerDiscountRate');
    });
});
