/**
 * Binding Extractor
 * Extracts binding type from Vietnamese text.
 * Ported from Kprint: includes/ai_quote/extractors/BindingExtractor.php
 */

import { BindingInfo } from '../quote.interfaces';

const bindingTypes: Array<{ pattern: RegExp; code: string; name: string; pricingCode: string }> = [
    { pattern: /keo\s*gáy|keo\s*gay|keo\s*nhiệt|keo\s*nhiet|keo\s*nóng|keo\s*nong|keo\s*gáp|keo\s*gap|perfect\s*bind/iu, code: 'keo_gay', name: 'Keo gáy', pricingCode: 'perfect_bind' },
    { pattern: /lò\s*xo|lo\s*xo|coil|spiral/iu, code: 'lo_xo', name: 'Lò xo', pricingCode: 'spiral' },
    { pattern: /ghim\s*lồng|ghim\s*long|ghim\s*giữa|ghim\s*giua|yên\s*ngựa|yen\s*ngua|bấm\s*ghim|bam\s*ghim|saddle\s*stitch/iu, code: 'ghim_long', name: 'Ghim lồng', pricingCode: 'saddle_stitch' },
    { pattern: /đóng\s*ghim|dong\s*ghim/iu, code: 'ghim_long', name: 'Ghim lồng', pricingCode: 'saddle_stitch' },
    { pattern: /khâu\s*chỉ|khau\s*chi|sewn/iu, code: 'khau_chi', name: 'Khâu chỉ', pricingCode: 'perfect_bind' },
    { pattern: /vòng\s*bấm|vong\s*bam|ring\s*bind|wire/iu, code: 'vong_bam', name: 'Vòng bấm', pricingCode: 'wire_o' },
    { pattern: /bìa\s*cứng|bia\s*cung|hardcover/iu, code: 'bia_cung', name: 'Bìa cứng', pricingCode: 'hardcover' },
];

/**
 * Extract binding type from text
 */
export function extractBinding(text: string): BindingInfo | null {
    for (const { pattern, code, name, pricingCode } of bindingTypes) {
        if (pattern.test(text)) {
            return { name, code, pricingCode };
        }
    }
    return null;
}

/**
 * Get binding type display name
 */
export function getBindingTypeName(code: string): string {
    const map: Record<string, string> = {
        keo_gay: 'Keo gáy',
        keo_nong: 'Keo nhiệt (Keo gáy)',
        lo_xo: 'Lò xo',
        ghim_long: 'Ghim lồng',
        yen_ngua: 'Ghim giữa (Yên ngựa)',
        khau_chi: 'Khâu chỉ',
        vong_bam: 'Vòng bấm',
        bia_cung: 'Bìa cứng',
        // Also support Pricing codes for display
        saddle_stitch: 'Ghim lồng',
        perfect_bind: 'Keo gáy',
        wire_o: 'Vòng bấm',
        spiral: 'Lò xo',
        hardcover: 'Bìa cứng',
    };
    return map[code] || code;
}

/**
 * Convert chatbot binding code to Pricing binding_types.code
 * Pricing codes: saddle_stitch, perfect_bind, wire_o, hardcover, spiral
 */
export function getPricingBindingCode(code: string): string {
    const map: Record<string, string> = {
        ghim_long: 'saddle_stitch',
        ghim_giua: 'saddle_stitch',
        yen_ngua: 'saddle_stitch',
        keo_gay: 'perfect_bind',
        keo_nong: 'perfect_bind',
        keo_nhiet: 'perfect_bind',
        lo_xo: 'spiral',
        vong_bam: 'wire_o',
        khau_chi: 'perfect_bind',
        sewn: 'perfect_bind',
        bia_cung: 'hardcover',
        case_bound: 'hardcover',
    };
    // If code is already a Pricing code, return as-is
    if (['saddle_stitch', 'perfect_bind', 'wire_o', 'hardcover', 'spiral'].includes(code)) {
        return code;
    }
    return map[code] || 'saddle_stitch';
}

/**
 * Check if binding type is saddle stitch (ghim lồng)
 * Supports both chatbot code and Pricing code
 */
export function isSaddleStitch(code: string): boolean {
    return code === 'ghim_long' || code === 'yen_ngua' || code === 'ghim_giua' || code === 'saddle_stitch';
}
