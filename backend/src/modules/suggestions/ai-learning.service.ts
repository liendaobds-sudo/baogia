import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { AiSuggestion, SuggestionStatus } from '../../entities/ai-suggestion.entity';

@Injectable()
export class AiLearningService {
    private readonly logger = new Logger(AiLearningService.name);

    constructor(
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
    ) { }

    /**
     * Record agent edit: saves original vs edited text for learning
     */
    async recordEdit(
        suggestionId: string,
        editedText: string,
        replyIndex: number,
    ): Promise<AiSuggestion> {
        const suggestion = await this.suggestRepo.findOne({ where: { id: suggestionId } });
        if (!suggestion) throw new Error('Suggestion not found');

        suggestion.editedText = editedText;
        suggestion.editedAt = new Date();
        suggestion.usedReplyIndex = replyIndex;
        suggestion.status = SuggestionStatus.EDITED;

        this.logger.log(`📝 Agent edited suggestion ${suggestionId.substring(0, 8)} (reply #${replyIndex})`);
        return this.suggestRepo.save(suggestion);
    }

    /**
     * Record agent feedback (thumbs up / down)
     */
    async recordFeedback(suggestionId: string, feedback: 'up' | 'down'): Promise<AiSuggestion> {
        const suggestion = await this.suggestRepo.findOne({ where: { id: suggestionId } });
        if (!suggestion) throw new Error('Suggestion not found');

        suggestion.agentFeedback = feedback;
        this.logger.log(`👍👎 Agent feedback '${feedback}' for suggestion ${suggestionId.substring(0, 8)}`);
        return this.suggestRepo.save(suggestion);
    }

    /**
     * Get recent agent edits for learning context
     * Returns pairs of (original AI text → agent's edited text)
     * Lọc theo tenant — bản sửa của agent tenant A không được bơm vào prompt tenant B.
     */
    async getRecentEdits(limit = 10, tenantId?: number): Promise<{ original: string; edited: string; intent: string }[]> {
        const editedSuggestions = await this.suggestRepo.find({
            where: {
                editedText: Not(IsNull()),
                status: SuggestionStatus.EDITED,
                ...(tenantId != null ? { tenantId } : {}),
            },
            order: { editedAt: 'DESC' },
            take: limit,
            select: ['replies', 'editedText', 'usedReplyIndex', 'intent'],
        });

        return editedSuggestions
            .filter(s => s.editedText && s.replies?.length)
            .map(s => ({
                original: s.replies[s.usedReplyIndex || 0]?.text || s.replies[0]?.text || '',
                edited: s.editedText,
                intent: s.intent || 'chung',
            }));
    }

    /**
     * Build learning context string for AI prompt injection.
     * Shows the AI how agents have been correcting its responses.
     *
     * UPGRADE: Filters edits by matching intent first, then falls back to global edits.
     * This ensures the examples are relevant to the current conversation context.
     */
    async buildLearningContext(currentIntent?: string, tenantId?: number | null): Promise<string> {
        // CÔ LẬP TENANT (fail-closed): không rõ tenant → không bơm bản sửa của agent
        // (có thể chứa giá/chính sách riêng) vào prompt.
        if (tenantId == null) {
            this.logger.debug('Bỏ qua learning context: thiếu tenantId (fail-closed)');
            return '';
        }

        let edits: { original: string; edited: string; intent: string }[];

        if (currentIntent) {
            // First try: edits with the same intent (most relevant)
            edits = await this.getEditsByIntent(currentIntent, 3, tenantId);
            // Supplement with edits of other intents (same tenant) if not enough
            if (edits.length < 3) {
                const globalEdits = await this.getRecentEdits(5 - edits.length, tenantId);
                const existingOriginals = new Set(edits.map(e => e.original));
                for (const edit of globalEdits) {
                    if (!existingOriginals.has(edit.original)) edits.push(edit);
                }
            }
        } else {
            edits = await this.getRecentEdits(5, tenantId);
        }

        if (edits.length === 0) return '';

        let context = '\n\n## HỌC TỪ AGENT (Feedback gần đây)\n';
        context += 'Agent đã sửa một số câu trả lời của AI. Hãy học từ các sửa đổi này:\n\n';

        for (const edit of edits) {
            // Truncate long texts
            const origShort = edit.original.length > 150 ? edit.original.substring(0, 150) + '...' : edit.original;
            const editShort = edit.edited.length > 150 ? edit.edited.substring(0, 150) + '...' : edit.edited;
            const intentLabel = edit.intent === currentIntent ? `${edit.intent} ⭐` : edit.intent;
            context += `- Intent "${intentLabel}":\n`;
            context += `  AI viết: "${origShort}"\n`;
            context += `  Agent sửa thành: "${editShort}"\n\n`;
        }

        context += 'Hãy áp dụng phong cách và cách diễn đạt mà Agent thích dùng.\n';
        return context;
    }

    /**
     * Get edits filtered by specific intent (trong phạm vi một tenant)
     */
    async getEditsByIntent(intent: string, limit = 5, tenantId?: number): Promise<{ original: string; edited: string; intent: string }[]> {
        const editedSuggestions = await this.suggestRepo.find({
            where: {
                editedText: Not(IsNull()),
                status: SuggestionStatus.EDITED,
                intent,
                ...(tenantId != null ? { tenantId } : {}),
            },
            order: { editedAt: 'DESC' },
            take: limit,
            select: ['replies', 'editedText', 'usedReplyIndex', 'intent'],
        });

        return editedSuggestions
            .filter(s => s.editedText && s.replies?.length)
            .map(s => ({
                original: s.replies[s.usedReplyIndex || 0]?.text || s.replies[0]?.text || '',
                edited: s.editedText,
                intent: s.intent || 'chung',
            }));
    }

    /**
     * Get learning stats for dashboard
     */
    async getStats(): Promise<{
        totalEdits: number;
        recentEdits: number;
        topEditedIntents: { intent: string; count: number }[];
    }> {
        const totalEdits = await this.suggestRepo.count({
            where: { editedText: Not(IsNull()) },
        });

        const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);
        const recentEdits = await this.suggestRepo
            .createQueryBuilder('s')
            .where('s.edited_text IS NOT NULL')
            .andWhere('s.edited_at > :weekAgo', { weekAgo })
            .getCount();

        // Top edited intents
        const intentGroups = await this.suggestRepo
            .createQueryBuilder('s')
            .select('s.intent', 'intent')
            .addSelect('COUNT(*)', 'count')
            .where('s.edited_text IS NOT NULL')
            .groupBy('s.intent')
            .orderBy('count', 'DESC')
            .limit(5)
            .getRawMany();

        return {
            totalEdits,
            recentEdits,
            topEditedIntents: intentGroups.map(g => ({ intent: g.intent, count: parseInt(g.count) })),
        };
    }
}
