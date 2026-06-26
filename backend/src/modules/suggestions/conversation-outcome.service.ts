/**
 * Conversation Outcome Service
 * Captures analytics when a conversation transitions to won/lost/closed.
 * 
 * This data powers Phase 2 learning:
 * - Which AI suggestions led to won conversations?
 * - What intent patterns correlate with success?
 * - How long do successful conversations take?
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Message } from '../../entities/message.entity';
import { AiSuggestion, SuggestionStatus } from '../../entities/ai-suggestion.entity';
import { AutoKbService } from './auto-kb.service';

@Injectable()
export class ConversationOutcomeService {
    private readonly logger = new Logger(ConversationOutcomeService.name);

    constructor(
        @InjectRepository(Conversation) private convRepo: Repository<Conversation>,
        @InjectRepository(Message) private msgRepo: Repository<Message>,
        @InjectRepository(AiSuggestion) private suggestRepo: Repository<AiSuggestion>,
        @Inject(forwardRef(() => AutoKbService)) private autoKbService: AutoKbService,
    ) {}

    /**
     * Capture outcome data when conversation status changes to a terminal state.
     * Called from conversation update endpoints / status change hooks.
     */
    async captureOutcome(conversationId: string): Promise<void> {
        try {
            const conversation = await this.convRepo.findOne({ where: { id: conversationId } });
            if (!conversation) return;

            // Only capture for terminal statuses
            const terminalStatuses: ConversationStatus[] = [
                ConversationStatus.WON,
                ConversationStatus.LOST,
                ConversationStatus.CLOSED,
            ];
            if (!terminalStatuses.includes(conversation.status)) return;

            // Skip if already captured
            if (conversation.outcomeData?.totalMessages) {
                this.logger.log(`📊 Outcome already captured for ${conversationId}`);
                return;
            }

            // Load all messages
            const messages = await this.msgRepo.find({
                where: { conversationId },
                order: { createdAt: 'ASC' },
                select: ['id', 'senderType', 'createdAt', 'content'],
            });

            const customerMessages = messages.filter(m => m.senderType === 'customer');
            const agentMessages = messages.filter(m => m.senderType !== 'customer');

            // Load AI suggestions
            const suggestions = await this.suggestRepo.find({
                where: { conversationId },
                select: ['id', 'status', 'intent', 'quoteResult', 'autoReplyEligible'],
            });

            const accepted = suggestions.filter(s => s.status === SuggestionStatus.SENT);
            const edited = suggestions.filter(s => s.status === SuggestionStatus.EDITED);
            const rejected = suggestions.filter(s => s.status === SuggestionStatus.REJECTED);

            // Extract intent chain (unique, ordered)
            const intentChain = suggestions
                .map(s => s.intent)
                .filter((v, i, a) => v && a.indexOf(v) === i);

            // Find last quoted amount
            const quotedSuggestions = suggestions
                .filter(s => s.quoteResult?.total && s.quoteResult.total > 0)
                .sort((a, b) => (b.quoteResult?.total || 0) - (a.quoteResult?.total || 0));
            const quotedAmount = quotedSuggestions[0]?.quoteResult?.total;

            // Calculate timing
            let firstResponseTimeMs: number | undefined;
            if (customerMessages.length > 0 && agentMessages.length > 0) {
                const firstCustomer = customerMessages[0].createdAt;
                const firstAgent = agentMessages[0].createdAt;
                firstResponseTimeMs = new Date(firstAgent).getTime() - new Date(firstCustomer).getTime();
                if (firstResponseTimeMs < 0) firstResponseTimeMs = undefined;
            }

            let resolutionTimeMs: number | undefined;
            if (messages.length >= 2) {
                const first = messages[0].createdAt;
                const last = messages[messages.length - 1].createdAt;
                resolutionTimeMs = new Date(last).getTime() - new Date(first).getTime();
            }

            // Did auto-reply fire?
            const usedAutoReply = suggestions.some(s => s.autoReplyEligible);

            // Build outcome data
            const outcomeData = {
                totalMessages: messages.length,
                customerMessages: customerMessages.length,
                agentMessages: agentMessages.length,
                aiSuggestionsGenerated: suggestions.length,
                aiSuggestionsAccepted: accepted.length,
                aiSuggestionsEdited: edited.length,
                aiSuggestionsRejected: rejected.length,
                intentChain,
                quotedAmount,
                firstResponseTimeMs,
                resolutionTimeMs,
                productType: conversation.productType || undefined,
                usedAutoReply,
            };

            await this.convRepo.update(conversationId, {
                outcomeData,
                closedAt: conversation.closedAt || new Date(),
            });

            const statusEmoji = conversation.status === ConversationStatus.WON ? '🏆' :
                conversation.status === ConversationStatus.LOST ? '❌' : '📁';
            this.logger.log(
                `${statusEmoji} Outcome captured for ${conversationId}: ` +
                `${messages.length} msgs, ${suggestions.length} AI suggestions, ` +
                `${accepted.length} accepted, ${edited.length} edited, ` +
                `${quotedAmount ? `quoted ${quotedAmount.toLocaleString()}đ` : 'no quote'}, ` +
                `status=${conversation.status}`
            );

            // If won, extract Q&A pairs for auto-KB
            if (conversation.status === ConversationStatus.WON) {
                this.autoKbService.processWonConversation(conversationId).catch(err =>
                    this.logger.warn(`⚠️ Auto-KB extraction failed: ${(err as Error).message}`),
                );
            }
        } catch (err) {
            this.logger.warn(`⚠️ Outcome capture failed for ${conversationId}: ${(err as Error).message}`);
        }
    }
}
