/**
 * Component test cho luồng tạo Báo giá (`new/page.tsx`).
 * Task 7.4 — quote-page-ux.
 *
 * Phạm vi kiểm thử (focused):
 *  - Nút "LƯU BÁO GIÁ" disabled khi thiếu hạng mục HOẶC thiếu tên khách; bật khi đủ cả hai.
 *  - Khi hợp lệ + bấm Lưu: gọi `fetch` tới URL kết thúc `/erp/orders` với method POST và
 *    body có item map snake_case whitelisted (`product_name`, `item_total`), cấu hình gói
 *    trong `printing_detail` (không spread camelCase lên gốc, không bọc `config_params`).
 *  - fetch lỗi (res.ok=false) ⇒ toast error + KHÔNG `router.push`.
 *  - fetch thành công ⇒ `router.push('/pricing/quotes')`.
 *
 * _Requirements: 3.1, 5.2, 5.3_
 */

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('@/lib/auth-context', () => ({
    useAuth: () => ({ token: 't' }),
}));

const mockToastShow = jest.fn();
jest.mock('@/lib/ui/toast', () => ({
    useToast: () => ({ show: mockToastShow }),
}));

// QuoteConfigurator nặng → thay bằng stub tối giản.
jest.mock('@/app/pricing/quotes/_components/QuoteConfigurator', () => ({
    QuoteConfigurator: () => <div data-testid="configurator-stub" />,
}));

// CustomerInfo → stub điều khiển được: input đẩy tên ra parent (onCustomerNameChange)
// đồng thời ref.getPayload()/getDraftState() phản ánh đúng tên đang nhập.
jest.mock('@/app/pricing/_components/CustomerInfo', () => {
    const React = require('react');
    return {
        CustomerInfo: React.forwardRef(function MockCustomerInfo(props: any, ref: any) {
            const [name, setName] = React.useState('');
            React.useImperativeHandle(ref, () => ({
                getPayload: () => ({
                    customer_name: name,
                    customer_code: '',
                    customer_type: 'individual',
                    customer_phone: '0900000000',
                    customer_address: 'Số 1',
                    customer_unit: 'Cty ABC',
                    customer_email: '',
                    customer_tax_code: 'TAX123',
                    customer_contact: '',
                    notes: 'ghi chú',
                    vat_rate: 10,
                    shipping_fee: 0,
                }),
                setCustomerData: jest.fn(),
                getDraftState: () => ({ customerName: name }),
            }), [name]);
            return (
                <input
                    aria-label="customer-name"
                    value={name}
                    onChange={(e: any) => {
                        setName(e.target.value);
                        props.onCustomerNameChange?.(e.target.value);
                    }}
                />
            );
        }),
    };
});

import NewQuotePage from './page';
import { useQuoteCart, type QuoteCartItem } from '../_store/useQuoteCart';

// ── Helpers ───────────────────────────────────────────────────────────────────

const seedCartItem = (overrides: Partial<Omit<QuoteCartItem, 'id'>> = {}) => {
    useQuoteCart.getState().addItem({
        name: 'Tờ rơi A5',
        type: 'loose',
        quantity: 100,
        unitPrice: 1000,
        total: 100000,
        details: {},
        // configParams được gói trong printing_detail khi map sang QuoteItemDto.
        configParams: { width: 148, height: 210 },
        ...overrides,
    });
};

const getSaveButton = () => screen.getByRole('button', { name: 'Lưu báo giá' });

const typeCustomerName = (value: string) => {
    fireEvent.change(screen.getByLabelText('customer-name'), { target: { value } });
};

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
    mockToastShow.mockClear();
    useQuoteCart.getState().clearCart();
    global.fetch = jest.fn();
});

afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NewQuotePage — luồng tạo Báo giá', () => {
    it('disable nút Lưu khi không có hạng mục (kể cả khi đã nhập tên)', () => {
        render(<NewQuotePage />);
        typeCustomerName('Anh Minh');
        expect(getSaveButton()).toBeDisabled();
    });

    it('disable nút Lưu khi có hạng mục nhưng chưa nhập tên khách', () => {
        seedCartItem();
        render(<NewQuotePage />);
        expect(getSaveButton()).toBeDisabled();
    });

    it('bật nút Lưu khi có cả tên khách và hạng mục', () => {
        seedCartItem();
        render(<NewQuotePage />);
        typeCustomerName('Anh Minh');
        expect(getSaveButton()).toBeEnabled();
    });

    it('gọi POST /erp/orders với item map snake_case (cấu hình trong printing_detail) và điều hướng khi thành công', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { id: 1 } }),
        });

        seedCartItem();
        render(<NewQuotePage />);
        typeCustomerName('Anh Minh');

        fireEvent.click(getSaveButton());

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

        const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
        expect(String(url)).toMatch(/\/erp\/orders$/);
        expect(opts.method).toBe('POST');

        const body = JSON.parse(opts.body);
        expect(Array.isArray(body.items)).toBe(true);
        const item = body.items[0];
        // Item map sang snake_case whitelisted theo QuoteItemDto. configParams (camelCase)
        // được gói trong `printing_detail` để khỏi vướng ValidationPipe(forbidNonWhitelisted)
        // ở backend; KHÔNG spread thẳng lên cấp gốc (xem mapItem trong page.tsx).
        expect(item).toHaveProperty('product_name', 'Tờ rơi A5');
        expect(item).toHaveProperty('item_total', 100000);
        expect(item).toHaveProperty('quantity', 100);
        expect(item).toHaveProperty('printing_detail.configParams.width', 148);
        // KHÔNG spread cấu hình camelCase lên gốc, KHÔNG bọc trong config_params/calculation_details.
        expect(item).not.toHaveProperty('width');
        expect(item).not.toHaveProperty('config_params');
        expect(item).not.toHaveProperty('calculation_details');

        await waitFor(() =>
            expect(mockPush).toHaveBeenCalledWith('/pricing/quotes'),
        );
        expect(mockToastShow).toHaveBeenCalledWith('success', expect.any(String));
    });

    it('hiển thị toast lỗi và KHÔNG điều hướng khi fetch thất bại (res.ok=false)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 400,
            json: async () => ({ message: 'Dữ liệu không hợp lệ' }),
        });

        seedCartItem();
        render(<NewQuotePage />);
        typeCustomerName('Anh Minh');

        fireEvent.click(getSaveButton());

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
        await waitFor(() =>
            expect(mockToastShow).toHaveBeenCalledWith('error', expect.any(String)),
        );
        expect(mockPush).not.toHaveBeenCalled();
    });
});
