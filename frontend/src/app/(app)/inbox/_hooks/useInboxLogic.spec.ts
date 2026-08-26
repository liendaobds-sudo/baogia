import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ToastApi } from '@/lib/ui/toast';

// Mock socket-context để hook không cần kết nối thật.
jest.mock('@/lib/socket-context', () => ({
    useSocket: () => ({ socket: null, joinConversation: jest.fn(), leaveConversation: jest.fn() }),
}));

import { useInboxLogic } from './useInboxLogic';

function makeWrapper(qc: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        return React.createElement(QueryClientProvider, { client: qc }, children);
    };
}

describe('useInboxLogic — báo lỗi & rollback', () => {
    it('Req 1: addNote thất bại → toast.show("error") + console.error', async () => {
        const qc = new QueryClient();
        const toast: ToastApi = { show: jest.fn() };
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const authFetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

        const { result } = renderHook(
            () => useInboxLogic('tok', authFetch as any, toast),
            { wrapper: makeWrapper(qc) },
        );

        await act(async () => {
            await result.current.actions.addNote('conv-1', 'ghi chú');
        });

        expect(toast.show).toHaveBeenCalledWith('error', expect.any(String));
        errSpy.mockRestore();
    });

    it('Req 2: toggleTag thất bại → rollback cache về trạng thái ban đầu + toast error', async () => {
        const qc = new QueryClient();
        const initial = [{ id: 'c1', status: 'new', priority: 'normal', tags: [] as string[] }];
        qc.setQueryData(['conversations', ''], initial);

        const toast: ToastApi = { show: jest.fn() };
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const authFetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

        const { result } = renderHook(
            () => useInboxLogic('tok', authFetch as any, toast),
            { wrapper: makeWrapper(qc) },
        );

        await act(async () => {
            await result.current.actions.toggleTag('c1', 'báo_giá', true);
        });

        await waitFor(() => expect(toast.show).toHaveBeenCalledWith('error', expect.any(String)));
        // Cache đã được khôi phục: thẻ vừa thêm optimistic bị gỡ bỏ.
        const after = qc.getQueryData(['conversations', '']) as typeof initial;
        expect(after[0].tags).toEqual([]);
        errSpy.mockRestore();
    });

    it('không đặt suggestion status=sent khi endpoint accept trả non-2xx', async () => {
        localStorage.setItem('last_chat_id', 'conv-1');
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        qc.setQueryData(['suggestions', 'conv-1'], [{
            id: 'sug-1',
            status: 'generated',
            replies: [{ text: 'A' }],
        }]);
        const toast: ToastApi = { show: jest.fn() };
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const authFetch = jest.fn(async (url: string) => {
            if (url.endsWith('/suggestions/sug-1/accept')) {
                return { ok: false, status: 500, json: async () => ({}) } as Response;
            }
            if (url.includes('/suggestions/conversation/')) {
                return { ok: true, status: 200, json: async () => qc.getQueryData(['suggestions', 'conv-1']) } as Response;
            }
            return { ok: true, status: 200, json: async () => ({ data: [] }) } as Response;
        });

        const { result } = renderHook(
            () => useInboxLogic('tok', authFetch, toast),
            { wrapper: makeWrapper(qc) },
        );

        await act(async () => {
            await result.current.actions.markSuggestionSent('sug-1', 0, 1);
        });

        const suggestion = (qc.getQueryData(['suggestions', 'conv-1']) as any[])[0];
        expect(suggestion.status).toBe('generated');
        expect(toast.show).toHaveBeenCalledWith('error', expect.any(String));
        errSpy.mockRestore();
        localStorage.removeItem('last_chat_id');
    });
});
