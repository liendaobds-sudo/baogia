import fc from 'fast-check';
import { makePricingData } from './fixture';
import {
    giaGiay, chuanHoaKho, timKhoIn, pickRate, chiPhiGiaCong, chiPhiEpKim,
    chiPhiBinhBai, chiPhiCanMang, haoHut, soConTrenKho,
} from '../lookups';

const D = makePricingData();

describe('EngineOffset lookups (property)', () => {
    it('Feature: offset-pricebook-revamp, Property 1: pickRate chọn đúng bậc theo MocSoLuong + đơn điệu', () => {
        const tiers = D.giaCong[0].tiers; // dãy đơn giá không tăng (phần sau)
        fc.assert(fc.property(fc.integer({ min: 0, max: 2_000_000 }), (sl) => {
            // tham chiếu: ngưỡng lớn nhất ≤ sl
            let idx = 0;
            for (let i = 0; i < D.tyLe.mocSoLuong.length; i++) if (sl >= D.tyLe.mocSoLuong[i]) idx = i;
            const expected = tiers[Math.min(idx, tiers.length - 1)].price ?? 0;
            expect(pickRate(sl, tiers, D.tyLe.mocSoLuong)).toBe(expected);
        }), { numRuns: 200 });

        // đơn điệu không tăng theo sl (vì tiers không tăng từ bậc 5 trở đi)
        fc.assert(fc.property(fc.integer({ min: 1000, max: 2_000_000 }), fc.integer({ min: 1000, max: 2_000_000 }), (a, b) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            expect(pickRate(hi, tiers, D.tyLe.mocSoLuong)).toBeLessThanOrEqual(pickRate(lo, tiers, D.tyLe.mocSoLuong));
        }), { numRuns: 100 });
    });

    it('Feature: offset-pricebook-revamp, Property 2: chiPhiGiaCong đúng theo billingMode', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 500000 }), (sl) => {
            // minCharge (XLBM): dưới MOQ → 250000; ≥ MOQ → rate*sl
            const xlbm = chiPhiGiaCong('XLBM', sl, D);
            if (sl < D.tyLe.params.MOQ_GiaCong) expect(xlbm).toBe(D.tyLe.params.GiaMin_XLBM);
            else expect(xlbm).toBe(pickRate(sl, D.giaCong[0].tiers, D.tyLe.mocSoLuong) * sl);
            // perUnit (CATXEN): luôn rate*sl
            const cx = chiPhiGiaCong('CATXEN', sl, D);
            expect(cx).toBe(pickRate(sl, D.giaCong[1].tiers, D.tyLe.mocSoLuong) * sl);
        }), { numRuns: 200 });
    });

    it('Feature: offset-pricebook-revamp, Property 3: chiPhiEpKim đơn vị hỗn hợp', () => {
        fc.assert(fc.property(
            fc.constantFrom('1 vị trí', '2 vị trí', '3 vị trí'),
            fc.integer({ min: 1, max: 200000 }),
            (viTri, sl) => {
                const row = D.epKim.rows.find((r) => r.viTri === viTri)!;
                const cost = chiPhiEpKim(viTri, sl, D);
                if (sl < 100) expect(cost).toBe(row.duoi100);
                else if (sl < 500) expect(cost).toBe(row.tu100_499 * sl);
                else if (sl < 1000) expect(cost).toBe(row.tu500_999 * sl);
                else expect(cost).toBe(row.tren1000 * sl);
            },
        ), { numRuns: 200 });
        expect(chiPhiEpKim('Không', 5000, D)).toBe(0);
    });

    it('Feature: offset-pricebook-revamp, Property 4: chiPhiBinhBai scale theo lượt in quanh MOQ + không giảm', () => {
        fc.assert(fc.property(
            fc.constantFrom<'Kẽm nhỏ' | 'Kẽm lớn'>('Kẽm nhỏ', 'Kẽm lớn'),
            fc.integer({ min: 1, max: 6 }),
            fc.integer({ min: 1, max: 500000 }),
            (loai, soKem, luotIn) => {
                const bang = loai === 'Kẽm lớn' ? D.kem.kemLon : D.kem.kemNho;
                const giaGoc = bang.find((k) => k.soKem === soKem)!.donGia;
                const moq = loai === 'Kẽm lớn' ? D.tyLe.params.MOQ_BinhBai_Lon : D.tyLe.params.MOQ_BinhBai_Nho;
                const cost = chiPhiBinhBai(loai, soKem, luotIn, D);
                if (luotIn <= moq) expect(cost).toBe(giaGoc);
                else expect(cost).toBeCloseTo((luotIn * giaGoc) / moq, 4);
                // không giảm theo lượt in
                expect(chiPhiBinhBai(loai, soKem, luotIn + 1000, D)).toBeGreaterThanOrEqual(cost - 1e-6);
            },
        ), { numRuns: 200 });
    });

    it('Feature: offset-pricebook-revamp, Property 5: soConTrenKho không âm, đối xứng, đơn điệu, 0 khi quá khổ', () => {
        fc.assert(fc.property(
            fc.double({ min: 1, max: 200, noNaN: true }), fc.double({ min: 1, max: 200, noNaN: true }),
            fc.double({ min: 1, max: 100, noNaN: true }), fc.double({ min: 1, max: 100, noNaN: true }),
            (kw, kh, bw, bh) => {
                const n = soConTrenKho(kw, kh, bw, bh);
                expect(Number.isInteger(n)).toBe(true);
                expect(n).toBeGreaterThanOrEqual(0);
                // đối xứng khi hoán đổi khổ
                expect(soConTrenKho(kh, kw, bw, bh)).toBe(n);
                // đơn điệu: phóng to khổ không làm giảm số con
                expect(soConTrenKho(kw + 50, kh + 50, bw, bh)).toBeGreaterThanOrEqual(n);
            },
        ), { numRuns: 200 });
        // con lớn hơn cả hai chiều khổ → 0
        expect(soConTrenKho(10, 10, 50, 50)).toBe(0);
    });

    it('Feature: offset-pricebook-revamp, Property 6: chuanHoaKho round-trip + nhất quán định dạng', () => {
        for (const k of D.khoIn) {
            expect(timKhoIn(k.khoIn, D)).toEqual(k);
        }
        expect(chuanHoaKho('43 x 65cm')).toBe(chuanHoaKho('43cm x 65cm'));
        expect(chuanHoaKho('39.5 x 54cm')).toBe('39.5cm x 54cm');
    });

    it('Feature: offset-pricebook-revamp, Property 7: haoHut đúng bậc + không tăng theo sl', () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 2_000_000 }), (sl) => {
            const rows = [...D.tyLe.haoHut].sort((a, b) => a.mocSoLuong - b.mocSoLuong);
            let exp = rows[0].tyLe;
            for (const r of rows) if (sl >= r.mocSoLuong) exp = r.tyLe;
            expect(haoHut(sl, D)).toBe(exp);
        }), { numRuns: 200 });
        fc.assert(fc.property(fc.integer({ min: 1, max: 2_000_000 }), fc.integer({ min: 1, max: 2_000_000 }), (a, b) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            expect(haoHut(hi, D)).toBeLessThanOrEqual(haoHut(lo, D));
        }), { numRuns: 100 });
    });

    it('Feature: offset-pricebook-revamp, Property 9: tra giá vật liệu theo code và alias nhất quán', () => {
        for (const m of D.materials) {
            expect(giaGiay(m.code, D)).toBe(m.priceNoVAT);
            for (const a of m.aliases) expect(giaGiay(a, D)).toBe(m.priceNoVAT);
        }
    });

    it('Feature: offset-pricebook-revamp, Property 10: chiPhiCanMang tỷ lệ diện tích × kg × mặt × tờ', () => {
        fc.assert(fc.property(
            fc.constantFrom('Màng bóng 1m', 'Màng bóng 2m'),
            fc.integer({ min: 1, max: 2 }),
            fc.integer({ min: 1, max: 100000 }),
            (vt, soMat, soTo) => {
                const rec = D.kem.vatTuBeMat.find((v) => v.ten === vt)!;
                const dienTich = 0.2795; // khổ 43x65 trong fixture
                const cost = chiPhiCanMang('43 x 65cm', vt, soMat, soTo, D);
                expect(cost).toBeCloseTo(dienTich * rec.donGiaKg * soMat * soTo, 4);
            },
        ), { numRuns: 200 });
        expect(chiPhiCanMang('43 x 65cm', 'Không', 2, 100, D)).toBe(0);
    });
});
