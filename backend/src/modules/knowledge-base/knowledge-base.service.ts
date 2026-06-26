import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { KbDocument, KbDocStatus } from '../../entities/kb-document.entity';
import { KbChunk } from '../../entities/kb-chunk.entity';
import * as fs from 'fs';
import * as path from 'path';

const CHUNK_MAX_CHARS = 1500; // ~375 tokens
const CHUNK_OVERLAP_CHARS = 200;

// ── Search tuning constants ──
const MIN_SCORE_THRESHOLD = 0.15; // Filter out low-relevance chunks
const DIVERSITY_PENALTY = 0.75; // Multiply score for 2nd+ chunk from same doc
const RERANK_CANDIDATE_COUNT = 10; // How many candidates to fetch before re-ranking
const RERANK_ENABLED = true; // Toggle AI re-ranking

@Injectable()
export class KnowledgeBaseService {
    private readonly logger = new Logger(KnowledgeBaseService.name);
    private readonly uploadDir: string;

    constructor(
        @InjectRepository(KbDocument) private docRepo: Repository<KbDocument>,
        @InjectRepository(KbChunk) private chunkRepo: Repository<KbChunk>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.uploadDir = path.resolve(process.cwd(), 'uploads', 'kb');
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    // ===== Document CRUD =====

    async findAll() {
        return this.docRepo.find({
            order: { createdAt: 'DESC' },
            select: ['id', 'title', 'fileType', 'fileSize', 'tags', 'status', 'chunkCount', 'errorMessage', 'createdAt'],
        });
    }

    async findOne(id: string) {
        const doc = await this.docRepo.findOne({ where: { id } });
        if (!doc) throw new NotFoundException('Tài liệu không tồn tại');
        return doc;
    }

    async getChunks(docId: string) {
        return this.chunkRepo.find({
            where: { documentId: docId, isActive: true },
            order: { chunkIndex: 'ASC' },
            select: ['id', 'chunkIndex', 'content', 'tokenCount', 'tags', 'createdAt'],
        });
    }

    // ===== Upload + Process =====

    async uploadAndProcess(
        file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
        uploadedById?: string,
        tags: string[] = [],
    ): Promise<KbDocument> {
        // Determine file type
        const ext = path.extname(file.originalname).toLowerCase();
        const allowed = ['.txt', '.md'];
        if (!allowed.includes(ext)) {
            throw new Error(`File type ${ext} chưa được hỗ trợ. Dùng: ${allowed.join(', ')}`);
        }

        // Save file to local uploads dir
        const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const filePath = path.join(this.uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);

        // Create document record
        const doc = this.docRepo.create({
            title: file.originalname.replace(ext, ''),
            fileUrl: filePath,
            fileType: ext.replace('.', ''),
            fileSize: file.size,
            tags,
            status: KbDocStatus.PROCESSING,
            uploadedById,
        });
        await this.docRepo.save(doc);
        this.logger.log(`📄 KB document created: ${doc.title} (${doc.id})`);

        // Process synchronously (for MVP — move to queue later)
        try {
            await this.processDocument(doc);
        } catch (err: any) {
            doc.status = KbDocStatus.ERROR;
            doc.errorMessage = err.message;
            await this.docRepo.save(doc);
            this.logger.error(`❌ KB processing failed: ${err.message}`);
        }

        return this.findOne(doc.id);
    }

    private async processDocument(doc: KbDocument) {
        this.logger.log(`⚙️ Processing document: ${doc.title}`);

        // Extract text
        const text = fs.readFileSync(doc.fileUrl, 'utf-8');
        if (!text.trim()) {
            throw new Error('File rỗng');
        }

        // Chunk the text
        const chunks = this.chunkText(text, doc.tags || []);
        this.logger.log(`📝 Split into ${chunks.length} chunks`);

        // Save chunks with embeddings + smart metadata
        const parentChunkIds = new Map<string, string>(); // parentHeading → first chunk ID

        for (let i = 0; i < chunks.length; i++) {
            let embedding: number[] | undefined;
            try {
                embedding = (await this.generateEmbedding(chunks[i].content)) || undefined;
            } catch (e) {
                this.logger.warn(`⚠️ Embedding failed for chunk ${i}: ${(e as Error).message}`);
            }

            // Determine parent chunk ID (first chunk in same parent heading section)
            const parentHeading = (chunks[i] as any).parentHeading;
            let parentChunkId: string | undefined;
            if (parentHeading && parentChunkIds.has(parentHeading)) {
                parentChunkId = parentChunkIds.get(parentHeading);
            }

            const chunk = this.chunkRepo.create({
                documentId: doc.id,
                chunkIndex: i,
                content: chunks[i].content,
                tokenCount: Math.ceil(chunks[i].content.length / 4), // rough estimate
                tags: chunks[i].tags,
                metadata: {
                    heading: chunks[i].heading,
                    parentHeading,
                },
                chunkType: (chunks[i] as any).chunkType || 'paragraph',
                ...(parentChunkId ? { parentChunkId } : {}),
                ...(embedding ? { embedding } : {}),
            });
            const saved = await this.chunkRepo.save(chunk);

            // Track as parent for subsequent chunks in same section
            if (parentHeading && !parentChunkIds.has(parentHeading)) {
                parentChunkIds.set(parentHeading, saved.id);
            }
        }

        // Update document status
        doc.status = KbDocStatus.INDEXED;
        doc.chunkCount = chunks.length;
        await this.docRepo.save(doc);
        this.logger.log(`✅ KB document indexed: ${doc.title} (${chunks.length} chunks${chunks.length > 0 ? ', with embeddings' : ''})`);
    }

    /**
     * Smart semantic chunking:
     * 1. Split by ## sections (level-2 headings = main topics)
     * 2. Within each section, respect paragraph/list/table boundaries
     * 3. Detect chunk content type (heading/list/table/paragraph/mixed)
     * 4. Track parent section heading for context retrieval
     */
    private chunkText(text: string, docTags: string[]): {
        content: string; tags: string[]; heading?: string; chunkType?: string; parentHeading?: string;
    }[] {
        const chunks: {
            content: string; tags: string[]; heading?: string; chunkType?: string; parentHeading?: string;
        }[] = [];

        // Split by level-2 headings (## Section) as main topic boundaries
        const sections = text.split(/(?=^##\s)/m);

        for (const section of sections) {
            const trimmed = section.trim();
            if (!trimmed) continue;

            // Extract section heading
            const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
            const heading = headingMatch ? headingMatch[2].trim() : undefined;

            if (trimmed.length <= CHUNK_MAX_CHARS) {
                // Small enough — keep as one chunk
                chunks.push({
                    content: trimmed,
                    tags: docTags,
                    heading,
                    chunkType: this.detectChunkType(trimmed),
                    parentHeading: heading,
                });
            } else {
                // Large section — split by semantic boundaries within it
                const subChunks = this.splitBySemantic(trimmed, heading);
                for (const sub of subChunks) {
                    chunks.push({
                        content: sub.content,
                        tags: docTags,
                        heading: sub.heading || heading,
                        chunkType: sub.chunkType,
                        parentHeading: heading,
                    });
                }
            }
        }

        return chunks;
    }

    /**
     * Split a large section by semantic boundaries:
     * 1. Try sub-headings (###) first
     * 2. Then paragraph breaks (\n\n)
     * 3. Then list blocks
     * 4. Fallback to smart overlap at sentence boundaries
     */
    private splitBySemantic(text: string, parentHeading?: string): {
        content: string; heading?: string; chunkType?: string;
    }[] {
        const results: { content: string; heading?: string; chunkType?: string }[] = [];

        // Strategy 1: Split by sub-headings (### Sub-section)
        const subSections = text.split(/(?=^###\s)/m);
        if (subSections.length > 1) {
            let accumulator = '';
            let currentHeading = parentHeading;

            for (const sub of subSections) {
                const trimmed = sub.trim();
                if (!trimmed) continue;

                const subHeadingMatch = trimmed.match(/^###\s+(.+)/);
                if (subHeadingMatch) currentHeading = subHeadingMatch[1].trim();

                // Can we add this to current accumulator?
                if (accumulator && (accumulator + '\n\n' + trimmed).length <= CHUNK_MAX_CHARS) {
                    accumulator += '\n\n' + trimmed;
                } else {
                    if (accumulator) {
                        results.push({
                            content: accumulator,
                            heading: currentHeading,
                            chunkType: this.detectChunkType(accumulator),
                        });
                    }
                    accumulator = trimmed;
                }
            }
            if (accumulator) {
                results.push({
                    content: accumulator,
                    heading: currentHeading,
                    chunkType: this.detectChunkType(accumulator),
                });
            }

            // Check if all results are small enough
            if (results.every(r => r.content.length <= CHUNK_MAX_CHARS)) {
                return results;
            }
        }

        // Strategy 2: Split by paragraph/block boundaries
        if (results.length === 0 || results.some(r => r.content.length > CHUNK_MAX_CHARS)) {
            const toSplit = results.length > 0
                ? results.filter(r => r.content.length > CHUNK_MAX_CHARS).map(r => r.content)
                : [text];

            const blockResults: typeof results = [];
            for (const block of toSplit) {
                const paragraphs = block.split(/\n\n+/);
                let accumulator = '';

                for (const para of paragraphs) {
                    const trimmed = para.trim();
                    if (!trimmed) continue;

                    if (accumulator && (accumulator + '\n\n' + trimmed).length > CHUNK_MAX_CHARS) {
                        blockResults.push({
                            content: accumulator,
                            heading: parentHeading,
                            chunkType: this.detectChunkType(accumulator),
                        });
                        accumulator = trimmed;
                    } else {
                        accumulator = accumulator ? accumulator + '\n\n' + trimmed : trimmed;
                    }
                }
                if (accumulator) {
                    blockResults.push({
                        content: accumulator,
                        heading: parentHeading,
                        chunkType: this.detectChunkType(accumulator),
                    });
                }
            }

            // Keep small results from sub-heading split, replace large ones
            const finalResults = results.length > 0
                ? [...results.filter(r => r.content.length <= CHUNK_MAX_CHARS), ...blockResults]
                : blockResults;

            // If still too large, fallback to smart sentence-boundary overlap
            return finalResults.map(r => {
                if (r.content.length <= CHUNK_MAX_CHARS) return r;
                return this.splitAtSentenceBoundary(r.content, r.heading).map(sub => ({
                    content: sub,
                    heading: r.heading,
                    chunkType: this.detectChunkType(sub),
                }));
            }).flat();
        }

        return results;
    }

    /**
     * Detect the content type of a chunk for metadata enrichment.
     */
    private detectChunkType(content: string): string {
        const lines = content.split('\n').filter(l => l.trim());
        const listLines = lines.filter(l => /^\s*[-*•]\s/.test(l) || /^\s*\d+[.)]\s/.test(l));
        const tableLines = lines.filter(l => l.includes('|') && l.trim().startsWith('|'));
        const headingLines = lines.filter(l => /^#{1,4}\s/.test(l));

        if (tableLines.length > 2) return 'table';
        if (listLines.length > lines.length * 0.5) return 'list';
        if (headingLines.length > 0 && lines.length <= 2) return 'heading';
        if (listLines.length > 0 || tableLines.length > 0) return 'mixed';
        return 'paragraph';
    }

    /**
     * Smart overlap at sentence boundaries instead of fixed character position.
     */
    private splitAtSentenceBoundary(text: string, heading?: string): string[] {
        const chunks: string[] = [];
        const sentences = text.split(/(?<=[.!?。]\s)|(?<=\n)/);
        let current = '';

        for (const sentence of sentences) {
            if (current && (current + sentence).length > CHUNK_MAX_CHARS) {
                chunks.push(current.trim());
                // Overlap: keep last ~200 chars of context
                const overlapStart = Math.max(0, current.length - CHUNK_OVERLAP_CHARS);
                const overlapText = current.substring(overlapStart);
                current = overlapText + sentence;
            } else {
                current += sentence;
            }
        }
        if (current.trim().length > 20) {
            chunks.push(current.trim());
        }
        return chunks;
    }

    // ===== Search =====

    // Vietnamese stopwords — excluded from search scoring
    private static readonly STOP_WORDS = new Set([
        'của', 'và', 'là', 'cho', 'với', 'các', 'có', 'được', 'trong', 'không',
        'một', 'này', 'những', 'để', 'theo', 'về', 'từ', 'đến', 'tại', 'bạn',
        'em', 'anh', 'chị', 'mình', 'tôi', 'nào', 'hay', 'hoặc', 'nếu', 'thì',
        'cần', 'muốn', 'hỏi', 'giúp', 'bên', 'cho', 'vào', 'ra', 'lên', 'xuống',
        'rất', 'lắm', 'quá', 'nhất', 'hơn', 'đã', 'đang', 'sẽ', 'vẫn', 'còn',
        'the', 'is', 'and', 'for', 'with', 'this', 'that',
    ]);

    async searchChunks(query: string, limit = 5): Promise<KbChunk[]> {
        // ── Step 1: Tokenize & filter stopwords ──
        const words = query.toLowerCase()
            .split(/[\s,;.!?]+/)
            .filter(w => w.length > 1 && !KnowledgeBaseService.STOP_WORDS.has(w));
        // ── HYBRID RETRIEVAL (sửa lỗi recall) ──
        // TRƯỚC: lọc ứng viên bằng SQL LIKE %từ_khóa% → vector chỉ re-rank trên các
        //   chunk đã trùng từ khóa ⇒ mất hoàn toàn các chunk gần nghĩa nhưng khác từ
        //   (rất phổ biến tiếng Việt: đồng nghĩa, viết tắt, không dấu).
        // NAY: lấy TOÀN BỘ chunk active làm ứng viên, để điểm dense (vector) có thể
        //   đưa chunk gần nghĩa vào kết quả dù KHÔNG trùng từ khóa nào.
        //   (KB nhỏ/markdown nên quét toàn bộ chấp nhận được; khi scale → pgvector/HNSW.)
        const relevantChunks = await this.chunkRepo.find({ where: { isActive: true } });
        const totalDocs = relevantChunks.length;
        if (totalDocs === 0) return [];
        // Không early-return khi words rỗng: vẫn truy hồi được bằng dense-only.

        const idf: Record<string, number> = {};
        for (const word of words) {
            const docsWithWord = relevantChunks.filter(c => c.content.toLowerCase().includes(word)).length;
            idf[word] = Math.log((totalDocs + 1) / (1 + docsWithWord)) + 1;
        }

        // ── Step 3: Generate query embedding for vector search ──
        let queryEmbedding: number[] | null = null;
        const hasEmbeddings = relevantChunks.some(c => c.embedding && c.embedding.length > 0);
        if (hasEmbeddings) {
            try {
                queryEmbedding = await this.generateEmbedding(query);
            } catch (e) {
                this.logger.warn(`⚠️ Query embedding failed, falling back to TF-IDF only: ${(e as Error).message}`);
            }
        }

        // ── Step 4: Score each chunk (TF-IDF + vector, optimized) ──
        // Pre-compute raw TF-IDF scores for relevant chunks first (avoids O(n²) inside the loop)
        const rawTfidfScores = relevantChunks.map(chunk => {
            const lower = chunk.content.toLowerCase();
            const contentLen = Math.max(lower.length, 1);
            let score = 0;
            for (const word of words) {
                const matches = lower.split(word).length - 1;
                if (matches > 0) {
                    const tf = matches / (contentLen / 100);
                    score += tf * idf[word];
                }
            }

            // Tag boost — chunk tags match search words → x1.5
            if (score > 0) {
                const tagStr = (chunk.tags || []).join(' ').toLowerCase();
                for (const word of words) {
                    if (tagStr.includes(word)) { score *= 1.5; break; }
                }
                // Heading boost — chunk heading matches → x1.3
                const heading = ((chunk.metadata as any)?.heading || '').toLowerCase();
                for (const word of words) {
                    if (heading.includes(word)) { score *= 1.3; break; }
                }
            }
            return score;
        });

        // Single-pass maxTfidf computation (was O(n²), now O(n))
        const maxTfidf = Math.max(...rawTfidfScores, 1);

        // ── Step 4 (RRF FUSION chuẩn): fuse 2 ranked list sparse + dense ──
        // Thay cho blend 0.6/0.4 cũ (lệch về TF-IDF). RRF = Σ 1/(k + rank), k=60 —
        // chuẩn hợp nhất rank, robust với thang điểm khác nhau giữa sparse và dense.
        const RRF_K = 60;
        const sparseRanked = relevantChunks
            .map((chunk, idx) => ({ chunk, s: rawTfidfScores[idx] }))
            .filter(x => x.s > 0)
            .sort((a, b) => b.s - a.s);
        const denseRanked = queryEmbedding
            ? relevantChunks
                .map(chunk => ({
                    chunk,
                    s: (chunk.embedding && chunk.embedding.length > 0)
                        ? Math.max(0, this.cosineSimilarity(queryEmbedding!, chunk.embedding))
                        : 0,
                }))
                .filter(x => x.s > 0)
                .sort((a, b) => b.s - a.s)
            : [];

        const rrf = new Map<string, { chunk: KbChunk; score: number }>();
        const addList = (list: { chunk: KbChunk }[]) => {
            list.forEach((x, rank) => {
                const inc = 1 / (RRF_K + rank + 1);
                const cur = rrf.get(x.chunk.id);
                if (cur) cur.score += inc;
                else rrf.set(x.chunk.id, { chunk: x.chunk, score: inc });
            });
        };
        addList(sparseRanked);
        addList(denseRanked);

        let candidates = Array.from(rrf.values()).sort((a, b) => b.score - a.score);
        if (candidates.length === 0) return [];

        // ── Step 6: Diversity penalty — reduce score for 2nd+ chunk from same doc ──
        const docSeenCount = new Map<string, number>();
        candidates = candidates.map(c => {
            const docId = c.chunk.documentId;
            const seen = docSeenCount.get(docId) || 0;
            docSeenCount.set(docId, seen + 1);
            if (seen > 0) {
                // Apply exponential penalty: 2nd chunk = 0.75x, 3rd = 0.56x, etc.
                return { ...c, score: c.score * Math.pow(DIVERSITY_PENALTY, seen) };
            }
            return c;
        }).sort((a, b) => b.score - a.score);

        // ── Step 7: AI Re-ranking (cross-encoder style) ──
        const candidateLimit = Math.min(RERANK_CANDIDATE_COUNT, candidates.length);
        let topCandidates = candidates.slice(0, candidateLimit);

        if (RERANK_ENABLED && topCandidates.length > 2) {
            try {
                topCandidates = await this.reRankWithAI(query, topCandidates);
            } catch (e) {
                this.logger.warn(`⚠️ AI re-ranking failed, using original order: ${(e as Error).message}`);
            }
        }

        const results = topCandidates.slice(0, limit);
        this.logger.log(`🔍 KB search: ${relevantChunks.length} chunks → ${candidates.length} above threshold → ${results.length} returned (query="${query.substring(0, 60)}")`);

        // Attach score metadata to chunks for downstream use
        return results.map(s => {
            (s.chunk as any)._score = s.score;
            return s.chunk;
        });
    }

    /**
     * AI-powered re-ranking: ask Gemini to score relevance of each chunk vs query.
     * Lightweight call — only sends chunk snippets, not full content.
     */
    private async reRankWithAI<T extends { chunk: KbChunk; score: number }>(
        query: string,
        candidates: T[],
    ): Promise<T[]> {
        const apiKey = this.configService.get<string>('AI_PROVIDER_2_KEY') || this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) return candidates;

        // Build compact prompt with chunk snippets
        const snippets = candidates.map((c, i) => {
            const heading = (c.chunk.metadata as any)?.heading || '';
            const snippet = c.chunk.content.substring(0, 250).replace(/\n/g, ' ');
            return `[${i}]${heading ? ` (${heading})` : ''}: ${snippet}`;
        }).join('\n');

        const prompt = `Bạn là AI đánh giá relevance. Cho câu hỏi: "${query.substring(0, 200)}"

Đánh giá TỪNG đoạn văn dưới đây có liên quan đến câu hỏi không. Trả về JSON array gồm scores:
{"scores": [0.9, 0.3, 0.7, ...]}
Mỗi score từ 0.0 (hoàn toàn không liên quan) đến 1.0 (trực tiếp trả lời câu hỏi).
Chỉ trả JSON, không giải thích.

${snippets}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 200,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: 'object',
                        properties: {
                            scores: {
                                type: 'array',
                                items: { type: 'number' },
                            },
                        },
                        required: ['scores'],
                    },
                },
            }),
            signal: AbortSignal.timeout(8000),
        });

        if (!response.ok) {
            throw new Error(`Gemini re-rank API ${response.status}`);
        }

        const data: any = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty re-rank response');

        const parsed = JSON.parse(text);
        const scores: number[] = parsed.scores || [];

        if (scores.length !== candidates.length) {
            this.logger.warn(`⚠️ Re-rank returned ${scores.length} scores for ${candidates.length} candidates`);
            return candidates;
        }

        // Blend: 40% original score + 60% AI re-rank score
        const maxOriginal = Math.max(...candidates.map(c => c.score), 1);
        const reranked = candidates.map((c, i) => ({
            ...c,
            score: 0.4 * (c.score / maxOriginal) + 0.6 * (scores[i] || 0),
        }));

        reranked.sort((a, b) => b.score - a.score);
        this.logger.log(`🏆 AI re-ranked ${candidates.length} chunks (top: ${reranked[0]?.score.toFixed(2)} → ${reranked.slice(-1)[0]?.score.toFixed(2)})`);
        return reranked;
    }

    // ===== Embedding & Vector Utils =====

    private async generateEmbedding(text: string): Promise<number[] | null> {
        const apiKey = this.configService.get<string>('AI_PROVIDER_2_KEY') || this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) {
            this.logger.warn('⚠️ No Gemini API key found for embeddings');
            return null;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
        const truncatedText = text.substring(0, 2000); // Gemini limit

        try {
            const response = await this.httpService.axiosRef.post(url, {
                model: 'models/text-embedding-004',
                content: { parts: [{ text: truncatedText }] },
            }, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' },
            });

            const values = response.data?.embedding?.values;
            if (values && Array.isArray(values)) {
                return values;
            }
            this.logger.warn('⚠️ Unexpected embedding response format');
            return null;
        } catch (e: any) {
            this.logger.warn(`⚠️ Embedding API error: ${e.message}`);
            return null;
        }
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * Re-chunk all documents using the new smart chunking.
     * Detects documents with old-format chunks (missing chunkType) and re-processes them.
     * Safe to call on every startup — only re-chunks when needed.
     */
    async rechunkAllDocuments(): Promise<{ total: number; rechunked: number; skipped: number }> {
        const docs = await this.docRepo.find({ where: { status: KbDocStatus.INDEXED } });
        let rechunked = 0, skipped = 0;

        for (const doc of docs) {
            // Check if this document's chunks already have smart chunking metadata
            const chunks = await this.chunkRepo.find({
                where: { documentId: doc.id, isActive: true },
                take: 1,
            });

            if (chunks.length > 0 && chunks[0].chunkType) {
                skipped++;
                continue; // Already has smart chunking
            }

            // Re-process this document with smart chunking
            this.logger.log(`🔄 Re-chunking: ${doc.title} (old format detected)`);
            try {
                // Delete old chunks
                await this.chunkRepo.delete({ documentId: doc.id });

                // Re-process with smart chunking
                if (doc.fileUrl && fs.existsSync(doc.fileUrl)) {
                    await this.processDocument(doc);
                    rechunked++;
                    this.logger.log(`✅ Re-chunked: ${doc.title} (${doc.chunkCount} chunks)`);
                } else {
                    this.logger.warn(`⚠️ File missing for ${doc.title}, skipping re-chunk`);
                    skipped++;
                }
            } catch (err: any) {
                this.logger.error(`❌ Re-chunk failed for ${doc.title}: ${err.message}`);
                skipped++;
            }
        }

        this.logger.log(`🔄 Re-chunk complete: ${rechunked}/${docs.length} documents updated (${skipped} skipped)`);
        return { total: docs.length, rechunked, skipped };
    }

    // Re-index existing chunks with embeddings
    async reindexEmbeddings(): Promise<{ total: number; success: number; failed: number }> {
        const chunks = await this.chunkRepo.find({ where: { isActive: true } });
        let success = 0, failed = 0;

        for (const chunk of chunks) {
            if (chunk.embedding && chunk.embedding.length > 0) {
                success++; // already has embedding
                continue;
            }
            try {
                const embedding = await this.generateEmbedding(chunk.content);
                if (embedding) {
                    chunk.embedding = embedding;
                    await this.chunkRepo.save(chunk);
                    success++;
                } else {
                    failed++;
                }
            } catch {
                failed++;
            }
        }

        this.logger.log(`🔄 Reindex complete: ${success}/${chunks.length} chunks with embeddings (${failed} failed)`);
        return { total: chunks.length, success, failed };
    }

    // ===== Get raw content for editing =====

    async getDocumentContent(id: string): Promise<{ content: string; title: string; tags: string[] }> {
        const doc = await this.findOne(id);
        let content = '';
        if (doc.fileUrl && fs.existsSync(doc.fileUrl)) {
            content = fs.readFileSync(doc.fileUrl, 'utf-8');
        }
        return { content, title: doc.title, tags: doc.tags || [] };
    }

    // ===== Update content (edit + re-chunk) =====

    async updateContent(id: string, newContent: string, title?: string, tags?: string[]): Promise<KbDocument> {
        const doc = await this.findOne(id);

        // Update file on disk
        if (doc.fileUrl && fs.existsSync(doc.fileUrl)) {
            fs.writeFileSync(doc.fileUrl, newContent, 'utf-8');
        } else {
            // Create new file if somehow missing
            const filename = `${Date.now()}-${doc.title.replace(/[^a-zA-Z0-9.-]/g, '_')}.md`;
            const filePath = path.join(this.uploadDir, filename);
            fs.writeFileSync(filePath, newContent, 'utf-8');
            doc.fileUrl = filePath;
        }

        // Update metadata
        if (title) doc.title = title;
        if (tags) doc.tags = tags;
        doc.fileSize = Buffer.byteLength(newContent, 'utf-8');
        doc.status = KbDocStatus.PROCESSING;
        await this.docRepo.save(doc);

        // Delete old chunks
        await this.chunkRepo.delete({ documentId: id });

        // Re-chunk
        try {
            await this.processDocument(doc);
            this.logger.log(`✅ KB document updated & re-indexed: ${doc.title} (${doc.chunkCount} chunks)`);
        } catch (err: any) {
            doc.status = KbDocStatus.ERROR;
            doc.errorMessage = err.message;
            await this.docRepo.save(doc);
            this.logger.error(`❌ KB re-processing failed: ${err.message}`);
        }

        return this.findOne(id);
    }

    // ===== Delete =====

    async deleteDocument(id: string) {
        const doc = await this.findOne(id);

        // Delete chunks
        await this.chunkRepo.delete({ documentId: id });

        // Delete file
        if (doc.fileUrl && fs.existsSync(doc.fileUrl)) {
            fs.unlinkSync(doc.fileUrl);
        }

        await this.docRepo.remove(doc);
        this.logger.log(`🗑️ KB document deleted: ${doc.title}`);
    }
}
