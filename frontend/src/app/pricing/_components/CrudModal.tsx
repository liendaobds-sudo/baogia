"use client";
import React, { useState, useEffect } from 'react';

export interface FieldDef {
    key: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'checkbox' | 'textarea';
    required?: boolean;
    placeholder?: string;
    options?: { value: string; label: string }[];
    defaultValue?: string | number | boolean;
    step?: string;
    min?: number;
    readOnly?: boolean;
    /** Ghi chú nhỏ hiển thị dưới ô nhập. */
    hint?: string;
    /** Tiêu đề nhóm hiển thị (full width) NGAY TRƯỚC field này — để phân nhóm form. */
    section?: string;
}

interface CrudModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    title: string;
    fields: FieldDef[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialData?: any;
    isEdit?: boolean;
}

export function CrudModal({ isOpen, onClose, onSave, title, fields, initialData, isEdit }: CrudModalProps) {
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData({ ...initialData });
            } else {
                const defaults: Record<string, unknown> = {};
                fields.forEach(f => {
                    if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
                    else if (f.type === 'checkbox') defaults[f.key] = false;
                    else if (f.type === 'number') defaults[f.key] = 0;
                    else defaults[f.key] = '';
                });
                setFormData(defaults);
            }
            setError('');
        }
    }, [isOpen, initialData, fields]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            await onSave(formData);
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
        } finally {
            setSaving(false);
        }
    };

    const setValue = (key: string, value: unknown) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-slate-50">
                    <h3 className="text-lg font-bold text-slate-800">{isEdit ? 'Chỉnh sửa' : 'Thêm mới'} {title}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-lg transition-colors">
                        <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                    {error && (
                        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                            <strong>Lỗi:</strong> {error}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map((field) => (
                            <React.Fragment key={field.key}>
                                {field.section && (
                                    <div className="md:col-span-2 mt-1">
                                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1">{field.section}</div>
                                    </div>
                                )}
                                <div className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                                    </label>
                                    {field.type === 'select' ? (
                                        <select
                                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all bg-white"
                                            value={String(formData[field.key] || '')}
                                            onChange={e => setValue(field.key, e.target.value)}
                                            required={field.required}
                                        >
                                            <option value="">-- Chọn --</option>
                                            {field.options?.map(opt => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    ) : field.type === 'checkbox' ? (
                                        <label className="flex items-center gap-2 cursor-pointer mt-1">
                                            <input
                                                type="checkbox"
                                                checked={!!formData[field.key]}
                                                onChange={e => setValue(field.key, e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-600">{field.placeholder || 'Bật'}</span>
                                        </label>
                                    ) : field.type === 'textarea' ? (
                                        <textarea
                                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
                                            rows={3}
                                            value={String(formData[field.key] || '')}
                                            onChange={e => setValue(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                        />
                                    ) : (
                                        <input
                                            type={field.type}
                                            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                            value={formData[field.key] !== undefined ? String(formData[field.key]) : ''}
                                            onChange={e => setValue(field.key, field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                                            placeholder={field.placeholder}
                                            required={field.required}
                                            step={field.step}
                                            min={field.min}
                                            readOnly={field.readOnly}
                                        />
                                    )}
                                    {field.hint && <p className="text-[11px] text-slate-400 mt-1 leading-snug">{field.hint}</p>}
                                </div>
                            </React.Fragment>
                        ))}
                    </div>
                </form>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={(e) => {
                            const form = (e.target as HTMLElement).closest('.relative')?.querySelector('form');
                            form?.requestSubmit();
                        }}
                        disabled={saving}
                        className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
                    >
                        {saving ? (
                            <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                Đang lưu...
                            </>
                        ) : (
                            <>{isEdit ? 'Cập nhật' : 'Thêm mới'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ============ DELETE CONFIRM DIALOG ============ */
interface DeleteConfirmProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    itemName: string;
}

export function DeleteConfirm({ isOpen, onClose, onConfirm, itemName }: DeleteConfirmProps) {
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 text-center">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Xác nhận xóa</h3>
                <p className="text-sm text-slate-500 mb-6">
                    Bạn có chắc chắn muốn xóa <strong className="text-slate-700">{itemName}</strong>? Hành động này không thể hoàn tác.
                </p>
                <div className="flex gap-3 justify-center">
                    <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">Hủy</button>
                    <button onClick={handleDelete} disabled={deleting} className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                        {deleting ? 'Đang xóa...' : 'Xóa'}
                    </button>
                </div>
            </div>
        </div>
    );
}
