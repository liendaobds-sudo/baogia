/**
 * Backfill vector ngữ nghĩa cho các hội thoại WON đã có aiSummary nhưng chưa có
 * summary_embedding (chạy 1 lần sau migration 2026-07-15_conversation_summary_embedding_pgvector.sql).
 *
 * Chạy: node migrations/backfill_conversation_summary_embedding.js
 * Yêu cầu: Postgres + extension vector + cột summary_embedding đã tồn tại;
 *          biến môi trường AI_PROVIDER_2_KEY hoặc GEMINI_API_KEY để gọi embedding.
 *
 * An toàn chạy lại (idempotent): chỉ xử lý hàng summary_embedding IS NULL.
 * Throttle giữa các lần gọi để tránh chạm rate-limit Gemini.
 */
const { DataSource } = require('typeorm');

const EMBED_MODEL = 'text-embedding-004';
const THROTTLE_MS = 250;        // ~4 req/s — dưới ngưỡng free-tier Gemini
const MAX_CHARS = 2000;         // khớp EmbeddingService

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateEmbedding(apiKey, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.substring(0, MAX_CHARS) }] },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error('unexpected embedding response');
  return values;
}

async function main() {
  const apiKey = process.env.AI_PROVIDER_2_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ Thiếu AI_PROVIDER_2_KEY / GEMINI_API_KEY — không thể sinh embedding.');
    process.exit(1);
  }

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'zeplao_erp',
    synchronize: false,
  });
  await ds.initialize();

  // bypass RLS cho job nền (chạy như super-admin, xử lý mọi tenant).
  try {
    await ds.query(`SET app.bypass = 'on'`);
  } catch (_) { /* RLS chưa bật → bỏ qua */ }

  const rows = await ds.query(
    `SELECT id, ai_summary FROM conversations
     WHERE status = 'won' AND ai_summary IS NOT NULL AND summary_embedding IS NULL`,
  );
  console.log(`🔎 ${rows.length} hội thoại WON cần backfill vector.`);

  let ok = 0, fail = 0;
  for (const row of rows) {
    try {
      const vec = await generateEmbedding(apiKey, row.ai_summary);
      await ds.query(
        `UPDATE conversations SET summary_embedding = $1 WHERE id = $2`,
        [`[${vec.join(',')}]`, row.id],
      );
      ok++;
      if (ok % 20 === 0) console.log(`  … ${ok}/${rows.length}`);
    } catch (e) {
      fail++;
      console.log(`  SKIP ${row.id}: ${(e.message || '').substring(0, 80)}`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`✅ Backfill xong: ${ok} thành công, ${fail} lỗi.`);
  await ds.destroy();
}

main().catch((e) => {
  console.error('❌ Backfill thất bại:', e);
  process.exit(1);
});
