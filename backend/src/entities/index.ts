export { User, UserRole } from './user.entity';
export { Channel, ChannelType } from './channel.entity';
export { Contact } from './contact.entity';
export {
    Conversation,
    ConversationStatus,
    ConversationPriority,
} from './conversation.entity';
export {
    Message,
    SenderType,
    ContentType,
    MessageStatus,
    SuggestionAction,
} from './message.entity';
export { AiSuggestion, SuggestionStatus } from './ai-suggestion.entity';
export { KbDocument, KbDocStatus } from './kb-document.entity';
export { KbChunk } from './kb-chunk.entity';
export { QuoteRule } from './quote-rule.entity';
export { AuditLog } from './audit-log.entity';
export { Notification } from './notification.entity';
export { CannedResponse } from './canned-response.entity';
export { InternalNote } from './internal-note.entity';
export { QuickPrice } from './quick-price.entity';
export { PricingConfig } from './pricing-config.entity';
export { ConversationParticipant, ParticipantRole } from './conversation-participant.entity';
export { FollowUp, FollowUpStatus } from './follow-up.entity';

// ═══ Rebuilt Pricing Entities (Pricing-aligned) ═══
export { MaterialType } from './material-type.entity';
export { Material } from './material.entity';
export { PaperSize } from './paper-size.entity';
export { PricingTier } from './pricing-tier.entity';
export { ProcessingPricing } from './processing-pricing.entity';
export { LargeFormatPricing } from './large-format-pricing.entity';
export * from './unified-product.entity';
export * from './unified-product-category.entity';
export * from './product-ai-field.entity';
export * from './ai-suggestion.entity';
export * from './canned-response.entity';
export * from './product-quote-config.entity';
export * from './inventory-slip.entity';
export * from './inventory-slip-item.entity';
export { ProductCategory } from './product-category.entity';
export { Product } from './product.entity';
export { ProductQuoteConfig } from './product-quote-config.entity';
export { ProductAiField } from './product-ai-field.entity';

// ═══ Additional Pricing-aligned Entities ═══
export { PrintType } from './print-type.entity';
export { Unit } from './unit.entity';
export { ProductionCostConfig } from './production-cost-config.entity';
export { CustomerPriceGroup } from './customer-price-group.entity';

// ═══ Quote & Customer Entities ═══
export { Quote } from './quote.entity';
export { QuoteItem } from './quote-item.entity';
export { QuoteVersion } from './quote-version.entity';
export { Customer } from './customer.entity';
export { CustomerInteraction } from './customer-interaction.entity';
export { AiConversation } from './ai-conversation.entity';
export { SiteSetting } from './site-setting.entity';
export { SystemSetting } from './system-setting.entity';
export { SetupFee } from './setup-fee.entity';
export { ProductionCost } from './production-cost.entity';

// ═══ Unified Product Entities (Quote Templates) ═══
export { UnifiedProduct } from './unified-product.entity';
export { UnifiedProductCategory } from './unified-product-category.entity';

// ═══ Offset Printing Entities ═══
export { OffsetMachineConfig } from './offset-machine-config.entity';
export { PlatePricing } from './plate-pricing.entity';
export { WasteRule } from './waste-rule.entity';

// ═══ Print Method Unification — Capability Flags ═══
export { MethodCapability } from './method-capability.entity';

// ═══ Multi-tenant SaaS Entities ═══
export { Tenant, TenantStatus } from './tenant.entity';
export { SubscriptionPlan } from './subscription-plan.entity';
export { Payment, PaymentStatus } from './payment.entity';
export { Role } from './role.entity';
export { RolePermission } from './role-permission.entity';
