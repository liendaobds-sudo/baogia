import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '@/lib/ui/toast';
import ChatHeader from './ChatHeader';
import type { Conversation } from '../types';

const conv = {
    id: 'c1', status: 'new', priority: 'normal',
    lastMessageAt: new Date().toISOString(), slaDeadline: '', slaBreached: false,
    contact: { displayName: 'Anh Tuấn', avatarUrl: '' },
} as unknown as Conversation;

function renderHeader(props: Partial<React.ComponentProps<typeof ChatHeader>> = {}) {
    return render(
        <ToastProvider>
            <ChatHeader
                selectedConversation={conv}
                isSearchVisible={false}
                onToggleSearch={jest.fn()}
                {...props}
            />
        </ToastProvider>,
    );
}

/**
 * Nút "Quay lại" (Bố_Cục_Hẹp) có aria-label + kích hoạt bằng Enter/Space.
 * Validates: Requirements 2.3, 5.1
 */
describe('ChatHeader — nút Quay lại (narrow)', () => {
    it('KHÔNG hiện nút back khi showBackButton=false', () => {
        renderHeader({ showBackButton: false });
        expect(screen.queryByRole('button', { name: /Quay lại danh sách/ })).not.toBeInTheDocument();
    });

    it('hiện nút back + gọi onBack khi click và khi nhấn Enter/Space', () => {
        const onBack = jest.fn();
        renderHeader({ showBackButton: true, onBack });
        const btn = screen.getByRole('button', { name: /Quay lại danh sách/ });
        expect(btn).toBeInTheDocument();
        fireEvent.click(btn);
        fireEvent.keyDown(btn, { key: 'Enter' });
        fireEvent.keyDown(btn, { key: ' ' });
        expect(onBack).toHaveBeenCalledTimes(3);
    });
});
