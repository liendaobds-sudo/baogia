/**
 * Unit tests cho ProductModal (Màn_Cài_Đặt_Sản_Phẩm).
 *
 * Phủ các hành vi của Quy_Tắc_Phạm_Vi trên UI:
 *  - Danh sách Tài_Nguyên_Dùng_Chung render qua `filterForProductType`: chỉ hiển thị tài
 *    nguyên thuộc Phạm_Vi của `quote_type` đang chọn, loại Tài_Nguyên_Chỉ_Offset (Req 4.1, 4.2).
 *  - Phần tử trong Danh_Sách_Được_Phép nhưng ngoài phạm vi hiện badge "ngoài phạm vi" (Req 4.3).
 *  - Lưu bị chặn (KHÔNG gọi create/update API) khi còn vi phạm, có thông báo lỗi (Req 4.5).
 *
 * _Validates: Requirements 4.1, 4.2, 4.3, 4.5_
 */
import { render, screen, fireEvent } from '@testing-library/react';
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

// ─── Dữ liệu master kiểm soát được ───────────────────────────────────────────
// processing_options dùng smallint (0/1); materials snake_case boolean; paper_sizes camelCase.
// Mỗi nhóm có 1 item TRONG phạm vi `loose` và 1 item NGOÀI phạm vi (offset-only / khác scope).
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
        // loadAiFields (fire-and-forget trong initProduct): mock rõ để async setState settle trong act,
        // không rò ra ngoài test (nguồn warning "update not wrapped in act" ở ProductModal).
        if (endpoint.startsWith('/erp/ai-config')) return Promise.resolve({ success: true, data: { fields: [] } });
        if (endpoint.includes('/mini-quote-fields')) return Promise.resolve({ success: true, data: { master_fields: [] } });
        if (endpoint.startsWith('/erp/products/')) return Promise.resolve({ success: true, data: productDetail ?? {} });
        return Promise.resolve({ success: true, data: [] });
    });
}

// Chuyển sang tab "Cấu hình & Ràng buộc" nơi render các danh sách Tài_Nguyên_Dùng_Chung.
async function goToQuoteTab() {
    fireEvent.click(screen.getByRole('button', { name: /Cấu hình & Ràng buộc/ }));
}

beforeEach(() => {
    jest.clearAllMocks();
    // Tránh "Not implemented: window.confirm" của jsdom; mặc định xác nhận.
    jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('ProductModal — Quy_Tắc_Phạm_Vi trên UI', () => {
    test('chỉ render Tài_Nguyên_Trong_Phạm_Vi (loose); loại Tài_Nguyên_Chỉ_Offset (Req 4.1, 4.2)', async () => {
        setupGet();
        render(<ProductModal isOpen onClose={() => {}} onSaved={() => {}} product={null} />);

        await goToQuoteTab();

        // Gia_Công thuộc phạm vi `loose` hiển thị; gia công chỉ-offset bị loại khỏi danh sách.
        expect(await screen.findByText('Cán màng bóng')).toBeInTheDocument();
        expect(screen.queryByText('Bế nổi khuôn')).not.toBeInTheDocument();
    });

    test('hiển thị badge "ngoài phạm vi" cho phần tử allowed vi phạm Phạm_Vi (Req 4.3)', async () => {
        // Edit mode: sản phẩm loose đã tick một gia công chỉ-offset (id 21) → ngoài phạm vi.
        setupGet({
            id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp',
            quote_config: { allowed_processing: ['21'], allowed_materials: ['1'], allowed_paper_sizes: ['10'] },
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

        // Gia công chỉ-offset đã tick nay hiện ra kèm badge "ngoài phạm vi".
        const violating = await screen.findAllByText('Bế nổi khuôn');
        expect(violating.length).toBeGreaterThan(0);
        // Badge "ngoài phạm vi" xuất hiện (banner cảnh báo + nhãn trên item).
        expect(screen.getAllByText(/ngoài phạm vi/i).length).toBeGreaterThan(0);
    });

    test('chặn lưu khi còn vi phạm: KHÔNG gọi create/update API và báo lỗi (Req 4.5)', async () => {
        setupGet({
            id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp',
            quote_config: { allowed_processing: ['21'], allowed_materials: ['1'], allowed_paper_sizes: ['10'] },
        });
        render(
            <ProductModal
                isOpen
                onClose={() => {}}
                onSaved={() => {}}
                product={{ id: 100, code: 'namecard', quote_type: 'loose', name_vi: 'Danh thiếp' }}
            />,
        );

        // Chờ quote_config nạp xong (badge vi phạm xuất hiện) trước khi lưu.
        await goToQuoteTab();
        await screen.findAllByText('Bế nổi khuôn');

        fireEvent.click(screen.getByRole('button', { name: /Lưu sản phẩm/ }));

        // Thông báo lỗi nêu đích danh tài nguyên vi phạm; KHÔNG ghi qua API.
        await screen.findByText(/Không thể lưu/);
        expect(screen.getAllByText(/Bế nổi khuôn/).length).toBeGreaterThan(0);
        expect(mockPut).not.toHaveBeenCalled();
        expect(mockPost).not.toHaveBeenCalled();
    });
});
