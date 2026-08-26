import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '@/lib/socket-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, ChatMessage, Suggestion, QuickReply, Note, Participant, User } from '../types';

import { API_URL as API } from '@/lib/api';
import type { ToastApi } from '@/lib/ui/toast';
import { runOptimistic } from '../_lib/optimistic';

/** Toast no-op khi hook được dùng mà không truyền Toast_System (an toàn cho test). */
const NOOP_TOAST: ToastApi = { show: () => {} };

export function useInboxLogic(
    token: string | null,
    authFetch: (url: string, options?: RequestInit) => Promise<Response>,
    toast: ToastApi = NOOP_TOAST,
) {
    const { socket, joinConversation, leaveConversation } = useSocket();
    const queryClient = useQueryClient();

    const [slaWarnings, setSlaWarnings] = useState<Set<string>>(new Set());
    
    const [selectedId, setSelectedIdState] = useState<string | null>(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const chatId = params.get('chat');
            if (chatId) return chatId;
            return localStorage.getItem('last_chat_id') || null;
        }
        return null;
    });

    const setSelectedId = useCallback((id: string | null) => {
        setSelectedIdState(id);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (id) {
                localStorage.setItem('last_chat_id', id);
                url.searchParams.set('chat', id);
            } else {
                localStorage.removeItem('last_chat_id');
                url.searchParams.delete('chat');
            }
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    const [tagFilter, setTagFilter] = useState('');
    const [agentThought, setAgentThought] = useState<{ conversationId: string; message: string; tool: string } | null>(null);
    const [typingStatuses, setTypingStatuses] = useState<Record<string, boolean>>({});
    const [sentReplies, setSentReplies] = useState<Record<string, Set<number>>>({});

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json',
    }), [token]);

    // -- Queries --
    const { data: conversations = [], isLoading: loading } = useQuery<Conversation[]>({
        queryKey: ['conversations', tagFilter],
        queryFn: async () => {
            const tagParam = tagFilter ? `&tag=${encodeURIComponent(tagFilter)}` : '';
            const res = await authFetch(`${API}/conversations?page=1&limit=50${tagParam}`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch conversations');
            const data = await res.json();
            return data.data || [];
        },
        enabled: !!token,
    });

    const { data: availableTags = [] } = useQuery<{ tag: string; count: number }[]>({
        queryKey: ['conversations', 'tags'],
        queryFn: async () => {
            const res = await authFetch(`${API}/conversations/tags`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch tags');
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        },
        enabled: !!token,
    });

    const { data: quickReplies = [] } = useQuery<QuickReply[]>({
        queryKey: ['quickReplies'],
        queryFn: async () => {
            const res = await authFetch(`${API}/canned-responses`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch tags');
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        },
        enabled: !!token,
    });

    const { data: agents = [] } = useQuery<User[]>({
        queryKey: ['agents'],
        queryFn: async () => {
            const res = await authFetch(`${API}/users`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            return Array.isArray(data) ? data : (data.data || []);
        },
        enabled: !!token,
    });

    const { data: messages = [] } = useQuery<ChatMessage[]>({
        queryKey: ['messages', selectedId],
        queryFn: async () => {
            const res = await authFetch(`${API}/conversations/${selectedId}/messages?limit=100`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch messages');
            const data = await res.json();
            return data.data || data || [];
        },
        enabled: !!token && !!selectedId,
    });

    const { data: suggestions = [] } = useQuery<Suggestion[]>({
        queryKey: ['suggestions', selectedId],
        queryFn: async () => {
            const res = await authFetch(`${API}/suggestions/conversation/${selectedId}`, { headers: headers() });
            if (!res.ok) throw new Error('Failed to fetch suggestions');
            return await res.json() || [];
        },
        enabled: !!token && !!selectedId,
    });

    const { data: notes = [] } = useQuery<Note[]>({
        queryKey: ['notes', selectedId],
        queryFn: async () => {
            const res = await authFetch(`${API}/conversations/${selectedId}/notes`, { headers: headers() });
            if (!res.ok) return [];
            return await res.json();
        },
        enabled: !!token && !!selectedId,
    });

    const { data: participants = [] } = useQuery<Participant[]>({
        queryKey: ['participants', selectedId],
        queryFn: async () => {
            const res = await authFetch(`${API}/conversations/${selectedId}/participants`, { headers: headers() });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        },
        enabled: !!token && !!selectedId,
    });

    useEffect(() => {
        if (selectedId) {
            joinConversation(selectedId);
            
            // Mark as read immediately optimistically & remote sync
            queryClient.setQueryData<Conversation[]>(['conversations', tagFilter], (prev = []) => 
                prev.map(c => c.id === selectedId && (c.unreadCount ?? 0) > 0 ? { ...c, unreadCount: 0 } : c)
            );
            authFetch(`${API}/conversations/${selectedId}`, {
                method: 'PATCH',
                headers: headers(),
                body: JSON.stringify({ unreadCount: 0 })
            }).catch(() => {});

            return () => leaveConversation(selectedId);
        }
    }, [selectedId, joinConversation, leaveConversation, headers, queryClient, tagFilter]);

    // -- Socket Event Listeners --
    const seenMsgIds = useRef(new Set<string>());
    const typingTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

    useEffect(() => {
        if (!socket) return;
        const handleNewMsg = (data: { conversationId: string; message: ChatMessage }) => {
            if (seenMsgIds.current.has(data.message.id)) return;
            seenMsgIds.current.add(data.message.id);
            if (seenMsgIds.current.size > 500) {
                seenMsgIds.current = new Set(Array.from(seenMsgIds.current).slice(-200));
            }
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => {
                    return prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message];
                });
                // We're actively viewing this conversation, so keep unreadCount = 0
                queryClient.setQueryData<Conversation[]>(['conversations', tagFilter], (prev = []) => 
                    prev.map(c => c.id === selectedId ? { ...c, unreadCount: 0 } : c)
                );
            }
            queryClient.invalidateQueries({ queryKey: ['conversations'] }).then(() => {
                // After re-fetch, ensure viewed conversation stays at 0
                if (data.conversationId === selectedId) {
                    queryClient.setQueryData<Conversation[]>(['conversations', tagFilter], (prev = []) => 
                        prev.map(c => c.id === selectedId ? { ...c, unreadCount: 0 } : c)
                    );
                }
            });
        };
        const handleNewSugg = (data: { conversationId: string; suggestion: Suggestion }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<Suggestion[]>(['suggestions', selectedId], (prev = []) => [data.suggestion, ...prev]);
            }
        };
        // Suggestion đã được AUTO-GỬI ở backend → đánh dấu 'sent' để panel ẩn nút "Gửi" (chống gửi 2 lần)
        const handleSuggestionSent = (data: { conversationId: string; suggestionId: string }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<Suggestion[]>(['suggestions', selectedId], (prev = []) =>
                    prev.map(s => s.id === data.suggestionId ? { ...s, status: 'sent' } : s)
                );
            }
        };
        const handleConvUpdate = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });
        const handleSlaWarning = (data: { conversationId: string; minutesLeft: number }) => {
            setSlaWarnings(prev => new Set(prev).add(data.conversationId));
        };
        const handleAutoReply = (data: { conversationId: string; message: { text: string } }) => {
            if (data.conversationId === selectedId) {
                queryClient.invalidateQueries({ queryKey: ['messages', selectedId] });
            }
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        };
        const handleMessageStatus = (data: { conversationId: string; messageId: string; status: string }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => (data.messageId === 'all' || m.id === data.messageId) ? { ...m, status: data.status } : m)
                );
            }
        };
        const handleTyping = (data: { conversationId: string; extUserId: string; isTyping: boolean }) => {
            setTypingStatuses(prev => ({ ...prev, [data.conversationId]: data.isTyping }));
            if (data.isTyping) {
                if (typingTimeouts.current[data.conversationId]) {
                    clearTimeout(typingTimeouts.current[data.conversationId]);
                }
                typingTimeouts.current[data.conversationId] = setTimeout(() => {
                    setTypingStatuses(prev => ({ ...prev, [data.conversationId]: false }));
                }, 5000);
            }
        };
        const handleAgentThought = (data: { conversationId: string; message: string; tool: string }) => {
            if (data.conversationId === selectedId) {
                setAgentThought(data);
                setTimeout(() => setAgentThought(null), 10000); // Tự xóa sau 10s nếu không có update
            }
        };

        const handleMessageRecalled = (data: { conversationId: string; messageId: string; status: string }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.messageId ? { ...m, status: data.status, content: '[Tin nhắn đã thu hồi]' } : m)
                );
            }
        };

        const handleMessagePinned = (data: { conversationId: string; messageId: string; isPinned: boolean }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.messageId ? { ...m, isPinned: data.isPinned } : m)
                );
            }
        };

        const handleMessageStarred = (data: { conversationId: string; messageId: string; isStarred: boolean }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.messageId ? { ...m, isStarred: data.isStarred } : m)
                );
            }
        };

        const handleMessageLocalDeleted = (data: { conversationId: string; messageId: string }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.filter(m => m.id !== data.messageId)
                );
            }
        };

        const handleMessageReacted = (data: { conversationId: string; messageId: string; reactions: Record<string, number> }) => {
            if (data.conversationId === selectedId) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m)
                );
            }
        };

        socket.on('new_message', handleNewMsg);
        socket.on('new_suggestion', handleNewSugg);
        socket.on('suggestion_sent', handleSuggestionSent);
        socket.on('conversation_updated', handleConvUpdate);
        socket.on('new_conversation', handleConvUpdate);
        socket.on('sla_warning', handleSlaWarning);
        socket.on('auto_reply_sent', handleAutoReply);
        socket.on('message_status', handleMessageStatus);
        socket.on('typing', handleTyping);
        socket.on('agent_thought', handleAgentThought);
        socket.on('messageRecalled', handleMessageRecalled);
        socket.on('messagePinned', handleMessagePinned);
        socket.on('messageStarred', handleMessageStarred);
        socket.on('messageLocalDeleted', handleMessageLocalDeleted);
        socket.on('message_reacted', handleMessageReacted);
        return () => {
            socket.off('new_message', handleNewMsg);
            socket.off('new_suggestion', handleNewSugg);
            socket.off('suggestion_sent', handleSuggestionSent);
            socket.off('conversation_updated', handleConvUpdate);
            socket.off('new_conversation', handleConvUpdate);
            socket.off('sla_warning', handleSlaWarning);
            socket.off('auto_reply_sent', handleAutoReply);
            socket.off('message_status', handleMessageStatus);
            socket.off('typing', handleTyping);
            socket.off('agent_thought', handleAgentThought);
            socket.off('messageRecalled', handleMessageRecalled);
            socket.off('messagePinned', handleMessagePinned);
            socket.off('messageStarred', handleMessageStarred);
            socket.off('messageLocalDeleted', handleMessageLocalDeleted);
            socket.off('message_reacted', handleMessageReacted);
        };
    // `tagFilter` BẮT BUỘC trong deps: handleNewMsg ghi cache key ['conversations', tagFilter]
    // — thiếu dep là stale closure, đổi filter xong event vẫn ghi vào cache key cũ.
    }, [socket, selectedId, queryClient, tagFilter]);

    // -- API Actions --
    const sendMessage = async (convId: string, text: string, imageFile?: File | null, replyToId?: string, editSource?: { suggestionId: string; replyIndex: number }) => {
        if (!token) return null;
        try {
            let fileUrl = '';
            let isImage = false;
            if (imageFile) {
                isImage = imageFile.type.startsWith('image/');
                const formData = new FormData();
                formData.append('image', imageFile); // The backend still expects the field name 'image'
                const uploadRes = await authFetch(`${API}/chat-media/upload-image`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    if (uploadData.error) throw new Error(uploadData.error);
                    fileUrl = uploadData.url;
                } else {
                    throw new Error('Upload file thất bại');
                }
            }

            const fallbackText = isImage ? '[Hình ảnh]' : '';
            const body: Record<string, unknown> = { text: text.trim() || (imageFile ? fallbackText : '') };
            if (fileUrl) {
                body.contentType = isImage ? 'image' : 'file';
                body.attachments = [{ url: fileUrl, type: isImage ? 'image' : 'file', name: imageFile?.name }];
            }
            if (replyToId) body.replyToId = replyToId;

            const res = await authFetch(`${API}/conversations/${convId}/send`, {
                method: 'POST', headers: headers(),
                body: JSON.stringify(body),
            });

            if (res.ok) {
                const sent = await res.json();
                seenMsgIds.current.add(sent.id);
                
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => {
                    return prev.some(m => m.id === sent.id) ? prev : [...prev, {
                        id: sent.id, senderType: 'agent', content: sent.content,
                        contentType: sent.contentType || 'text', attachments: sent.attachments,
                        status: sent.status, createdAt: sent.createdAt,
                        quoteId: sent.quoteId,
                    }];
                });
                
                if (editSource) {
                    authFetch(`${API}/suggestions/${editSource.suggestionId}/accept-edited`, {
                        method: 'PATCH', headers: headers(),
                        body: JSON.stringify({
                            editedText: text || '',
                            replyIndex: editSource.replyIndex,
                        }),
                    }).catch(() => {});
                }
                return sent;
            }
            return null;
        } catch (err) {
            console.error('Send error:', err);
            throw err;
        }
    };

    const updateStatus = async (convId: string, newStatus: string) => {
        try {
            await authFetch(`${API}/conversations/${convId}/status`, {
                method: 'PATCH', headers: headers(), body: JSON.stringify({ status: newStatus }),
            });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        } catch (err) { console.error(err); toast.show('error', 'Không cập nhật được trạng thái hội thoại'); }
    };

    const recallMessage = async (convId: string, msgId: string) => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/messages/${msgId}/recall`, {
                method: 'POST', headers: headers(),
            });
            const data = await res.json();
            if (res.ok && data.success !== false) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === msgId ? { ...m, status: data.status || 'recalled', content: '[Tin nhắn đã thu hồi]' } : m)
                );
            } else {
                const errMsg = data.error || data.message || 'Không thể thu hồi tin nhắn';
                toast.show('error', errMsg);
            }
        } catch (err) { console.error('Recall error:', err); toast.show('error', 'Lỗi kết nối khi thu hồi tin nhắn'); }
    };

    const pinMessage = async (convId: string, msgId: string) => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/messages/${msgId}/pin`, {
                method: 'POST', headers: headers(),
            });
            if (res.ok) {
                const data = await res.json();
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.id ? { ...m, isPinned: data.isPinned } : m)
                );
            } else {
                const err = await res.json();
                toast.show('error', err.message || 'Không thể ghim tin nhắn');
            }
        } catch (err) { console.error(err); toast.show('error', 'Lỗi khi ghim tin nhắn'); }
    };

    const starMessage = async (convId: string, msgId: string) => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/messages/${msgId}/star`, {
                method: 'PATCH', headers: headers(),
            });
            if (res.ok) {
                const data = await res.json();
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.map(m => m.id === data.id ? { ...m, isStarred: data.isStarred } : m)
                );
            } else {
                const err = await res.json();
                toast.show('error', err.message || 'Không đánh dấu tin nhắn được');
            }
        } catch (err) { console.error(err); toast.show('error', 'Lỗi khi đánh dấu tin nhắn'); }
    };

    const deleteLocalMessage = async (convId: string, msgId: string) => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/messages/${msgId}/local`, {
                method: 'DELETE', headers: headers(),
            });
            if (res.ok) {
                queryClient.setQueryData<ChatMessage[]>(['messages', selectedId], (prev = []) => 
                    prev.filter(m => m.id !== msgId)
                );
            } else {
                const err = await res.json();
                toast.show('error', err.message || 'Không xóa tin nhắn được');
            }
        } catch (err) { console.error(err); toast.show('error', 'Lỗi khi xóa tin nhắn'); }
    };

    const updatePriority = async (convId: string, newPriority: string) => {
        try {
            await authFetch(`${API}/conversations/${convId}/priority`, {
                method: 'PATCH', headers: headers(), body: JSON.stringify({ priority: newPriority }),
            });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        } catch (err) { console.error(err); toast.show('error', 'Không cập nhật được mức ưu tiên'); }
    };

    const deleteConversation = async (convId: string, skipConfirm = false) => {
        // Xác nhận do UI đảm nhiệm (Delete_Confirm_Modal); hook không dùng confirm() native.
        void skipConfirm;
        try {
            const res = await authFetch(`${API}/conversations/${convId}`, {
                method: 'DELETE', headers: headers(),
            });
            if (res.ok) {
                queryClient.setQueryData<Conversation[]>(['conversations', tagFilter], (prev = []) => 
                    prev.filter(c => c.id !== convId)
                );
                if (selectedId === convId) setSelectedId(null);
            } else {
                toast.show('error', 'Không thể xóa hội thoại. Vui lòng thử lại.');
            }
        } catch (err) { console.error(err); toast.show('error', 'Lỗi kết nối khi xóa hội thoại'); }
    };

    const recordCannedResponseUsage = (id: string) => {
        authFetch(`${API}/canned-responses/${id}/use`, { method: 'POST', headers: headers() }).catch(() => { });
    };

    const markSuggestionSent = async (suggestionId: string, replyIndex: number, totalReplies: number) => {
        const current = new Set(sentReplies[suggestionId] || []);
        current.add(replyIndex);
        setSentReplies(prev => ({ ...prev, [suggestionId]: current }));

        if (current.size < totalReplies) return;

        try {
            const res = await authFetch(`${API}/suggestions/${suggestionId}/accept`, {
                method: 'PATCH',
                headers: headers(),
            });
            if (!res.ok) throw new Error(`accept suggestion failed: ${res.status}`);

            queryClient.setQueryData<Suggestion[]>(['suggestions', selectedId], (p = []) =>
                p.map(s => s.id === suggestionId ? { ...s, status: 'sent' } : s)
            );
        } catch (error) {
            console.error(error);
            toast.show('error', 'Tin đã gửi nhưng chưa cập nhật được trạng thái gợi ý AI');
        }
    };

    const addNote = async (convId: string, content: string, scope?: 'conversation' | 'customer') => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/notes`, {
                method: 'POST', headers: headers(), body: JSON.stringify({ content, scope }),
            });
            if (res.ok) {
                const n = await res.json();
                queryClient.setQueryData<Note[]>(['notes', selectedId], (prev = []) => [n, ...prev]);
            } else {
                toast.show('error', 'Không thêm được ghi chú');
            }
        } catch (err) { console.error(err); toast.show('error', 'Lỗi khi thêm ghi chú'); }
    };

    const togglePinNote = async (convId: string, noteId: string) => {
        try {
            await authFetch(`${API}/conversations/${convId}/notes/${noteId}/pin`, { method: 'PATCH', headers: headers() });
            queryClient.setQueryData<Note[]>(['notes', selectedId], (prev = []) => 
                prev.map(n => n.id === noteId ? { ...n, isPinned: !n.isPinned } : n)
            );
        } catch (err) { console.error(err); toast.show('error', 'Không ghim được ghi chú'); }
    };

    const deleteNote = async (convId: string, noteId: string) => {
        try {
            const res = await authFetch(`${API}/conversations/${convId}/notes/${noteId}`, { method: 'DELETE', headers: headers() });
            if (res.ok) {
                queryClient.setQueryData<Note[]>(['notes', selectedId], (prev = []) => 
                    prev.filter(n => n.id !== noteId)
                );
            } else {
                toast.show('error', 'Không xóa được ghi chú (mã ' + res.status + ')');
            }
        } catch (e: unknown) { 
            console.error(e);
            toast.show('error', e instanceof Error ? 'Lỗi mạng: ' + e.message : 'Lỗi khi xóa ghi chú');
        }
    };

    const transferConversation = async (convId: string, agentId: string) => {
        try {
            await authFetch(`${API}/conversations/${convId}/assign`, {
                method: 'PATCH', headers: headers(), body: JSON.stringify({ assigneeId: agentId }),
            });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
        } catch (err) { console.error(err); toast.show('error', 'Không chuyển được hội thoại'); }
    };

    const collabActions = {
        add: async (convId: string, userId: string) => {
            try {
                const res = await authFetch(`${API}/conversations/${convId}/participants`, {
                    method: 'POST', headers: headers(), body: JSON.stringify({ userId, role: 'collaborator' }),
                });
                queryClient.invalidateQueries({ queryKey: ['participants', selectedId] });
            } catch (err) { console.error(err); toast.show('error', 'Không thêm được cộng tác viên'); }
        },
        remove: async (convId: string, userId: string) => {
            try {
                await authFetch(`${API}/conversations/${convId}/participants/${userId}`, { method: 'DELETE', headers: headers() });
                queryClient.invalidateQueries({ queryKey: ['participants', selectedId] });
            } catch (err) { console.error(err); toast.show('error', 'Không gỡ được cộng tác viên'); }
        },
        toggleAccess: async (convId: string, userId: string, canView: boolean) => {
            try {
                await authFetch(`${API}/conversations/${convId}/participants/${userId}/access`, {
                    method: 'PATCH', headers: headers(), body: JSON.stringify({ canViewCustomerInfo: canView }),
                });
                queryClient.invalidateQueries({ queryKey: ['participants', selectedId] });
            } catch (err) { console.error(err); toast.show('error', 'Không đổi được quyền xem thông tin'); }
        }
    };

    const markAsUnread = async (convId: string) => {
        await runOptimistic<Conversation[]>({
            queryClient,
            queryKey: ['conversations', tagFilter],
            apply: (prev = []) => prev.map(c => c.id === convId ? { ...c, unreadCount: 1 } : c),
            commit: async () => {
                const res = await authFetch(`${API}/conversations/${convId}`, {
                    method: 'PATCH', headers: headers(), body: JSON.stringify({ unreadCount: 1 })
                });
                if (!res.ok) throw new Error('mark unread failed');
            },
            onError: (err) => { console.error(err); toast.show('error', 'Không đánh dấu chưa đọc được'); },
        });
    };

    const togglePinConversation = async (convId: string, currentPinned: boolean) => {
        const ok = await runOptimistic<Conversation[]>({
            queryClient,
            queryKey: ['conversations', tagFilter],
            apply: (prev = []) => prev.map(c => c.id === convId ? { ...c, isPinned: !currentPinned } : c),
            commit: async () => {
                const res = await authFetch(`${API}/conversations/${convId}`, {
                    method: 'PATCH', headers: headers(), body: JSON.stringify({ isPinned: !currentPinned })
                });
                if (!res.ok) throw new Error('toggle pin failed');
            },
            onError: (err) => { console.error(err); toast.show('error', 'Không ghim/bỏ ghim được hội thoại'); },
        });
        if (ok) queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const toggleTag = async (convId: string, tag: string, isAdding: boolean) => {
        await runOptimistic<Conversation[]>({
            queryClient,
            queryKey: ['conversations', tagFilter],
            apply: (prev = []) => prev.map(c => {
                if (c.id === convId) {
                    const newTags = isAdding 
                        ? [...(c.tags || []), tag] 
                        : (c.tags || []).filter(t => t !== tag);
                    return { ...c, tags: newTags };
                }
                return c;
            }),
            commit: async () => {
                const res = isAdding
                    ? await authFetch(`${API}/conversations/${convId}/tags`, {
                        method: 'POST', headers: headers(), body: JSON.stringify({ tag })
                    })
                    : await authFetch(`${API}/conversations/${convId}/tags/${encodeURIComponent(tag)}`, {
                        method: 'DELETE', headers: headers()
                    });
                if (!res.ok) throw new Error('toggle tag failed');
            },
            onError: (err) => { console.error(err); toast.show('error', 'Không cập nhật được thẻ phân loại'); },
        });
    };

    const markAllRead = async () => {
        await runOptimistic<Conversation[]>({
            queryClient,
            queryKey: ['conversations', tagFilter],
            apply: (prev = []) => prev.map(c => (c.unreadCount ?? 0) > 0 ? { ...c, unreadCount: 0 } : c),
            commit: async () => {
                const res = await authFetch(`${API}/conversations/mark-all-read`, {
                    method: 'POST', headers: headers(),
                });
                if (!res.ok) throw new Error('mark all read failed');
            },
            onError: (err) => { console.error(err); toast.show('error', 'Không đánh dấu đã đọc tất cả được'); },
        });
    };

    return {
        state: {
            conversations, slaWarnings, selectedId, messages, suggestions, sentReplies,
            loading, quickReplies, availableTags, tagFilter, notes, agents, participants, typingStatuses, agentThought
        },
        actions: {
            setSelectedId, setTagFilter,
            sendMessage, updateStatus, recallMessage, pinMessage, starMessage, deleteLocalMessage, updatePriority, deleteConversation, markSuggestionSent, recordCannedResponseUsage,
            addNote, togglePinNote, deleteNote, transferConversation, collabActions, markAsUnread, togglePinConversation, toggleTag, markAllRead
        }
    };
}
