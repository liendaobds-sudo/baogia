export interface ProductField {
    field_code: string;
    field_name: string;
    field_type: string;
    is_required: boolean;
    ai_question: string;
    default_value?: string;
    options?: unknown;
    source_table?: string;
}

export interface ProductTemplate {
    id: number;
    code: string;
    name: string;
    product_type: string;
    product_id?: number | null;
    allowed_materials?: number[];
    allowed_paper_sizes?: number[];
    allowed_processing?: number[];
    fields: ProductField[];
    mini_quote_fields?: string[] | null; // per-product field config — null = use defaults
}

export interface MasterDataItem { id: number | string; name: string; display_name?: string; type?: string; gsm?: string; code?: string; category?: string; width?: number; height?: number; has_pricing?: boolean; paper_size_name?: string; paper_size_id?: number | null; scope_loose?: boolean; scope_bound?: boolean; scope_large_format?: boolean; }
export interface AccessoryItem { id: number | string; name: string; code?: string; price?: number; unit?: string }

export interface QuoteResult {
    requiresManualQuote?: boolean;
    reason?: string;
    total?: number;
    unitPrice?: number;
    price_per_item?: number;
    // Giá bán/VAT từ facade (mini): grand_total = selling_subtotal + VAT (theo vat_rate của form mini).
    selling_subtotal?: number;
    selling_price_per_item?: number;
    vat_rate?: number;
    vat_amount?: number;
    grand_total?: number;
    grand_total_per_item?: number;
    breakdown?: Record<string, string | number>;
    leadtime?: {
        standardDays: number;
        expressDays?: number;
    };
    warnings?: string[];
    error?: string;
    productType?: string;
    type?: string;
    currency?: string;
    source?: string;
}
export interface FormOptionItem { value: string; label: string }
export interface MasterData {
    materials: MasterDataItem[];
    paperSizes: MasterDataItem[];
    processingOptions: MasterDataItem[];
    accessories: AccessoryItem[];
    formOptions: {
        shapes?: FormOptionItem[];
        print_sides?: FormOptionItem[];
        print_types?: FormOptionItem[];
    };
    config?: {
        default_print_side?: string;
        default_print_type?: string;
        default_quantity?: number;
        lock_print_side?: boolean;
        lock_print_type?: boolean;
    };
}

export const FIELD_MASTER_MAP: Record<string, keyof MasterData> = {
    'material': 'materials', 'vat_lieu': 'materials', 'chat_lieu': 'materials',
    'giay': 'materials', 'paper': 'materials', 'coverMaterial': 'materials', 'innerMaterial': 'materials',
    'paper_size': 'paperSizes', 'kich_thuoc_giay': 'paperSizes',
    'gia_cong': 'processingOptions', 'can_mang': 'processingOptions',
    'lamination': 'processingOptions', 'finishing': 'processingOptions',
    'gia_cong_be': 'processingOptions', 'processing': 'processingOptions',
    'bindingType': 'processingOptions',
};

export const FIELD_CATEGORY_FILTER: Record<string, string[]> = {
    'can_mang': ['lamination', 'lamination_gloss', 'lamination_matte', 'lamination_velvet'],
    'lamination': ['lamination', 'lamination_gloss', 'lamination_matte', 'lamination_velvet'],
    'gia_cong_be': ['die_cut', 'die_cutting', 'shaping'],
    'finishing': ['finishing', 'post_process'],
    'bindingType': ['binding'],
};

export const FORM_OPTIONS_MAP: Record<string, 'shapes' | 'print_sides' | 'print_types'> = {
    'shape': 'shapes',
    'hinh_dang': 'shapes',
    'printSides': 'print_sides',
    'so_mat_in': 'print_sides',
    'print_side': 'print_sides',
    'printType': 'print_types',
    'loai_in': 'print_types',
    'print_type': 'print_types',
};

export const SOURCE_TABLE_MAP: Record<string, keyof MasterData> = {
    'materials': 'materials',
    'paper_sizes': 'paperSizes',
    'processing_options': 'processingOptions',
};
