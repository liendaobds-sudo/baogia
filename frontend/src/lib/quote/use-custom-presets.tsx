'use client';

import React, { useCallback, useEffect, useState } from 'react';

export interface CustomPreset<T = Record<string, any>> {
    id: string;
    category: string;
    label: string;
    name: string;
    data: T;
    createdAt: number;
}

const STORAGE_KEY = 'zp_custom_presets_v2';
const SEEDED_CATS_KEY = 'zp_custom_presets_seeded_cats_v2';
const EVENT_NAME = 'zp-custom-presets-change';

/**
 * Bộ mẫu gợi ý mặc định ban đầu cho từng phân hệ.
 * Được nạp tự động vào danh sách mẫu của người dùng ở lần đầu tiên để người dùng
 * có thể tự do CHỈNH SỬA (cập nhật thông số/đổi tên) hoặc XOÁ bất kỳ mẫu gợi ý nào.
 */
const DEFAULT_PRESETS_BY_CATEGORY: Record<string, Array<{ id: string; label: string; name: string; data: Record<string, any> }>> = {
    loose: [
        { id: '__preset_card_visit', label: 'Card Visit 90×55mm (500 cái)', name: 'Card Visit C300 2 mặt', data: { w: 90, h: 55, qty: 500, side: 'double', shape: 'rect' } },
        { id: '__preset_to_roi_a5', label: 'Tờ rơi A5 148×210mm (200 tờ)', name: 'Tờ rơi A5 In nhanh 2 mặt', data: { w: 148, h: 210, qty: 200, side: 'double', shape: 'rect' } },
        { id: '__preset_tem_tron_50', label: 'Tem nhãn tròn 50×50mm (1.000 tem)', name: 'Tem nhãn tròn Decal 50mm', data: { w: 50, h: 50, qty: 1000, side: 'single', shape: 'circle' } },
        { id: '__preset_voucher_9x18', label: 'Voucher quà tặng 90×180mm (300 cái)', name: 'Voucher quà tặng 90x180mm', data: { w: 180, h: 90, qty: 300, side: 'double', shape: 'rect' } },
    ],
    bound: [
        { id: '__preset_cat_a4_16', label: 'Catalogue A4 Ghim giữa 16 trang (50 cuốn)', name: 'Catalogue A4 Ghim giữa 16 trang', data: { w: 210, h: 297, pages: 16, qty: 50, bind: 'saddle_stitch', spine: 0 } },
        { id: '__preset_hsnl_a4_48', label: 'Hồ sơ năng lực A4 Keo nhiệt 48 trang (100 cuốn)', name: 'Hồ sơ năng lực A4 Keo nhiệt 48 trang', data: { w: 210, h: 297, pages: 48, qty: 100, bind: 'perfect_bind', spine: 3 } },
        { id: '__preset_sotay_a5_64', label: 'Sổ tay A5 Đóng lò xo 64 trang (100 cuốn)', name: 'Sổ tay A5 Đóng lò xo 64 trang', data: { w: 148, h: 210, pages: 64, qty: 100, bind: 'spiral', spine: 5 } },
    ],
    large_format: [
        { id: '__preset_standee_60x160', label: 'Standee 60×160cm (5 tấm)', name: 'Standee PP cán mờ 60x160cm', data: { w: 600, h: 1600, qty: 5 } },
        { id: '__preset_standee_80x180', label: 'Standee 80×180cm (5 tấm)', name: 'Standee sự kiện 80x180cm', data: { w: 800, h: 1800, qty: 5 } },
        { id: '__preset_bangron_1x4m', label: 'Băng rôn Hiflex 100×400cm (2 tấm)', name: 'Băng rôn Hiflex khai trương 1x4m', data: { w: 4000, h: 1000, qty: 2 } },
        { id: '__preset_poster_a1', label: 'Poster quảng cáo A1 60×84cm (10 tấm)', name: 'Poster quảng cáo A1 60x84cm', data: { w: 600, h: 840, qty: 10 } },
    ],
    'offset:to_roi': [
        { id: '__preset_os_toroi_a4', label: 'Tờ rơi A4 2 mặt (5.000 tờ)', name: 'Tờ rơi A4 Khuyến mãi 2 mặt', data: { sizeMode: 'custom', rong: 21, cao: 29.7, soLuong: 5000, soMatIn: 2, soMau: 4, soBoKem: 1, canGap: false, be: false } },
        { id: '__preset_os_brochure_a4', label: 'Brochure gấp 3 A4 (3.000 tờ)', name: 'Brochure gấp 3 A4 C200', data: { sizeMode: 'custom', rong: 21, cao: 29.7, soLuong: 3000, soMatIn: 2, soMau: 4, soBoKem: 1, canGap: true, soDuongCan: 2, be: false } },
        { id: '__preset_os_toroi_a5', label: 'Tờ rơi A5 SLL (10.000 tờ)', name: 'Tờ rơi A5 Phát thị trường', data: { sizeMode: 'custom', rong: 14.8, cao: 21, soLuong: 10000, soMatIn: 2, soMau: 4, soBoKem: 1, canGap: false, be: false } },
    ],
    'offset:bi_thu_folder': [
        { id: '__preset_os_bithu_12x22', label: 'Bao thư nhỏ 12×22 (2.000 cái)', name: 'Bao thư nhỏ 12x22cm', data: { loai: 'bi_thu', sizeMode: 'custom', rong: 22, cao: 12, soLuong: 2000, soMatIn: 1, soMau: 4, be: true, dan: true } },
        { id: '__preset_os_bithu_25x35', label: 'Bao thư A4 25×35 (1.000 cái)', name: 'Bao thư hồ sơ A4 25x35cm', data: { loai: 'bi_thu', sizeMode: 'custom', rong: 25, cao: 35, soLuong: 1000, soMatIn: 1, soMau: 4, be: true, dan: true } },
        { id: '__preset_os_folder_a4', label: 'Folder A4 Kẹp hồ sơ (1.000 cái)', name: 'Folder kẹp tài liệu A4', data: { loai: 'folder', sizeMode: 'custom', rong: 22, cao: 31, soLuong: 1000, soMatIn: 2, soMau: 4, be: true, dan: true } },
    ],
    'offset:sp_khac': [
        { id: '__preset_os_voucher', label: 'Voucher 9×18cm (3.000 cái)', name: 'Voucher quà tặng 9x18cm', data: { rong: 18, cao: 9, soLuong: 3000, soMatIn: 2, soMau: 4, canGap: false, be: false } },
        { id: '__preset_os_tag_5x9', label: 'Tag treo 5×9cm (5.000 cái)', name: 'Tag treo quần áo 5x9cm', data: { rong: 5, cao: 9, soLuong: 5000, soMatIn: 2, soMau: 4, be: true, khuonBe: true } },
        { id: '__preset_os_poster_40x60', label: 'Poster 40×60cm (1.000 tờ)', name: 'Poster quảng cáo 40x60cm', data: { rong: 40, cao: 60, soLuong: 1000, soMatIn: 1, soMau: 4, be: false } },
    ],
    'offset:hop_giay': [
        { id: '__preset_os_hop_rte', label: 'Hộp mỹ phẩm 8×4×12 (2.000 hộp)', name: 'Hộp kem dưỡng nắp gài 8x4x12cm', data: { boxType: 'rte', rong: 8, hong: 4, cao: 12, soLuong: 2000, soMau: 4, canGap: true, be: true, dan: true } },
        { id: '__preset_os_hop_slb', label: 'Hộp đáy tự động 10×6×15 (3.000 hộp)', name: 'Hộp đáy gài tự động 10x6x15cm', data: { boxType: 'slb', rong: 10, hong: 6, cao: 15, soLuong: 3000, soMau: 4, canGap: true, be: true, dan: true } },
        { id: '__preset_os_hop_pizza', label: 'Hộp nắp gài dẹt 22×22×4 (1.000 hộp)', name: 'Hộp quà / bánh 22x22x4cm', data: { boxType: 'pizza', rong: 22, hong: 22, cao: 4, soLuong: 1000, soMau: 4, be: true, dan: true } },
    ],
    'offset:tui_giay': [
        { id: '__preset_os_tui_20x28', label: 'Túi thời trang 20×8×28 (1.000 túi)', name: 'Túi shop thời trang 20x8x28cm', data: { rong: 20, hong: 8, cao: 28, soLuong: 1000, soMau: 4, quaiType: 'lo' } },
        { id: '__preset_os_tui_15x20', label: 'Túi mỹ phẩm 15×6×20 (2.000 túi)', name: 'Túi mỹ phẩm nhỏ 15x6x20cm', data: { rong: 15, hong: 6, cao: 20, soLuong: 2000, soMau: 4, quaiType: 'lo' } },
        { id: '__preset_os_tui_32x25', label: 'Túi ngang 32×10×25 (1.000 túi)', name: 'Túi quà tặng ngang 32x10x25cm', data: { rong: 32, hong: 10, cao: 25, soLuong: 1000, soMau: 4, quaiType: 'lo' } },
    ],
};

function readAllStoredPresets(): CustomPreset[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const parsed: CustomPreset[] = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? [...parsed] : [];

        const rawSeeded = window.localStorage.getItem(SEEDED_CATS_KEY);
        const seededCats = new Set<string>(rawSeeded ? JSON.parse(rawSeeded) : []);
        let changed = false;

        for (const [cat, defs] of Object.entries(DEFAULT_PRESETS_BY_CATEGORY)) {
            if (!seededCats.has(cat)) {
                seededCats.add(cat);
                changed = true;
                for (const d of defs) {
                    if (!list.some((p) => p.id === d.id)) {
                        list.push({
                            id: d.id,
                            category: cat,
                            label: d.label,
                            name: d.name,
                            data: d.data,
                            createdAt: 0,
                        });
                    }
                }
            }
        }

        if (changed) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
            window.localStorage.setItem(SEEDED_CATS_KEY, JSON.stringify(Array.from(seededCats)));
        }
        return list;
    } catch {
        return [];
    }
}

function writeAllStoredPresets(list: CustomPreset[]) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        window.dispatchEvent(new Event(EVENT_NAME));
    } catch {
        // ignore storage quota errors
    }
}

/**
 * Hook quản lý danh sách "Mẫu gợi ý & Mẫu đã lưu" theo từng phân hệ báo giá.
 * Mọi mẫu (kể cả mẫu gợi ý ban đầu) đều có thể Sửa/Cập nhật, Xoá hoặc Khôi phục mặc định.
 */
export function useCustomPresets<T extends Record<string, any> = Record<string, any>>(category: string) {
    const [allPresets, setAllPresets] = useState<CustomPreset[]>([]);

    useEffect(() => {
        setAllPresets(readAllStoredPresets());
        const onSync = () => setAllPresets(readAllStoredPresets());
        window.addEventListener('storage', onSync);
        window.addEventListener(EVENT_NAME, onSync);
        return () => {
            window.removeEventListener('storage', onSync);
            window.removeEventListener(EVENT_NAME, onSync);
        };
    }, []);

    const presets = allPresets.filter((p) => p.category === category) as CustomPreset<T>[];

    const savePreset = useCallback(
        (label: string, name: string, data: T, targetId?: string | null): CustomPreset<T> => {
            const cleanLabel = label.trim() || name.trim() || 'Mẫu tự lưu';
            const cleanName = name.trim() || cleanLabel;
            const current = readAllStoredPresets();
            const existingIdx = targetId
                ? current.findIndex((p) => p.id === targetId && p.category === category)
                : current.findIndex(
                      (p) => p.category === category && p.label.toLowerCase() === cleanLabel.toLowerCase(),
                  );
            const item: CustomPreset<T> = {
                id:
                    existingIdx >= 0
                        ? current[existingIdx].id
                        : `__user_preset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
                category,
                label: cleanLabel,
                name: cleanName,
                data,
                createdAt: Date.now(),
            };
            const next =
                existingIdx >= 0
                    ? current.map((p, i) => (i === existingIdx ? item : p))
                    : [item, ...current];
            writeAllStoredPresets(next);
            setAllPresets(next);
            return item;
        },
        [category],
    );

    const deletePreset = useCallback((id: string) => {
        const current = readAllStoredPresets();
        const next = current.filter((p) => p.id !== id);
        writeAllStoredPresets(next);
        setAllPresets(next);
    }, []);

    const resetDefaultPresets = useCallback(() => {
        const current = readAllStoredPresets().filter((p) => p.category !== category);
        const defs = (DEFAULT_PRESETS_BY_CATEGORY[category] || []).map((d) => ({
            id: d.id,
            category,
            label: d.label,
            name: d.name,
            data: d.data,
            createdAt: 0,
        }));
        const next = [...defs, ...current];
        writeAllStoredPresets(next);
        setAllPresets(next);
    }, [category]);

    return { presets, savePreset, deletePreset, resetDefaultPresets };
}

/**
 * Cụm nút quản lý mẫu ("+ Lưu mới", "✎ Sửa mẫu", "Xoá", "↺ Khôi phục") gắn ngay cạnh nhãn chọn mẫu.
 * Cho phép chỉnh sửa hoặc xoá cả các mẫu gợi ý nhanh đang có sẵn.
 */
export function PresetSaveControls({
    defaultLabel = '',
    activeCustomPresetId,
    activeCustomPresetLabel,
    hasAnyPreset = true,
    onSave,
    onDelete,
    onResetDefaults,
}: {
    defaultLabel?: string;
    activeCustomPresetId?: string | null;
    activeCustomPresetLabel?: string;
    hasAnyPreset?: boolean;
    onSave: (label: string, updateId?: string | null) => void;
    onDelete?: (id: string) => void;
    onResetDefaults?: () => void;
}) {
    const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle');
    const [draftLabel, setDraftLabel] = useState('');
    const [justSaved, setJustSaved] = useState(false);

    const handleOpenCreate = () => {
        setDraftLabel(defaultLabel.trim());
        setMode('create');
    };

    const handleOpenEdit = () => {
        setDraftLabel((activeCustomPresetLabel || defaultLabel).trim());
        setMode('edit');
    };

    const handleConfirm = () => {
        const finalLabel = draftLabel.trim() || defaultLabel.trim() || 'Mẫu cấu hình mới';
        onSave(finalLabel, mode === 'edit' ? activeCustomPresetId : null);
        setMode('idle');
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 1800);
    };

    return (
        <div className="inline-flex items-center gap-1 relative flex-wrap justify-end">
            {mode === 'idle' && (
                <>
                    {!hasAnyPreset && onResetDefaults && (
                        <button
                            type="button"
                            onClick={onResetDefaults}
                            title="Khôi phục lại các mẫu gợi ý mặc định ban đầu"
                            className="text-[10px] font-semibold text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                        >
                            ↺ Khôi phục mẫu gốc
                        </button>
                    )}
                    {activeCustomPresetId && (
                        <button
                            type="button"
                            onClick={handleOpenEdit}
                            title="Cập nhật thông số hiện tại trên form vào mẫu đang chọn (hoặc đổi tên mẫu)"
                            className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                        >
                            ✎ Sửa mẫu
                        </button>
                    )}
                    {activeCustomPresetId && onDelete && (
                        <button
                            type="button"
                            onClick={() => onDelete(activeCustomPresetId)}
                            title="Xoá mẫu đang chọn khỏi danh sách"
                            className="text-[10px] font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                        >
                            Xoá
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        title="Lưu cấu hình đang chọn thành một mẫu mới"
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            justSaved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                        }`}
                    >
                        {justSaved ? '✓ Đã lưu' : '+ Lưu mẫu'}
                    </button>
                </>
            )}

            {mode !== 'idle' && (
                <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-md p-0.5 shadow-sm z-30">
                    <input
                        type="text"
                        autoFocus
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirm();
                            } else if (e.key === 'Escape') {
                                setMode('idle');
                            }
                        }}
                        placeholder={mode === 'edit' ? 'Tên mẫu cập nhật...' : 'Tên mẫu mới...'}
                        className="text-[11px] font-semibold text-slate-800 px-2 py-0.5 w-40 outline-none"
                    />
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-0.5 rounded cursor-pointer"
                    >
                        {mode === 'edit' ? 'Cập nhật' : 'Lưu'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('idle')}
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-700 px-1.5 py-0.5 cursor-pointer"
                    >
                        Huỷ
                    </button>
                </div>
            )}
        </div>
    );
}
