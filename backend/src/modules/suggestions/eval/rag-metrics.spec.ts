/**
 * RAG Metrics — unit tests (gia tri tinh tay).
 * Run: npx jest rag-metrics
 */
import {
    precisionAtK, recallAtK, hitRateAtK, f1AtK,
    reciprocalRank, ndcgAtK, aggregate,
    intentAccuracy, findInvalidIntentLabels,
} from './rag-metrics';
import { GOLDEN_DATASET } from './golden-dataset';
import { ALL_INTENTS, INTENT_TAG_MAP, normalizeIntent } from '../intents';

describe('RAG metrics — chuan IR', () => {
    const retrieved = ['a', 'b', 'c', 'd'];
    const relevant = ['b', 'd'];

    it('precisionAtK', () => {
        expect(precisionAtK(retrieved, relevant, 2)).toBeCloseTo(0.5, 5); // top2=[a,b] -> 1 hit /2
        expect(precisionAtK(retrieved, relevant, 4)).toBeCloseTo(0.5, 5); // 2 hits /4
        expect(precisionAtK(retrieved, relevant, 1)).toBe(0);             // top1=[a]
    });

    it('recallAtK', () => {
        expect(recallAtK(retrieved, relevant, 2)).toBeCloseTo(0.5, 5);    // 1 trong 2 relevant
        expect(recallAtK(retrieved, relevant, 4)).toBeCloseTo(1.0, 5);    // ca 2
        expect(recallAtK(retrieved, [], 4)).toBe(0);                      // khong co relevant
    });

    it('hitRateAtK', () => {
        expect(hitRateAtK(retrieved, relevant, 1)).toBe(0); // [a] khong trung
        expect(hitRateAtK(retrieved, relevant, 2)).toBe(1); // [a,b] co b
    });

    it('reciprocalRank (MRR don le)', () => {
        expect(reciprocalRank(retrieved, relevant)).toBeCloseTo(0.5, 5);  // relevant dau tien 'b' o hang 2
        expect(reciprocalRank(['b'], ['b'])).toBe(1);
        expect(reciprocalRank(['x', 'y'], ['z'])).toBe(0);
    });

    it('f1AtK', () => {
        // @2: P=0.5, R=0.5 -> F1=0.5
        expect(f1AtK(retrieved, relevant, 2)).toBeCloseTo(0.5, 5);
    });

    it('ndcgAtK (binary)', () => {
        // top2=[a(0),b(1)]: DCG = 0 + 1/log2(3)=0.6309 ; IDCG@2 = 1/1 + 1/log2(3)=1.6309
        expect(ndcgAtK(retrieved, relevant, 2)).toBeCloseTo(0.387, 2);
        // perfect ranking
        expect(ndcgAtK(['b', 'd', 'a', 'c'], relevant, 2)).toBeCloseTo(1.0, 5);
    });

    it('aggregate (macro-average nhieu case)', () => {
        const agg = aggregate([
            { id: '1', retrieved: ['b', 'a'], relevant: ['b'] },       // P@1=1
            { id: '2', retrieved: ['a', 'b'], relevant: ['b'] },       // P@1=0
        ], 1);
        expect(agg.count).toBe(2);
        expect(agg.precision).toBeCloseTo(0.5, 5);  // (1+0)/2
        expect(agg.hitRate).toBeCloseTo(0.5, 5);
        expect(agg.mrr).toBeCloseTo(0.75, 5);        // (1 + 0.5)/2
    });

    it('golden dataset hop le (co cau truc dung)', () => {
        expect(GOLDEN_DATASET.length).toBeGreaterThanOrEqual(10);
        for (const c of GOLDEN_DATASET) {
            expect(c.id).toBeTruthy();
            expect(c.question.length).toBeGreaterThan(5);
            expect(c.relevantDocTitles.length).toBeGreaterThan(0);
            expect(c.mustContain.length).toBeGreaterThan(0);
            expect(c.intent).toBeTruthy();
        }
    });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Intent — bo sung 2026-08-29 (audit do thong minh)
 * ──────────────────────────────────────────────────────────────────────────── */
describe('Intent eval — dataset labels + accuracy', () => {
    it('MOI nhan intent trong golden-dataset PHAI thuoc enum canonical', () => {
        const labels = GOLDEN_DATASET.map((c) => c.intent);
        const invalid = findInvalidIntentLabels(labels, ALL_INTENTS);
        if (invalid.length > 0) {
            throw new Error(
                `Dataset dung ${invalid.length} nhan intent KHONG thuoc enum canonical:\n` +
                invalid.map((i) => `  - ${i}`).join('\n') +
                '\n\nModel khong the tra ve token ngoai enum (responseSchema ep enum), nen moi phep\n' +
                'do intent tren nhan nay se luon SAI. Sua nhan trong golden-dataset.ts, hoac them\n' +
                'intent moi vao enum `Intent` + INTENT_TAG_MAP (xem intents.ts).',
            );
        }
        expect(invalid).toEqual([]);
    });

    it('nhan intent sau normalize phai bang chinh no (khong con alias trong dataset)', () => {
        for (const c of GOLDEN_DATASET) {
            expect(normalizeIntent(c.intent)).toBe(c.intent);
        }
    });

    it('dataset khong duoc de nhan `chung` (nhan vo nghia cho phep do)', () => {
        const generic = GOLDEN_DATASET.filter((c) => c.intent === 'chung').map((c) => c.id);
        expect(generic).toEqual([]);
    });

    it('intentAccuracy dem dung + liet ke case sai', () => {
        const r = intentAccuracy([
            { id: 'a', expected: 'hỏi_giá', actual: 'hỏi_giá' },
            { id: 'b', expected: 'hỏi_vật_tư', actual: 'chung' },
            { id: 'c', expected: 'hỏi_kỹ_thuật', actual: 'hỏi_giá' },
        ]);
        expect(r.count).toBe(3);
        expect(r.correct).toBe(1);
        expect(r.accuracy).toBeCloseTo(0.333, 3);
        expect(r.mismatches).toEqual(['b: hỏi_vật_tư -> chung', 'c: hỏi_kỹ_thuật -> hỏi_giá']);
    });

    it('fallbackRate bat rieng truong hop model roi ve `chung`', () => {
        const r = intentAccuracy([
            { id: 'a', expected: 'hỏi_vật_tư', actual: 'chung' },
            { id: 'b', expected: 'hỏi_giao_hàng', actual: 'chung' },
            { id: 'c', expected: 'hỏi_giá', actual: 'hỏi_giá' },
        ]);
        expect(r.fallbackRate).toBeCloseTo(0.667, 3);
    });

    it('normalize giup alias khong bi tinh la sai', () => {
        // 'khiếu_nại' la alias cua 'phàn_nàn' — sau normalize phai coi la DUNG.
        const raw = intentAccuracy([{ id: 'a', expected: 'phàn_nàn', actual: 'khiếu_nại' }]);
        expect(raw.correct).toBe(0);
        const norm = intentAccuracy([{ id: 'a', expected: 'phàn_nàn', actual: 'khiếu_nại' }], normalizeIntent);
        expect(norm.correct).toBe(1);
    });

    it('cac nhan tu 3 tu dien cu deu map duoc ve canonical (chong tai phat)', () => {
        const legacy = [
            'hỏi_chất_liệu', 'hỏi_thời_gian', 'hỏi_dịch_vụ',          // golden-dataset cu
            'hỏi_thanh_toán', 'hỏi_bảo_hành', 'hỏi_thiết_kế', 'hỏi_proof', // faq-edge-cases cu
        ];
        for (const l of legacy) {
            expect(normalizeIntent(l)).not.toBe('chung');
        }
    });

    it('intent moi bo sung deu co tag hoi thoai (khong mat routing)', () => {
        for (const i of [
            'khiếu_nại_chất_lượng', 'thương_lượng_giá', 'hỏi_chính_sách',
            'hỏi_mẫu', 'hủy_đổi_đơn', 'hỏi_số_lượng',
        ]) {
            expect(ALL_INTENTS).toContain(i);
            expect(INTENT_TAG_MAP[i]).toBeTruthy();
        }
    });
});
