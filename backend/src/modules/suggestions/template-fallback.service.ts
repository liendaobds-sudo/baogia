/**
 * Template Fallback Service
 * Provides structured responses when AI providers are unavailable.
 * Uses context inference + knowledge base for intelligent fallback.
 * Extracted from ai-suggest.service.ts for maintainability.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PricingResult } from '../quote/quote.interfaces';
import { type ProductTemplate } from '../quote/extractors';
import { ContextInferenceService } from './context-inference.service';

@Injectable()
export class TemplateFallbackService {
    private readonly logger = new Logger(TemplateFallbackService.name);

    constructor(
        private readonly contextInference: ContextInferenceService,
    ) { }

    /**
     * Generate a template-based fallback response (no AI needed)
     */
    generateFallback(
        lastMessage: string,
        kbChunks: any[],
        quoteResult: PricingResult | null | undefined,
        allMessages?: any[],
        matchedTemplate?: ProductTemplate,
    ): any {
        const lower = lastMessage.toLowerCase();

        // ── BUILD CONVERSATION CONTEXT ──
        const customerMessages = (allMessages || []).filter((m: any) => m.senderType === 'customer');
        const combinedContext = customerMessages.map((m: any) => m.content.toLowerCase()).join(' ');
        const isFollowUp = customerMessages.length > 1;
        const isProductWithGiay = /(hộp giấy|túi giấy|bao giấy)/i.test(lower);
        const isMaterialFollowUp = isFollowUp && !isProductWithGiay &&
            /(giấy\s+\w{2,}|nhựa|pvc|vinyl|couche|art\b|bristol|briston|kraft|ivory|offset|chất liệu|loại giấy|loại nhựa)/i.test(lower);

        const inferenceText = isFollowUp ? combinedContext : lower;

        // ── If Pricing returned a real quote → show with persuasion ──
        if (quoteResult && quoteResult.total && quoteResult.total > 0) {
            return this.buildQuoteReply(quoteResult);
        }

        // ── CONTEXT INFERENCE ENGINE ──
        const inference = this.contextInference.inferContext(inferenceText);

        // ── Pricing PRODUCT TEMPLATE FIELDS → ask all required fields ──
        if (matchedTemplate?.fields?.length) {
            const requiredFields = matchedTemplate.fields.filter(f => f.is_required);
            if (requiredFields.length > 0) {
                const questions = requiredFields.map(f => `• ${f.ai_question || f.field_name + '?'}`);
                const missingInfo = requiredFields.map(f => ({
                    slot: f.field_code,
                    question: f.ai_question || f.field_name + '?',
                }));
                let text = `Dạ em ghi nhận! Để báo giá ${matchedTemplate.name} chính xác, bạn cho em biết thêm:\n\n${questions.join('\n')}`;
                if (!/(file|thiết kế|design|hình|mẫu|artwork)/.test(lower)) {
                    text += '\n\nBạn đã có file thiết kế chưa, hay cần em hỗ trợ thiết kế ạ?';
                }
                return {
                    replies: [{ text, label: '💬 HỎI THÔNG TIN ' + matchedTemplate.name.toUpperCase() }],
                    missing_info: missingInfo,
                    intent: 'hỏi_sản_phẩm',
                    confidence: 0.7,
                };
            }
        }

        // ── MATERIAL FOLLOW-UP HANDLER ──
        if (isMaterialFollowUp) {
            const reply = this.handleMaterialFollowUp(lower, inference);
            if (reply) return reply;
        }

        // ── If quote parser found product but missing fields ──
        if (quoteResult?.missingFields?.length) {
            return this.buildMissingFieldsReply(quoteResult, inference, lower);
        }

        // ── General inquiry with some inference ──
        if (inference.material || inference.size || inference.finishing) {
            return this.buildInferenceReply(inference, lower);
        }

        // ── EDGE CASE handling ──
        const edgeMatch = this.contextInference.matchEdgeCase(lower);
        if (edgeMatch) {
            if (edgeMatch.response === 'ESCALATE_TO_HUMAN') {
                return {
                    replies: [{ text: 'Dạ em chuyển cho nhân viên phụ trách hỗ trợ bạn ngay ạ.', label: '👤 Chuyển NV' }],
                    missing_info: [],
                    intent: 'chung',
                    confidence: 0.9,
                    escalate: true,
                };
            }
            return {
                replies: [{ text: edgeMatch.response, label: edgeMatch.label || '📋 Thông tin' }],
                missing_info: [],
                intent: edgeMatch.intent || 'chung',
                confidence: 0.7,
            };
        }

        // ── FAQ matching ──
        const faqMatch = this.contextInference.matchFAQ(lower);
        if (faqMatch) {
            return {
                replies: [{ text: faqMatch.answer, label: '📋 Thông tin' }],
                missing_info: [],
                intent: faqMatch.intent || 'chung',
                confidence: 0.7,
            };
        }

        // ── Default ──
        return {
            replies: [{
                text: 'Dạ em ghi nhận! Bạn cần in gì ạ? Em tư vấn giá và chất liệu phù hợp nhất cho bạn nhé! 😊',
                label: '📋 Sẵn sàng tư vấn',
            }],
            missing_info: [],
            intent: 'chung',
            confidence: 0.3,
        };
    }

    // ── Private helpers ──

    private buildQuoteReply(quoteResult: PricingResult): any {
        const breakdownText = quoteResult.breakdown
            .map(b => `  • ${b.item}: ${b.cost.toLocaleString('vi-VN')}đ`)
            .join('\n');

        let persuasion = '\nBạn xác nhận đặt hàng không ạ?';
        if (quoteResult.unitPrice && quoteResult.unitPrice < 5000) {
            persuasion = `\nĐơn giá chỉ ${quoteResult.unitPrice.toLocaleString('vi-VN')}đ/cái, khá hợp lý cho in offset ạ. Bạn chốt đơn em xử lý ngay nhé?`;
        }

        return {
            replies: [{
                text: `Dạ em báo giá cho bạn nha:\n\n${breakdownText}\n\nTổng: ${quoteResult.total!.toLocaleString('vi-VN')}đ${quoteResult.unitPrice ? `\nĐơn giá: ${quoteResult.unitPrice.toLocaleString('vi-VN')}đ/cái` : ''}${persuasion}`,
                label: '💰 Báo giá',
            }],
            missing_info: [],
            intent: 'hỏi_giá',
            confidence: 0.85,
        };
    }

    private handleMaterialFollowUp(lower: string, inference: any): any | null {
        const materialMention = lower.match(/(giấy\s+\w+|couche|art|bristol|briston|kraft|ivory|offset|pvc|vinyl|nhựa|decal giấy|decal nhựa)/i);
        if (!materialMention) return null;

        const requestedMaterial = materialMention[0];
        const productContext = inference.matchedProduct || 'sản phẩm bạn đang hỏi';
        let replyText = `Dạ, ${requestedMaterial} cũng in ${productContext} được ạ!`;

        const materialAdvice = this.contextInference.getMaterialAdvice(requestedMaterial.toLowerCase(), inference);
        if (materialAdvice) replyText += ` ${materialAdvice}`;
        replyText += '\n\nBạn muốn em tính giá với chất liệu này không ạ? 😊';

        return {
            replies: [{ text: replyText, label: '💡 Tư vấn chất liệu' }],
            missing_info: [],
            intent: 'hỏi_giá',
            confidence: 0.7,
        };
    }

    private buildMissingFieldsReply(quoteResult: PricingResult, inference: any, lower: string): any {
        const remainingMissing: { slot: string; question: string }[] = [];
        const recommendations: string[] = [];

        for (const field of quoteResult.missingFields!) {
            if (field === 'material' && inference.material) {
                recommendations.push(`Chất liệu: em recommend ${inference.material.name} vì ${inference.material.reason}. ${inference.material.socialProof || ''}`);
            } else if (field === 'size' && inference.size) {
                recommendations.push(`Kích thước: ${inference.size.suggestion} ${inference.size.context || ''}`);
            } else if (field === 'quantity') {
                remainingMissing.push({ slot: 'quantity', question: 'Bạn cần in bao nhiêu cái/tờ ạ?' });
            } else if (field === 'pageCount') {
                remainingMissing.push({ slot: 'pageCount', question: 'Bao nhiêu trang ạ?' });
            } else if (field === 'bindingType') {
                remainingMissing.push({ slot: 'bindingType', question: 'Đóng gáy kiểu gì ạ? (lò xo, keo nhiệt, ghim)' });
            } else if (field === 'product') {
                remainingMissing.push({ slot: 'product', question: 'Bạn muốn in sản phẩm gì ạ?' });
            } else if (field === 'size' && !inference.size) {
                remainingMissing.push({ slot: 'size', question: 'Kích thước bao nhiêu ạ?' });
            } else if (field === 'material' && !inference.material) {
                const isDecalProduct = /(decal|tem|sticker|nhãn)/i.test(lower);
                if (isDecalProduct || inference.needsUsageContext) {
                    remainingMissing.push({ slot: 'material', question: inference.usageQuestion || 'Bạn dán vào đâu ạ? (VD: chai/hũ, điện thoại, hộp giấy, ngoài trời...) — em sẽ tư vấn chất liệu phù hợp nhất!' });
                } else {
                    remainingMissing.push({ slot: 'material', question: 'Bạn muốn in trên giấy gì ạ? (VD: couche 300gsm, art 250gsm)' });
                }
            }
        }

        if (inference.finishing) {
            recommendations.push(`Gia công: ${inference.finishing}`);
        }
        if (inference.upsell) {
            recommendations.push(`Gợi ý: ${inference.upsell}`);
        }

        let replyText = 'Dạ em ghi nhận!';
        if (recommendations.length > 0) {
            replyText += ` Dựa trên nhu cầu của bạn, em recommend:\n\n${recommendations.join('\n')}`;
        }
        if (remainingMissing.length > 0) {
            replyText += `\n\nĐể em báo giá chính xác, bạn cho em biết thêm:\n${remainingMissing.map(m => `• ${m.question}`).join('\n')}`;
        }
        if (!/(file|thiết kế|design|hình|mẫu|artwork)/.test(lower)) {
            replyText += '\n\nBạn đã có file thiết kế chưa, hay cần em hỗ trợ thiết kế ạ?';
        }
        if (recommendations.length > 0) {
            replyText += '\n\nBạn thấy ok không ạ? 😊';
        }

        return {
            replies: [{
                text: replyText,
                label: recommendations.length > 0 ? '💡 Tư vấn chuyên gia' : '💬 Cần thêm thông tin',
            }],
            missing_info: remainingMissing,
            intent: 'hỏi_giá',
            confidence: recommendations.length > 0 ? 0.7 : 0.5,
        };
    }

    private buildInferenceReply(inference: any, lower: string): any {
        const tips: string[] = [];
        if (inference.material) tips.push(`Em recommend dùng ${inference.material.name} vì ${inference.material.reason}.`);
        if (inference.size) tips.push(`${inference.size.suggestion}`);
        if (inference.finishing) tips.push(`${inference.finishing}`);

        let replyText = `Dạ em ghi nhận! Với nhu cầu của bạn:\n\n${tips.join('\n')}\n\nĐể em báo giá chính xác, bạn cho em biết thêm kích thước và số lượng nhé!`;
        if (!/(file|thiết kế|design|hình|mẫu|artwork)/.test(lower)) {
            replyText += '\nBạn đã có file thiết kế chưa ạ?';
        }

        return {
            replies: [{ text: replyText, label: '💡 Tư vấn chuyên gia' }],
            missing_info: [
                { slot: 'size', question: 'Kích thước bao nhiêu?' },
                { slot: 'quantity', question: 'Số lượng bao nhiêu?' },
            ],
            intent: 'hỏi_giá',
            confidence: 0.6,
        };
    }
}
