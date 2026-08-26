/**
 * Unit tests cho ProductModal (Màn_Cài_Đặt_Sản_Phẩm).
 *
 * Phủ hành vi Phạm_Vi trên UI:
 *  - Chỉ render Tài_Nguyên thuộc Phạm_Vi của `quote_type` (loại offset-only).
 *  - Mục đã tick nhưng ngoài phạm vi: TỰ GỠ, KHÔNG hiện banner đỏ.
 *  - Lưu được sau khi auto-prune (không chặn vì “ngoài phạm vi”).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ProductModal from './ProductModal';
import { api } from '../_components/apiClient';

jest.mock('../_components/apiClient', () => ({
    api: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPut = api.put as jest.Mock;

const PROC_IN_SCOPE = { id: 20, name: 'Cán màng bóng', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false, is_active: 1 };
const PROC_OFFSET_ONLY = { id: 21, name: 'Bế nổi khuôn', scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true, is_active: 1 };

const MAT_IN_SCOPE = { id: 1, name: 'Giấy Couche 300', category_tab: 'substrate_sheet', scope_loose: true, scope_large_format: false, scope_offset: false };
const MAT_OUT_SCOPE = { id: 2, name: 'Bạt Hiflex 2m', category_tab: 'substrate_roll', scope_loose: false, scope_large_format: true, scope_offset: false };

const PAPER_IN_SCOPE = { id: 10, name: 'Khổ A4 SRA3', scopeLoose: true, scopeLargeFormat: false, scopeOffset: false };
const PAPER_OUT_SCOPE = { id: 11, name: 'Khổ siêu lớn 1m2', scopeLoose: false, scopeLargeFormat: true, scopeOffset: false };

function setupGet(productDetail?: unknown) {
    mockGet.mockImplementation((endpoint: string) => {
        if (endpoint === '/erp/materials') return Promise.resolve({ success: true, data: [MAT_IN_SCOPE, MAT_OUT_SCOPE] });
        if (endpoint === '/erp/paper-sizes') return Promise.resolve({ success: true, data: [PAPER_IN_SCOPE, PAPER_OUT_SCOPE] });
        if (endpoint === '/erp/processing-options') return Promise.resolve({ success: true, data: [PROC_IN_SCOPE, PROC_OFFSET_ONLY] });
        if (endpoint === '/erp/product-categories') return Promise.resolve({ success: true, data: [] });
        if (endpoint === '/pricing/master-data?type=accessories') return Promise.resolve({ success: true, data: { accessories: [] } });
        if (endpoint.startsWith('/erp/ai-config')) return Promise.resolve({ success: true, data: { fields: [] } });
        if (endpoint.includes('/mini-quote-fields')) return Promise.resolve({ success: true, data: { master_fields: [] } });
        if (endpoint.startsWith('/erp/products/')) return Promise.resolve({ success: true, data: productDetail ?? {} });
        return Promise.resolve({ success: true, data: [] });
    });
}

async function goToQuoteTab() {
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình & Ràng buộc/ }));
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('ProductModal — Phạm_Vi UI (chỉ hiện + auto-prune)', () => {
    test('chỉ render tài nguyên trong phạm vi loose; không hiện offset-only', async () => {
        setupGet();
        render(<ProductModal isOpen onClose={() => {}} onSaved={() => {}} product={null} />);

        await goToQuoteTab();

        expect(await screen.findByText('Cán màng bóng')).toBeInTheDocument();
        expect(screen.queryByText('Bế nổi khuôn')).not.toBeInTheDocument();
        expect(screen.queryByText(/ngoài phạm vi/i)).not.toBeInTheDocument();
    });

    test('mục allowed ngoài phạm vi: tự gỡ, không hiện badge đỏ', async () => {
        setupGet({
            id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp',
            quote_config: {
                allowed_processing: ['21'], // offset-only → prune
                allowed_materials: ['1'],
                allowed_paper_sizes: ['10'],
            },
        });
        render(
            <ProductModal
                isOpen
                onClose={() => {}}
                onSaved={() => {}}
                product={{ id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp' }}
            />,
        );

        await goToQuoteTab();
        await screen.findByText('Cán màng bóng');

        // Không hiện item ngoài scope, không banner
        expect(screen.queryByText('Bế nổi khuôn')).not.toBeInTheDocument();
        expect(screen.queryByText(/ngoài phạm vi/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Tài nguyên ngoài phạm vi/i)).not.toBeInTheDocument();
    });

    test('lưu được sau auto-prune (không chặn vì ngoài phạm vi)', async () => {
        setupGet({
            id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp',
            quote_config: {
                allowed_processing: ['21'],
                allowed_materials: ['1'],
                allowed_paper_sizes: ['10'],
            },
        });
        mockPut.mockResolvedValue({ success: true, data: {} });

        render(
            <ProductModal
                isOpen
                onClose={() => {}}
                onSaved={() => {}}
                product={{ id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp' }}
            />,
        );

        await goToQuoteTab();
        await screen.findByText('Cán màng bóng');

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Lưu sản phẩm/ }));
        });

        await waitFor(() => {
            expect(mockPut).toHaveBeenCalled();
        });
        // Payload không còn processing id 21
        const payload = mockPut.mock.calls[0][1];
        const allowedProc = payload?.quote_config?.allowed_processing || [];
        expect(allowedProc).not.toContain('21');
        expect(allowedProc).not.toContain(21);
    });
});
