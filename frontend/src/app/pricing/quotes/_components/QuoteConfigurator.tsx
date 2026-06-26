'use client';

import { LooseForm } from './forms/LooseForm';
import { BoundForm } from './forms/BoundForm';
import { LargeFormatForm } from './forms/LargeFormatForm';
import { useState, useEffect, useCallback } from 'react';
import { calculateGridLayout, calculateStaggeredLayout } from '../_utils/layout-engine';
import { PreviewLayoutSVG } from './PreviewLayoutSVG';
import { useQuoteCart } from '../_store/useQuoteCart';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';
import SearchableSelect from '../../../../components/SearchableSelect';
import { API_URL } from '@/lib/api';

export function QuoteConfigurator({ token, activeTab, onTabChange }: { token: string | null; activeTab?: 'loose' | 'bound' | 'large_format'; onTabChange?: (tab: 'loose' | 'bound' | 'large_format') => void }) {
    const quoteState = useQuoteConfigurator(token, activeTab, onTabChange);
    const {
        tab, setTab,
        masterData, loading,
        items, addItem, fileName, setFileName,
        quantity, setQuantity, materialId, setMaterialId, paperSizeId, setPaperSizeId, printType, setPrintType, printSide, setPrintSide, itemWidth, setItemWidth, itemHeight, setItemHeight, gapH, setGapH, gapV, setGapV, shape, setShape,
        templates, setTemplates, selectedTemplateCode, setSelectedTemplateCode, productName, setProductName,
        allowedMaterialIds, allowedPaperSizeIds, allowedProcessingIds,
        selectedProcessing, setSelectedProcessing, curProcId, setCurProcId, curProcSide, setCurProcSide,
        selectedAccessories, setSelectedAccessories, curAccId, setCurAccId, curAccQty, setCurAccQty,
        lfQuantity, setLfQuantity, lfMaterialId, setLfMaterialId, lfWidth, setLfWidth, lfHeight, setLfHeight, lfPrintType, setLfPrintType, lfSelectedProc, setLfSelectedProc, lfCurProcId, setLfCurProcId, lfSelectedAcc, setLfSelectedAcc, lfCurAccId, setLfCurAccId, lfCurAccQty, setLfCurAccQty, lfTemplateCode, setLfTemplateCode,
        bQuantity, setBQuantity, bPageCount, setBPageCount, bBindingType, setBBindingType,
        bCoverMaterialName, setBCoverMaterialName, bCoverMaterialId, setBCoverMaterialId, bCoverPaperSizeId, setBCoverPaperSizeId, bCoverPrintType, setBCoverPrintType, bCoverPrintSide, setBCoverPrintSide, bCoverProc, setBCoverProc,
        bInnerMaterialName, setBInnerMaterialName, bInnerMaterialId, setBInnerMaterialId, bInnerPaperSizeId, setBInnerPaperSizeId, bInnerPrintType, setBInnerPrintType, bInnerPrintSide, setBInnerPrintSide, bInnerProc, setBInnerProc,
        pricingResult, calculating, optimizedSizes, handleTemplateChange
    } = quoteState;
    if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu cấu hình...</div>;

    const formatCurrency = (val: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] rounded-xl overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 z-10" />
            
            <div className="flex-1 p-5 overflow-y-auto w-full">
                {tab === 'loose' && <LooseForm state={quoteState} />}
                {tab === 'bound' && <BoundForm state={quoteState} />}
                {tab === 'large_format' && <LargeFormatForm state={quoteState} />}
            </div>
        </div>
    );
}
