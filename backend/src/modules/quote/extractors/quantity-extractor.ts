/**
 * Quantity Extractor
 * Extracts quantity from Vietnamese natural language text.
 * Handles: K suffix (1k=1000), ngàn/nghìn, unit words (cuốn, tờ, cái)
 * Ported from Kprint: includes/ai_quote/extractors/QuantityExtractor.php
 */

/**
 * Extract quantity from text
 */
export function extractQuantity(text: string): number | null {
    // Skip if this is clearly a print sides answer
    if (/^[12]\s*mặt/iu.test(text)) return null;

    // Skip if text looks ONLY like a binding/finishing answer
    const followUpPatterns = [
        /^(keo\s*gáy|lò\s*xo|ghim|bấm\s*ghim)/iu,
        /^(cán\s*mờ|cán\s*bóng|uv)/iu,
    ];
    for (const p of followUpPatterns) {
        if (p.test(text)) return null;
    }

    const patterns: Array<{ regex: RegExp; handler: (match: RegExpMatchArray) => number | null }> = [
        // K suffix (1k=1000, 2.5k=2500)
        {
            regex: /(\d+(?:[.,]\d+)?)\s*k\b/iu,
            handler: (m) => {
                const num = parseFloat(m[1].replace(',', '.'));
                return Math.round(num * 1000);
            },
        },
        // Vietnamese text numbers (1 ngàn = 1000)
        {
            regex: /(\d+)\s*(?:ngàn|ngan|nghìn|nghin)\b/iu,
            handler: (m) => {
                // Check for suffix digit: "2 ngàn 5" = 2500
                const base = parseInt(m[1]) * 1000;
                const afterIdx = (m.index || 0) + m[0].length;
                const afterText = text.substring(afterIdx);
                const suffixMatch = afterText.match(/^\s*(\d)\b/);
                if (suffixMatch) {
                    return base + parseInt(suffixMatch[1]) * 100;
                }
                return base;
            },
        },
        // Explicit units (cuốn, tờ, cái, bộ, quyển, hộp, tấm)
        {
            regex: /(\d+(?:[.,]\d+)?)\s*(?:cuốn|cuon|tờ|cái|cai|bộ|quyển|quyen|hộp|hop|tấm|tam)\b/iu,
            handler: (m) => parseInt(m[1].replace(/[.,]/g, '')),
        },
        // Command prefix (in 500, báo giá 200)
        {
            regex: /(?:in|báo\s*giá|bg)\s+(\d+)/iu,
            handler: (m) => parseInt(m[1]),
        },
        // Number + product (3 poster, 50 brochure)
        {
            regex: /^(\d+)\s+(?:poster|banner|standee|backdrop|sổ\s*tay|brochure|catalogue|catalog)/iu,
            handler: (m) => parseInt(m[1]),
        },
        // Large quantities (3+ digits)
        {
            regex: /(\d{3,})/u,
            handler: (m) => {
                const val = parseInt(m[1]);
                // Validate: not a GSM or dimension
                const idx = text.indexOf(m[1]);
                const after = text.substring(idx + m[1].length);
                if (/^\s*gsm/iu.test(after)) return null;
                if (/^\s*x/iu.test(after)) return null;
                if (/^\s*(?:trang|tr|pages?)\b/iu.test(after)) return null;
                return val;
            },
        },
        // Beginning of string bare number (not followed by "mặt")
        {
            regex: /^(\d{1,5})(?:\s+(?!mặt|mat))(?:\s+|$)/u,
            handler: (m) => {
                const val = parseInt(m[1]);
                const idx = text.indexOf(m[1]);
                const after = text.substring(idx + m[1].length);
                if (/^\s*gsm/iu.test(after)) return null;
                if (/^\s*x/iu.test(after)) return null;
                if (/^\s*(?:trang|tr|pages?)\b/iu.test(after)) return null;
                return val > 0 ? val : null;
            },
        },
    ];

    for (const { regex, handler } of patterns) {
        const match = text.match(regex);
        if (match) {
            const result = handler(match);
            if (result && result > 0) return result;
        }
    }

    return null;
}
