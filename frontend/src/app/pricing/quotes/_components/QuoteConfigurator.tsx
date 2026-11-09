'use client';

import { LooseForm } from './forms/LooseForm';
import { BoundForm } from './forms/BoundForm';
import { LargeFormatForm } from './forms/LargeFormatForm';
import { useQuoteConfigurator } from '../_hooks/useQuoteConfigurator';

export function QuoteConfigurator({ token, activeTab, onTabChange }: { token: string | null; activeTab?: 'loose' | 'bound' | 'large_format'; onTabChange?: (tab: 'loose' | 'bound' | 'large_format') => void }) {
    const quoteState = useQuoteConfigurator(token, activeTab, onTabChange);
    const { tab, loading } = quoteState;
    if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Đang tải dữ liệu cấu hình...</div>;

    return (
        <div className="flex flex-col h-full bg-[#f8fafc]">
            <div className="flex-1 p-3.5 overflow-y-auto w-full min-h-0">
                {tab === 'loose' && <LooseForm state={quoteState} />}
                {tab === 'bound' && <BoundForm state={quoteState} />}
                {tab === 'large_format' && <LargeFormatForm state={quoteState} />}
            </div>
        </div>
    );
}
