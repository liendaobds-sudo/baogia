'use client';

import { useEffect } from 'react';
import type { Conversation, ChatMessage } from '../types';

interface ForwardModalProps {
    forwardMsg: ChatMessage;
    conversations: Conversation[];
    selectedConversationId?: string;
    forwardTargets: Set<string>;
    forwardSearch: string;
    forwardNote: string;
    onToggleTarget: (id: string) => void;
    onSearchChange: (value: string) => void;
    onNoteChange: (value: string) => void;
    onForward: (targetIds: string[], content: string, note: string) => void;
    onClose: () => void;
}

export function ForwardModal({
    forwardMsg,
    conversations,
    selectedConversationId,
    forwardTargets,
    forwardSearch,
    forwardNote,
    onToggleTarget,
    onSearchChange,
    onNoteChange,
    onForward,
    onClose,
}: ForwardModalProps) {
    // Close on Escape key
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[99999] bg-black/45 flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl w-[420px] max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                    <span className="text-base font-semibold text-slate-900">Chia sẻ</span>
                    <button onClick={onClose} className="bg-transparent border-none cursor-pointer text-xl text-slate-500 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">✕</button>
                </div>
                <div className="px-5 py-3">
                    <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3.5 py-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input value={forwardSearch} onChange={e => onSearchChange(e.target.value)}
                            placeholder="Tìm kiếm..." className="border-none bg-transparent outline-none flex-1 text-sm text-slate-900" />
                    </div>
                </div>
                <div className="px-5 pb-2 flex gap-4 text-[13px] font-medium border-b border-slate-100">
                    <span className="text-[#005ae0] border-b-2 border-[#005ae0] pb-2">Gần đây</span>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[300px]">
                    {conversations
                        .filter(c => c.id !== selectedConversationId)
                        .filter(c => !forwardSearch || (c.contact?.displayName || '').toLowerCase().includes(forwardSearch.toLowerCase()))
                        .map(c => (
                            <div key={c.id}
                                onClick={() => onToggleTarget(c.id)}
                                className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${forwardTargets.has(c.id) ? 'bg-[#005ae0] border-2 border-[#005ae0]' : 'bg-white border-2 border-slate-300'}`}>
                                    {forwardTargets.has(c.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                </div>
                                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                                    {c.contact?.avatarUrl ? (
                                        <img src={c.contact.avatarUrl} referrerPolicy="no-referrer" alt="" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center font-bold text-blue-800 text-base">
                                            {c.contact?.displayName?.charAt(0) || '?'}
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm text-slate-900 font-medium">{c.contact?.displayName || 'Unknown'}</span>
                            </div>
                        ))}
                </div>
                <div className="border-t border-gray-200 px-5 py-3">
                    <div className="bg-slate-100 rounded-lg px-3.5 py-2.5 mb-2.5">
                        <div className="text-xs font-semibold text-slate-500 mb-1">Chia sẻ tin nhắn</div>
                        <div className="text-[13px] text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">
                            {forwardMsg.contentType === 'image' ? '📷 Hình ảnh' : (forwardMsg.content || '')}
                        </div>
                    </div>
                    <input value={forwardNote} onChange={e => onNoteChange(e.target.value)}
                        placeholder="Nhập tin nhắn..."
                        className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm outline-none box-border focus:border-[#005ae0]" />
                </div>
                <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2.5">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-100 border-none rounded-lg cursor-pointer text-sm font-medium text-slate-600 hover:bg-slate-200">Hủy</button>
                    <button
                        disabled={forwardTargets.size === 0}
                        onClick={() => {
                            onForward(Array.from(forwardTargets), forwardMsg.content || '', forwardNote);
                            onClose();
                        }}
                        className={`px-6 py-2 border-none rounded-lg text-sm font-semibold text-white transition-colors ${forwardTargets.size > 0 ? 'bg-[#005ae0] cursor-pointer hover:bg-[#0047b3]' : 'bg-slate-400 cursor-not-allowed'}`}
                    >Chia sẻ</button>
                </div>
            </div>
        </div>
    );
}
