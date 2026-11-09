/**
 * Master Field Registry for Mini Quote Form
 * 
 * Defines ALL possible fields per quote_type — extracted 1:1 from QuoteConfigurator.
 * Each product picks a subset of these via `mini_quote_fields` column.
 * If a product has no config (null), fields with `defaultOn: true` are shown.
 */

export interface MiniQuoteFieldDef {
    code: string;
    name: string;
    type: 'number' | 'size' | 'select' | 'text' | 'file' | 'multi_add';
    group: 'info' | 'basic' | 'material' | 'print' | 'processing' | 'accessory' | 'binding' | 'cover' | 'inner';
    defaultOn: boolean;
    sourceTable?: string; // 'materials' | 'processing_options' | 'paper_sizes' | 'accessories'
    categoryFilter?: string[]; // filter processing_options by category
    description?: string;
}

export const MINI_QUOTE_MASTER_FIELDS: Record<string, MiniQuoteFieldDef[]> = {
    loose: [
        // ─── Info ───
        { code: 'file_name', name: 'Tên File / Sản Phẩm', type: 'text', group: 'info', defaultOn: true, description: 'Tên gọi để phân biệt (VD: Card visit sếp tổng)' },
        // ─── Basic (Section 1: Thông tin sản phẩm) ───
        { code: 'quantity', name: 'Số lượng', type: 'number', group: 'basic', defaultOn: true, description: 'Số lượng sản phẩm cần in' },
        { code: 'shape', name: 'Hình dạng', type: 'select', group: 'basic', defaultOn: false, description: 'Lưới (Grid) hoặc Sole (tròn/ellip)' },
        { code: 'item_width', name: 'Rộng SP (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều rộng thành phẩm (nhập theo cm trên Mini Quote)' },
        { code: 'item_height', name: 'Cao SP (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều cao thành phẩm (nhập theo cm trên Mini Quote)' },
        { code: 'gap_h', name: 'K/c ngang (mm)', type: 'number', group: 'basic', defaultOn: false, description: 'Khoảng cách ngang giữa các sản phẩm trên tờ in' },
        { code: 'gap_v', name: 'K/c dọc (mm)', type: 'number', group: 'basic', defaultOn: false, description: 'Khoảng cách dọc giữa các sản phẩm trên tờ in' },
        // ─── Material (Section 2: Vật tư & In ấn) ───
        { code: 'material', name: 'Giấy in', type: 'select', group: 'material', defaultOn: true, sourceTable: 'materials', description: 'Chất liệu giấy in' },
        { code: 'paper_size', name: 'Khổ giấy in', type: 'select', group: 'material', defaultOn: true, sourceTable: 'paper_sizes', description: 'Khổ giấy máy in (A3, A4, SRA3...)' },
        // ─── Print ───
        { code: 'print_side', name: 'Mặt in', type: 'select', group: 'print', defaultOn: true, description: '1 mặt / 2 mặt' },
        { code: 'print_type', name: 'Máy in', type: 'select', group: 'print', defaultOn: false, description: 'Loại máy in (offset, digital...)' },
        // ─── Processing (Section 3: Gia công & Phụ kiện) ───
        { code: 'processing', name: 'Gia công', type: 'multi_add', group: 'processing', defaultOn: true, sourceTable: 'processing_options', description: 'Cán màng, bế, bo góc... (chọn nhiều + mặt in)' },
        // ─── Accessories ───
        { code: 'accessories', name: 'Phụ kiện', type: 'multi_add', group: 'accessory', defaultOn: false, sourceTable: 'accessories', description: 'Phụ kiện đi kèm (chọn nhiều + số lượng)' },
    ],
    bound: [
        // ─── Info ───
        { code: 'file_name', name: 'Tên File / Quyển', type: 'text', group: 'info', defaultOn: true, description: 'Tên tài liệu (VD: Sổ tay nhân viên)' },
        // ─── Basic (Thông số chung) ───
        { code: 'quantity', name: 'Số lượng cuốn', type: 'number', group: 'basic', defaultOn: true, description: 'Số lượng cuốn cần in' },
        { code: 'page_count', name: 'Tổng số trang', type: 'number', group: 'basic', defaultOn: true, description: 'Tổng số trang (bội số 4)' },
        { code: 'item_width', name: 'Rộng cuốn (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều rộng thành phẩm cuốn (VD: A5 = 14.8cm, A4 = 21cm)' },
        { code: 'item_height', name: 'Cao cuốn (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều cao thành phẩm cuốn (VD: A5 = 21cm, A4 = 29.7cm)' },
        // ─── Binding ───
        { code: 'binding_type', name: 'Quy cách đóng', type: 'select', group: 'binding', defaultOn: true, description: 'Ghim giữa, keo nhiệt, lò xo...' },
        // ─── Cover (Bìa) ───
        { code: 'cover_material', name: 'Chất liệu bìa', type: 'select', group: 'cover', defaultOn: true, sourceTable: 'materials', description: 'Giấy bìa ngoài (tên vật liệu)' },
        { code: 'cover_paper_size', name: 'Khổ giấy bìa', type: 'select', group: 'cover', defaultOn: false, sourceTable: 'paper_sizes', description: 'Khổ giấy in bìa' },
        { code: 'cover_print_type', name: 'Loại in bìa', type: 'select', group: 'cover', defaultOn: false, description: 'In offset / digital cho bìa' },
        { code: 'cover_print_side', name: 'Mặt in bìa', type: 'select', group: 'cover', defaultOn: false, description: '1 mặt / 2 mặt cho bìa' },
        { code: 'cover_processing', name: 'Gia công bìa', type: 'multi_add', group: 'cover', defaultOn: true, sourceTable: 'processing_options', description: 'Cán bóng, cán mờ, ép nhũ... cho bìa' },
        // ─── Inner (Ruột) ───
        { code: 'inner_material', name: 'Chất liệu ruột', type: 'select', group: 'inner', defaultOn: true, sourceTable: 'materials', description: 'Giấy ruột bên trong (tên vật liệu)' },
        { code: 'inner_paper_size', name: 'Khổ giấy ruột', type: 'select', group: 'inner', defaultOn: false, sourceTable: 'paper_sizes', description: 'Khổ giấy in ruột' },
        { code: 'inner_print_type', name: 'Loại in ruột', type: 'select', group: 'inner', defaultOn: false, description: 'In offset / digital cho ruột' },
        { code: 'inner_print_side', name: 'Mặt in ruột', type: 'select', group: 'inner', defaultOn: false, description: '1 mặt / 2 mặt cho ruột' },
        { code: 'inner_processing', name: 'Gia công ruột', type: 'multi_add', group: 'inner', defaultOn: false, sourceTable: 'processing_options', description: 'Gia công cho tờ ruột' },
    ],
    large_format: [
        // ─── Info ───
        { code: 'file_name', name: 'Tên File / Sản Phẩm', type: 'text', group: 'info', defaultOn: true, description: 'Tên sản phẩm (VD: Băng rôn Tết, Standee...)' },
        // ─── Basic ───
        { code: 'quantity', name: 'Số lượng', type: 'number', group: 'basic', defaultOn: true, description: 'Số lượng bản in' },
        { code: 'unit', name: 'Đơn vị tính', type: 'select', group: 'basic', defaultOn: false, description: 'Tấm/Tờ hoặc Cuộn' },
        // ─── Material ───
        { code: 'material', name: 'Vật liệu in', type: 'select', group: 'material', defaultOn: true, sourceTable: 'materials', description: 'Chất liệu in (bạt, decal, PP, canvas...)' },
        // ─── Size & Print ───
        { code: 'item_width', name: 'Chiều rộng (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều rộng bản in (nhập theo cm trên Mini Quote)' },
        { code: 'item_height', name: 'Chiều cao (cm)', type: 'number', group: 'basic', defaultOn: true, description: 'Chiều cao bản in (nhập theo cm trên Mini Quote)' },
        { code: 'print_type', name: 'Công nghệ in', type: 'select', group: 'print', defaultOn: false, description: 'UV, Eco Solvent, Latex...' },
        // ─── Processing ───
        { code: 'processing', name: 'Gia công sau in', type: 'multi_add', group: 'processing', defaultOn: true, sourceTable: 'processing_options', description: 'Cuốn ống, đóng khoen, gắn chân...' },
        // ─── Accessories ───
        { code: 'accessories', name: 'Phụ kiện', type: 'multi_add', group: 'accessory', defaultOn: false, sourceTable: 'accessories', description: 'Chân X-Banner, cuộn Roll-up...' },
    ],
};

/** Get default enabled fields for a quote_type */
export function getDefaultMiniQuoteFields(quoteType: string): string[] {
    const fields = MINI_QUOTE_MASTER_FIELDS[quoteType] || MINI_QUOTE_MASTER_FIELDS['loose'];
    return fields.filter(f => f.defaultOn).map(f => f.code);
}

/** Get all master fields for a quote_type */
export function getMasterFieldsForType(quoteType: string): MiniQuoteFieldDef[] {
    return MINI_QUOTE_MASTER_FIELDS[quoteType] || MINI_QUOTE_MASTER_FIELDS['loose'];
}
