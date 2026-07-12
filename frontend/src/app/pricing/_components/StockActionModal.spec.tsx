/**
 * Component test cho `StockActionModal` (tầng 1 — nhập kho / quy đổi / bình quân gia quyền).
 *
 * Rủi ro tiền bạc: đây là nơi giá vốn (cost_price) được sinh ra. Quy đổi đơn vị mua → đơn vị
 * cơ sở sai, hoặc bình quân gia quyền lệch, thì SAI TOÀN CHUỖI (tầng 2 đồng bộ, tầng 3 suy giá).
 * Preview client-side phải khớp công thức backend (computeConversionFactor / weightedAvgCost).
 *
 * Component là CONTROLLED (nhận stockForm + setStockForm từ parent) → test bọc wrapper stateful.
 */

import '@testing-library/jest-dom';
import React, { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StockActionModal from './StockActionModal';

// Form khởi tạo giống parent (materials/page.tsx).
const initForm = {
    quantity: 0, cost_price: 0, reference: '', notes: '', reason: 'production',
    adjustment_type: 'set', purchase_unit: '', purchase_qty: 0, conversion_factor: 0,
};

// Wrapper stateful: StockActionModal controlled → cần state thật để fireEvent cập nhật.
function Harness({ action }: { action: any }) {
    const [stockForm, setStockForm] = useState(initForm);
    return (
        <StockActionModal
            action={action}
            onClose={() => {}}
            onSubmit={() => {}}
            stockForm={stockForm}
            setStockForm={setStockForm}
        />
    );
}

// Vật tư dạng TỜ (sheet-like): giấy Couche, tồn 500 tờ, giá vốn cũ 2000đ/tờ.
const SHEET_MAT = {
    id: 1, name: 'Couche 200', material_format: 'sheet',
    stock: 500, cost_price: 2000, gsm: 200, width: 650, height: 860,
};
// Vật tư dạng CUỘN (roll-like): bạt, tồn theo m².
const ROLL_MAT = {
    id: 2, name: 'Bạt Hiflex', material_format: 'roll',
    stock: 100, cost_price: 50000, roll_width: 1.5, roll_length: 50,
};

describe('StockActionModal — quy đổi + bình quân gia quyền (tầng 1)', () => {
    it('action null → không render gì', () => {
        const { container } = render(<Harness action={null} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('nhập RAM: quy đổi 1 ram × 500 = 500 tờ, bình quân gia quyền đúng', () => {
        render(<Harness action={{ type: 'import', material: SHEET_MAT }} />);

        // Chọn đơn vị mua = Ram (500 tờ).
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ram' } });
        // Input số không có label liên kết → lấy theo thứ tự spinbutton: [0]=SL mua, [1]=giá.
        const nums = () => screen.getAllByRole('spinbutton');
        fireEvent.change(nums()[0], { target: { value: '1' } });
        fireEvent.change(nums()[1], { target: { value: '500000' } });

        // Quy đổi: 1 Ram → 500 tờ.
        expect(screen.getByText(/1 Ram → 500 tờ/)).toBeInTheDocument();
        // Giá vốn lô = 500.000 / 500 = 1.000 đ/tờ.
        const loRow = screen.getByText(/Giá vốn lô:/).closest('div')!;
        expect(within(loRow).getByText(/1\.000 đ\/tờ/)).toBeInTheDocument();
        // Bình quân = (2000×500 + 1000×500) / 1000 = 1.500 đ/tờ.
        const avgRow = screen.getByText(/Giá vốn mới \(bình quân\):/).closest('div')!;
        expect(within(avgRow).getByText(/1\.500 đ\/tờ/)).toBeInTheDocument();
        // Tồn sau nhập = 500 + 500 = 1.000 tờ.
        const tonRow = screen.getByText(/Tồn sau nhập:/).closest('div')!;
        expect(within(tonRow).getByText(/1\.000 tờ/)).toBeInTheDocument();
    });

    it('nhập RAM sửa hệ số tay (400 tờ/ram) → quy đổi theo hệ số override', () => {
        render(<Harness action={{ type: 'import', material: SHEET_MAT }} />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ram' } });
        fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1' } });
        // Ô "Số tờ / ram" chỉ hiện với ram → input số thứ 3 (sau SL mua, giá).
        fireEvent.change(screen.getAllByRole('spinbutton')[2], { target: { value: '400' } });
        expect(screen.getByText(/1 Ram → 400 tờ/)).toBeInTheDocument();
    });

    it('nhập KG thiếu gsm/khổ → hiện lỗi, KHÔNG cho preview', () => {
        const noGsm = { ...SHEET_MAT, gsm: 0 };
        render(<Harness action={{ type: 'import', material: noGsm }} />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'kg' } });
        fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '10' } });
        expect(screen.getByText(/Cần gsm \+ khổ tờ để quy đổi kg → tờ/)).toBeInTheDocument();
    });

    it('nhập CUỘN → m²: 2 cuộn × (1.5 × 50) = 150 m²', () => {
        render(<Harness action={{ type: 'import', material: ROLL_MAT }} />);
        // Roll-like: đơn vị mua có "Cuộn".
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'roll' } });
        fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '2' } });
        // factor = rollWidth × rollLength = 1.5 × 50 = 75; 2 cuộn → 150 m².
        expect(screen.getByText(/2 Cuộn → 150 m²/)).toBeInTheDocument();
    });

    it('nút submit disabled khi chưa nhập số lượng mua', () => {
        render(<Harness action={{ type: 'import', material: SHEET_MAT }} />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ram' } });
        // Chưa nhập purchase_qty → canSubmitBatch = false.
        const submitBtn = screen.getByRole('button', { name: /Nhập kho/ });
        expect(submitBtn).toBeDisabled();
    });

    it('XUẤT kho: form theo đơn vị cơ sở, hiện tồn tối đa', () => {
        render(<Harness action={{ type: 'export', material: SHEET_MAT }} />);
        // Không có form nhập lô; có nhãn "Số lượng (tờ)" + "Tối đa: 500".
        expect(screen.getByText(/Số lượng \(tờ\)/)).toBeInTheDocument();
        expect(screen.getByText(/Tối đa: 500/)).toBeInTheDocument();
    });
});
