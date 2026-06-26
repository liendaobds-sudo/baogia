/**
 * Query Expansion Service
 * Expands customer queries using:
 * 1. Synonym/keyword expansion from printing-knowledge.json
 * 2. LLM-based query reformulation for complex queries
 * 3. Multi-query generation for comprehensive KB retrieval
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContextInferenceService } from './context-inference.service';

// Common Vietnamese printing synonyms not in the knowledge base
const SYNONYM_MAP: Record<string, string[]> = {
    'tem': ['decal', 'nhãn', 'sticker', 'label', 'nhãn dán', 'tem nhãn'],
    'decal': ['tem', 'nhãn', 'sticker', 'nhãn dán'],
    'sticker': ['tem', 'decal', 'nhãn', 'nhãn dán'],
    'nhãn': ['tem', 'decal', 'sticker', 'nhãn dán'],
    'card': ['namecard', 'danh thiếp', 'name card', 'card visit'],
    'namecard': ['card', 'danh thiếp', 'card visit', 'thẻ tên'],
    'danh thiếp': ['namecard', 'card', 'card visit'],
    'flyer': ['tờ rơi', 'tờ quảng cáo', 'leaflet', 'rơi'],
    'tờ rơi': ['flyer', 'leaflet', 'tờ quảng cáo'],
    'brochure': ['tờ gấp', 'leaflet gấp', 'trifold', 'bifold'],
    'tờ gấp': ['brochure', 'trifold', 'bifold'],
    'banner': ['băng rôn', 'bạt', 'phông', 'backdrop', 'hiflex'],
    'băng rôn': ['banner', 'bạt', 'hiflex'],
    'catalogue': ['catalog', 'sách', 'profile', 'hồ sơ năng lực'],
    'hồ sơ': ['catalogue', 'catalog', 'profile', 'company profile'],
    'menu': ['thực đơn', 'menu nhà hàng', 'menu quán'],
    'thực đơn': ['menu'],
    'poster': ['áp phích', 'tranh', 'hình treo'],
    'standee': ['x-banner', 'roll-up', 'banner chân'],
    'hộp': ['hộp giấy', 'packaging', 'bao bì', 'hộp sản phẩm'],
    'túi': ['túi giấy', 'túi xách', 'shopping bag'],
    'phong bì': ['envelope', 'bì thư'],
    'voucher': ['coupon', 'phiếu giảm giá', 'thẻ quà', 'gift card'],

    // Material synonyms
    'couche': ['giấy couche', 'giấy tráng phủ'],
    'kraft': ['giấy kraft', 'giấy nâu', 'giấy tái chế'],
    'ivory': ['giấy ivory', 'giấy ngà'],
    'pvc': ['nhựa pvc', 'decal nhựa', 'nhựa'],

    // Finishing synonyms
    'cán mờ': ['cán matte', 'matte', 'phủ mờ', 'cán mịn'],
    'cán bóng': ['glossy', 'phủ bóng', 'cán láng'],
    'ép nhũ': ['foil', 'hot foil', 'nhũ vàng', 'nhũ bạc', 'ép kim'],
    'bế': ['die-cut', 'bế hình', 'cắt hình', 'bế theo hình'],
    'uv': ['sơn uv', 'in uv', 'uv nổi', 'uv cục bộ'],
    'chống nước': ['waterproof', 'không thấm nước', 'chịu nước'],
};

@Injectable()
export class QueryExpansionService {
    private readonly logger = new Logger(QueryExpansionService.name);

    constructor(
        private readonly contextInference: ContextInferenceService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Expand a customer query into multiple search queries for better KB retrieval.
     * Returns array of queries (original + expanded versions).
     */
    expandQuery(customerText: string, productMatch?: any): string[] {
        const queries: string[] = [];
        const textLower = customerText.toLowerCase().trim();

        // 1. Original query (always included)
        queries.push(customerText);

        // 2. Synonym expansion — find matching synonyms and create alternative queries
        const synonymExpanded = this.expandWithSynonyms(textLower);
        if (synonymExpanded && synonymExpanded !== textLower) {
            queries.push(synonymExpanded);
        }

        // 3. Product-specific expansion from knowledge base data
        const knowledgeData = this.contextInference.getKnowledgeData();
        if (knowledgeData?.products) {
            for (const [, product] of Object.entries<any>(knowledgeData.products)) {
                const keywords: string[] = product.keywords || [];
                if (keywords.some(kw => textLower.includes(kw.toLowerCase()))) {
                    // Add displayName as an alternative search term
                    const displayQuery = `${product.displayName} ${customerText}`;
                    if (!queries.includes(displayQuery)) {
                        queries.push(displayQuery);
                    }

                    // Add usage-based expansion: if customer mentions a use case
                    if (product.usageRules) {
                        for (const rule of product.usageRules) {
                            const contextMatches = (rule.context || []).some(
                                (ctx: string) => textLower.includes(ctx.toLowerCase())
                            );
                            if (contextMatches && rule.material?.name) {
                                const materialQuery = `${rule.material.name} ${product.displayName}`;
                                if (!queries.includes(materialQuery)) {
                                    queries.push(materialQuery);
                                }
                            }
                        }
                    }
                    break; // Only expand for the first matching product
                }
            }
        }

        // 4. If product match detected, add its name to search
        if (productMatch?.product) {
            const productQuery = `${productMatch.product} ${customerText.substring(0, 100)}`;
            if (!queries.includes(productQuery)) {
                queries.push(productQuery);
            }
        }

        // Deduplicate and limit
        const unique = [...new Set(queries)].slice(0, 4);
        if (unique.length > 1) {
            this.logger.log(`🔀 Query expanded: "${customerText.substring(0, 50)}" → ${unique.length} queries`);
        }
        return unique;
    }

    /**
     * Replace known terms with their synonyms to create an alternative search string.
     */
    private expandWithSynonyms(text: string): string {
        let expanded = text;
        let hasExpansion = false;

        for (const [term, synonyms] of Object.entries(SYNONYM_MAP)) {
            // Use word boundary matching to avoid partial replacements
            const termRegex = new RegExp(`\\b${this.escapeRegex(term)}\\b`, 'gi');
            if (termRegex.test(text)) {
                // Add the top 2 synonyms that aren't already in the text
                const newSynonyms = synonyms
                    .filter(s => !text.includes(s.toLowerCase()))
                    .slice(0, 2);
                if (newSynonyms.length > 0) {
                    expanded += ' ' + newSynonyms.join(' ');
                    hasExpansion = true;
                }
            }
        }

        return hasExpansion ? expanded : text;
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * LLM-based query reformulation for complex customer messages.
     * Only use for longer messages where synonym expansion isn't enough.
     */
    async reformulateWithLLM(customerText: string): Promise<string | null> {
        // Only reformulate complex queries (long messages with multiple intents)
        if (customerText.length < 40) return null;

        const apiKey = this.configService.get<string>('AI_PROVIDER_2_KEY') || this.configService.get<string>('GEMINI_API_KEY');
        if (!apiKey) return null;

        try {
            const prompt = `Khách hàng hỏi: "${customerText.substring(0, 300)}"

Viết lại thành 1 câu tìm kiếm ngắn gọn (dưới 50 từ) để tìm tài liệu in ấn liên quan.
Giữ nguyên tiếng Việt, tập trung vào: loại sản phẩm, chất liệu, mục đích sử dụng.
Chỉ trả về câu tìm kiếm, không giải thích.`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 100,
                    },
                }),
                signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) return null;

            const data: any = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text && text.length > 5 && text.length < 300) {
                this.logger.log(`🤖 LLM reformulated query: "${text.substring(0, 80)}"`);
                return text;
            }
        } catch (e) {
            this.logger.warn(`⚠️ LLM query reformulation failed: ${(e as Error).message}`);
        }
        return null;
    }
}
