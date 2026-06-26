/**
 * Quote Engine Interfaces
 * Ported from Kprint Pricing QuoteParserV2 + pricing.php
 */

// ── Parsed Quote (output of QuoteParserService) ──

export interface ParsedQuote {
    success: boolean;
    rawText: string;
    status?: 'greeting' | 'quote_request';
    message?: string;

    // Product detection
    product?: string;        // e.g. 'flyer', 'catalog', 'standee'
    type?: ProductType;      // loose | bound | large_format

    // Common fields
    quantity?: number;
    size?: QuoteSize;
    printSides?: number;     // 1 or 2
    phone?: string;
    shape?: 'round' | 'rectangle';

    // Loose / Large format
    material?: MaterialInfo;
    lamination?: string;     // 'can_mo' | 'can_bong'

    // Bound products
    bindingType?: BindingInfo;
    pageCount?: number;
    includesCover?: boolean | null;
    coverMaterial?: MaterialInfo;
    innerMaterial?: MaterialInfo;
    coverLamination?: { type: string; sides?: number };
    coverFinishing?: string[];
    innerFinishing?: string[];

    // Finishing (all types)
    finishing?: string[];

    // Large format
    accessories?: string[];

    // Validation
    missingFields: string[];
    isComplete: boolean;
    warnings: string[];
    question?: string;       // Follow-up question for missing fields
}

export type ProductType = 'loose' | 'bound' | 'large_format';

export interface QuoteSize {
    name: string;
    width: number;   // in mm
    height: number;  // in mm
}

export interface MaterialInfo {
    id?: number;
    name: string;
    code?: string;
    type?: string;   // couche, ivory, kraft, duplex, art, decal
    gsm?: number;
    price?: number;
    paperSizeId?: number;
}

export interface BindingInfo {
    id?: number;
    name: string;
    code: string;
    pricingCode?: string;  // Pricing binding_types.code (saddle_stitch, perfect_bind, wire_o, etc.)
}

// ── Pricing Result ──

export interface PricingResult {
    productType: string;
    type?: ProductType;
    total: number | null;
    unitPrice?: number;
    currency: string;
    breakdown: PricingBreakdownItem[];
    leadtime?: {
        standardDays: number;
        expressDays?: number;
        expressSurcharge?: number;
    };
    techNotes?: string;
    requiresManualQuote: boolean;
    reason?: string;
    warnings: string[];
    missingFields?: string[];
    question?: string;

    // Bound-specific
    coverCost?: number;
    innerCost?: number;
    bindingCost?: number;
    laminationCost?: number;
    coverMissing?: boolean;
    innerMissing?: boolean;
    bindingMissing?: boolean;

    // Large format
    areaInfo?: { widthM: number; heightM: number; areaM2: number };
    source?: string;
}

export interface PricingBreakdownItem {
    item: string;
    detail: string;
    cost: number;
    missing?: boolean;
}

// ── Finishing detailed result (with scope) ──

export interface FinishingDetailed {
    cover: string[];
    inner: string[];
    global: string[];
}
