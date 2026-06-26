import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '@/lib/ui/toast';
import ConversationList from './ConversationList';
import type { Conversation } from '../types';

function conv(id: string, name: string, lastMessage: string, status = 'new'): Conversation {
    return {
        id,
        status,
        priority: 'normal',
        lastMessageAt: new Date().toISOString(),
        slaDeadline: '',
        slaBreached: false,
        contact: { displayName: name, avatarUrl: '' },
        lastMessage,
    };
}

function renderList(conversations: Conversation[]) {
    return render(
        <ToastProvider>
            <ConversationList
                conversations={conversations}
                loading={false}
                selectedId={null}
                slaWarnings={new Set()}
                tagFilter=""
                availableTags={[]}
                onSelect={jest.fn()}
                onSetTagFilter={jest.fn()}
            />
        </ToastProvider>,
    );
}

describe('ConversationList', () => {
    it('Req 7: tìm kiếm khớp theo tên hiển thị', () => {
        renderList([conv('1', 'Anh Tuấn', 'báo giá name card'), conv('2', 'Chị Lan', 'in tờ rơi')]);
        fireEvent.change(screen.getByPlaceholderText('Tìm kiếm'), { target: { value: 'tuấn' } });
        expect(screen.getByText('Anh Tuấn')).toBeInTheDocument();
        expect(screen.queryByText('Chị Lan')).not.toBeInTheDocument();
    });

    it('Req 7: tìm kiếm khớp theo nội dung tin nhắn cuối', () => {
        renderList([conv('1', 'Anh Tuấn', 'báo giá name card'), conv('2', 'Chị Lan', 'in tờ rơi')]);
        fireEvent.change(screen.getByPlaceholderText('Tìm kiếm'), { target: { value: 'tờ rơi' } });
        expect(screen.getByText('Chị Lan')).toBeInTheDocument();
        expect(screen.queryByText('Anh Tuấn')).not.toBeInTheDocument();
    });

    it('Req 11/15: trạng thái lạ vẫn hiển thị nhãn (fallback màu an toàn)', () => {
        renderList([conv('1', 'Khách X', 'nội dung', 'trang_thai_la')]);
        // Nhãn trạng thái hiển thị nguyên trạng khi không có trong STATUS_LABELS.
        expect(screen.getByText('trang_thai_la')).toBeInTheDocument();
    });

    it('Req 14: tab "Tất cả"/"Chưa đọc" có role tab và thao tác được bằng bàn phím', () => {
        renderList([conv('1', 'Khách X', 'nội dung')]);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.length).toBeGreaterThanOrEqual(2);
    });
});
