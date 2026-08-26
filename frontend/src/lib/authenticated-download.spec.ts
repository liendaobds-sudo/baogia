import { downloadAuthenticatedFile } from './authenticated-download';

describe('downloadAuthenticatedFile', () => {
    it('dùng authFetch, Blob URL và filename từ response', async () => {
        const blob = new Blob(['a,b\n1,2'], { type: 'text/csv' });
        const authFetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            blob: async () => blob,
            headers: new Headers({
                'Content-Disposition': 'attachment; filename="contacts.csv"',
            }),
        } as Response);
        const createObjectURL = jest.fn().mockReturnValue('blob:test');
        const revokeObjectURL = jest.fn();
        Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        await downloadAuthenticatedFile(authFetch, 'http://api.test/contacts/export/csv', 'fallback.csv');

        expect(authFetch).toHaveBeenCalledWith(
            'http://api.test/contacts/export/csv',
            expect.objectContaining({ method: 'GET' }),
        );
        expect(click).toHaveBeenCalledTimes(1);
        expect(createObjectURL).toHaveBeenCalledWith(blob);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
        click.mockRestore();
    });

    it('không tạo download khi server trả non-2xx', async () => {
        const authFetch = jest.fn().mockResolvedValue({ ok: false, status: 403 } as Response);
        await expect(downloadAuthenticatedFile(
            authFetch,
            'http://api.test/reports/export/csv',
            'report.csv',
        )).rejects.toThrow('HTTP 403');
    });
});
