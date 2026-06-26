'use client';

import { useState, useEffect } from 'react';
import type { Conversation, Note } from '../types';
import { Bot, Trash2, CheckCircle2, X } from 'lucide-react';
import { useSocket } from '@/lib/socket-context';
import { apiGet, apiPatch } from '@/lib/api';

interface NotesPanelProps {
    token: string;
    selectedConversation: Conversation;
    notes: Note[];
    onAddNote: (content: string, scope: 'conversation' | 'customer' | 'global') => void;
    onTogglePinNote: (noteId: string) => void;
    onDeleteNote?: (noteId: string) => void;
    onInjectText: (text: string) => void;
}

export function NotesPanel({ token, selectedConversation, notes, onAddNote, onTogglePinNote, onDeleteNote, onInjectText }: NotesPanelProps) {
    const [noteScope, setNoteScope] = useState<'conversation' | 'customer' | 'global'>('customer');
    const [noteText, setNoteText] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [aiTasks, setAiTasks] = useState<{ id: string; message: string; contactName: string; isCompleted?: boolean; isRejected?: boolean }[]>([]);
    const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
    const { socket } = useSocket();

    const fetchTasks = async () => {
        if (!selectedConversation?.id) return;
        try {
            const data = await apiGet(`/conversations/${selectedConversation.id}/follow-ups`, token);
            if (data?.sent) {
                const mapped = data.sent.map((t: { id: string; message: string }) => ({
                    id: t.id, message: t.message, contactName: selectedConversation.contact?.displayName || 'Khách hàng'
                }));
                const pending = data.pending
                    ? data.pending.filter((p: { scheduledAt: string }) => new Date(p.scheduledAt) <= new Date()).map((t: { id: string; message: string }) => ({
                        id: t.id, message: t.message, contactName: selectedConversation.contact?.displayName || 'Khách hàng'
                    }))
                    : [];
                setAiTasks([...pending, ...mapped]);
            }
        } catch (e) {
            console.error('Failed to fetch tasks', e);
        }
    };

    useEffect(() => { setAiTasks([]); setRejectingTaskId(null); fetchTasks(); }, [selectedConversation?.id]);

    const handleTaskComplete = async (taskId: string, messageToInject?: string) => {
        if (messageToInject) onInjectText(messageToInject);
        setAiTasks(prev => prev.map(t => t.id === taskId ? { ...t, isCompleted: true } : t));
        try { await apiPatch(`/conversations/follow-ups/${taskId}/status`, { status: 'completed' }); } catch {}
    };

    const handleTaskReject = async (taskId: string, reason: string) => {
        setAiTasks(prev => prev.map(t => t.id === taskId ? { ...t, isRejected: true } : t));
        setRejectingTaskId(null);
        try { await apiPatch(`/conversations/follow-ups/${taskId}/status`, { status: 'rejected', rejectionReason: reason }); } catch {}
    };

    useEffect(() => {
        if (!socket || !selectedConversation) return;
        const handleProactive = (data: { conversationId: string; followUpId: string; message: string; contactName: string }) => {
            if (data.conversationId === selectedConversation.id) {
                setAiTasks(prev => {
                    if (prev.find(t => t.id === data.followUpId)) return prev;
                    return [{ id: data.followUpId, message: data.message, contactName: data.contactName }, ...prev];
                });
            }
        };
        socket.on('proactive_followup', handleProactive);
        return () => { socket.off('proactive_followup', handleProactive); };
    }, [socket, selectedConversation]);

    return (
        <div style={{ padding: 14 }}>
            {/* TO-DO (AI TASKS) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>📋 Việc cần làm (To-Do)</span>
                        {aiTasks.length > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 600 }}>{aiTasks.length} việc gấp</span>}
                    </div>
                    <button style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>+ Tạo việc</button>
                </div>

                {aiTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0' }}>Không có việc nào khẩn cấp</div>
                )}

                {aiTasks.map(task => {
                    if (task.isRejected) return null;
                    return (
                        <div key={task.id} style={{
                            padding: '10px 12px', background: task.isCompleted ? '#f8fafc' : '#fffbeb',
                            border: `1px solid ${task.isCompleted ? '#e2e8f0' : '#fde68a'}`,
                            borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative',
                            opacity: task.isCompleted ? 0.7 : 1, transition: 'all 0.3s'
                        }}>
                            <input
                                type="checkbox" checked={task.isCompleted} disabled={task.isCompleted}
                                style={{ marginTop: 4, transform: 'scale(1.2)', cursor: task.isCompleted ? 'default' : 'pointer', accentColor: task.isCompleted ? '#94a3b8' : '#f59e0b' }}
                                onChange={() => handleTaskComplete(task.id)}
                                title={task.isCompleted ? "Đã Xong" : "Đánh dấu hoàn thành"}
                            />
                            <div style={{ flex: 1, paddingRight: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: task.isCompleted ? '#64748b' : '#92400e', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, textDecoration: task.isCompleted ? 'line-through' : 'none' }}>
                                    <Bot size={14} /> AI Nhắc nhở: {task.contactName}
                                </div>
                                <div style={{ fontSize: 12, color: task.isCompleted ? '#94a3b8' : '#b45309', marginBottom: 6, lineHeight: 1.4, textDecoration: task.isCompleted ? 'line-through' : 'none' }}>
                                    Khách đã xem báo giá nhưng chưa chốt. Bạn hãy click gửi ngay để hâm nóng nhé!
                                </div>
                                {!task.isCompleted && (
                                    <div style={{ background: '#fff', padding: '8px 10px', fontSize: 13, fontStyle: 'italic', color: '#1e293b', border: '1px outset #fef3c7', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s' }}
                                        onClick={() => handleTaskComplete(task.id, task.message)}
                                        onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                        title="Click để copy vào ô nhập và hoàn thành task"
                                    >
                                        &quot;{task.message}&quot;
                                    </div>
                                )}
                                {task.isCompleted && (
                                    <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <CheckCircle2 size={14} /> Bạn đã hoàn thành việc này
                                    </div>
                                )}
                                {rejectingTaskId === task.id && !task.isCompleted && (
                                    <div style={{ marginTop: 8, background: '#fff', border: '1px solid #fca5a5', padding: 8, borderRadius: 6, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Tại sao bạn bỏ qua?</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {['Không đúng lúc / Quá sớm', 'Nhắc sai người / sai văn cảnh', 'Tôi đã xử lý việc này rồi', 'Lý do khác'].map(r => (
                                                <button key={r} onClick={() => handleTaskReject(task.id, r)} style={{ textAlign: 'left', background: '#fef2f2', border: 'none', padding: '4px 8px', borderRadius: 4, fontSize: 11, color: '#991b1b', cursor: 'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#fee2e2'} onMouseLeave={e => e.currentTarget.style.background = '#fef2f2'}>
                                                    {r}
                                                </button>
                                            ))}
                                            <button onClick={() => setRejectingTaskId(null)} style={{ textAlign: 'center', background: 'none', border: 'none', padding: '4px 8px', fontSize: 11, color: '#64748b', cursor: 'pointer', marginTop: 4 }}>Hủy</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {!task.isCompleted && (
                                <button onClick={() => setRejectingTaskId(task.id)} title="Bỏ qua (Reject)"
                                    style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 4, borderRadius: 4 }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                    <X size={14} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{ borderTop: '1px dashed #cbd5e1', margin: '8px 0 16px' }} />

            {/* Notes CRUD */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>📝 Sổ Tay Sinh Thái (Ghi Chú)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                <select value={noteScope} onChange={e => setNoteScope(e.target.value as typeof noteScope)}
                    className="input" style={{ fontSize: 11, padding: '4px 8px', width: 'fit-content', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 500, borderRadius: 4 }}>
                    <option value="global">Toàn hệ thống</option>
                    <option value="customer">Dùng chung cho Khách</option>
                    <option value="conversation">Chỉ hội thoại này</option>
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" style={{ flex: 1, fontSize: 12 }} placeholder="Thêm ghi chú..."
                        value={noteText} onChange={e => setNoteText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && noteText.trim() && (onAddNote(noteText, noteScope), setNoteText(''))} />
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => { onAddNote(noteText, noteScope); setNoteText(''); }} disabled={!noteText.trim()}>+</button>
                </div>
            </div>

            {notes.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Chưa có ghi chú</div>
            ) : notes.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)).map(n => (
                <div key={n.id} style={{
                    padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6,
                    background: n.isPinned ? '#fffbeb' : '#fff', borderLeftWidth: 3,
                    borderLeftColor: n.isPinned ? '#f59e0b' : 'var(--border)',
                }}>
                    {confirmDeleteId === n.id ? (
                        <div style={{ textAlign: 'center', padding: '4px 0' }}>
                            <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 500, marginBottom: 8 }}>Xác nhận xóa ghi chú này?</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                                <button onClick={() => setConfirmDeleteId(null)} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Hủy</button>
                                <button onClick={() => { setConfirmDeleteId(null); onDeleteNote?.(n.id); }} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Xóa</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                {n.scope === 'global' && (
                                    <span style={{ fontSize: 10, padding: '2px 6px', background: '#fce7f3', color: '#be185d', borderRadius: 4, fontWeight: 500, marginRight: 6, display: 'inline-block', marginBottom: 4 }}>
                                        🌍 Toàn hệ thống
                                    </span>
                                )}
                                {n.scope === 'customer' && (
                                    <span style={{ fontSize: 10, padding: '2px 6px', background: '#e0e7ff', color: '#4338ca', borderRadius: 4, fontWeight: 500, marginRight: 6, display: 'inline-block', marginBottom: 4 }}>
                                        👤 Khách hàng
                                    </span>
                                )}
                                {n.content}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                                <span>{n.author?.fullName}</span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button onClick={() => onTogglePinNote(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="Ghim/Bỏ ghim">
                                        {n.isPinned ? '📌' : '📍'}
                                    </button>
                                    {onDeleteNote && (
                                        <button onClick={() => setConfirmDeleteId(n.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#ef4444' }} title="Xóa ghi chú">
                                            <Trash2 size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
