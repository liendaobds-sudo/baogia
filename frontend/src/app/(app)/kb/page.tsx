'use client';

import { useAuth } from '@/lib/auth-context';
import { useState, useEffect, useCallback, useRef } from 'react';

import { API_URL as API } from '@/lib/api';

interface KbDocument {
    id: string;
    title: string;
    fileType: string;
    fileSize: number;
    tags: string[];
    status: string;
    chunkCount: number;
    errorMessage?: string;
    createdAt: string;
}

interface KbChunk {
    id: string;
    chunkIndex: number;
    content: string;
    tokenCount: number;
    tags: string[];
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
    uploading: { label: 'Đang tải', color: '#d97706', bg: '#fef3c7' },
    processing: { label: 'Đang xử lý', color: '#2563eb', bg: '#dbeafe' },
    indexed: { label: 'Đã indexing', color: '#16a34a', bg: '#dcfce7' },
    error: { label: 'Lỗi', color: '#dc2626', bg: '#fef2f2' },
    archived: { label: 'Lưu trữ', color: '#64748b', bg: '#f1f5f9' },
};

const FILE_ICONS: Record<string, string> = {
    txt: '📄', md: '📝', pdf: '📕', doc: '📘', docx: '📘',
};

export default function KBPage() {
    const { token } = useAuth();
    const [documents, setDocuments] = useState<KbDocument[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
    const [chunks, setChunks] = useState<KbChunk[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [tags, setTags] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    // Editor state
    const [editContent, setEditContent] = useState('');
    const [editTitle, setEditTitle] = useState('');
    const [editTags, setEditTags] = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [rightTab, setRightTab] = useState<'edit' | 'chunks'>('edit');
    const [saveMsg, setSaveMsg] = useState('');

    const headers = useCallback(() => ({
        'Authorization': `Bearer ${token}`,
    }), [token]);

    const fetchDocuments = useCallback(async () => {
        try {
            const res = await fetch(`${API}/kb/documents`, { headers: headers() });
            if (res.ok) { const data = await res.json(); setDocuments(data || []); }
        } catch (err) { console.error(err); }
    }, [headers]);

    const fetchChunks = useCallback(async (docId: string) => {
        try {
            const res = await fetch(`${API}/kb/documents/${docId}/chunks`, { headers: headers() });
            if (res.ok) { const data = await res.json(); setChunks(data || []); }
        } catch (err) { console.error(err); }
    }, [headers]);

    const fetchDocContent = useCallback(async (docId: string) => {
        setEditLoading(true);
        try {
            const res = await fetch(`${API}/kb/documents/${docId}/content`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setEditContent(data.content || '');
                setEditTitle(data.title || '');
                setEditTags((data.tags || []).join(', '));
            }
        } catch (err) { console.error(err); }
        setEditLoading(false);
    }, [headers]);

    const handleSaveContent = async () => {
        if (!selectedDoc) return;
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await fetch(`${API}/kb/documents/${selectedDoc}/content`, {
                method: 'PUT',
                headers: { ...headers(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: editContent,
                    title: editTitle,
                    tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
                }),
            });
            if (res.ok) {
                setSaveMsg('✅ Đã lưu & re-index!');
                fetchDocuments();
                fetchChunks(selectedDoc);
                setTimeout(() => setSaveMsg(''), 3000);
            } else {
                setSaveMsg('❌ Lỗi khi lưu');
            }
        } catch { setSaveMsg('❌ Lỗi kết nối'); }
        setSaving(false);
    };

    useEffect(() => { if (token) fetchDocuments(); }, [token, fetchDocuments]);
    useEffect(() => {
        if (selectedDoc) {
            fetchChunks(selectedDoc);
            fetchDocContent(selectedDoc);
            setRightTab('edit');
            setSaveMsg('');
        }
    }, [selectedDoc, fetchChunks, fetchDocContent]);

    const handleUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        for (const file of Array.from(files)) {
            const formData = new FormData();
            formData.append('file', file);
            if (tags.trim()) formData.append('tags', tags);
            try {
                const res = await fetch(`${API}/kb/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                if (res.ok) {
                    await fetchDocuments();
                } else {
                    const err = await res.json();
                    alert(`Upload failed: ${err.message || 'Unknown error'}`);
                }
            } catch (err: any) {
                alert(`Upload error: ${err.message}`);
            }
        }
        setUploading(false);
        setTags('');
    };

    const handleDelete = async (docId: string) => {
        try {
            await fetch(`${API}/kb/documents/${docId}`, {
                method: 'DELETE', headers: headers(),
            });
            setConfirmDeleteId(null);
            setDocuments(prev => prev.filter(d => d.id !== docId));
            if (selectedDoc === docId) { setSelectedDoc(null); setChunks([]); }
        } catch (err) { console.error(err); }
    };

    const formatSize = (bytes: number) => bytes > 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : bytes > 1024
            ? `${(bytes / 1024).toFixed(1)} KB`
            : `${bytes} B`;

    const totalChunks = documents.reduce((s, d) => s + d.chunkCount, 0);

    return (
        <div style={{ padding: '24px 28px', background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        Knowledge Base
                    </h1>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Quản lý tài liệu cho AI trả lời tự động</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, padding: '6px 12px', borderRadius: 10, background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>
                        {documents.length} tài liệu
                    </span>
                    <span style={{ fontSize: 12, padding: '6px 12px', borderRadius: 10, background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>
                        {totalChunks} chunks
                    </span>
                </div>
            </div>

            {/* Upload Zone */}
            <div
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); setDragActive(false); handleUpload(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                style={{
                    borderRadius: 16, padding: '28px 24px', textAlign: 'center', cursor: 'pointer',
                    background: dragActive ? '#eef2ff' : '#fff',
                    border: `2px dashed ${dragActive ? '#4f46e5' : '#e2e8f0'}`,
                    marginBottom: 24, transition: 'all 200ms ease',
                    boxShadow: dragActive ? '0 0 0 4px #eef2ff' : 'none',
                }}
            >
                <div style={{ marginBottom: 8 }}>
                    {uploading ? (
                        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', margin: '0 auto', animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={dragActive ? '#4f46e5' : '#94a3b8'} strokeWidth="1.5" style={{ margin: '0 auto', display: 'block' }}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: dragActive ? '#4f46e5' : '#334155', marginBottom: 4 }}>
                    {uploading ? 'Đang upload...' : 'Kéo thả file vào đây'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>hoặc click để chọn file .txt, .md</div>
                <input ref={fileRef} type="file" accept=".txt,.md" multiple hidden onChange={e => handleUpload(e.target.files)} />
                <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <input
                        className="input"
                        style={{ width: 220, fontSize: 13, borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}
                        placeholder="Tags (comma separated)"
                        value={tags}
                        onChange={e => setTags(e.target.value)}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>

            {/* Documents + Chunks */}
            <div style={{ display: 'flex', gap: 20 }}>
                {/* Documents List */}
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        Tài liệu
                    </div>
                    {documents.length === 0 && (
                        <div style={{
                            padding: 32, color: '#94a3b8', textAlign: 'center',
                            background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9',
                        }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block' }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                            </svg>
                            <div style={{ fontSize: 13 }}>Chưa có tài liệu nào</div>
                        </div>
                    )}
                    {documents.map(doc => {
                        const st = STATUS_MAP[doc.status] || STATUS_MAP.processing;
                        const icon = FILE_ICONS[doc.fileType] || '📄';
                        return (
                            <div key={doc.id} onClick={() => setSelectedDoc(doc.id)}
                                style={{
                                    padding: '16px 18px', borderRadius: 14, marginBottom: 10,
                                    background: selectedDoc === doc.id ? '#eef2ff' : '#fff',
                                    border: `1px solid ${selectedDoc === doc.id ? '#c7d2fe' : '#f1f5f9'}`,
                                    cursor: 'pointer', transition: 'all 150ms ease',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                }}
                                onMouseEnter={e => { if (selectedDoc !== doc.id) e.currentTarget.style.borderColor = '#e0e7ff'; }}
                                onMouseLeave={e => { if (selectedDoc !== doc.id) e.currentTarget.style.borderColor = '#f1f5f9'; }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <span style={{
                                            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                                            background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 18,
                                        }}>{icon}</span>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>{doc.title}</div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span>{doc.fileType.toUpperCase()}</span>
                                                <span>·</span>
                                                <span>{formatSize(doc.fileSize)}</span>
                                                <span>·</span>
                                                <span>{doc.chunkCount} chunks</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                                                <span style={{
                                                    fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                                    background: st.bg, color: st.color, fontWeight: 600,
                                                }}>{st.label}</span>
                                                {[...new Set(doc.tags || [])].map((t, i) => (
                                                    <span key={`${t}-${i}`} style={{
                                                        fontSize: 11, padding: '3px 10px', borderRadius: 8,
                                                        background: '#f1f5f9', color: '#64748b',
                                                    }}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {confirmDeleteId === doc.id ? (
                                        <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                                            <button onClick={e => { e.stopPropagation(); handleDelete(doc.id); }}
                                                style={{
                                                    height: 28, borderRadius: 8, border: 'none', padding: '0 10px',
                                                    background: '#dc2626', color: '#fff', cursor: 'pointer',
                                                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>✓ Xóa</button>
                                            <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                                style={{
                                                    height: 28, borderRadius: 8, border: '1px solid #e2e8f0',
                                                    background: '#f8fafc', cursor: 'pointer', fontSize: 11, color: '#64748b',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>Hủy</button>
                                        </div>
                                    ) : (
                                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(doc.id); }}
                                            style={{
                                                width: 32, height: 32, borderRadius: 8, border: '1px solid #fecaca',
                                                background: '#fff', cursor: 'pointer', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', transition: 'all 150ms',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                                {doc.errorMessage && (
                                    <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8, padding: '6px 10px', background: '#fef2f2', borderRadius: 8 }}>
                                        ⚠️ {doc.errorMessage}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Right Panel — Editor + Chunks */}
                {selectedDoc && (
                    <div style={{ width: 520, flexShrink: 0 }}>
                        {/* Tabs */}
                        <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#f1f5f9', borderRadius: 12, padding: 3 }}>
                            {[
                                { key: 'edit' as const, label: '✏️ Chỉnh sửa', icon: '' },
                                { key: 'chunks' as const, label: '📊 Chunks', icon: '' },
                            ].map(tab => (
                                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                                    style={{
                                        flex: 1, padding: '8px 0', borderRadius: 10, border: 'none',
                                        background: rightTab === tab.key ? '#fff' : 'transparent',
                                        color: rightTab === tab.key ? '#0f172a' : '#64748b',
                                        fontWeight: rightTab === tab.key ? 600 : 500,
                                        fontSize: 13, cursor: 'pointer', transition: 'all 150ms',
                                        boxShadow: rightTab === tab.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                    }}
                                >{tab.label} {tab.key === 'chunks' ? `(${chunks.length})` : ''}</button>
                            ))}
                        </div>

                        {/* Tab Content: Editor */}
                        {rightTab === 'edit' && (
                            <div style={{
                                background: '#fff', borderRadius: 14, padding: '20px',
                                border: '1px solid #f1f5f9', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            }}>
                                {editLoading ? (
                                    <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                                        <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', margin: '0 auto 8px', animation: 'spin 0.8s linear infinite' }} />
                                        Đang tải nội dung...
                                    </div>
                                ) : (
                                    <>
                                        {/* Title */}
                                        <div style={{ marginBottom: 12 }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tiêu đề</label>
                                            <input
                                                value={editTitle}
                                                onChange={e => setEditTitle(e.target.value)}
                                                style={{
                                                    width: '100%', padding: '8px 12px', borderRadius: 10,
                                                    border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 600,
                                                    marginTop: 4, outline: 'none', boxSizing: 'border-box',
                                                }}
                                            />
                                        </div>
                                        {/* Tags */}
                                        <div style={{ marginBottom: 12 }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tags (phân cách bằng dấu phẩy)</label>
                                            <input
                                                value={editTags}
                                                onChange={e => setEditTags(e.target.value)}
                                                style={{
                                                    width: '100%', padding: '8px 12px', borderRadius: 10,
                                                    border: '1px solid #e2e8f0', fontSize: 13,
                                                    marginTop: 4, outline: 'none', boxSizing: 'border-box',
                                                }}
                                                placeholder="VD: bảng giá, pricing, giá tham khảo"
                                            />
                                        </div>
                                        {/* Content Editor */}
                                        <div style={{ marginBottom: 12 }}>
                                            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Nội dung (Markdown)
                                                <span style={{ fontWeight: 400, marginLeft: 8, color: '#94a3b8' }}>
                                                    {editContent.length.toLocaleString()} ký tự
                                                </span>
                                            </label>
                                            <textarea
                                                value={editContent}
                                                onChange={e => setEditContent(e.target.value)}
                                                style={{
                                                    width: '100%', minHeight: 'calc(100vh - 520px)', padding: '12px 14px',
                                                    borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13,
                                                    lineHeight: 1.7, fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                                    marginTop: 4, outline: 'none', resize: 'vertical',
                                                    boxSizing: 'border-box', background: '#fafbfc',
                                                }}
                                                placeholder="Nhập nội dung markdown..."
                                            />
                                        </div>
                                        {/* Save Button */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <button
                                                onClick={handleSaveContent}
                                                disabled={saving}
                                                style={{
                                                    padding: '10px 24px', borderRadius: 10, border: 'none',
                                                    background: saving ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                    color: '#fff', fontWeight: 700, fontSize: 14,
                                                    cursor: saving ? 'not-allowed' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    boxShadow: '0 2px 8px rgba(79,70,229,0.2)',
                                                    transition: 'all 200ms',
                                                }}
                                            >
                                                {saving ? '⏳ Đang lưu...' : '💾 Lưu & Re-index'}
                                            </button>
                                            {saveMsg && (
                                                <span style={{
                                                    fontSize: 13, fontWeight: 600,
                                                    color: saveMsg.includes('✅') ? '#16a34a' : '#dc2626',
                                                }}>{saveMsg}</span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Tab Content: Chunks */}
                        {rightTab === 'chunks' && (
                            <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', paddingRight: 4 }}>
                                {chunks.map(chunk => (
                                    <div key={chunk.id} style={{
                                        padding: '14px 16px', borderRadius: 14, marginBottom: 10,
                                        background: '#fff', border: '1px solid #f1f5f9',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                                            <span style={{
                                                fontWeight: 700, color: '#4f46e5', fontSize: 12,
                                                padding: '3px 8px', background: '#eef2ff', borderRadius: 6,
                                            }}>#{chunk.chunkIndex}</span>
                                            <span style={{ fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }}>
                                                ~{chunk.tokenCount} tokens
                                            </span>
                                        </div>
                                        <div style={{ color: '#475569', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontSize: 13 }}>
                                            {chunk.content.substring(0, 300)}{chunk.content.length > 300 ? '…' : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
