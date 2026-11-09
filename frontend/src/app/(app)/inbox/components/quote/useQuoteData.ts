import { useState, useEffect, useCallback, useRef } from 'react';
import { ProductTemplate, MasterData, ProductField, FIELD_MASTER_MAP, FIELD_CATEGORY_FILTER, FORM_OPTIONS_MAP, SOURCE_TABLE_MAP } from './types';

import { API_URL as API } from '@/lib/api';

export function useQuoteData(token: string, messages: Array<{ senderType: string; content: string }>) {
    const [templates, setTemplates] = useState<ProductTemplate[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
    const [formData, setFormData] = useState<Record<string, string>>({});
    const [autoDetected, setAutoDetected] = useState(false);
    const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
    const [masterData, setMasterData] = useState<MasterData>({ materials: [], paperSizes: [], processingOptions: [], accessories: [], formOptions: {} });
    
    const lastDetectedMsg = useRef<string>('');
    const manuallySelected = useRef(false);

    const headers = useCallback(() => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    }), [token]);

    /** Ensure mini_quote_fields is always a proper array (handles double-encoded JSON from DB) */
    const normalizeMiniQuoteFields = (t: ProductTemplate): ProductTemplate => {
        let mqf = t.mini_quote_fields;
        if (typeof mqf === 'string') {
            try { mqf = JSON.parse(mqf); } catch { mqf = null; }
        }
        if (typeof mqf === 'string') {
            try { mqf = JSON.parse(mqf); } catch { mqf = null; }
        }
        return { ...t, mini_quote_fields: Array.isArray(mqf) ? mqf : null };
    };

    useEffect(() => {
        fetch(`${API}/product-templates`, { headers: headers() })
            .then(r => r.ok ? r.json() : [])
            .then(data => setTemplates((Array.isArray(data) ? data : []).map(normalizeMiniQuoteFields)))
            .catch(() => { });

        fetch(`${API}/product-templates/master-data`, { headers: headers() })
            .then(r => r.ok ? r.json() : { materials: [], paperSizes: [], processingOptions: [], accessories: [], formOptions: {} })
            .then((data: Partial<MasterData>) => {
                setMasterData({
                    materials: data.materials || [],
                    paperSizes: data.paperSizes || [],
                    processingOptions: data.processingOptions || [],
                    accessories: data.accessories || [],
                    formOptions: data.formOptions || {},
                });
            })
            .catch(() => { });
    }, [headers]);

    // Re-fetch templates when user returns to the tab (e.g. after editing in Admin)
    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === 'visible') {
                fetch(`${API}/product-templates`, { headers: headers() })
                    .then(r => r.ok ? r.json() : [])
                    .then(data => {
                        const parsed = (Array.isArray(data) ? data : []).map(normalizeMiniQuoteFields);
                        setTemplates(parsed);
                        // Also update selectedTemplate if it exists
                        if (selectedTemplate) {
                            const updated = parsed.find((t: ProductTemplate) => t.code === selectedTemplate.code);
                            if (updated) setSelectedTemplate(updated);
                        }
                    })
                    .catch(() => { });
            }
        };
        document.addEventListener('visibilitychange', refresh);
        return () => document.removeEventListener('visibilitychange', refresh);
    }, [headers, selectedTemplate]);


    useEffect(() => {
        if (!selectedTemplate?.product_id) return;
        fetch(`${API}/product-templates/master-data?product_id=${selectedTemplate.product_id}`, { headers: headers() })
            .then(r => r.ok ? r.json() : null)
            .then((data: Partial<MasterData>) => {
                if (data) {
                    setMasterData({
                        materials: data.materials || [],
                        paperSizes: data.paperSizes || [],
                        processingOptions: data.processingOptions || [],
                        accessories: data.accessories || [],
                        formOptions: data.formOptions || {},
                        config: data.config || undefined,
                    });
                    if (data.config) {
                        const config = data.config;
                        setFormData(prev => {
                            const updated = { ...prev };
                            if (config.default_print_side) {
                                const psField = selectedTemplate.fields?.find(f => ['printSides', 'so_mat_in', 'print_side'].includes(f.field_code));
                                const targetKey = psField ? psField.field_code : 'print_side';
                                if (!prev[targetKey]) updated[targetKey] = config.default_print_side;
                            }
                            if (config.default_print_type) {
                                const ptField = selectedTemplate.fields?.find(f => ['printType', 'loai_in', 'print_type'].includes(f.field_code));
                                if (ptField) {
                                    let val = config.default_print_type;
                                    // Map legacy config values to typical field options to avoid empty dropdowns
                                    if (val === '4c') val = '4 màu (CMYK)';
                                    if (val === '1c') val = '1 màu';
                                    updated[ptField.field_code] = val;
                                }
                                if (!prev['print_type']) updated['print_type'] = config.default_print_type;
                            }
                            if (config.default_quantity && !prev['quantity'] && !prev['so_luong']) {
                                const qField = selectedTemplate.fields?.find(f => ['quantity', 'so_luong'].includes(f.field_code));
                                const targetKey = qField ? qField.field_code : 'quantity';
                                updated[targetKey] = String(config.default_quantity);
                            }
                            if (config.default_width && !prev['kich_thuoc_w'] && !prev['size_w']) {
                                updated['kich_thuoc_w'] = String(Number(config.default_width) / 10);
                            }
                            if (config.default_height && !prev['kich_thuoc_h'] && !prev['size_h']) {
                                updated['kich_thuoc_h'] = String(Number(config.default_height) / 10);
                            }
                            if (config.default_material_id && !prev['material'] && !prev['vat_lieu'] && !prev['chat_lieu']) {
                                updated['material'] = String(config.default_material_id);
                            }
                            if (config.default_paper_size_id && !prev['paper_size'] && !prev['kich_thuoc_giay']) {
                                updated['paper_size'] = String(config.default_paper_size_id);
                            }
                            
                            const sizeField = selectedTemplate.fields?.find(f => ['size', 'kich_thuoc', 'kho_giay_id', 'paper_size_id', 'kho_giay', 'kich_thuoc_giay'].includes(f.field_code));
                            if (sizeField) {
                                if ((config as any).default_paper_size_id) {
                                    updated[sizeField.field_code] = String((config as any).default_paper_size_id);
                                } else if (data.paperSizes && data.paperSizes.length > 0 && !prev[sizeField.field_code]) {
                                    updated[sizeField.field_code] = String(data.paperSizes[0].id);
                                    setAutoFilledFields(prev => new Set(prev).add(sizeField.field_code));
                                }
                            }
                            
                            return updated;
                        });
                    } else if (data.paperSizes && data.paperSizes.length > 0) {
                        // Also auto-fill if there is no config but there are allowed paper sizes
                        setFormData(prev => {
                            const updated = { ...prev };
                            const sizeField = selectedTemplate.fields?.find(f => ['size', 'kich_thuoc', 'kho_giay_id', 'paper_size_id', 'kho_giay', 'kich_thuoc_giay'].includes(f.field_code));
                            if (sizeField && !prev[sizeField.field_code]) {
                                updated[sizeField.field_code] = String(data.paperSizes![0].id);
                                setAutoFilledFields(prevAuto => new Set(prevAuto).add(sizeField.field_code));
                            }
                            return updated;
                        });
                    }
                }
            })
            .catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTemplate?.product_id, headers]);

    const buildDefaultFormData = (template: ProductTemplate | null): Record<string, string> => {
        if (!template?.fields) return {};
        const defaults: Record<string, string> = {};
        for (const f of template.fields) {
            if (f.default_value) {
                const matched = matchDropdownValue(f.field_code, f.default_value, f);
                defaults[f.field_code] = matched ?? f.default_value;
            }
        }
        return defaults;
    };

    const matchDropdownValue = (fieldCode: string, extractedVal: string, field: ProductField): string | null => {
        const items = getDropdownItems(field);
        if (items.length === 0) return extractedVal;

        if (items.some(i => i.value === extractedVal)) return extractedVal;

        const synonyms: Record<string, string[]> = {
            'single': ['1', '1_mat', 'single', 'single_side', '1 mặt', 'một mặt'],
            'double': ['2', '2_mat', 'double', 'double_side', '2 mặt', 'hai mặt'],
            '1': ['single', '1_mat', 'single_side', '1 mặt', 'một mặt'],
            '2': ['double', '2_mat', 'double_side', '2 mặt', 'hai mặt'],
            'can_mo': ['can_mo', 'matte', 'mờ', 'cán mờ', 'cán màng mờ'],
            'can_bong': ['can_bong', 'glossy', 'bóng', 'cán bóng', 'cán màng bóng'],
            'cán mờ': ['can_mo', 'matte', 'mờ', 'cán mờ', 'cán màng mờ'],
            'cán bóng': ['can_bong', 'glossy', 'bóng', 'cán bóng', 'cán màng bóng'],
            'circle': ['circle', 'tron', 'tròn', 'hình tròn'],
            'square': ['square', 'vuong', 'vuông', 'hình vuông'],
            'rectangle': ['rectangle', 'chu_nhat', 'chữ nhật', 'hình chữ nhật'],
            'oval': ['oval', 'bau_duc', 'bầu dục'],
        };

        const syns = synonyms[extractedVal.toLowerCase()];
        if (syns) {
            for (const item of items) {
                const v = item.value.toLowerCase();
                const l = item.label.toLowerCase();
                if (syns.some(s => v === s || v.includes(s) || l.includes(s))) {
                    return item.value;
                }
            }
        }

        const norm = extractedVal.toLowerCase();
        for (const item of items) {
            if (item.label.toLowerCase().includes(norm) || item.value.toLowerCase().includes(norm)) {
                return item.value;
            }
        }

        return null;
    };

    useEffect(() => {
        if (manuallySelected.current) return;
        
        // Sliding window: Context Compaction (max 15 recent messages) to save tokens
        const customerMsgs = messages.filter(m => m.senderType === 'customer').slice(-15);
        if (customerMsgs.length === 0) return;
        
        const allCustomerText = customerMsgs.map(m => m.content).join('\n');
        if (allCustomerText === lastDetectedMsg.current) return;
        lastDetectedMsg.current = allCustomerText;

        if (selectedTemplate && autoDetected) {
            fetch(`${API}/product-templates/extract-fields`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({
                    text: allCustomerText,
                    product_id: selectedTemplate.product_id || selectedTemplate.id,
                })
            })
                .then(r => r.ok ? r.json() : { fields: {} })
                .then(result => {
                    const extracted = result.fields || {};
                    const templateFields = (selectedTemplate.fields || []) as ProductField[];
                    setFormData(prev => {
                        const updated = { ...prev };
                        for (const [key, rawVal] of Object.entries(extracted)) {
                            if (!rawVal) continue;
                            const val = rawVal as string;
                            const tField = templateFields.find(f => f.field_code === key);
                            if (tField) {
                                const matched = matchDropdownValue(key, val, tField);
                                if (matched) updated[key] = matched;
                            } else {
                                updated[key] = val;
                            }
                        }
                        return updated;
                    });
                })
                .catch(() => { });
            return;
        }

        fetch(`${API}/product-templates/detect`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ text: allCustomerText })
        })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.detected && data.template) {
                    const matchedFull = templates.find(t => t.code === data.template.code) || normalizeMiniQuoteFields(data.template);
                    setSelectedTemplate(matchedFull);
                    const defaults = buildDefaultFormData(matchedFull);
                    setAutoDetected(true);

                    fetch(`${API}/product-templates/extract-fields`, {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({
                            text: allCustomerText,
                            product_id: matchedFull.product_id || matchedFull.id,
                        })
                    })
                        .then(r => r.ok ? r.json() : { fields: {} })
                        .then(result => {
                            const extracted = result.fields || {};
                            const templateFields = (matchedFull.fields || []) as ProductField[];
                            const merged = { ...defaults };
                            const filledKeys = new Set<string>();
                            for (const [key, rawVal] of Object.entries(extracted)) {
                                if (!rawVal) continue;
                                const val = rawVal as string;
                                const tField = templateFields.find(f => f.field_code === key);
                                if (tField) {
                                    const matched = matchDropdownValue(key, val, tField);
                                    merged[key] = matched ?? val;
                                } else {
                                    merged[key] = val;
                                }
                                filledKeys.add(key);
                            }
                            setFormData(merged);
                            setAutoFilledFields(filledKeys);
                        })
                        .catch(() => setFormData(defaults));
                }
            })
            .catch(() => { });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, headers]);

    const handleTemplateChange = (code: string) => {
        const t = templates.find(t => t.code === code) || null;
        setSelectedTemplate(t);
        setFormData(buildDefaultFormData(t));
        setAutoDetected(false);
        manuallySelected.current = !!t;
    };

    // Đồng bộ công thức tính hiệu suất khổ giấy với Báo giá chính (trừ lề máy in + cộng khe hở dao cắt gap 2mm)
    const calculateEfficiency = (
        ps: import('./types').MasterDataItem,
        itemW: number,
        itemH: number,
        gapH = 2,
        gapV = 2,
    ) => {
        const psW = Number(ps.width) || 0;
        const psH = Number(ps.height) || 0;
        if (!psW || !psH || !itemW || !itemH) return 0;
        const mL = Number(ps.marginLeft ?? 5);
        const mR = Number(ps.marginRight ?? 5);
        const mT = Number(ps.marginTop ?? 5);
        const mB = Number(ps.marginBottom ?? 5);
        const usableW = Math.max(0, psW - mL - mR);
        const usableH = Math.max(0, psH - mT - mB);
        if (usableW <= 0 || usableH <= 0) return 0;
        const fit1 = Math.floor((usableW + gapH) / (itemW + gapH)) * Math.floor((usableH + gapV) / (itemH + gapV));
        const fit2 = Math.floor((usableW + gapH) / (itemH + gapH)) * Math.floor((usableH + gapV) / (itemW + gapV));
        const maxItems = Math.max(fit1, fit2);
        if (maxItems === 0) return 0;
        const usedArea = maxItems * itemW * itemH;
        const totalArea = psW * psH;
        return usedArea / totalArea;
    };

    const handleFieldChange = (fieldCode: string, value: string) => {
        setFormData(prev => {
            const next = { ...prev, [fieldCode]: value };
            
            // Smooth constraint: Auto-correct paper size when material or product size changes
            const triggerFields = ['material', 'vat_lieu', 'chat_lieu', 'innerMaterial', 'coverMaterial', 'kich_thuoc_w', 'kich_thuoc_h', 'size_w', 'size_h', 'width', 'height', 'gap_h', 'gap_v'];
            if (triggerFields.includes(fieldCode)) {
                
                const wFields = ['kich_thuoc_w', 'size_w', 'width'];
                const hFields = ['kich_thuoc_h', 'size_h', 'height'];
                let itemW = 0, itemH = 0;
                for (const kw of wFields) if (next[kw]) itemW = Number(next[kw]) * 10;
                for (const kh of hFields) if (next[kh]) itemH = Number(next[kh]) * 10;
                const gapH = next['gap_h'] ? Number(next['gap_h']) : 2;
                const gapV = next['gap_v'] ? Number(next['gap_v']) : 2;

                const getOptimalPaperSize = (validIds: number[]) => {
                    let finalIds = validIds;
                    if (selectedTemplate?.allowed_paper_sizes?.length) {
                        const allowed = selectedTemplate.allowed_paper_sizes.map(Number);
                        finalIds = validIds.filter(id => allowed.includes(id));
                    }
                    if (finalIds.length === 0) return null;
                    if (itemW <= 0 || itemH <= 0 || !masterData.paperSizes) return finalIds[0];
                    
                    let bestPsId = finalIds[0];
                    let bestEff = -1;
                    for (const psId of finalIds) {
                        const ps = masterData.paperSizes.find(p => Number(p.id) === psId);
                        if (ps && ps.width && ps.height) {
                            const eff = calculateEfficiency(ps, itemW, itemH, gapH, gapV);
                            if (eff > bestEff) {
                                bestEff = eff;
                                bestPsId = psId;
                            }
                        }
                    }
                    return bestPsId;
                };
                // Identify which pairs of material <-> paper_size to process
                const matPsMap: Array<{ matKey: string; psKey: string }> = [];
                if (selectedTemplate?.product_type === 'bound') {
                    matPsMap.push({ matKey: 'coverMaterial', psKey: 'cover_paper_size' });
                    // Also accept innerMaterial or vat_lieu_ruot or material
                    const innerMatKey = ['innerMaterial', 'vat_lieu_ruot', 'material', 'vat_lieu'].find(k => next[k]) || 'innerMaterial';
                    matPsMap.push({ matKey: innerMatKey, psKey: 'inner_paper_size' });
                } else if (selectedTemplate?.product_type === 'large_format') {
                    // Large format doesn't use paper sizes
                } else {
                    const activeMatKey = ['material', 'vat_lieu', 'chat_lieu'].find(k => next[k]) || 'material';
                    const activePsKey = selectedTemplate?.fields?.find(f => ['paper_size', 'kho_giay', 'kich_thuoc_giay'].includes(f.field_code))?.field_code 
                                        || ['paper_size', 'kho_giay', 'kich_thuoc_giay'].find(k => next[k]) 
                                        || 'paper_size';
                    matPsMap.push({ matKey: activeMatKey, psKey: activePsKey });
                }

                for (const { matKey, psKey } of matPsMap) {
                    const materialId = next[matKey];
                    if (!materialId) continue;

                    const material = masterData.materials?.find(m => String(m.id) === materialId) as any;
                    if (material && Array.isArray(material.valid_paper_size_ids)) {
                        const currentPsId = next[psKey];
                        
                        if (currentPsId && !material.valid_paper_size_ids.includes(Number(currentPsId))) {
                            // Current size is invalid -> auto select optimal valid or clear
                            const optPsId = getOptimalPaperSize(material.valid_paper_size_ids);
                            if (optPsId !== null) {
                                next[psKey] = String(optPsId);
                            } else {
                                delete next[psKey];
                            }
                        } else if (!currentPsId && material.valid_paper_size_ids.length > 0) {
                            // Empty -> auto select optimal valid
                            const optPsId = getOptimalPaperSize(material.valid_paper_size_ids);
                            if (optPsId !== null) {
                                next[psKey] = String(optPsId);
                            }
                        }
                    }
                }
            }
            return next;
        });

        if (autoFilledFields.has(fieldCode)) {
            setAutoFilledFields(prev => { const next = new Set(prev); next.delete(fieldCode); return next; });
        }
    };

    const getConfigOptions = (opts: unknown): {value: string, label: string}[] => {
        if (!opts) return [];
        if (Array.isArray(opts)) return opts.filter(o => typeof o === 'string').map(o => ({value: o, label: o}));
        if (typeof opts === 'object') {
            const o = opts as Record<string, unknown>;
            const choices = Array.isArray(o.choices) ? o.choices : Array.isArray(o.labels) ? o.labels : null;
            const values = Array.isArray(o.values) ? o.values : null;
            
            if (choices && values && choices.length === values.length) {
                return choices.map((c, i) => ({
                    label: typeof c === 'string' ? c : String(c),
                    value: typeof values[i] === 'string' ? values[i] : String(values[i])
                }));
            }
            
            const arr = choices || values;
            if (Array.isArray(arr)) {
                return arr.filter(v => typeof v === 'string').map(v => ({value: v, label: v}));
            }
        }
        return [];
    };

    const getDropdownItems = (field: ProductField): { value: string; label: string; source?: string }[] => {
        const masterKey = FIELD_MASTER_MAP[field.field_code];
        if (masterKey && masterKey !== 'formOptions' && masterData[masterKey] && Array.isArray(masterData[masterKey]) && (masterData[masterKey] as import('./types').MasterDataItem[]).length > 0) {
            let items = masterData[masterKey] as import('./types').MasterDataItem[];

            // ── Scope filter: filter by product_type scope ──
            // This matches the ERP QuoteConfigurator behavior:
            // - loose form only shows scopeLoose processing/materials
            // - bound form only shows scopeBound  
            // - large_format only shows scopeLargeFormat
            if (selectedTemplate?.product_type) {
                const scopeKey = `scope_${selectedTemplate.product_type}` as keyof import('./types').MasterDataItem;
                // Only apply scope filter if items actually have scope data
                const hasScope = items.some(item => (item as any)[scopeKey] !== undefined);
                if (hasScope) {
                    items = items.filter(item => (item as any)[scopeKey] === true);
                }
            }

            // NOTE: allowed_materials/paper_sizes/processing filtering is done server-side
            // in getMasterDataForProduct() — no need to re-filter here

            // Material -> Paper Size constraint
            if (masterKey === 'paperSizes') {
                const matKey = field.field_code === 'cover_paper_size' ? 'coverMaterial'
                    : field.field_code === 'inner_paper_size' ? 'innerMaterial'
                    : null;
                const materialId = matKey
                    ? formData[matKey]
                    : (formData['material'] || formData['vat_lieu'] || formData['chat_lieu'] || formData['innerMaterial'] || formData['coverMaterial']);
                if (materialId) {
                    const material = masterData.materials?.find(m => String(m.id) === materialId) as any;
                    if (material && Array.isArray(material.valid_paper_size_ids) && material.valid_paper_size_ids.length > 0) {
                        items = items.filter(ps => material.valid_paper_size_ids.includes(Number(ps.id)));
                    }
                }
            }

            // ── Category filter: further filter processing by category (e.g. lamination, die_cut) ──
            const categoryFilter = FIELD_CATEGORY_FILTER[field.field_code];
            if (categoryFilter && masterKey === 'processingOptions') {
                items = items.filter(item => item.category && categoryFilter.some(cat => item.category!.startsWith(cat)));
            }

            if (items.length > 0) {
                return items.map(item => ({
                    value: String(item.id),
                    label: (item.display_name || item.name) + (item.gsm ? ` (${item.gsm}gsm)` : '') + (item.paper_size_name ? ` - Khổ ${item.paper_size_name}` : ''),
                    source: 'Pricing',
                }));
            }
        }
        
        const formKey = FORM_OPTIONS_MAP[field.field_code];
        if (formKey && masterData.formOptions?.[formKey]?.length) {
            return masterData.formOptions[formKey]!.map((o: any) => {
                if (typeof o === 'string') {
                    let label = o;
                    if (o === 'single') label = '1 mặt';
                    if (o === 'double') label = '2 mặt / 2 mặt cùng nội dung / 2 mặt khác nội dung'; // Be comprehensive or just '2 mặt'
                    if (o === 'double') label = '2 mặt';
                    if (o === 'rectangle') label = 'Chữ nhật vuông góc';
                    if (o === 'round') label = 'Bo góc';
                    if (o === 'custom') label = 'Theo thiết kế';
                    return { value: o, label };
                }
                return {
                    value: o.value,
                    label: o.label || o.value,
                };
            });
        }
        
        if (field.source_table) {
            const stKey = SOURCE_TABLE_MAP[field.source_table];
            if (stKey && stKey !== 'formOptions' && masterData[stKey] && Array.isArray(masterData[stKey]) && (masterData[stKey] as import('./types').MasterDataItem[]).length > 0) {
                let stItems = masterData[stKey] as import('./types').MasterDataItem[];
                // Scope filter (same as above)
                if (selectedTemplate?.product_type) {
                    const scopeKey = `scope_${selectedTemplate.product_type}` as keyof import('./types').MasterDataItem;
                    const hasScope = stItems.some(item => (item as any)[scopeKey] !== undefined);
                    if (hasScope) {
                        stItems = stItems.filter(item => (item as any)[scopeKey] === true);
                    }
                }
                if (selectedTemplate) {
                    if (stKey === 'materials' && selectedTemplate.allowed_materials?.length) {
                        const allowedIds = selectedTemplate.allowed_materials.map(String);
                        stItems = stItems.filter(item => allowedIds.includes(String(item.id)));
                    } else if (stKey === 'paperSizes' && selectedTemplate.allowed_paper_sizes?.length) {
                        const allowedIds = selectedTemplate.allowed_paper_sizes.map(String);
                        stItems = stItems.filter(item => allowedIds.includes(String(item.id)));
                    } else if (stKey === 'processingOptions' && selectedTemplate.allowed_processing?.length) {
                        const allowedIds = selectedTemplate.allowed_processing.map(String);
                        stItems = stItems.filter(item => allowedIds.includes(String(item.id)));
                    }
                }
                
                // Material -> Paper Size constraint
                if (stKey === 'paperSizes') {
                    const materialId = formData['material'] || formData['vat_lieu'] || formData['chat_lieu'] || formData['innerMaterial'] || formData['coverMaterial'];
                    if (materialId) {
                        const material = masterData.materials?.find(m => String(m.id) === materialId) as any;
                        if (material && Array.isArray(material.valid_paper_size_ids)) {
                            stItems = stItems.filter(ps => material.valid_paper_size_ids.includes(Number(ps.id)));
                        }
                    }
                }
                
                const categoryFilter = FIELD_CATEGORY_FILTER[field.field_code];
                if (categoryFilter && stKey === 'processingOptions') {
                    stItems = stItems.filter(item => item.category && categoryFilter.some(cat => item.category!.startsWith(cat)));
                }
                if (stItems.length > 0) {
                    return stItems.map(item => ({
                        value: String(item.id),
                        label: (item.display_name || item.name) + (item.gsm ? ` (${item.gsm}gsm)` : '') + (item.paper_size_name ? ` - Khổ ${item.paper_size_name}` : '') + (item.has_pricing === false ? ' ⚠️' : ''),
                        source: 'Pricing',
                    }));
                }
            }
        }
        
        const configOpts = getConfigOptions(field.options);
        if (configOpts.length > 0) {
            return configOpts;
        }
        
        if (FIELD_CATEGORY_FILTER[field.field_code]) {
            return [];
        }
        return [];
    };

    return {
        templates,
        selectedTemplate,
        formData,
        masterData,
        autoDetected,
        autoFilledFields,
        handleTemplateChange,
        handleFieldChange,
        getDropdownItems
    };
}
