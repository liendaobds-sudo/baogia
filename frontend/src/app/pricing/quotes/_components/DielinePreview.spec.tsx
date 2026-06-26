import '@testing-library/jest-dom';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockPost = jest.fn();
jest.mock('../../_components/apiClient', () => ({
    api: { post: (...args: any[]) => mockPost(...args) },
}));

import DielinePreview from './DielinePreview';

const SAMPLE = {
    boxType: 'rte',
    flat: { widthCm: 27.5, heightCm: 25, standardCode: 'ECMA-A20.20', warnings: [] },
    bbox: { minX: 0, minY: 0, maxX: 275, maxY: 250, width: 275, height: 250 },
    contourD: 'M 0 0 L 275 0 L 275 250 L 0 250 Z',
    config: { margin: { top: 10, right: 10, bottom: 10, left: 10 }, gripperMargin: 12 },
    paths: [
        { tag: 'CUT', type: 'line', points: [{ x: 0, y: 0 }, { x: 275, y: 0 }] },
        { tag: 'CREASE', type: 'line', points: [{ x: 0, y: 125 }, { x: 275, y: 125 }] },
    ],
    sheets: [
        { khoIn: '28cm x 60cm', khoGiayLon: '84cm x 120cm', sheetWmm: 280, sheetHmm: 600, countPerSheet: 12, utilization: 72.5, label: 'Xen kẽ', positions: [{ x: 10, y: 10, rotation: 0 }, { x: 150, y: 10, rotation: 180 }] },
        { khoIn: '52cm x 72cm', khoGiayLon: '79cm x 109cm', sheetWmm: 520, sheetHmm: 720, countPerSheet: 8, utilization: 60, label: 'Grid 0°', positions: [{ x: 10, y: 10, rotation: 0 }] },
    ],
};

describe('DielinePreview', () => {
    beforeEach(() => { mockPost.mockReset(); });

    it('không render khi chưa chọn boxType', () => {
        const { container } = render(<DielinePreview rong={8} hong={4} cao={10} />);
        expect(container).toBeEmptyDOMElement();
        expect(mockPost).not.toHaveBeenCalled();
    });

    it('gọi API và hiển thị khổ trải + số con + dàn khổ khi có boxType + kích thước', async () => {
        mockPost.mockResolvedValue({ success: true, data: SAMPLE });
        render(<DielinePreview boxType="rte" rong={8} hong={4} cao={10} />);

        await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/pricing/offset/dieline', { boxType: 'rte', rong: 8, hong: 4, cao: 10, T: undefined, nestMode: 'smart' }));
        await screen.findByText(/27\.5×25cm/);
        // Số con/tờ của khổ tốt nhất (12) hiện trên nhãn tab "Xếp khuôn"
        await screen.findByText(/12 con\/tờ/);
        // Mở tab Xếp khuôn → hiện nút chọn khổ (theo khổ in)
        fireEvent.click(screen.getByRole('button', { name: /Xếp khuôn/ }));
        expect(screen.getByText(/28cm x 60cm/)).toBeInTheDocument();
    });

    it('hiển thị lỗi khi API trả success=false', async () => {
        mockPost.mockResolvedValue({ success: false, error: 'Loại hộp không hợp lệ' });
        render(<DielinePreview boxType="rte" rong={8} hong={4} cao={10} />);
        await screen.findByText('Loại hộp không hợp lệ');
    });
});
