import { useState } from 'react';
import { ProductTemplate, MasterData, ProductField, FIELD_MASTER_MAP, FIELD_CATEGORY_FILTER } from './types';

interface QuoteFormFieldsProps {
    selectedTemplate: ProductTemplate;
    formData: Record<string, string>;
    masterData: MasterData;
    autoFilledFields: Set<string>;
    handleFieldChange: (fieldCode: string, value: string) => void;
    getDropdownItems: (field: ProductField) => { value: string; label: string; source?: string }[];
    onInsertText: (text: string) => void;
}

export function QuoteFormFields({
    selectedTemplate,
    formData,
    masterData,
    autoFilledFields,
    handleFieldChange,
    getDropdownItems,
    onInsertText
}: QuoteFormFieldsProps) {
    const [showQuestions, setShowQuestions] = useState(false);

    // Fields that should render as dual width×height inputs
    const SIZE_FIELDS = ['kich_thuoc', 'size', 'kich_co', 'dimensions'];
    const isSizeField = (code: string) => SIZE_FIELDS.includes(code);

    const renderSizeField = (field: ProductField) => {
        const w = formData[`${field.field_code}_w`] || '';
        const h = formData[`${field.field_code}_h`] || '';
        const isFilled = w.trim().length > 0 && h.trim().length > 0;

        return (
            <div key={field.field_code} className="col-span-2">
                <div className="flex items-center mb-1.5 gap-1.5">
                    <span className="text-[14px]">{isFilled ? '✅' : field.is_required ? '🔴' : '⚪'}</span>
                    <label className={`text-xs font-semibold ${isFilled ? 'text-emerald-700' : (field.is_required ? 'text-slate-700' : 'text-slate-500')}`}>
                         {field.field_name}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">(cm)</span>
                    </label>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number" placeholder="Ngang" value={w}
                        onChange={e => {
                            const newW = e.target.value;
                            handleFieldChange(`${field.field_code}_w`, newW);
                            if (newW && h) handleFieldChange(field.field_code, `${newW}x${h}`);
                        }}
                        className={`flex-1 min-w-0 px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 ${
                            w 
                                ? 'bg-emerald-50/50 border border-emerald-200 text-emerald-900 focus:ring-emerald-50 focus:border-emerald-400' 
                                : 'bg-white border border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                        }`}
                    />
                    <span className="text-sm font-bold text-slate-400">×</span>
                    <input
                        type="number" placeholder="Dọc" value={h}
                        onChange={e => {
                            const newH = e.target.value;
                            handleFieldChange(`${field.field_code}_h`, newH);
                            if (w && newH) handleFieldChange(field.field_code, `${w}x${newH}`);
                        }}
                        className={`flex-1 min-w-0 px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 ${
                            h 
                                ? 'bg-emerald-50/50 border border-emerald-200 text-emerald-900 focus:ring-emerald-50 focus:border-emerald-400' 
                                : 'bg-white border border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                        }`}
                    />
                </div>
            </div>
        );
    };

    const renderField = (field: ProductField) => {
        if (isSizeField(field.field_code)) return renderSizeField(field);

        const value = formData[field.field_code] || '';
        const dropdownItems = getDropdownItems(field);
        const isOptionalProcessing = !!FIELD_CATEGORY_FILTER[field.field_code];
        
        // Check if this field is locked by product config
        const isPrintSideField = ['print_side', 'so_mat_in', 'mat_in', 'printSides'].includes(field.field_code);
        const isPrintTypeField = ['print_type', 'loai_in', 'may_in', 'printType'].includes(field.field_code);
        const isLocked = (isPrintSideField && masterData.config?.lock_print_side) || 
                         (isPrintTypeField && masterData.config?.lock_print_type);

        let isFilled: boolean;
        if (isOptionalProcessing) {
            isFilled = true;
        } else if (dropdownItems.length > 0) {
            isFilled = value.length > 0 && dropdownItems.some(item => item.value === value);
        } else {
            isFilled = value.trim().length > 0;
        }
        const hasDropdown = dropdownItems.length > 0 || field.field_type === 'select' || isOptionalProcessing;

        const baseInputClasses = `w-full px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 ${
            isLocked
                ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                : isFilled
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50 focus:border-emerald-400'
                : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
        } border`;

        const isHalfWidthField = ['so_luong', 'quantity', 'so_mat_in', 'print_side', 'mat_in', 'gap_h', 'gap_v'].includes(field.field_code);

        return (
            <div key={field.field_code} className={`${isOptionalProcessing || isHalfWidthField ? "col-span-1" : "col-span-2"} flex flex-col justify-between h-full`}>
                <div className="flex items-start mb-1.5 gap-1.5 min-h-[18px]">
                    <span className="text-[14px] leading-none mt-[2px]">{isLocked ? '🔒' : isFilled ? '✅' : field.is_required ? '🔴' : '⚪'}</span>
                    <label className={`text-xs font-semibold flex-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 ${isLocked ? 'text-slate-500' : isFilled ? 'text-emerald-700' : (field.is_required ? 'text-slate-700' : 'text-slate-500')}`}>
                        <span>{field.field_name}</span>
                        {isLocked && <span className="text-[10px] text-amber-600 font-medium bg-amber-50 px-1 rounded flex-shrink-0">Đã khoá</span>}
                        {!isLocked && dropdownItems.length > 0 && <span className="text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1 rounded flex-shrink-0">Pricing</span>}
                    </label>
                    {autoFilledFields.has(field.field_code) && (
                        <span className="text-[9px] text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-[1px] ml-auto font-bold tracking-wide flex items-center gap-0.5 mt-[1px]">
                            <span className="text-[8px] opacity-80">🤖</span> AI
                        </span>
                    )}
                </div>

                {hasDropdown && (dropdownItems.length > 0 || isOptionalProcessing) ? (
                    <select value={value} onChange={e => handleFieldChange(field.field_code, e.target.value)} className={baseInputClasses} disabled={isLocked}>
                        <option value="">{isOptionalProcessing ? 'Không' : '— Chọn —'}</option>
                        {dropdownItems.map((item, i) => (
                            <option key={`opt-${i}`} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                ) : field.field_type === 'number' ? (
                    <input type="number" value={value} placeholder={field.ai_question || field.field_name}
                        onChange={e => handleFieldChange(field.field_code, e.target.value)} className={baseInputClasses} disabled={isLocked} />
                ) : (
                    <input type="text" value={value} placeholder={field.ai_question || field.field_name}
                        onChange={e => handleFieldChange(field.field_code, e.target.value)} className={baseInputClasses} disabled={isLocked} />
                )}
            </div>
        );
    };

    // Mã kiểu đóng cuốn chuẩn theo bảng binding_types trong DB (saddle_stitch, perfect_bind, spiral, wire_o, hardcover)
    const FALLBACK_BINDING_TYPES = [
        { value: 'saddle_stitch', label: '📎 Ghim lồng (Ghim giữa)' },
        { value: 'perfect_bind', label: '📕 Keo nhiệt (Keo gáy)' },
        { value: 'spiral', label: '🔗 Đóng lò xo' },
        { value: 'wire_o', label: '⛓️ Vòng bấm (Wire-O)' },
        { value: 'hardcover', label: '📘 Đóng bìa cứng' },
    ];
    const BINDING_TYPES = (masterData.bindingTypes && masterData.bindingTypes.length > 0)
        ? masterData.bindingTypes.map(bt => ({ value: bt.code || String(bt.id), label: bt.name }))
        : FALLBACK_BINDING_TYPES;

    const BOUND_SIZE_PRESETS = [
        { label: 'A4 (21×29.7)', w: '21', h: '29.7' },
        { label: 'A5 (14.8×21)', w: '14.8', h: '21' },
        { label: 'A6 (10.5×14.8)', w: '10.5', h: '14.8' },
        { label: 'Vuông (20×20)', w: '20', h: '20' },
    ];

    const productType = selectedTemplate.product_type || 'loose';

    /** Render bound-specific fields (book size, page count, binding) */
    const renderBoundSpecs = () => {
        const showBookSize = !selectedTemplate.mini_quote_fields
            || selectedTemplate.mini_quote_fields.length === 0
            || selectedTemplate.mini_quote_fields.includes('item_width')
            || selectedTemplate.mini_quote_fields.includes('item_height')
            || selectedTemplate.mini_quote_fields.includes('kich_thuoc');
        const w = formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '';
        const h = formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '';
        const isSizeFilled = w.trim().length > 0 && h.trim().length > 0;

        return (
            <div className="col-span-2 grid grid-cols-2 gap-3">
                {showBookSize && (
                    <div className="col-span-2 p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg">
                        <div className="flex items-center mb-1.5 gap-1.5">
                            <span className="text-[14px]">{isSizeFilled ? '✅' : '🔴'}</span>
                            <label className="text-xs font-semibold text-slate-700">
                                Khổ thành phẩm cuốn <span className="text-[10px] text-slate-400 font-normal">(cm)</span>
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Ngang (cm)"
                                value={w}
                                onChange={e => {
                                    const newW = e.target.value;
                                    handleFieldChange('kich_thuoc_w', newW);
                                    if (newW && h) handleFieldChange('kich_thuoc', `${newW}x${h}`);
                                }}
                                className={`flex-1 min-w-0 px-3 py-1.5 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                                    w ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                                }`}
                            />
                            <span className="text-sm font-bold text-slate-400">×</span>
                            <input
                                type="number"
                                placeholder="Cao (cm)"
                                value={h}
                                onChange={e => {
                                    const newH = e.target.value;
                                    handleFieldChange('kich_thuoc_h', newH);
                                    if (w && newH) handleFieldChange('kich_thuoc', `${w}x${newH}`);
                                }}
                                className={`flex-1 min-w-0 px-3 py-1.5 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                                    h ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                                }`}
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {BOUND_SIZE_PRESETS.map(preset => {
                                const isActive = w === preset.w && h === preset.h;
                                return (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => {
                                            handleFieldChange('kich_thuoc_w', preset.w);
                                            handleFieldChange('kich_thuoc_h', preset.h);
                                            handleFieldChange('kich_thuoc', `${preset.w}x${preset.h}`);
                                        }}
                                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors font-medium ${
                                            isActive
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                {(!selectedTemplate.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('page_count') || selectedTemplate.mini_quote_fields.includes('so_trang')) && (
                    <div>
                        <div className="flex items-center mb-1.5 gap-1.5">
                            <span className="text-[14px]">{formData['page_count'] || formData['so_trang'] ? '✅' : '🔴'}</span>
                            <label className="text-xs font-semibold text-slate-700">Số trang</label>
                        </div>
                        <input type="number" min={4} step={4} placeholder="24"
                            value={formData['page_count'] || formData['so_trang'] || ''}
                            onChange={e => handleFieldChange('page_count', e.target.value)}
                            className={`w-full px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                                formData['page_count'] || formData['so_trang'] ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                            }`}
                        />
                        <div className="text-[10px] text-slate-400 mt-1 px-1">Bội số 4 (VD: 24, 48, 72)</div>
                    </div>
                )}
                {(!selectedTemplate.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('binding_type') || selectedTemplate.mini_quote_fields.includes('kieu_dong')) && (
                    <div>
                        <div className="flex items-center mb-1.5 gap-1.5">
                            <span className="text-[14px]">{formData['bindingType'] || formData['kieu_dong'] || formData['binding_type'] ? '✅' : '🔴'}</span>
                            <label className="text-xs font-semibold text-slate-700">Kiểu đóng</label>
                        </div>
                        <select
                            value={formData['bindingType'] || formData['kieu_dong'] || formData['binding_type'] || ''}
                            onChange={e => handleFieldChange('bindingType', e.target.value)}
                            className={`w-full px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                                formData['bindingType'] || formData['kieu_dong'] || formData['binding_type'] ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                            }`}
                        >
                            <option value="">— Chọn —</option>
                            {BINDING_TYPES.map(bt => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                        </select>
                    </div>
                )}
            </div>
        );
    };

    /** Render bound-specific materials (cover, inner) */
    const renderBoundMaterials = () => {
        let matItems = masterData.materials;
        const scopedMaterials = matItems.filter((m: any) => m.scope_bound);
        if (scopedMaterials.length > 0) matItems = scopedMaterials;
        
        if (selectedTemplate.allowed_materials?.length) {
            const allowedIds = selectedTemplate.allowed_materials.map(String);
            matItems = matItems.filter(m => allowedIds.includes(String(m.id)));
        }

        return (
            <>
                {/* Cover Material */}
                {(!selectedTemplate.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('cover_material') || selectedTemplate.mini_quote_fields.includes('vat_lieu_bia')) && (
                    <div className="col-span-2 mt-2 p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
                        <div className="flex items-center mb-2 gap-1.5">
                            <span className="text-[14px]">{formData['coverMaterial'] || formData['vat_lieu_bia'] ? '✅' : '🔴'}</span>
                            <label className="text-xs font-bold text-amber-800">📒 Vật liệu BÌA</label>
                            <span className="text-[9px] text-indigo-500 font-bold bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider ml-auto">Pricing</span>
                        </div>
                        <select
                            value={formData['coverMaterial'] || formData['vat_lieu_bia'] || ''}
                            onChange={e => handleFieldChange('coverMaterial', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-amber-50 focus:border-amber-400 transition-all shadow-sm"
                        >
                            <option value="">— Chọn vật liệu bìa —</option>
                            {matItems.map(m => (
                                <option key={String(m.id)} value={String(m.id)}>
                                    {(m as any).display_name || m.name}{m.gsm ? ` (${m.gsm}gsm)` : ''}
                                </option>
                            ))}
                        </select>
                        {formData['cover_paper_size'] && (
                            <div className="mt-2 text-[11px] text-amber-700 bg-amber-100/50 px-2 py-1.5 rounded flex items-center gap-1.5 border border-amber-100">
                                <span className="opacity-70">📏</span>
                                <span>Khổ bìa tối ưu: <strong>{masterData.paperSizes?.find(p => String(p.id) === formData['cover_paper_size'])?.name || 'Đang tính...'}</strong></span>
                                <span className="text-[9px] bg-amber-200/50 text-amber-800 px-1 py-0.5 rounded ml-auto">Auto</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Inner Material */}
                {(!selectedTemplate.mini_quote_fields || selectedTemplate.mini_quote_fields.includes('inner_material') || selectedTemplate.mini_quote_fields.includes('vat_lieu_ruot')) && (
                    <div className="col-span-2 p-3 bg-sky-50/50 border border-sky-200 rounded-lg">
                        <div className="flex items-center mb-2 gap-1.5">
                            <span className="text-[14px]">{formData['innerMaterial'] || formData['vat_lieu_ruot'] || formData['material'] ? '✅' : '🔴'}</span>
                            <label className="text-xs font-bold text-sky-800">📄 Vật liệu RUỘT</label>
                            <span className="text-[9px] text-indigo-500 font-bold bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider ml-auto">Pricing</span>
                        </div>
                        <select
                            value={formData['innerMaterial'] || formData['vat_lieu_ruot'] || formData['material'] || ''}
                            onChange={e => handleFieldChange('innerMaterial', e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-sky-200 rounded-md bg-white outline-none focus:ring-4 focus:ring-sky-50 focus:border-sky-400 transition-all shadow-sm"
                        >
                            <option value="">— Chọn vật liệu ruột —</option>
                            {matItems.map(m => (
                                <option key={String(m.id)} value={String(m.id)}>
                                    {(m as any).display_name || m.name}{m.gsm ? ` (${m.gsm}gsm)` : ''}
                                </option>
                            ))}
                        </select>
                        {formData['inner_paper_size'] && (
                            <div className="mt-2 text-[11px] text-sky-700 bg-sky-100/50 px-2 py-1.5 rounded flex items-center gap-1.5 border border-sky-100">
                                <span className="opacity-70">📏</span>
                                <span>Khổ ruột tối ưu: <strong>{masterData.paperSizes?.find(p => String(p.id) === formData['inner_paper_size'])?.name || 'Đang tính...'}</strong></span>
                                <span className="text-[9px] bg-sky-200/50 text-sky-800 px-1 py-0.5 rounded ml-auto">Auto</span>
                            </div>
                        )}
                    </div>
                )}
            </>
        );
    };

    /** Render large-format-specific size fields */
    const renderLargeFormatSize = () => {
        if (selectedTemplate.mini_quote_fields && selectedTemplate.mini_quote_fields.length > 0 && !selectedTemplate.mini_quote_fields.includes('item_width') && !selectedTemplate.mini_quote_fields.includes('item_height') && !selectedTemplate.mini_quote_fields.includes('kich_thuoc')) return null;

        const w = formData['kich_thuoc_w'] || formData['size_w'] || formData['width'] || '';
        const h = formData['kich_thuoc_h'] || formData['size_h'] || formData['height'] || '';
        const isFilled = w.trim().length > 0 && h.trim().length > 0;

        return (
            <div className="col-span-2 p-3 bg-green-50/50 border border-green-200 rounded-lg">
                <div className="flex items-center mb-2 gap-1.5">
                    <span className="text-[14px]">{isFilled ? '✅' : '🔴'}</span>
                    <label className="text-xs font-bold text-green-800">📏 Kích thước in</label>
                    <span className="text-[10px] text-green-600 font-medium ml-auto">Đơn vị: cm (hệ thống tự quy đổi mm)</span>
                </div>
                <div className="flex items-center gap-2">
                    <input type="number" placeholder="Ngang (cm)" value={w}
                        onChange={e => {
                            const newW = e.target.value;
                            handleFieldChange('kich_thuoc_w', newW);
                            if (newW && h) handleFieldChange('kich_thuoc', `${newW}x${h}`);
                        }}
                        className={`flex-1 min-w-0 px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                            w ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                        }`}
                    />
                    <span className="text-sm font-bold text-slate-400">×</span>
                    <input type="number" placeholder="Dọc (cm)" value={h}
                        onChange={e => {
                            const newH = e.target.value;
                            handleFieldChange('kich_thuoc_h', newH);
                            if (w && newH) handleFieldChange('kich_thuoc', `${w}x${newH}`);
                        }}
                        className={`flex-1 min-w-0 px-3 py-2 text-sm rounded-md outline-none transition-all shadow-sm focus:ring-4 border ${
                            h ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 focus:ring-emerald-50' : 'bg-white border-slate-200 focus:ring-indigo-50 focus:border-indigo-400'
                        }`}
                    />
                </div>
                <div className="text-[10px] text-slate-400 mt-1 px-1">
                    VD: Standee 60×160, Banner 100×300
                </div>
            </div>
        );
    };

    // ── Bidirectional mapping: AI field codes ↔ Registry codes ──
    const AI_TO_REGISTRY: Record<string, string> = {
        'so_luong': 'quantity', 'so_luong_cuon': 'quantity',
        'kich_thuoc': 'item_width', 'kich_co': 'item_width', 'rong': 'item_width', 'cao': 'item_height',
        'chat_lieu': 'material', 'vat_lieu': 'material', 'giay': 'material', 'giay_in': 'material',
        'kho_giay': 'paper_size', 'kich_thuoc_giay': 'paper_size',
        'mat_in': 'print_side', 'so_mat_in': 'print_side',
        'loai_in': 'print_type', 'may_in': 'print_type',
        'hinh_dang': 'shape',
        'can_mang': 'processing', 'gia_cong': 'processing', 'gia_cong_be': 'processing',
        'gia_cong_khac': 'processing', 'lamination': 'processing', 'finishing': 'processing',
        'phu_kien': 'accessories',
        'hinh_anh': 'artwork', 'anh': 'artwork',
        'ten_file': 'file_name', 'ten_sp': 'file_name', 'ten_san_pham': 'file_name',
        'bu_hao': 'spoilage', 'bu_hao_du': 'spoilage',
        'khoang_cach_ngang': 'gap_h', 'khoang_cach_doc': 'gap_v',
        'so_trang': 'page_count',
        'kieu_dong': 'binding_type', 'bindingType': 'binding_type',
        'vat_lieu_bia': 'cover_material', 'coverMaterial': 'cover_material',
        'vat_lieu_ruot': 'inner_material', 'innerMaterial': 'inner_material',
    };
    
    const BOUND_HANDLED_FIELDS = [
        'page_count', 'so_trang', 'bindingType', 'kieu_dong', 'binding_type',
        'coverMaterial', 'vat_lieu_bia', 'cover_material',
        'innerMaterial', 'vat_lieu_ruot', 'inner_material',
        'kich_thuoc', 'size', 'kich_co', 'dimensions', 'width', 'height', 'item_width', 'item_height',
    ];
    const LF_HANDLED_FIELDS = ['kich_thuoc', 'size', 'kich_co', 'dimensions', 'width', 'height', 'item_width', 'item_height'];

    const shouldSkipField = (field: ProductField) => {
        const configuredFields = selectedTemplate.mini_quote_fields;
        if (configuredFields && configuredFields.length > 0) {
            const fieldCode = field.field_code;
            const registryCode = AI_TO_REGISTRY[fieldCode] || fieldCode;
            
            if (isSizeField(fieldCode) || isSizeField(registryCode)) {
                if (configuredFields.includes('item_width') || configuredFields.includes('item_height')) {
                    return false;
                }
            }

            if (!configuredFields.includes(fieldCode) && !configuredFields.includes(registryCode)) {
                return true;
            }
        }

        if (productType === 'bound' && BOUND_HANDLED_FIELDS.includes(field.field_code)) return true;
        if (productType === 'large_format' && LF_HANDLED_FIELDS.includes(field.field_code)) return true;
        if (productType === 'large_format' && ['paper_size', 'kho_giay', 'kich_thuoc_giay'].includes(field.field_code)) return true;
        if (productType === 'bound' && ['material', 'vat_lieu', 'chat_lieu'].includes(field.field_code)) return true;

        const masterKey = FIELD_MASTER_MAP[field.field_code];
        if (masterKey === 'processingOptions') return true;
        if (field.field_code === 'processing' || field.field_code === 'gia_cong') return true;

        return false;
    };

    const isMaterialField = (f: ProductField) => {
        const code = f.field_code;
        return ['vat_lieu', 'chat_lieu', 'material', 'paper_size', 'kho_giay', 'kich_thuoc_giay', 'cover_paper_size', 'inner_paper_size'].includes(code);
    };

    // Pre-compute the full list of fields to render, injecting dynamic ones if configured in mini_quote_fields but missing
    const allFieldsToRender = [...(selectedTemplate.fields || [])];
    const configured = selectedTemplate.mini_quote_fields || [];
    if (configured.length > 0) {
        if ((configured.includes('processing') || configured.includes('gia_cong')) && !allFieldsToRender.some(f => f.field_code === 'gia_cong' || f.field_code === 'processing')) {
            allFieldsToRender.push({ field_code: 'gia_cong', field_name: 'Gia công', field_type: 'select', is_required: false, ai_question: 'Gia công thêm gì?' });
        }
        if ((configured.includes('item_width') || configured.includes('item_height')) && !allFieldsToRender.some(f => isSizeField(f.field_code))) {
            allFieldsToRender.push({ field_code: 'kich_thuoc', field_name: 'Kích thước', field_type: 'size', is_required: true, ai_question: 'Kích thước ngang dọc bao nhiêu?' });
        }
        if ((configured.includes('material') || configured.includes('vat_lieu')) && !allFieldsToRender.some(f => f.field_code === 'vat_lieu' || f.field_code === 'chat_lieu' || f.field_code === 'material')) {
            allFieldsToRender.push({ field_code: 'vat_lieu', field_name: 'Chất liệu', field_type: 'select', is_required: true, ai_question: 'In giấy gì?' });
        }
        if ((configured.includes('paper_size') || configured.includes('kho_giay')) && !allFieldsToRender.some(f => f.field_code === 'paper_size' || f.field_code === 'kho_giay' || f.field_code === 'kich_thuoc_giay')) {
            allFieldsToRender.push({ field_code: 'paper_size', field_name: 'Khổ giấy in', field_type: 'select', is_required: true, ai_question: 'Khổ giấy in là gì?' });
        }
        if ((configured.includes('print_side') || configured.includes('so_mat_in') || configured.includes('mat_in')) && !allFieldsToRender.some(f => f.field_code === 'print_side' || f.field_code === 'so_mat_in' || f.field_code === 'mat_in')) {
            allFieldsToRender.push({ field_code: 'print_side', field_name: 'Mặt in', field_type: 'select', is_required: true, ai_question: 'In mấy mặt?' });
        }
        if ((configured.includes('quantity') || configured.includes('so_luong')) && !allFieldsToRender.some(f => f.field_code === 'so_luong' || f.field_code === 'quantity')) {
            allFieldsToRender.push({ field_code: 'so_luong', field_name: 'Số lượng', field_type: 'number', is_required: true, ai_question: 'Số lượng bao nhiêu?' });
        }
        if ((configured.includes('file_name') || configured.includes('ten_file')) && !allFieldsToRender.some(f => f.field_code === 'ten_file' || f.field_code === 'file_name')) {
            allFieldsToRender.push({ field_code: 'ten_file', field_name: 'Tên file', field_type: 'text', is_required: false, ai_question: 'Tên file là gì?' });
        }
        // Các trường nâng cao từ MINI_QUOTE_MASTER_FIELDS khi Admin bật trong Cài đặt sản phẩm ([MQ-06])
        if ((configured.includes('shape') || configured.includes('hinh_dang')) && !allFieldsToRender.some(f => f.field_code === 'shape' || f.field_code === 'hinh_dang')) {
            allFieldsToRender.push({ field_code: 'hinh_dang', field_name: 'Hình dạng', field_type: 'select', is_required: false, ai_question: 'Hình dạng chữ nhật, bo góc hay tròn?' });
        }
        if ((configured.includes('print_type') || configured.includes('loai_in') || configured.includes('may_in')) && !allFieldsToRender.some(f => f.field_code === 'print_type' || f.field_code === 'loai_in' || f.field_code === 'may_in')) {
            allFieldsToRender.push({ field_code: 'print_type', field_name: 'Loại máy in', field_type: 'select', is_required: false, ai_question: 'Chọn loại máy in nào?' });
        }
        if (configured.includes('gap_h') && !allFieldsToRender.some(f => f.field_code === 'gap_h')) {
            allFieldsToRender.push({ field_code: 'gap_h', field_name: 'Khe ngang (mm)', field_type: 'number', is_required: false, ai_question: 'Khoảng cách ngang (mm)' });
        }
        if (configured.includes('gap_v') && !allFieldsToRender.some(f => f.field_code === 'gap_v')) {
            allFieldsToRender.push({ field_code: 'gap_v', field_name: 'Khe dọc (mm)', field_type: 'number', is_required: false, ai_question: 'Khoảng cách dọc (mm)' });
        }
        if (configured.includes('cover_paper_size') && !allFieldsToRender.some(f => f.field_code === 'cover_paper_size')) {
            allFieldsToRender.push({ field_code: 'cover_paper_size', field_name: 'Khổ giấy bìa', field_type: 'select', is_required: false, ai_question: 'Khổ giấy bìa?' });
        }
        if (configured.includes('cover_print_side') && !allFieldsToRender.some(f => f.field_code === 'cover_print_side')) {
            allFieldsToRender.push({ field_code: 'cover_print_side', field_name: 'Mặt in bìa', field_type: 'select', is_required: false, ai_question: 'Bìa in mấy mặt?' });
        }
        if (configured.includes('cover_print_type') && !allFieldsToRender.some(f => f.field_code === 'cover_print_type')) {
            allFieldsToRender.push({ field_code: 'cover_print_type', field_name: 'Máy in bìa', field_type: 'select', is_required: false, ai_question: 'Máy in bìa?' });
        }
        if (configured.includes('inner_paper_size') && !allFieldsToRender.some(f => f.field_code === 'inner_paper_size')) {
            allFieldsToRender.push({ field_code: 'inner_paper_size', field_name: 'Khổ giấy ruột', field_type: 'select', is_required: false, ai_question: 'Khổ giấy ruột?' });
        }
        if (configured.includes('inner_print_side') && !allFieldsToRender.some(f => f.field_code === 'inner_print_side')) {
            allFieldsToRender.push({ field_code: 'inner_print_side', field_name: 'Mặt in ruột', field_type: 'select', is_required: false, ai_question: 'Ruột in mấy mặt?' });
        }
        if (configured.includes('inner_print_type') && !allFieldsToRender.some(f => f.field_code === 'inner_print_type')) {
            allFieldsToRender.push({ field_code: 'inner_print_type', field_name: 'Máy in ruột', field_type: 'select', is_required: false, ai_question: 'Máy in ruột?' });
        }
    }

    return (
        <div className="px-1">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
                {/* 1. PRODUCT SPECS (Size, Quantity, Pages, Binding) */}
                {productType === 'bound' && renderBoundSpecs()}
                {productType === 'large_format' && renderLargeFormatSize()}

                {/* Generic Specs from template */}
                {(() => {
                    const genericSpecs = allFieldsToRender.filter(f => !shouldSkipField(f) && !isMaterialField(f));
                    return genericSpecs.map(field => renderField(field));
                })()}

                {/* 2. MATERIALS (Cover, Inner, Generic Paper) */}
                {productType === 'bound' && renderBoundMaterials()}
                
                {/* Generic Materials from template */}
                {(() => {
                    const genericMaterials = allFieldsToRender.filter(f => !shouldSkipField(f) && isMaterialField(f));
                    
                    // Sort so that paper size is rendered after material
                    genericMaterials.sort((a, b) => {
                        const isSizeA = ['paper_size', 'kho_giay', 'kich_thuoc_giay', 'cover_paper_size', 'inner_paper_size'].includes(a.field_code);
                        const isSizeB = ['paper_size', 'kho_giay', 'kich_thuoc_giay', 'cover_paper_size', 'inner_paper_size'].includes(b.field_code);
                        if (isSizeA && !isSizeB) return 1; // Size comes later
                        if (!isSizeA && isSizeB) return -1; // Material comes first
                        return 0;
                    });

                    return genericMaterials.map(field => renderField(field));
                })()}
            </div>

            {/* Guided Questions — collapsible */}
            <div className="mt-6 rounded-md overflow-hidden border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-violet-50/50 shadow-sm">
                <div
                    onClick={() => setShowQuestions(prev => !prev)}
                    className="px-3 py-2.5 text-xs font-bold text-indigo-600 cursor-pointer flex items-center justify-between select-none hover:bg-indigo-50 transition-colors"
                >
                    <span className="flex items-center gap-1.5"><span className="text-[14px]">💡</span> Câu hỏi gợi ý — bấm để copy vào chat</span>
                    <span className={`transition-transform duration-200 text-[10px] opacity-70 ${showQuestions ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                </div>
                
                {showQuestions && (
                    <div className="px-3 pb-3 pt-1 space-y-1.5">
                        {(() => {
                            const remainingQuestions = allFieldsToRender.filter(f => !shouldSkipField(f) && f.is_required).map(field => {
                                const isFilled = (formData[field.field_code] || '').trim().length > 0;
                                if (isFilled) return null; // Hide already filled or auto-calculated fields

                                let questionText: string | null = field.ai_question || `Bạn muốn chọn ${field.field_name} gì?`;
                                const masterKey = FIELD_MASTER_MAP[field.field_code];
                                const catFilter = FIELD_CATEGORY_FILTER[field.field_code];

                                if (catFilter || (masterKey && masterKey !== 'materials')) {
                                    const items = (masterData.processingOptions || [])
                                        .filter(p => !catFilter || catFilter.includes(p.category || ''))
                                        .map(p => p.name);
                                    if (items.length > 0) {
                                        questionText = `${field.field_name}: ${items.join(', ')}?`;
                                    } else if (masterData.processingOptions !== undefined) {
                                        questionText = null; 
                                    }
                                } else if (masterKey === 'materials') {
                                    const items = (masterData.materials || []).map(m => m.name);
                                    if (items.length > 0) {
                                        const preview = items.length <= 5 ? items.join(', ') : items.slice(0, 4).join(', ') + ` (+${items.length - 4})`;
                                        questionText = `${field.field_name}: ${preview}?`;
                                    } else if (masterData.materials !== undefined) {
                                        questionText = null; 
                                    }
                                }

                                if (questionText === null) return null;

                                return (
                                    <div
                                        key={`q-${field.field_code}`}
                                        onClick={() => onInsertText(questionText!)}
                                        className="px-3 py-2 rounded-md text-xs leading-relaxed border transition-all bg-white border-indigo-100 text-slate-700 cursor-pointer shadow-sm hover:border-indigo-300 hover:shadow-md hover:-translate-y-[1px]"
                                    >
                                        <span className="mr-1.5 text-[13px]">💬</span> {questionText}
                                    </div>
                                );
                            }).filter(Boolean);

                            if (remainingQuestions.length === 0) {
                                return (
                                    <div className="px-3 py-2.5 rounded-md text-xs leading-relaxed border bg-emerald-50/50 border-emerald-100 text-emerald-600 text-center font-medium">
                                        ✅ Đã thu thập đủ các thông tin bắt buộc!
                                    </div>
                                );
                            }

                            return remainingQuestions;
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}
