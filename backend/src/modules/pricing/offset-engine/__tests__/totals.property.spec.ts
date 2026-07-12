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

    // Feature: offset-imposition-gripper-unification, Property 8: VAT một nguồn, áp đúng một lần, tỉ lệ bất biến theo imposition
    // Validates: Requirements 4.1, 4.2, 4.3
    it('Feature: offset-imposition-gripper-unification, Property 8: VAT một nguồn, áp đúng một lần, tỉ lệ bất biến theo imposition', () => {
        // vatRate: undefined (thiếu ⇒ VAT=0), 0, và các mức thực tế + dải bất kỳ.
        const vatRateArb = fc.oneof(
            fc.constant<number | undefined>(undefined),
            fc.constant(0),
            fc.constant(0.08),
            fc.constant(0.1),
            fc.double({ min: 0, max: 0.2, noNaN: true }),
        );
        fc.assert(fc.property(
            // Tập dòng chi phí. Dòng đầu mô phỏng chi phí GIẤY (phụ thuộc So_Con/imposition).
            fc.array(fc.record({ label: fc.constant('x'), amount: fc.integer({ min: 0, max: 1_000_000 }) }), { minLength: 1, maxLength: 6 }),
            fc.integer({ min: 0, max: 2_000_000 }),   // baseSXTK (không ảnh hưởng VAT)
            fc.integer({ min: 1, max: 100000 }),      // sl
            fc.double({ min: 0, max: 0.3, noNaN: true }), // chietKhauRate (không ảnh hưởng VAT)
            vatRateArb,
            // Hệ số thay đổi chi phí giấy do imposition (So_Con) đổi — số nguyên dương.
            fc.integer({ min: 1, max: 50 }),
            (lines, base, sl, ckRate, vatRate, impositionScale) => {
                const vatPct = vatRate ?? 0;
                const r = tongHopKetQua(lines as QuoteLine[], base, sl, D, 0, ckRate, vatRate);

                // (4.1/4.2) VAT chỉ từ vatRate (một nguồn duy nhất), áp đúng một lần:
                //   vat = tongChuaVAT × vatPct; tongGomVAT = tongChuaVAT × (1 + vatPct).
                expect(r.vat).toBeCloseTo(r.tongChuaVAT * vatPct, 6);
                expect(r.tongGomVAT).toBeCloseTo(r.tongChuaVAT * (1 + vatPct), 6);

                // Thiếu vatRate ⇒ VAT = 0 (không có nguồn VAT nào khác lọt vào).
                if (vatRate === undefined) {
                    expect(r.vat).toBe(0);
                }

                // (4.3) Tỉ lệ vat/tongChuaVAT bằng đúng vatPct khi có cơ sở chịu thuế.
                if (r.tongChuaVAT > 0) {
                    expect(r.vat / r.tongChuaVAT).toBeCloseTo(vatPct, 6);
                }

                // (4.3) Bất biến theo imposition: thay đổi So_Con làm đổi chi phí giấy ⇒ đổi
                // tongChuaVAT, nhưng tỉ lệ VAT KHÔNG đổi (vẫn = vatPct). Mô phỏng bằng cách
                // scale dòng chi phí giấy (dòng đầu) theo hệ số imposition.
                const scaledLines = lines.map((l, i) =>
                    i === 0 ? { ...l, amount: l.amount * impositionScale } : { ...l },
                ) as QuoteLine[];
                const r2 = tongHopKetQua(scaledLines, base, sl, D, 0, ckRate, vatRate);

                // VAT vẫn áp đúng một lần trên cơ sở mới.
                expect(r2.vat).toBeCloseTo(r2.tongChuaVAT * vatPct, 6);
                expect(r2.tongGomVAT).toBeCloseTo(r2.tongChuaVAT * (1 + vatPct), 6);
                // Tỉ lệ VAT bất biến giữa hai imposition (cùng = vatPct).
                if (r.tongChuaVAT > 0 && r2.tongChuaVAT > 0) {
                    expect(r2.vat / r2.tongChuaVAT).toBeCloseTo(r.vat / r.tongChuaVAT, 6);
                }
            },
        ), { numRuns: 200 });
    });
});
