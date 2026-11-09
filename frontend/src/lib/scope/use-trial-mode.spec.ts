import { groupOffsetLinesForTrial, isDeepConfigRoute } from './use-trial-mode';

describe('use-trial-mode helpers', () => {
    it('identifies deep configuration routes that should be hidden in Trial Mode', () => {
        expect(isDeepConfigRoute('/pricing/settings/offset-materials')).toBe(true);
        expect(isDeepConfigRoute('/pricing/settings/waste-stages')).toBe(true);
        expect(isDeepConfigRoute('/pricing/settings/offset-fees')).toBe(true);
        expect(isDeepConfigRoute('/pricing/settings/pricing-markup')).toBe(true);
        expect(isDeepConfigRoute('/pricing/quotes')).toBe(false);
        expect(isDeepConfigRoute('/pricing/products')).toBe(false);
    });

    it('groups 12 detailed offset cost lines into 3 summary buckets without losing total sum', () => {
        const rawLines = [
            { label: 'Chi phí giấy', amount: 1500000 },
            { label: 'Làm kẽm', amount: 320000 },
            { label: 'Lên bài', amount: 200000 },
            { label: 'In (chạy máy)', amount: 450000 },
            { label: 'Vật tư bề mặt', amount: 180000 },
            { label: 'Xử lý bề mặt (XLBM)', amount: 250000 },
            { label: 'Chi phí khuôn', amount: 300000 },
            { label: 'Chi phí bế', amount: 150000 },
            { label: 'Chi phí cấn', amount: 0 },
            { label: 'Chi phí dán', amount: 220000 },
            { label: 'Thiết kế', amount: 100000 },
        ];

        const grouped = groupOffsetLinesForTrial(rawLines);
        expect(grouped).toEqual([
            { label: 'Vật tư giấy & Bản in', amount: 1500000 + 320000 + 180000 },
            { label: 'In ấn & Chạy máy', amount: 200000 + 450000 + 100000 },
            { label: 'Gia công & Thành phẩm', amount: 250000 + 300000 + 150000 + 220000 },
        ]);

        const rawSum = rawLines.reduce((s, l) => s + l.amount, 0);
        const groupedSum = grouped.reduce((s, l) => s + l.amount, 0);
        expect(groupedSum).toBe(rawSum);
    });
});
