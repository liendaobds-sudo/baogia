import { fetchQuoteMaterials } from './fetchQuoteMaterials';
import { api } from './apiClient';

jest.mock('./apiClient', () => ({
    api: { get: jest.fn() },
}));

const mockGet = api.get as jest.Mock;

describe('fetchQuoteMaterials', () => {
    beforeEach(() => mockGet.mockReset());

    it('gọi ĐÚNG tổ hợp scope × category (mỗi request mang cả scope lẫn category)', async () => {
        mockGet.mockResolvedValue({ success: true, data: [] });

        await fetchQuoteMaterials(['loose', 'bound'], ['substrate_sheet']);

        const urls = mockGet.mock.calls.map((c) => c[0]).sort();
        expect(urls).toEqual([
            '/erp/materials?scope=bound&category=substrate_sheet',
            '/erp/materials?scope=loose&category=substrate_sheet',
        ]);
    });

    it('mặc định lấy cả tấm phẳng + cuộn khi không truyền category', async () => {
        mockGet.mockResolvedValue({ success: true, data: [] });

        await fetchQuoteMaterials(['large_format']);

        const urls = mockGet.mock.calls.map((c) => c[0]).sort();
        expect(urls).toEqual([
            '/erp/materials?scope=large_format&category=substrate_roll',
            '/erp/materials?scope=large_format&category=substrate_sheet',
        ]);
    });

    it('hợp nhất theo id — vật tư trùng ở nhiều scope chỉ xuất hiện một lần', async () => {
        // loose trả [1,2]; bound trả [2,3] → union {1,2,3}
        mockGet
            .mockResolvedValueOnce({ success: true, data: [{ id: 1 }, { id: 2 }] })
            .mockResolvedValueOnce({ success: true, data: [{ id: 2 }, { id: 3 }] });

        const out = await fetchQuoteMaterials(['loose', 'bound'], ['substrate_sheet']);

        expect(out.map((m) => m.id).sort()).toEqual([1, 2, 3]);
    });

    it('chịu được response thiếu data (không ném)', async () => {
        mockGet.mockResolvedValue({ success: false });

        const out = await fetchQuoteMaterials(['loose'], ['substrate_sheet']);

        expect(out).toEqual([]);
    });
});
