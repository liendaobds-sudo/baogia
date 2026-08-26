import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PriceComparator } from './PriceComparator';
import { useQuoteCart } from '../_store/useQuoteCart';

const toastShow = jest.fn();

jest.mock('@/lib/api', () => ({ API_URL: 'http://api.test' }));
jest.mock('@/lib/ui/toast', () => ({
    useToast: () => ({ show: toastShow }),
}));

describe('PriceComparator — contract kích thước Specification', () => {
    beforeEach(() => {
        useQuoteCart.setState(useQuoteCart.getInitialState(), true);
        toastShow.mockClear();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                unitId: 'default',
                product: { code: 'card', quoteType: 'loose' },
                quantity: 1000,
                vatRatePercent: 10,
                comparison: { mode: 'none', results: [], excluded: [] },
                vat: {
                    sumPriceBeforeVat: 0,
                    vatRatePercent: 10,
                    vatAmount: 0,
                    grandTotal: 0,
                },
                breakEven: [],
            }),
        } as Response);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('gửi số đo người dùng nhập theo cm, để plugin đổi sang đơn vị engine', async () => {
        render(
            <PriceComparator
                token="t"
                productCode="card"
                quoteType="loose"
                productName="Danh thiếp"
                methods={['digital']}
                onBack={() => {}}
            />,
        );

        const widthInput = screen.getByText('Rộng (cm)').parentElement?.querySelector('input');
        const heightInput = screen.getByText('Cao (cm)').parentElement?.querySelector('input');
        expect(widthInput).not.toBeNull();
        expect(heightInput).not.toBeNull();
        fireEvent.change(widthInput as HTMLInputElement, { target: { value: '9' } });
        fireEvent.change(heightInput as HTMLInputElement, { target: { value: '5.4' } });

        fireEvent.click(screen.getByRole('button', { name: /so sánh giá/i }));

        await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
        const [, init] = (global.fetch as jest.Mock).mock.calls[0];
        const body = JSON.parse(String(init.body));
        expect(body.spec.dimensions).toEqual({ width: 9, height: 5.4 });
    });
});
