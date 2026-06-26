/**
 * RAG Metrics — unit tests (gia tri tinh tay).
 * Run: npx jest rag-metrics
 */
import {
    precisionAtK, recallAtK, hitRateAtK, f1AtK,
    reciprocalRank, ndcgAtK, aggregate,
} from './rag-metrics';
import { GOLDEN_DATASET } from './golden-dataset';

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
