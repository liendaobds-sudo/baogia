/**
 * AI Suggest Service (Orchestrator)
 * Coordinates the AI suggestion pipeline:
 * 1. Load conversation context + customer profile
 * 2. Detect product, search KB, match canned responses
 * 3. Parse quote + calculate pricing
 * 4. Build prompt with all context
 * 5. Call AI provider (with fallback)
 * 6. Validate + save suggestion
 *
 * Refactored from 1503-line monolith into orchestrator pattern.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiSuggestion, SuggestionStatus } from '../../entities/ai-suggestion.entity';
import { Message } from '../../entities/message.entity';
import { Conversation, ConversationPriority } from '../../entities/conversation.entity';
import { Contact } from '../../entities/contact.entity';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { EventsGateway } from '../gateway/events.gateway';
import { QuoteParserService } from '../quote/quote-parser.service';
import { QuoteService } from '../quote/quote.service';
import { isAuthoritativePricingResult, PricingResult } from '../quote/quote.interfaces';
import { CannedResponseService } from '../canned-responses/canned-response.service';
import { AiLearningService } from './ai-learning.service';
import { AiProviderService } from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { ContextInferenceService } from './context-inference.service';
import { TemplateFallbackService } from './template-fallback.service';
import { QueryExpansionService } from './query-expansion.service';
import { AgentPipelineService } from './agent-pipeline.service';
import { PricingCatalogCacheService } from './pricing-catalog-cache.service';
import { ProfileBuilderService } from './profile-builder.service';
import { AutoReplyService } from './auto-reply.service';
import { ConversationSummaryService } from './conversation-summary.service';
import { OutcomeLearningService } from './outcome-learning.service';
import { ConversationSearchService } from './conversation-search.service';
import {
    Intent, INTENT_TAG_MAP, MEMORY_TRIGGER_INTENTS, normalizeIntent,
    isConversationTopic, type ConversationTopic,
} from './intents';
import { AiMemoryService } from './ai-memory.service';
import { ProductsService } from '../pricing/services/products.service';
import {
    detectProduct, loadProductTemplates, findProductTemplateById,
    type ProductTemplate,
} from '../quote/extractors';
import { checkPrintingConstraints } from './printing-constraints';
import { safeErrorMetadata, sensitiveTextMetadata } from '../../common/logging/safe-log-metadata';

// Pricing API URL is now fetched via ConfigService

// Auto-reply config check removed. Delegate to AutoReplyService.
const KB_CACHE_TTL_MS = 5 * 60 * 1000;
const SHORT_REPLIES = ['có', 'không', 'ko', 'ok', 'vâng', 'ừ', 'dạ', 'rồi', 'chưa', 'đúng', 'đúng rồi', 'sai', 'được', 'dc', 'da', 'vang', 'u', 'oke', 'yes', 'no', 'yep'];

// Cache limits
const KB_CACHE_MAX_SIZE = 100;

/**
 * Thử đọc câu trả lời TEXT của agent pipeline thành đúng hình dạng JSON mà downstream cần
 * (`{ replies: [...] }`). Trả `null` nếu không parse được — caller khi đó vẫn đi đường
 * `callWithFallback` như trước, nên đây thuần là tối ưu chi phí, không hạ chất lượng.
 *
 * Chấp nhận cả trường hợp model bọc JSON trong code fence ```json ... ``` (rất phổ biến).
 */
export function parseAgentJsonResponse(raw: string | null | undefined): any | null {
    if (!raw || typeof raw !== 'string') return null;
    let text = raw.trim();

    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (fence) text = fence[1].trim();
    else {
        // Cắt lấy khối JSON ngoài cùng nếu model chèn thêm lời dẫn.
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) text = text.slice(start, end + 1);
    }

    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        if (!Array.isArray(parsed.replies) || parsed.replies.length === 0) return null;
        const hasText = parsed.replies.some(
            (r: unknown) => r && typeof (r as { text?: unknown }).text === 'string' && (r as { text: string }).text.trim(),
        );
        return hasText ? parsed : null;
    } catch {
        return null;
    }
}

@Injectable()
export class AiSuggestService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AiSuggestService.name);

    // Caches with size limits
    private kbCache = new Map<string, { results: any[]; timestamp: number }>();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private locks = new Map<string, Promise<any>>();

    private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
        const current = this.locks.get(key) || Promise.resolve();
        const next = current.catch(() => {}).then(fn);
        this.locks.set(key, next);
        next.finally(() => {
            if (this.locks.get(key) === next) {
                this.locks.delete(key);
            }
        });
        return next;
    }

    constructor(
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Contact) private contactRepo: Repository<Contact>,
        private kbService: KnowledgeBaseService,
        private gateway: EventsGateway,
        private quoteParser: QuoteParserService,
        private quoteService: QuoteService,
        private cannedService: CannedResponseService,
        @Inject(forwardRef(() => AiLearningService)) private learningService: AiLearningService,
        private aiProvider: AiProviderService,
        private promptBuilder: PromptBuilderService,
        private contextInference: ContextInferenceService,
        private templateFallback: TemplateFallbackService,
        private queryExpansion: QueryExpansionService,
        private agentPipeline: AgentPipelineService,
        private configService: ConfigService,
        private pricingCache: PricingCatalogCacheService,
        private profileBuilder: ProfileBuilderService,
        private autoReplyService: AutoReplyService,
        private summaryService: ConversationSummaryService,
        private outcomeLearning: OutcomeLearningService,
        private convSearch: ConversationSearchService,
        private aiMemory: AiMemoryService,
        private productsService: ProductsService,
    ) { }

    /** Mọi realtime suggestion phải có tenant tường minh; thiếu tenant thì drop fail-closed. */
    private emitSuggestionGenerated(
        tenantId: number | null | undefined,
        conversationId: string,
        suggestion: AiSuggestion,
    ): void {
        if (tenantId == null) {
            this.logger.warn(`Bỏ realtime suggestion cho conv ${conversationId}: thiếu tenantId`);
            return;
        }
        this.gateway.emitSuggestionGenerated(
            tenantId,
            conversationId,
            suggestion,
            suggestion.id,
        );
    }

    async onModuleInit() {
        // Load product templates (non-critical — AI detection works without them)
        const loadTemplatesWithRetry = async (retries = 1, delayMs = 2000) => {
            try {
                // Gọi thẳng ProductsService (cùng process) thay vì fetch HTTP tới chính app.
                // Trước đây fetch `/erp/products` KHÔNG kèm token → sau khi controller siết
                // AuthGuard('jwt') thì nhận 401. Gọi service trực tiếp: không round-trip, không auth.
                const rows: any[] = await this.productsService.findAllProducts();
                const templates = (rows || []).map((t: any) => ({
                        id: t.id,
                        code: t.code,
                        name: t.nameVi || t.name_vi || t.name || t.code,
                        product_type: t.quoteType || t.quote_type || 'loose',
                        product_id: t.product_id || t.id || null,
                        allowed_materials: t.allowed_materials || [],
                        allowed_paper_sizes: t.allowed_paper_sizes || [],
                        allowed_processing: t.allowed_processing || [],
                        keywords: t.aiKeywords || t.ai_keywords || [],
                        has_auto_pricing: t.has_auto_pricing !== false,
                        ai_enabled: t.ai_enabled !== false,
                        description: t.description || '',
                        mini_quote_fields: t.mini_quote_fields || null,
                        fields: (t.fields || []).map((f: any) => ({
                            id: f.id,
                            field_code: f.field_code,
                            field_name: f.field_name || f.label,
                            field_type: f.field_type,
                            is_required: !!f.is_required,
                            ai_question: f.ai_question || '',
                            ai_keywords: f.ai_keywords || [],
                            default_value: f.default_value,
                            options: f.options,
                            source_table: f.source_table,
                        })),
                    }));
                loadProductTemplates(templates);
                this.logger.log(`🏭 Loaded ${templates.length} Pricing product templates for AI detection`);
                return true;
            } catch (err: any) {
                if (retries > 0) {
                    this.logger.warn(`⚠️ Could not load Pricing templates (${err.message}). Retrying in ${delayMs / 1000}s... (${retries} retries left)`);
                    setTimeout(() => loadTemplatesWithRetry(retries - 1, delayMs), delayMs);
                } else {
                    this.logger.error(`❌ Failed to load Pricing templates after all retries: ${err.message}`);
                }
                return false;
            }
        };

        loadTemplatesWithRetry();

        // Start periodic cache cleanup (every 10 minutes)
        this.cleanupInterval = setInterval(() => this.cleanupCaches(), 10 * 60 * 1000);
    }

    onModuleDestroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Main pipeline: generate AI suggestion for a conversation
     */
    async generateSuggestion(conversationId: string, triggerMessageId?: string): Promise<AiSuggestion> {
        const start = Date.now();

        // 1. Load conversation messages (expanded window for better context)
        const messages = await this.msgRepo.find({
            where: { conversationId },
            order: { createdAt: 'DESC' },
            take: 50, // Load more messages — persistent summary handles compression
        });
        messages.reverse();
        if (messages.length === 0) return null as any;

        const lastMsg = messages[messages.length - 1];

        // Tenant của hội thoại — luồn qua các nhánh "học" (outcome/similar-won/memory/agent)
        // để không trộn dữ liệu chốt đơn chéo tenant. Message có thể NULL (hàng cũ) →
        // fallback đọc từ conversation.
        let convTenantId: number | null = messages.find(m => m.tenantId != null)?.tenantId ?? null;
        if (convTenantId == null) {
            const convRow = await this.convRepo.findOne({ where: { id: conversationId }, select: ['id', 'tenantId'] });
            convTenantId = convRow?.tenantId ?? null;
        }

        // Build chat history with conversation compression
        const chatHistory = await this.summaryService.buildChatHistory(conversationId, messages);

        // 2. Build customer profile
        const customerProfileContext = await this.profileBuilder.buildCustomerProfile(conversationId);

        // 3. Detect product
        const customerMessages = messages.filter(m => m.senderType === 'customer');
        const combinedCustomerText = customerMessages.map(m => m.content).join(' ');
        const productMatch = detectProduct(combinedCustomerText);
        let matchedTemplate: ProductTemplate | undefined;
        if (productMatch?.templateId) {
            matchedTemplate = findProductTemplateById(productMatch.templateId);
            this.logger.log(`🎯 Pricing product detected: ${matchedTemplate?.name} (${productMatch.product}) confidence=${productMatch.confidence}`);
            // Tôn trọng cài đặt sản phẩm: nếu tắt AI cho sản phẩm này → KHÔNG tự trả lời khách,
            // NHƯNG vẫn tạo một gợi ý nhắc nhân viên xử lý tay (tránh "im lặng" bỏ rơi khách).
            if (matchedTemplate && (matchedTemplate as any).ai_enabled === false) {
                this.logger.log(`🚫 AI bị TẮT cho sản phẩm "${matchedTemplate.name}" → tạo gợi ý nhắc nhân viên tư vấn tay (không tự gửi khách).`);
                return await this.saveHandoffSuggestion(
                    conversationId,
                    triggerMessageId || lastMsg.id,
                    `Sản phẩm "${matchedTemplate.name}" được cấu hình tư vấn thủ công. Nhân viên vui lòng trả lời khách trực tiếp.`,
                    'ai-disabled',
                );
            }
        }

        // 4. Search KB (with cache)
        const kbResults = await this.searchKBWithCache(conversationId, productMatch, combinedCustomerText);
        const kbLimit = productMatch ? 5 : 3;
        const relevantKb = kbResults.slice(0, kbLimit);

        // Load doc titles for citation
        const kbDocTitles = new Map<string, string>();
        for (const chunk of relevantKb) {
            if (chunk.documentId && !kbDocTitles.has(chunk.documentId)) {
                try {
                    const doc = await this.kbService.findOne(chunk.documentId);
                    if (doc) kbDocTitles.set(chunk.documentId, doc.title);
                } catch { /* ignore */ }
            }
        }

        /**
         * Ngân sách nội dung cho MỖI chunk KB.
         *
         * Audit 2026-08-29: bản cũ cứng `substring(0, 800)` cho mọi chunk. Vì `CHUNK_MAX_CHARS`
         * của KB là 1500, mỗi chunk mất tới ~47% nội dung; nặng nhất là chunk kiểu `table`
         * (bảng định lượng/khổ giấy/thời gian) — vết cắt 800 rơi giữa bảng markdown, model nhận
         * một bảng THIẾU HÀNG mà không có dấu hiệu gì là đã bị cắt ⇒ dễ trả lời sai theo phần
         * còn lại. Nay:
         *  - chunk `table` được giữ NGUYÊN (bảng chỉ có nghĩa khi trọn vẹn);
         *  - các loại còn lại nới lên 1200 và cắt theo ranh giới DÒNG, có marker tường minh.
         * Tổng ngân sách vẫn được `PromptBuilderService.buildUserPrompt` chặn bằng MAX_KB_CONTEXT.
         */
        const PER_CHUNK_CHARS = 1200;
        const clipChunk = (content: string, chunkType?: string): string => {
            if (chunkType === 'table' || content.length <= PER_CHUNK_CHARS) return content;
            const lines = content.split('\n');
            const kept: string[] = [];
            let used = 0;
            for (const line of lines) {
                if (used + line.length + 1 > PER_CHUNK_CHARS) break;
                kept.push(line);
                used += line.length + 1;
            }
            if (kept.length === 0) return content.slice(0, PER_CHUNK_CHARS);
            return `${kept.join('\n')}\n[...đoạn còn lại của tài liệu đã lược bớt...]`;
        };

        const kbContext = relevantKb.length > 0
            ? relevantKb.map((c: any, i: number) => {
                const docTitle = kbDocTitles.get(c.documentId) || 'Tài liệu';
                const heading = (c.metadata as any)?.heading || '';
                const sourceLabel = heading ? `${docTitle} > ${heading}` : docTitle;
                const body = clipChunk(String(c.content ?? ''), c.chunkType);
                return `[Tài liệu ${i + 1} — Nguồn: ${sourceLabel}]:\n${this.promptBuilder.simplifyForCustomer(body)}`;
            }).join('\n\n')
            : '(Chưa có tài liệu nội bộ liên quan — trả lời dựa trên kinh nghiệm chung về in ấn)';

        // 5. Match canned responses
        const lastCustomerMsg = customerMessages[customerMessages.length - 1]?.content || '';
        const isShortFollowUp = lastCustomerMsg.trim().length < 15 && customerMessages.length > 1;
        const isGenericReply = SHORT_REPLIES.includes(lastCustomerMsg.trim().toLowerCase());

        // 5.0. Chửi bậy / cần escalate: bắt NGAY ở luồng chính (trước đây chỉ bắt ở
        // template-fallback khi AI chết). Short-circuit thành handoff cho nhân viên,
        // KHÔNG đẩy vào LLM — tránh bot tự đối đáp với khách đang bức xúc.
        const edgeMatch = this.contextInference.matchEdgeCase(lastCustomerMsg.toLowerCase());
        if (edgeMatch?.response === 'ESCALATE_TO_HUMAN') {
            this.logger.warn(
                `🚨 Edge-case escalate (${sensitiveTextMetadata('message', lastCustomerMsg)}) → chuyển nhân viên`,
            );
            return await this.saveHandoffSuggestion(
                conversationId,
                triggerMessageId || lastMsg.id,
                'Khách có dấu hiệu bức xúc/ngôn từ nhạy cảm. Nhân viên vui lòng vào xử lý trực tiếp.',
                'edge-escalate',
            );
        }

        let matchedCanned: any[] = [];
        let cannedContext = '';
        let directCannedReply: { text: string; title: string; autoReply: boolean } | null = null;

        if (!isShortFollowUp && !isGenericReply) {
            matchedCanned = await this.cannedService.findByKeywords(combinedCustomerText);
        }

        if (matchedCanned.length > 0) {
            const best = matchedCanned[0];
            // Chỉ chặn canned auto-reply khi THỰC SỰ có nhiều canned khớp (mơ hồ intent).
            // Trước đây `|| !!productMatch` vô hiệu canned mỗi khi phát hiện sản phẩm —
            // khiến canned auto-reply gần như không bao giờ kích hoạt dù chỉ có 1 khớp rõ.
            const hasMultipleIntents = matchedCanned.length > 1;
            if (best.autoReply && !hasMultipleIntents) {
                directCannedReply = { text: best.content, title: best.title, autoReply: true };
            }
            cannedContext = matchedCanned.slice(0, 5).map((cr: any, i: number) =>
                `[Câu trả lời mẫu ${i + 1} - "${cr.title}"]: ${cr.content}`
            ).join('\n\n');
        }

        // 6. Parse quote + calculate pricing
        let quoteResult: PricingResult | null = null;
        if (combinedCustomerText) {
            const parsed = this.quoteParser.parse(combinedCustomerText);
            
            const shouldCalculateQuote = !(matchedTemplate && matchedTemplate.has_auto_pricing === false);

            if (shouldCalculateQuote && (parsed.product || parsed.quantity || parsed.material)) {
                quoteResult = await this.quoteService.calculateFromParsed(parsed);
            }
        }

        // 6.5. Pricing catalog context
        const pricingCatalogContext = this.buildPricingCatalogContext(
            productMatch ? productMatch.product : '',
            combinedCustomerText
        );

        // 7. Detect intents (comparison, objection, order status)
        const isComparison = /(?:khác|so sánh|vs|hay|nên chọn|khác nhau|với).+(?:gì|nào|sao|không)/i.test(combinedCustomerText);
        const { isObjection, detectedObjections } = this.detectObjections(lastCustomerMsg);
        const isOrderStatusQuery = /(đơn hàng|đơn của|giao hàng|tới đâu|bao giờ xong|bao giờ nhận|đang làm chưa|xong chưa|tracking|mã đơn|tình trạng đơn)/i.test(combinedCustomerText);

        // 8. Build prompt contexts — load product-filtered master data for dynamic questions
        let productMasterData: any = null;
        if (matchedTemplate && (matchedTemplate as any).product_id) {
            try {
                productMasterData = await this.quoteService.getMasterDataForProduct((matchedTemplate as any).product_id);
            } catch { /* fallback to no master data */ }
        }
        let productFieldsContext = this.promptBuilder.buildProductFieldsPrompt(matchedTemplate, productMasterData || undefined);
        // Nối MÔ TẢ sản phẩm vào ngữ cảnh để AI hiểu/tư vấn đúng đặc tính sản phẩm.
        if (matchedTemplate?.description) {
            productFieldsContext = `📦 Mô tả sản phẩm "${matchedTemplate.name}": ${matchedTemplate.description}\n\n${productFieldsContext}`;
        }
        if (productFieldsContext) {
            this.logger.log(`📋 Product fields context: ${sensitiveTextMetadata('context', productFieldsContext)}`);
        }
        const quoteContext = quoteResult ? this.promptBuilder.formatQuoteForPrompt(quoteResult) : '';
        const printingKnowledgeContext = this.contextInference.buildPrintingKnowledgeContext(
            (text: string) => this.promptBuilder.simplifyForCustomer(text),
            lastCustomerMsg,
        );

        // Order history context
        let orderHistoryContext = '';
        if (isOrderStatusQuery) {
            orderHistoryContext = await this.buildOrderHistoryContext(conversationId);
        }

        // KB alternatives for objection handling
        let kbAlternatives = '';
        if (isObjection && (detectedObjections.includes('price') || detectedObjections.includes('competitor'))) {
            kbAlternatives = await this.fetchKBAlternatives(productMatch, combinedCustomerText);
        }

        // Learning context (now with intent-based filtering)
        /**
         * CHỦ ĐỀ hội thoại suy từ chính câu khách vừa nhắn — KHÔNG phải intent canonical.
         *
         * Audit 2026-08-29: trước đây mỗi call-site tự dựng token riêng ('objection',
         * 'comparison', hoặc `detectedObjections[0]` = 'price'/'competitor'/...), rồi truyền
         * xuống 3 nhánh học vốn đối chiếu với intent CANONICAL đã lưu. Không token nào thuộc
         * enum ⇒ few-shot ký ức chốt sale và lời khuyên theo intent chết đúng lúc khách phản đối
         * hoặc so sánh. Nay có MỘT topic duy nhất, và `resolveLearningIntents` quy nó về tập
         * intent canonical ở phía consumer.
         */
        const conversationTopic: ConversationTopic | undefined = isObjection
            ? (isConversationTopic(detectedObjections[0]) ? detectedObjections[0] as ConversationTopic : 'objection')
            : isComparison
                ? 'comparison'
                : undefined;

        let learningContext = '';
        try {
            learningContext = await this.learningService.buildLearningContext(conversationTopic, convTenantId);
        } catch { /* optional */ }

        // Phase 2: Outcome-based learning + similar won conversations
        let outcomeContext = '';
        let similarConvContext = '';
        let memoryContext = '';
        try {
            const [outcome, similar, memory] = await Promise.all([
                this.outcomeLearning.buildOutcomeContext(
                    conversationTopic,
                    productMatch?.product,
                    convTenantId,
                ),
                this.convSearch.buildSimilarConversationContext(
                    productMatch?.product,
                    combinedCustomerText,
                    conversationTopic,
                    convTenantId,
                ),
                this.aiMemory.retrieveMemoryContext(
                    // Không có topic ⇒ vẫn truyền 'chung' để hàm chạy và rơi vào fallback
                    // "không lọc intent" (lấy ví dụ chốt đơn bất kỳ của tenant).
                    conversationTopic ?? 'chung',
                    productMatch?.product || '',
                    convTenantId,
                ),
            ]);
            outcomeContext = outcome;
            similarConvContext = similar;
            memoryContext = memory;
        } catch (e) {
            this.logger.warn(`⚠️ Phase 2 context failed: ${(e as Error).message}`);
        }

        // Context Inference (Claw Code Pattern: Tool Permission Setup)
        const inferenceContext = this.contextInference.inferContext(combinedCustomerText);

        const taskInstructions = this.promptBuilder.buildTaskInstructions({
            isComparison,
            isObjection,
            detectedObjections,
            lastCustomerMsg,
            isShortFollowUp,
            isGenericReply,
            learningContext,
            memoryContext,
            kbAlternatives,
            needsUsageContext: inferenceContext.needsUsageContext,
            usageQuestion: inferenceContext.usageQuestion,
        });

        let finalTaskInstructions = taskInstructions;
        if (matchedTemplate && matchedTemplate.has_auto_pricing === false) {
            finalTaskInstructions += '\n\n🚨 LƯU Ý ĐẶC BIỆT: Sản phẩm này có cấu trúc phức tạp và KHÔNG ĐƯỢC PHÉP báo giá tự động. Bạn TUYỆT ĐỐI KHÔNG được tự ý đưa ra mức giá dự kiến. Hãy thông báo cho khách rằng: "Dạ với sản phẩm này cần tư vấn kỹ hơn về quy cách, nhân viên bên em đang kiểm tra và sẽ báo giá chính xác cho anh/chị ngay ạ".';
        }

        const userPrompt = this.promptBuilder.buildUserPrompt({
            chatHistory,
            customerProfileContext,
            kbContext,
            cannedContext,
            printingKnowledgeContext,
            productFieldsContext,
            quoteContext,
            pricingCatalogContext,
            orderHistoryContext,
            taskInstructions: finalTaskInstructions,
            outcomeContext,
            similarConvContext,
        });

        const systemPrompt = this.promptBuilder.getSystemPrompt();
        this.logger.log(`📏 Prompt length: SYSTEM=${systemPrompt.length} chars, USER=${userPrompt.length} chars`);

        // 9. Call AI (with fallback chain + circuit breaker)
        let result: any;
        let usedModel = 'template';
        let tokenUsage: { prompt_tokens: number; completion_tokens: number } | null = null;

        if (directCannedReply) {
            result = {
                replies: [{ text: directCannedReply.text, label: directCannedReply.title }],
                intent: 'q&a_template',
                confidence: 1.0,
                missing_info: [],
            };
            usedModel = 'canned-response';
        } else {
            // Try agent pipeline for complex queries (product detected + sufficient complexity)
            let agentContext = '';
            // UPGRADE 3: Optimize Agent Pipeline Activation Threshold
            const requiresDeepReasoning = isComparison || isObjection || isOrderStatusQuery || combinedCustomerText.length > 90;
            const useAgent = productMatch && requiresDeepReasoning;
            if (useAgent) {
                try {
                    const printingKnowledge = this.contextInference.getKnowledgeData();
                    const agentResult = await this.agentPipeline.runAgentPipeline(
                        conversationId, systemPrompt, userPrompt,
                        { productMatch, printingKnowledge, tenantId: convTenantId },
                    );
                    if (agentResult.usedAgent && agentResult.toolCalls.length > 0) {
                        agentContext = '\n\n## THÔNG TIN BỔ SUNG TỪ AGENT:\n' +
                            agentResult.toolCalls.map(tc =>
                                `[${tc.tool}]: ${tc.result.substring(0, 500)}`
                            ).join('\n\n');
                        this.logger.log(`🤖 Agent enriched prompt with ${agentResult.toolCalls.length} tool results`);
                    }
                    /**
                     * TÁI SỬ DỤNG LƯỢT SINH TEXT CỦA AGENT (audit 2026-08-29).
                     *
                     * Tồn đọng cũ (STRUCTURE.md): vòng lặp agent chạy tới khi model trả TEXT rồi
                     * `return { response, toolCalls }`, nhưng caller chỉ đọc `toolCalls` và BỎ hẳn
                     * `response`, sau đó gọi `callWithFallback` một lượt nữa để lấy JSON có schema.
                     * Tức mỗi suggestion "deep reasoning" trả tiền cho một lượt sinh text bị ném đi
                     * và cộng thêm 15–45s độ trễ.
                     *
                     * Nay: nếu `response` PARSE ĐƯỢC thành JSON đúng hình dạng downstream cần
                     * (có `replies`), dùng luôn. Không parse được ⇒ vẫn đi đường `callWithFallback`
                     * như cũ, nên không có rủi ro hạ chất lượng — chỉ bỏ chi phí khi đã có kết quả tốt.
                     */
                    const reusable = parseAgentJsonResponse(agentResult.response);
                    if (reusable) {
                        result = reusable;
                        usedModel = `${agentResult.usedAgent ? 'agent' : 'gemini'}/reused`;
                        this.logger.log('♻️ Dùng lại câu trả lời JSON của agent — bỏ 1 lượt gọi LLM');
                    }
                } catch (e) {
                    this.logger.warn(
                        `⚠️ Agent pipeline failed, using standard path (${safeErrorMetadata(e)})`,
                    );
                }
            } else if (requiresDeepReasoning && !productMatch) {
                // Câu phức tạp (so sánh/phản đối/hỏi đơn/tin dài) nhưng KHÔNG nhận diện được sản phẩm
                // → agent pipeline bị bỏ qua (cần product context để gọi tool). Log để không "chết lặng".
                this.logger.log(`ℹ️ Bỏ qua agent pipeline: câu cần suy luận sâu nhưng chưa nhận diện được sản phẩm — dùng luồng LLM chuẩn.`);
            }

            // Standard AI call with enriched prompt — BỎ QUA nếu đã tái dùng được câu trả lời agent.
            if (!result) {
                const enrichedUserPrompt = agentContext ? userPrompt + agentContext : userPrompt;
                const aiResult = await this.aiProvider.callWithFallback(systemPrompt, enrichedUserPrompt);
                if (aiResult) {
                    result = aiResult.result;
                    usedModel = aiResult.usedModel + (agentContext ? '+agent' : '');
                    tokenUsage = aiResult.tokenUsage || null;
                } else {
                    result = this.templateFallback.generateFallback(lastMsg.content, relevantKb, quoteResult, messages, matchedTemplate);
                    usedModel = 'template';
                }
            }
        }

        // 9.5. Post-AI pricing: if AI returned parsed_quote with direct Pricing IDs, re-calculate.
        // CHỐNG BỊA QUY CÁCH: chỉ recalc khi LLM cung cấp ĐỦ số thật (số lượng + kích thước).
        // Trước đây thiếu size → mặc định 90×55 / SL 100 rồi hiển thị như "giá hệ thống" xác thực
        // → báo giá sai quy cách. Nay thiếu bất kỳ số nào → KHÔNG tính, để nguyên là gợi ý cho NV.
        const pq = result?.parsed_quote;
        const hasRealSpec = pq?.material_id && pq.quantity > 0 && pq.width > 0 && pq.height > 0;
        if (hasRealSpec) {
            this.logger.log(`🎯 AI provided parsed_quote: material_id=${pq.material_id}, processing=${JSON.stringify(pq.processing_ids || [])}`);
            try {
                const pricingResult: any = await this.quoteService.calculateMiniQuote({
                    material_id: pq.material_id,
                    paper_size_id: pq.paper_size_id || undefined,
                    quantity: pq.quantity,
                    item_width: pq.width,
                    item_height: pq.height,
                    print_side: pq.print_side || undefined,
                    processing: (pq.processing_ids || []).map((id: number) => ({ id })),
                });
                // B1 fix: dùng GIÁ BÁN (grand_total = markup + VAT), không phải giá vốn (total)
                const sellTotal = (typeof pricingResult?.grand_total === 'number' && pricingResult.grand_total > 0)
                    ? pricingResult.grand_total
                    : pricingResult?.total;
                if (pricingResult && !pricingResult.requiresManualQuote && sellTotal) {
                    this.logger.log(`💰 Re-calculated via AI parsed_quote: ${sellTotal.toLocaleString()}đ (direct IDs, no fuzzy match)`);
                    const qty = pq.quantity;
                    quoteResult = {
                        productType: quoteResult?.productType || 'unknown',
                        type: quoteResult?.type,
                        total: Math.round(sellTotal),
                        unitPrice: Math.round(sellTotal / qty),
                        currency: 'VND',
                        breakdown: (pricingResult.breakdown || []).map((b: any) => ({
                            item: b.item || b.name, detail: b.detail || '', cost: b.cost || 0,
                        })),
                        requiresManualQuote: false,
                        warnings: [],
                        source: 'pricing-direct',
                    };
                }
            } catch (err: any) {
                this.logger.warn(`⚠️ Post-AI re-calculation failed: ${err.message}`);
            }
        }

        // 10. Anti-hallucination validation
        result = this.validateAiResult(result, quoteResult, relevantKb);

        // 10.5. Hard-coded constraint validation — catches rule violations even when AI ignores prompt
        const constraintWarnings = this.checkPrintingConstraints(chatHistory, lastCustomerMsg, productMatch);
        if (constraintWarnings.length > 0 && result.replies?.length > 0) {
            const warningText = constraintWarnings.map(w => `⚠️ ${w}`).join('\n');
            result.replies[0].text = warningText + '\n\n' + result.replies[0].text;
            this.logger.warn(`🚨 Constraint violations detected: ${constraintWarnings.join(' | ')}`);
        }

        // 11. Sentiment escalation
        const sentiment = result.sentiment || 3;
        if (sentiment <= 2) {
            await this.autoReplyService.handleSentimentEscalation(conversationId, sentiment, result);
        }

        // 12. Auto-reply eligibility
        const latencyMs = Date.now() - start;
        const intent = normalizeIntent(result.intent);
        const confidence = result.confidence || 0.4;
        const authoritativeQuote = isAuthoritativePricingResult(quoteResult) ? quoteResult : null;
        const hasPrice = authoritativeQuote !== null;
        const autoReplyEligible = this.autoReplyService.checkAutoReplyEligibility(
            conversationId, intent, confidence, hasPrice, usedModel, directCannedReply,
        );

        // 13. Save suggestion
        const suggestion = this.suggestRepo.create({
            conversationId,
            tenantId: convTenantId,
            triggerMessageId: triggerMessageId || lastMsg.id,
            replies: result.replies || [{ text: 'Xin chào, để em kiểm tra và phản hồi bạn sớm nhé!', label: 'Phản hồi mặc định' }],
            missingInfo: result.missing_info || [],
            sources: [
                // KB sources only when NO pricing result (avoid noise when Pricing already answers)
                ...(!hasPrice && usedModel !== 'template' && kbResults.length > 0 ? kbResults.map((c: any) => ({
                    docId: c.documentId,
                    chunkId: c.id,
                    docName: kbDocTitles.get(c.documentId) || '',
                    heading: (c.metadata as any)?.heading || '',
                    excerpt: c.content.substring(0, 100),
                    score: c._score || 0.5,
                })) : []),
                // Pricing pricing source when available
                ...(authoritativeQuote ? [{
                    docName: 'Hệ thống Báo giá (Pricing)',
                    heading: authoritativeQuote.productType || 'Báo giá',
                    excerpt: authoritativeQuote.breakdown?.map((b: any) =>
                        `${b.item}: ${b.cost.toLocaleString('vi-VN')}đ${b.detail ? ` (${b.detail})` : ''}`
                    ).join('\n') + `\n💰 Tổng: ${authoritativeQuote.total.toLocaleString('vi-VN')}đ` +
                        (authoritativeQuote.unitPrice ? ` | Đơn giá: ${authoritativeQuote.unitPrice.toLocaleString('vi-VN')}đ/cái` : ''),
                    score: 1.0,
                }] : []),
            ],
            confidence,
            intent,
            model: usedModel,
            latencyMs,
            autoReplyEligible,
            status: SuggestionStatus.GENERATED,
            promptVersion: 'v3.0-refactored',
            quoteResult: quoteResult ? JSON.parse(JSON.stringify(quoteResult)) : null,
            tokenUsage: tokenUsage || undefined,
        });
        await this.suggestRepo.save(suggestion);
        
        // Track Token Usage to prevent AI Spam (Budgeting)
        if (tokenUsage) {
            this.autoReplyService.trackTokenUsage(conversationId, tokenUsage.prompt_tokens + tokenUsage.completion_tokens);
        }

        // 13.5 Auto-tag conversation based on intent
        await this.autoTagConversation(conversationId, intent, hasPrice, productMatch);

        // 13.6 Async memory extraction (fire-and-forget, non-blocking)
        // UPGRADE 2: Optimize Memory Extraction Frequency
        const isConclusiveIntent = MEMORY_TRIGGER_INTENTS.includes(intent);
        const shouldExtractMemory = isConclusiveIntent || (messages.length >= 6 && messages.length % 6 === 0);
        
        if (shouldExtractMemory) {
            this.extractAndSaveMemory(conversationId, messages.slice(-10)).catch(err =>
                this.logger.warn(`Memory extraction failed (${safeErrorMetadata(err)})`)
            );
        }

        this.logger.log(`💡 Suggestion generated for ${conversationId} (${latencyMs}ms)` +
            (autoReplyEligible ? ' [AUTO-REPLY]' : '') +
            (authoritativeQuote ? ` [Quote: ${authoritativeQuote.total.toLocaleString()}đ]` : ''));

        // 14. Emit via WebSocket (tenant-scoped; thiếu tenant không được broadcast global)
        this.emitSuggestionGenerated(convTenantId, conversationId, suggestion);

        return suggestion;
    }

    /**
     * Auto-tag conversation based on detected intent and context.
     * Tags are additive (never removes existing tags) and deduped.
     */
    private async autoTagConversation(
        conversationId: string,
        intent: string,
        hasPrice: boolean,
        productMatch: any,
    ): Promise<void> {
        return this.withLock(`tag:${conversationId}`, async () => {
            try {
                // Atomic read-modify-write to reduce race condition window
                const conv = await this.convRepo.findOneBy({ id: conversationId });
                if (!conv) return;

                const existingTags = new Set<string>(conv.tags || []);
                const originalSize = existingTags.size;

                // Intent → Tag mapping (nguồn sự thật: intents.ts)
                const tag = INTENT_TAG_MAP[intent];
                if (tag) existingTags.add(tag.toLowerCase().trim());

                // Auto-tag if pricing was calculated
                if (hasPrice) existingTags.add('báo_giá');

                // Auto-tag with product type if detected
                if (productMatch?.code) {
                    existingTags.add(`sp:${productMatch.code}`.toLowerCase().trim());
                }

                // Only update if tags changed (additive — re-read to reduce race window)
                if (existingTags.size > originalSize) {
                    const freshConv = await this.convRepo.findOneBy({ id: conversationId });
                    if (freshConv) {
                        const merged = new Set<string>([...(freshConv.tags || []), ...existingTags]);
                        await this.convRepo.update(conversationId, { tags: Array.from(merged) });
                    }
                }
            } catch (err) {
                // Non-critical — don't fail suggestion pipeline for tagging
                this.logger.warn(`Auto-tag failed for ${conversationId}: ${(err as Error).message}`);
            }
        });
    }

    /**
     * Memory System: Extract customer preference facts from conversation
     * and save to Contact.memoryFacts for cross-conversation recall.
     * Runs asynchronously (fire-and-forget) to not block suggestion pipeline.
     */
    private async extractAndSaveMemory(conversationId: string, recentMessages: Message[]): Promise<void> {
        return this.withLock(`mem:${conversationId}`, async () => {
            try {
                if (recentMessages.length < 3) return; // Need enough context

                const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
                if (!conversation?.contactId) return;

                const contact = await this.contactRepo.findOne({ where: { id: conversation.contactId } });
                if (!contact) return;

                // Build chat snippet for extraction
                const chatSnippet = recentMessages
                    .map(m => `${m.senderType === 'customer' ? 'KH' : 'Agent'}: ${m.content}`)
                    .join('\n');


                const existingFacts = (contact.memoryFacts || []).map(m => m.fact);
                const existingProfile = contact.customerProfile || {};

                const prompt = `Phân tích đoạn hội thoại CSKH in ấn sau và trích xuất 2 loại thông tin:

## 1. FACTS (sự kiện cụ thể):
- Sở thích vật liệu (vd: "Thích in couche 300gsm cán mờ")
- Yêu cầu giao hàng (vd: "Luôn cần giao trong 3 ngày")
- Ngân sách / giới hạn giá (vd: "Budget khoảng 2-3 triệu/đơn")
- Loại sản phẩm hay đặt (vd: "Chuyên đặt name card và tờ rơi")
- Đặc điểm đặc biệt (vd: "Cần xuất hóa đơn VAT")

## 2. PROFILE (thông tin tổng hợp):
- industry: ngành nghề KH (thực phẩm, mỹ phẩm, BĐS, giáo dục...)
- budgetRange: khoảng ngân sách (vd: "1-3 triệu/đơn")
- preferredMaterials: chất liệu ưa dùng (array)
- orderFrequency: tần suất đặt (hàng tuần/tháng/theo đợt...)
- communicationStyle: phong cách giao tiếp (ngắn gọn/hay hỏi kỹ/quyết nhanh)
- commonProducts: SP hay đặt (array)
- specialNeeds: yêu cầu đặc biệt (array, vd: ["VAT", "giao nội thành"])

KHÔNG trích xuất: câu chào hỏi, câu hỏi chung, thông tin đã có.

Facts đã biết (KHÔNG lặp lại): ${existingFacts.length > 0 ? existingFacts.join('; ') : 'Chưa có'}
Profile hiện tại: ${JSON.stringify(existingProfile)}

Hội thoại:
${chatSnippet}

Trả lời JSON: {"facts": ["fact1"], "profile": {"industry": "...", ...}} — CHỈ điền field nào phát hiện được. facts=[] nếu không có gì mới.`;

                // Use lightweight provider call
                const providers = this.aiProvider.getProviders();
                if (providers.length === 0) return;

                let extractedFacts: string[] = [];
                let extractedProfile: any = null;
                for (const provider of providers) {
                    try {
                        const response = await this.callProviderForCompression(provider, prompt);
                        // Robust JSON parsing: strip markdown, find JSON object
                        let cleanedResponse = response
                            .replace(/```json\n?/g, '')
                            .replace(/```/g, '')
                            .trim();
                        // Try to extract JSON object if response contains extra text
                        const jsonMatch = cleanedResponse.match(/\{[\s\S]*"facts"[\s\S]*\}/);
                        if (jsonMatch) cleanedResponse = jsonMatch[0];
                        const parsed = JSON.parse(cleanedResponse);
                        if (Array.isArray(parsed.facts)) {
                            extractedFacts = parsed.facts.filter((f: string) =>
                                typeof f === 'string' && f.length > 5 && f.length < 200,
                            );
                        }
                        // Extract structured profile
                        if (parsed.profile && typeof parsed.profile === 'object') {
                            extractedProfile = parsed.profile;
                        }
                        break;
                    } catch {
                        continue;
                    }
                }

                // Save structured profile (merge with existing)
                if (extractedProfile) {
                    const merged = { ...(contact.customerProfile || {}) };
                    const profileFields = ['industry', 'budgetRange', 'orderFrequency', 'communicationStyle'];
                    for (const field of profileFields) {
                        if (extractedProfile[field] && typeof extractedProfile[field] === 'string') {
                            (merged as any)[field] = extractedProfile[field];
                        }
                    }
                    // Merge arrays (deduplicate)
                    const arrayFields = ['preferredMaterials', 'commonProducts', 'specialNeeds'];
                    for (const field of arrayFields) {
                        if (Array.isArray(extractedProfile[field])) {
                            const existing = (merged as any)[field] || [];
                            const combined = [...new Set([...existing, ...extractedProfile[field]])];
                            (merged as any)[field] = combined.slice(-10); // Cap at 10
                        }
                    }
                    await this.contactRepo.update(contact.id, { customerProfile: merged });
                    this.logger.log(
                        `👤 Profile updated for contact ${contact.id.slice(-6)} ` +
                        `(fieldCount=${Object.keys(merged).length})`,
                    );
                }

                if (extractedFacts.length === 0) return;

                // Dedup against existing facts (word-overlap match)
                const wordOverlap = (a: string, b: string): number => {
                    const wordsA = new Set(a.toLowerCase().split(/[\s,;.]+/).filter(w => w.length > 1));
                    const wordsB = new Set(b.toLowerCase().split(/[\s,;.]+/).filter(w => w.length > 1));
                    if (wordsA.size === 0 || wordsB.size === 0) return 0;
                    const intersection = [...wordsA].filter(w => wordsB.has(w));
                    return intersection.length / Math.min(wordsA.size, wordsB.size);
                };
                const newFacts = extractedFacts.filter(newFact =>
                    !existingFacts.some(existing => wordOverlap(existing, newFact) > 0.7),
                );

                if (newFacts.length === 0) return;

                // Append new facts (max 20, evict oldest)
                const allFacts = [
                    ...(contact.memoryFacts || []),
                    ...newFacts.map(fact => ({
                        fact,
                        source: conversationId.slice(-8),
                        at: new Date().toISOString().slice(0, 10),
                    })),
                ].slice(-20);

                await this.contactRepo.update(contact.id, { memoryFacts: allFacts });
                this.logger.log(
                    `🧠 Memory: ${newFacts.length} new facts saved for contact ${contact.id.slice(-6)}`,
                );
            } catch (err: unknown) {
                // Non-critical
                this.logger.warn(`Memory extraction error (${safeErrorMetadata(err)})`);
            }
        });
    }

    // ── Private Helper Methods ──

    // checkPrintingConstraints — delegated to printing-constraints.ts
    // Kept as public method for backward compatibility.
    checkPrintingConstraints(chatHistory: string, lastCustomerMsg: string, productMatch?: any): string[] {
        return checkPrintingConstraints(chatHistory, lastCustomerMsg, productMatch);
    }

    // NOTE: buildCompressedChatHistory, compressOldMessages, extractKeyFactsManually
    // have been removed — replaced by ConversationSummaryService (persistent summaries).

    /** Lightweight provider call for text generation (used by memory extraction) */
    private async callProviderForCompression(
        provider: { name: string; apiKey: string; model: string; endpoint: string },
        prompt: string,
    ): Promise<string> {
        if (provider.name === 'gemini') {
            const url = `${provider.endpoint}/models/${provider.model}:generateContent?key=${provider.apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0, maxOutputTokens: 400 },
                }),
                signal: AbortSignal.timeout(8000),
            });
            if (!response.ok) throw new Error(`Gemini ${response.status}`);
            const data: any = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }

        // OpenAI-compatible (OpenAI, Groq, etc.)
        const response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${provider.apiKey}`,
            },
            body: JSON.stringify({
                model: provider.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0,
                max_tokens: 400,
            }),
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error(`${provider.name} ${response.status}`);
        const data: any = await response.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
    }

    /**
     * Key cache KB — GỒM nội dung truy vấn, không chỉ `conversationId` (audit 2026-08-29).
     *
     * Trước đây key là `conversationId` thuần với TTL 5 phút: khách hỏi câu thứ hai (chủ đề khác)
     * trong cùng hội thoại vẫn nhận lại đúng chunk của câu trước ⇒ RAG trả context sai một cách
     * vô hình. Thêm hash của text truy vấn + có/không có productMatch để tách các câu hỏi khác nhau,
     * vẫn giữ tenant/hội thoại trong key nên không rò chéo.
     */
    private kbCacheKey(conversationId: string, productMatch: any, customerText: string): string {
        const normalized = String(customerText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
        // Hash 32-bit (FNV-1a) — đủ để phân biệt truy vấn, không cần crypto cho cache cục bộ.
        let h = 0x811c9dc5;
        for (let i = 0; i < normalized.length; i++) {
            h ^= normalized.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        const product = productMatch?.code ?? productMatch?.id ?? (productMatch ? 'match' : 'none');
        return `${conversationId}|${product}|${h.toString(16)}`;
    }

    private async searchKBWithCache(conversationId: string, productMatch: any, customerText: string): Promise<any[]> {
        const cacheKey = this.kbCacheKey(conversationId, productMatch, customerText);
        const cached = this.kbCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < KB_CACHE_TTL_MS) {
            return cached.results;
        }

        // Multi-query expansion: expand customer text into multiple search queries
        const expandedQueries = this.queryExpansion.expandQuery(customerText, productMatch);

        // Add LLM reformulation for complex queries
        if (customerText.length > 40) {
            try {
                const reformulated = await this.queryExpansion.reformulateWithLLM(customerText);
                if (reformulated && !expandedQueries.includes(reformulated)) {
                    expandedQueries.push(reformulated);
                }
            } catch { /* LLM reformulation is optional */ }
        }

        // Search with each expanded query and merge results
        const kbLimit = productMatch ? 5 : 3;
        const allResults: any[] = [];
        const seenChunkIds = new Set<string>();

        for (const query of expandedQueries) {
            try {
                const results = await this.kbService.searchChunks(query, kbLimit + 2);
                for (const chunk of results) {
                    if (!seenChunkIds.has(chunk.id)) {
                        seenChunkIds.add(chunk.id);
                        allResults.push(chunk);
                    }
                }
            } catch (e) {
                this.logger.warn(`⚠️ KB search failed for expanded query (${safeErrorMetadata(e)})`);
            }
        }

        // Sort merged results by score (attached by searchChunks)
        allResults.sort((a, b) => ((b as any)._score || 0) - ((a as any)._score || 0));
        const results = allResults.slice(0, kbLimit + 2); // Slightly over-fetch for quality

        // LRU: evict oldest if over max size
        if (this.kbCache.size >= KB_CACHE_MAX_SIZE) {
            const oldest = this.kbCache.keys().next().value;
            if (oldest) this.kbCache.delete(oldest);
        }
        this.kbCache.set(cacheKey, { results, timestamp: Date.now() });

        if (expandedQueries.length > 1) {
            this.logger.log(`🔀 Multi-query KB search: ${expandedQueries.length} queries → ${allResults.length} unique chunks → ${results.length} used`);
        }

        return results;
    }

    private detectObjections(lastCustomerMsg: string): { isObjection: boolean; detectedObjections: string[] } {
        const objectionPatterns: Record<string, RegExp> = {
            price: /(?:đắt|mắc|cao|giá.*cao|đắt quá|mắc quá|giảm giá|rẻ hơn|tiết kiệm hơn)/i,
            competitor: /(?:bên khác|chỗ khác|nơi khác|đối thủ|bên kia|shop khác|công ty khác)/i,
            time: /(?:lâu quá|gấp|nhanh hơn|sớm hơn|bao lâu|khi nào xong|cần gấp|rush)/i,
            hesitation: /(?:suy nghĩ|hỏi lại|chưa quyết|để xem|tính sau|chưa chắc|cân nhắc)/i,
            quality: /(?:có đẹp|in đẹp|chất lượng|có giống|sợ không|có bảo hành|in lỗi)/i,
        };
        const detectedObjections = Object.entries(objectionPatterns)
            .filter(([, regex]) => regex.test(lastCustomerMsg))
            .map(([type]) => type);
        return { isObjection: detectedObjections.length > 0, detectedObjections };
    }

    private async buildOrderHistoryContext(conversationId: string): Promise<string> {
        const pastSugs = await this.suggestRepo.find({
            where: { conversationId },
            order: { createdAt: 'DESC' },
            take: 5,
            select: ['quoteResult', 'intent', 'createdAt'],
        });
        const quoteSummaries = pastSugs
            .filter(s => s.quoteResult?.total)
            .map(s => `- ${s.quoteResult.productType || 'Sản phẩm'}: ${s.quoteResult.total?.toLocaleString()}đ (${new Date(s.createdAt).toLocaleDateString('vi-VN')})`);
        if (quoteSummaries.length === 0) return '';

        return `\n##[Lịch sử báo giá trong hội thoại này]:\n${quoteSummaries.join('\n')}\n\n→ Khách đang hỏi về tình trạng đơn hàng. intent phải là "hỏi_đơn_hàng".\n`;
    }

    private async fetchKBAlternatives(productMatch: any, customerText: string): Promise<string> {
        try {
            const searchQuery = (productMatch?.product || '') + ' ' + customerText.substring(0, 200);
            const altSearchQuery = `giá ${searchQuery} phương án tiết kiệm chất liệu`;
            const altResults = await this.kbService.searchChunks(altSearchQuery, 3);
            if (altResults.length > 0) {
                return `\n\n##[Phương án thay thế từ KB](CHỈ gợi ý từ danh sách này):\n`
                    + altResults.map((r: any) => r.content.substring(0, 500)).join('\n---\n');
            }
        } catch (e) {
            this.logger.warn(`⚠️ Failed to fetch KB alternatives (${safeErrorMetadata(e)})`);
        }
        return '';
    }

    /**
     * Build pricing catalog context from cached Pricing data
     * Searches materials matching the product keyword and their pricing tiers
     */
    private buildPricingCatalogContext(product: string, customerText: string): string {
        const materials = this.pricingCache.getMaterials();
        if (materials.length === 0) return '';

        const searchText = (product + ' ' + customerText).toLowerCase();

        // Find materials relevant to the customer query
        const matchedMaterials = materials.filter((m: any) => {
            const name = (m.name || '').toLowerCase();
            const code = (m.code || '').toLowerCase();
            const type = (m.type || m.category || '').toLowerCase();
            // Match by name, code, or type against the search text
            return searchText.includes(name) || searchText.includes(type)
                || name.split(/\s+/).some((w: string) => w.length > 2 && searchText.includes(w))
                || (code && searchText.includes(code));
        });

        // If no match by name, try broader matching with product keywords
        let materialsToShow = matchedMaterials;
        if (materialsToShow.length === 0 && product) {
            // Show all materials as a reference catalog
            materialsToShow = materials.slice(0, 15);
        }

        if (materialsToShow.length === 0) return '';

        // Build material list with info
        const materialLines = materialsToShow.slice(0, 10).map((m: any) => {
            const name = m.name || 'Unknown';
            const gsm = m.gsm ? `${m.gsm}gsm` : '';
            const paperSize = m.paper_size_name || '';
            const hasPricing = parseInt(m.has_pricing || '0') > 0;
            const scopes: string[] = [];
            if (m.scope_loose == 1 || m.scope_loose === '1') scopes.push('rời');
            if (m.scope_bound == 1 || m.scope_bound === '1') scopes.push('cuốn');
            if (m.scope_large_format == 1 || m.scope_large_format === '1') scopes.push('khổ lớn');
            const scopeStr = scopes.length > 0 ? `[${scopes.join('/')}]` : '';

            return `- ${name} ${gsm} ${scopeStr} — khổ giấy: ${paperSize || 'N/A'}${hasPricing ? ' ✓ có giá' : ''}`;
        });

        // Build processing options list with actual prices
        let processingLines = '';
        const processingOptions = this.pricingCache.getProcessingOptions();
        if (processingOptions.length > 0) {
            const procItems = processingOptions.slice(0, 10).map((p: any) => {
                const price = parseFloat(p.price || 0);
                const priceType = (p.price_type || p.priceType || '');
                const unit = priceType === 'per_item' ? '/cái'
                    : priceType === 'per_sheet' ? '/tờ'
                        : priceType === 'per_book' ? '/cuốn'
                            : priceType === 'per_m2' ? '/m²'
                                : '';
                return `- ${p.name}: ${price.toLocaleString('vi-VN')}đ${unit}`;
            });
            processingLines = '\nGia công sau in:\n' + procItems.join('\n');
        }

        const context = `\n## Danh mục vật tư từ hệ thống Pricing (CHỈ ĐỂ THAM KHẢO — KHÔNG BÁO GIÁ CỤ THỂ):\n`
            + `Vật tư có sẵn:\n${materialLines.join('\n')}`
            + processingLines
            + `\n\n→ KHÔNG được tự ý báo giá cụ thể cho khách. Chỉ dùng danh mục này để hiểu sản phẩm nào có sẵn. Giá chính xác sẽ do nhân viên báo.\n`;

        this.logger.log(`📋 Pricing catalog context: ${materialsToShow.length} materials matched for "${product}"`);
        return context;
    }

    /**
     * Gỡ định dạng markdown khỏi tin nhắn để nhìn tự nhiên như người thật nhắn Zalo:
     * **đậm**→thường, gỡ tiêu đề "##", gỡ ``code``, đổi bullet markdown "* " → "•".
     * Giữ nguyên emoji nội dung và bullet "•" (đã tự nhiên). KHÔNG đụng nội dung khác.
     */
    private stripMarkdown(text: string): string {
        if (!text) return text;
        return text
            .replace(/\*\*([^*]+)\*\*/g, '$1')          // **đậm** → đậm
            .replace(/__([^_]+)__/g, '$1')               // __đậm__ → đậm
            .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')       // `code` → code
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')          // ## Tiêu đề → Tiêu đề
            .replace(/^\s{0,3}\*\s+/gm, '• ')            // "* item" → "• item"
            .replace(/[ \t]{2,}/g, ' ')                   // gộp khoảng trắng thừa
            .trim();
    }

    /**
     * Tạo + lưu + emit một suggestion "chuyển nhân viên xử lý tay" (handoff).
     * Dùng khi KHÔNG muốn AI tự trả lời (vd sản phẩm tắt AI, hoặc chửi bậy cần escalate)
     * nhưng vẫn phải cho nhân viên thấy hội thoại — tránh im lặng bỏ rơi khách.
     * autoReplyEligible LUÔN false → không bao giờ tự gửi khách.
     */
    private async saveHandoffSuggestion(
        conversationId: string,
        triggerMessageId: string,
        note: string,
        model: string,
    ): Promise<AiSuggestion> {
        const convRow = await this.convRepo.findOne({ where: { id: conversationId }, select: ['id', 'tenantId'] });
        const suggestion = this.suggestRepo.create({
            conversationId,
            tenantId: convRow?.tenantId ?? null,
            triggerMessageId,
            replies: [{ text: note, label: '👤 Nhân viên xử lý' }],
            missingInfo: [],
            sources: [],
            confidence: 0,
            intent: Intent.CHUNG,
            model,
            latencyMs: 0,
            autoReplyEligible: false,
            status: SuggestionStatus.GENERATED,
            promptVersion: 'v3.0-refactored',
            quoteResult: null,
        });
        await this.suggestRepo.save(suggestion);
        this.emitSuggestionGenerated(suggestion.tenantId, conversationId, suggestion);
        return suggestion;
    }

    /**
     * Anti-hallucination: validate & sanitize AI responses
     */
    validateAiResult(result: any, quoteResult: PricingResult | null, kbChunks: any[]): any {
        if (!result || !result.replies) {
            return {
                replies: [{ text: 'Dạ, em sẽ kiểm tra và phản hồi bạn sớm nhất ạ!', label: 'Phản hồi an toàn' }],
                missing_info: [],
                intent: 'chung',
                confidence: 0.3,
            };
        }

        if (!Array.isArray(result.replies)) result.replies = [];
        if (!Array.isArray(result.missing_info)) result.missing_info = [];
        if (typeof result.intent !== 'string') result.intent = 'chung';
        if (typeof result.confidence !== 'number') result.confidence = 0.4;

        const pricePatternSources = [
            '\\d[\\d.,\\s]*\\s*(?:đ(?:ồng)?|VND|vnđ)',
            '\\d[\\d.,]*\\s*(?:triệu|tr)\\b',
            '\\d[\\d.,]*\\s*(?:nghìn|ngàn|k)\\b',
            '(?:khoảng|tầm|từ|chỉ|giá)\\s*\\d[\\d.,]*\\s*[-–~]\\s*\\d[\\d.,]*',
            '(?:giá|chi phí|đơn giá|tổng tiền|thành tiền)\\s*(?:là|khoảng|tầm|chỉ|từ)?\\s*(?:\\d{1,3}(?:[.,]\\d{3})+|\\d{4,})(?!\\s*(?:cm|mm|gsm|cái|cuốn|sp|sản phẩm))',
            // Audit 2026-08-29 — SỐ TIỀN VIẾT TRẦN: số có dấu phân cách nghìn đứng ngay trước
            // đơn vị đóng gói/tính, KHÔNG có hậu tố tiền và KHÔNG có từ "giá/chi phí" phía trước.
            // Đo trên chính bảng giá KB: bỏ ký tự tiền đi thì 85/85 dòng LỌT qua 5 pattern cũ,
            // ví dụ "Couche 300gsm cán mờ 2 mặt: ~150.000/hộp 200 cái" hoặc "~1.500/tờ (từ 100 tờ)".
            // Loại trừ `gsm/cm/mm/g/kg`… ở NGAY SAU số để không bắt thông số kỹ thuật.
            '\\d{1,3}(?:[.,]\\d{3})+(?!\\s*(?:gsm|cm|mm|m2|m²))\\s*(?:/|\\s+mỗi\\s+|\\s+một\\s+)\\s*(?:hộp|tờ|cái|con|cuốn|quyển|bộ|bao|thùng|kg|m2|m²|sp|sản phẩm|chiếc|túi|bịch)',
        ];

        // Giá trong prose luôn do LLM/canned/KB sinh ra nên không có provenance. Kể cả
        // LLM viết trùng total, server vẫn gỡ nó và dựng lại đúng một khối canonical.
        const hasVerifiedPrice = isAuthoritativePricingResult(quoteResult);
        const canonicalMarker = 'Báo giá hệ thống (từ bảng giá):';

        if (result.replies.length > 0 && typeof result.replies[0]?.text === 'string') {
            const markerIndex = result.replies[0].text.indexOf(canonicalMarker);
            if (markerIndex >= 0) {
                result.replies[0].text = result.replies[0].text.slice(0, markerIndex).trimEnd();
            }
        }

        for (const reply of result.replies) {
            if (!reply.text) continue;
            let fabricatedFound = false;
            for (const src of pricePatternSources) {
                const detectPattern = new RegExp(src, 'gi');
                const matches = reply.text.match(detectPattern);
                if (matches) {
                    // §11 audit-rules: đây là hành vi BÌNH THƯỜNG (LLM hay viết giá, server gỡ ra),
                    // xảy ra tới 6 pattern × mỗi reply ⇒ dùng `debug`, không `warn` (tránh flood log
                    // trong vòng lặp nóng). Cảnh báo thật đã có ở nhánh constraint.
                    this.logger.debug(`🚫 Anti-hallucination: gỡ claim giá không nguồn "${matches[0]}"`);
                    // Khi có quote thật, hướng người đọc xuống khối canonical do server dựng.
                    // Khi chưa có quote, giữ placeholder rõ nghĩa và chuyển nhân viên báo giá.
                    const replacement = hasVerifiedPrice
                        ? '[xem báo giá hệ thống bên dưới]'
                        : '[giá]';
                    reply.text = reply.text.replace(detectPattern, replacement);
                    fabricatedFound = true;
                }
            }
            if (fabricatedFound && !hasVerifiedPrice && !reply.text.includes('Nhân viên sẽ báo giá')) {
                reply.text += '\n\n⚠️ Lưu ý: Nhân viên bên mình đang tính toán chi tiết và sẽ báo giá chính xác nhất cho bạn ngay ạ.';
            }
            // Lưới an toàn chống "máy móc": gỡ markdown (**, ##, ``) khỏi reply của LLM
            // để tin nhắn nhìn tự nhiên như người thật nhắn Zalo (phòng khi LLM phớt lờ prompt).
            reply.text = this.stripMarkdown(reply.text);
        }

        if (hasVerifiedPrice && result.replies.length > 0) {
            const firstReply = result.replies[0];
            const breakdownText = (quoteResult.breakdown || [])
                .map((b: any) => `  • ${b.item}: ${b.cost.toLocaleString('vi-VN')}đ`)
                .join('\n');
            // Khối báo giá viết MỘC (không markdown/emoji tiêu đề) — rõ ràng mà không máy móc.
            const breakdownBlock = breakdownText ? `${breakdownText}\n` : '';
            const priceBlock = `\n\n${canonicalMarker}\n${breakdownBlock}Tổng: ${quoteResult.total.toLocaleString('vi-VN')}đ` +
                (quoteResult.unitPrice ? `\nĐơn giá: ${quoteResult.unitPrice.toLocaleString('vi-VN')}đ/cái` : '');
            firstReply.text = firstReply.text.trimEnd() + priceBlock;
        }

        if (result.confidence > 0.9 && !hasVerifiedPrice) {
            result.confidence = 0.7;
        }

        return result;
    }

    /**
     * Periodic cleanup of expired cache entries
     */
    private cleanupCaches(): void {
        const now = Date.now();
        let kbEvicted = 0;
        let trackerEvicted = this.autoReplyService.cleanupTrackers();

        // Clean expired KB cache
        for (const [key, val] of this.kbCache) {
            if (now - val.timestamp > KB_CACHE_TTL_MS) {
                this.kbCache.delete(key);
                kbEvicted++;
            }
        }

        if (kbEvicted > 0 || trackerEvicted > 0) {
            this.logger.log(`🧹 Cache cleanup: ${kbEvicted} KB entries, ${trackerEvicted} tracker entries evicted`);
        }
    }

    // ===== CRUD for suggestions =====

    async getForConversation(conversationId: string) {
        return this.suggestRepo.find({
            where: { conversationId },
            order: { createdAt: 'ASC' },
            take: 5,
        });
    }

    async acceptSuggestion(id: string) {
        const suggestion = await this.suggestRepo.findOne({ where: { id } });
        if (!suggestion) throw new Error('Suggestion not found');
        suggestion.status = SuggestionStatus.SENT;
        return this.suggestRepo.save(suggestion);
    }

    /**
     * Đánh dấu suggestion đã được AUTO-GỬI (auto-reply) để:
     *  - chống gửi 2 lần: FE ẩn nút "Gửi" khi nhận event 'suggestion_sent';
     *  - ghi nhận rate-limit auto-reply (chỉ đếm khi gửi THẬT);
     *  - cập nhật status = SENT.
     */
    async markAutoSent(id: string, conversationId: string): Promise<void> {
        try {
            this.autoReplyService.recordAutoReplySent(conversationId);
            const persisted = await this.suggestRepo.findOne({
                where: { id },
                select: ['id', 'tenantId'],
            });
            let tenantId = persisted?.tenantId ?? null;
            if (tenantId == null) {
                const conversation = await this.convRepo.findOne({
                    where: { id: conversationId },
                    select: ['id', 'tenantId'],
                });
                tenantId = conversation?.tenantId ?? null;
            }
            await this.suggestRepo.update(id, { status: SuggestionStatus.SENT });
            if (tenantId != null) {
                this.gateway.emitSuggestionSent(tenantId, conversationId, id, true);
            } else {
                this.logger.warn(`Bỏ suggestion_sent cho conv ${conversationId}: thiếu tenantId`);
            }
        } catch (e: any) {
            this.logger.warn(`markAutoSent failed for ${id}: ${e.message}`);
        }
    }

    async rejectSuggestion(id: string, reason?: string) {
        const suggestion = await this.suggestRepo.findOne({ where: { id } });
        if (!suggestion) throw new Error('Suggestion not found');
        suggestion.status = SuggestionStatus.REJECTED;
        suggestion.rejectionReason = reason || '';
        return this.suggestRepo.save(suggestion);
    }
}
