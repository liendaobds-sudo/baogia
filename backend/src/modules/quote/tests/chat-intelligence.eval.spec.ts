/**
 * Chat Intelligence Eval (DETERMINISTIC) — chấm điểm "độ thông minh" của pipeline
 * báo giá chatbot KHÔNG cần LLM/khóa API/DB. Tập trung các tầng quy tắc/engine:
 *
 *   1. Nhận diện sản phẩm (detectProduct) — đúng product_type.
 *   2. Parser (QuoteParserService.parse) — trích số lượng/mặt in/kích thước.
 *   3. Trí nhớ hội thoại (parseWithContext) — gộp thông tin qua nhiều tin nhắn.
 *   4. Giá BÁN (calculateFromParsed) — trả grand_total (giá bán), KHÔNG phải giá vốn.
 *   5. Chống ảo giá khi Pricing offline — requiresManualQuote, KHÔNG bịa giá.
 *   6. Thiếu thông tin — trả missingFields, KHÔNG gọi engine.
 *
 * (Phần "độ tự nhiên/giọng văn" cần LLM-judge: chạy riêng `npm run eval:chat`,
 *  yêu cầu GEMINI_API_KEY + DB — không nằm trong test CI này.)
 *
 * Run: npx jest chat-intelligence
 */

import { QuoteService } from '../quote.service';
import { QuoteParserService } from '../quote-parser.service';
import { detectProduct } from '../extractors';

const SAMPLE_PRICING_RESULT = {
    type: 'loose',
    subtotal: 52800,
    total: 52800,            // giá vốn
    selling_subtotal: 79200,
    vat_rate: 0,
    vat_amount: 0,
    grand_total: 79200,      // giá bán (markup, CHƯA VAT)
    grand_total_per_item: 79,
    breakdown: { items_per_sheet: 23, sheets_needed: 44, total_sheets: 48, price_per_sheet: 1000 },
    processing_details: [],
};

function buildQuoteService(healthy = true) {
    const calculatePrice = jest.fn().mockResolvedValue({ ...SAMPLE_PRICING_RESULT });
    const pricingApi: any = {
        isHealthy: jest.fn().mockResolvedValue(healthy),
        calculatePrice,
        getMaterials: jest.fn().mockResolvedValue([]),
        getProcessingOptions: jest.fn().mockResolvedValue([]),
        getPaperSizes: jest.fn().mockResolvedValue([]),
        getFormOptions: jest.fn().mockResolvedValue({}),
    };
    const emptyRepo: any = {};
    const dataSource: any = { query: jest.fn().mockResolvedValue([]) };
    const svc = new QuoteService(
        emptyRepo, emptyRepo, emptyRepo, emptyRepo, emptyRepo,
        emptyRepo, emptyRepo, emptyRepo, emptyRepo,
        pricingApi, dataSource,
    );
    return { svc, calculatePrice };
}

const looseComplete = (extra: Record<string, any> = {}) => ({
    product: 'namecard', type: 'loose', quantity: 1000,
    material: { id: 10, name: 'Couche 300', paperSizeId: 1 },
    size: { width: 90, height: 54 }, printSides: 2, isComplete: true, finishing: [],
    ...extra,
} as any);

describe('Chat Intelligence Eval (deterministic)', () => {
    const parser = new QuoteParserService();

    // Bộ đếm điểm tổng để in bảng kết quả cuối.
    const score = { pass: 0, total: 0 };
    const check = (name: string, cond: boolean) => {
        score.total++;
        if (cond) score.pass++;
        else console.warn(`  ✗ FAIL: ${name}`);
        expect(cond).toBe(true);
    };

    // ── 1. Nhận diện sản phẩm theo product_type ──
    describe('1. Nhận diện sản phẩm', () => {
        const cases: Array<{ text: string; type: string }> = [
            { text: 'in card visit 2 mặt cán mờ', type: 'loose' },
            { text: 'in tờ rơi a5 1000 tờ', type: 'loose' },
            { text: 'in tem decal dán ly', type: 'loose' },
            { text: 'in catalogue 20 trang 100 cuốn', type: 'bound' },
            { text: 'in sổ tay notebook bìa cứng', type: 'bound' },
            { text: 'in standee 60x160', type: 'large_format' },
            { text: 'in băng rôn ngoài trời', type: 'large_format' },
        ];
        it.each(cases)('"$text" → $type', ({ text, type }) => {
            const d = detectProduct(text.toLowerCase());
            check(`detect "${text}"`, !!d && d.type === type);
        });
    });

    // ── 2. Parser trích xuất trường ──
    describe('2. Parser trích xuất', () => {
        it('trích số lượng "1000 cái"', () => {
            const p = parser.parse('in card visit 1000 cái 2 mặt');
            check('quantity=1000', p.quantity === 1000);
        });
        it('trích mặt in "2 mặt"', () => {
            const p = parser.parse('in card visit 1000 cái 2 mặt');
            check('printSides=2', p.printSides === 2);
        });
        it('trích kích thước "60x160"', () => {
            const p = parser.parse('in standee 60x160');
            check('size defined', !!p.size && p.size.width > 0 && p.size.height > 0);
        });
    });

    // ── 3. Trí nhớ hội thoại (gộp nhiều tin) ──
    describe('3. Trí nhớ hội thoại', () => {
        it('gộp số lượng từ tin nhắn sau với sản phẩm tin trước', () => {
            const first = parser.parse('mình muốn in card visit');
            const merged = parser.parseWithContext('1000 cái 2 mặt cán mờ', first);
            check('giữ product', !!merged.product);
            check('bổ sung quantity', merged.quantity === 1000);
        });
    });

    // ── 4. Giá BÁN (grand_total), không phải giá vốn ──
    describe('4. Trả giá bán', () => {
        it('calculateFromParsed → total = grand_total (79.200, chưa VAT), không phải 52.800', async () => {
            const { svc } = buildQuoteService(true);
            const res: any = await svc.calculateFromParsed(looseComplete());
            check('total=grand_total', Number(res.total) === 79200);
            check('không trả giá vốn', Number(res.total) !== 52800);
        });
    });

    // ── 5. Chống ảo giá khi Pricing offline ──
    describe('5. Chống ảo giá (offline)', () => {
        it('Pricing offline → requiresManualQuote, total null, KHÔNG gọi engine', async () => {
            const { svc, calculatePrice } = buildQuoteService(false);
            const res: any = await svc.calculateFromParsed(looseComplete());
            check('requiresManualQuote', res.requiresManualQuote === true);
            check('total null (không bịa)', res.total == null);
            check('không gọi engine', calculatePrice.mock.calls.length === 0);
        });
    });

    // ── 6. Thiếu thông tin → hỏi lại, không gọi engine ──
    describe('6. Thiếu thông tin', () => {
        it('chưa đủ → missingFields, total null, không gọi engine', async () => {
            const { svc, calculatePrice } = buildQuoteService(true);
            const parsed: any = { product: 'namecard', type: 'loose', isComplete: false, missingFields: ['quantity'], warnings: [] };
            const res: any = await svc.calculateFromParsed(parsed);
            check('total null', res.total === null);
            check('không gọi engine', calculatePrice.mock.calls.length === 0);
        });
    });

    afterAll(() => {
        const pct = score.total ? Math.round((score.pass / score.total) * 100) : 0;
        // eslint-disable-next-line no-console
        console.log(`\n══════ CHAT INTELLIGENCE (deterministic) ══════\n  Điểm: ${score.pass}/${score.total} (${pct}%)\n`);
    });
});
