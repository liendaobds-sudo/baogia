'use client';

import { useAuth } from '@/lib/auth-context';
import { API_URL as API } from '@/lib/api';
import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/lib/ui/toast';
import { useInboxLogic } from './_hooks/useInboxLogic';
import { useIsNarrow } from './_hooks/useIsNarrow';
import { useViewportFit } from './_hooks/useViewportFit';
import { nextNarrowView, type NarrowView } from './_lib/narrowView';
import ConversationList from './_components/ConversationList';
import ChatArea, { ChatAreaRef } from './_components/ChatArea';
import RightSidebar from './_components/RightSidebar';
import { DeleteConfirmModal } from './_components/DeleteConfirmModal';
import type { Suggestion } from './types';
import { deliverSuggestionReply } from './_lib/suggestionDelivery';

export default function InboxPage() {
    // ToastProvider được mount tại đây vì layout (app) chưa cung cấp Toast_System.
    return (
        <ToastProvider>
            <InboxPageInner />
        </ToastProvider>
    );
}

function InboxPageInner() {
    const { token, authFetch } = useAuth();
    const toast = useToast();
    const queryClient = useQueryClient();
    const { state, actions } = useInboxLogic(token, authFetch, toast);

    // -- Resizable Panes State (lưu vào localStorage để giữ giữa các phiên) --
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const [leftWidth, setLeftWidth] = useState(() => {
        if (typeof window !== 'undefined') { const v = Number(localStorage.getItem('zh_inbox_left_w')); if (v >= 200 && v <= 500) return v; }
        return 320;
    });
    const [rightWidth, setRightWidth] = useState(() => {
        if (typeof window !== 'undefined') { const v = Number(localStorage.getItem('zh_inbox_right_w')); if (v >= 280 && v <= 600) return v; }
        return 340;
    });
    const dragRef = useRef<{ type: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

    useEffect(() => { localStorage.setItem('zh_inbox_left_w', String(leftWidth)); }, [leftWidth]);
    useEffect(() => { localStorage.setItem('zh_inbox_right_w', String(rightWidth)); }, [rightWidth]);

    const chatAreaRef = useRef<ChatAreaRef>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    // Màn hẹp (<1200px): mặc định thu gọn sidebar phải để vùng chat không bị bóp (Bố_Cục_Rộng).
    const [rightCollapsed, setRightCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1200);

    // -- Bố_Cục_Hẹp (single-column, < 1024px) --
    const isNarrow = useIsNarrow();
    const [narrowView, setNarrowView] = useState<NarrowView>('list');
    useViewportFit(rootRef); // chiều cao vừa khít viewport (banner-safe)

    useEffect(() => {
        const applyDelta = (clientX: number) => {
            if (!dragRef.current) return;
            const delta = clientX - dragRef.current.startX;
            if (dragRef.current.type === 'left') {
                setLeftWidth(clamp(dragRef.current.startWidth + delta, 200, 500));
            } else {
                setRightWidth(clamp(dragRef.current.startWidth - delta, 280, 600));
            }
        };
        const handleMouseMove = (e: MouseEvent) => applyDelta(e.clientX);
        const handleTouchMove = (e: TouchEvent) => { if (dragRef.current && e.touches[0]) applyDelta(e.touches[0].clientX); };
        const handleEnd = () => {
            if (dragRef.current) {
                dragRef.current = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleTouchMove, { passive: true });
        window.addEventListener('touchend', handleEnd);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, []);

    const selectedConversation = state.conversations.find(c => c.id === state.selectedId) || null;

    // Bỏ chọn/không còn hội thoại → quay về Khung_Danh_Sách (Bố_Cục_Hẹp).
    useEffect(() => {
        if (!state.selectedId) setNarrowView(v => nextNarrowView(v, 'clearSelected'));
    }, [state.selectedId]);

    // Chọn hội thoại: cập nhật selection; ở Bố_Cục_Hẹp thì chuyển sang Khung_Chat.
    const selectConversation = (id: string) => {
        actions.setSelectedId(id);
        if (isNarrow) setNarrowView(v => nextNarrowView(v, 'select'));
    };

    const handleSendMessage = async (text: string, imageFile: File | null, replyToId?: string) => {
        if (!state.selectedId) return;
        await actions.sendMessage(state.selectedId, text, imageFile, replyToId);
    };

    const handleAcceptSuggestion = async (suggestion: Suggestion, replyIndex: number) => {
        const text = suggestion.replies[replyIndex]?.text;
        if (!text || !state.selectedId) return;
        
        const stripMarkdown = (str: string) => str.replace(/\*\*(.*?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1');
        await deliverSuggestionReply(
            () => actions.sendMessage(state.selectedId!, stripMarkdown(text)),
            () => actions.markSuggestionSent(suggestion.id, replyIndex, suggestion.replies.length),
        );
    };

    const handleEditSuggestion = (_suggestion: Suggestion, _replyIndex: number) => {
        // RightSidebar calls onInjectText to put text in textarea
    };

    const startResizeDrag = (type: 'left' | 'right', e: React.MouseEvent) => {
        e.preventDefault();
        const startWidth = type === 'left' ? leftWidth : rightWidth;
        dragRef.current = { type, startX: e.clientX, startWidth };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    const startResizeTouch = (type: 'left' | 'right', e: React.TouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        const startWidth = type === 'left' ? leftWidth : rightWidth;
        dragRef.current = { type, startX: t.clientX, startWidth };
    };

    // Điều chỉnh bằng bàn phím (mũi tên trái/phải, bước 16px) — a11y cho separator.
    const nudgeResize = (type: 'left' | 'right', e: React.KeyboardEvent) => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const step = 16 * dir;
        if (type === 'left') setLeftWidth(w => clamp(w + step, 200, 500));
        else setRightWidth(w => clamp(w - step, 280, 600)); // kéo phải: trái=rộng hơn
    };

    // Panel thông tin (dùng chung cho cả hai bố cục) — onCloseNarrow chỉ set ở Bố_Cục_Hẹp.
    const renderRightSidebar = (onCloseNarrow?: () => void) => (
        <RightSidebar
            token={token || ''}
            selectedConversation={selectedConversation}
            messages={state.messages}
            suggestions={state.suggestions}
            sentReplies={state.sentReplies}
            notes={state.notes}
            participants={state.participants}
            agents={state.agents}
            onAcceptSuggestion={handleAcceptSuggestion}
            onEditSuggestion={handleEditSuggestion}
            onAddNote={(content, scope) => state.selectedId && actions.addNote(state.selectedId, content, scope as any)}
            onTogglePinNote={(noteId) => state.selectedId && actions.togglePinNote(state.selectedId, noteId)}
            onDeleteNote={(noteId) => state.selectedId && actions.deleteNote(state.selectedId, noteId)}
            onToggleCollaboratorAccess={(userId, canView) => state.selectedId && actions.collabActions.toggleAccess(state.selectedId, userId, canView)}
            onAddCollaborator={(userId) => state.selectedId && actions.collabActions.add(state.selectedId, userId)}
            onRemoveCollaborator={(userId) => state.selectedId && actions.collabActions.remove(state.selectedId, userId)}
            onTransferConversation={(agentId) => state.selectedId && actions.transferConversation(state.selectedId, agentId)}
            onInjectText={(text) => chatAreaRef.current?.injectText(text)}
            onCloseNarrow={onCloseNarrow}
        />
    );

    return (
        <div ref={rootRef} className={`flex h-[100dvh] w-full overflow-hidden ${isNarrow ? 'flex-col' : ''}`}>
            {/* LEFT PANE — Conversation List (full-width khi hẹp; ẩn khi không ở Khung_Danh_Sách) */}
            <div
                className={`overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] ${isNarrow ? (narrowView === 'list' ? 'flex-1 min-h-0 w-full' : 'hidden') : 'shrink-0'}`}
                style={isNarrow ? undefined : { width: leftWidth }}
            >
                <ConversationList 
                    conversations={state.conversations}
                    loading={state.loading}
                    selectedId={state.selectedId}
                    slaWarnings={state.slaWarnings}
                    tagFilter={state.tagFilter}
                    availableTags={state.availableTags}
                    onSelect={selectConversation}
                    onSetTagFilter={actions.setTagFilter}
                    onDeleteConversation={(id) => setConversationToDelete(id)}
                    onMarkAsUnread={actions.markAsUnread}
                    onTogglePin={actions.togglePinConversation}
                    onToggleTag={actions.toggleTag}
                    onMarkAllRead={actions.markAllRead}
                    onSyncZalo={async () => {
                        try {
                            const response = await authFetch(`${API}/zalo-personal/sync-all`, { method: 'POST' });
                            const res = await response.json();
                            if (res.success) {
                                const entries = Object.values(res.data || {}) as any[];
                                const totalSynced = entries.reduce((sum, r) => sum + (r.synced || 0), 0);
                                const totalSkipped = entries.reduce((sum, r) => sum + (r.skipped || 0), 0);
                                const errors = entries.filter(r => r.error);
                                let msg = `Đồng bộ hoàn tất: ${totalSynced} tin mới, ${totalSkipped} đã có sẵn`;
                                if (errors.length > 0) msg += `; ${errors.length} tài khoản lỗi: ${errors.map(e => e.error).join('; ')}`;
                                toast.show(errors.length > 0 ? 'info' : 'success', msg);
                                // Làm mới dữ liệu hội thoại mà KHÔNG tải lại trang (giữ nguyên màn hình).
                                if (totalSynced > 0) {
                                    queryClient.invalidateQueries({ queryKey: ['conversations'] });
                                }
                            } else {
                                toast.show('error', res.error || 'Không có account Zalo nào. Vào Cài đặt → Quét QR trước.');
                            }
                        } catch (e: any) { toast.show('error', 'Lỗi: ' + (e.message || 'Không kết nối được server')); }
                    }}
                />
            </div>

            {/* LEFT RESIZE HANDLE (chỉ ở Bố_Cục_Rộng) */}
            {!isNarrow && (
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Kéo để đổi độ rộng danh sách hội thoại"
                    tabIndex={0}
                    onMouseDown={e => startResizeDrag('left', e)}
                    onTouchStart={e => startResizeTouch('left', e)}
                    onKeyDown={e => nudgeResize('left', e)}
                    className="w-2 -mx-0.5 cursor-col-resize shrink-0 z-[5] transition-colors hover:bg-blue-300 focus:bg-blue-400 focus:outline-none touch-none"
                />
            )}

            {/* CENTER PANE — Chat (wrapper `contents` ở Rộng để không đổi layout; ẩn khi hẹp & không ở Khung_Chat) */}
            <div className={isNarrow ? (narrowView === 'chat' ? 'flex flex-1 min-w-0' : 'hidden') : 'contents'}>
                <ChatArea 
                    ref={chatAreaRef}
                    selectedConversation={selectedConversation}
                    conversations={state.conversations}
                    messages={state.messages}
                    quickReplies={state.quickReplies}
                    typingStatuses={state.typingStatuses}
                    agentThought={state.agentThought}
                    onSend={handleSendMessage}
                    onForwardMessage={async (targetIds, content, note) => {
                        for (const tid of targetIds) {
                            const fwdText = note ? `[Chuyển tiếp]\n${content}\n---\n${note}` : `[Chuyển tiếp]\n${content}`;
                            await actions.sendMessage(tid, fwdText);
                        }
                    }}
                    onStatusChange={(status) => state.selectedId && actions.updateStatus(state.selectedId, status)}
                    onPriorityChange={(priority) => state.selectedId && actions.updatePriority(state.selectedId, priority)}
                    onRecordQRUsage={actions.recordCannedResponseUsage}
                    onDeleteConversation={() => state.selectedId && actions.deleteConversation(state.selectedId)}
                    onRecallMessage={(msgId) => state.selectedId && actions.recallMessage(state.selectedId, msgId)}
                    onPinMessage={(msgId) => state.selectedId && actions.pinMessage(state.selectedId, msgId)}
                    onStarMessage={(msgId) => state.selectedId && actions.starMessage(state.selectedId, msgId)}
                    onDeleteLocalMessage={(msgId) => state.selectedId && actions.deleteLocalMessage(state.selectedId, msgId)}
                    rightSidebarVisible={isNarrow ? narrowView === 'info' : !rightCollapsed}
                    onToggleRightSidebar={isNarrow
                        ? () => setNarrowView(v => nextNarrowView(v, v === 'info' ? 'closeInfo' : 'openInfo'))
                        : () => setRightCollapsed(c => !c)}
                    showBackButton={isNarrow}
                    onBack={() => setNarrowView(v => nextNarrowView(v, 'back'))}
                />
            </div>

            {/* RIGHT SIDEBAR — Bố_Cục_Rộng: pane có resize + thu gọn */}
            {!isNarrow && state.selectedId && selectedConversation && !rightCollapsed && (
                <>
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Kéo để đổi độ rộng bảng thông tin"
                        tabIndex={0}
                        onMouseDown={e => startResizeDrag('right', e)}
                        onTouchStart={e => startResizeTouch('right', e)}
                        onKeyDown={e => nudgeResize('right', e)}
                        className="w-2 -mx-0.5 cursor-col-resize shrink-0 z-[5] transition-colors hover:bg-blue-300 focus:bg-blue-400 focus:outline-none touch-none"
                    />
                    <div
                        className="shrink-0 border-l border-[var(--border)] flex flex-col bg-[#fafbfc] transition-[width] duration-200"
                        style={{ width: rightWidth }}
                    >
                        {renderRightSidebar()}
                    </div>
                </>
            )}

            {/* RIGHT SIDEBAR — Bố_Cục_Hẹp: khung thông tin toàn màn */}
            {isNarrow && selectedConversation && (
                <div className={narrowView === 'info' ? 'flex flex-col flex-1 min-w-0 bg-[#fafbfc]' : 'hidden'}>
                    {renderRightSidebar(() => setNarrowView(v => nextNarrowView(v, 'closeInfo')))}
                </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {conversationToDelete && (
                <DeleteConfirmModal
                    onConfirm={async () => {
                        await actions.deleteConversation(conversationToDelete, true);
                        setConversationToDelete(null);
                    }}
                    onCancel={() => setConversationToDelete(null)}
                />
            )}
        </div>
    );
}
