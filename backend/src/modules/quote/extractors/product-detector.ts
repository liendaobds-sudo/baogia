/**
 * Product Detector
 * Detects product type and name from Vietnamese natural language text.
 * Supports both static regex patterns AND dynamic Pricing product templates.
 */

import { ProductType } from '../quote.interfaces';
import { removeAccents, toMatchText } from '../../../common/text/vietnamese';

/**
 * Ngưỡng tin cậy tối thiểu để COI LÀ đã phát hiện sản phẩm.
 *
 * Audit 2026-08-29: `confidence` được tính rồi không ai chặn ⇒ một keyword 3 ký tự trùng ngẫu
 * nhiên (score 3/20 = 0.15) vẫn "khoá" hội thoại vào một sản phẩm sai, kéo theo sai bộ trường
 * cần hỏi và sai nhóm quy tắc ràng buộc được inject. 0.35 ≈ tổng độ dài keyword khớp ~7 ký tự,
 * tức phải khớp một từ có nghĩa ("namecard", "tờ rơi", "hộp giấy") mới được tính.
 */
export const MIN_PRODUCT_CONFIDENCE = 0.35;

export interface ProductMatch {
    type: ProductType;
    product: string;
    templateId?: number;     // Pricing template ID (if matched from Pricing)
    templateCode?: string;   // Pricing template code
    confidence: number;      // 0-1 match confidence
}

// ─── Pricing Dynamic Templates (loaded at runtime) ───
export interface ProductTemplate {
    id: number;
    code: string;
    name: string;
    product_type: ProductType;
    keywords: string[];
    has_auto_pricing?: boolean;
    ai_enabled?: boolean;
    description?: string;
    fields?: ProductField[];
}

export interface ProductField {
    id: number;
    field_code: string;
    field_name: string;
    field_type: string;
    is_required: boolean;
    ai_question: string;
    ai_keywords: string[];
    default_value?: string;
    options?: { labels?: string[]; choices?: string[]; values?: string[] };
    source_table?: string;
}

// ─── Static fallback patterns ───
const staticPatterns: Record<ProductType, Array<{ pattern: RegExp; product: string }>> = {
    loose: [
        { pattern: /\bflyer\b|tờ\s*r[oơ]i|to\s*roi|\bbrochure\b/iu, product: 'flyer' },
        { pattern: /danh\s*thi[ếe]p|name\s*card|namecard|business\s*card|card\s*visit|card-visit|cardvisit/iu, product: 'namecard' },
        { pattern: /tem|sticker|nh[ãa]n\s*d[áa]n|decal/iu, product: 'sticker' },
        { pattern: /poster|áp\s*ph[íi]ch|ap\s*phich/iu, product: 'poster' },
        { pattern: /v[eé]\s*s[ựu]\s*ki[ệe]n|invitation\s*card|thi[ệe]p\s*m[ời]i/iu, product: 'invitation' },
        { pattern: /phong\s*b[ìi]|b[ìi]\s*th[ư]|envelope/iu, product: 'envelope' },
        { pattern: /folder|kẹp\s*t[àa]i\s*li[ệe]u/iu, product: 'folder' },
        // Hộp giấy/bao bì phải đứng TRƯỚC 'paper_bag' vì "bao bì" là từ chung của cả hai nhóm.
        // Audit 2026-08-29: trước đây detectProduct("báo giá hộp giấy 500 cái") trả null vì
        // không có pattern tĩnh nào cho hộp ⇒ mất hẳn đường tư vấn bao bì khi Pricing template
        // chưa nạp (cron/queue/test) hoặc tenant chưa bật sản phẩm hộp.
        { pattern: /h[ộo]p\s*(?:gi[ấa]y|carton|c[ứu]ng|b[ắa]nh|qu[àa]|s[ảa]n\s*ph[ẩe]m|n[ắa]p\s*g[àa]i|[âa]m\s*d[ưu][ơo]ng)|paper\s*box|carton\s*box|packaging|bao\s*b[ìi]\s*(?:gi[ấa]y|h[ộo]p|carton)/iu, product: 'paper_box' },
        { pattern: /túi\s*gi[ấa]y|t[úu]i\s*[đd]ựng|paper\s*bag|shopping\s*bag|bao\s*b[ìi]/iu, product: 'paper_bag' },
        { pattern: /tờ\s*bướm|leaflet/iu, product: 'leaflet' },
        { pattern: /voucher|phi[ếe]u/iu, product: 'voucher' },
    ],
    bound: [
        { pattern: /catalog(?:ue)?|danh\s*m[ụu]c/iu, product: 'catalog' },
        { pattern: /s[ổo]\s*tay|notebook/iu, product: 'notebook' },
        { pattern: /sách|book/iu, product: 'book' },
        { pattern: /b[aá]o\s*c[aá]o|report/iu, product: 'report' },
        { pattern: /menu|th[ựư]c\s*[đd]on/iu, product: 'menu' },
        { pattern: /profile|h[ồơ]\s*s[ơ]\s*năng\s*l[ực]/iu, product: 'profile' },
        { pattern: /t[ạa]p\s*ch[íi]|magazine/iu, product: 'magazine' },
        { pattern: /t[ậa]p\s*[aá]n/iu, product: 'book' },
    ],
    large_format: [
        { pattern: /standee|x[\s-]*banner/iu, product: 'standee' },
        { pattern: /backdrop|phông\s*n[ền]/iu, product: 'backdrop' },
        { pattern: /h[ìi]flex|in\s*b[ạa]t/iu, product: 'hiflex' },
        { pattern: /băng\s*r[ôo]n|banner/iu, product: 'banner' },
        { pattern: /pp\s*kẹp\s*format/iu, product: 'pp_format' },
    ],
};

// ─── Dynamic Pricing templates cache ───
let pricingTemplates: ProductTemplate[] = [];
let pricingLoaded = false;

/**
 * Load Pricing product templates for dynamic detection
 */
export function loadProductTemplates(templates: ProductTemplate[]) {
    pricingTemplates = templates;
    pricingLoaded = true;
}

/**
 * Get loaded Pricing templates
 */
export function getProductTemplates(): ProductTemplate[] {
    return pricingTemplates;
}

/**
 * Check if Pricing templates are loaded
 */
export function isPricingLoaded(): boolean {
    return pricingLoaded;
}

/**
 * Find matching Pricing template by product code or ID
 */
export function findProductTemplate(productCode: string): ProductTemplate | undefined {
    return pricingTemplates.find(t => t.code === productCode);
}

export function findProductTemplateById(id: number): ProductTemplate | undefined {
    return pricingTemplates.find(t => t.id === id);
}

/**
 * Detect product type and name from text
 * Priority: Pricing keywords > Static regex patterns
 *
 * Trả về `null` khi không có tín hiệu nào HOẶC tín hiệu dưới `MIN_PRODUCT_CONFIDENCE`.
 */
export function detectProduct(text: string): ProductMatch | null {
    const normalized = text.toLowerCase();
    // Bản so khớp: bỏ dấu + bung viết tắt ("nc" → "namecard", "ctlg" → "catalogue").
    const normalizedNoAccent = toMatchText(text);

    // ── Phase 1: Try Pricing dynamic templates first ──
    if (pricingTemplates.length > 0) {
        let bestMatch: { template: ProductTemplate; score: number } | null = null;

        for (const template of pricingTemplates) {
            let score = 0;

            // Check product keywords
            for (const keyword of (template.keywords || [])) {
                const kw = keyword.toLowerCase();
                const kwNoAccent = removeAccents(kw);
                if (normalized.includes(kw)) {
                    // Longer keywords = higher weight (more specific)
                    score += kw.length;
                } else if (normalizedNoAccent.includes(kwNoAccent)) {
                    score += kw.length * 0.8; // fuzzy match
                }
            }

            // Check product name
            const tName = template.name.toLowerCase();
            const tNameNoAccent = removeAccents(tName);
            if (normalized.includes(tName)) {
                score += tName.length * 2; // name match = 2x weight
            } else if (normalizedNoAccent.includes(tNameNoAccent)) {
                score += tName.length * 1.5; // fuzzy name match
            }

            if (score > 0 && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { template, score };
            }
        }

        if (bestMatch) {
            const confidence = Math.min(bestMatch.score / 20, 1); // normalize
            // Dưới ngưỡng → coi như KHÔNG phát hiện, để hệ thống rơi về static regex rồi
            // (nếu vẫn không có) hỏi khách, thay vì khoá sai sản phẩm.
            if (confidence >= MIN_PRODUCT_CONFIDENCE) {
                return {
                    type: bestMatch.template.product_type,
                    product: bestMatch.template.code,
                    templateId: bestMatch.template.id,
                    templateCode: bestMatch.template.code,
                    confidence,
                };
            }
        }
    }

    // ── Phase 2: Fallback to static regex ──
    // Thử cả bản có dấu và bản đã bỏ dấu/bung viết tắt để bắt được "to roi", "danh thiep", "nc".
    for (const type of ['bound', 'large_format', 'loose'] as ProductType[]) {
        for (const { pattern, product } of staticPatterns[type]) {
            if (pattern.test(normalized) || pattern.test(normalizedNoAccent)) {
                return { type, product, confidence: 0.7 };
            }
        }
    }

    return null;
}

/**
 * Phát hiện TẤT CẢ sản phẩm được nhắc trong một tin nhắn.
 *
 * Audit 2026-08-29: `detectProduct` chỉ trả 1 kết quả, nên câu rất thường gặp
 * "em cần in namecard và tờ rơi" chỉ khoá vào namecard rồi bỏ hẳn tờ rơi khỏi mọi ngữ cảnh
 * (trường cần hỏi, quy tắc ràng buộc, tài liệu KB). Hàm này dùng cho tầng ngữ cảnh/tư vấn;
 * đường tính giá vẫn dùng `detectProduct` vì mỗi lần chỉ báo giá được một sản phẩm.
 *
 * Thứ tự trả về theo vị trí xuất hiện trong câu (sản phẩm khách nói trước đứng trước).
 */
export function detectAllProducts(text: string): ProductMatch[] {
    const normalized = text.toLowerCase();
    const normalizedNoAccent = toMatchText(text);
    const found = new Map<string, { match: ProductMatch; at: number }>();

    // Pricing templates — chấm điểm từng template độc lập, nhận mọi template vượt ngưỡng.
    for (const template of pricingTemplates) {
        let score = 0;
        let firstAt = Number.MAX_SAFE_INTEGER;
        const terms = [...(template.keywords || []), template.name];
        for (const term of terms) {
            const kw = String(term).toLowerCase();
            const weight = term === template.name ? 2 : 1;
            const idx = normalized.indexOf(kw);
            if (idx >= 0) {
                score += kw.length * weight;
                firstAt = Math.min(firstAt, idx);
                continue;
            }
            const idxNo = normalizedNoAccent.indexOf(removeAccents(kw));
            if (idxNo >= 0) {
                score += kw.length * weight * 0.8;
                firstAt = Math.min(firstAt, idxNo);
            }
        }
        const confidence = Math.min(score / 20, 1);
        if (confidence >= MIN_PRODUCT_CONFIDENCE) {
            found.set(template.code, {
                match: {
                    type: template.product_type,
                    product: template.code,
                    templateId: template.id,
                    templateCode: template.code,
                    confidence,
                },
                at: firstAt,
            });
        }
    }

    // Static regex — bổ sung các sản phẩm chưa có template tương ứng.
    for (const type of ['bound', 'large_format', 'loose'] as ProductType[]) {
        for (const { pattern, product } of staticPatterns[type]) {
            if (found.has(product)) continue;
            const m = pattern.exec(normalized) || pattern.exec(normalizedNoAccent);
            if (m) {
                found.set(product, { match: { type, product, confidence: 0.7 }, at: m.index });
            }
        }
    }

    return [...found.values()].sort((a, b) => a.at - b.at).map((v) => v.match);
}
