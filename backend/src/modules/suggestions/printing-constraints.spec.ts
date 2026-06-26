import { checkPrintingConstraints } from './printing-constraints';

describe('PrintingConstraints', () => {
    describe('checkPrintingConstraints', () => {
        // ── Material Rules ──
        it('should warn kraft + full color photo', () => {
            const w = checkPrintingConstraints('', 'in ảnh full color trên kraft', undefined);
            expect(w.length).toBeGreaterThan(0);
            expect(w[0]).toContain('kraft');
        });

        it('should warn offset + full color photo', () => {
            const w = checkPrintingConstraints('', 'in ảnh trên giấy offset', undefined);
            expect(w.length).toBeGreaterThan(0);
            expect(w[0]).toContain('offset');
        });

        it('should NOT warn couche + photo', () => {
            const w = checkPrintingConstraints('', 'in ảnh trên couche 300gsm', undefined);
            expect(w).toHaveLength(0);
        });

        // ── Decal ──
        it('should warn decal + 2 sides', () => {
            const w = checkPrintingConstraints('in 2 mặt', 'decal in 2 mặt', { product: 'decal' });
            expect(w.some(x => x.includes('1 mặt'))).toBe(true);
        });

        // ── Banner ──
        it('should warn banner + lamination', () => {
            const w = checkPrintingConstraints('cán mờ', 'banner cán mờ', { product: 'banner' });
            expect(w.some(x => x.includes('cán màng'))).toBe(true);
        });

        it('should NOT warn standee + lamination', () => {
            const w = checkPrintingConstraints('standee pp cán mờ', 'standee cán mờ', { product: 'standee' });
            expect(w.filter(x => x.includes('cán màng'))).toHaveLength(0);
        });

        it('should warn banner + 2 sides', () => {
            const w = checkPrintingConstraints('in 2 mặt', 'banner in 2 mặt', { product: 'banner' });
            expect(w.some(x => x.includes('1 mặt'))).toBe(true);
        });

        // ── Catalogue ──
        it('should warn catalogue saddle stitch with non-multiple-of-4 pages', () => {
            const w = checkPrintingConstraints('đóng ghim', 'catalogue 22 trang đóng ghim', { product: 'catalogue' });
            expect(w.some(x => x.includes('chia hết cho 4'))).toBe(true);
        });

        it('should NOT warn catalogue saddle stitch with 24 pages', () => {
            const w = checkPrintingConstraints('đóng ghim', 'catalogue 24 trang đóng ghim', { product: 'catalogue' });
            expect(w.filter(x => x.includes('chia hết cho 4'))).toHaveLength(0);
        });

        // ── UV Spot + Glossy Lamination ──
        it('should warn spot UV on gloss lamination', () => {
            const w = checkPrintingConstraints('cán bóng uv cục bộ', 'namecard cán bóng uv cục bộ', undefined);
            expect(w.some(x => x.includes('tương phản'))).toBe(true);
        });

        // ── Lamination + Writing ──
        it('should warn lamination + writing', () => {
            const w = checkPrintingConstraints('cán mờ', 'phiếu bảo hành cán mờ cần viết bút bi', undefined);
            expect(w.some(x => x.includes('bút bi'))).toBe(true);
        });

        // ── No issues ──
        it('should return empty for normal request', () => {
            const w = checkPrintingConstraints('', 'in 500 namecard couche 300gsm cán mờ', { product: 'namecard' });
            expect(w).toHaveLength(0);
        });
    });
});
