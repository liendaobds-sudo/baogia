/**
 * Context Inference Service
 * Loads printing knowledge data and infers material, size, finishing
 * recommendations from customer messages.
 * Extracted from ai-suggest.service.ts for maintainability and testability.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ContextInferenceService implements OnModuleInit {
    private readonly logger = new Logger(ContextInferenceService.name);
    private _knowledgeData: any = null;

    async onModuleInit() {
        await this.loadKnowledge();
    }

    /**
     * Get the loaded printing knowledge data (synchronous)
     */
    getKnowledgeData(): any {
        if (!this._knowledgeData) {
            // Should be loaded by onModuleInit, but safe fallback
            this.logger.warn('Knowledge data accessed before being loaded! Serving empty knowledge.');
            return { products: {}, faq: [], materials: {}, finishingTechniques: {}, printingTechniques: {} };
        }
        return this._knowledgeData;
    }

    /**
     * Force-reload knowledge data (e.g. after knowledge base update)
     */
    async refreshKnowledge(): Promise<void> {
        this._knowledgeData = null;
        await this.loadKnowledge();
    }

    private async loadKnowledge(): Promise<void> {
        try {
            const knowledgeDir = path.resolve(__dirname, '../../data/knowledge');

            // Load modular knowledge files
            if (fs.existsSync(knowledgeDir)) {
                const merged: any = {};
                const files = (await fsp.readdir(knowledgeDir)).filter((f: string) => f.endsWith('.json'));
                for (const file of files) {
                    try {
                        const fileContent = await fsp.readFile(path.join(knowledgeDir, file), 'utf-8');
                        const data = JSON.parse(fileContent);
                        for (const [key, value] of Object.entries(data)) {
                            if (!key.startsWith('_')) merged[key] = value;
                        }
                    } catch (e) {
                        this.logger.warn(`⚠️ Could not load knowledge/${file}: ${(e as Error).message}`);
                    }
                }
                this._knowledgeData = merged;
                const stats = files.map((f: string) => f.replace('.json', '')).join(', ');
                this.logger.log(`📖 Loaded modular knowledge: ${files.length} files (${stats}), ${Object.keys(merged.products || {}).length} products, ${Object.keys(merged.materials || {}).length} materials, ${Object.keys(merged.finishingTechniques || {}).length} finishing`);
            } else {
                // Fallback: legacy single file
                const dataPath = path.resolve(__dirname, '../../data/printing-knowledge.json');
                const fileContent = await fsp.readFile(dataPath, 'utf-8');
                this._knowledgeData = JSON.parse(fileContent);
                this.logger.log(`📖 Loaded legacy knowledge: ${Object.keys(this._knowledgeData.products || {}).length} products`);
            }
        } catch (e) {
            this.logger.warn(`⚠️ Could not load knowledge data: ${(e as Error).message}`);
            this._knowledgeData = { products: {}, faq: [], materials: {}, finishingTechniques: {}, printingTechniques: {} };
        }
    }

    /**
     * Infer context (material, size, finishing) from customer text
     */
    inferContext(text: string): {
        material?: { name: string; reason: string; socialProof?: string };
        size?: { suggestion: string; context?: string };
        finishing?: string;
        needsUsageContext?: boolean;
        usageQuestion?: string;
        upsell?: string;
        matchedProduct?: string;
    } {
        const kb = this.getKnowledgeData();
        const result: any = {};

        for (const [productKey, product] of Object.entries<any>(kb.products || {})) {
            const keywords: string[] = product.keywords || [];
            const matched = keywords.some((kw: string) => text.includes(kw.toLowerCase()));
            if (!matched) continue;

            const pName = product.displayName || productKey;
            result.matchedProduct = result.matchedProduct ? `${result.matchedProduct} & ${pName}` : pName;

            // Products WITH usageRules (like decal) → match usage context
            if (product.usageRules) {
                let ruleMatched = false;
                for (const rule of product.usageRules) {
                    const contextMatch = (rule.context || []).some((ctx: string) => text.includes(ctx.toLowerCase()));
                    if (contextMatch) {
                        const matName = `${pName}: ${rule.material?.name || ''}`;
                        const matReason = `${pName}: ${rule.reason || ''}`;
                        if (result.material) {
                            result.material.name += ` | ${matName}`;
                            result.material.reason += ` | ${matReason}`;
                            result.material.socialProof = result.material.socialProof || rule.socialProof || '';
                        } else {
                            result.material = {
                                name: matName,
                                reason: matReason,
                                socialProof: rule.socialProof || '',
                            };
                        }

                        if (rule.sizes?.length) {
                            const sizeSuggestions = rule.sizes.map((s: any) => `${s.name} (${s.context})`).join(', ');
                            const sizeStr = `${pName}: ${sizeSuggestions}`;
                            result.size = result.size ? { suggestion: `${result.size.suggestion} | ${sizeStr}` } : { suggestion: `Kích thước phổ biến: ${sizeStr} ạ.` };
                        }
                        if (rule.finishing?.length) {
                            const fin = `${pName} recommend ${rule.finishing[0]}${rule.finishingReason ? ` — ${rule.finishingReason}` : ''}.`;
                            result.finishing = result.finishing ? `${result.finishing} | ${fin}` : fin;
                        }
                        if (rule.upsell) result.upsell = result.upsell ? `${result.upsell} | ${pName}: ${rule.upsell}` : rule.upsell;
                        ruleMatched = true;
                        break;
                    }
                }
                // No usage context matched → ask smart question
                if (!ruleMatched) {
                    result.needsUsageContext = true;
                    const question = product.defaultQuestion || `Với ${pName}, bạn dùng cho mục đích gì ạ?`;
                    result.usageQuestion = result.usageQuestion ? `${result.usageQuestion} ${question}` : question;
                }
            }
            // Products WITHOUT usageRules (namecard, menu, etc.) → direct material
            else if (product.material) {
                const matName = `${pName}: ${product.material.name || ''}`;
                const matReason = `${pName}: ${product.reason || ''}`;
                if (result.material) {
                    result.material.name += ` | ${matName}`;
                    result.material.reason += ` | ${matReason}`;
                    result.material.socialProof = result.material.socialProof || product.socialProof || '';
                } else {
                    result.material = {
                        name: matName,
                        reason: matReason,
                        socialProof: product.socialProof || '',
                    };
                }
                
                if (product.sizes?.length) {
                    const sizeSuggestions = product.sizes.map((s: any) => `${s.name} (${s.context})`).join(', ');
                    const sizeStr = `${pName}: ${sizeSuggestions}`;
                    result.size = result.size ? { suggestion: `${result.size.suggestion} | ${sizeStr}` } : { suggestion: `Kích thước phổ biến: ${sizeStr} ạ.` };
                }
                if (product.finishing?.length) {
                    const fin = `${pName} recommend ${product.finishing[0]}${product.finishingReason ? ` — ${product.finishingReason}` : ''}.`;
                    result.finishing = result.finishing ? `${result.finishing} | ${fin}` : fin;
                }
                if (product.upsell) result.upsell = result.upsell ? `${result.upsell} | ${pName}: ${product.upsell}` : product.upsell;
            }
            // No break! Allow matching multiple products
        }

        return result;
    }

    /**
     * Match customer message against FAQ patterns from knowledge base
     */
    matchFAQ(text: string): { answer: string; intent: string } | null {
        const kb = this.getKnowledgeData();
        for (const faq of (kb.faq || [])) {
            const matched = (faq.patterns || []).some((p: string) => text.includes(p.toLowerCase()));
            if (matched) {
                return { answer: faq.answer, intent: faq.intent || 'chung' };
            }
        }
        return null;
    }

    /**
     * Match customer message against edge case patterns from knowledge base
     */
    matchEdgeCase(text: string): { response: string; label?: string; intent?: string } | null {
        const kb = this.getKnowledgeData();
        const edgeCases = kb.edgeCases || {};

        for (const [type, ec] of Object.entries<any>(edgeCases)) {
            const patterns: string[] = ec.patterns || ec.keywords || [];
            const matched = patterns.some((p: string) => text.includes(p.toLowerCase()));
            if (matched) {
                const labelMap: Record<string, string> = {
                    offTopic: '📋 Ngoài chủ đề',
                    profanity: '👤 Chuyển NV',
                    rushOrder: '⚡ In gấp',
                    portfolioRequest: '🖼️ Xem mẫu',
                };
                return {
                    response: ec.response || ec.guidance || '',
                    label: labelMap[type] || '📋 Thông tin',
                    intent: type === 'rushOrder' ? 'hỏi_giao_hàng' : 'chung',
                };
            }
        }
        return null;
    }

    /**
     * Get expert advice about a specific material from knowledge base
     */
    getMaterialAdvice(requestedMaterial: string, inference: any): string {
        const kb = this.getKnowledgeData();
        const materials = kb.materials || {};

        for (const [, mat] of Object.entries<any>(materials)) {
            const aliases: string[] = mat.aliases || [];
            const matched = aliases.some((alias: string) => requestedMaterial.includes(alias.toLowerCase()));
            if (matched) {
                let advice = `\n\n📋 **${mat.displayName}:** ${mat.description}.`;
                if (mat.pros) advice += `\n✅ Ưu điểm: ${mat.pros}`;
                if (mat.cons) advice += `\n⚠️ Lưu ý: ${mat.cons}`;
                if (mat.comparison) advice += `\n\n💡 ${mat.comparison}`;
                if (mat.weights?.length > 0 && mat.weights[0] !== 'varies') {
                    advice += `\n📏 Độ dày phổ biến: ${mat.weights.join(', ')}`;
                }
                if (inference.material && !requestedMaterial.includes(inference.material.name.toLowerCase())) {
                    advice += `\n\n🔄 So với ${inference.material.name} (em recommend ban đầu): ${inference.material.reason}`;
                }
                return advice;
            }
        }
        return '';
    }

    /**
     * Build printing knowledge context for injection into AI prompt
     */
    buildPrintingKnowledgeContext(simplifyFn: (text: string) => string, customerText?: string): string {
        const kb = this.getKnowledgeData();
        let context = '';

        try {
            // Products summary
            const productLines = Object.entries<any>(kb.products || {}).map(([, p]) => {
                const mat = p.material?.name || (p.usageRules ? 'tùy mục đích sử dụng' : 'custom');
                const sizes = (p.sizes || []).slice(0, 2).map((s: any) => s.name).join(', ') || 'tùy chỉnh';
                return simplifyFn(`- ${p.displayName}: chất liệu ${mat}, size phổ biến: ${sizes}`);
            });
            // Materials summary
            const materialLines = Object.entries<any>(kb.materials || {}).map(([, m]) => {
                return simplifyFn(`- ${m.displayName}: ${m.description}. Ưu: ${m.pros}. Nhược: ${m.cons}`);
            });
            // Techniques summary
            const techniqueLines = Object.entries<any>(kb.printingTechniques || {}).map(([, t]) => {
                return simplifyFn(`- ${t.name}: ${t.description}`);
            });
            // Finishing summary
            const finishingLines = Object.entries<any>(kb.finishingTechniques || {}).map(([, f]) => {
                return simplifyFn(`- ${f.name}: ${f.description}. Dùng cho: ${(f.suitableFor || []).slice(0, 3).join(', ')}`);
            });
            // Industry combos summary
            const comboLines = Object.entries<any>(kb.industryCombos || {}).map(([, c]) => {
                return simplifyFn(`- ${c.name}: ${(c.products || []).join(', ')}`);
            });

            context = `\n## Danh mục sản phẩm bên em:\n${productLines.join('\n')}\n`;
            if (materialLines.length > 0) context += `\n## Chất liệu in ấn:\n${materialLines.join('\n')}\n`;
            if (techniqueLines.length > 0) context += `\n## Kỹ thuật in:\n${techniqueLines.join('\n')}\n`;
            if (finishingLines.length > 0) context += `\n## Gia công sau in:\n${finishingLines.join('\n')}\n`;
            if (comboLines.length > 0) context += `\n## Combo theo ngành (upsell):\n${comboLines.join('\n')}\n`;

            // Constraint rules — inject only RELEVANT rules based on customer context
            const constraintContext = this.buildConstraintRulesContext(customerText);
            if (constraintContext) context += constraintContext;
        } catch (e) { /* knowledge injection is optional */ }

        return context;
    }

    /**
     * Build constraint rules context from printing-constraints.json
     * Only injects rules RELEVANT to the current conversation context
     * Max 12 rules to keep prompt compact
     */
    buildConstraintRulesContext(customerText?: string): string {
        const kb = this.getKnowledgeData();
        const constraints = kb.constraintRules;
        if (!constraints) return '';

        const text = (customerText || '').toLowerCase();

        // Map categories → keywords that trigger them
        const categoryTriggers: Record<string, string[]> = {
            lamination: ['cán', 'cán mờ', 'cán bóng', 'matt', 'gloss', 'lamination'],
            paper_weight: ['gsm', 'giấy', 'định lượng', 'dày', 'mỏng', 'couche', 'offset', 'kraft', 'ivory', 'art'],
            print_sides: ['mặt', '2 mặt', '1 mặt', 'in 2', 'in 1'],
            binding: ['đóng', 'ghim', 'keo', 'lò xo', 'cuốn', 'sách', 'catalogue', 'trang', 'brochure'],
            finishing_foil: ['nhũ', 'uv', 'foil', 'dập nổi', 'emboss', 'spot uv'],
            die_cutting: ['bế', 'die-cut', 'kiss-cut', 'bo góc', 'cắt hình'],
            material_compatibility: ['kraft', 'pvc', 'decal', 'ngoài trời', 'chống nước', 'pp', 'trong suốt'],
            quantity_pricing: ['số lượng', 'bao nhiêu cái', 'offset', 'digital', 'gấp'],
            color_design: ['rgb', 'cmyk', 'file', 'màu', 'font', 'dpi', '300'],
            common_mistakes: ['word', 'powerpoint', 'ảnh', 'facebook', 'giống màn hình'],
        };

        // Always-include categories for common products
        // NOTE: 'print_sides' không được include cho sản phẩm luôn in 1 mặt.
        // Decal/sticker/tem: mặt sau là keo dán [SIDE-001]
        // Banner/standee/poster: in khổ lớn chỉ in 1 mặt [SIDE-002, SIDE-004, SIDE-005]
        // Nếu inject 'print_sides' cho các sản phẩm này → LLM sẻ hỏi khách số mặt!
        const productAlwaysInclude: Record<string, string[]> = {
            'decal': ['lamination', 'material_compatibility', 'die_cutting'],     // SIDE-001: luôn 1 mặt
            'sticker': ['lamination', 'material_compatibility', 'die_cutting'],   // SIDE-001: luôn 1 mặt
            'tem': ['lamination', 'material_compatibility', 'die_cutting'],       // SIDE-001: luôn 1 mặt
            'namecard': ['lamination', 'paper_weight', 'finishing_foil', 'die_cutting'],
            'danh thiếp': ['lamination', 'paper_weight', 'finishing_foil', 'die_cutting'],
            'catalogue': ['binding', 'paper_weight', 'lamination'],
            'brochure': ['binding', 'paper_weight', 'lamination'],
            'tờ rơi': ['paper_weight', 'lamination', 'quantity_pricing'],
            'flyer': ['paper_weight', 'lamination', 'quantity_pricing'],
            'banner': ['lamination', 'material_compatibility'],                   // SIDE-002: khổ lớn luôn 1 mặt
            'standee': ['lamination'],                                            // SIDE-004: luôn 1 mặt
            'menu': ['paper_weight', 'lamination'],
            'poster': ['lamination', 'paper_weight'],                             // SIDE-005: luôn 1 mặt
            'hộp': ['paper_weight', 'die_cutting'],
            'túi': ['material_compatibility', 'paper_weight'],
        };

        // Determine which categories are relevant
        const relevantCategories = new Set<string>();

        // 1. Match by product keywords
        for (const [product, cats] of Object.entries(productAlwaysInclude)) {
            if (text.includes(product)) {
                cats.forEach(c => relevantCategories.add(c));
            }
        }

        // 2. Match by topic keywords in customer text
        for (const [catKey, triggers] of Object.entries(categoryTriggers)) {
            if (triggers.some(t => text.includes(t))) {
                relevantCategories.add(catKey);
            }
        }

        // 3. If nothing matched (generic message), include most universal rules
        if (relevantCategories.size === 0) {
            relevantCategories.add('lamination');
            relevantCategories.add('paper_weight');
            relevantCategories.add('color_design');
        }

        // Collect relevant rules
        const lines: string[] = [];
        for (const [catKey, category] of Object.entries<any>(constraints)) {
            if (!category.rules || !relevantCategories.has(catKey)) continue;
            for (const rule of category.rules) {
                if (rule.severity === 'hard_rule' || rule.severity === 'warning') {
                    lines.push(`- [${rule.id}] NẾU ${rule.if} → ${rule.then}`);
                }
            }
        }

        // Cap at 12 rules to keep prompt compact
        const capped = lines.slice(0, 12);
        if (capped.length === 0) return '';

        this.logger.log(`📏 Injecting ${capped.length}/${lines.length} constraint rules (categories: ${[...relevantCategories].join(', ')})`);
        return `\n## QUY TẮC RÀNG BUỘC (tuân thủ khi tư vấn):\n${capped.join('\n')}\n`;
    }

    /**
     * Get relevant constraint rules for a specific product/context
     * Used for targeted rule injection when product is detected
     */
    getRelevantConstraints(productKey: string, customerText: string): { id: string; rule: string; severity: string }[] {
        const kb = this.getKnowledgeData();
        const constraints = kb.constraintRules;
        if (!constraints) return [];

        const results: { id: string; rule: string; severity: string }[] = [];
        const text = (productKey + ' ' + customerText).toLowerCase();

        // keyword mapping for context-aware filtering
        const contextKeywords: Record<string, string[]> = {
            lamination: ['cán', 'lamination', 'cán mờ', 'cán bóng', 'matt', 'gloss'],
            paper_weight: ['gsm', 'giấy', 'dày', 'mỏng', 'định lượng'],
            print_sides: ['mặt', '2 mặt', '1 mặt', 'in 2', 'in 1', 'double', 'single'],
            binding: ['đóng', 'ghim', 'keo', 'lò xo', 'cuốn', 'sách', 'catalogue', 'trang'],
            finishing_foil: ['nhũ', 'uv', 'foil', 'dập nổi', 'emboss', 'spot'],
            die_cutting: ['bế', 'die-cut', 'kiss-cut', 'bo góc', 'cắt'],
            material_compatibility: ['kraft', 'offset', 'pvc', 'decal', 'ngoài trời', 'chống nước'],
            quantity_pricing: ['số lượng', 'bao nhiêu', 'giá', 'ít', 'nhiều', 'gấp'],
            color_design: ['rgb', 'cmyk', 'file', 'thiết kế', 'màu', 'ảnh', 'font'],
        };

        for (const [catKey, category] of Object.entries<any>(constraints)) {
            if (!category.rules) continue;

            // Check if this category is relevant to the context
            const catKeywords = contextKeywords[catKey] || [];
            const isRelevant = catKeywords.some(kw => text.includes(kw));

            if (isRelevant) {
                for (const rule of category.rules) {
                    results.push({
                        id: rule.id,
                        rule: `NẾU ${rule.if} → ${rule.then}`,
                        severity: rule.severity,
                    });
                }
            }
        }

        return results;
    }
}
