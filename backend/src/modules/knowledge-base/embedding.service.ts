import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { safeErrorMetadata } from '../../common/logging/safe-log-metadata';

/**
 * Dịch vụ embedding dùng chung (Gemini text-embedding-004, 768 chiều).
 *
 * Trích từ KnowledgeBaseService để KB, trí nhớ AI (AiMemoryService) và tìm
 * hội thoại tương tự (ConversationSearchService) dùng chung một nguồn — tránh
 * lặp logic gọi API và giữ số chiều vector nhất quán.
 */
@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);

    /** Số chiều vector của text-embedding-004 — dùng cho khai báo cột pgvector. */
    static readonly DIMENSIONS = 768;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {}

    async generateEmbedding(text: string): Promise<number[] | null> {
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
            this.logger.warn(`⚠️ Embedding API error (${safeErrorMetadata(e)})`);
            return null;
        }
    }

    cosineSimilarity(a: number[], b: number[]): number {
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
}
