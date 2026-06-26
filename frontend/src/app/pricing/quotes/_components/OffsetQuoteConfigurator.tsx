'use client';
/**
 * OffsetQuoteConfigurator — Cấu hình báo giá IN OFFSET theo bảng giá Offset v7.2 (EngineOffset).
 *
 * 5 loại sản phẩm, mỗi loại 1 form khớp input của calculator backend:
 *  - to_roi          (Tờ rơi / tờ gấp / letter — khổ cố định)
 *  - bi_thu_folder   (Bì thư / folder — khổ cố định)
 *  - sp_khac         (Sản phẩm khác — khổ in nhập trực tiếp, có ép kim)
 *  - hop_giay        (Hộp giấy — khổ tùy chỉnh)
 *  - tui_giay        (Túi giấy — khổ tùy chỉnh)
 *
 * Đổ dropdown từ GET /pricing/offset/pricebook; submit gọi POST /pricing/offset/calculate với `type`.
 * FILE ĐỘC LẬP — không phụ thuộc engine cũ (machine/imposition).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useOffsetPricebook, type OffsetQuoteResult, type Pricebook, type KhoInOpt, type OffsetProductConfig } from '../_hooks/useOffsetPricebook';
import { useQuoteCart } from '../_store/useQuoteCart';
import { OffsetPreviewSVG } from './OffsetPreviewSVG';
import DielinePreview from './DielinePreview';

/** Loại khuôn bế cho xếp bài chính xác (engine dieline). BẮT BUỘC chọn — không còn chế độ ước lượng. */
const BOX_TYPE_OPTS = [
    { id: 'rte', label: 'Hộp nắp gài so le (RTE)' },
    { id: 'slb', label: 'Hộp đáy gài tự động' },
    { id: 'gable', label: 'Hộp quai xách (Gable)' },
    { id: 'pizza', label: 'Hộp Pizza (FEFCO 0426)' },
    { id: 'tray', label: 'Hộp diêm / Khay (FEFCO 0410)' },
];

/**
 * Kích thước MẶC ĐỊNH theo từng loại khuôn (cm) — chọn theo tỉ lệ thực tế để khuôn
 * vẽ không méo/chéo. Mapping: rong→L, hong→W, cao→D (chiều cao vách).
 *  • rte/slb/gable: hộp đứng (cao lớn).
 *  • pizza/tray: khay dẹt (cao nhỏ, đáy rộng).
 */
const BOX_TYPE_DIMS: Record<string, { cao: number; rong: number; hong: number }> = {
    rte: { cao: 10, rong: 8, hong: 4 },
    slb: { cao: 10, rong: 8, hong: 4 },
    gable: { cao: 15, rong: 10, hong: 7 },
    pizza: { cao: 4, rong: 25, hong: 25 },
    tray: { cao: 4, rong: 18, hong: 12 },
};

type ProductType = 'to_roi' | 'bi_thu_folder' | 'sp_khac' | 'hop_giay' | 'tui_giay';
export type OffsetProductType = ProductType;

const TYPE_TABS: { id: ProductType; label: string; hint: string }[] = [
    { id: 'to_roi', label: 'Tờ rơi', hint: 'Tờ gấp, letter' },
    { id: 'bi_thu_folder', label: 'Bì thư / Folder', hint: 'Khổ cố định' },
    { id: 'sp_khac', label: 'Sản phẩm khác', hint: 'Khổ in tùy chọn' },
    { id: 'hop_giay', label: 'Hộp giấy', hint: 'Khổ tùy chỉnh' },
    { id: 'tui_giay', label: 'Túi giấy', hint: 'Khổ tùy chỉnh' },
];

// Bảng "bài in" túi: lấy từ pricebook (backend TUI_NEST_OPTIONS), fallback rỗng.
const fmt = (n: number | undefined) =>
    n == null ? '-' : n.toLocaleString('vi-VN', { maximumFractionDigits: 0 });

// ─────────────── field helpers ───────────────
const lbl = 'block text-[13px] font-bold text-slate-600 mb-1.5';
const inp = 'w-full text-sm font-medium px-3 py-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none bg-white';

function Num({ label, value, onChange, min = 0, step, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; disabled?: boolean }) {
    return (
        <div>
            <label className={lbl}>{label}</label>
            <input type="number" min={min} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className={`${inp} ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`} />
        </div>
    );
}
function Sel({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; disabled?: boolean }) {
    return (
        <div>
            <label className={lbl}>{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`${inp} ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}>
                <option value="">-- Chọn --</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
        </div>
    );
}
function Chk({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <label className={`flex items-center gap-2 text-[12px] font-semibold text-slate-700 h-8 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" />
            {label}
        </label>
    );
}

/** Nhóm các toggle (checkbox) vào 1 card gọn — tự ẩn khi không có mục nào hiển thị. */
function ToggleCard({ items }: { items: { show: boolean; label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }[] }) {
    const vis = items.filter((i) => i.show);
    if (vis.length === 0) return null;
    return (
        <div className="bg-slate-50/80 border border-dashed border-slate-200 rounded-lg px-3 py-2.5">
            <div className="text-[10px] uppercase font-bold text-slate-500 mb-1 tracking-wider">Tuỳ chọn gia công</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
                {vis.map((i) => <Chk key={i.label} label={i.label} value={i.value} onChange={i.onChange} disabled={i.disabled} />)}
            </div>
        </div>
    );
}

/** Mục cấu hình xổ ra/thu gọn (collapsible) — dùng cho "Cấu trúc sản phẩm". */
function Collapsible({ title, hint, defaultOpen = false, children }: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button type="button" onClick={() => setOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors">
                <span className="text-[13px] font-bold text-slate-700">{title}</span>
                <span className="flex items-center gap-2">
                    {hint && <span className="text-[11px] font-medium text-slate-400">{hint}</span>}
                    <span className={`text-slate-400 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
                </span>
            </button>
            {open && <div className="p-3 bg-white">{children}</div>}
        </div>
    );
}

const TP_OPTS = [{ id: 'khong', label: 'Không' }, { id: 'tc', label: 'Thủ công' }, { id: 'may', label: 'Máy' }];

/**
 * Bế / Khuôn — gộp 2 trạng thái (be, khuon) thành MỘT lựa chọn hợp logic, tránh mâu thuẫn
 * "bế nhưng không có khuôn" hoặc "có khuôn nhưng không bế". Engine vẫn nhận 2 boolean như cũ.
 *  - 'khong'  → không bế        (be=false, khuon=false)
 *  - 'moi'    → bế + khuôn mới   (be=true,  khuon=true)
 *  - 'cosan'  → bế, khuôn có sẵn (be=true,  khuon=false) — tái dùng khuôn, không tính phí khuôn
 */
const BE_KHUON_OPTS = [
    { id: 'khong', label: 'Không bế' },
    { id: 'moi', label: 'Bế + làm khuôn mới' },
    { id: 'cosan', label: 'Bế (dùng khuôn có sẵn)' },
];
function beKhuonValue(st: { be?: boolean; khuon?: boolean }): string {
    if (!st.be) return 'khong';
    return st.khuon ? 'moi' : 'cosan';
}
function BeKhuonSel({ st, set, disabled }: { st: any; set: (k: string, v: any) => void; disabled?: boolean }) {
    return (
        <Sel label="Bế / khuôn" value={beKhuonValue(st)} disabled={disabled}
            onChange={(v) => {
                set('be', v !== 'khong');
                set('khuon', v === 'moi');
            }} options={BE_KHUON_OPTS} />
    );
}

/** Mã công đoạn LÕI (đã có field riêng) — không đưa vào danh sách "Gia công thêm". */
const CORE_PROC_CODES = new Set(['IN', 'CAN', 'GIAY', 'BE', 'CATXEN', 'DONGGOI', 'TP_TC', 'TP_MAY', 'TP_TUI', 'DANTD', 'BOI', 'XLBM']);

/**
 * Gia công THÊM — danh sách động từ "Danh Mục Gia Công" (pb.giaCong, scope_offset). Cho tick
 * các công đoạn ngoài tập lõi (vd phủ UV, ép nhũ). Lưu mảng mã vào `st.extraProcessing`.
 * Thêm gia công mới ở Cài đặt là tự hiện ở đây — không cần sửa code.
 */
function ExtraProcSel({ pb, st, set }: { pb: any; st: any; set: (k: string, v: any) => void }) {
    const opts = ((pb?.giaCong ?? []) as any[])
        .filter((g) => g.billingMode !== 'external' && !CORE_PROC_CODES.has(g.code))
        .map((g) => ({ code: g.code, label: g.congDoan || g.code }));
    if (opts.length === 0) return null;
    const selected: string[] = Array.isArray(st.extraProcessing) ? st.extraProcessing : [];
    const toggle = (code: string) => {
        const next = selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code];
        set('extraProcessing', next);
    };
    return (
        <div className="col-span-2">
            <label className={lbl}>Gia công thêm</label>
            <div className="flex flex-wrap gap-2">
                {opts.map((o) => {
                    const on = selected.includes(o.code);
                    return (
                        <button key={o.code} type="button" onClick={() => toggle(o.code)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                            {on ? '✓ ' : '+ '}{o.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Select có Ô LỌC: gõ để lọc danh sách (vd "couche" → chỉ hiện giấy Couché). */
function SearchSelect({ label, value, onChange, options, disabled, placeholder = 'Gõ để lọc...' }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[]; disabled?: boolean; placeholder?: string }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.id === value);
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return (
        <div className="relative">
            <label className={lbl}>{label}</label>
            <input
                className={`${inp} ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                value={open ? query : (selected?.label ?? '')}
                placeholder={selected ? selected.label : placeholder}
                disabled={disabled}
                onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {open && !disabled && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-slate-400 italic">Không có kết quả</div>}
                    {filtered.map((o) => (
                        <div key={o.id} onMouseDown={() => { onChange(o.id); setQuery(''); setOpen(false); }}
                            className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${o.id === value ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700'}`}>
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function SectionHeader({ num, title }: { num: number; title: string }) {
    return (
        <h4 className="font-bold text-[11px] mb-2.5 text-slate-700 uppercase tracking-wider flex items-center gap-1.5 border-b-2 border-slate-200 pb-1.5">
            <span className="bg-indigo-100 text-indigo-700 w-4 h-4 rounded-full flex items-center justify-center text-[9px]">{num}</span> {title}
        </h4>
    );
}

// ─────────────── per-type forms ───────────────

/** Bộ trợ giúp lọc danh sách + ẩn/khoá field theo cấu hình loại sản phẩm (whitelist). */
function makeUI(pb: any, cfg: OffsetProductConfig = {}) {
    const hidden = new Set(cfg.hidden ?? []);
    const locked = new Set(cfg.locked ?? []);
    // STRICT: chỉ hiển thị mục NẰM TRONG whitelist của sản phẩm. Danh sách rỗng/chưa cấu hình
    // = không có mục nào (đi đúng theo cài đặt, KHÔNG fallback hiện tất cả).
    const keep = (allowed: string[] | undefined, id: string) => Array.isArray(allowed) && allowed.includes(id);
    return {
        show: (f: string) => !hidden.has(f),
        lock: (f: string) => locked.has(f),
        materials: () => pb.materials.filter((m: any) => keep(cfg.allowedMaterials, m.code)).map((m: any) => ({ id: m.code, label: `${m.code} — ${m.materialName}` })),
        vatTuBeMat: () => pb.vatTuBeMat.filter((v: any) => keep(cfg.allowedVatTuBeMat, v.ten)).map((v: any) => ({ id: v.ten, label: v.ten })),
        khoIn: () => pb.khoIn.filter((k: any) => keep(cfg.allowedKhoIn, k.khoIn)).map((k: any) => ({ id: k.khoIn, label: k.loaiKem ? `${k.khoIn} (${k.loaiKem})` : k.khoIn })),
        epKim: () => [{ id: 'Không', label: 'Không' }, ...pb.epKim.rows.filter((r: any) => keep(cfg.allowedEpKim, r.viTri)).map((r: any) => ({ id: r.viTri, label: r.viTri }))],
        kichToRoi: () => pb.fixedSizes.toRoi.filter((f: any) => keep(cfg.allowedKichThuoc, f.kichThuoc)).map((f: any) => ({ id: f.kichThuoc, label: f.kichThuoc })),
        kichBiThu: () => pb.fixedSizes.biThuFolder.filter((f: any) => keep(cfg.allowedKichThuoc, f.kichThuoc)).map((f: any) => ({ id: f.kichThuoc, label: `${f.kichThuoc} (${f.loai})` })),
        // Lọc loại khuôn theo whitelist (không còn tùy chọn rỗng — bắt buộc chọn khuôn bế).
        boxTypes: (full: { id: string; label: string }[]) => full.filter((o) => keep(cfg.allowedBoxTypes, o.id)),
    };
}
type UI = ReturnType<typeof makeUI>;

/** Chuyển đổi 2 chế độ kích thước cho tờ rơi / bì thư: khổ có sẵn ↔ nhập kích thước. */
function SizeModeToggle({ mode, onChange }: { mode: string; onChange: (m: 'fixed' | 'custom') => void }) {
    const opts: [string, string][] = [['fixed', 'Khổ có sẵn'], ['custom', 'Nhập kích thước']];
    return (
        <div className="col-span-2 flex gap-2">
            {opts.map(([id, label]) => (
                <button key={id} type="button" onClick={() => onChange(id as 'fixed' | 'custom')}
                    className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${mode === id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {label}
                </button>
            ))}
        </div>
    );
}

function KieuInSel({ pb, value, onChange, disabled }: { pb: any; value: number; onChange: (v: number) => void; disabled?: boolean }) {
    const opts = (((pb?.soMauOptions as number[]) ?? [1, 2, 4, 5, 6])).map((n) => ({ id: String(n), label: n === 4 ? '4 màu (CMYK)' : `${n} màu` }));
    return <Sel label="Kiểu in (số màu)" value={String(value)} onChange={(v) => onChange(Number(v))} options={opts} disabled={disabled} />;
}

function ToRoiForm({ pb, st, set, ui }: { pb: any; st: any; set: (k: string, v: any) => void; ui: UI }) {
    return (
        <div className="flex flex-col gap-4">
            <SectionHeader num={1} title="Thông tin sản phẩm" />
            <div className="grid grid-cols-2 gap-4">
                <SizeModeToggle mode={st.sizeMode} onChange={(m) => set('sizeMode', m)} />
                {st.sizeMode === 'custom' ? (
                    <>
                        <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />
                        <Num label="Rộng (cm)" value={st.rong} onChange={(v) => set('rong', v)} step={0.1} disabled={ui.lock('rong')} />
                        <Num label="Cao (cm)" value={st.cao} onChange={(v) => set('cao', v)} step={0.1} disabled={ui.lock('cao')} />
                        <div className="col-span-2 text-[12px] text-slate-600 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2">
                            Khổ in: <b className="text-indigo-700">{st.khoIn || '— chọn ở thẻ "Gợi ý khổ giấy" bên phải →'}</b>
                        </div>
                    </>
                ) : (
                    <>
                        {ui.show('kichThuoc') && <Sel label="Kích thước" value={st.kichThuoc} onChange={(v) => set('kichThuoc', v)} options={ui.kichToRoi()} disabled={ui.lock('kichThuoc')} />}
                        {ui.show('soLuong') && <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />}
                    </>
                )}
            </div>

            <SectionHeader num={2} title="Vật tư & In ấn" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('materialCode') && <SearchSelect label="Giấy in" value={st.materialCode} onChange={(v) => set('materialCode', v)} options={ui.materials()} disabled={ui.lock('materialCode')} />}
                {ui.show('soMatIn') && <Sel label="Số mặt in" value={String(st.soMatIn)} onChange={(v) => set('soMatIn', Number(v))} options={[{ id: '1', label: '1 mặt' }, { id: '2', label: '2 mặt' }]} disabled={ui.lock('soMatIn')} />}
                {ui.show('soKemIn') && <KieuInSel pb={pb} value={st.soKemIn} onChange={(v) => set('soKemIn', v)} disabled={ui.lock('soKemIn')} />}
            </div>

            <SectionHeader num={3} title="Gia Công & Thành phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('vatTuBeMat') && <Sel label="Vật tư bề mặt" value={st.vatTuBeMat} onChange={(v) => set('vatTuBeMat', v)} options={ui.vatTuBeMat()} disabled={ui.lock('vatTuBeMat')} />}
                {ui.show('thanhPhamGap') && <Sel label="Thành phẩm gấp" value={st.thanhPhamGap} onChange={(v) => set('thanhPhamGap', v)} options={TP_OPTS} disabled={ui.lock('thanhPhamGap')} />}
                {(ui.show('khuon') || ui.show('be')) && <BeKhuonSel st={st} set={set} disabled={ui.lock('be') || ui.lock('khuon')} />}
                {ui.show('thietKe') && <Num label="Thiết kế (VND)" value={st.thietKe} onChange={(v) => set('thietKe', v)} disabled={ui.lock('thietKe')} />}
            </div>
            <ToggleCard items={[
                { show: ui.show('catXen'), label: 'Cắt xén', value: st.catXen, onChange: (v) => set('catXen', v), disabled: ui.lock('catXen') },
                { show: ui.show('dongGoi'), label: 'Đóng gói', value: st.dongGoi, onChange: (v) => set('dongGoi', v), disabled: ui.lock('dongGoi') },
            ]} />
            <ExtraProcSel pb={pb} st={st} set={set} />
        </div>
    );
}

function BiThuForm({ pb, st, set, ui }: { pb: any; st: any; set: (k: string, v: any) => void; ui: UI }) {
    return (
        <div className="flex flex-col gap-4">
            <SectionHeader num={1} title="Thông tin sản phẩm" />
            <div className="grid grid-cols-2 gap-4">
                <SizeModeToggle mode={st.sizeMode} onChange={(m) => set('sizeMode', m)} />
                {st.sizeMode === 'custom' ? (
                    <>
                        <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />
                        <Sel label="Loại" value={st.loai} onChange={(v) => set('loai', v)} options={[{ id: 'bithu', label: 'Bì thư' }, { id: 'folder', label: 'Folder' }]} disabled={ui.lock('loai')} />
                        <Num label="Rộng (cm)" value={st.rong} onChange={(v) => set('rong', v)} step={0.1} disabled={ui.lock('rong')} />
                        <Num label="Cao (cm)" value={st.cao} onChange={(v) => set('cao', v)} step={0.1} disabled={ui.lock('cao')} />
                        <div className="col-span-2 text-[12px] text-slate-600 bg-indigo-50/60 border border-indigo-100 rounded-lg px-3 py-2">
                            Khổ in: <b className="text-indigo-700">{st.khoIn || '— chọn ở thẻ "Gợi ý khổ giấy" bên phải →'}</b>
                        </div>
                    </>
                ) : (
                    <>
                        {ui.show('kichThuoc') && <Sel label="Kích thước" value={st.kichThuoc} onChange={(v) => set('kichThuoc', v)} options={ui.kichBiThu()} disabled={ui.lock('kichThuoc')} />}
                        {ui.show('soLuong') && <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />}
                    </>
                )}
                {st.loai !== 'folder' && (
                    <>
                        <Sel label="Dạng nắp dán" value={st.envFlapShape || 'pointed'} onChange={(v) => set('envFlapShape', v)} options={[{ id: 'pointed', label: 'Nhọn' }, { id: 'rounded', label: 'Tròn' }, { id: 'straight', label: 'Thẳng' }]} />
                        <Sel label="Kiểu bì thư" value={st.envStyle || 'wallet'} onChange={(v) => set('envStyle', v)} options={[{ id: 'wallet', label: 'Ngang (nắp dọc)' }, { id: 'pocket', label: 'Dọc (nắp ngang)' }]} />
                    </>
                )}
            </div>
            <SectionHeader num={2} title="Vật tư & In ấn" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('materialCode') && <SearchSelect label="Giấy in" value={st.materialCode} onChange={(v) => set('materialCode', v)} options={ui.materials()} disabled={ui.lock('materialCode')} />}
                {ui.show('soMatIn') && <Sel label="Số mặt in" value={String(st.soMatIn)} onChange={(v) => set('soMatIn', Number(v))} options={[{ id: '1', label: '1 mặt' }, { id: '2', label: '2 mặt' }]} disabled={ui.lock('soMatIn')} />}
                {ui.show('soKemIn') && <KieuInSel pb={pb} value={st.soKemIn} onChange={(v) => set('soKemIn', v)} disabled={ui.lock('soKemIn')} />}
            </div>
            <SectionHeader num={3} title="Gia Công & Thành phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('vatTuBeMat') && <Sel label="Vật tư bề mặt" value={st.vatTuBeMat} onChange={(v) => set('vatTuBeMat', v)} options={ui.vatTuBeMat()} disabled={ui.lock('vatTuBeMat')} />}
                {ui.show('thanhPhamDan') && <Sel label="Thành phẩm dán" value={st.thanhPhamDan} onChange={(v) => set('thanhPhamDan', v)} options={TP_OPTS} disabled={ui.lock('thanhPhamDan')} />}
                {(ui.show('khuon') || ui.show('be')) && <BeKhuonSel st={st} set={set} disabled={ui.lock('be') || ui.lock('khuon')} />}
                {ui.show('thietKe') && <Num label="Thiết kế (VND)" value={st.thietKe} onChange={(v) => set('thietKe', v)} disabled={ui.lock('thietKe')} />}
            </div>
            <ToggleCard items={[
                { show: ui.show('dongGoi'), label: 'Đóng gói', value: st.dongGoi, onChange: (v) => set('dongGoi', v), disabled: ui.lock('dongGoi') },
            ]} />
            <ExtraProcSel pb={pb} st={st} set={set} />
        </div>
    );
}

function SpKhacForm({ pb, st, set, ui }: { pb: any; st: any; set: (k: string, v: any) => void; ui: UI }) {
    return (
        <div className="flex flex-col gap-4">
            <SectionHeader num={1} title="Thông tin sản phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('soLuong') && <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />}
                {ui.show('soMatIn') && <Sel label="Số mặt in" value={String(st.soMatIn)} onChange={(v) => set('soMatIn', Number(v))} options={[{ id: '1', label: '1 mặt' }, { id: '2', label: '2 mặt' }]} disabled={ui.lock('soMatIn')} />}
                {ui.show('rong') && <Num label="Rộng (cm) — 0 = tự động" value={st.rong} onChange={(v) => set('rong', v)} step={0.1} disabled={ui.lock('rong')} />}
                {ui.show('cao') && <Num label="Cao (cm) — 0 = tự động" value={st.cao} onChange={(v) => set('cao', v)} step={0.1} disabled={ui.lock('cao')} />}
            </div>
            <SectionHeader num={2} title="Vật tư & In ấn" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('khoIn') && <Sel label="Khổ in" value={st.khoIn} onChange={(v) => set('khoIn', v)} options={ui.khoIn()} disabled={ui.lock('khoIn')} />}
                {ui.show('materialCode') && <SearchSelect label="Giấy in" value={st.materialCode} onChange={(v) => set('materialCode', v)} options={ui.materials()} disabled={ui.lock('materialCode')} />}
                {ui.show('soMau') && <KieuInSel pb={pb} value={st.soMau} onChange={(v) => set('soMau', v)} disabled={ui.lock('soMau')} />}
            </div>
            <SectionHeader num={3} title="Gia Công & Thành phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('vatTuBeMat') && <Sel label="Vật tư bề mặt" value={st.vatTuBeMat} onChange={(v) => set('vatTuBeMat', v)} options={ui.vatTuBeMat()} disabled={ui.lock('vatTuBeMat')} />}
                {(ui.show('khuon') || ui.show('be')) && <BeKhuonSel st={st} set={set} disabled={ui.lock('be') || ui.lock('khuon')} />}
                {ui.show('epKimViTri') && <Sel label="Ép kim" value={st.epKimViTri} onChange={(v) => set('epKimViTri', v)} options={ui.epKim()} disabled={ui.lock('epKimViTri')} />}
                {ui.show('thanhPham') && <Sel label="Thành phẩm" value={st.thanhPham} onChange={(v) => set('thanhPham', v)} options={TP_OPTS} disabled={ui.lock('thanhPham')} />}
                {ui.show('thietKe') && <Num label="Thiết kế (VND)" value={st.thietKe} onChange={(v) => set('thietKe', v)} disabled={ui.lock('thietKe')} />}
            </div>
            <ToggleCard items={[
                { show: ui.show('catXen'), label: 'Cắt xén', value: st.catXen, onChange: (v) => set('catXen', v), disabled: ui.lock('catXen') },
                { show: ui.show('dongGoi'), label: 'Đóng gói', value: st.dongGoi, onChange: (v) => set('dongGoi', v), disabled: ui.lock('dongGoi') },
            ]} />
            <ExtraProcSel pb={pb} st={st} set={set} />
        </div>
    );
}

function HopForm({ pb, st, set, ui }: { pb: any; st: any; set: (k: string, v: any) => void; ui: UI }) {
    return (
        <div className="flex flex-col gap-4">
            <SectionHeader num={1} title="Thông tin sản phẩm" />
            <div className="grid grid-cols-2 gap-4">
                <Sel label="Kiểu hộp (khuôn bế)" value={st.boxType} onChange={(v) => {
                    set('boxType', v);
                    const d = BOX_TYPE_DIMS[v];
                    if (d) { set('cao', d.cao); set('rong', d.rong); set('hong', d.hong); }
                }} options={ui.boxTypes(BOX_TYPE_OPTS)} />
                {ui.show('soLuong') && <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />}
                {ui.show('cao') && <Num label="Cao (cm)" value={st.cao} onChange={(v) => set('cao', v)} step={0.1} disabled={ui.lock('cao')} />}
                {ui.show('rong') && <Num label="Rộng (cm)" value={st.rong} onChange={(v) => set('rong', v)} step={0.1} disabled={ui.lock('rong')} />}
                {ui.show('hong') && <Num label="Hông (cm)" value={st.hong} onChange={(v) => set('hong', v)} step={0.1} disabled={ui.lock('hong')} />}
            </div>
            <SectionHeader num={2} title="Vật tư & In ấn" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('khoIn') && <Sel label="Khổ in" value={st.khoIn} onChange={(v) => set('khoIn', v)} options={ui.khoIn()} disabled={ui.lock('khoIn')} />}
                {ui.show('materialCode') && <SearchSelect label="Giấy in" value={st.materialCode} onChange={(v) => set('materialCode', v)} options={ui.materials()} disabled={ui.lock('materialCode')} />}
                {ui.show('soMatIn') && <Sel label="Số mặt in" value={String(st.soMatIn)} onChange={(v) => set('soMatIn', Number(v))} options={[{ id: '1', label: '1 mặt' }, { id: '2', label: '2 mặt' }]} disabled={ui.lock('soMatIn')} />}
                {ui.show('soMau') && <KieuInSel pb={pb} value={st.soMau} onChange={(v) => set('soMau', v)} disabled={ui.lock('soMau')} />}
            </div>
            <SectionHeader num={3} title="Gia Công & Thành phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('vatTuBeMat') && <Sel label="Vật tư bề mặt" value={st.vatTuBeMat} onChange={(v) => set('vatTuBeMat', v)} options={ui.vatTuBeMat()} disabled={ui.lock('vatTuBeMat')} />}
                {ui.show('danHop') && <Sel label="Dán hộp" value={st.danHop} onChange={(v) => set('danHop', v)} options={[{ id: 'khong', label: 'Không' }, { id: 'tc', label: 'Thủ công' }, { id: 'auto', label: 'Máy/Tự động' }]} disabled={ui.lock('danHop')} />}
                {ui.show('epKimViTri') && <Sel label="Ép kim" value={st.epKimViTri} onChange={(v) => set('epKimViTri', v)} options={ui.epKim()} disabled={ui.lock('epKimViTri')} />}
                {ui.show('thietKe') && <Num label="Thiết kế (VND)" value={st.thietKe} onChange={(v) => set('thietKe', v)} disabled={ui.lock('thietKe')} />}
            </div>
            <ToggleCard items={[
                { show: ui.show('be'), label: 'Bế', value: st.be, onChange: (v) => set('be', v), disabled: ui.lock('be') },
                { show: ui.show('boi2Lop'), label: 'Bồi 2 lớp', value: st.boi2Lop, onChange: (v) => set('boi2Lop', v), disabled: ui.lock('boi2Lop') },
                { show: ui.show('dongGoi'), label: 'Đóng gói', value: st.dongGoi, onChange: (v) => set('dongGoi', v), disabled: ui.lock('dongGoi') },
            ]} />
            <ExtraProcSel pb={pb} st={st} set={set} />
        </div>
    );
}

function TuiForm({ pb, st, set, ui }: { pb: any; st: any; set: (k: string, v: any) => void; ui: UI }) {
    return (
        <div className="flex flex-col gap-4">
            <SectionHeader num={1} title="Thông tin sản phẩm" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('soLuong') && <Num label="Số lượng" value={st.soLuong} onChange={(v) => set('soLuong', v)} min={1} disabled={ui.lock('soLuong')} />}
                {ui.show('cao') && <Num label="Cao (cm)" value={st.cao} onChange={(v) => set('cao', v)} step={0.1} disabled={ui.lock('cao')} />}
                {ui.show('rong') && <Num label="Rộng (cm)" value={st.rong} onChange={(v) => set('rong', v)} step={0.1} disabled={ui.lock('rong')} />}
                {ui.show('hong') && <Num label="Hông (cm)" value={st.hong} onChange={(v) => set('hong', v)} step={0.1} disabled={ui.lock('hong')} />}
                {ui.show('mi') && <Num label="Mí (cm)" value={st.mi} onChange={(v) => set('mi', v)} step={0.1} disabled={ui.lock('mi')} />}
            </div>
            <Collapsible title="Cấu trúc sản phẩm" hint="Quai & miệng túi" defaultOpen={false}>
                <div className="grid grid-cols-2 gap-4">
                    <Sel label="Loại quai" value={st.quaiType || 'lo'} onChange={(v) => set('quaiType', v)}
                        options={[{ id: 'lo', label: 'Quai lỗ xỏ dây' }, { id: 'dan', label: 'Quai dán (bản giấy)' }]} />
                    <Sel label="Miệng túi" value={st.mieng || 'gap'} onChange={(v) => set('mieng', v)}
                        options={[{ id: 'gap', label: 'Miệng gập (bo mép)' }, { id: 'khong', label: 'Miệng không gập' }]} />
                </div>
                <p className="mt-2 text-[11px] text-slate-400 leading-snug">
                    Quai lỗ xỏ → đục 2 lỗ luồn dây trên miệng túi. Miệng gập → bo mép miệng theo trị số <b>Mí</b> ở trên.
                </p>
            </Collapsible>
            <SectionHeader num={2} title="Vật tư & In ấn" />
            <div className="grid grid-cols-2 gap-4">
                {ui.show('materialCode') && <SearchSelect label="Giấy in" value={st.materialCode} onChange={(v) => set('materialCode', v)} options={ui.materials()} disabled={ui.lock('materialCode')} />}
                {ui.show('soKem') && <KieuInSel pb={pb} value={st.soKem} onChange={(v) => set('soKem', v)} disabled={ui.lock('soKem')} />}
            </div>
            <SectionHeader num={3} title="Gia Công & Thành phẩm" />
            <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Túi giấy đã bao gồm sẵn <b>bế khuôn + dán + thành phẩm túi</b> (bắt buộc, tính tự động trong giá).
            </div>
            <div className="grid grid-cols-2 gap-4">
                {ui.show('vatTuBeMat') && <Sel label="Vật tư bề mặt" value={st.vatTuBeMat} onChange={(v) => set('vatTuBeMat', v)} options={ui.vatTuBeMat()} disabled={ui.lock('vatTuBeMat')} />}
                {ui.show('dayXachLoai') && <Sel label="Dây xách" value={st.dayXachLoai} onChange={(v) => set('dayXachLoai', v)} options={[{ id: 'khong', label: 'Không' }, { id: '1', label: '1 dây' }, { id: '2', label: '2 dây' }]} disabled={ui.lock('dayXachLoai')} />}
                {ui.show('dayXachDonGia') && <Num label="Đơn giá dây (VND)" value={st.dayXachDonGia} onChange={(v) => set('dayXachDonGia', v)} disabled={ui.lock('dayXachDonGia')} />}
                {ui.show('thungSl') && <Num label="SL thùng caton" value={st.thungSl} onChange={(v) => set('thungSl', v)} disabled={ui.lock('thungSl')} />}
                {ui.show('thungDonGia') && <Num label="Đơn giá thùng (VND)" value={st.thungDonGia} onChange={(v) => set('thungDonGia', v)} disabled={ui.lock('thungDonGia')} />}
                {ui.show('thietKe') && <Num label="Thiết kế (VND)" value={st.thietKe} onChange={(v) => set('thietKe', v)} disabled={ui.lock('thietKe')} />}
            </div>
            <ToggleCard items={[
                { show: ui.show('dongGoi'), label: 'Đóng gói', value: st.dongGoi, onChange: (v) => set('dongGoi', v), disabled: ui.lock('dongGoi') },
            ]} />
            <ExtraProcSel pb={pb} st={st} set={set} />
        </div>
    );
}

// Khởi tạo state mặc định cho từng loại.
function defaultState(type: ProductType): Record<string, any> {
    const common = { soLuong: 1000, soMatIn: 2, vatTuBeMat: 'Không', thietKe: 0, dongGoi: true, extraProcessing: [] as string[] };
    switch (type) {
        case 'to_roi':
            return { ...common, sizeMode: 'fixed', kichThuoc: '', khoIn: '', rong: 21, cao: 29.7, materialCode: '', soKemIn: 4, khuon: false, be: false, thanhPhamGap: 'khong', catXen: true };
        case 'bi_thu_folder':
            return { ...common, sizeMode: 'fixed', kichThuoc: '', khoIn: '', rong: 22, cao: 11, loai: 'bithu', envFlapShape: 'pointed', envStyle: 'wallet', materialCode: '', soKemIn: 4, khuon: false, be: false, thanhPhamDan: 'khong' };
        case 'sp_khac':
            return { ...common, khoIn: '', rong: 0, cao: 0, materialCode: '', soMau: 4, khuon: false, be: false, thanhPham: 'khong', catXen: true, epKimViTri: 'Không' };
        case 'hop_giay':
            return { ...common, boxType: 'rte', khoIn: '', cao: 10, rong: 8, hong: 4, materialCode: '', soMau: 4, danHop: 'khong', be: true, boi2Lop: false, epKimViTri: 'Không' };
        case 'tui_giay':
            return { ...common, materialCode: '', cao: 30, rong: 25, hong: 10, mi: 4, quaiType: 'lo', mieng: 'gap', soKem: 4, dayXachLoai: 'khong', dayXachDonGia: 0, thungSl: 0, thungDonGia: 0 };
    }
}

// Dựng payload gửi backend theo `type`.
function buildPayload(type: ProductType, st: Record<string, any>): Record<string, any> {
    const base: Record<string, any> = { type, ...st };
    if (type === 'tui_giay') {
        return {
            type,
            soLuong: st.soLuong, cao: st.cao, rong: st.rong, hong: st.hong, mi: st.mi,
            materialCode: st.materialCode, baiIn: st.baiIn, soKem: st.soKem, vatTuBeMat: st.vatTuBeMat,
            dayXach: { loai: st.dayXachLoai, donGia: Number(st.dayXachDonGia) || 0 },
            thungCaton: { sl: Number(st.thungSl) || 0, donGia: Number(st.thungDonGia) || 0 },
            dongGoi: st.dongGoi, thietKe: st.thietKe, extraProcessing: st.extraProcessing,
        };
    }
    if (type === 'to_roi' || type === 'bi_thu_folder') {
        // Chế độ nhập kích thước → bỏ kichThuoc để engine đi nhánh động; chế độ tĩnh → giữ kichThuoc.
        delete base.sizeMode;
        if (st.sizeMode === 'custom') base.kichThuoc = '';
        return base;
    }
    return base;
}

function ResultPanel({ result, error }: { result: OffsetQuoteResult | null; error: string | null }) {
    if (error) return <div className="text-[12px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded p-3">{error}</div>;
    if (!result) return <div className="text-[12px] text-slate-400 italic">Nhập đầy đủ cấu hình để tự động tính giá.</div>;
    return (
        <div className="space-y-3">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl p-4 text-center shadow-sm">
                <div className="text-[11px] uppercase tracking-widest opacity-80 font-semibold">Đơn giá / sản phẩm</div>
                <div className="text-2xl font-black">{fmt(result.donGia1SP)}đ</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-[11px]">
                    <tbody>
                        {result.lines.map((l, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0">
                                <td className="px-2.5 py-1.5 text-slate-700">{l.label}</td>
                                <td className="px-2.5 py-1.5 text-right font-semibold text-slate-900">{fmt(l.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-[11px] space-y-1">
                <Row k="Tổng chưa VAT" v={result.tongChuaVAT} />
                <Row k="Hao hụt" v={result.haoHut} />
                <Row k="VAT" v={result.vat} />
                <Row k="Tổng gồm VAT" v={result.tongGomVAT} />
                <Row k="Chiết khấu" v={-result.chietKhau} />
                <div className="flex justify-between font-black text-indigo-700 pt-1 border-t border-slate-200">
                    <span>Khách trả</span><span>{fmt(result.khachTra)}đ</span>
                </div>
            </div>
        </div>
    );
}
const Row = ({ k, v }: { k: string; v: number }) => (
    <div className="flex justify-between text-slate-600"><span>{k}</span><span className="font-semibold">{fmt(v)}đ</span></div>
);

const StatCard = ({ label, value, tone }: { label: string; value: React.ReactNode; tone: string }) => (
    <div className={`pt-2 pb-2.5 rounded-lg border ${tone}`}>
        <div className="text-[8px] font-bold uppercase tracking-widest mb-0.5 opacity-70">{label}</div>
        <div className="text-lg font-black">{value}</div>
    </div>
);

function PreviewPanel({ result }: { result: OffsetQuoteResult | null }) {
    const m = result?.meta;
    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
                <div className="py-2.5 px-4 border-b border-slate-100 flex items-center bg-slate-50/50">
                    <svg className="text-indigo-600 mr-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    <h3 className="font-bold text-[13px] text-slate-700 m-0 uppercase tracking-wide">Preview Bình Bài Offset</h3>
                    {m?.khoGiayLon && <span className="ml-auto text-[10px] text-slate-400 font-semibold">{m.khoGiayLon}</span>}
                </div>
                <div className="bg-slate-100 flex-1 flex items-center justify-center p-4 min-h-[260px] overflow-hidden">
                    {m ? (
                        <OffsetPreviewSVG
                            sheetW={m.sheetW} sheetH={m.sheetH}
                            itemW={m.itemW} itemH={m.itemH}
                            soConToLon={m.soConToLon}
                        />
                    ) : (
                        <div className="text-[12px] text-slate-400 italic">Nhập đầy đủ cấu hình để xem bình bài.</div>
                    )}
                </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                <div className="grid grid-cols-4 gap-2 text-center">
                    <StatCard label="Số con/tờ" value={m?.soConToLon ?? '-'} tone="bg-blue-50/80 border-blue-100/60 text-blue-700" />
                    <StatCard label="Tổng tờ in" value={m?.soToLon?.toLocaleString('vi-VN') ?? '-'} tone="bg-emerald-50/80 border-emerald-100/60 text-emerald-700" />
                    <StatCard label="Lượt in" value={m?.luotIn != null ? Math.round(m.luotIn).toLocaleString('vi-VN') : '-'} tone="bg-amber-50/80 border-amber-100/60 text-amber-700" />
                    <StatCard label="Số kẽm" value={m?.soKem ?? '-'} tone="bg-indigo-50/80 border-indigo-100/60 text-indigo-700" />
                </div>
                {m?.loaiKem && <div className="text-[10px] text-slate-400 text-center mt-2">Loại kẽm: <span className="font-semibold text-slate-600">{m.loaiKem}</span> · Bài in: <span className="font-semibold text-slate-600">{m.khoBinh}</span></div>}
            </div>
        </div>
    );
}

export const OffsetQuoteConfigurator = ({ activeType }: { activeType?: ProductType } = {}) => {
    const { token } = useAuth();
    const { pricebook, loading, error: pbError, calculate } = useOffsetPricebook(token);
    const { addItem, vatRate, chietKhauRate, seedChietKhauRate } = useQuoteCart();
    const [internalType] = useState<ProductType>('to_roi');
    const type = activeType ?? internalType;
    const [fileName, setFileName] = useState('');
    const [states, setStates] = useState<Record<ProductType, Record<string, any>>>(() => ({
        to_roi: defaultState('to_roi'),
        bi_thu_folder: defaultState('bi_thu_folder'),
        sp_khac: defaultState('sp_khac'),
        hop_giay: defaultState('hop_giay'),
        tui_giay: defaultState('tui_giay'),
    }));
    const [result, setResult] = useState<OffsetQuoteResult | null>(null);
    const [calcError, setCalcError] = useState<string | null>(null);
    const [calculating, setCalculating] = useState(false);

    const st = states[type];
    const set = (k: string, v: any) => setStates((prev) => ({ ...prev, [type]: { ...prev[type], [k]: v } }));
    const pb = pricebook as Pricebook;

    // Cấu hình form theo loại sản phẩm (whitelist/ẩn/khoá) + bộ lọc UI.
    const ui = useMemo(() => makeUI(pb, (pb?.productConfig?.[type]) ?? {}), [pb, type]);

    // Gợi ý khổ giấy từ pb.khoIn. Khi SP khác có nhập kích thước → tính số con/tờ THẬT theo hình học
    // (thay con số tĩnh 0). Sắp xếp theo số con/tờ giảm dần.
    const suggestedSizes = useMemo(() => {
        if (!pb?.khoIn) return [];
        const parse = (s: string) => { const m = s?.match(/([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)/i); return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null; };
        const fit = (kw: number, kh: number, pw: number, ph: number, g = 0.3) => {
            if (kw <= 0 || kh <= 0 || pw <= 0 || ph <= 0) return 0;
            return Math.max(Math.floor(kw / (pw + g)) * Math.floor(kh / (ph + g)), Math.floor(kw / (ph + g)) * Math.floor(kh / (pw + g)));
        };
        // Áp số con/tờ THẬT khi đã biết kích thước phẳng: SP khác (rong/cao) hoặc tờ rơi/bì thư chế độ nhập.
        const isFlatCustom = (type === 'to_roi' || type === 'bi_thu_folder') && st.sizeMode === 'custom';
        const useDims = (type === 'sp_khac' || isFlatCustom) && st.rong > 0 && st.cao > 0;
        const list = pb.khoIn.map((k) => {
            let soConDisplay = k.soConToLon || 0;
            if (useDims) { const big = parse(k.khoGiayLon); soConDisplay = big ? fit(big.w, big.h, st.rong, st.cao) : 0; }
            return { ...k, soConDisplay };
        });
        return list.sort((a, b) => (b.soConDisplay || 0) - (a.soConDisplay || 0));
    }, [pb?.khoIn, type, st.rong, st.cao, st.sizeMode]);

    // Props cho DielinePreview HỢP NHẤT — render khuôn thật + dàn khổ + số con/tờ cho MỌI loại SP.
    //  • hop_giay (có chọn khuôn)  → khuôn hộp thật theo boxType.
    //  • tui_giay                  → ánh xạ sang khuôn paper_bag thật của engine.
    //  • sp_khac / tờ rơi / bì thư → cắt phẳng (rectangle die) theo kích thước phẳng.
    // null ⇒ chưa đủ dữ kiện → hiển thị PreviewPanel mặc định.
    const dielineProps = useMemo(() => {
        const parseSz = (s: string) => { const m = s?.match(/([\d.]+)\s*(?:cm)?\s*[x×]\s*([\d.]+)/i); return m ? { w: parseFloat(m[1]), h: parseFloat(m[2]) } : null; };
        const rong = Number(st.rong) || 0, hong = Number(st.hong) || 0, cao = Number(st.cao) || 0;
        const common = { selectedKhoIn: st.khoIn as string, onSelectSheet: (khoIn: string) => set('khoIn', khoIn) };
        if (type === 'hop_giay') {
            if (st.boxType && rong > 0 && hong > 0 && cao > 0) return { boxType: st.boxType, rong, hong, cao, ...common };
            return null;
        }
        if (type === 'tui_giay') {
            // Túi: engine chọn "bài in" theo nhãn = khoIn. Chọn khổ ở preview phải set `baiIn`
            // (không chỉ khoIn) thì giá mới đổi. selectedKhoIn highlight theo baiIn đang dùng.
            if (rong > 0 && cao > 0) return {
                boxType: 'paper_bag', rong, hong: hong || Math.max(2, Math.round(rong * 0.3)), cao,
                mi: Number(st.mi) || 0, handleHoles: (st.quaiType || 'lo') === 'lo', mieng: st.mieng || 'gap',
                selectedKhoIn: (st.baiIn as string) || (st.khoIn as string),
                onSelectSheet: (khoIn: string) => { set('baiIn', khoIn); set('khoIn', khoIn); },
            };
            return null;
        }
        if (type === 'sp_khac') {
            if (rong > 0 && cao > 0) return { itemW: rong, itemH: cao, flatShape: 'rect', ...common };
            return null;
        }
        if (type === 'to_roi' || type === 'bi_thu_folder') {
            // Bì thư = khuôn ENVELOPE thật (engine); folder = cắt phẳng có nắp túi; tờ rơi = cắt phẳng.
            const dims = st.sizeMode === 'custom'
                ? (rong > 0 && cao > 0 ? { w: rong, h: cao } : null)
                : parseSz(st.kichThuoc);
            if (!dims) return null;
            if (type === 'bi_thu_folder' && st.loai !== 'folder') {
                // Bì thư: dùng engine envelope (nắp Nhọn/Tròn/Thẳng + kiểu Ngang/Dọc).
                return { boxType: 'envelope', rong: dims.w, cao: dims.h, envFlapShape: st.envFlapShape || 'pointed', envStyle: st.envStyle || 'wallet', ...common };
            }
            const shape = type === 'bi_thu_folder' ? 'folder' : 'rect';
            return { itemW: dims.w, itemH: dims.h, flatShape: shape, ...common };
        }
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, st.boxType, st.rong, st.hong, st.cao, st.mi, st.quaiType, st.mieng, st.baiIn, st.kichThuoc, st.sizeMode, st.loai, st.envFlapShape, st.envStyle, st.khoIn]);

    // Auto-calculate realtime (debounce 500ms)
    const onCalc = useCallback(async () => {
        if (!pb) return;
        // Validate minimum fields
        const s = states[type];
        if (!s.materialCode) return;
        if (type === 'to_roi' || type === 'bi_thu_folder') {
            if (s.sizeMode === 'custom') { if (!s.khoIn || !s.rong || !s.cao) return; }
            else if (!s.kichThuoc) return;
        }
        if ((type === 'sp_khac' || type === 'hop_giay') && !s.khoIn) return;
        if (!s.soLuong || s.soLuong < 1) return;

        setCalculating(true);
        setCalcError(null);
        // VAT + chiết khấu LẤY TỪ UI (store), gửi dạng phân số cho engine (không gán cứng).
        const payload = buildPayload(type, states[type]);
        payload.vatRate = (Number(vatRate) || 0) / 100;
        payload.chietKhauRate = (Number(chietKhauRate) || 0) / 100;
        const res = await calculate(payload);
        if (res.ok) { setResult(res.data!); setCalcError(null); }
        else { setResult(null); setCalcError(res.error || 'Tính giá thất bại'); }
        setCalculating(false);
    }, [pb, type, states, calculate, vatRate, chietKhauRate]);

    useEffect(() => {
        const timeout = setTimeout(() => { onCalc(); }, 500);
        return () => clearTimeout(timeout);
    }, [onCalc]);

    // Đổi loại sản phẩm (điều khiển từ thanh tiêu đề) → xoá kết quả cũ trước khi tính lại.
    useEffect(() => { setResult(null); setCalcError(null); }, [type]);

    // Seed mặc định từ cấu hình vào tất cả loại — chỉ 1 lần sau khi nạp bảng giá:
    //  - Phí thiết kế mặc định (Gia_ThietKe) khi chưa nhập.
    //  - Giá trị mặc định theo loại từ productConfig.defaults (whitelist/lock đã áp ở form).
    const seededRef = useRef(false);
    useEffect(() => {
        if (!pb || seededRef.current) return;
        seededRef.current = true;
        // Seed chiết khấu mặc định từ cấu hình (TyLe_ChietKhau, phân số → %) — chỉ khi user chưa chỉnh.
        const ckDefault = Number(pb.params?.TyLe_ChietKhau ?? 0) * 100;
        if (ckDefault > 0) seedChietKhauRate(ckDefault);
        const giaThietKe = (pb.phiCoDinh?.find((p: any) => p.code === 'Gia_ThietKe')?.giaTri) ?? 0;
        const pc = pb.productConfig ?? {};
        setStates((prev) => {
            const next = { ...prev };
            (Object.keys(next) as ProductType[]).forEach((k) => {
                let merged = { ...next[k] };
                // 1) Mặc định cấu hình theo loại (ghi đè giá trị khởi tạo cứng).
                const defs = pc[k]?.defaults;
                if (defs) merged = { ...merged, ...defs };
                // 2) Phí thiết kế mặc định nếu chưa có/đang 0 và admin chưa đặt qua defaults.
                if (giaThietKe > 0 && !merged.thietKe) merged.thietKe = giaThietKe;
                next[k] = merged;
            });
            return next;
        });
    }, [pb]);

    const handleAddToCart = () => {
        if (!result) return;
        const label = TYPE_TABS.find(t => t.id === type)?.label || 'Offset';
        // QUY ƯỚC THỐNG NHẤT: lưu giá TRƯỚC VAT (đã trừ chiết khấu engine); VAT cộng 1 lần ở tầng báo giá.
        const netPreVat = (result.tongChuaVAT || 0) - (result.chietKhau || 0);
        addItem({
            name: fileName || `${label} Offset`,
            type: 'offset',
            quantity: st.soLuong || 1,
            total: netPreVat,
            unitPrice: (st.soLuong || 0) > 0 ? netPreVat / st.soLuong : result.donGia1SP,
            details: result,
            configParams: { ...buildPayload(type, st), vatRate: (Number(vatRate) || 0) / 100, chietKhauRate: (Number(chietKhauRate) || 0) / 100 },
        });
        setFileName('');
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-1 overflow-hidden p-5 bg-[#f8fafc]">
                {loading && <div className="text-slate-400 text-sm">Đang tải bảng giá...</div>}
                {pbError && <div className="text-red-600 text-sm font-semibold">{pbError}</div>}
                {!loading && pb && (
                    <div className="grid grid-cols-1 lg:grid-cols-8 gap-5 h-full">
                        {/* LEFT: Form cấu hình */}
                        <div className="lg:col-span-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 overflow-y-auto custom-scrollbar shadow-sm">
                            <div className="mb-3">
                                <label className="block text-[10px] font-bold text-indigo-700 mb-1 tracking-wide uppercase">Tên File / Sản Phẩm <span className="text-red-500">*</span></label>
                                <input type="text" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Nhập tên gọi để phân biệt" className={inp} />
                            </div>
                            {type === 'to_roi' && <ToRoiForm pb={pb} st={st} set={set} ui={ui} />}
                            {type === 'bi_thu_folder' && <BiThuForm pb={pb} st={st} set={set} ui={ui} />}
                            {type === 'sp_khac' && <SpKhacForm pb={pb} st={st} set={set} ui={ui} />}
                            {type === 'hop_giay' && <HopForm pb={pb} st={st} set={set} ui={ui} />}
                            {type === 'tui_giay' && <TuiForm pb={pb} st={st} set={set} ui={ui} />}
                        </div>
                        {/* CENTER: Preview + Gợi ý khổ giấy */}
                        <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                            {dielineProps
                                ? <DielinePreview {...dielineProps} />
                                : <PreviewPanel result={result} />}
                            {/* Gợi ý khổ giấy */}
                            {suggestedSizes.length > 0 && (type === 'sp_khac' || type === 'hop_giay' || ((type === 'to_roi' || type === 'bi_thu_folder') && st.sizeMode === 'custom')) && (
                                <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
                                    <div className="flex items-center gap-2 mb-2">
                                        <svg className="text-blue-500 w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 2v6h6M21.5 22v-6h-6"/><path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.2"/></svg>
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gợi ý khổ giấy</span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {suggestedSizes.slice(0, 4).map((opt, i) => {
                                            const isSelected = st.khoIn === opt.khoIn;
                                            const isBest = i === 0;
                                            return (
                                                <div key={opt.khoIn} onClick={() => set('khoIn', opt.khoIn)}
                                                    className={`cursor-pointer rounded-lg border px-3 py-2 transition-all flex items-center justify-between gap-2 ${
                                                        isSelected ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' :
                                                        isBest ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                                                    }`}>
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="font-bold text-[12px] text-slate-800 truncate">{opt.khoIn}</span>
                                                        {isBest && <span className="bg-emerald-500 text-white text-[8px] px-1.5 py-0.5 rounded leading-none flex-shrink-0">🏆</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                                                        <span className="text-slate-500 font-semibold">{opt.soConDisplay} con/tờ</span>
                                                        <span className="text-[10px] font-medium text-slate-400">{opt.loaiKem}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* RIGHT: Chi phí + Thêm vào báo giá */}
                        <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
                            {calculating && <div className="text-[12px] text-indigo-500 font-semibold flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang tính giá...</div>}
                            <ResultPanel result={result} error={calcError} />
                            {result && !calcError && (
                                <button onClick={handleAddToCart}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 text-white font-bold py-3 px-5 rounded-lg text-[13px] transition-all flex items-center justify-center gap-2">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                    THÊM VÀO BÁO GIÁ
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

