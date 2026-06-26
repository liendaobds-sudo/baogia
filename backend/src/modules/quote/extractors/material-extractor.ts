/**
 * Material Extractor
 * Extracts material information from Vietnamese natural language text.
 * Handles: shortcodes (c150, i300), full names, decal materials
 * Ported from Kprint: includes/ai_quote/extractors/MaterialExtractor.php
 * Note: DB lookup removed for MVP — uses static patterns only
 */

import { MaterialInfo } from '../quote.interfaces';

// Material shortcode → full name
const materialShortcuts: Record<string, string> = {
    c: 'couche',
    i: 'ivory',
    k: 'kraft',
    d: 'duplex',
    a: 'art',
};

/**
 * Extract single material from text (for loose/large format products)
 */
export function extractMaterial(text: string): MaterialInfo | null {
    // 1. Shortcode patterns (c150, i300, a250)
    const shortMatch = text.match(/\b([a-z])(\d{2,3})\b/iu);
    if (shortMatch) {
        const shortcode = shortMatch[1].toLowerCase();
        const gsm = parseInt(shortMatch[2]);
        const fullName = materialShortcuts[shortcode];
        if (fullName) {
            return {
                name: `${capitalize(fullName)} ${gsm}gsm`,
                type: fullName,
                gsm,
            };
        }
    }

    // 2. Full material name with gsm (couche 150gsm, art 250)
    const fullMatch = text.match(/(couche|ivory|kraft|duplex|art)\s*(\d{2,3})\s*(gsm)?/iu);
    if (fullMatch) {
        const type = fullMatch[1].toLowerCase();
        const gsm = parseInt(fullMatch[2]);
        return {
            name: `${capitalize(type)} ${gsm}gsm`,
            type,
            gsm,
        };
    }

    // 3. Material type without gsm
    const typeOnlyMatch = text.match(/\b(couche|ivory|kraft|duplex|art)\b/iu);
    if (typeOnlyMatch) {
        const type = typeOnlyMatch[1].toLowerCase();
        return {
            name: capitalize(type),
            type,
        };
    }

    // 4. Decal materials
    const decalPatterns = [
        /decal\s+(nhựa|nhua|giấy|giay|pp|trong|đế\s*vàng|de\s*vang|kraft|bạc|bac|vàng|vang)/iu,
        /tem\s+(nhựa|nhua|giấy|giay|pp|trong)/iu,
        /nhãn\s+(decal|giấy|giay)/iu,
    ];
    for (const pattern of decalPatterns) {
        const match = text.match(pattern);
        if (match) {
            const materialType = match[1].toLowerCase().trim();
            return {
                name: `Decal ${capitalize(materialType)}`,
                type: 'decal',
            };
        }
    }

    return null;
}

/**
 * Extract cover and inner materials for bound products
 */
export function extractBoundMaterials(text: string): {
    cover: MaterialInfo | null;
    inner: MaterialInfo | null;
} {
    let cover: MaterialInfo | null = null;
    let inner: MaterialInfo | null = null;

    // Cover material: "bìa couche 300gsm" or "bìa c300"
    const coverMatch = text.match(
        /bìa\s+(?:(?:([a-z])(\d{2,3}))|(?:(couche|ivory|kraft|duplex|art)\s*(\d{2,3})\s*(gsm)?))/iu,
    );
    if (coverMatch) {
        if (coverMatch[1] && coverMatch[2]) {
            const fullName = materialShortcuts[coverMatch[1].toLowerCase()];
            if (fullName) {
                cover = {
                    name: `${capitalize(fullName)} ${coverMatch[2]}gsm`,
                    type: fullName,
                    gsm: parseInt(coverMatch[2]),
                };
            }
        } else if (coverMatch[3] && coverMatch[4]) {
            const type = coverMatch[3].toLowerCase();
            cover = {
                name: `${capitalize(type)} ${coverMatch[4]}gsm`,
                type,
                gsm: parseInt(coverMatch[4]),
            };
        }
    }

    // Inner material: "ruột couche 150gsm" or "ruột c150"
    const innerMatch = text.match(
        /ruột\s+(?:(?:([a-z])(\d{2,3}))|(?:(couche|ivory|kraft|duplex|art)\s*(\d{2,3})\s*(gsm)?))/iu,
    );
    if (innerMatch) {
        if (innerMatch[1] && innerMatch[2]) {
            const fullName = materialShortcuts[innerMatch[1].toLowerCase()];
            if (fullName) {
                inner = {
                    name: `${capitalize(fullName)} ${innerMatch[2]}gsm`,
                    type: fullName,
                    gsm: parseInt(innerMatch[2]),
                };
            }
        } else if (innerMatch[3] && innerMatch[4]) {
            const type = innerMatch[3].toLowerCase();
            inner = {
                name: `${capitalize(type)} ${innerMatch[4]}gsm`,
                type,
                gsm: parseInt(innerMatch[4]),
            };
        }
    }

    // If no explicit bìa/ruột markers, try to detect two materials
    if (!cover && !inner) {
        const allMaterials = [
            ...text.matchAll(/(couche|ivory|kraft|duplex|art)\s*(\d{2,3})\s*(gsm)?/giu),
        ];
        if (allMaterials.length >= 2) {
            // Higher GSM = cover, lower = inner
            const materials = allMaterials.map((m) => ({
                type: m[1].toLowerCase(),
                gsm: parseInt(m[2]),
            }));
            materials.sort((a, b) => b.gsm - a.gsm);

            cover = {
                name: `${capitalize(materials[0].type)} ${materials[0].gsm}gsm`,
                type: materials[0].type,
                gsm: materials[0].gsm,
            };
            inner = {
                name: `${capitalize(materials[1].type)} ${materials[1].gsm}gsm`,
                type: materials[1].type,
                gsm: materials[1].gsm,
            };
        } else if (allMaterials.length === 1) {
            // Single material mentioned — assume it's the main one
            const m = allMaterials[0];
            const mat: MaterialInfo = {
                name: `${capitalize(m[1])} ${m[2]}gsm`,
                type: m[1].toLowerCase(),
                gsm: parseInt(m[2]),
            };
            // If GSM >= 200 likely cover
            if (mat.gsm && mat.gsm >= 200) {
                cover = mat;
            } else {
                inner = mat;
            }
        }
    }

    return { cover, inner };
}

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
