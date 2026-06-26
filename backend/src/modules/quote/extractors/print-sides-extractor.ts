/**
 * Print Sides Extractor
 * Extracts print sides (1 or 2) from Vietnamese text.
 * Ported from Kprint: includes/ai_quote/extractors/PrintSidesExtractor.php
 */

/**
 * Extract number of print sides from text
 * @returns 1 (single-sided), 2 (double-sided), or null
 */
export function extractPrintSides(text: string): number | null {
    // 2 sides patterns
    if (/2\s*m[aặ]t|hai\s*m[aặ]t|double\s*sid|in\s*2\s*m|cả\s*2\s*mặt/iu.test(text)) {
        return 2;
    }

    // 1 side patterns
    if (/1\s*m[aặ]t|một\s*m[aặ]t|single\s*sid|in\s*1\s*m/iu.test(text)) {
        return 1;
    }

    return null;
}
