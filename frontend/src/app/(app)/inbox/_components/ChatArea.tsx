import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import type { Conversation, ChatMessage, QuickReply } from '../types';
import { apiPost, apiPatch, API_URL } from '../../../../lib/api';
import MessageActions from './MessageActions';
import ReactionIcon from './ReactionIcon';
import ChatHeader from './ChatHeader';
import { ChatSearchBar, PinnedBanner } from './ChatBanners';
import { MessageBubble } from './MessageBubble';
import { ForwardModal } from './ForwardModal';
import { MessageDetailsModal } from './MessageDetailsModal';
import { Lightbox, ContextMenuItem } from './Lightbox';
import { Copy, Pin, Star, ListChecks, Info, ChevronRight, Undo2, Trash2, Quote, Forward, Smile, Image as ImageIcon, Paperclip, MonitorUp, Bot, X } from 'lucide-react';
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react';
import { useSocket } from '@/lib/socket-context';
import { useToast } from '@/lib/ui/toast';
import { STICKER_URLS } from '../_lib/constants';

interface ChatAreaProps {
    selectedConversation: Conversation | null;
    conversations: Conversation[];
    messages: ChatMessage[];
    quickReplies: QuickReply[];
    typingStatuses: Record<string, boolean>;
    agentThought?: { conversationId: string; status?: string; message: string; tool: string } | null;
    onSend: (text: string, imageFile: File | null, replyToId?: string) => Promise<any>;
    onForwardMessage?: (targetConversationIds: string[], content: string, extraNote: string) => void;
    onStatusChange: (status: string) => void;
    onPriorityChange: (priority: string) => void;
    onRecordQRUsage: (id: string) => void;
    onDeleteConversation: () => void;
    onRecallMessage?: (msgId: string) => void;
    onPinMessage?: (msgId: string) => void;
    onStarMessage?: (msgId: string) => void;
    onDeleteLocalMessage?: (msgId: string) => void;
    rightSidebarVisible?: boolean;
    onToggleRightSidebar?: () => void;
}

export interface ChatAreaRef {
    injectText: (text: string) => void;
}

const ChatArea = forwardRef<ChatAreaRef, ChatAreaProps>(({ 
    selectedConversation,
    conversations,
    messages,
    quickReplies,
    typingStatuses,
    agentThought,
    onSend,
    onForwardMessage,
    onStatusChange,
    onPriorityChange,
    onRecordQRUsage,
    onDeleteConversation,
    onRecallMessage,
    onPinMessage,
    onStarMessage,
    onDeleteLocalMessage,
    rightSidebarVisible,
    onToggleRightSidebar
}, ref) => {
    // -- Text/Image State --
    const [replyText, setReplyText] = useState('');
    const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
    const [sending, setSending] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [qrFilter, setQrFilter] = useState('');
    const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const [sendingSticker, setSendingSticker] = useState(false);

    // -- Reaction/Context State --
    const [optimisticReactions, setOptimisticReactions] = useState<Record<string, Record<string, number>>>({});
    const [activeReactionPopupId, setActiveReactionPopupId] = useState<string | null>(null);
    const [contextMenuState, setContextMenuState] = useState<{ msg: ChatMessage; x: number; y: number; position: 'top' | 'bottom' } | null>(null);
    const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

    // -- Multi-Select, Details, Lightbox, Forward --
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
    const [viewDetailsMsg, setViewDetailsMsg] = useState<ChatMessage | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
    const [forwardTargets, setForwardTargets] = useState<Set<string>>(new Set());
    const [forwardSearch, setForwardSearch] = useState('');
    const [forwardNote, setForwardNote] = useState('');

    // -- Search --
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // -- Proactive AI Follow-up --
    const [proactiveFollowupMsg, setProactiveFollowupMsg] = useState<{ id: string, message: string } | null>(null);
    const { socket } = useSocket();
    const toast = useToast();

    useEffect(() => { setProactiveFollowupMsg(null); }, [selectedConversation?.id]);

    useEffect(() => {
        if (!socket || !selectedConversation) return;
        const handleProactive = (data: any) => {
            if (data.conversationId === selectedConversation.id) {
                setProactiveFollowupMsg({ id: data.followUpId, message: data.message });
            }
        };
        const handleUpdated = (data: any) => {
            setProactiveFollowupMsg(prev => {
                if (prev && prev.id === data.followUpId && data.status !== 'sent' && data.status !== 'pending') return null;
                return prev;
            });
        };
        socket.on('proactive_followup', handleProactive);
        socket.on('follow_up_updated', handleUpdated);
        return () => { socket.off('proactive_followup', handleProactive); socket.off('follow_up_updated', handleUpdated); };
    }, [socket, selectedConversation]);

    const filteredMessages = useMemo(() => {
        if (!searchQuery) return messages;
        const q = searchQuery.toLowerCase();
        return messages.filter(m => m.content?.toLowerCase().includes(q) || m.senderName?.toLowerCase().includes(q));
    }, [messages, searchQuery]);

    // -- Refs --
    const chatEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    // -- Lightbox ESC key --
    useEffect(() => {
        if (!lightboxUrl) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxUrl(null); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [lightboxUrl]);

    // -- Reactions --
    const handleReact = async (messageId: string, icon: string) => {
        if (!selectedConversation) return;
        setActiveReactionPopupId(null);

        // On Zalo: 1 person = 1 reaction. If already reacted with same icon → skip
        if (icon !== 'remove') {
            const currentMsg = messages.find(m => m.id === messageId);
            const existingReactions = optimisticReactions[messageId] || currentMsg?.reactions || {};
            if (existingReactions[icon] && existingReactions[icon] > 0) {
                return; // Already has this reaction, don't double-count
            }
        }
        setOptimisticReactions(prev => {
            if (icon === 'remove') {
                return { ...prev, [messageId]: {} };
            }
            // Like Zalo: click reaction = set it. Only X button removes.
            const msgReactions = { ...(prev[messageId] || {}) };
            msgReactions[icon] = 1;
            return { ...prev, [messageId]: msgReactions };
        });
        try {
            const result = await apiPost<{ success: boolean; reactions: Record<string, number> }>(
                `/conversations/${selectedConversation.id}/messages/${messageId}/react`, { icon }
            );
            // Update optimistic with actual server data
            if (result?.reactions !== undefined) {
                setOptimisticReactions(prev => ({ ...prev, [messageId]: result.reactions || {} }));
            }
        } catch (error) {
            console.error('Failed to react:', error);
            // Rollback: clear optimistic to revert to server state
            setOptimisticReactions(prev => {
                const next = { ...prev };
                delete next[messageId];
                return next;
            });
        }
    };

    // -- Imperative Handle (injectText) --
    useImperativeHandle(ref, () => ({
        injectText: (text: string) => {
            setReplyText(text);
            requestAnimationFrame(() => {
                const el = inputRef.current;
                if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; el.focus(); }
            });
        }
    }));

    // -- Scroll to bottom --
    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior });
    };
    useEffect(() => {
        const timer = setTimeout(() => scrollToBottom('auto'), 50);
        return () => clearTimeout(timer);
    }, [messages.length, proactiveFollowupMsg?.id, agentThought?.message, selectedConversation?.id]);

    // -- Context Menu dismiss --
    useEffect(() => {
        if (!contextMenuState) return;
        const handleClickOut = () => setContextMenuState(null);
        window.addEventListener('click', handleClickOut);
        return () => window.removeEventListener('click', handleClickOut);
    }, [contextMenuState]);

    // -- Input Handlers --
    const handleInputChange = (val: string) => {
        setReplyText(val);
        if (val.startsWith('/') && val.length >= 1) { setShowQR(true); setQrFilter(val.substring(1).toLowerCase()); }
        else { setShowQR(false); }
    };

    const handleSendSticker = async (url: string) => {
        setShowStickerPicker(false);
        setSendingSticker(true);
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const file = new File([blob], "sticker.gif", { type: blob.type || 'image/gif' });
            await onSend('[Sticker Zalo]', file);
        } catch (e) { console.error('Failed to send sticker', e); toast.show('error', 'Lỗi khi tải hoặc gửi Sticker'); }
        finally { setSendingSticker(false); }
    };

    const handleSendSubmit = async (textOverride?: string) => {
        const txt = textOverride || replyText;
        if (!txt.trim() && !pendingImage) return;
        
        // Save current state in case of failure
        const prevText = replyText;
        const prevImage = pendingImage;
        const prevReply = replyingTo;

        setSending(true);
        // Clear input instantly
        if (!textOverride) setReplyText('');
        setPendingImage(null);
        setReplyingTo(null);
        setTimeout(() => { if (inputRef.current) inputRef.current.style.height = 'auto'; }, 0);

        try {
            await onSend(txt, prevImage?.file || null, prevReply?.id);
        } catch (err) {
            console.error('Send message failed', err);
            toast.show('error', 'Gửi tin nhắn thất bại');
            // Restore input if failed
            if (!textOverride) setReplyText(prevText);
            setPendingImage(prevImage);
            setReplyingTo(prevReply);
        } finally {
            setSending(false);
        }
    };

    const handleFileSelect = (file?: File) => {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) { toast.show('error', 'Tập tin quá lớn, tối đa 50MB'); return; }
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
        setPendingImage({ file, preview });
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) { e.preventDefault(); handleFileSelect(item.getAsFile() || undefined); return; }
        }
    };

    const handleImageSelectBtn = (e: any) => { const file = e.target.files?.[0]; if (file && !file.type.startsWith('image/')) { toast.show('error', 'Nút này chỉ chọn ảnh'); return; } handleFileSelect(file); e.target.value = ''; };
    const handleDocSelectBtn = (e: any) => { const file = e.target.files?.[0]; handleFileSelect(file); e.target.value = ''; };

    const filteredQR = quickReplies.filter(q =>
        !qrFilter || q.title.toLowerCase().includes(qrFilter) || q.shortcut.toLowerCase().includes(qrFilter) || q.content.toLowerCase().includes(qrFilter)
    ).slice(0, 6);

    // ===== EMPTY STATE =====
    if (!selectedConversation) {
        return (
            <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                    <div className="text-5xl mb-4">💬</div>
                    <div className="text-base">Chọn một hội thoại để bắt đầu</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-[#eaebed] min-w-0">
            {/* ===== HEADER ===== */}
            <ChatHeader
                selectedConversation={selectedConversation}
                rightSidebarVisible={rightSidebarVisible}
                isSearchVisible={isSearchVisible}
                onToggleSearch={() => setIsSearchVisible(v => !v)}
                onToggleRightSidebar={onToggleRightSidebar}
            />

            {/* ===== PINNED BANNER ===== */}
            <PinnedBanner messages={messages} onUnpin={onPinMessage} />

            {/* ===== SEARCH BAR ===== */}
            <ChatSearchBar
                visible={isSearchVisible}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onClose={() => { setIsSearchVisible(false); setSearchQuery(''); }}
            />

            {/* ===== MESSAGES ===== */}
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-1.5 bg-[#eaebed]">
                {filteredMessages.map((msg, i) => {
                    const isMine = msg.senderType === 'agent';
                    const prevMsg = i > 0 ? filteredMessages[i - 1] : null;
                    const nextMsg = i < filteredMessages.length - 1 ? filteredMessages[i + 1] : null;
                    const isFirstInGroup = !prevMsg || prevMsg.senderType !== msg.senderType || prevMsg.senderName !== msg.senderName;
                    const isLastInGroup = !nextMsg || nextMsg.senderType !== msg.senderType || nextMsg.senderName !== msg.senderName;

                    return (
                        <MessageBubble
                            key={`${msg.id}-${i}`}
                            msg={msg}
                            isMine={isMine}
                            isFirstInGroup={isFirstInGroup}
                            isLastInGroup={isLastInGroup}
                            isMultiSelectMode={isMultiSelectMode}
                            isSelected={selectedMessageIds.has(msg.id)}
                            isHovered={hoveredMessageId === msg.id}
                            selectedConversation={selectedConversation}
                            messages={messages}
                            optimisticReactions={optimisticReactions}
                            onToggleSelect={(msgId) => {
                                const newSet = new Set(selectedMessageIds);
                                if (newSet.has(msgId)) newSet.delete(msgId); else newSet.add(msgId);
                                setSelectedMessageIds(newSet);
                            }}
                            onSetHovered={setHoveredMessageId}
                            onContextMenu={(e, m) => {
                                e.preventDefault();
                                const isNearBottom = window.innerHeight - e.clientY < 320;
                                setContextMenuState({ msg: m, x: e.clientX, y: e.clientY, position: isNearBottom ? 'top' : 'bottom' });
                            }}
                            onReact={handleReact}
                            onSetLightbox={setLightboxUrl}
                            onSetReplyingTo={setReplyingTo}
                            onSetForwardMsg={(m) => { setForwardMsg(m); setForwardTargets(new Set()); setForwardSearch(''); setForwardNote(''); }}
                            onSetViewDetails={setViewDetailsMsg}
                            onMultiSelect={(msgId) => { setIsMultiSelectMode(true); setSelectedMessageIds(new Set([msgId])); }}
                            onRecallMessage={onRecallMessage}
                            onPinMessage={onPinMessage}
                            onStarMessage={onStarMessage}
                            onDeleteLocalMessage={onDeleteLocalMessage}
                            MessageActionsComponent={MessageActions}
                            inputRef={inputRef}
                        />
                    );
                })}
                {selectedConversation?.id && typingStatuses[selectedConversation.id] && (
                    <div className="ml-10 self-start py-2 px-3.5 rounded-lg bg-white text-slate-500 text-[13px] italic border border-slate-200">
                        Đang soạn tin nhắn...
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* ===== VIEW DETAILS MODAL ===== */}
            {viewDetailsMsg && (
                <MessageDetailsModal message={viewDetailsMsg} onClose={() => setViewDetailsMsg(null)} />
            )}

            {/* ===== FORWARD MODAL ===== */}
            {forwardMsg && (
                <ForwardModal
                    forwardMsg={forwardMsg}
                    conversations={conversations}
                    selectedConversationId={selectedConversation?.id}
                    forwardTargets={forwardTargets}
                    forwardSearch={forwardSearch}
                    forwardNote={forwardNote}
                    onToggleTarget={(id) => { const s = new Set(forwardTargets); if (s.has(id)) s.delete(id); else s.add(id); setForwardTargets(s); }}
                    onSearchChange={setForwardSearch}
                    onNoteChange={setForwardNote}
                    onForward={(targets, content, note) => {
                        if (onForwardMessage) onForwardMessage(targets, content, note);
                        else navigator.clipboard.writeText(note ? `${content}\n---\n${note}` : content);
                    }}
                    onClose={() => setForwardMsg(null)}
                />
            )}

            {/* ===== QUICK REPLY POPUP ===== */}
            {showQR && filteredQR.length > 0 && (
                <div className="relative">
                    <div className="absolute bottom-0 left-5 right-5 bg-white border border-[var(--border)] rounded-xl shadow-[0_-4px_20px_rgba(0,0,0,0.12)] max-h-[280px] overflow-y-auto z-10">
                        <div className="px-3 py-2 border-b border-[var(--border)] text-xs text-slate-400 font-semibold">
                            ⚡ Trả lời nhanh — gõ / để tìm kiếm
                        </div>
                        {filteredQR.map(qr => (
                            <div key={qr.id} onClick={() => { setReplyText(qr.content); setShowQR(false); inputRef.current?.focus(); onRecordQRUsage(qr.id); }}
                                className="px-3.5 py-2.5 cursor-pointer border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="font-semibold text-[13px]">{qr.title}</span>
                                    <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded font-mono">{qr.shortcut}</span>
                                    <span className="text-[10px] text-slate-400">{qr.category}</span>
                                </div>
                                <div className="text-xs text-slate-500 leading-snug overflow-hidden text-ellipsis whitespace-nowrap">{qr.content}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ===== IMAGE PREVIEW ===== */}
            {pendingImage && (
                <div className="px-5 py-2 border-t border-[var(--border)] bg-slate-50 flex items-center gap-2">
                    {pendingImage.preview ? (
                        <img src={pendingImage.preview} alt="Preview" className="w-[60px] h-[60px] object-cover rounded-lg border-2 border-[var(--primary)]" />
                    ) : (
                        <div className="w-[60px] h-[60px] rounded-lg bg-slate-200 flex items-center justify-center text-2xl">📁</div>
                    )}
                    <div className="flex-1 text-[13px] text-slate-500">
                        📎 {pendingImage.file.name} ({(pendingImage.file.size / 1024).toFixed(0)}KB)
                    </div>
                    <button onClick={() => { URL.revokeObjectURL(pendingImage.preview); setPendingImage(null); }}
                        className="bg-transparent border-none cursor-pointer text-lg text-red-500">✕</button>
                </div>
            )}

            {/* ===== REPLYING TO PREVIEW ===== */}
            {replyingTo && (
                <div className="px-5 py-2 border-t border-[var(--border)] bg-blue-50 flex items-center gap-3">
                    <div className="w-1 h-9 bg-[#005ae0] rounded shrink-0" />
                    <div className="flex-1 flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-[#005ae0]">
                            Trả lời {replyingTo.senderType === 'customer' ? (selectedConversation?.contact?.displayName || 'Khách hàng') : 'tin nhắn của bạn'}
                        </span>
                        <span className="text-[13px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                            {replyingTo.contentType === 'image' ? '📷 Hình ảnh' : (replyingTo.content || '')}
                        </span>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="bg-transparent border-none cursor-pointer text-lg text-slate-400 shrink-0 p-1">✕</button>
                </div>
            )}

            {/* ===== INPUT WRAPPER ===== */}
            <div className="bg-white border-t border-[#e1e4ea] flex flex-col relative">
                {/* Multi-Select Toolbar */}
                {isMultiSelectMode && (
                    <div className="absolute inset-0 flex items-center justify-between px-4 py-2 bg-white z-20">
                        <div className="flex items-center gap-2.5">
                            <div className="bg-blue-100 text-blue-700 w-[22px] h-[22px] flex items-center justify-center rounded text-xs font-bold">{selectedMessageIds.size}</div>
                            <span className="text-sm font-semibold text-slate-900">Đã chọn</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { const texts = Array.from(selectedMessageIds).map(id => messages.find(m => m.id === id)?.content).filter(Boolean).join('\n---\n'); if(texts) navigator.clipboard.writeText(texts); setIsMultiSelectMode(false); setSelectedMessageIds(new Set()); }}
                                disabled={selectedMessageIds.size === 0}
                                className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full border-none cursor-pointer text-slate-700 font-medium text-[13px] disabled:opacity-50 hover:bg-slate-200">
                                <Copy size={14} strokeWidth={2.5} /> Sao chép
                            </button>
                            <button onClick={() => { const msgs = Array.from(selectedMessageIds).map(id => messages.find(m => m.id === id)).filter(Boolean) as ChatMessage[]; if (msgs.length > 0) { setForwardMsg(msgs[0]); setForwardTargets(new Set()); setForwardSearch(''); setForwardNote(''); setIsMultiSelectMode(false); setSelectedMessageIds(new Set()); }}}
                                disabled={selectedMessageIds.size === 0}
                                className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full border-none cursor-pointer text-slate-700 font-medium text-[13px] disabled:opacity-50 hover:bg-slate-200">
                                <Forward size={14} strokeWidth={2.5} /> Chia sẻ
                            </button>
                            {onRecallMessage && (
                                <button onClick={async () => { const ids = Array.from(selectedMessageIds); setIsMultiSelectMode(false); setSelectedMessageIds(new Set()); for (const id of ids) { await onRecallMessage(id); }}}
                                    disabled={selectedMessageIds.size === 0}
                                    className="flex items-center gap-1.5 bg-red-100 px-3 py-1.5 rounded-full border-none cursor-pointer text-red-600 font-medium text-[13px] disabled:opacity-50 hover:bg-red-200">
                                    <Undo2 size={14} strokeWidth={2.5} /> Thu hồi
                                </button>
                            )}
                            {onDeleteLocalMessage && (
                                <button onClick={async () => { const ids = Array.from(selectedMessageIds); setIsMultiSelectMode(false); setSelectedMessageIds(new Set()); for (const id of ids) { await onDeleteLocalMessage(id); }}}
                                    disabled={selectedMessageIds.size === 0}
                                    className="flex items-center gap-1.5 bg-red-100 px-3 py-1.5 rounded-full border-none cursor-pointer text-red-600 font-medium text-[13px] disabled:opacity-50 hover:bg-red-200">
                                    <Trash2 size={14} strokeWidth={2.5} /> Xóa
                                </button>
                            )}
                            <div className="w-px h-4 bg-slate-200 mx-1" />
                            <button onClick={() => { setIsMultiSelectMode(false); setSelectedMessageIds(new Set()); }}
                                className="bg-transparent border-none text-slate-900 font-semibold text-sm cursor-pointer px-1.5 py-1">Hủy</button>
                        </div>
                    </div>
                )}

                {/* Toolbar Row */}
                <div className="px-3.5 py-1.5 flex items-center gap-1 border-b border-[#e1e4ea]">
                    {/* Sticker */}
                    <div title="Stickers" className="flex relative">
                        <button onClick={() => setShowStickerPicker(!showStickerPicker)}
                            className="bg-transparent border-none cursor-pointer p-1.5 rounded-md flex hover:bg-slate-100 transition-colors">
                            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={showStickerPicker ? '#005ae0' : "#7589a3"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><circle cx="8.5" cy="11.5" r="1"/><circle cx="13.5" cy="11.5" r="1"/><path d="M8 15a4.5 4.5 0 0 0 5 0"/></svg>
                        </button>
                        {showStickerPicker && (
                            <div className="absolute bottom-11 left-0 w-[340px] h-[280px] bg-white border border-[#e1e4ea] rounded-lg p-2.5 flex flex-col shadow-[0_10px_40px_rgba(0,0,0,0.15)] z-50">
                                <div className="text-[13px] font-semibold text-slate-500 px-1 pb-2 border-b border-slate-100 mb-2 flex justify-between items-center">
                                    <span>Zalo Stickers (QooBee)</span>
                                    <button onClick={() => setShowStickerPicker(false)} className="bg-transparent border-none cursor-pointer text-slate-400 text-base">✕</button>
                                </div>
                                {sendingSticker ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-[#005ae0] text-[13px] font-medium gap-3">
                                        <div className="w-6 h-6 border-3 border-slate-200 border-t-[#005ae0] rounded-full animate-spin" />
                                        <span>Đang tải và gửi Sticker...</span>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-y-auto grid grid-cols-5 gap-2 pr-1 content-start">
                                        {STICKER_URLS.map((url, i) => (
                                            <button key={i} onClick={() => handleSendSticker(url)}
                                                className="bg-transparent border border-transparent cursor-pointer p-1.5 rounded-lg flex items-center justify-center hover:bg-slate-100 hover:border-slate-300 transition-colors">
                                                <img src={url} alt="Sticker" className="w-[54px] h-[54px] object-contain" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Image */}
                    <div title="Gửi hình ảnh">
                        <button onClick={() => fileInputRef.current?.click()} className="bg-transparent border-none cursor-pointer p-1.5 rounded-md flex hover:bg-slate-100 transition-colors">
                            <ImageIcon size={23} color="#7589a3" strokeWidth={1.5} />
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelectBtn} />
                    </div>
                    {/* File */}
                    <div title="Đính kèm file">
                        <button onClick={() => docInputRef.current?.click()} className="bg-transparent border-none cursor-pointer p-1.5 rounded-md flex hover:bg-slate-100 transition-colors">
                            <Paperclip size={23} color="#7589a3" strokeWidth={1.5} />
                        </button>
                        <input ref={docInputRef} type="file" accept="*/*" className="hidden" onChange={handleDocSelectBtn} />
                    </div>
                    {/* Screenshot */}
                    <div title="Chụp màn hình">
                        <button className="bg-transparent border-none cursor-pointer p-1.5 rounded-md flex hover:bg-slate-100 transition-colors">
                            <MonitorUp size={23} color="#7589a3" strokeWidth={1.5} />
                        </button>
                    </div>
                </div>

                {/* Agent Thought */}
                {agentThought && (
                    <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 text-blue-700 text-[13px] flex items-center gap-2 italic mt-2 transition-all">
                        <span className={`text-lg ${agentThought.status === 'thinking' ? 'animate-pulse' : ''}`}>
                            {agentThought.status === 'thinking' ? '🔄' : '✨'}
                        </span>
                        <span className="font-medium">AI trợ lý:</span>
                        <span>{agentThought.message}</span>
                    </div>
                )}

                {/* Proactive Follow-up Banner */}
                {proactiveFollowupMsg && (
                    <div className="mx-4 my-2 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-sm flex flex-col gap-1.5 relative">
                        <button onClick={() => setProactiveFollowupMsg(null)} title="Bỏ qua nhắc nhở"
                            className="absolute top-2.5 right-2.5 bg-transparent border-none cursor-pointer text-amber-700 p-1 rounded hover:bg-amber-100">
                            <X size={16} strokeWidth={2.5} />
                        </button>
                        <div className="flex items-center gap-1.5 text-amber-600 font-bold text-[13px] uppercase">
                            <Bot size={16} strokeWidth={2.5} /> Nhắc nhở Follow-up
                        </div>
                        <div className="text-sm text-amber-900 mb-0.5">
                            Khách đã im lặng quá lâu. AI gợi ý nhắc nhở bằng tin nhắn sau:
                        </div>
                        <div className="text-sm text-slate-800 bg-white px-3.5 py-2.5 rounded-md border border-slate-200 my-0.5">
                            {proactiveFollowupMsg.message}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={async () => {
                                    handleSendSubmit(proactiveFollowupMsg.message);
                                    try { await apiPatch(`/conversations/follow-ups/${proactiveFollowupMsg.id}/status`, { status: 'completed' }); } catch (e) {}
                                    setProactiveFollowupMsg(null);
                                }}
                                className="bg-[#005ae0] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1 flex justify-center items-center gap-1.5 hover:bg-[#0047b3] transition-colors">
                                Gửi Đi Ngay <ChevronRight size={16} strokeWidth={2.5} />
                            </button>
                            <button onClick={() => { setReplyText(proactiveFollowupMsg.message); setProactiveFollowupMsg(null); setTimeout(() => inputRef.current?.focus(), 50); }}
                                className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:bg-slate-50 transition-colors">
                                Chỉnh sửa trước
                            </button>
                            <button onClick={() => { setProactiveFollowupMsg(null); window.dispatchEvent(new Event('show-notes-tab')); }}
                                title="Lưu vào danh sách To-Do (Ghi chú)"
                                className="bg-amber-50 text-amber-700 border border-dashed border-amber-300 px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:bg-amber-100 transition-colors">
                                ⏱️ Làm sau
                            </button>
                        </div>
                    </div>
                )}

                {/* Input Row */}
                <div className="px-4 pb-3.5 flex items-end gap-2 shrink-0">
                    <textarea
                        ref={inputRef}
                        className="flex-1 resize-none overflow-y-auto border-none outline-none bg-transparent text-[#081c36] font-[inherit] min-h-[44px] max-h-[120px] leading-[22px] py-2.5 text-[15px]"
                        rows={1}
                        placeholder='Nhập tin nhắn...'
                        value={replyText}
                        onChange={e => {
                            handleInputChange(e.target.value);
                            const el = e.target;
                            el.style.height = 'auto';
                            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                        }}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey && !showQR) { e.preventDefault(); handleSendSubmit(); }
                            if (e.key === 'Escape') { setShowQR(false); setShowEmojiPicker(false); }
                        }}
                        onPaste={handlePaste}
                    />
                    <div className="flex gap-3 items-center pb-2.5">
                        {/* Emoji Picker */}
                        <div title="Emoji" className="relative flex items-center">
                            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="bg-transparent border-none cursor-pointer flex items-center">
                                <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke={showEmojiPicker ? '#005ae0' : "#334155"} strokeWidth="1.3">
                                    <circle cx="12" cy="12" r="9.5" />
                                    <circle cx="8.5" cy="9" r="1" fill="currentColor" stroke="none"/>
                                    <circle cx="15.5" cy="9" r="1" fill="currentColor" stroke="none"/>
                                    <path d="M7.5 14.5c2 1.5 7 1.5 9 0" strokeLinecap="round" />
                                </svg>
                            </button>
                            {showEmojiPicker && (
                                <div className="absolute bottom-11 -right-10 z-50 shadow-[0_10px_40px_rgba(0,0,0,0.15)] rounded-lg">
                                    <EmojiPicker
                                        theme={Theme.LIGHT}
                                        emojiStyle={EmojiStyle.FACEBOOK}
                                        onEmojiClick={async (e) => { setReplyText(prev => prev + e.emoji); inputRef.current?.focus(); }}
                                        width={320} height={360}
                                        previewConfig={{ showPreview: false }}
                                        searchPlaceholder="Tìm kiếm cảm xúc..."
                                    />
                                </div>
                            )}
                        </div>

                        {/* Quick Like & Send */}
                        {!(replyText.trim() || pendingImage) && (
                            <div onClick={() => handleSendSubmit('👍')} className="cursor-pointer flex items-center justify-center" title="Gửi nhanh biểu tượng Like">
                                <ReactionIcon type="👍" size={26} />
                            </div>
                        )}
                        {(replyText.trim() || pendingImage) && (
                            <button onClick={() => handleSendSubmit()}
                                disabled={!replyText.trim() && !pendingImage}
                                className="bg-transparent border-none p-0 flex items-center cursor-pointer disabled:cursor-default">
                                <span className="text-[15px] text-[#005ae0] font-semibold tracking-wide">GỬI</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== CONTEXT MENU ===== */}
            {contextMenuState && (
                <div
                    className="fixed bg-white rounded-lg py-1.5 w-[220px] shadow-[0_4px_20px_rgba(0,0,0,0.15)] border border-slate-200 z-[9999] flex flex-col"
                    style={{
                        ...(contextMenuState.position === 'top' ? { bottom: window.innerHeight - contextMenuState.y } : { top: contextMenuState.y }),
                        left: Math.min(contextMenuState.x, window.innerWidth - 240),
                    }}
                >
                    {contextMenuState.msg.status !== 'recalled' && (
                        <>
                            <ContextMenuItem icon={<Quote size={16} />} label="Trả lời" onClick={() => { setReplyingTo(contextMenuState.msg); inputRef.current?.focus(); setContextMenuState(null); }} />
                            <ContextMenuItem icon={<Forward size={16} />} label="Chia sẻ" onClick={() => { setForwardMsg(contextMenuState.msg); setForwardTargets(new Set()); setForwardSearch(''); setForwardNote(''); setContextMenuState(null); }} />
                            <div className="h-px bg-slate-100 my-1" />
                            <ContextMenuItem icon={<Copy size={16} />} label="Copy tin nhắn" onClick={() => { navigator.clipboard.writeText(contextMenuState.msg.content); setContextMenuState(null); }} />
                            {onPinMessage && <ContextMenuItem icon={<Pin size={16} />} label={contextMenuState.msg.isPinned ? 'Bỏ ghim tin nhắn' : 'Ghim tin nhắn'} onClick={() => { onPinMessage(contextMenuState.msg.id); setContextMenuState(null); }} />}
                            {onStarMessage && <ContextMenuItem icon={<Star size={16} color={contextMenuState.msg.isStarred ? "#facc15" : undefined} fill={contextMenuState.msg.isStarred ? "#facc15" : "none"} />} label={contextMenuState.msg.isStarred ? 'Bỏ đánh dấu' : 'Đánh dấu tin nhắn'} onClick={() => { onStarMessage(contextMenuState.msg.id); setContextMenuState(null); }} />}
                            <ContextMenuItem icon={<Info size={16} />} label="Xem chi tiết" onClick={() => { setViewDetailsMsg(contextMenuState.msg); setContextMenuState(null); }} />
                            <div className="h-px bg-slate-100 my-1" />
                        </>
                    )}
                    <ContextMenuItem icon={<ListChecks size={16} />} label="Chọn nhiều tin nhắn" onClick={() => { setIsMultiSelectMode(true); setSelectedMessageIds(new Set([contextMenuState.msg.id])); setContextMenuState(null); }} />
                    {contextMenuState.msg.senderType === 'agent' && contextMenuState.msg.status !== 'recalled' && onRecallMessage && (
                        <ContextMenuItem icon={<Undo2 size={16} />} label="Thu hồi" danger onClick={() => { onRecallMessage(contextMenuState.msg.id); setContextMenuState(null); }} />
                    )}
                    {onDeleteLocalMessage && (
                        <ContextMenuItem icon={<Trash2 size={16} />} label="Xóa chỉ ở phía tôi" danger onClick={() => { onDeleteLocalMessage(contextMenuState.msg.id); setContextMenuState(null); }} />
                    )}
                </div>
            )}

            {/* ===== LIGHTBOX ===== */}
            {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
        </div>
    );
});

ChatArea.displayName = 'ChatArea';
export default ChatArea;
