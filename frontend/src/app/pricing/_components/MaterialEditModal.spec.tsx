/**
 * MaterialEditModal — ô "Giá vốn" phải ghi `unit_price` (field engine offset đọc).
 *
 * BUG (GĐ G): trước đây ô giá chỉ ghi `costPrice`/`cost_price`, engine đọc giá giấy từ
 * `unit_price` ([lookups.ts:26-32]) → giá admin nhập KHÔNG tới engine (dùng giá JSON default).
 * Validation service lại BẮT `unit_price > 0` cho offset → tạo vật tư offset bị chặn.
 *
 * Test render THẬT (không mock modal), gõ vào ô "Giá vốn", khẳng định setForm cập nhật CẢ
 * `unit_price` (engine + validation) LẪN `cost_price` (markup calc) — chúng cùng nghĩa "giá vốn".
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import MaterialEditModal from './MaterialEditModal';

// Wrapper giữ state form thật để quan sát setForm cập nhật field nào.
function Harness({ initial = {} }: { initial?: Record<string, unknown> }) {
    const [form, setForm] = useState<Record<string, unknown>>(initial);
    return (
        <>
            <MaterialEditModal
                isOpen onClose={() => {}} onSave={() => {}}
                form={form} setForm={setForm} editItem={null}
                paperSizes={[]} units={[]}
            />
            <output data-testid="unit_price">{String(form.unit_price ?? '')}</output>
            <output data-testid="cost_price">{String(form.cost_price ?? '')}</output>
        </>
    );
}

// Label và input là sibling (không nối htmlFor/id) → tìm input trong cùng <div> với label.
function giaVonInput(): HTMLInputElement {
    const label = screen.getByText('Giá vốn (VND)');
    const input = label.parentElement?.querySelector('input');
    if (!input) throw new Error('Không tìm thấy ô nhập "Giá vốn"');
    return input as HTMLInputElement;
}

describe('MaterialEditModal — ô Giá vốn ghi unit_price (GĐ G)', () => {
    it('gõ "Giá vốn" → cập nhật CẢ unit_price LẪN cost_price', () => {
        render(<Harness />);
        fireEvent.change(giaVonInput(), { target: { value: '55000' } });
        expect(screen.getByTestId('unit_price')).toHaveTextContent('55000');
        expect(screen.getByTestId('cost_price')).toHaveTextContent('55000');
    });

    it('hiển thị giá trị có sẵn khi sửa vật tư (unit_price)', () => {
        render(<Harness initial={{ unit_price: 42000 }} />);
        expect(giaVonInput()).toHaveValue(42000);
    });
});
