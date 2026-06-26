/**
 * Size Extractor
 * Extracts size/dimensions from Vietnamese natural language text.
 * Handles: A0-A6, custom WxH (cm/mm/m/ly)
 * Ported from Kprint: includes/ai_quote/extractors/SizeExtractor.php
 */

import { QuoteSize } from '../quote.interfaces';

// Standard sizes in mm
const standardSizes: Record<string, { width: number; height: number }> = {
    a0: { width: 841, height: 1189 },
    a1: { width: 594, height: 841 },
    a2: { width: 420, height: 594 },
    a3: { width: 297, height: 420 },
    a4: { width: 210, height: 297 },
    a5: { width: 148, height: 210 },
    a6: { width: 105, height: 148 },
    namecard: { width: 90, height: 55 },
};

/**
 * Extract size from text
 */
export function extractSize(text: string): QuoteSize | null {
    // Standard paper sizes (A0-A6)
    const stdMatch = text.match(/\b(a[0-6])\b/iu);
    if (stdMatch) {
        const key = stdMatch[1].toLowerCase();
        const size = standardSizes[key];
        return {
            name: stdMatch[1].toUpperCase(),
            width: size.width,
            height: size.height,
        };
    }

    // Namecard size
    if (/90\s*x\s*5[05]|name\s*card|namecard|nc/iu.test(text)) {
        return { name: '90x55', width: 90, height: 55 };
    }

    // Custom size: WxH m (meters) - e.g. 3x2m, 1.2x5m
    const meterMatch = text.match(/(\d+(?:[.,]\d+)?)\s*m?\s*[x*×]\s*(\d+(?:[.,]\d+)?)\s*m\b/iu);
    if (meterMatch) {
        const w = parseFloat(meterMatch[1].replace(',', '.'));
        const h = parseFloat(meterMatch[2].replace(',', '.'));
        return {
            name: `${w}x${h}m`,
            width: Math.round(w * 1000),
            height: Math.round(h * 1000),
        };
    }

    // Support "ly" unit (1 ly = 1mm in Vietnamese)
    const lyMatch = text.match(/(\d+)\s*ly\s*[x*×]\s*(\d+)\s*ly/iu);
    if (lyMatch) {
        return {
            name: `${lyMatch[1]}x${lyMatch[2]}ly`,
            width: parseInt(lyMatch[1]),
            height: parseInt(lyMatch[2]),
        };
    }

    // Custom size: WxH cm or WxH mm
    const customMatch = text.match(/(\d+)\s*[x*×]\s*(\d+)\s*(cm|mm|ly)?/iu);
    if (customMatch) {
        let w = parseInt(customMatch[1]);
        let h = parseInt(customMatch[2]);
        const unit = (customMatch[3] || 'cm').toLowerCase();

        // Convert to mm
        if (unit === 'cm') {
            w *= 10;
            h *= 10;
        }
        // mm and ly stay as-is

        return {
            name: `${customMatch[1]}x${customMatch[2]}${customMatch[3] || 'cm'}`,
            width: w,
            height: h,
        };
    }

    return null;
}

/**
 * Get standard size by name
 */
export function getStandardSize(name: string): QuoteSize | null {
    const key = name.toLowerCase();
    const size = standardSizes[key];
    if (!size) return null;
    return { name: name.toUpperCase(), width: size.width, height: size.height };
}
