/**
 * Quote Parser Service
 * Orchestrates all NLP extractors to parse Vietnamese text into structured quote data.
 * Ported from Kprint: includes/QuoteParserV2.php
 */

import { Injectable, Logger } from '@nestjs/common';
import { ParsedQuote } from './quote.interfaces';
import {
    detectProduct,
    extractQuantity,
    extractSize,
    extractMaterial,
    extractBoundMaterials,
    extractFinishing,
    extractBinding,
    extractPrintSides,
    extractLamination,
    extractCoverLamination,
} from './extractors';
import { getMissingFields, validate, generateQuestion } from './quote-validator';

@Injectable()
export class QuoteParserService {
    private readonly logger = new Logger(QuoteParserService.name);

    /**
     * Parse natural language text into structured quote data
     */
    parse(text: string): ParsedQuote {
        const cleanText = text.trim();
        const normalized = cleanText.toLowerCase();

        // Check for greeting
        if (this.isGreeting(normalized)) {
            return {
                success: true,
                rawText: cleanText,
                status: 'greeting',
                message: 'Xin chào! Tôi có thể giúp bạn báo giá in ấn. Bạn cần in gì?',
                missingFields: [],
                isComplete: false,
                warnings: [],
            };
        }

        // Initialize result
        const result: Partial<ParsedQuote> = {
            success: true,
            rawText: cleanText,
            status: 'quote_request',
        };

        // Detect product type
        const productInfo = detectProduct(normalized);
        if (productInfo) {
            result.product = productInfo.product;
            result.type = productInfo.type;
        }

        const type = result.type || 'loose';

        // Extract common fields
        result.quantity = extractQuantity(normalized) ?? undefined;
        result.size = extractSize(normalized) ?? undefined;
        result.printSides = extractPrintSides(normalized) ?? undefined;

        // Type-specific extraction
        if (type === 'bound') {
            result.bindingType = extractBinding(normalized) ?? undefined;
            result.pageCount = this.extractPageCount(normalized) ?? undefined;
            result.includesCover = this.checkIncludesCover(normalized);

            // Cover and inner materials
            const materials = extractBoundMaterials(normalized);
            result.coverMaterial = materials.cover ?? undefined;
            result.innerMaterial = materials.inner ?? undefined;

            // Cover lamination
            result.coverLamination = extractCoverLamination(normalized) ?? undefined;
        } else {
            // Loose or large format
            result.material = extractMaterial(normalized) ?? undefined;
            result.lamination = extractLamination(normalized) ?? undefined;
        }

        // Finishing options (all types)
        result.finishing = extractFinishing(normalized);

        // Shape (round vs rectangle)
        result.shape = this.extractShape(normalized);

        // Large format accessories
        if (type === 'large_format') {
            result.accessories = this.extractAccessories(normalized) ?? undefined;
        }

        // Validation
        result.missingFields = getMissingFields(result);
        result.isComplete = result.missingFields.length === 0;
        result.warnings = validate(result);

        // Generate follow-up question if incomplete
        if (!result.isComplete) {
            result.question = generateQuestion(result.missingFields, type);
        }

        this.logger.debug(`Parsed quote: product=${result.product}, type=${type}, ` +
            `quantity=${result.quantity}, complete=${result.isComplete}, ` +
            `missing=[${result.missingFields?.join(', ')}]`);

        return result as ParsedQuote;
    }

    /**
     * Parse text with conversation context (accumulate from multiple messages)
     */
    parseWithContext(newText: string, previousParsed?: Partial<ParsedQuote>): ParsedQuote {
        const current = this.parse(newText);

        if (!previousParsed) return current;

        // Merge: new values override previous, but keep previous non-null values
        const merged: Partial<ParsedQuote> = { ...previousParsed };

        // Override with new values if present
        if (current.product) merged.product = current.product;
        if (current.type) merged.type = current.type;
        if (current.quantity) merged.quantity = current.quantity;
        if (current.size) merged.size = current.size;
        if (current.printSides) merged.printSides = current.printSides;
        if (current.material) merged.material = current.material;
        if (current.lamination) merged.lamination = current.lamination;
        if (current.bindingType) merged.bindingType = current.bindingType;
        if (current.pageCount) merged.pageCount = current.pageCount;
        if (current.coverMaterial) merged.coverMaterial = current.coverMaterial;
        if (current.innerMaterial) merged.innerMaterial = current.innerMaterial;
        if (current.coverLamination) merged.coverLamination = current.coverLamination;
        if (current.finishing && current.finishing.length > 0) {
            merged.finishing = current.finishing;
        }
        if (current.accessories) merged.accessories = current.accessories;

        // Re-validate with merged data
        merged.missingFields = getMissingFields(merged);
        merged.isComplete = merged.missingFields!.length === 0;
        merged.warnings = validate(merged);
        merged.rawText = newText;

        if (!merged.isComplete) {
            merged.question = generateQuestion(merged.missingFields!, merged.type || 'loose');
        }

        return merged as ParsedQuote;
    }

    private isGreeting(text: string): boolean {
        return /^(xin\s*chào|hello|hi|hey|chào|alo)\s*[!.]?\s*$/iu.test(text);
    }

    private extractPageCount(text: string): number | null {
        const match = text.match(/(\d+)\s*(?:trang|pages?|tr\b)/iu);
        return match ? parseInt(match[1]) : null;
    }

    private checkIncludesCover(text: string): boolean | null {
        if (/(?:bao\s*gồm|kể|tính)\s*(?:cả\s*)?bìa/iu.test(text)) return true;
        if (/(?:không|chưa)\s*(?:bao\s*gồm|kể|tính)\s*bìa/iu.test(text)) return false;
        return null;
    }

    private extractShape(text: string): 'round' | 'rectangle' {
        if (/tròn|round|circle/iu.test(text)) return 'round';
        return 'rectangle';
    }

    private extractAccessories(text: string): string[] | null {
        const accessories: string[] = [];
        if (/(?:có|kèm)\s*chân|chân\s*(?:standee|x-banner)/iu.test(text)) {
            accessories.push('base');
        }
        if (/ống\s*luồn|luồn\s*ống|pole\s*pocket/iu.test(text)) {
            accessories.push('pole_pocket');
        }
        if (/khoen|eyelet|grommet/iu.test(text)) {
            accessories.push('eyelets');
        }
        return accessories.length > 0 ? accessories : null;
    }
}
