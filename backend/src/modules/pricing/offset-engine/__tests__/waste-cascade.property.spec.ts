import fc from 'fast-check';
import { cascade, cascadeProduct, qtyOf, StageWaste } from '../waste-cascade';

/**
 * Property tests cho lõi bù hao theo công đoạn (cascade).
 * Feature: offset-waste-model, cascade core.
 */

const arbStage = (basis: 'sheet' | 'piece') =>
    fc.record({
        code: fc.string({ minLength: 1, maxLength: 6 }),
        basis: fc.constant(basis),
        makeready: fc.integer({ min: 0, max: 500 }),
        rate: fc.double({ min: 0, max: 0.5, noNaN: true }),
    }) as fc.Arbitrary<StageWaste>;

const arbStages = (basis: 'sheet' | 'piece') => fc.array(arbStage(basis), { minLength: 0, maxLength: 6 });

describe('waste-cascade — property', () => {
    it('Property 1: qtyIn ≥ qtyOut ở mọi công đoạn (bù hao không bao giờ âm)', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 1_000_000 }), arbStages('piece'), (good, stages) => {
                const r = cascade(good, stages);
                for (const s of r.stages) {
                    expect(s.qtyIn).toBeGreaterThanOrEqual(s.qtyOut);
                    expect(s.waste).toBe(s.qtyIn - s.qtyOut);
                }
            }),
            { numRuns: 200 },
        );
    });

    it('Property 2: rate=0 & makeready=0 ⇒ input = good (thoái biến không hao)', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 1_000_000 }),
                fc.array(fc.string({ minLength: 1, maxLength: 4 }), { minLength: 0, maxLength: 6 }),
                (good, codes) => {
                    const stages: StageWaste[] = codes.map((code) => ({ code, basis: 'piece', makeready: 0, rate: 0 }));
                    expect(cascade(good, stages).input).toBe(good);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('Property 3: đơn điệu — tăng rate một công đoạn ⇒ input không giảm', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 100_000 }),
                arbStages('piece').filter((s) => s.length > 0),
                fc.nat(),
                fc.double({ min: 0, max: 0.4, noNaN: true }),
                (good, stages, idxRaw, bump) => {
                    const idx = idxRaw % stages.length;
                    const base = cascade(good, stages).input;
                    const bumped = stages.map((s, i) =>
                        i === idx ? { ...s, rate: Math.min(0.99, s.rate + bump) } : s,
                    );
                    expect(cascade(good, bumped).input).toBeGreaterThanOrEqual(base);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('Property 4: ranh giới piece→sheet — sheetsGross ≥ sheetsNet ≥ ceil(good/soCon)', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 200_000 }),
                fc.integer({ min: 1, max: 64 }),
                arbStages('piece'),
                arbStages('sheet'),
                (good, soCon, pieceStages, sheetStages) => {
                    const r = cascadeProduct(good, soCon, pieceStages, sheetStages);
                    const floor = Math.ceil(good / soCon);
                    expect(r.piecesIntoPress).toBeGreaterThanOrEqual(good);
                    expect(r.sheetsNet).toBeGreaterThanOrEqual(floor);
                    expect(r.sheetsGross).toBeGreaterThanOrEqual(r.sheetsNet);
                },
            ),
            { numRuns: 200 },
        );
    });

    it('Property 5: soCon không hợp lệ ⇒ sheets = 0 (không chia cho 0, không NaN)', () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 10_000 }), fc.constantFrom(0, -1, NaN), (good, soCon) => {
                const r = cascadeProduct(good, soCon as number, [], []);
                expect(r.sheetsNet).toBe(0);
                expect(r.sheetsGross).toBe(0);
                expect(Number.isFinite(r.sheetsGross)).toBe(true);
            }),
            { numRuns: 100 },
        );
    });

    it('ví dụ tài liệu: 1000 hộp, soCon=4, bế/dán/đóng gói + in/cán', () => {
        // pieceStages thứ tự sản xuất: bế → dán → đóng gói
        const piece: StageWaste[] = [
            { code: 'BE', basis: 'piece', makeready: 100, rate: 0.02 },
            { code: 'DAN', basis: 'piece', makeready: 0, rate: 0.03 },
            { code: 'DONGGOI', basis: 'piece', makeready: 0, rate: 0 },
        ];
        // sheetStages thứ tự sản xuất: pha giấy → in → cán
        const sheet: StageWaste[] = [
            { code: 'GIAY', basis: 'sheet', makeready: 0, rate: 0 },
            { code: 'IN', basis: 'sheet', makeready: 200, rate: 0.03 },
            { code: 'CAN', basis: 'sheet', makeready: 0, rate: 0.02 },
        ];
        const r = cascadeProduct(1000, 4, piece, sheet);
        // đóng gói: 1000 (rate 0) → dán: ceil(1000/0.97)=1031 → bế: ceil(1031/0.98)+100=1153
        expect(qtyOf(r.pieceQty, 'DONGGOI')).toBe(1000);
        expect(qtyOf(r.pieceQty, 'DAN')).toBe(1031);
        expect(qtyOf(r.pieceQty, 'BE')).toBe(1153);
        expect(r.piecesIntoPress).toBe(1153);
        // sheetsNet = ceil(1153/4) = 289
        expect(r.sheetsNet).toBe(289);
        // cán: ceil(289/0.98)=295 → in: ceil(295/0.97)+200=505 → giấy nhận 505
        expect(qtyOf(r.sheetQty, 'CAN')).toBe(295);
        expect(qtyOf(r.sheetQty, 'IN')).toBe(505);
        expect(r.sheetsGross).toBe(505);
    });
});
