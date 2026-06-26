import fc from 'fast-check';
import { makePricingData } from './fixture';
import { tongHopKetQua } from '../totals';
import { QuoteLine } from '../pricing-data';

const D = makePricingData();

describe('EngineOffset totals (property)', () => {
    it('Feature: offset-pricebook-revamp, Property 8: chiết khấu chỉ trên base SX+TK, có trần; không cộng hao phẳng', () => {
        fc.assert(fc.property(
            fc.array(fc.record({ label: fc.constant('x'), amount: fc.integer({ min: 0, max: 1_000_000 }) }), { maxLength: 6 }),
            fc.integer({ min: 0, max: 2_000_000 }), // baseSXTK
            fc.integer({ min: 1, max: 100000 }),    // sl
            fc.integer({ min: 0, max: 500_000 }),   // wasteInfo (chỉ thông tin)
            fc.double({ min: 0, max: 0.3, noNaN: true }), // chietKhauRate (có thể vượt trần)
            (lines, base, sl, wasteInfo, rate) => {
                const r = tongHopKetQua(lines as QuoteLine[], base, sl, D, wasteInfo, rate);
                const cappedRate = Math.min(rate, D.tyLe.params.TyLe_ChietKhau_Max);
                // chiết khấu = base × rate (đã trần), độc lập tổng dòng chi phí
                expect(r.chietKhau).toBeCloseTo(base * cappedRate, 6);
                // khách trả = tổng gồm VAT - chiết khấu
                expect(r.khachTra).toBeCloseTo(r.tongGomVAT - r.chietKhau, 6);
                // KHÔNG cộng hao phẳng: tổng gồm VAT = tổng chưa VAT + VAT
                expect(r.tongGomVAT).toBeCloseTo(r.tongChuaVAT + r.vat, 6);
                // haoHut chỉ là thông tin (= wasteInfo truyền vào), không cộng vào tiền
                expect(r.haoHut).toBe(wasteInfo);
                // donGia1SP = khách trả / sl
                expect(r.donGia1SP).toBeCloseTo(r.khachTra / sl, 6);
            },
        ), { numRuns: 200 });
    });
});
