/**
 * Quote Validator
 * Business logic validation + missing field detection + question generation
 * Ported from Kprint: includes/ai_quote/core/QuoteValidator.php
 */

import { ParsedQuote } from './quote.interfaces';

/**
 * Get missing required fields based on product type
 */
export function getMissingFields(result: Partial<ParsedQuote>): string[] {
    const missing: string[] = [];
    const type = result.type;

    // Product type is always required
    if (!result.product && !result.type) {
        missing.push('product');
    }

    // Common required fields
    if (!result.quantity) missing.push('quantity');
    if (!result.size) missing.push('size');

    // Type-specific requirements
    if (type === 'loose' || type === 'large_format') {
        if (!result.material) missing.push('material');
    }

    if (type === 'bound') {
        if (!result.bindingType) missing.push('bindingType');
        if (!result.pageCount) missing.push('pageCount');
        if (!result.coverMaterial) missing.push('coverMaterial');
        if (!result.innerMaterial) missing.push('innerMaterial');
    }

    return missing;
}

/**
 * Validate parsed quote data against business rules
 */
export function validate(data: Partial<ParsedQuote>): string[] {
    const warnings: string[] = [];
    const type = data.type;
    const product = data.product;

    // Validate binding type for bound products
    if (type === 'bound') {
        const bindingCode = data.bindingType?.code;
        const pageCount = data.pageCount;

        if (bindingCode === 'keo_gay' && pageCount && pageCount < 20) {
            warnings.push('Đóng keo gáp thường dùng cho sản phẩm từ 20 trang trở lên');
        }

        if (bindingCode === 'ghim_long' && pageCount && pageCount > 100) {
            warnings.push('Ghim lồng thường dùng cho sản phẩm dưới 100 trang. Xem xét dùng keo gáp');
        }

        // Page count divisible by 4
        if (pageCount && pageCount % 4 !== 0) {
            const nearest = Math.ceil(pageCount / 4) * 4;
            warnings.push(`Số trang nên chia hết cho 4 (gần nhất: ${nearest} trang)`);
        }

        // Cover GSM should be >= inner GSM
        const coverGsm = data.coverMaterial?.gsm;
        const innerGsm = data.innerMaterial?.gsm;
        if (coverGsm && innerGsm && coverGsm < innerGsm) {
            warnings.push('Bìa thường dày hơn giấy ruột');
        }
    }

    // Validate size for product type
    if (data.size && product === 'namecard') {
        if (data.size.width > 100 || data.size.height > 100) {
            warnings.push('Kích thước namecard thường là 9x5.4cm hoặc 9x5cm');
        }
    }

    // Validate quantity ranges
    if (data.quantity) {
        if (product === 'namecard' && data.quantity < 100) {
            warnings.push('Số lượng namecard thường từ 100 cái trở lên');
        }
        if (type === 'bound' && data.quantity < 10) {
            warnings.push('Số lượng sản phẩm đóng cuốn thường từ 10 quyển trở lên');
        }
    }

    return warnings;
}

/**
 * Generate follow-up question for missing fields (Vietnamese)
 */
export function generateQuestion(missingFields: string[], type: string = 'loose'): string {
    if (missingFields.length === 0) return '';

    const questionMap: Record<string, string> = {
        product: 'Bạn cần in sản phẩm gì? (VD: tờ rơi, catalog, namecard, banner)',
        quantity: 'Bạn cần in bao nhiêu?',
        size: 'Kích thước bao nhiêu? (VD: A4, 20x30cm)',
        material: 'Dùng giấy gì? (VD: couche 150gsm, art 250gsm)',
        bindingType: 'Đóng kiểu gì? (VD: keo gáp, ghim lồng, lò xo)',
        pageCount: 'Bao nhiêu trang?',
        coverMaterial: 'Giấy bìa dùng loại gì? (VD: couche 300gsm)',
        innerMaterial: 'Giấy ruột dùng loại gì? (VD: couche 150gsm)',
    };

    const questions = missingFields
        .map((field) => questionMap[field])
        .filter(Boolean);

    if (questions.length === 0) return '';
    if (questions.length === 1) return questions[0];
    if (questions.length === 2) return `${questions[0]} Và ${lcFirst(questions[1])}`;

    const last = questions.pop()!;
    return `${questions.join(', ')}, và ${lcFirst(last)}`;
}

function lcFirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
}
