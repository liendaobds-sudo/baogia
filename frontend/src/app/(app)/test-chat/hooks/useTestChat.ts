'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from '@/lib/socket-context';
import { apiGet, apiPost, API_URL } from '@/lib/api';
import { ChatMsg, AiSuggestion } from '../types';
import { stripMarkdown } from '../utils/markdown';

export function useTestChat() {
    const { token } = useAuth();
    const { socket } = useSocket();

    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [convId, setConvId] = useState<string | null>(null);
    const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
    const [sentReplies, setSentReplies] = useState<Record<string, Set<number>>>({});
    const [mounted, setMounted] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const seenMsgIds = useRef(new Set<string>());

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    }), [token]);

    useEffect(() => { setMounted(true); }, []);

    // Load existing conversation
    useEffect(() => {
        if (!mounted || !token) return;
        fetch(`${API_URL}/test-chat/conversation`, { headers: headers() })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data?.conversationId) {
                    setConvId(data.conversationId);
                    setMessages(data.messages || []);
                }
            }).catch(() => { });
    }, [mounted, token, headers]);

    // WebSocket listeners
    useEffect(() => {
        if (!socket || !convId) return;

        socket.emit('join_conversation', { conversationId: convId });

        const handleNewMsg = (data: { conversationId: string; message: ChatMsg }) => {
            if (data.conversationId !== convId) return;
            if (seenMsgIds.current.has(data.message.id)) return;
            seenMsgIds.current.add(data.message.id);
            setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        };

        const handleNewSugg = (data: { conversationId: string; suggestion: AiSuggestion }) => {
            if (data.conversationId === convId) {
                setSuggestions(prev => [...prev, data.suggestion]);
            }
        };

        socket.on('new_message', handleNewMsg);
        socket.on('new_suggestion', handleNewSugg);

        return () => {
            socket.off('new_message', handleNewMsg);
            socket.off('new_suggestion', handleNewSugg);
            socket.emit('leave_conversation', { conversationId: convId });
        };
    }, [socket, convId]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Fetch suggestions when conversation loads
    useEffect(() => {
        if (!convId || !token) return;
        fetch(`${API_URL}/suggestions/conversation/${convId}`, { headers: headers() })
            .then(r => r.ok ? r.json() : [])
            .then(data => setSuggestions(Array.isArray(data) ? data : []))
            .catch(() => { });
    }, [convId, token, headers]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;
        setSending(true);
        setInput('');

        try {
            const res = await fetch(`${API_URL}/test-chat/send`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ message: text }),
            });
            const data = await res.json();
            if (data?.conversationId && !convId) {
                setConvId(data.conversationId);
                if (socket) {
                    socket.emit('join_conversation', { conversationId: data.conversationId });
                }
                // Fetch full messages after first message
                setTimeout(async () => {
                    try {
                        const convRes = await fetch(`${API_URL}/test-chat/conversation`, { headers: headers() });
                        if (convRes.ok) {
                            const convData = await convRes.json();
                            if (convData?.messages) {
                                setMessages(convData.messages);
                                convData.messages.forEach((m: ChatMsg) => seenMsgIds.current.add(m.id));
                            }
                        }
                        const suggRes = await fetch(`${API_URL}/suggestions/conversation/${data.conversationId}`, { headers: headers() });
                        if (suggRes.ok) {
                            const suggData = await suggRes.json();
                            setSuggestions(Array.isArray(suggData) ? suggData : []);
                        }
                    } catch { }
                }, 1000);
            }
        } catch (err) { console.error(err); }
        finally { setSending(false); inputRef.current?.focus(); }
    }, [token, convId, socket, headers]);

    const resetChat = useCallback(async () => {
        await fetch(`${API_URL}/test-chat/reset`, { method: 'POST', headers: headers() });
        setMessages([]);
        setSuggestions([]);
        setConvId(null);
        setConfirmReset(false);
    }, [headers]);

    const handleAcceptSuggestion = useCallback(async (sugg: AiSuggestion, replyIndex: number) => {
        const text = sugg.replies?.[replyIndex]?.text;
        if (!text) return;
        await sendMessage(stripMarkdown(text));
        setSentReplies(prev => {
            const current = new Set(prev[sugg.id] || []);
            current.add(replyIndex);
            return { ...prev, [sugg.id]: current };
        });
    }, [sendMessage]);

    return {
        messages, suggestions, input, setInput, sending,
        convId, sentReplies, mounted,
        confirmReset, setConfirmReset,
        messagesEndRef, inputRef,
        sendMessage, resetChat, handleAcceptSuggestion,
    };
}
