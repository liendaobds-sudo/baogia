'use client';

interface LightboxProps {
    url: string;
    onClose: () => void;
}

export function Lightbox({ url, onClose }: LightboxProps) {
    return (
        <div onClick={onClose} className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center cursor-zoom-out animate-[fadeIn_0.15s_ease]">
            <img src={url} alt="Preview" referrerPolicy="no-referrer" onClick={e => e.stopPropagation()}
                className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] cursor-default" />
            <button onClick={onClose}
                className="absolute top-4 right-4 bg-white/15 border-none text-white text-[28px] w-10 h-10 rounded-full cursor-pointer flex items-center justify-center backdrop-blur-lg">×</button>
            <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="absolute top-4 right-[68px] bg-white/15 border-none text-white text-lg w-10 h-10 rounded-full cursor-pointer no-underline flex items-center justify-center backdrop-blur-lg"
                title="Mở trong tab mới">↗</a>
        </div>
    );
}

/* ===== Context Menu Item ===== */
interface ContextMenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
}

export function ContextMenuItem({ icon, label, onClick, danger }: ContextMenuItemProps) {
    return (
        <button onClick={onClick}
            className={`w-full px-4 py-2.5 bg-transparent border-none flex items-center gap-3 text-sm cursor-pointer transition-colors
                ${danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100'}`}>
            <span className="text-slate-500">{icon}</span>
            <span>{label}</span>
        </button>
    );
}
