import { refreshAuthSession } from './auth-refresh';

describe('refreshAuthSession', () => {
    const fetchMock = jest.fn();

    beforeEach(() => {
        localStorage.clear();
        fetchMock.mockReset();
        Object.defineProperty(globalThis, 'fetch', {
            configurable: true,
            writable: true,
            value: fetchMock,
        });
    });

    it('single-flight: nhiều caller dùng chung đúng một refresh request', async () => {
        localStorage.setItem('zh_refresh_token', 'refresh-old');
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        fetchMock.mockImplementation(async () => {
            await gate;
            return {
                ok: true,
                json: async () => ({
                    accessToken: 'access-new',
                    refreshToken: 'refresh-new',
                    expiresIn: 3600,
                }),
            } as Response;
        });

        const first = refreshAuthSession('http://api.test');
        const second = refreshAuthSession('http://api.test');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        release();
        await expect(Promise.all([first, second])).resolves.toEqual([
            expect.objectContaining({ accessToken: 'access-new' }),
            expect.objectContaining({ accessToken: 'access-new' }),
        ]);
        expect(localStorage.getItem('zh_refresh_token')).toBe('refresh-new');
    });

    it('không hồi sinh session nếu refresh token bị xóa khi request đang chạy', async () => {
        localStorage.setItem('zh_refresh_token', 'refresh-old');
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        fetchMock.mockImplementation(async () => {
            await gate;
            return {
                ok: true,
                json: async () => ({
                    accessToken: 'access-stale',
                    refreshToken: 'refresh-stale',
                }),
            } as Response;
        });

        const pending = refreshAuthSession('http://api.test');
        localStorage.clear();
        release();

        await expect(pending).resolves.toBeNull();
        expect(localStorage.getItem('zh_token')).toBeNull();
        expect(localStorage.getItem('zh_refresh_token')).toBeNull();
    });
});
