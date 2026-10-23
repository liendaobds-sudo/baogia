/**
 * NEGATIVE eval — chay OFFLINE, khong goi provider co phi.
 *
 * Muc dich: bien `NEGATIVE_DATASET` tu "tai lieu mo ta ky vong" thanh "cong CI thuc su".
 * Ba nhom kiem tra:
 *   1. Ve sinh dataset: id duy nhat, khong trung GOLDEN, nhan intent canonical.
 *   2. Hard check ky thuat: cac case `expectConstraintWarning` PHAI sinh canh bao tu
 *      `checkPrintingConstraints` (ham thuan) — day la lop bao ve chay du LLM co nghe prompt hay khong.
 *   3. Chan bia gia: cac case `forbidPrice` — khi model tra ve cau co so tien ma KHONG co bao gia
 *      hop le, `validateAiResult` PHAI go so tien do.
 */

import { GOLDEN_DATASET, NEGATIVE_DATASET } from './golden-dataset';
import { ALL_INTENTS, normalizeIntent } from '../intents';
import { checkPrintingConstraints } from '../printing-constraints';
import { ContextInferenceService } from '../context-inference.service';
import { AiSuggestService } from '../ai-suggest.service';

describe('NEGATIVE dataset — ve sinh du lieu', () => {
    it('id duy nhat va khong trung voi GOLDEN_DATASET', () => {
        const ids = NEGATIVE_DATASET.map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);

        const goldenIds = new Set(GOLDEN_DATASET.map((g) => g.id));
        const clashes = ids.filter((id) => goldenIds.has(id));
        expect(clashes).toEqual([]);
    });

    it('moi nhan intent thuoc enum canonical', () => {
        const canonical = new Set<string>(ALL_INTENTS.map(String));
        const invalid = NEGATIVE_DATASET
            .filter((c) => !canonical.has(normalizeIntent(c.intent)))
            .map((c) => `${c.id}:${c.intent}`);
        expect(invalid).toEqual([]);
    });

    it('moi case phai co it nhat MOT ky vong do duoc', () => {
        const empty = NEGATIVE_DATASET.filter((c) =>
            c.mustAsk.length === 0
            && c.mustNotContain.length === 0
            && !c.expectConstraintWarning
            && !c.expectEscalate
            && !c.expectEdgeCase
            && !c.forbidPrice,
        ).map((c) => c.id);
        expect(empty).toEqual([]);
    });

    it('moi case phai co ly do nghiep vu (khong de trong)', () => {
        const noReason = NEGATIVE_DATASET.filter((c) => !c.reason || c.reason.trim().length < 20).map((c) => c.id);
        expect(noReason).toEqual([]);
    });

    it('co du ca hai nhom: bat kha thi ky thuat va cam bia gia', () => {
        expect(NEGATIVE_DATASET.filter((c) => c.expectConstraintWarning).length).toBeGreaterThanOrEqual(5);
        expect(NEGATIVE_DATASET.filter((c) => c.forbidPrice).length).toBeGreaterThanOrEqual(4);
    });
});

describe('NEGATIVE dataset — hard check ky thuat phai bat duoc', () => {
    const impossible = NEGATIVE_DATASET.filter((c) => c.expectConstraintWarning);

    it.each(impossible.map((c) => [c.id, c.question, c.reason] as const))(
        '%s "%s" → phai sinh it nhat 1 canh bao',
        (_id, question) => {
            // productMatch = undefined ⇒ ham tu suy tu ngu canh (dung nhu duong chay that khi
            // Pricing template chua nap).
            const warnings = checkPrintingConstraints('', question, undefined);
            expect(warnings.length).toBeGreaterThan(0);
        },
    );

    it('cau lanh khong bi bao dong gia (khong noise)', () => {
        // Cac cau hoan toan hop le — hard check khong duoc sinh canh bao.
        const benign = [
            'in namecard couche 300gsm can mo 2 mat',
            'in to roi a5 150gsm 1000 to',
            'in catalogue 16 trang dong ghim giua',
            'in standee 60x160 1 mat',
        ];
        for (const q of benign) {
            expect(checkPrintingConstraints('', q, undefined)).toEqual([]);
        }
    });
});

describe('NEGATIVE dataset — edge-case phai khop (offline, doc JSON that)', () => {
    let ctx: ContextInferenceService;

    beforeAll(async () => {
        ctx = new ContextInferenceService();
        await ctx.onModuleInit();
    });

    const edgeCases = NEGATIVE_DATASET.filter((c) => c.expectEdgeCase);

    it('co it nhat 1 case edge-case trong dataset', () => {
        expect(edgeCases.length).toBeGreaterThan(0);
    });

    it.each(edgeCases.map((c) => [c.id, c.question, c.expectEdgeCase!] as const))(
        '%s "%s" → matchEdgeCase phai tra ve phan hoi (nhom %s)',
        (_id, question) => {
            const match = ctx.matchEdgeCase(question);
            expect(match).not.toBeNull();
            expect(String(match?.response || '').length).toBeGreaterThan(0);
        },
    );
});

describe('NEGATIVE dataset — chan bia gia khi chua co bao gia hop le', () => {
    let service: AiSuggestService;

    beforeEach(() => {
        service = Object.create(AiSuggestService.prototype);
        (service as any).logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
    });

    const forbidPriceCases = NEGATIVE_DATASET.filter((c) => c.forbidPrice);

    it.each(forbidPriceCases.map((c) => [c.id, c.question] as const))(
        '%s → so tien bi go khi khong co quoteResult',
        (_id, _question) => {
            // Gia lap model "lo mieng" bao gia du chua co bao gia hop le.
            const validated = service.validateAiResult(
                {
                    replies: [{ text: 'Dạ giá khoảng 1.200.000đ cho đơn này ạ.' }],
                    intent: 'hỏi_giá',
                    confidence: 0.9,
                    missing_info: [],
                },
                null,
                [],
            );
            const text = validated.replies.map((r: any) => r.text).join(' ');
            expect(text).not.toMatch(/1\.200\.000/);
        },
    );
});
