import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiSuggestion, Message, Conversation, Contact, KbDocument, KbChunk, FollowUp } from '../../entities';
import { AiSuggestService } from './ai-suggest.service';
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
import { ConversationOutcomeService } from './conversation-outcome.service';
import { OutcomeLearningService } from './outcome-learning.service';
import { ConversationSearchService } from './conversation-search.service';
import { AutoKbService } from './auto-kb.service';
import { ProactiveOutreachService } from './proactive-outreach.service';
import { AiMemoryService } from './ai-memory.service';
import { SuggestionsController } from './suggestions.controller';
import { ProductTemplatesController } from './product-templates.controller';
import { SearchKnowledgeBaseTool } from './tools/search-kb.tool';
import { GetProductInfoTool } from './tools/product-info.tool';
import { CheckMissingInfoTool } from './tools/missing-info.tool';
import { SearchSimilarConvTool } from './tools/similar-conv.tool';
import { OutcomeInsightsTool } from './tools/outcome-insights.tool';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { QuoteModule } from '../quote/quote.module';
import { CannedResponseModule } from '../canned-responses/canned-response.module';
import { GatewayModule } from '../gateway/gateway.module';

import { PricingModule } from '../pricing/pricing.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AiSuggestion, Message, Conversation, Contact, KbDocument, KbChunk, FollowUp]),
        KnowledgeBaseModule,
        QuoteModule,
        CannedResponseModule,
        GatewayModule,
        PricingModule,
    ],
    controllers: [SuggestionsController, ProductTemplatesController],
    providers: [
        AiSuggestService,
        AiLearningService,
        AiProviderService,
        PromptBuilderService,
        ContextInferenceService,
        TemplateFallbackService,
        QueryExpansionService,
        AgentPipelineService,
        PricingCatalogCacheService,
        ProfileBuilderService,
        AutoReplyService,
        ConversationSummaryService,
        ConversationOutcomeService,
        OutcomeLearningService,
        ConversationSearchService,
        AutoKbService,
        ProactiveOutreachService,
        AiMemoryService,
        SearchKnowledgeBaseTool,
        GetProductInfoTool,
        CheckMissingInfoTool,
        SearchSimilarConvTool,
        OutcomeInsightsTool,
    ],
    exports: [AiSuggestService, AiLearningService, AiProviderService, ConversationOutcomeService],
})
export class SuggestionsModule { }
