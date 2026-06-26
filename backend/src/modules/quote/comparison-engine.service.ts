/**
 * Comparison Engine Service
 * Ported from Pricing: includes/ai_quote/ComparisonEngine.php
 *
 * Handles multi-field comparison pricing — e.g., "1 mặt vs 2 mặt giá sao?"
 * Detects comparison fields via regex → generates variants → calculates pricing for each → formats result.
 *
 * Supports: printSides, lamination, finishing, quantity, material
 */

import { Injectable, Logger } from '@nestjs/common';
import { QuoteService } from './quote.service';
import { ParsedQuote } from './quote.interfaces';

// ─── Types ───

interface FieldDefinition {
    patterns: RegExp[];
    valuePatterns?: Record<string, RegExp[]>;
    extractNumbers?: boolean;
    defaultVariants?: (string | number)[];
    label: string;
    formatValue: string | Record<string, string>;
}

interface DetectedField {
    field: string;
    variants: (string | number)[];
    label: string;
}

interface ComparisonVariant {
    key: string;
    parsed: Record<string, any>;
    labels: Record<string, string>;
    fieldValues: Record<string, string | number>;
}

export interface ComparisonResult {
    isComparison: boolean;
    fields: string[];
    variantCount: number;
    results: VariantResult[];
    message: string;
    cheapest: VariantResult | null;
    mostExpensive: VariantResult | null;
}

interface VariantResult {
    key: string;
    labels: Record<string, string>;
    fieldValues: Record<string, string | number>;
    pricing: any;
    total: number;
    unitPrice: number;
}

// ─── Field Definitions ───

const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
    printSides: {
        patterns: [
            /(?:in\s*)?(\d)\s*m[aặ]t.*(?:và|vs|hay|hoặc).*(\d)\s*m[aặ]t/iu,
            /(\d)\s*m[aặ]t\s*(?:và|vs|hay|hoặc)\s*(\d)\s*m[aặ]t/iu,
            /(?:in\s*)?(\d)m\s*(?:và|vs|hay|hoặc)\s*(\d)m/iu,
        ],
        valuePatterns: {
            '1': [/1\s*m[aặ]t/iu, /\b1m\b/iu, /một\s*m[aặ]t/iu],
            '2': [/2\s*m[aặ]t/iu, /\b2m\b/iu, /hai\s*m[aặ]t/iu],
        },
        defaultVariants: [1, 2],
        label: 'Số mặt in',
        formatValue: '%d mặt',
    },

    lamination: {
        patterns: [
            /c[aá]n\s*m[oờ].*(?:và|vs|hay|hoặc).*(?:c[aá]n\s*b[oó]ng|kh[oô]ng\s*c[aá]n|ko\s*c[aá]n)/iu,
            /c[aá]n\s*b[oó]ng.*(?:và|vs|hay|hoặc).*(?:c[aá]n\s*m[oờ]|kh[oô]ng\s*c[aá]n|ko\s*c[aá]n)/iu,
            /(?:có\s*c[aá]n|c[aá]n\s*(?:m[oờ]|b[oó]ng)).*(?:và|vs|hay|hoặc).*(?:kh[oô]ng|ko)\s*c[aá]n/iu,
            /(?:kh[oô]ng|ko)\s*c[aá]n.*(?:và|vs|hay|hoặc).*(?:c[aá]n\s*(?:m[oờ]|b[oó]ng))/iu,
        ],
        valuePatterns: {
            mo: [/c[aá]n\s*m[oờ]/iu, /matte/iu],
            bong: [/c[aá]n\s*b[oó]ng/iu, /glossy/iu],
            none: [/(?:kh[oô]ng|ko)\s*c[aá]n/iu, /k\s*c[aá]n/iu],
        },
        defaultVariants: ['mo', 'none'],
        label: 'Cán màng',
        formatValue: { mo: 'Cán mờ', bong: 'Cán bóng', none: 'Không cán' },
    },

    finishing: {
        patterns: [
            /(?:có\s*)?b[eế].*(?:và|vs|hay|hoặc).*(?:kh[oô]ng|ko)\s*b[eế]/iu,
            /(?:kh[oô]ng|ko)\s*b[eế].*(?:và|vs|hay|hoặc).*(?:có\s*)?b[eế]/iu,
            /(?:có\s*)?(x[eé]n|[eé]p\s*kim|uv).*(?:và|vs|hay|hoặc).*(?:kh[oô]ng|ko)/iu,
        ],
        valuePatterns: {
            be: [/b[eế](?:\s|$)/iu, /die\s*cut/iu],
            xen: [/x[eé]n/iu, /trim/iu],
            ep_kim: [/[eé]p\s*kim/iu, /foil/iu],
            uv: [/\buv\b/iu],
            none: [/(?:kh[oô]ng|ko)\s*(?:b[eế]|x[eé]n|[eé]p|uv)/iu],
        },
        defaultVariants: ['be', 'none'],
        label: 'Gia công',
        formatValue: {
            be: 'Có bế', xen: 'Có xén', ep_kim: 'Ép kim', uv: 'UV', none: 'Không gia công',
        },
    },

    quantity: {
        patterns: [
            /(\d+)\s*(?:cái|tờ|cuốn|bản|sp)?\s*(?:và|vs|hay|hoặc)\s*(\d+)\s*(?:cái|tờ|cuốn|bản|sp)?/iu,
        ],
        extractNumbers: true,
        label: 'Số lượng',
        formatValue: '%d sp',
    },

    material: {
        patterns: [
            /(couche|c)\s*(\d+)\s*(?:và|vs|hay|hoặc)\s*(couche|c)\s*(\d+)/iu,
            /(ivory|i)\s*(\d+)\s*(?:và|vs|hay|hoặc)\s*(ivory|i)\s*(\d+)/iu,
        ],
        label: 'Chất liệu',
        formatValue: '%s',
    },
};

@Injectable()
export class ComparisonEngineService {
    private readonly logger = new Logger(ComparisonEngineService.name);

    constructor(private readonly quoteService: QuoteService) { }

    /**
     * Full comparison flow: detect → generate → calculate → format
     * Returns null if message is not a comparison request.
     */
    async processComparison(
        text: string,
        parsed: Record<string, any>,
    ): Promise<ComparisonResult | null> {
        // 1. Detect comparison fields
        const detection = this.detectComparisonFields(text);
        if (!detection.isComparison) return null;

        // 2. Generate variants
        const variants = this.generateVariants(parsed, detection.fields);
        if (variants.length < 2) return null;

        // 3. Calculate pricing for all variants via Pricing API
        const results = await this.calculateAllVariants(variants, parsed);

        // 4. Format output
        const message = this.formatForChat(results, parsed, detection.fields);

        return {
            isComparison: true,
            fields: Object.keys(detection.fields),
            variantCount: results.length,
            results,
            message,
            cheapest: results[0] ?? null,
            mostExpensive: results[results.length - 1] ?? null,
        };
    }

    /**
     * Detect all comparison fields in user message
     */
    detectComparisonFields(text: string): { isComparison: boolean; fields: Record<string, DetectedField> } {
        const textLower = text.toLowerCase();
        const detectedFields: Record<string, DetectedField> = {};

        for (const [fieldName, def] of Object.entries(FIELD_DEFINITIONS)) {
            for (const pattern of def.patterns) {
                const matches = textLower.match(pattern);
                if (!matches) continue;

                const variants = this.extractVariants(fieldName, textLower, matches, def);
                if (variants.length > 0) {
                    detectedFields[fieldName] = { field: fieldName, variants, label: def.label };
                    break;
                }
            }
        }

        if (Object.keys(detectedFields).length > 0) {
            this.logger.log(`📊 Comparison fields detected: ${Object.keys(detectedFields).join(', ')}`);
        }

        return { isComparison: Object.keys(detectedFields).length > 0, fields: detectedFields };
    }

    /**
     * Extract variant values for a field
     */
    private extractVariants(
        fieldName: string, text: string, matches: RegExpMatchArray, def: FieldDefinition,
    ): (string | number)[] {
        // Special handling for quantity/material (extract numbers from regex groups)
        if (def.extractNumbers && matches[1] && matches[2]) {
            const n1 = parseInt(matches[1].replace(/\D/g, ''), 10);
            const n2 = parseInt(matches[2].replace(/\D/g, ''), 10);
            if (n1 > 0 && n2 > 0 && n1 !== n2) return [n1, n2];
        }

        // Check value patterns
        if (def.valuePatterns) {
            const variants: (string | number)[] = [];
            for (const [value, patterns] of Object.entries(def.valuePatterns)) {
                for (const p of patterns) {
                    if (p.test(text)) { variants.push(value); break; }
                }
            }
            if (variants.length > 0) return [...new Set(variants)];
        }

        // Fallback to default variants
        return def.defaultVariants ? [...def.defaultVariants] : [];
    }

    /**
     * Generate all variant combinations (cartesian product across detected fields)
     */
    private generateVariants(
        parsed: Record<string, any>, detectedFields: Record<string, DetectedField>,
    ): ComparisonVariant[] {
        let variants: ComparisonVariant[] = [
            { key: 'base', parsed: { ...parsed }, labels: {}, fieldValues: {} },
        ];

        for (const [fieldName, fieldInfo] of Object.entries(detectedFields)) {
            const fieldDef = FIELD_DEFINITIONS[fieldName];
            const newVariants: ComparisonVariant[] = [];

            for (const existing of variants) {
                for (const value of fieldInfo.variants) {
                    const newParsed = this.applyVariantValue({ ...existing.parsed }, fieldName, value);
                    const valueLabel = this.formatValueLabel(value, fieldDef);
                    const newLabels = { ...existing.labels, [fieldName]: valueLabel };

                    newVariants.push({
                        key: Object.values(newLabels).join('_'),
                        parsed: newParsed,
                        labels: newLabels,
                        fieldValues: { ...existing.fieldValues, [fieldName]: value },
                    });
                }
            }
            variants = newVariants;
        }
        return variants;
    }

    /**
     * Apply a variant value to parsed data
     */
    private applyVariantValue(parsed: Record<string, any>, fieldName: string, value: string | number): Record<string, any> {
        switch (fieldName) {
            case 'printSides':
                parsed.printSides = Number(value);
                break;
            case 'lamination':
                if (value === 'none') {
                    parsed.lamination = null;
                    parsed.finishing = (parsed.finishing || []).filter((f: string) => !['can_mo', 'can_bong'].includes(f));
                } else {
                    parsed.lamination = { type: value, sides: parsed.printSides ?? 2 };
                    parsed.finishing = [...new Set([...(parsed.finishing || []), `can_${value}`])];
                }
                break;
            case 'finishing':
                if (value === 'none') {
                    parsed.finishing = (parsed.finishing || []).filter((f: string) => !['be', 'xen', 'ep_kim', 'uv'].includes(f));
                } else {
                    parsed.finishing = [...new Set([...(parsed.finishing || []), value])];
                }
                break;
            case 'quantity':
                parsed.quantity = Number(value);
                break;
            default:
                parsed[fieldName] = value;
        }
        return parsed;
    }

    /**
     * Format value for display label
     */
    private formatValueLabel(value: string | number, def: FieldDefinition): string {
        if (typeof def.formatValue === 'object') {
            return def.formatValue[String(value)] ?? String(value);
        }
        return def.formatValue.replace('%d', String(value)).replace('%s', String(value));
    }

    /**
     * Calculate pricing for all variants via Pricing API
     */
    private async calculateAllVariants(
        variants: ComparisonVariant[], baseParsed: Record<string, any>,
    ): Promise<VariantResult[]> {
        const results: VariantResult[] = [];

        for (const variant of variants) {
            try {
                const pricing = await this.quoteService.calculateFromParsed(variant.parsed as ParsedQuote);
                results.push({
                    key: variant.key,
                    labels: variant.labels,
                    fieldValues: variant.fieldValues,
                    pricing,
                    total: pricing?.total ?? 0,
                    unitPrice: pricing?.unitPrice ?? 0,
                });
            } catch (e) {
                this.logger.warn(`⚠️ Failed to calculate variant ${variant.key}: ${(e as Error).message}`);
            }
        }

        // Sort by total price ascending
        results.sort((a, b) => a.total - b.total);
        return results;
    }

    /**
     * Format comparison results as markdown for chat display
     */
    private formatForChat(
        results: VariantResult[], parsed: Record<string, any>, detectedFields: Record<string, DetectedField>,
    ): string {
        const product = parsed.product ?? 'sản phẩm';
        const baseQty = parsed.quantity ?? 1;

        const fieldLabels = Object.values(detectedFields).map(f => f.label);
        const headerText = fieldLabels.join(' & ');

        let output = `📊 **So sánh giá ${headerText}** cho ${product}:\n\n`;
        output += '| Option | Số lượng | Thành tiền | Đơn giá |\n';
        output += '|--------|----------|------------|----------|\n';

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const optionLabel = Object.values(r.labels).join(' + ');
            const qty = r.fieldValues.quantity ?? baseQty;
            const total = r.total.toLocaleString('vi-VN');
            const unit = r.unitPrice.toLocaleString('vi-VN');
            const icon = i === 0 ? '💰' : (i === results.length - 1 ? '💎' : '📦');

            output += `| ${icon} ${optionLabel} | ${qty} | **${total}đ** | ${unit}đ/sp |\n`;
        }

        if (results.length >= 2) {
            const cheapest = results[0];
            const expensive = results[results.length - 1];
            const diff = (expensive.total - cheapest.total).toLocaleString('vi-VN');
            output += `\n💡 **Gợi ý**: Chọn **${Object.values(cheapest.labels).join(' + ')}** tiết kiệm ${diff}đ`;
        }

        output += '\n\n👉 Bạn muốn chọn option nào?';
        return output;
    }
}
