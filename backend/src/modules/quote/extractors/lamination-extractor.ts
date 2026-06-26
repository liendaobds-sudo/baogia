/**
 * Lamination Extractor
 * Extracts lamination details (type + sides) from Vietnamese text.
 * Ported from Kprint: includes/ai_quote/extractors/LaminationExtractor.php
 */

/**
 * Extract lamination type from text
 */
export function extractLamination(text: string): string | null {
    if (/cán\s*mờ|can\s*mo|\bmatt\b/iu.test(text)) return 'can_mo';
    if (/cán\s*bóng|can\s*bong|\bglossy\b/iu.test(text)) return 'can_bong';
    if (/cán\s*màng|can\s*mang|laminate/iu.test(text)) return 'can_mo'; // Default to matte
    return null;
}

/**
 * Extract cover lamination for bound products (type + sides)
 */
export function extractCoverLamination(
    text: string,
): { type: string; sides?: number } | null {
    const type = extractLamination(text);
    if (!type) return null;

    // Check for sides specification near "bìa"
    let sides: number | undefined;

    // "bìa cán mờ 2 mặt" or "cán mờ bìa 1 mặt"
    const sidesMatch = text.match(
        /(?:bìa|bia).*?cán.*?(\d)\s*m[aặ]t|cán.*?(?:bìa|bia).*?(\d)\s*m[aặ]t/iu,
    );
    if (sidesMatch) {
        sides = parseInt(sidesMatch[1] || sidesMatch[2]);
    }

    return { type, sides };
}

/**
 * Extract lamination sides count
 */
export function extractLaminationSides(text: string): number | null {
    const match = text.match(/cán.*?(\d)\s*m[aặ]t|(\d)\s*m[aặ]t.*?cán/iu);
    if (match) {
        return parseInt(match[1] || match[2]);
    }
    return null;
}
