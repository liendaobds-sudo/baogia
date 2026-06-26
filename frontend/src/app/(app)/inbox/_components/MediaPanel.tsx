'use client';

import { useState } from 'react';
import type { ChatMessage } from '../types';
import { ChevronDown, Play, CheckCircle2, FileArchive, Folder, FileVideo, FileImage, FileText, Link as LinkIcon } from 'lucide-react';

interface MediaPanelProps {
    messages: ChatMessage[];
    onPreviewImage: (url: string) => void;
}

export function MediaPanel({ messages, onPreviewImage }: MediaPanelProps) {
    const [expandImages, setExpandImages] = useState(true);
    const [expandFiles, setExpandFiles] = useState(true);
    const [expandLinks, setExpandLinks] = useState(true);
    const [showAllImages, setShowAllImages] = useState(false);
    const [showAllFiles, setShowAllFiles] = useState(false);
    const [showAllLinks, setShowAllLinks] = useState(false);

    const allImages = messages.flatMap(m => (m.attachments || []).filter(a => ['image', 'video', 'sticker'].includes(a.type)));
    const allFiles = messages.flatMap(m => (m.attachments || []).filter(a => a.type === 'file').map(a => ({ ...a, createdAt: m.createdAt })));

    const allLinksRaw: { url: string; title: string; domain: string; createdAt: string }[] = [];
    messages.forEach(m => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (m.content) {
            const matches = m.content.match(urlRegex);
            if (matches) {
                matches.forEach(url => {
                    if (url.includes('.zdn.vn') || url.includes('zaloapp.com')) return;
                    let domain = url;
                    try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
                    allLinksRaw.push({ url, title: domain, domain, createdAt: m.createdAt });
                });
            }
        }
        if (m.attachments) {
            m.attachments.filter(a => a.type === 'link').forEach(a => {
                let domain = a.url || '';
                try { if (a.url) domain = new URL(a.url).hostname.replace('www.', ''); } catch {}
                allLinksRaw.push({ url: a.url || '', title: a.name || domain, domain, createdAt: m.createdAt });
            });
        }
    });

    const uniqueLinksMap = new Map<string, typeof allLinksRaw[0]>();
    allLinksRaw.forEach(link => { if (!uniqueLinksMap.has(link.url)) uniqueLinksMap.set(link.url, link); });
    const allLinks = Array.from(uniqueLinksMap.values());

    const displayedImages = showAllImages ? allImages : allImages.slice(0, 8);
    const displayedFiles = showAllFiles ? allFiles : allFiles.slice(0, 3);
    const displayedLinks = showAllLinks ? allLinks : allLinks.slice(0, 3);

    return (
        <div style={{ background: '#f8fafc', minHeight: '100%' }}>
            {/* Images/Video */}
            <CollapsibleSection title="Ảnh/Video" expanded={expandImages} onToggle={() => setExpandImages(!expandImages)}>
                {allImages.length === 0 ? (
                    <EmptyLabel text="Không có ảnh nào" />
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 12 }}>
                            {displayedImages.map((att, i) => (
                                <div key={i} style={{ aspectRatio: '1', background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', cursor: 'pointer', position: 'relative' }} onClick={() => onPreviewImage(att.url)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={att.url} alt="media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                    {att.type === 'video' && (
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                            <Play size={16} fill="#fff" color="#fff" />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {allImages.length > 8 && !showAllImages && (
                            <ShowAllButton onClick={() => setShowAllImages(true)} />
                        )}
                    </>
                )}
            </CollapsibleSection>

            {/* Files */}
            <CollapsibleSection title="File" expanded={expandFiles} onToggle={() => setExpandFiles(!expandFiles)} borderBottom>
                {allFiles.length === 0 ? (
                    <EmptyLabel text="Không có tập tin nào" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                        {displayedFiles.map((att, i) => {
                            const name = att.name || 'Tập tin đính kèm';
                            const ext = name.split('.').pop()?.toLowerCase();
                            let IconComponent = FileText;
                            let iconColor = "#64748b";

                            if (['zip', 'rar', '7z'].includes(ext || '')) { IconComponent = FileArchive; iconColor = '#8b5cf6'; }
                            else if (['mp4', 'mov', 'avi'].includes(ext || '')) { IconComponent = FileVideo; iconColor = '#8b5cf6'; }
                            else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) { IconComponent = FileImage; iconColor = '#3b82f6'; }
                            else if (!name.includes('.')) { IconComponent = Folder; iconColor = '#facc15'; }
                            else { IconComponent = FileText; iconColor = '#8b5cf6'; }

                            const dateStr = att.createdAt ? new Date(att.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

                            return (
                                <div key={i} onClick={() => window.open(att.url, '_blank')} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                                    paddingBottom: i !== displayedFiles.length - 1 ? 12 : 0,
                                    borderBottom: i !== displayedFiles.length - 1 ? '1px solid #f1f5f9' : 'none'
                                }}>
                                    <div style={{ width: 44, height: 50, background: iconColor, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                                        <IconComponent size={24} color="#fff" strokeWidth={1.5} />
                                        {['zip', 'rar'].includes(ext || '') && <div style={{ position: 'absolute', bottom: 2, fontSize: 8, fontWeight: 'bold' }}>ZIP</div>}
                                        {['mp4', 'mov'].includes(ext || '') && <div style={{ position: 'absolute', bottom: 2, fontSize: 8, fontWeight: 'bold' }}>VIDEO</div>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{name}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span>2.4 MB</span>
                                                <CheckCircle2 size={14} color="#22c55e" />
                                            </div>
                                            <span>{dateStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {allFiles.length > 3 && !showAllFiles && (
                    <ShowAllButton onClick={() => setShowAllFiles(true)} />
                )}
            </CollapsibleSection>

            {/* Links */}
            <CollapsibleSection title="Link" expanded={expandLinks} onToggle={() => setExpandLinks(!expandLinks)}>
                {allLinks.length === 0 ? (
                    <EmptyLabel text="Không có link nào" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
                        {displayedLinks.map((linkObj, i) => {
                            const isYoutube = linkObj.domain.includes('youtube.com') || linkObj.domain.includes('youtu.be');
                            const dateStr = linkObj.createdAt ? new Date(linkObj.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';

                            return (
                                <div key={i} onClick={() => window.open(linkObj.url, '_blank')} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                                    paddingBottom: i !== displayedLinks.length - 1 ? 12 : 0,
                                    borderBottom: i !== displayedLinks.length - 1 ? '1px solid #f1f5f9' : 'none'
                                }}>
                                    <div style={{ width: 44, height: 44, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isYoutube ? '#ef4444' : '#64748b', flexShrink: 0 }}>
                                        {isYoutube ? (
                                            <div style={{ width: 22, height: 16, background: '#ef4444', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Play size={10} fill="#fff" color="#fff" />
                                            </div>
                                        ) : <LinkIcon size={20} strokeWidth={2} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{linkObj.title}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                                            <span style={{ color: '#3b82f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, marginRight: 8 }}>{linkObj.domain}</span>
                                            <span style={{ color: '#94a3b8', flexShrink: 0 }}>{dateStr}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {allLinks.length > 3 && !showAllLinks && (
                    <ShowAllButton onClick={() => setShowAllLinks(true)} />
                )}
            </CollapsibleSection>
        </div>
    );
}

/* ===== Shared Sub-Components ===== */

function CollapsibleSection({ title, expanded, onToggle, borderBottom, children }: {
    title: string; expanded: boolean; onToggle: () => void; borderBottom?: boolean; children: React.ReactNode;
}) {
    return (
        <div style={{ background: '#fff', marginBottom: borderBottom ? 0 : 6, borderBottom: '1px solid var(--border)' }}>
            <div onClick={onToggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{title}</div>
                <ChevronDown size={16} color="#64748b" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: '0.2s' }} />
            </div>
            {expanded && <div style={{ padding: '0 14px 14px 14px' }}>{children}</div>}
        </div>
    );
}

function EmptyLabel({ text }: { text: string }) {
    return <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>{text}</div>;
}

function ShowAllButton({ onClick }: { onClick: () => void }) {
    return (
        <button onClick={onClick} style={{ width: '100%', padding: '8px 0', background: '#e2e8f0', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
            Xem tất cả
        </button>
    );
}
