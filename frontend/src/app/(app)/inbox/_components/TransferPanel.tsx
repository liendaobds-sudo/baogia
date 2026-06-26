'use client';

import type { Conversation, Participant, User } from '../types';

interface TransferPanelProps {
    selectedConversation: Conversation;
    participants: Participant[];
    agents: User[];
    onRemoveCollaborator: (userId: string) => void;
    onTransferConversation: (agentId: string) => void;
    onAddCollaborator?: (userId: string) => void;
}

export function TransferPanel({ selectedConversation, participants, agents, onRemoveCollaborator, onTransferConversation, onAddCollaborator }: TransferPanelProps) {
    // Filter out agents who are already participants or the assignee
    const availableAgents = agents.filter(a => a.id !== selectedConversation.assignee?.id && !participants.some(p => p.userId === a.id));

    return (
        <div style={{ padding: 14 }}>
            {/* Participants */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>Cộng tác viên ({participants.length})</div>
            {participants.map(p => (
                <div key={p.id} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: p.role === 'owner' ? '#dbeafe' : '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: p.role === 'owner' ? '#2563eb' : '#b45309', fontSize: 12 }}>
                        {p.user?.fullName?.charAt(0) || '?'}
                    </span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.user?.fullName}</div>
                        <div style={{ fontSize: 11, color: p.role === 'owner' ? '#2563eb' : '#b45309' }}>{p.role === 'owner' ? 'Phụ trách chính' : 'Cộng tác viên'}</div>
                    </div>
                    {p.role === 'collaborator' && (
                        <button onClick={() => onRemoveCollaborator(p.userId)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Xóa</button>
                    )}
                </div>
            ))}

            <div style={{ borderTop: '1px dashed var(--border)', margin: '16px 0' }} />

            {/* Actions for other agents */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#64748b' }}>🔄 Thêm người / Chuyển giao</div>
            <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {availableAgents.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>Không có nhân viên nào khác</div>}
                {availableAgents.map(a => (
                    <div key={a.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#475569', fontSize: 13 }}>
                            {a.fullName.charAt(0)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.fullName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.email}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {onAddCollaborator && (
                                <button onClick={() => onAddCollaborator(a.id)} style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+ Tham gia</button>
                            )}
                            <button onClick={() => onTransferConversation(a.id)} style={{ background: '#dbeafe', color: '#2563eb', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Chuyển hẳn</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

