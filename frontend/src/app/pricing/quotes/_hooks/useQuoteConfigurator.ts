import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '@/lib/api';
import { buildPricingPayload, type NormalizedInput } from '@/lib/quote/buildPricingPayload';
import { readPricingResult } from '@/lib/quote/readPricingResult';
import { useQuoteCart } from '../_store/useQuoteCart';

export function useQuoteConfigurator(token: string | null, activeTab?: 'loose' | 'bound' | 'large_format', onTabChange?: (tab: 'loose' | 'bound' | 'large_format') => void) {
    const [_internalTab, _setInternalTab] = useState<'loose' | 'bound' | 'large_format'>('loose');
    const tab = activeTab ?? _internalTab;
    const setTab = onTabChange ?? _setInternalTab;
    const [masterData, setMasterData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    
    // UI Cart Context
    const { addItem, items } = useQuoteCart();
    const [fileName, setFileName] = useState('');

    // Loose Config State
    const [quantity, setQuantity] = useState<number>(100);
    const [materialId, setMaterialId] = useState<string>('');
    const [paperSizeId, setPaperSizeId] = useState<string>('');
    const [printType, setPrintType] = useState<string>('4c');
    const [printSide, setPrintSide] = useState<string>('double');
    const [itemWidth, setItemWidth] = useState<number>(90);
    const [itemHeight, setItemHeight] = useState<number>(54);
    const [gapH, setGapH] = useState<number>(2);
    const [gapV, setGapV] = useState<number>(2);
    const [shape, setShape] = useState<string>('rectangle');
    
    // Templates State
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateCode, setSelectedTemplateCode] = useState<string>('');
    const [productName, setProductName] = useState<string>('Báo giá In Nhanh Rời');

    // Whitelist filters (from product config)
    const [allowedMaterialIds, setAllowedMaterialIds] = useState<string[]>([]);
    const [allowedPaperSizeIds, setAllowedPaperSizeIds] = useState<string[]>([]);
    const [allowedProcessingIds, setAllowedProcessingIds] = useState<string[]>([]);
    const [allowedAccessoryIds, setAllowedAccessoryIds] = useState<string[]>([]);

    // Locks (from product config form_config): khoá mặt in / khoá hệ màu trên báo giá
    const [lockPrintSide, setLockPrintSide] = useState<boolean>(false);
    const [lockPrintType, setLockPrintType] = useState<boolean>(false);

    // Auto-fill from cart specifically for Edit flow hydration
    useEffect(() => {
        if (items.length > 0 && selectedTemplateCode === '' && templates.length > 0) {
            const firstItem = items[0];
            if (firstItem?.configParams?.templateCode) {
                setSelectedTemplateCode(firstItem.configParams.templateCode);
                setProductName(firstItem.name || 'Báo giá In Nhanh Rời');
                if (firstItem.quantity) setQuantity(firstItem.quantity);
                if (firstItem.configParams.width) setItemWidth(firstItem.configParams.width);
                if (firstItem.configParams.height) setItemHeight(firstItem.configParams.height);
                if (firstItem.type) setTab(firstItem.type as any);
            }
        }
    }, [items, templates, selectedTemplateCode]);

    // Processing Options selection
    const [selectedProcessing, setSelectedProcessing] = useState<{id: string, side: string, name: string}[]>([]);
    const [curProcId, setCurProcId] = useState<string>('');
    const [curProcSide, setCurProcSide] = useState<string>('single');

    // Accessories selection
    const [selectedAccessories, setSelectedAccessories] = useState<{id: string, qty: number, name: string}[]>([]);
    const [curAccId, setCurAccId] = useState<string>('');
    const [curAccQty, setCurAccQty] = useState<number>(1);

    // Large Format State
    const [lfQuantity, setLfQuantity] = useState<number>(1);
    const [lfMaterialId, setLfMaterialId] = useState<string>('');
    const [lfWidth, setLfWidth] = useState<number>(1000);
    const [lfHeight, setLfHeight] = useState<number>(1000);
    const [lfPrintType, setLfPrintType] = useState<string>('uv');
    const [lfSelectedProc, setLfSelectedProc] = useState<{id: string, name: string}[]>([]);
    const [lfCurProcId, setLfCurProcId] = useState<string>('');
    const [lfSelectedAcc, setLfSelectedAcc] = useState<{id: string, qty: number, name: string, price: number}[]>([]);
    const [lfCurAccId, setLfCurAccId] = useState<string>('');
    const [lfCurAccQty, setLfCurAccQty] = useState<number>(1);
    const [lfTemplateCode, setLfTemplateCode] = useState<string>('');

    // Bound State
    const [bQuantity, setBQuantity] = useState<number>(10);
    const [bPageCount, setBPageCount] = useState<number>(32);
    const [bBindingType, setBBindingType] = useState<string>('saddle_stitch');
    
    const [bCoverMaterialName, setBCoverMaterialName] = useState<string>('');
    const [bCoverMaterialId, setBCoverMaterialId] = useState<string>('');
    const [bCoverPaperSizeId, setBCoverPaperSizeId] = useState<string>('');
    const [bCoverPrintType, setBCoverPrintType] = useState<string>('4c');
    const [bCoverPrintSide, setBCoverPrintSide] = useState<string>('single');
    const [bCoverProc, setBCoverProc] = useState<{id: string, name: string, side: string, code?: string}[]>([]);
    
    const [bInnerMaterialName, setBInnerMaterialName] = useState<string>('');
    const [bInnerMaterialId, setBInnerMaterialId] = useState<string>('');
    const [bInnerPaperSizeId, setBInnerPaperSizeId] = useState<string>('');
    const [bInnerPrintType, setBInnerPrintType] = useState<string>('4c');
    const [bInnerPrintSide, setBInnerPrintSide] = useState<string>('double');
    const [bInnerProc, setBInnerProc] = useState<{id: string, name: string, side: string, code?: string}[]>([]);

    // Live Result & Auto Optimize
    const [pricingResult, setPricingResult] = useState<Record<string, unknown> | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [optimizedSizes, setOptimizedSizes] = useState<any[]>([]);

    useEffect(() => {
        if (!token) return;
        
        let pending = 2;
        const finalize = () => { pending--; if (pending === 0) setLoading(false); };

        fetch(`${API_URL}/pricing/master-data`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(res => {
            if (res.success) {
                setMasterData(res.data);
                // Set defaults
                if (Array.isArray(res.data.materials) && res.data.materials.length > 0) setMaterialId((res.data.materials[0] as {id: number}).id.toString());
            }
        })
        .catch(console.error)
        .finally(finalize);

        fetch(`${API_URL}/erp/quote-templates?action=list`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(res => {
            if (res.success && res.data && Array.isArray(res.data.categories)) {
                setTemplates(res.data.categories);
            }
        })
        .catch(console.error)
        .finally(finalize);
    }, [token]);

    // Auto Optimize Paper Sizes Hook
    useEffect(() => {
        if (!masterData?.paper_sizes || !masterData?.materials || !itemWidth || !itemHeight) return;
        
        // Calculate efficiency and item per sheets for ALL paper sizes
        const options = [];
        const mats = (masterData.materials as any[]) || [];
        const currentMat = mats.find(m => m.id.toString() === materialId);
        
        // Filter valid paper sizes exactly like legacy ERP
        const validMatsForThisFamily = mats.filter(m => {
            if (currentMat && m.name !== currentMat.name) return false;
            // Loose uses sheets, Large Format uses Rolls
            if (tab === 'loose' && m.material_type === 'roll') return false;
            if (tab === 'large_format' && m.material_type !== 'roll') return false;
            return m.paper_size_id; // must have a paper size mapped
        });
        
        // Deduplicate paper size IDs
        const validPaperSizeIds = new Set(validMatsForThisFamily.map(m => m.paper_size_id));
        
        for (const ps of (masterData.paper_sizes as any[])) {
            // Whitelist filter: CHỈ hiện khổ giấy nằm trong danh sách sản phẩm cho phép
            // (rỗng = không có khổ nào — đi đúng theo cài đặt, không fallback).
            if (!allowedPaperSizeIds.includes(String(ps.id))) continue;
            if (!validPaperSizeIds.has(ps.id) && validPaperSizeIds.size > 0 && currentMat) continue;
            
            // Fool-proof check against database misconfigurations where material_type isn't properly set
            const psName = (ps.name || '').toLowerCase();
            if (tab === 'loose' && (psName.includes('cuộn') || ps.roll_length > 0)) continue;
            if (tab === 'large_format' && !psName.includes('cuộn') && !ps.roll_length) continue;

            // In a real system, you might only suggest sizes valid for the selected material.
            // Here we evaluate all available general paper sizes for this material
            const w = parseFloat(ps.width_mm || ps.widthMm) || 0;
            const h = parseFloat(ps.height_mm || ps.heightMm) || 0;
            const ml = parseFloat(ps.margin_left || ps.marginLeft) || 0;
            const mr = parseFloat(ps.margin_right || ps.marginRight) || 0;
            const mt = parseFloat(ps.margin_top || ps.marginTop) || 0;
            const mb = parseFloat(ps.margin_bottom || ps.marginBottom) || 0;
            
            const usableW = w - ml - mr;
            const usableH = h - mt - mb;
            if (usableW <= 0 || usableH <= 0) continue;
            
            const itemW = itemWidth;
            const itemH = itemHeight;
            
            const cols1 = Math.floor((usableW + gapH) / (itemW + gapH));
            const rows1 = Math.floor((usableH + gapV) / (itemH + gapV));
            const fit1 = cols1 * rows1;
            
            const cols2 = Math.floor((usableW + gapH) / (itemH + gapH));
            const rows2 = Math.floor((usableH + gapV) / (itemW + gapV));
            const fit2 = cols2 * rows2;
            
            const itemsPerSheet = Math.max(fit1, fit2);
            if (itemsPerSheet > 0) {
                const effectiveQty = quantity > 0 ? quantity : 100;
                const sheets = Math.ceil(effectiveQty / itemsPerSheet);
                const area = w * h;
                const eff = Number(((itemsPerSheet * itemW * itemH) / area * 100).toFixed(1));
                options.push({ id: ps.id, name: ps.name, itemsPerSheet, sheets, eff });
            }
        }
        
        // Sort best efficiency
        options.sort((a,b) => b.eff - a.eff);
        setOptimizedSizes(options);
        
        // Auto select the most optimal size if none chosen or if currently selected is invalid
        if (options.length > 0 && (!paperSizeId || !options.find(o => o.id.toString() === paperSizeId))) {
            setPaperSizeId(options[0].id.toString());
        }
    }, [masterData, materialId, itemWidth, itemHeight, gapH, gapV, quantity, allowedPaperSizeIds]);

    const calculatePrice = useCallback(async () => {
        if (!token) return;
        
        // Map state UI → Đầu_Vào_Chuẩn_Hóa, rồi dựng payload bằng Lớp_Dựng_Payload DÙNG CHUNG
        let normalized: NormalizedInput;
        if (tab === 'loose') {
            if (!materialId || !paperSizeId) return;
            normalized = {
                product_type: 'loose',
                material_id: parseInt(materialId) || 0,
                paper_size_id: parseInt(paperSizeId) || undefined,
                quantity,
                item_width: { value: Number(itemWidth) || 0, unit: 'mm' },
                item_height: { value: Number(itemHeight) || 0, unit: 'mm' },
                gap_h: gapH,
                gap_v: gapV,
                print_side: printSide,
                print_type: printType,
                shape,
                processing: selectedProcessing.map(p => ({ id: Number(p.id), side: p.side })),
                accessories: selectedAccessories.map(a => ({ id: Number(a.id), qty: a.qty })),
                product_name: productName,
            };
        } else if (tab === 'large_format') {
            if (!lfMaterialId) return;
            normalized = {
                product_type: 'large_format',
                material_id: parseInt(String(lfMaterialId)) || 0,
                width: { value: Number(lfWidth) || 0, unit: 'mm' },
                height: { value: Number(lfHeight) || 0, unit: 'mm' },
                quantity: lfQuantity,
                print_type: lfPrintType,
                processing: lfSelectedProc.map(p => ({ id: (p as any).id != null ? Number((p as any).id) : undefined, name: p.name })),
                accessories: lfSelectedAcc.map(a => ({ id: Number(a.id), qty: a.qty, name: a.name, price: a.price })),
            };
        } else if (tab === 'bound') {
            if (!bCoverMaterialId || !bCoverPaperSizeId || !bInnerMaterialId || !bInnerPaperSizeId) return;
            normalized = {
                product_type: 'bound',
                quantity: bQuantity,
                page_count: bPageCount,
                binding_type: bBindingType,
                cover: {
                    material_id: parseInt(String(bCoverMaterialId)) || 0,
                    paper_size_id: parseInt(String(bCoverPaperSizeId)) || 0,
                    print_side: bCoverPrintSide,
                    print_type: bCoverPrintType,
                    processing: bCoverProc.map(p => ({ id: Number(p.id), side: p.side })),
                },
                inner: {
                    material_id: parseInt(String(bInnerMaterialId)) || 0,
                    paper_size_id: parseInt(String(bInnerPaperSizeId)) || 0,
                    print_side: bInnerPrintSide,
                    print_type: bInnerPrintType,
                    processing: bInnerProc.map(p => ({ id: Number(p.id), side: p.side })),
                },
                // inner.page_count = max(0, page_count - 4) do Lớp_Dựng_Payload tính
            };
        } else {
            return;
        }

        const payload = buildPricingPayload(normalized);
        // Gắn mã sản phẩm để backend kiểm tra whitelist (chống lách qua API). Chỉ khi đã chọn mẫu.
        if (selectedTemplateCode) (payload as any).product_code = selectedTemplateCode;

        setCalculating(true);
        try {
            const res = await fetch(`${API_URL}/pricing/calculate`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json().catch(() => ({}));
            const norm = readPricingResult(json);
            if (norm.ok) {
                setPricingResult(norm.raw as any);
            } else {
                setPricingResult({ error: norm.error || norm.reason || 'Tính giá thất bại' });
            }
        } catch (e: any) {
            setPricingResult({ error: e.message });
        } finally {
            setCalculating(false);
        }
    }, [
        token, tab,
        materialId, paperSizeId, quantity, itemWidth, itemHeight, gapH, gapV, printSide, printType, selectedProcessing, selectedAccessories, productName, shape, selectedTemplateCode,
        lfMaterialId, lfWidth, lfHeight, lfQuantity, lfPrintType, lfSelectedProc, lfSelectedAcc,
        bQuantity, bPageCount, bBindingType, bCoverMaterialId, bCoverPaperSizeId, bCoverPrintType, bCoverPrintSide, bInnerMaterialId, bInnerPaperSizeId, bInnerPrintType, bInnerPrintSide
    ]);

    const handleTemplateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        setSelectedTemplateCode(code);
        if (!code || !token) return;
        
        try {
            const res = await fetch(`${API_URL}/quote-templates/defaults?code=${code}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.template_name) setProductName(data.template_name);
            if (data.form_config?.item_width) setItemWidth(Number(data.form_config.item_width));
            if (data.form_config?.item_height) setItemHeight(Number(data.form_config.item_height));
            if (data.form_config?.shape) setShape(data.form_config.shape);

            // Khoá mặt in / hệ màu + áp giá trị mặc định (đi đúng theo cài đặt sản phẩm)
            const fc = data.form_config || {};
            setLockPrintSide(!!fc.lock_print_side);
            setLockPrintType(!!fc.lock_print_type);
            if (fc.default_print_side) setPrintSide(fc.default_print_side);
            if (fc.default_print_type) setPrintType(fc.default_print_type);
            if (fc.default_quantity) setQuantity(Number(fc.default_quantity));

            // Apply whitelist filters
            setAllowedMaterialIds(data.allowed_materials || []);
            setAllowedPaperSizeIds(data.allowed_paper_sizes || []);
            setAllowedProcessingIds(data.allowed_processing || []);
            setAllowedAccessoryIds(data.allowed_accessories || []);

            // Áp khổ giấy mặc định của sản phẩm (nếu có) — optimizer giữ lại nếu hợp lệ
            if (fc.default_paper_size_id) setPaperSizeId(String(fc.default_paper_size_id));

            // Apply default material — ưu tiên default_material_id của sản phẩm, rồi material_filter, rồi allowed[0]
            if (fc.default_material_id) {
                setMaterialId(String(fc.default_material_id));
            } else if (data.material_filter) {
                const matKeys = Object.keys(data.material_filter);
                if (matKeys.length > 0) {
                    const firstMatCode = matKeys[0];
                    const mats = (masterData?.materials as any[]) || [];
                    const foundMat = mats.find(m => m.code === firstMatCode || m.name === data.material_filter[firstMatCode].name);
                    if (foundMat) {
                        setMaterialId(foundMat.id.toString());
                    }
                }
            } else if (data.allowed_materials?.length) {
                // Auto-select first allowed material if no specific default
                setMaterialId(data.allowed_materials[0]);
            }
            if (data.finishing) {
                setSelectedProcessing([]); // Reset for now to avoid invalid mappings
            }
        } catch (err) {
            console.error('Failed to fetch template defaults', err);
        }
    };

    // Live update on changes
    useEffect(() => {
        const timeout = setTimeout(() => {
            calculatePrice();
        }, 300);
        return () => clearTimeout(timeout);
    }, [calculatePrice]);

    return {
        tab, setTab,
        masterData, loading,
        items, addItem, fileName, setFileName,
        quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, setTemplates, selectedTemplateCode, setSelectedTemplateCode, productName, setProductName,
        allowedMaterialIds, allowedPaperSizeIds, allowedProcessingIds,
        allowedAccessoryIds,
        lockPrintSide, lockPrintType,
        selectedProcessing, setSelectedProcessing, curProcId, setCurProcId, curProcSide, setCurProcSide,
        selectedAccessories, setSelectedAccessories, curAccId, setCurAccId, curAccQty, setCurAccQty,
        lfQuantity, setLfQuantity, lfMaterialId, setLfMaterialId, lfWidth, setLfWidth, lfHeight, setLfHeight, lfPrintType, setLfPrintType, lfSelectedProc, setLfSelectedProc, lfCurProcId, setLfCurProcId, lfSelectedAcc, setLfSelectedAcc, lfCurAccId, setLfCurAccId, lfCurAccQty, setLfCurAccQty, lfTemplateCode, setLfTemplateCode,
        bQuantity, setBQuantity, bPageCount, setBPageCount, bBindingType, setBBindingType,
        bCoverMaterialName, setBCoverMaterialName, bCoverMaterialId, setBCoverMaterialId, bCoverPaperSizeId, setBCoverPaperSizeId, bCoverPrintType, setBCoverPrintType, bCoverPrintSide, setBCoverPrintSide, bCoverProc, setBCoverProc,
        bInnerMaterialName, setBInnerMaterialName, bInnerMaterialId, setBInnerMaterialId, bInnerPaperSizeId, setBInnerPaperSizeId, bInnerPrintType, setBInnerPrintType, bInnerPrintSide, setBInnerPrintSide, bInnerProc, setBInnerProc,
        pricingResult, calculating, optimizedSizes, handleTemplateChange
    };
}
