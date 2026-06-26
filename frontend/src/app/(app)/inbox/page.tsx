'use client';

import { useAuth } from '@/lib/auth-context';
import { API_URL as API } from '@/lib/api';
import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@/lib/ui/toast';
import { useInboxLogic } from './_hooks/useInboxLogic';
import ConversationList from './_components/ConversationList';
import ChatArea, { ChatAreaRef } from './_components/ChatArea';
import RightSidebar from './_components/RightSidebar';
import { DeleteConfirmModal } from './_components/DeleteConfirmModal';
import type { Suggestion } from './types';

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

    // -- Resizable Panes State --
    const [leftWidth, setLeftWidth] = useState(320);
    const [rightWidth, setRightWidth] = useState(340);
    const dragRef = useRef<{ type: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

    const chatAreaRef = useRef<ChatAreaRef>(null);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const [rightCollapsed, setRightCollapsed] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const delta = e.clientX - dragRef.current.startX;
            if (dragRef.current.type === 'left') {
                setLeftWidth(Math.max(200, Math.min(500, dragRef.current.startWidth + delta)));
            } else {
                setRightWidth(Math.max(280, Math.min(600, dragRef.current.startWidth - delta)));
            }
        };
        const handleMouseUp = () => {
            if (dragRef.current) {
                dragRef.current = null;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const selectedConversation = state.conversations.find(c => c.id === state.selectedId) || null;

    const handleSendMessage = async (text: string, imageFile: File | null, replyToId?: string) => {
        if (!state.selectedId) return;
        await actions.sendMessage(state.selectedId, text, imageFile, replyToId);
    };

    const handleAcceptSuggestion = async (suggestion: Suggestion, replyIndex: number) => {
        const text = suggestion.replies[replyIndex]?.text;
        if (!text || !state.selectedId) return;
        
        const stripMarkdown = (str: string) => str.replace(/\*\*(.*?)\*\*/g, '$1').replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '$1');
        await actions.sendMessage(state.selectedId, stripMarkdown(text));
        actions.markSuggestionSent(suggestion.id, replyIndex, suggestion.replies.length);
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

    return (
        <div className="flex h-screen w-full overflow-hidden">
            {/* LEFT PANE — Conversation List */}
            <div
                className="shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)]"
                style={{ width: leftWidth }}
            >
                <ConversationList 
                    conversations={state.conversations}
                    loading={state.loading}
                    selectedId={state.selectedId}
                    slaWarnings={state.slaWarnings}
                    tagFilter={state.tagFilter}
                    availableTags={state.availableTags}
                    onSelect={actions.setSelectedId}
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

            {/* LEFT RESIZE HANDLE */}
            <div
                onMouseDown={e => startResizeDrag('left', e)}
                className="w-1 cursor-col-resize shrink-0 z-5 transition-colors hover:bg-blue-300"
            />

            {/* CENTER PANE — Chat */}
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
                rightSidebarVisible={!rightCollapsed}
                onToggleRightSidebar={() => setRightCollapsed(c => !c)}
            />

            {/* RIGHT SIDEBAR */}
            {state.selectedId && selectedConversation && (
                <>
                    {!rightCollapsed && (
                        <div
                            onMouseDown={e => startResizeDrag('right', e)}
                            className="w-1 cursor-col-resize shrink-0 z-5 transition-colors hover:bg-blue-300"
                        />
                    )}

                    {!rightCollapsed && (
                        <div
                            className="shrink-0 border-l border-[var(--border)] flex flex-col bg-[#fafbfc] transition-[width] duration-200"
                            style={{ width: rightWidth }}
                        >
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
                            />
                        </div>
                    )}
                </>
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
