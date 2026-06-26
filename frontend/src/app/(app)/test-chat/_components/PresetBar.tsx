import { PRESET_MESSAGES } from '../types';

interface PresetBarProps {
    onSend: (text: string) => void;
    disabled: boolean;
}

export function PresetBar({ onSend, disabled }: PresetBarProps) {
    return (
        <div className="px-5 py-2.5 bg-white border-b border-slate-50 flex gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400 self-center mr-1">Quick:</span>
            {PRESET_MESSAGES.map((p, i) => (
                <button
                    key={i}
                    onClick={() => onSend(p.text)}
                    disabled={disabled}
                    className="px-2.5 py-1 rounded-md text-[11px] font-medium
                        bg-slate-100 border border-slate-200 text-slate-700
                        cursor-pointer transition-all duration-150
                        hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}
