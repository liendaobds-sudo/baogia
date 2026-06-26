import { flatDielineSize, generateDieline, SUPPORTED_BOX_TYPES, BoxType } from '../flat-dieline';
import { nestOnSheet } from '../nesting';

describe('flatDielineSize — khổ trải khuôn bế', () => {
    it('mọi loại hộp hỗ trợ đều sinh được khổ trải dương', () => {
        for (const boxType of SUPPORTED_BOX_TYPES) {
            const r = flatDielineSize({ boxType, L: 100, W: 60, D: 150 });
            expect(r.widthMm).toBeGreaterThan(0);
            expect(r.heightMm).toBeGreaterThan(0);
            expect(r.widthCm).toBeCloseTo(r.widthMm / 10, 2);
            expect(r.heightCm).toBeCloseTo(r.heightMm / 10, 2);
        }
    });

    it('RTE: khổ trải LỚN HƠN footprint danh nghĩa (gồm tai/nắp/mép keo)', () => {
        const L = 100, W = 60, D = 200;
        const r = flatDielineSize({ boxType: 'rte', L, W, D });
        // Trải ngang ≈ 2L + 2W + mép keo → lớn hơn 1 mặt L.
        expect(r.widthMm).toBeGreaterThan(2 * (L + W));
        // Trải dọc ≈ D + nắp gài + tai bụi → lớn hơn D.
        expect(r.heightMm).toBeGreaterThan(D);
    });

    it('hộp lớn hơn → khổ trải lớn hơn (đơn điệu)', () => {
        const nho = flatDielineSize({ boxType: 'rte', L: 80, W: 50, D: 120 });
        const lon = flatDielineSize({ boxType: 'rte', L: 160, W: 100, D: 240 });
        expect(lon.widthMm).toBeGreaterThan(nho.widthMm);
        expect(lon.heightMm).toBeGreaterThan(nho.heightMm);
    });

    it('loại hộp không hỗ trợ → ném lỗi rõ', () => {
        expect(() => generateDieline({ boxType: 'unknown' as BoxType })).toThrow(/không hỗ trợ/);
    });

    it('trả standardCode và warnings (mảng)', () => {
        const r = flatDielineSize({ boxType: 'rte', L: 100, W: 60, D: 200 });
        expect(typeof r.standardCode).toBe('string');
        expect(Array.isArray(r.warnings)).toBe(true);
    });
});

describe('nestOnSheet — dàn khuôn lên khổ in', () => {
    it('trả số con/tờ dương + vị trí từng khuôn + bbox cho hộp lọt khổ', () => {
        const r = nestOnSheet({ boxType: 'rte', L: 80, W: 50, D: 120 }, 790, 1090);
        expect(r.countPerSheet).toBeGreaterThan(0);
        expect(r.positions.length).toBe(r.countPerSheet);
        expect(r.bbox.width).toBeGreaterThan(0);
        expect(r.utilization).toBeGreaterThan(0);
        // mỗi vị trí có toạ độ + góc xoay hợp lệ
        for (const p of r.positions) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect([0, 90, 180, 270]).toContain(p.rotation);
        }
    });

    it('khổ lớn hơn chứa nhiều con hơn khổ nhỏ', () => {
        const small = nestOnSheet({ boxType: 'rte', L: 80, W: 50, D: 120 }, 430, 650);
        const big = nestOnSheet({ boxType: 'rte', L: 80, W: 50, D: 120 }, 790, 1090);
        expect(big.countPerSheet).toBeGreaterThanOrEqual(small.countPerSheet);
    });

    it('hộp quá lớn so với khổ → 0 con', () => {
        const r = nestOnSheet({ boxType: 'rte', L: 2000, W: 2000, D: 2000 }, 430, 650);
        expect(r.countPerSheet).toBe(0);
    });
});
