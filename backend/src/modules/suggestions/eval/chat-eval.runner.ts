/**
 * Chat Tone Eval — do DO TU NHIEN cua cau tra loi (LLM-as-judge).
 *
 * Khac voi rag-eval (do retrieval), file nay do TANG SINH cau tra loi:
 *   - Sinh reply that qua AiProviderService + SYSTEM_PROMPT + KB context.
 *   - Cham diem bang LLM judge: naturalness (giong nguoi that 1-5),
 *     helpfulness (huu ich 1-5), robotic (co dau hieu may moc: ##, **, emoji tieu de).
 *
 * Dung: `npm run eval:chat`  (can DB + GEMINI_API_KEY). Mau 8 cau de nhanh/re.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../../app.module';
import { AiProviderService } from '../ai-provider.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';
import { SYSTEM_PROMPT } from '../prompt-builder.service';
import { GOLDEN_DATASET } from './golden-dataset';
import { intentAccuracy, IntentEvalCase } from './rag-metrics';
import { normalizeIntent } from '../intents';

const SAMPLE = GOLDEN_DATASET.slice(0, 8);

/**
 * Nguong regression cho tang SINH (2026-08-29).
 *
 * Truoc day runner nay luon `process.exit(0)` — tuc chay xong chi de NHIN, khong bao gio bao
 * that bai. Ket qua: chat luong tone/intent tut ma CI van xanh. Nay co nguong that:
 *  - naturalness/helpfulness: thang 1-5 do LLM judge cham;
 *  - roboticRate: ti le cau tra loi bi judge danh dau may moc;
 *  - intentAccuracy: doi chieu `result.intent` voi nhan canonical cua golden dataset. Day la
 *    lan dau field `intent` cua dataset duoc DUNG THAT (truoc audit no la dead field).
 */
const THRESHOLD = {
    naturalness: 3.5,
    helpfulness: 3.5,
    maxRoboticRate: 0.25,
    intentAccuracy: 0.6,
};

async function judge(apiKey: string, question: string, reply: string) {
    const prompt = `Bạn là giám khảo CSKH ngành in. Chấm câu trả lời của nhân viên cho khách.
Khách hỏi: "${question}"
Nhân viên trả lời: "${reply}"

Chấm điểm:
- naturalness: 1-5, mức độ NGHE NHƯ NGƯỜI THẬT nhắn tin (5 = rất tự nhiên, 1 = máy móc/cứng).
- helpfulness: 1-5, mức độ hữu ích/đúng trọng tâm.
- robotic: true nếu có dấu hiệu máy móc (tiêu đề markdown ##, in đậm **, emoji tiêu đề như 📊/💰, liệt kê cứng nhắc kiểu hệ thống).
Chỉ trả JSON: {"naturalness":n,"helpfulness":n,"robotic":true|false,"note":"ngắn"}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        naturalness: { type: 'integer' }, helpfulness: { type: 'integer' },
                        robotic: { type: 'boolean' }, note: { type: 'string' },
                    },
                    required: ['naturalness', 'helpfulness', 'robotic'],
                },
            },
        }),
        signal: AbortSignal.timeout(20000),
    });
    const data: any = await res.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

async function main() {
    const logger = new Logger('ChatEval');
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
        const ai = app.get(AiProviderService);
        const kb = app.get(KnowledgeBaseService);
        const gem = ai.getProviders().find(p => p.name === 'gemini');
        const apiKey = gem?.apiKey || app.get(ConfigService).get<string>('GEMINI_API_KEY') || '';
        if (!apiKey) { console.log('❌ Không tìm thấy key Gemini (env hoặc ai-config.json) để chấm.'); await app.close(); process.exit(1); }
        console.log(`Providers khả dụng: ${ai.getProviders().map(p => p.name).join(', ') || 'KHÔNG CÓ'}`);

        let sumNat = 0, sumHelp = 0, roboticCount = 0, n = 0;
        const intentCases: IntentEvalCase[] = [];
        for (const g of SAMPLE) {
            const chunks = await kb.searchChunks(g.question, 3);
            const kbCtx = chunks.map(c => `- ${c.content.slice(0, 220).replace(/\n/g, ' ')}`).join('\n') || '(không có)';
            const userPrompt = `## Lịch sử hội thoại (mới nhất ở cuối):\nKhách: ${g.question}\n\n## Tài liệu nội bộ liên quan:\n${kbCtx}\n\n## Nhiệm vụ: Soạn phản hồi cho tin nhắn cuối của khách. Trả JSON đúng format đã quy định.`;

            const out = await ai.callWithFallback(SYSTEM_PROMPT, userPrompt);
            const reply = out?.result?.replies?.[0]?.text || '(không sinh được)';
            const j = await judge(apiKey, g.question, reply);
            n++; sumNat += j.naturalness || 0; sumHelp += j.helpfulness || 0; if (j.robotic) roboticCount++;

            const actualIntent = out?.result?.intent;
            intentCases.push({ id: g.id, expected: g.intent, actual: String(actualIntent ?? '') });

            console.log(`\n[${g.id}] ${g.question}`);
            console.log(`  → ${reply.slice(0, 240).replace(/\n/g, ' ⏎ ')}`);
            console.log(`  ⮑ tự nhiên=${j.naturalness} hữu ích=${j.helpfulness} máy móc=${j.robotic} | ${j.note || ''}`);
            console.log(`  ⮑ intent: kỳ vọng=${normalizeIntent(g.intent)} nhận=${normalizeIntent(actualIntent)}`);
        }

        const nat = Math.round((sumNat / n) * 100) / 100;
        const help = Math.round((sumHelp / n) * 100) / 100;
        const roboticRate = Math.round((roboticCount / n) * 100) / 100;
        const im = intentAccuracy(intentCases, normalizeIntent);

        console.log('\n══════ CHAT TONE EVAL ══════');
        console.table({
            'Tự nhiên (1-5)': nat,
            'Hữu ích (1-5)': help,
            'Tỉ lệ máy móc': roboticRate,
            'Đúng intent': im.accuracy,
            'Rơi về "chung"': im.fallbackRate,
            'Mẫu': n,
        });

        if (im.mismatches.length > 0) {
            console.log('\n── Intent lệch ──');
            im.mismatches.forEach((m) => console.log('  ✗ ' + m));
        }

        const pass =
            nat >= THRESHOLD.naturalness &&
            help >= THRESHOLD.helpfulness &&
            roboticRate <= THRESHOLD.maxRoboticRate &&
            im.accuracy >= THRESHOLD.intentAccuracy;
        console.log(pass ? '\n✅ PASS regression thresholds' : '\n❌ FAIL regression thresholds', THRESHOLD);

        await app.close();
        process.exit(pass ? 0 : 1);
    } catch (e) {
        logger.error(`Chat eval failed: ${(e as Error).message}`);
        await app.close();
        process.exit(1);
    }
}

main();
