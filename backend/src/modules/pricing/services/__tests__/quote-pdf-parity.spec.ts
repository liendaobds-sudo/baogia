import { QuotePdfService } from '../quote-pdf.service';
import { EngineOffsetService } from '../../offset-engine/engine-offset.service';
import { loadDefaultPricingData } from '../../offset-engine/default-data';
import { resolveSoCon } from '../../offset-engine/imposition-selector';
import { timKhoIn } from '../../offset-engine/lookups';

/**
 * Task 11.3 — Parity giá ≡ preview ≡ PDF (Req 2.4, 10.3, 10.5).
 *
 * Hai phần:
 *  1) Example test: `quote-pdf.service` (helper `offsetSpecOf`) PHẢI in số con/tờ TỪ
 *     `result.meta.soConToLon` của engine — `${m.soConToLon} con/tờ` — chứ KHÔNG tự tính lại.
 *  2) End-to-end parity: chạy engine cho một sản phẩm đại diện, lấy `result.meta.soConToLon`,
 *     và xác nhận CÙNG MỘT con số là:
 *        • giá trị nguồn imposition mà đường GIÁ dùng (cấp cho buildWaste qua resolveSoCon), và
 *        • con số PDF render ra.
 *     ⇒ price ≡ preview ≡ PDF cùng một So_Con duy nhất (Req 10.5).
 */

/** DataSource giả: chỉ cần `query('SELECT key, value FROM site_settings')` trả rỗng. */
function makeFakeDataSource() {
    return { query: jest.fn().mockResolvedValue([]) } as any;
}

/** Bọc một meta engine thành quote item offset như OrdersService lưu (printing_detail.result.meta). */
function quoteFromMeta(meta: Record<string, any>, config: Record<string, any> = {}) {
    return {
        code: 'BG-PARITY-1',
        items: [
            {
                product_name: 'SP offset',
                quantity: 5000,
                item_total: 1_000_000,
                unit: 'cái',
                printing_detail: { offset: true, config, result: { meta } },
            },
        ],
    };
}

describe('QuotePdfService — in số con/tờ TỪ meta.soConToLon (Req 2.4, 10.3)', () => {
    it('render `${meta.soConToLon} con/tờ` trong dòng quy cách sản phẩm offset', async () => {
        const svc = new QuotePdfService(makeFakeDataSource());
        const meta = { khoGiayLon: '65cm x 86cm', soConToLon: 8, loaiKem: 'Kẽm lớn' };
        const html = await svc.generateHtml(quoteFromMeta(meta, { rong: 9, cao: 5.4, materialCode: 'C150', soKemIn: 4 }));
        expect(html).toContain('8 con/tờ');
    });

    it('soConToLon khác → PDF đổi theo (không phải hằng số tự tính lại)', async () => {
        const svc = new QuotePdfService(makeFakeDataSource());
        const html = await svc.generateHtml(quoteFromMeta({ khoGiayLon: '79cm x 109cm', soConToLon: 21 }));
        expect(html).toContain('21 con/tờ');
        expect(html).not.toContain('8 con/tờ');
    });

    it('thiếu soConToLon → KHÔNG in "con/tờ" (không bịa số)', async () => {
        const svc = new QuotePdfService(makeFakeDataSource());
        const html = await svc.generateHtml(quoteFromMeta({ khoGiayLon: '79cm x 109cm' }));
        expect(html).not.toMatch(/con\/tờ/);
    });
});

describe('Parity end-to-end — price ≡ preview ≡ PDF cùng một soConToLon (Req 10.5)', () => {
    const engine = new EngineOffsetService(); // không ConfigStore → default JSON
    const d = loadDefaultPricingData();
    const mat = d.materials[0].code;

    it('sp_khac (nhập kích thước): meta.soConToLon = nguồn imposition đường giá = số con PDF', async () => {
        const khoLabel = d.khoIn[0].khoIn;
        const config = {
            type: 'sp_khac' as const,
            khoIn: khoLabel,
            materialCode: mat,
            soMatIn: 2 as const,
            soLuong: 5000,
            rong: 9,
            cao: 5.4,
            soBoKem: 1,
            soMau: 4,
            vatTuBeMat: 'Không',
            be: false,
            thanhPham: 'khong' as const,
            catXen: true,
            dongGoi: true,
            epKimViTri: 'Không',
            thietKe: 0,
        };

        // (1) ENGINE (đường giá): meta.soConToLon LÀ giá trị cấp cho buildWaste (soConToLon: soCon).
        const res = engine.calculate(config as any);
        expect(res.success).toBe(true);
        const N = res.data!.meta!.soConToLon!;
        expect(N).toBeGreaterThan(0);

        // (2) Cùng nguồn imposition mà đường giá dùng — tái lập resolveSoCon độc lập với CÙNG input.
        const kho = timKhoIn(khoLabel, d)!;
        const outcome = resolveSoCon({
            itemWcm: config.rong,
            itemHcm: config.cao,
            kho,
            data: d,
            fallbackToLon: kho.soConToLon,
            fallbackBaiIn: kho.soConBaiIn,
        });
        // Giá trị nguồn So_Con (đường giá) === meta.soConToLon (preview) → một nguồn duy nhất.
        expect(outcome.soConToLon).toBe(N);

        // (3) PDF render ra ĐÚNG con số đó từ meta.
        const pdf = new QuotePdfService(makeFakeDataSource());
        const html = await pdf.generateHtml(quoteFromMeta(res.data!.meta as any, config));
        expect(html).toContain(`${N} con/tờ`);
    });

    it('to_roi (khổ cố định): meta.soConToLon từ engine khớp con số PDF render', async () => {
        const fs = d.fixedSizes.toRoi[0];
        const config = {
            type: 'to_roi' as const,
            kichThuoc: fs.kichThuoc,
            materialCode: mat,
            soMatIn: 2 as const,
            soLuong: 5000,
            kemType: 'Kẽm lớn' as const,
            soKemIn: 4,
            vatTuBeMat: 'Không',
            khuon: true,
            be: true,
            thanhPhamGap: 'khong' as const,
            catXen: true,
            dongGoi: true,
            thietKe: 0,
        };

        const res = engine.calculate(config as any);
        expect(res.success).toBe(true);
        const N = res.data!.meta!.soConToLon!;
        expect(N).toBeGreaterThan(0);

        const pdf = new QuotePdfService(makeFakeDataSource());
        const html = await pdf.generateHtml(quoteFromMeta(res.data!.meta as any, config));
        // PDF in đúng số con/tờ engine (không tự tính lại) → parity giá ≡ preview ≡ PDF.
        expect(html).toContain(`${N} con/tờ`);
    });
});
