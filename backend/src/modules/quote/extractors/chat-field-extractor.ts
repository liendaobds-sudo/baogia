/**
 * Chat Field Extractor
 * Coordinates all extractors to extract form field values from chat text.
 * Maps extracted values to Pricing template field_codes for auto-filling the Mini Quote form.
 */

import { extractQuantity } from './quantity-extractor';
import { extractSize } from './size-extractor';
import { extractMaterial } from './material-extractor';
import { extractPrintSides } from './print-sides-extractor';
import { extractLamination } from './lamination-extractor';

export interface ExtractedFields {
    [fieldCode: string]: string;
}

export interface MasterDataForMatch {
    materials: Array<{ id: number | string; name: string; type?: string; gsm?: string }>;
}

/**
 * Extract all recognizable field values from chat text.
 * Returns a map of field_code → extracted value string.
 */
export function extractFieldsFromChat(
    text: string,
    masterData?: MasterDataForMatch,
): ExtractedFields {
    const fields: ExtractedFields = {};

    // 1. Quantity
    const quantity = extractQuantity(text);
    if (quantity) {
        fields['quantity'] = String(quantity);
        fields['so_luong'] = String(quantity);
    }

    // 2. Size (WxH)
    const size = extractSize(text);
    if (size) {
        // Convert mm → cm for form display
        const wCm = size.width / 10;
        const hCm = size.height / 10;
        fields['kich_thuoc_w'] = String(wCm);
        fields['kich_thuoc_h'] = String(hCm);
        fields['size_w'] = String(wCm);
        fields['size_h'] = String(hCm);
    }

    // 3. Material — try fuzzy match against master data
    const materialInfo = extractMaterial(text);
    if (materialInfo && masterData?.materials?.length) {
        const matched = fuzzyMatchMaterial(materialInfo.name, materialInfo.type, materialInfo.gsm, masterData.materials);
        if (matched) {
            fields['material'] = String(matched.id);
            fields['vat_lieu'] = String(matched.id);
            fields['chat_lieu'] = String(matched.id);
        }
    }

    // 4. Print sides
    const printSides = extractPrintSides(text);
    if (printSides) {
        const value = printSides === 2 ? 'double' : 'single';
        fields['printSides'] = value;
        fields['so_mat_in'] = value;
        fields['print_side'] = value;
    }

    // 5. Lamination — map code to display name
    const lamination = extractLamination(text);
    if (lamination) {
        const laminationNames: Record<string, string> = {
            'can_mo': 'Cán mờ',
            'can_bong': 'Cán bóng',
        };
        const displayName = laminationNames[lamination] || lamination;
        fields['can_mang'] = displayName;
        fields['lamination'] = displayName;
    }

    // 6. Shape detection
    const shape = extractShape(text);
    if (shape) {
        fields['shape'] = shape;
        fields['hinh_dang'] = shape;
    }

    return fields;
}

/**
 * Extract shape from Vietnamese text
 */
function extractShape(text: string): string | null {
    if (/hình\s*tròn|tron|circle|round/iu.test(text)) return 'circle';
    if (/hình\s*vuông|vuong|square/iu.test(text)) return 'square';
    if (/oval|bầu\s*dục/iu.test(text)) return 'oval';
    if (/chữ\s*nhật|rectangle|hình\s*chữ\s*nhật/iu.test(text)) return 'rectangle';
    return null;
}

/**
 * Fuzzy match extracted material info against Pricing master data.
 * Tries: exact name match → type+gsm match → type-only match → substring match
 */
function fuzzyMatchMaterial(
    name: string,
    type?: string,
    gsm?: number,
    materials: Array<{ id: number | string; name: string; type?: string; gsm?: string }> = [],
): { id: number | string; name: string } | null {
    if (materials.length === 0) return null;

    const normalizedName = name.toLowerCase().trim();
    const normalizedType = (type || '').toLowerCase().trim();

    // Priority 1: Exact name match
    for (const m of materials) {
        if (m.name.toLowerCase().trim() === normalizedName) {
            return m;
        }
    }

    // Priority 2: Type + GSM match
    if (normalizedType && gsm) {
        for (const m of materials) {
            const mName = m.name.toLowerCase();
            const mType = (m.type || '').toLowerCase();
            const mGsm = parseInt(m.gsm || '0');
            if ((mName.includes(normalizedType) || mType.includes(normalizedType)) && mGsm === gsm) {
                return m;
            }
        }
    }

    // Priority 3: Type-only match (first match)
    if (normalizedType) {
        for (const m of materials) {
            const mName = m.name.toLowerCase();
            const mType = (m.type || '').toLowerCase();
            if (mName.includes(normalizedType) || mType.includes(normalizedType)) {
                return m;
            }
        }
    }

    // Priority 4: Substring match on name keywords
    const keywords = normalizedName.split(/\s+/).filter(w => w.length > 2);
    for (const m of materials) {
        const mName = m.name.toLowerCase();
        if (keywords.some(k => mName.includes(k))) {
            return m;
        }
    }

    return null;
}
