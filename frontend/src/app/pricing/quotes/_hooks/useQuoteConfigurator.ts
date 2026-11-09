import { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { buildPricingPayload, type NormalizedInput } from '@/lib/quote/buildPricingPayload';
import { readPricingResult } from '@/lib/quote/readPricingResult';
import { useQuoteCart } from '../_store/useQuoteCart';
import { calculateGridLayout, calculateStaggeredLayout } from '../_utils/layout-engine';

export function useQuoteConfigurator(token: string | null, activeTab?: 'loose' | 'bound' | 'large_format', onTabChange?: (tab: 'loose' | 'bound' | 'large_format') => void) {
    const [_internalTab, _setInternalTab] = useState<'loose' | 'bound' | 'large_format'>('loose');
    const tab = activeTab ?? _internalTab;
    const setTab = onTabChange ?? _setInternalTab;
    const [masterData, setMasterData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    
    // UI Cart Context
    const { addItem, updateItem, editingItemId = null, setEditingItemId, items } = useQuoteCart();
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
    const [minQuantity, setMinQuantity] = useState<number>(1);
    const [maxQuantity, setMaxQuantity] = useState<number | undefined>(undefined);

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
    const [bWidth, setBWidth] = useState<number>(210);
    const [bHeight, setBHeight] = useState<number>(297);
    const [bSpineWidth, setBSpineWidth] = useState<number>(0);
    
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
    const [bSelectedAcc, setBSelectedAcc] = useState<{id: string, qty: number, name: string}[]>([]);
    const [bCurAccId, setBCurAccId] = useState<string>('');
    const [bCurAccQty, setBCurAccQty] = useState<number>(1);

    // Live Result & Auto Optimize
    const [pricingResult, setPricingResult] = useState<Record<string, unknown> | null>(null);
    // Payload GỐC của lần tính giá gần nhất (đồng bộ pricingResult) — để lưu kèm item.
    const [lastPricingPayload, setLastPricingPayload] = useState<Record<string, unknown> | null>(null);
    const [calculating, setCalculating] = useState(false);
    const [optimizedSizes, setOptimizedSizes] = useState<any[]>([]);
    /** Số thứ tự lần tính giá gần nhất — chỉ response của lần MỚI NHẤT được ghi vào state. */
    const calcSeqRef = useRef(0);
    const prefillSearchRef = useRef<string>(typeof window !== 'undefined' ? window.location.search : '');

    useEffect(() => {
        if (!token) return;
        
        let pending = 2;
        const finalize = () => { pending--; if (pending === 0) setLoading(false); };

        const apiFetch = (path: string) =>
            fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(async (r) => {
                    if (!r.ok) {
                        const text = await r.text().catch(() => '');
                        throw new Error(`${path} → HTTP ${r.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
                    }
                    return r.json();
                });

        apiFetch('/pricing/master-data')
        .then(res => {
            if (res.success) {
                setMasterData(res.data);
                // Set defaults
                if (Array.isArray(res.data.materials) && res.data.materials.length > 0) {
                    const mats = res.data.materials as any[];
                    const looseMat = mats.find(m => m.scopeLoose || m.scope_loose == 1) || mats[0];
                    if (looseMat) setMaterialId(prev => prev || String(looseMat.id));
                    const lfMat = mats.find(m => m.scopeLargeFormat || m.scope_large_format == 1);
                    if (lfMat) setLfMaterialId(prev => prev || String(lfMat.id));
                    const boundMatsList = mats.filter(m => m.scopeBound || m.scope_bound == 1);
                    if (boundMatsList.length > 0) {
                        const cMat = boundMatsList[0];
                        const iMat = boundMatsList[1] || boundMatsList[0];
                        const defaultPsId = String((res.data.paper_sizes as any[])?.find((p: any) => p.scopeBound || p.scope_bound == 1)?.id || (res.data.paper_sizes as any[])?.[0]?.id || '');
                        setBCoverMaterialName(prev => prev || cMat.name || '');
                        setBCoverMaterialId(prev => prev || String(cMat.id));
                        setBCoverPaperSizeId(prev => prev || String(cMat.paper_size_id || cMat.paperSizeId || defaultPsId));
                        setBInnerMaterialName(prev => prev || iMat.name || '');
                        setBInnerMaterialId(prev => prev || String(iMat.id));
                        setBInnerPaperSizeId(prev => prev || String(iMat.paper_size_id || iMat.paperSizeId || defaultPsId));
                    }
                }
            }
        })
        .catch((err) => {
            console.error('[useQuoteConfigurator] master-data failed', {
                API_URL,
                pageOrigin: typeof window !== 'undefined' ? window.location.origin : '',
                err,
            });
        })
        .finally(finalize);

        apiFetch('/erp/quote-templates?action=list')
        .then(res => {
            if (res.success && res.data && Array.isArray(res.data.categories)) {
                setTemplates(res.data.categories);
            }
        })
        .catch((err) => {
            console.error('[useQuoteConfigurator] quote-templates failed', {
                API_URL,
                pageOrigin: typeof window !== 'undefined' ? window.location.origin : '',
                err,
            });
        })
        .finally(finalize);
    }, [token]);

    const applyTemplateCode = useCallback(async (code: string) => {
        setSelectedTemplateCode(code);
        if (!code) {
            setAllowedMaterialIds([]);
            setAllowedPaperSizeIds([]);
            setAllowedProcessingIds([]);
            setAllowedAccessoryIds([]);
            setLockPrintSide(false);
            setLockPrintType(false);
            setMinQuantity(1);
            setMaxQuantity(undefined);
            return;
        }
        if (!token) return;

        try {
            const res = await fetch(`${API_URL}/quote-templates/defaults?code=${code}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();

            if (data.template_name) {
                setProductName(data.template_name);
                setFileName(prev => (!prev || prev === productName) ? data.template_name : prev);
            }
            if (data.form_config?.item_width) { setItemWidth(Number(data.form_config.item_width)); setBWidth(Number(data.form_config.item_width)); setLfWidth(Number(data.form_config.item_width)); }
            if (data.form_config?.item_height) { setItemHeight(Number(data.form_config.item_height)); setBHeight(Number(data.form_config.item_height)); setLfHeight(Number(data.form_config.item_height)); }
            if (data.form_config?.shape) setShape(data.form_config.shape);

            // Khoá mặt in / hệ màu + áp giá trị mặc định (đi đúng theo cài đặt sản phẩm)
            const fc = data.form_config || {};
            setLockPrintSide(!!fc.lock_print_side);
            setLockPrintType(!!fc.lock_print_type);
            const nextMinQty = Math.max(1, Number(fc.min_quantity) || 1);
            const nextMaxQty = Number(fc.max_quantity) > 0 ? Number(fc.max_quantity) : undefined;
            setMinQuantity(nextMinQty);
            setMaxQuantity(nextMaxQty);
            if (fc.default_print_side) {
                setPrintSide(fc.default_print_side);
                setBCoverPrintSide(fc.default_print_side);
                setBInnerPrintSide(fc.default_print_side);
            }
            if (fc.default_print_type) {
                setPrintType(fc.default_print_type);
                setBCoverPrintType(fc.default_print_type);
                setBInnerPrintType(fc.default_print_type);
                setLfPrintType(fc.default_print_type);
            }
            if (fc.default_quantity) {
                const defQ = Math.max(nextMinQty, Number(fc.default_quantity) || nextMinQty);
                setQuantity(defQ);
                setBQuantity(defQ);
                setLfQuantity(defQ);
            } else if (nextMinQty > 1) {
                setQuantity(prev => Math.max(nextMinQty, prev));
                setBQuantity(prev => Math.max(nextMinQty, prev));
                setLfQuantity(prev => Math.max(nextMinQty, prev));
            }
            // Apply whitelist filters
            const newAllowedMats = (data.allowed_materials || []).map(String);
            const newAllowedPapers = (data.allowed_paper_sizes || []).map(String);
            const newAllowedProcs = (data.allowed_processing || []).map(String);
            const newAllowedAccs = (data.allowed_accessories || []).map(String);
            setAllowedMaterialIds(newAllowedMats);
            setAllowedPaperSizeIds(newAllowedPapers);
            setAllowedProcessingIds(newAllowedProcs);
            setAllowedAccessoryIds(newAllowedAccs);

            // Chọn vật tư mặc định cho sản phẩm mới — ưu tiên default_material_id, rồi material_filter, rồi allowed[0].
            let nextMaterialId: string | null = null;
            if (fc.default_material_id) {
                nextMaterialId = String(fc.default_material_id);
            } else if (data.material_filter) {
                const matKeys = Object.keys(data.material_filter);
                if (matKeys.length > 0) {
                    const firstMatCode = matKeys[0];
                    const mats = (masterData?.materials as any[]) || [];
                    const foundMat = mats.find(m => m.code === firstMatCode || m.name === data.material_filter[firstMatCode].name);
                    if (foundMat) nextMaterialId = foundMat.id.toString();
                }
            } else if (newAllowedMats.length) {
                nextMaterialId = newAllowedMats[0];
            }

            // Khổ giấy mặc định của sản phẩm (nếu có).
            const nextPaperSizeId = fc.default_paper_size_id ? String(fc.default_paper_size_id) : null;

            // PRUNE lựa chọn cũ theo whitelist MỚI
            setMaterialId(prev => {
                if (nextMaterialId && newAllowedMats.includes(nextMaterialId)) return nextMaterialId;
                if (nextMaterialId && !newAllowedMats.length) return nextMaterialId;
                return newAllowedMats.length === 0 || newAllowedMats.includes(prev) ? prev : '';
            });
            setPaperSizeId(prev => {
                if (nextPaperSizeId && (newAllowedPapers.length === 0 || newAllowedPapers.includes(nextPaperSizeId))) return nextPaperSizeId;
                return newAllowedPapers.length === 0 || newAllowedPapers.includes(prev) ? prev : '';
            });
            setSelectedProcessing(prev => newAllowedProcs.length === 0 ? prev : prev.filter(p => newAllowedProcs.includes(String(p.id))));
            setSelectedAccessories(prev => newAllowedAccs.length === 0 ? prev : prev.filter(a => newAllowedAccs.includes(String(a.id))));

            const pruneId = (prev: string, allowed: string[]) => allowed.length === 0 || allowed.includes(prev) ? prev : '';
            setLfMaterialId(prev => pruneId(prev, newAllowedMats));
            setLfSelectedProc(prev => newAllowedProcs.length === 0 ? prev : prev.filter(p => newAllowedProcs.includes(String(p.id))));
            setLfSelectedAcc(prev => newAllowedAccs.length === 0 ? prev : prev.filter(a => newAllowedAccs.includes(String(a.id))));
            setBCoverMaterialId(prev => pruneId(prev, newAllowedMats));
            setBCoverPaperSizeId(prev => pruneId(prev, newAllowedPapers));
            setBCoverProc(prev => newAllowedProcs.length === 0 ? prev : prev.filter(p => newAllowedProcs.includes(String(p.id))));
            setBInnerMaterialId(prev => pruneId(prev, newAllowedMats));
            setBInnerPaperSizeId(prev => (nextPaperSizeId && (newAllowedPapers.length === 0 || newAllowedPapers.includes(nextPaperSizeId))) ? nextPaperSizeId : (newAllowedPapers.length === 0 || newAllowedPapers.includes(prev) ? prev : (newAllowedPapers[0] || '')));
            if (nextMaterialId && (newAllowedMats.length === 0 || newAllowedMats.includes(nextMaterialId))) {
                setLfMaterialId(nextMaterialId);
                setBCoverMaterialId(nextMaterialId);
                setBInnerMaterialId(newAllowedMats.length > 1 ? newAllowedMats[1] : nextMaterialId);
                const allMats = (masterData?.materials as any[]) || [];
                const cMat = allMats.find(m => String(m.id) === String(nextMaterialId));
                const iMat = allMats.find(m => String(m.id) === String(newAllowedMats.length > 1 ? newAllowedMats[1] : nextMaterialId)) || cMat;
                if (cMat?.name) setBCoverMaterialName(cMat.name);
                if (iMat?.name) setBInnerMaterialName(iMat.name);
                const cMatPs = cMat?.paper_size_id || cMat?.paperSizeId;
                const iMatPs = iMat?.paper_size_id || iMat?.paperSizeId;
                if (!nextPaperSizeId && cMatPs) setBCoverPaperSizeId(String(cMatPs));
                if (!nextPaperSizeId && iMatPs) setBInnerPaperSizeId(String(iMatPs));
            }
            if (nextPaperSizeId && (newAllowedPapers.length === 0 || newAllowedPapers.includes(nextPaperSizeId))) {
                setBCoverPaperSizeId(nextPaperSizeId);
            } else if (newAllowedPapers.length > 0) {
                setBCoverPaperSizeId(prev => newAllowedPapers.includes(prev) ? prev : newAllowedPapers[0]);
            }
            setBSelectedAcc(prev => newAllowedAccs.length === 0 ? prev : prev.filter(a => newAllowedAccs.includes(String(a.id))));
        } catch (err) {
            console.error('Failed to fetch template defaults', err);
        }
    }, [token, masterData]);

    // [MQ-07] Hydrate đầy đủ cấu hình bàn giao từ Báo giá Mini (Inbox) qua URL query params
    useEffect(() => {
        if (!token || !masterData || !prefillSearchRef.current) return;
        const sp = new URLSearchParams(prefillSearchRef.current);
        if (sp.get('edit')) return;
        const tpl = sp.get('prefill_template');
        if (!tpl) return;

        prefillSearchRef.current = '';
        try { window.history.replaceState(null, '', window.location.pathname); } catch { /* noop */ }

        (async () => {
            await applyTemplateCode(tpl);

            const pTab = sp.get('prefill_tab') as 'loose' | 'bound' | 'large_format' | null;
            if (pTab && ['loose', 'bound', 'large_format'].includes(pTab)) setTab(pTab);

            const pName = sp.get('prefill_name');
            if (pName) {
                setProductName(pName);
                setFileName(pName);
            }

            const pQty = parseInt(sp.get('prefill_qty') || '0');
            if (pQty > 0) {
                setQuantity(pQty);
                setBQuantity(pQty);
                setLfQuantity(pQty);
            }

            const pW = parseFloat(sp.get('prefill_w') || '0');
            const pH = parseFloat(sp.get('prefill_h') || '0');
            if (pW > 0) { setItemWidth(pW); setBWidth(pW); setLfWidth(pW); }
            if (pH > 0) { setItemHeight(pH); setBHeight(pH); setLfHeight(pH); }

            const pMat = sp.get('prefill_mat');
            if (pMat) {
                setMaterialId(pMat);
                setLfMaterialId(pMat);
            }
            const pPs = sp.get('prefill_ps');
            if (pPs) setPaperSizeId(pPs);
            const pSide = sp.get('prefill_side');
            if (pSide) setPrintSide(pSide);
            const pType = sp.get('prefill_type');
            if (pType) { setPrintType(pType); setLfPrintType(pType); }
            const pShape = sp.get('prefill_shape');
            if (pShape) setShape(pShape);

            // Bound-specific overrides
            const pPages = parseInt(sp.get('prefill_pages') || '0');
            if (pPages > 0) setBPageCount(pPages);
            const pBinding = sp.get('prefill_binding');
            if (pBinding) setBBindingType(pBinding);

            const allMats = (masterData.materials as any[]) || [];
            const pCoverMat = sp.get('prefill_cover_mat');
            if (pCoverMat) {
                setBCoverMaterialId(pCoverMat);
                const found = allMats.find(m => String(m.id) === pCoverMat);
                if (found?.name) setBCoverMaterialName(found.name);
                if (found?.paper_size_id || found?.paperSizeId) setBCoverPaperSizeId(String(found.paper_size_id || found.paperSizeId));
            }
            const pInnerMat = sp.get('prefill_inner_mat');
            if (pInnerMat) {
                setBInnerMaterialId(pInnerMat);
                const found = allMats.find(m => String(m.id) === pInnerMat);
                if (found?.name) setBInnerMaterialName(found.name);
                if (found?.paper_size_id || found?.paperSizeId) setBInnerPaperSizeId(String(found.paper_size_id || found.paperSizeId));
            }

            // Processing & Accessories overrides
            const allProcs = (masterData.processing_options as any[]) || [];
            const pProcStr = sp.get('prefill_proc');
            if (pProcStr) {
                const entries = pProcStr.split(',').map(s => s.trim()).filter(Boolean);
                const looseProcs: { id: string; side: string; name: string }[] = [];
                const coverProcs: { id: string; name: string; side: string; code?: string }[] = [];
                const innerProcs: { id: string; name: string; side: string; code?: string }[] = [];
                const lfProcs: { id: string; name: string }[] = [];
                for (const entry of entries) {
                    const [idStr, sideStr = 'single', secStr = 'cover'] = entry.split(':');
                    const found = allProcs.find(p => String(p.id) === idStr);
                    if (found) {
                        looseProcs.push({ id: String(found.id), side: sideStr, name: found.name });
                        lfProcs.push({ id: String(found.id), name: found.name });
                        const boundSide = sideStr === 'double' ? '2' : '1';
                        if (secStr === 'inner') {
                            innerProcs.push({ id: String(found.id), name: found.name, side: boundSide, code: found.code });
                        } else {
                            coverProcs.push({ id: String(found.id), name: found.name, side: boundSide, code: found.code });
                        }
                    }
                }
                if (looseProcs.length > 0) setSelectedProcessing(looseProcs);
                if (lfProcs.length > 0) setLfSelectedProc(lfProcs);
                if (coverProcs.length > 0) setBCoverProc(coverProcs);
                if (innerProcs.length > 0) setBInnerProc(innerProcs);
            }

            const allAccs = (masterData.accessories as any[]) || [];
            const pAccStr = sp.get('prefill_acc');
            if (pAccStr) {
                const entries = pAccStr.split(',').map(s => s.trim()).filter(Boolean);
                const accList: { id: string; qty: number; name: string; price: number }[] = [];
                for (const entry of entries) {
                    const [idStr, qtyStr = '1'] = entry.split(':');
                    const found = allAccs.find(a => String(a.id) === idStr);
                    if (found) {
                        accList.push({
                            id: String(found.id),
                            qty: parseInt(qtyStr) || 1,
                            name: found.name,
                            price: Number(found.unitPrice || found.unit_price || found.price) || 0,
                        });
                    }
                }
                if (accList.length > 0) {
                    setSelectedAccessories(accList.map(({ id, qty, name }) => ({ id, qty, name })));
                    setBSelectedAcc(accList.map(({ id, qty, name }) => ({ id, qty, name })));
                    setLfSelectedAcc(accList);
                }
            }
        })();
    }, [token, masterData, applyTemplateCode, setTab]);

    // Auto-fill from cart specifically for Edit flow hydration
    useEffect(() => {
        if (items.length > 0 && selectedTemplateCode === '' && templates.length > 0 && masterData) {
            const firstItem = items[0];
            if (firstItem?.configParams?.templateCode) {
                (async () => {
                    await applyTemplateCode(firstItem.configParams.templateCode);
                    setProductName(firstItem.name || 'Báo giá In Nhanh Rời');
                    if (firstItem.quantity) setQuantity(firstItem.quantity);
                    if (firstItem.configParams.width) setItemWidth(firstItem.configParams.width);
                    if (firstItem.configParams.height) setItemHeight(firstItem.configParams.height);
                    if (firstItem.type) setTab(firstItem.type as any);
                })();
            }
        }
    }, [items, templates, selectedTemplateCode, masterData, applyTemplateCode, setTab]);

    // Nạp ngược cấu hình hạng mục từ giỏ hàng khi bấm "Sửa" trên thẻ hạng mục ở sidebar trái
    useEffect(() => {
        if (!editingItemId) return;
        const item = items.find(i => i.id === editingItemId);
        if (!item) return;
        const cp = item.configParams || {};
        if (item.type === 'loose' || item.type === 'bound' || item.type === 'large_format') {
            setTab(item.type);
        }
        setFileName(item.name || '');
        if (item.type === 'loose') {
            if (item.quantity) setQuantity(Number(item.quantity));
            if (cp.materialId) setMaterialId(String(cp.materialId));
            if (cp.paperSizeId) setPaperSizeId(String(cp.paperSizeId));
            if (cp.itemWidth) setItemWidth(Number(cp.itemWidth));
            if (cp.itemHeight) setItemHeight(Number(cp.itemHeight));
            if (cp.gapH != null) setGapH(Number(cp.gapH));
            if (cp.gapV != null) setGapV(Number(cp.gapV));
            if (cp.shape) setShape(String(cp.shape));
            if (cp.printType) setPrintType(String(cp.printType));
            if (cp.printSide) setPrintSide(String(cp.printSide));
            if (Array.isArray(cp.selectedProcessing)) setSelectedProcessing(cp.selectedProcessing);
            if (Array.isArray(cp.selectedAccessories)) setSelectedAccessories(cp.selectedAccessories);
        } else if (item.type === 'bound') {
            if (cp.bQuantity || item.quantity) setBQuantity(Number(cp.bQuantity || item.quantity));
            if (cp.bPageCount) setBPageCount(Number(cp.bPageCount));
            if (cp.bBindingType) setBBindingType(String(cp.bBindingType));
            if (cp.bWidth) setBWidth(Number(cp.bWidth));
            if (cp.bHeight) setBHeight(Number(cp.bHeight));
            if (cp.bSpineWidth != null) setBSpineWidth(Number(cp.bSpineWidth));
            if (cp.bCoverMaterialName) setBCoverMaterialName(String(cp.bCoverMaterialName));
            if (cp.bCoverMaterialId) setBCoverMaterialId(String(cp.bCoverMaterialId));
            if (cp.bCoverPaperSizeId) setBCoverPaperSizeId(String(cp.bCoverPaperSizeId));
            if (cp.bCoverPrintType) setBCoverPrintType(String(cp.bCoverPrintType));
            if (cp.bCoverPrintSide) setBCoverPrintSide(String(cp.bCoverPrintSide));
            if (Array.isArray(cp.bCoverProc)) setBCoverProc(cp.bCoverProc);
            if (cp.bInnerMaterialName) setBInnerMaterialName(String(cp.bInnerMaterialName));
            if (cp.bInnerMaterialId) setBInnerMaterialId(String(cp.bInnerMaterialId));
            if (cp.bInnerPaperSizeId) setBInnerPaperSizeId(String(cp.bInnerPaperSizeId));
            if (cp.bInnerPrintType) setBInnerPrintType(String(cp.bInnerPrintType));
            if (cp.bInnerPrintSide) setBInnerPrintSide(String(cp.bInnerPrintSide));
            if (Array.isArray(cp.bInnerProc)) setBInnerProc(cp.bInnerProc);
            if (Array.isArray(cp.bSelectedAcc)) setBSelectedAcc(cp.bSelectedAcc);
        } else if (item.type === 'large_format') {
            if (item.quantity) setLfQuantity(Number(item.quantity));
            if (cp.lfMaterialId) setLfMaterialId(String(cp.lfMaterialId));
            if (cp.lfWidth) setLfWidth(Number(cp.lfWidth));
            if (cp.lfHeight) setLfHeight(Number(cp.lfHeight));
            if (cp.lfPrintType) setLfPrintType(String(cp.lfPrintType));
            if (Array.isArray(cp.lfSelectedProc)) setLfSelectedProc(cp.lfSelectedProc);
            if (Array.isArray(cp.lfSelectedAcc)) setLfSelectedAcc(cp.lfSelectedAcc);
        }
    }, [editingItemId, items, setTab]);

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
            // [MQ-05] Whitelist filter: chỉ lọc khi sản phẩm có cấu hình danh sách khổ giấy (length > 0)
            if (allowedPaperSizeIds.length > 0 && !allowedPaperSizeIds.includes(String(ps.id))) continue;
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
            
            const layout = shape === 'round' || shape === 'circle' ? calculateStaggeredLayout(w, h, ml, mr, mt, mb, itemW, itemH, gapH, gapV) : calculateGridLayout(w, h, ml, mr, mt, mb, itemW, itemH, gapH, gapV);
            const itemsPerSheet = layout.itemsPerSheet || Math.max(fit1, fit2);
            if (itemsPerSheet > 0) {
                const effectiveQty = quantity > 0 ? quantity : 100;
                const sheets = Math.ceil(effectiveQty / itemsPerSheet);
                const area = w * h;
                const eff = layout.efficiency || Number(((itemsPerSheet * itemW * itemH) / area * 100).toFixed(1));
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
    }, [masterData, materialId, itemWidth, itemHeight, gapH, gapV, quantity, allowedPaperSizeIds, selectedTemplateCode, shape]);

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
                item_width: bWidth > 0 ? { value: bWidth, unit: 'mm' } : undefined,
                item_height: bHeight > 0 ? { value: bHeight, unit: 'mm' } : undefined,
                spine_width: bSpineWidth > 0 ? { value: bSpineWidth, unit: 'mm' } : undefined,
                cover: {
                    material_id: parseInt(String(bCoverMaterialId)) || 0,
                    paper_size_id: parseInt(String(bCoverPaperSizeId)) || 0,
                    print_side: bCoverPrintSide,
                    print_type: bCoverPrintType,
                    processing: bCoverProc.map(p => ({ id: Number(p.id), side: p.side, ...(p.code ? { code: p.code } : {}) })),
                },
                inner: {
                    material_id: parseInt(String(bInnerMaterialId)) || 0,
                    paper_size_id: parseInt(String(bInnerPaperSizeId)) || 0,
                    print_side: bInnerPrintSide,
                    print_type: bInnerPrintType,
                    processing: bInnerProc.map(p => ({ id: Number(p.id), side: p.side, ...(p.code ? { code: p.code } : {}) })),
                },
                // inner.page_count = max(0, page_count - 4) do Lớp_Dựng_Payload tính
                accessories: bSelectedAcc.map(a => ({ id: Number(a.id), qty: a.qty })),
            };
        } else {
            return;
        }

        const payload = buildPricingPayload(normalized);
        // Gắn mã sản phẩm để backend kiểm tra whitelist (chống lách qua API). Chỉ khi đã chọn mẫu.
        if (selectedTemplateCode) (payload as any).product_code = selectedTemplateCode;

        // CHỐNG ĐUA REQUEST (audit 2026-07-25) — VÙNG TIỀN.
        const seq = ++calcSeqRef.current;
        const isStale = () => seq !== calcSeqRef.current;

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
            if (isStale()) return; // đã có lần tính mới hơn → bỏ kết quả này
            const norm = readPricingResult(json);
            if (norm.ok) {
                setPricingResult(norm.raw as any);
                // Lưu payload GỐC (đồng bộ với kết quả) để THÊM VÀO BÁO GIÁ → backend replay xác thực giá.
                setLastPricingPayload(payload);
            } else {
                setPricingResult({ error: norm.error || norm.reason || 'Tính giá thất bại' });
            }
        } catch (e: any) {
            if (!isStale()) setPricingResult({ error: e.message });
        } finally {
            if (!isStale()) setCalculating(false);
        }
    }, [
        token, tab,
        materialId, paperSizeId, quantity, itemWidth, itemHeight, gapH, gapV, printSide, printType, selectedProcessing, selectedAccessories, productName, shape, selectedTemplateCode,
        lfMaterialId, lfWidth, lfHeight, lfQuantity, lfPrintType, lfSelectedProc, lfSelectedAcc,
        bQuantity, bPageCount, bBindingType, bWidth, bHeight, bSpineWidth, bCoverMaterialId, bCoverPaperSizeId, bCoverPrintType, bCoverPrintSide, bCoverProc, bInnerMaterialId, bInnerPaperSizeId, bInnerPrintType, bInnerPrintSide, bInnerProc, bSelectedAcc
    ]);

    const handleTemplateChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const code = e.target.value;
        await applyTemplateCode(code);
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
        items, addItem, updateItem, editingItemId, setEditingItemId, fileName, setFileName,
        quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, setTemplates, selectedTemplateCode, setSelectedTemplateCode, productName, setProductName,
        allowedMaterialIds, allowedPaperSizeIds, allowedProcessingIds,
        allowedAccessoryIds,
        lockPrintSide, lockPrintType, minQuantity, maxQuantity,
        selectedProcessing, setSelectedProcessing, curProcId, setCurProcId, curProcSide, setCurProcSide,
        selectedAccessories, setSelectedAccessories, curAccId, setCurAccId, curAccQty, setCurAccQty,
        lfQuantity, setLfQuantity, lfMaterialId, setLfMaterialId, lfWidth, setLfWidth, lfHeight, setLfHeight, lfPrintType, setLfPrintType, lfSelectedProc, setLfSelectedProc, lfCurProcId, setLfCurProcId, lfSelectedAcc, setLfSelectedAcc, lfCurAccId, setLfCurAccId, lfCurAccQty, setLfCurAccQty, lfTemplateCode, setLfTemplateCode,
        bQuantity, setBQuantity, bPageCount, setBPageCount, bBindingType, setBBindingType, bWidth, setBWidth, bHeight, setBHeight, bSpineWidth, setBSpineWidth,
        bCoverMaterialName, setBCoverMaterialName, bCoverMaterialId, setBCoverMaterialId, bCoverPaperSizeId, setBCoverPaperSizeId, bCoverPrintType, setBCoverPrintType, bCoverPrintSide, setBCoverPrintSide, bCoverProc, setBCoverProc,
        bInnerMaterialName, setBInnerMaterialName, bInnerMaterialId, setBInnerMaterialId, bInnerPaperSizeId, setBInnerPaperSizeId, bInnerPrintType, setBInnerPrintType, bInnerPrintSide, setBInnerPrintSide, bInnerProc, setBInnerProc,
        bSelectedAcc, setBSelectedAcc, bCurAccId, setBCurAccId, bCurAccQty, setBCurAccQty,
        pricingResult, lastPricingPayload, calculating, optimizedSizes, handleTemplateChange
    };
}
