import type { ChatMessage, Conversation } from '../types';
import ReactionIcon from './ReactionIcon';
import { API_URL } from '../../../../lib/api';
import { useState, useEffect } from 'react';

/* ===== ChatAvatar ===== */
export function ChatAvatar({ url, nameStr }: { url?: string; nameStr: string }) {
    const [imgError, setImgError] = useState(!url);

    useEffect(() => {
        setImgError(!url);
    }, [url]);

    const initial = nameStr.charAt(0).toUpperCase();
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
    const colors = [
        ['#dbeafe', '#93c5fd', '#1e40af'],
        ['#dcfce7', '#86efac', '#166534'],
        ['#fef9c3', '#fde047', '#854d0e'],
        ['#fee2e2', '#fca5a5', '#991b1b'],
        ['#f3e8ff', '#d8b4fe', '#6b21a8'],
        ['#ffedd5', '#fdba74', '#9a3412'],
    ];
    const colorObj = colors[Math.abs(hash) % colors.length];

    if (url && !imgError) {
        return (
            <img
                src={url}
                alt="Avatar"
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover"
                onError={() => setImgError(true)}
            />
        );
    }

    return (
        <div
            className="w-full h-full rounded-full flex items-center justify-center font-bold text-base"
            style={{ background: `linear-gradient(135deg, ${colorObj[0]}, ${colorObj[1]})`, color: colorObj[2] }}
        >
            {initial}
        </div>
    );
}

/* ===== Helpers ===== */
const STATUS_LABELS: Record<string, string> = {
    new: 'Mới', in_progress: 'Đang xử lý', waiting_customer: 'Chờ khách',
    waiting_file: 'Chờ file', quoted: 'Đã báo giá', won: 'Chốt đơn',
    lost: 'Mất đơn', closed: 'Đã đóng',
};

/* ===== MessageBubble ===== */
interface MessageBubbleProps {
    msg: ChatMessage;
    isMine: boolean;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    isMultiSelectMode: boolean;
    isSelected: boolean;
    isHovered: boolean;
    selectedConversation: Conversation;
    messages: ChatMessage[];
    optimisticReactions: Record<string, Record<string, number>>;
    onToggleSelect: (msgId: string) => void;
    onSetHovered: (msgId: string | null) => void;
    onContextMenu: (e: React.MouseEvent, msg: ChatMessage) => void;
    onReact: (msgId: string, icon: string) => void;
    onSetLightbox: (url: string) => void;
    onSetReplyingTo: (msg: ChatMessage) => void;
    onSetForwardMsg: (msg: ChatMessage) => void;
    onSetViewDetails: (msg: ChatMessage) => void;
    onMultiSelect: (msgId: string) => void;
    // Message action callbacks
    onRecallMessage?: (msgId: string) => void;
    onPinMessage?: (msgId: string) => void;
    onStarMessage?: (msgId: string) => void;
    onDeleteLocalMessage?: (msgId: string) => void;
    // MessageActions component
    MessageActionsComponent: React.ComponentType<any>;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function MessageBubble({
    msg, isMine, isFirstInGroup, isLastInGroup,
    isMultiSelectMode, isSelected, isHovered,
    selectedConversation, messages, optimisticReactions,
    onToggleSelect, onSetHovered, onContextMenu,
    onReact, onSetLightbox, onSetReplyingTo, onSetForwardMsg,
    onSetViewDetails, onMultiSelect,
    onRecallMessage, onPinMessage, onStarMessage, onDeleteLocalMessage,
    MessageActionsComponent, inputRef
}: MessageBubbleProps) {
    const formatTime = (d: string) => d ? new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';

    return (
        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${isLastInGroup ? 'mb-2' : 'mb-0'}`}>
            <div
                className={`message-row flex flex-row items-start gap-3 max-w-[75%] relative rounded-xl transition-colors duration-150
                    ${isMine ? 'self-end' : 'self-start'}
                    ${isSelected ? 'bg-[#005ae0]/10' : 'bg-transparent'}
                    ${isMultiSelectMode ? 'px-2.5 -mx-2.5 cursor-pointer' : 'p-0 m-0 cursor-default'}`}
                onClick={(e) => {
                    if (isMultiSelectMode) {
                        e.stopPropagation();
                        onToggleSelect(msg.id);
                    }
                }}
                onMouseEnter={() => onSetHovered(msg.id)}
                onMouseLeave={() => onSetHovered(null)}
                onContextMenu={(e) => onContextMenu(e, msg)}
            >
                {!isMultiSelectMode && (
                    <MessageActionsComponent
                        message={msg}
                        isMine={isMine}
                        onReact={onReact}
                        onRecall={onRecallMessage}
                        onPin={onPinMessage}
                        onStar={onStarMessage}
                        onLocalDelete={onDeleteLocalMessage}
                        onMultiSelect={() => onMultiSelect(msg.id)}
                        onViewDetails={() => onSetViewDetails(msg)}
                        onQuote={() => { onSetReplyingTo(msg); inputRef.current?.focus(); }}
                        onForward={() => onSetForwardMsg(msg)}
                        isHovered={isHovered}
                        onOpenContext={(x: number, y: number) => {
                            const isNearBottom = window.innerHeight - y < 320;
                            onContextMenu({ clientX: x, clientY: y, preventDefault: () => {} } as any, msg);
                        }}
                    />
                )}

                {/* Avatar for Customer */}
                {!isMine && (
                    <div className={`w-10 shrink-0 ${isFirstInGroup ? 'opacity-100' : 'opacity-0'}`}>
                        {isFirstInGroup && (
                            <div className="w-10 h-10 relative">
                                <ChatAvatar url={msg.senderAvatarUrl} nameStr={msg.senderName || selectedConversation.contact?.displayName || '?'} />
                            </div>
                        )}
                    </div>
                )}

                <div className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
                    {/* Group chat sender name */}
                    {!isMine && isFirstInGroup && selectedConversation?.contact?.externalUserId?.startsWith('g_') && (
                        <div className="text-[13px] text-slate-500 ml-0.5 font-medium">
                            {msg.senderName || selectedConversation.contact?.displayName}
                        </div>
                    )}

                    <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Message Bubble + Reaction badge wrapper */}
                        <div className={`relative ${Object.values((msg.id in optimisticReactions ? optimisticReactions[msg.id] : msg.reactions) || {}).some(v => v > 0) ? 'mb-2.5' : ''}`}>
                            <div
                                className={`flex flex-col max-w-full shadow-sm px-3.5 py-2.5 rounded-lg text-slate-900 
                                    ${isMine ? 'bg-[#e5efff]' : 'bg-white'}`}
                            >
                                {msg.status === 'recalled' ? (
                                    <div className="italic text-slate-400 text-[13px] flex items-center gap-1.5">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                        Tin nhắn đã thu hồi
                                    </div>
                                ) : (
                                    <>
                                        {/* Image Attachments */}
                                        <ImageAttachments msg={msg} isMine={isMine} isMultiSelectMode={isMultiSelectMode} onSetLightbox={onSetLightbox} />
                                        {/* File Attachments */}
                                        <FileAttachments msg={msg} />
                                        {/* Audio/Voice */}
                                        <AudioAttachments msg={msg} />
                                        {/* Text content with special JSON handling */}
                                        <TextContent msg={msg} isMine={isMine} messages={messages} selectedConversation={selectedConversation} />
                                    </>
                                )}

                                {/* Time + Pin/Star indicators */}
                                <div className={`text-[11px] text-slate-500 mt-1 flex items-center opacity-80 gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                                    {msg.isStarred && <span title="Đã đánh dấu">⭐</span>}
                                    {msg.isPinned && <span title="Đã ghim">📌</span>}
                                    {formatTime(msg.createdAt)}
                                </div>
                            </div>

                            {/* Reaction Badges — positioned relative to bubble */}
                            <ReactionBadges msg={msg} isMine={isMine} optimisticReactions={optimisticReactions} onReact={onReact} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Send Status */}
            {isMine && msg.status && ['sending', 'sent', 'delivered', 'failed', 'read'].includes(msg.status) && (
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 h-5 rounded-full px-2 bg-black/5">
                    {msg.status === 'sending' ? '⏳ Đang gửi' :
                     msg.status === 'sent' ? <><span className="mr-0.5">✓</span> Đã gửi</> :
                     msg.status === 'delivered' ? <><span className="tracking-[-0.25em] mr-1">✓✓</span> Đã nhận</> :
                     msg.status === 'failed' ? '❌ Thất bại' :
                     msg.status === 'read' ? <><span className="tracking-[-0.25em] mr-1">✓✓</span> Đã xem</> : <span className="tracking-[-0.25em]">✓✓</span>}
                </div>
            )}
            {isMine && !msg.status && <div className="h-1" />}
        </div>
    );
}


/* ===== Attachment Sub-Components ===== */

function ImageAttachments({ msg, isMine, isMultiSelectMode, onSetLightbox }: { msg: ChatMessage; isMine: boolean; isMultiSelectMode: boolean; onSetLightbox: (url: string) => void }) {
    if (!(msg.contentType === 'image' || msg.attachments?.some(a => ['image', 'sticker'].includes(a.type)))) return null;
    return (
        <div className={`${(msg.content && msg.content !== '[Hình ảnh]') ? 'mb-1.5' : 'mb-0'}`}>
            {msg.attachments?.filter(a => ['image', 'sticker'].includes(a.type)).map((att, ai) => {
                const displayUrl = att.localUrl ? `${API_URL}/media/file?path=${encodeURIComponent(att.localUrl)}` : att.url;
                return (
                    <img key={ai} src={displayUrl} alt="Attachment" referrerPolicy="no-referrer" 
                        className={`max-w-full object-contain cursor-pointer block 
                            ${att.type === 'sticker' ? 'max-h-[150px] rounded-none bg-transparent' : 'max-h-[250px] rounded-md bg-inherit'}`}
                    onClick={(e) => {
                        if (isMultiSelectMode) return;
                        e.stopPropagation();
                        // Only open lightbox if it's not a broken image
                        if (!e.currentTarget.dataset.error) {
                            onSetLightbox(displayUrl);
                        }
                    }}
                    onError={(e) => {
                        const target = e.currentTarget;
                        target.onerror = null;
                        target.dataset.error = "true";
                        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2' ry='2'/%3E%3Ccircle cx='8.5' cy='8.5' r='1.5'/%3E%3Cpolyline points='21 15 16 10 5 21'/%3E%3Cline x1='3' y1='3' x2='21' y2='21' stroke='%23ef4444' stroke-width='1.5'/%3E%3C/svg%3E";
                        target.className = `max-w-[200px] w-full object-contain bg-gray-50 border border-dashed border-gray-300 p-8 rounded-md ${att.type === 'sticker' ? 'max-h-[150px]' : 'max-h-[250px]'}`;
                        target.title = "Hình ảnh đã hết hạn hoặc không thể tải";
                    }}
                    />
                );
            })}
        </div>
    );
}

function FileAttachments({ msg }: { msg: ChatMessage }) {
    if (!msg.attachments?.some(a => a.type === 'file')) return null;
    const extMap: Record<string, { icon: string; bg: string }> = {
        'ai': { icon: 'Ai', bg: '#FF6C00' }, 'psd': { icon: 'Ps', bg: '#31A8FF' },
        'pdf': { icon: 'PDF', bg: '#E53935' }, 'doc': { icon: 'W', bg: '#2B579A' },
        'docx': { icon: 'W', bg: '#2B579A' }, 'xls': { icon: 'X', bg: '#217346' },
        'xlsx': { icon: 'X', bg: '#217346' }, 'zip': { icon: 'ZIP', bg: '#FFC107' },
        'rar': { icon: 'RAR', bg: '#7B1FA2' }, 'eps': { icon: 'EPS', bg: '#FF6C00' },
        'cdr': { icon: 'CDR', bg: '#6EB43F' }, 'svg': { icon: 'SVG', bg: '#FFB300' },
    };

    return (
        <div className={`flex flex-col gap-1 ${(msg.content && msg.content !== '[Tập tin đính kèm]') ? 'mb-1.5' : 'mb-0'}`}>
            {msg.attachments?.filter(a => a.type === 'file').map((att, ai) => {
                const fName = att.name || att.url?.split('/').pop() || 'Tập tin';
                const fExt = fName.split('.').pop()?.toLowerCase() || '';
                const fSizeKB = (att as any).size ? ((att as any).size / 1024).toFixed(2) : '';
                const eInfo = extMap[fExt] || { icon: fExt.toUpperCase().slice(0, 3) || '?', bg: '#78909C' };
                const displayUrl = att.localUrl ? `${API_URL}/media/file?path=${encodeURIComponent(att.localUrl)}` : att.url;
                return (
                    <div key={ai} className="flex items-center gap-3 py-1 min-w-[260px] max-w-[380px]">
                        <div
                            className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-extrabold text-base shrink-0"
                            style={{ background: eInfo.bg }}
                        >{eInfo.icon}</div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-gray-900 overflow-hidden text-ellipsis whitespace-nowrap">{fName}</span>
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                {fSizeKB ? `${fSizeKB} KB` : fExt.toUpperCase()}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                                <span className="text-green-600">Đã có trên máy</span>
                            </span>
                        </div>
                        <div className="flex gap-0.5 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(displayUrl); }}
                                className="bg-transparent border border-gray-300 rounded-md p-1.5 cursor-pointer flex hover:bg-gray-100" title="Sao chép liên kết">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); window.open(displayUrl, '_blank'); }}
                                className="bg-transparent border border-gray-300 rounded-md p-1.5 cursor-pointer flex hover:bg-gray-100" title="Tải xuống">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function AudioAttachments({ msg }: { msg: ChatMessage }) {
    if (!msg.attachments?.some(a => a.type === 'voice' || a.type === 'audio')) return null;
    return (
        <div className={`flex flex-col gap-1 ${(msg.content && !msg.content.startsWith('{')) ? 'mb-1.5' : 'mb-0'}`}>
            {msg.attachments?.filter(a => a.type === 'voice' || a.type === 'audio').map((att, ai) => {
                const displayUrl = att.localUrl ? `${API_URL}/media/file?path=${encodeURIComponent(att.localUrl)}` : att.url;
                return <audio key={ai} controls src={displayUrl} className="h-10 w-[250px] outline-none" />;
            })}
        </div>
    );
}

function TextContent({ msg, isMine, messages, selectedConversation }: { msg: ChatMessage; isMine: boolean; messages: ChatMessage[]; selectedConversation: Conversation }) {
    const content = msg.content || '';

    // Handle JSON content (calls, system msgs)
    if (content.startsWith('{')) {
        try {
            const data = JSON.parse(content);

            if (content.includes('"title":"sendBubbleMessage"')) {
                if (data.description === 'Cuộc gọi' || (data.params && data.params.includes('duration'))) {
                    const p = typeof data.params === 'string' ? JSON.parse(data.params) : data.params;
                    const isMissed = p.duration === 0;
                    return (
                        <div className="flex items-center gap-3 py-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMissed ? 'bg-red-100' : 'bg-green-100'}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isMissed ? '#dc2626' : '#16a34a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-sm">{data.description || 'Cuộc gọi Zalo'}</span>
                                <span className="text-xs text-slate-500">
                                    {p.duration > 0 ? `Thời lượng: ${Math.floor(p.duration / 60)} phút ${p.duration % 60} giây` : 'Cuộc gọi nhỡ'}
                                </span>
                            </div>
                        </div>
                    );
                }
            }

            if (data.title && (data.action || typeof data.childnumber !== 'undefined')) {
                const isFriendReq = data.action === 'msginfo.actionlist' || (data.title && data.title.includes('kết bạn'));
                return (
                    <div className="flex items-center gap-2 py-1">
                        <span className="text-lg">{isFriendReq ? '🤝' : '📌'}</span>
                        <span className="text-[13px] text-slate-700 italic font-medium leading-snug">{data.title}</span>
                    </div>
                );
            }

            if (data.text || data.message) {
                return <div className="text-sm leading-relaxed">{data.text || data.message}</div>;
            }
        } catch (e) { /* not valid JSON, fall through */ }
    }

    // Skip redundant attachment URLs
    const isOnlyAttachmentUrl = msg.attachments?.some(a => a.url && content.trim() === a.url);
    const isJustZdnLink = (msg.contentType === 'image' || msg.attachments?.some(a => ['image', 'sticker'].includes(a.type)))
        && content.trim().startsWith('http')
        && !content.trim().includes(' ')
        && (content.includes('.zdn.vn') || content.includes('zaloapp.com'));

    if (isOnlyAttachmentUrl || isJustZdnLink || content === '[Tập tin đính kèm]' ||
        (msg.contentType === 'image' && (!content || content === '[Hình ảnh]' || content === '[Hình ảnh đính kèm]' || content === '[Sticker Zalo]'))) {
        return null;
    }

    // Quote / Reply parsing
    let quoteAuthor = 'Trích dẫn';
    let quoteSnippet: string | null = null;
    let mainContent = content;
    const quoteMatch = content.match(/^\[Trả lời:\s*([^\]]+)\]\n([\s\S]*)$/);
    if (quoteMatch) {
        quoteSnippet = quoteMatch[1];
        mainContent = quoteMatch[2];
    } else if (msg.quoteId || msg.quoteData) {
        if (msg.quoteId) {
            const qMsg = messages.find(m => m.id === msg.quoteId);
            if (qMsg) {
                quoteSnippet = qMsg.contentType === 'image' ? '[Hình ảnh]' : (qMsg.content || '');
                quoteAuthor = qMsg.senderType === 'agent' ? 'Bạn' : (qMsg.senderName || selectedConversation.contact?.displayName || 'Khách hàng');
            }
        } else if (msg.quoteData) {
            const qd = msg.quoteData;
            // Strict check: For ZCA-JS payloads, the actual quote is inside qd.quote
            // If qd itself is the quote block, it might have qmsg or content.
            // But if qd is the full message data, it has qd.msgId and qd.content.
            const isFullMessageObj = !!qd.msgId || !!qd.ts;
            
            let qText = null;
            if (qd.quote) {
               qText = qd.quote.msg || qd.quote.content;
            } else if (qd.qmsg) {
               qText = qd.qmsg;
            } else if (!isFullMessageObj && qd.content) {
               qText = qd.content;
            }
            
            if (typeof qText === 'string') quoteSnippet = qText;
            else if (qd.quote?.msgType || qd.qmsgType) quoteSnippet = `[${qd.quote?.msgType || qd.qmsgType}]`;

            if (quoteSnippet) {
                if (qd.quote?.ownerId || qd.qmsgOwner) {
                    const ownerId = String(qd.quote?.ownerId || qd.qmsgOwner);
                    if (ownerId === '0') quoteAuthor = 'Bạn';
                    else quoteAuthor = selectedConversation.contact?.displayName || 'Khách hàng';
                } else {
                    quoteAuthor = selectedConversation.contact?.displayName || 'Khách hàng';
                }
            }
        }
        if (quoteSnippet && quoteSnippet.length > 50) quoteSnippet = quoteSnippet.substring(0, 50) + '...';
    }

    return (
        <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-900 w-full">
            {quoteSnippet && (
                <div
                    className={`mb-2 rounded-r py-1.5 px-2.5 text-[13px] italic opacity-85 flex flex-col border-l-[3px] border-l-blue-600
                        ${isMine ? 'bg-black/4 text-gray-600' : 'bg-[#e5efff] text-blue-900'}`}
                >
                    <span className="font-semibold text-xs mb-0.5 opacity-70 not-italic">{quoteAuthor}</span>
                    <span className="overflow-hidden text-ellipsis line-clamp-2">{quoteSnippet}</span>
                </div>
            )}
            {mainContent.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
                /^https?:\/\/[^\s]+$/.test(part) ? (
                    <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-[#005ae0] underline break-all" onClick={(e) => e.stopPropagation()}>
                        {part}
                    </a>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </div>
    );
}

function ReactionBadges({ msg, isMine, optimisticReactions, onReact }: {
    msg: ChatMessage; isMine: boolean;
    optimisticReactions: Record<string, Record<string, number>>;
    onReact: (msgId: string, icon: string) => void;
}) {
    // Merge: use optimistic if it exists (hasn't been cleared yet), otherwise use server data
    const hasOptimistic = msg.id in optimisticReactions;
    const combinedReactions = hasOptimistic ? optimisticReactions[msg.id] : (msg.reactions || {});
    const reactionEntries = Object.entries(combinedReactions).filter(([_, count]) => count > 0);
    if (reactionEntries.length === 0) return null;

    reactionEntries.sort((a, b) => b[1] - a[1]);
    const totalCount = reactionEntries.reduce((sum, [_, count]) => sum + count, 0);

    return (
        <div
            className={`absolute -bottom-2 bg-white rounded-full px-1 py-px flex items-center shadow-[0_1px_3px_rgba(0,0,0,0.12)] z-10 cursor-pointer transition-transform hover:scale-105 border border-slate-100
                ${isMine ? 'left-1' : 'right-1'}`}
            onClick={(e) => {
                e.stopPropagation();
                const topIcon = reactionEntries[0]?.[0];
                if (topIcon) onReact(msg.id, topIcon);
            }}
            title="Bấm để thả thêm"
        >
            <div className="flex items-center">
                {reactionEntries.map(([icon], i) => (
                    <span key={icon} className={`flex justify-center items-center w-[16px] h-[16px] ${i > 0 ? '-ml-0.5' : ''}`}>
                        <ReactionIcon type={icon} size={14} />
                    </span>
                ))}
            </div>
            {totalCount > 1 && <span className="ml-0.5 text-[10px] text-slate-600 font-medium leading-none">{totalCount}</span>}
        </div>
    );
}
