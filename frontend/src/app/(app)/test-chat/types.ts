// ═══════════════════════════════════════
// Test Chat — Shared Types & Constants
// ═══════════════════════════════════════

export interface ChatMsg {
    id: string;
    senderType: 'customer' | 'agent' | 'system';
    content: string;
    contentType: string;
    createdAt: string;
}

export interface AiSuggestion {
    id: string;
    replies: { text: string; label?: string }[];
    missingInfo: { slot: string; question: string }[];
    sources: { docId?: string; docName?: string; heading?: string; excerpt?: string }[];
    warnings: string[];
    confidence: number;
    sentiment: number;
    intent: string;
    model: string;
    status: string;
    triggerMessageId: string;
    createdAt: string;
}

export const PRESET_MESSAGES = [
    { label: '📋 In tem', text: 'Cho mình hỏi giá in 500 tem 5x5cm decal' },
    { label: '📑 Brochure', text: 'Mình cần in 1000 tờ rơi A4 2 mặt couche 150' },
    { label: '🃏 Name Card', text: 'In 500 namecard 2 mặt cán mờ' },
    { label: '📖 Catalogue', text: 'Báo giá in catalogue 20 trang A4' },
    { label: '🏷️ Hỏi giá', text: 'Cho mình hỏi giá in ấn' },
    { label: '💬 Chào', text: 'Xin chào, mình muốn đặt in' },
] as const;
