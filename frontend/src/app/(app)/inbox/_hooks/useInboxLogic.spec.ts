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
});
