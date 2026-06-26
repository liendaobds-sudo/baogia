/**
 * RAG Retrieval Metrics — chuan IR (Information Retrieval).
 *
 * Cac ham THUAN (khong I/O) de cham diem chat luong truy hoi:
 *   Precision@K, Recall@K, HitRate@K, MRR, NDCG@K, F1@K.
 *
 * Dung cho eval offline (regression) trong CI + bao cao dinh ky.
 * Tham chieu chuan: Precision@K / Recall@K / MRR / NDCG la bo metric chuan
 * de danh gia retrieval (xem cac RAG eval framework pho bien).
 */

/** Chuan hoa input ve mang id (giu thu tu xep hang) + tap relevant. */
function toSet(relevant: string[]): Set<string> {
    return new Set(relevant.map(String));
}

/** Precision@K = (so ket qua dung trong top-K) / K */
export function precisionAtK(retrieved: string[], relevant: string[], k: number): number {
    if (k <= 0) return 0;
    const rel = toSet(relevant);
    const topK = retrieved.slice(0, k);
    const hits = topK.filter((id) => rel.has(String(id))).length;
    return hits / k;
}

/** Recall@K = (so relevant lay duoc trong top-K) / (tong so relevant) */
export function recallAtK(retrieved: string[], relevant: string[], k: number): number {
    const rel = toSet(relevant);
    if (rel.size === 0) return 0;
    const topK = retrieved.slice(0, k);
    const hits = topK.filter((id) => rel.has(String(id))).length;
    return hits / rel.size;
}

/** HitRate@K = 1 neu co it nhat 1 relevant trong top-K, nguoc lai 0 */
export function hitRateAtK(retrieved: string[], relevant: string[], k: number): number {
    const rel = toSet(relevant);
    return retrieved.slice(0, k).some((id) => rel.has(String(id))) ? 1 : 0;
}

/** F1@K = 2PR/(P+R) */
export function f1AtK(retrieved: string[], relevant: string[], k: number): number {
    const p = precisionAtK(retrieved, relevant, k);
    const r = recallAtK(retrieved, relevant, k);
    return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

/** MRR = 1 / (thu hang cua relevant dau tien); 0 neu khong co relevant nao. */
export function reciprocalRank(retrieved: string[], relevant: string[]): number {
    const rel = toSet(relevant);
    for (let i = 0; i < retrieved.length; i++) {
        if (rel.has(String(retrieved[i]))) return 1 / (i + 1);
    }
    return 0;
}

/** NDCG@K voi relevance nhi phan (1 neu relevant, 0 neu khong). */
export function ndcgAtK(retrieved: string[], relevant: string[], k: number): number {
    const rel = toSet(relevant);
    const topK = retrieved.slice(0, k);

    let dcg = 0;
    for (let i = 0; i < topK.length; i++) {
        const gain = rel.has(String(topK[i])) ? 1 : 0;
        dcg += gain / Math.log2(i + 2); // i=0 -> log2(2)=1
    }

    // IDCG: xep ly tuong toan bo relevant len dau (toi da min(K, |relevant|) muc)
    const idealHits = Math.min(k, rel.size);
    let idcg = 0;
    for (let i = 0; i < idealHits; i++) {
        idcg += 1 / Math.log2(i + 2);
    }

    return idcg === 0 ? 0 : dcg / idcg;
}

export interface AggregateMetrics {
    count: number;
    k: number;
    precision: number;
    recall: number;
    hitRate: number;
    f1: number;
    mrr: number;
    ndcg: number;
}

/** Mot truong hop eval: id ket qua xep hang + tap relevant ky vong. */
export interface EvalCase {
    id: string;
    retrieved: string[];
    relevant: string[];
}

/** Tinh trung binh (macro-average) cac metric tren nhieu truong hop. */
export function aggregate(cases: EvalCase[], k: number): AggregateMetrics {
    const n = cases.length || 1;
    let p = 0, r = 0, h = 0, f = 0, mrr = 0, ndcg = 0;
    for (const c of cases) {
        p += precisionAtK(c.retrieved, c.relevant, k);
        r += recallAtK(c.retrieved, c.relevant, k);
        h += hitRateAtK(c.retrieved, c.relevant, k);
        f += f1AtK(c.retrieved, c.relevant, k);
        mrr += reciprocalRank(c.retrieved, c.relevant);
        ndcg += ndcgAtK(c.retrieved, c.relevant, k);
    }
    const round = (x: number) => Math.round((x / n) * 1000) / 1000;
    return {
        count: cases.length, k,
        precision: round(p), recall: round(r), hitRate: round(h),
        f1: round(f), mrr: round(mrr), ndcg: round(ndcg),
    };
}
