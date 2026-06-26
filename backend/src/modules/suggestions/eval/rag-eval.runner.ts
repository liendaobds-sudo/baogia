/**
 * RAG Eval Runner — chay golden dataset qua KB search THAT roi cham metric.
 *
 * Dung: `npm run eval:rag`  (can DB Postgres dang chay + KB da seed).
 * In bao cao Precision@K / Recall@K / HitRate / MRR / NDCG (macro-average)
 * + groundedness so bo (mustContain).
 *
 * Dung cho regression: dat nguong toi thieu (THRESHOLD) -> exit code 1 neu tut.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../../app.module';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { GOLDEN_DATASET } from './golden-dataset';
import { aggregate, hitRateAtK, EvalCase } from './rag-metrics';

const K = 5;
// Nguong regression — ratchet theo baseline 38 cau (2026-06-15): recall 0.84, mrr 0.71, ndcg 0.69.
// Dat duoi baseline 1 chut de co bien do, nhung du chat de bat khi chat luong tut.
const THRESHOLD = { recall: 0.75, mrr: 0.6, ndcg: 0.6 };

async function main() {
    const logger = new Logger('RagEval');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
        const kb = app.get(KnowledgeBaseService);

        // Map documentId -> title de so voi golden (golden dung "title/slug")
        const docs = await kb.findAll();
        const idToTitle = new Map<string, string>(docs.map((d: any) => [d.id, String(d.title)]));

        const cases: EvalCase[] = [];
        let groundedHits = 0;
        const hitMisses: string[] = [];
        const groundGaps: string[] = [];

        for (const g of GOLDEN_DATASET) {
            const chunks = await kb.searchChunks(g.question, K);
            // retrieved = danh sach title tai lieu (giu thu tu, loai trung)
            const seen = new Set<string>();
            const retrievedTitles: string[] = [];
            for (const c of chunks) {
                const title = idToTitle.get((c as any).documentId) || (c as any).documentId;
                if (!seen.has(title)) { seen.add(title); retrievedTitles.push(title); }
            }
            cases.push({ id: g.id, retrieved: retrievedTitles, relevant: g.relevantDocTitles });

            const isHit = hitRateAtK(retrievedTitles, g.relevantDocTitles, K) === 1;
            const joined = chunks.map((c) => c.content.toLowerCase()).join(' ');
            const missingTerms = g.mustContain.filter((m) => !joined.includes(m.toLowerCase()));
            const isGrounded = missingTerms.length === 0;
            if (isGrounded) groundedHits++;
            if (!isHit) hitMisses.push(`${g.id} "${g.question}" → got [${retrievedTitles.join(', ')}] | kỳ vọng [${g.relevantDocTitles.join(', ')}]`);
            if (!isGrounded) groundGaps.push(`${g.id} "${g.question}" → thiếu term: [${missingTerms.join(', ')}] | got [${retrievedTitles.join(', ')}]`);

            logger.log(`${g.id} ${isHit ? 'HIT ' : 'MISS'} ${isGrounded ? 'GND' : 'GAP'} → [${retrievedTitles.slice(0, 3).join(', ')}]`);
        }

        const m = aggregate(cases, K);
        const grounded = Math.round((groundedHits / GOLDEN_DATASET.length) * 1000) / 1000;

        // eslint-disable-next-line no-console
        console.log('\n══════ RAG EVAL REPORT (K=' + K + ') ══════');
        console.table({
            'Precision@K': m.precision, 'Recall@K': m.recall, 'HitRate@K': m.hitRate,
            'F1@K': m.f1, 'MRR': m.mrr, 'NDCG@K': m.ndcg, 'Groundedness': grounded, 'Cases': m.count,
        });

        const pass = m.recall >= THRESHOLD.recall && m.mrr >= THRESHOLD.mrr && m.ndcg >= THRESHOLD.ndcg;

        if (hitMisses.length) {
            console.log('\n── HitRate MISS (không tìm thấy tài liệu đúng trong top-K) ──');
            hitMisses.forEach((s) => console.log('  ✗ ' + s));
        }
        if (groundGaps.length) {
            console.log('\n── Groundedness GAP (chunk trả về thiếu nội dung — gợi ý bổ sung KB) ──');
            groundGaps.forEach((s) => console.log('  ⚠ ' + s));
        }

        console.log(pass ? '\n✅ PASS regression thresholds' : '\n❌ FAIL regression thresholds', THRESHOLD);
        await app.close();
        process.exit(pass ? 0 : 1);
    } catch (e) {
        logger.error(`Eval failed: ${(e as Error).message}`);
        await app.close();
        process.exit(1);
    }
}

main();
