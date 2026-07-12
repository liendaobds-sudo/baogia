import { tierPricePerSheet, isCostDrift } from './tier-cost';

describe('tier-cost helper', () => {
    describe('tierPricePerSheet', () => {
        it('cộng giấy + mực', () => {
            expect(tierPricePerSheet(2000, 500)).toBe(2500);
        });
        it('coi null/undefined như 0', () => {
            expect(tierPricePerSheet(undefined as any, 500)).toBe(500);
            expect(tierPricePerSheet(2000, undefined as any)).toBe(2000);
            expect(tierPricePerSheet(undefined as any, undefined as any)).toBe(0);
        });
        it('ép chuỗi số về number', () => {
            expect(tierPricePerSheet('1500' as any, '300' as any)).toBe(1800);
        });
    });

    describe('isCostDrift', () => {
        it('không lệch khi paper_cost = cost_price', () => {
            expect(isCostDrift(2000, 2000)).toBe(false);
        });
        it('lệch khi cost_price mới khác paper_cost', () => {
            expect(isCostDrift(2200, 2000)).toBe(true);
        });
        it('không lệch khi thiếu dữ liệu (null)', () => {
            expect(isCostDrift(null, 2000)).toBe(false);
            expect(isCostDrift(2000, null)).toBe(false);
        });
        it('không lệch khi cost_price hiện tại <= 0 (chưa có giá vốn)', () => {
            expect(isCostDrift(0, 2000)).toBe(false);
        });
        it('so ở mức 2 chữ số thập phân (khớp weighted-avg)', () => {
            expect(isCostDrift(2000.004, 2000)).toBe(false); // làm tròn về nhau
            expect(isCostDrift(2000.01, 2000)).toBe(true);
        });
    });
});
