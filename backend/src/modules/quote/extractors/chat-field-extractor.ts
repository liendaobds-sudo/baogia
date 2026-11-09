/**
 * Chat Field Extractor
 * Coordinates all extractors to extract form field values from chat text.
 * Maps extracted values to Pricing template field_codes for auto-filling the Mini Quote form.
 */

import { extractQuantity } from './quantity-extractor';
import { extractSize } from './size-extractor';
import { extractMaterial, extractBoundMaterials } from './material-extractor';
import { extractPrintSides } from './print-sides-extractor';
import { extractLamination, extractCoverLamination } from './lamination-extractor';
import { extractBinding, getPricingBindingCode } from './binding-extractor';
import { extractFinishing } from './finishing-extractor';

export interface ExtractedFields {
    [fieldCode: string]: string;
}

export interface MasterDataForMatch {
    materials: Array<{ id: number | string; name: string; type?: string; gsm?: string }>;
    processingOptions?: Array<{ id: number | string; code?: string; name: string; category?: string }>;
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
        fields['item_width'] = String(wCm);
        fields['item_height'] = String(hCm);
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

    // 3b. Bound fields: page_count, binding_type, cover_material, inner_material
    const pageMatch = text.match(/(\d+)\s*(?:trang|pages?|tr\b)/iu);
    if (pageMatch) {
        fields['page_count'] = pageMatch[1];
        fields['so_trang'] = pageMatch[1];
    }

    const binding = extractBinding(text);
    if (binding) {
        const pricingBinding = binding.pricingCode || getPricingBindingCode(binding.code);
        fields['binding_type'] = pricingBinding;
        fields['kieu_dong'] = pricingBinding;
    }

    const boundMats = extractBoundMaterials(text);
    if (masterData?.materials?.length) {
        if (boundMats.cover) {
            const matchedCover = fuzzyMatchMaterial(boundMats.cover.name, boundMats.cover.type, boundMats.cover.gsm, masterData.materials);
            if (matchedCover) {
                fields['cover_material'] = String(matchedCover.id);
                fields['chat_lieu_bia'] = String(matchedCover.id);
            }
        }
        if (boundMats.inner) {
            const matchedInner = fuzzyMatchMaterial(boundMats.inner.name, boundMats.inner.type, boundMats.inner.gsm, masterData.materials);
            if (matchedInner) {
                fields['inner_material'] = String(matchedInner.id);
                fields['chat_lieu_ruot'] = String(matchedInner.id);
            }
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

    // 5. Lamination & Finishing — map code to display name + resolve processing IDs
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

    const finishingCodes = [...extractFinishing(text)];
    if (lamination && !finishingCodes.includes(lamination)) {
        finishingCodes.push(lamination);
    }
    const coverLam = extractCoverLamination(text);
    if (coverLam?.type && !finishingCodes.includes(coverLam.type)) {
        finishingCodes.push(coverLam.type);
    }
    if (finishingCodes.length > 0) {
        fields['processing_codes'] = finishingCodes.join(',');
        if (masterData?.processingOptions?.length) {
            const matchedIds: string[] = [];
            for (const code of finishingCodes) {
                const codeLower = code.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
                const match = masterData.processingOptions.find((p) => {
                    const pCode = (p.code || '').toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
                    const pName = (p.name || '').toLowerCase();
                    return pCode === codeLower || (pCode && pCode.includes(codeLower)) ||
                        pName.includes(codeLower) || (pCode && codeLower.includes(pCode));
                });
                if (match && !matchedIds.includes(String(match.id))) {
                    matchedIds.push(String(match.id));
                }
            }
            if (matchedIds.length > 0) {
                fields['processing_ids'] = matchedIds.join(',');
            }
        }
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
 * Extract shape from Vietnamese text.
 * Uses 'round' for circular/oval shapes to match PricingService.calculateLoose contract.
 */
function extractShape(text: string): string | null {
    if (/hình\s*tròn|tem\s*tròn|bế\s*tròn|\btròn\b|circle|round|oval|bầu\s*dục/iu.test(text)) return 'round';
    if (/hình\s*vuông|vuong|square|chữ\s*nhật|rectangle|hình\s*chữ\s*nhật/iu.test(text)) return 'rectangle';
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
