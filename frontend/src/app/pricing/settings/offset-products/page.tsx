"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '../../_components/apiClient';
import { OffsetSettingsNav } from '../_components/OffsetSettingsNav';

/**
 * Cấu hình form báo giá THEO LOẠI SẢN PHẨM — In Offset. Tất cả CẤU HÌNH ĐƯỢC, không gán cứng.
 *  - Whitelist tài nguyên (giấy in / khổ in / kích thước / vật tư bề mặt / ép kim) hiển thị cho mỗi loại.
 *  - Giá trị MẶC ĐỊNH điền sẵn từng field.
 *  - ẨN field (không hiện) / KHOÁ field (hiện nhưng read-only).
 * Lưu JSON 'offset.ProductConfig'; form báo giá (OffsetQuoteConfigurator) đọc qua pricebook.
 */

type ProductType = 'to_roi' | 'bi_thu_folder' | 'sp_khac' | 'hop_giay' | 'tui_giay';

interface ProductConfig {
    allowedMaterials?: string[];
    allowedVatTuBeMat?: string[];
    allowedEpKim?: string[];
    allowedKhoIn?: string[];
    allowedKichThuoc?: string[];
    allowedBoxTypes?: string[];
    defaults?: Record<string, string | number | boolean>;
    hidden?: string[];
    locked?: string[];
}
type ConfigMap = Record<string, ProductConfig>;

interface Pricebook {
    materials: { code: string; materialName: string }[];
    khoIn: { khoIn: string; loaiKem: string }[];
    fixedSizes: { toRoi: { kichThuoc: string }[]; biThuFolder: { kichThuoc: string; loai: string }[] };
    vatTuBeMat: { ten: string }[];
    epKim: { rows: { viTri: string }[] };
    soMauOptions?: number[];
}

const TABS: { id: ProductType; label: string }[] = [
    { id: 'to_roi', label: 'Tờ rơi' },
    { id: 'bi_thu_folder', label: 'Bì thư / Folder' },
    { id: 'sp_khac', label: 'Sản phẩm khác' },
    { id: 'hop_giay', label: 'Hộp giấy' },
    { id: 'tui_giay', label: 'Túi giấy' },
];

// Loại field cho trình chỉnh mặc định.
type FieldKind = 'num' | 'bool' | 'mat' | 'kho' | 'kich' | 'vtbm' | 'epkim' | 'soMau' | 'select';
interface FieldDef { key: string; label: string; kind: FieldKind; options?: { id: string; label: string }[] }

const TP: { id: string; label: string }[] = [{ id: 'khong', label: 'Không' }, { id: 'tc', label: 'Thủ công' }, { id: 'may', label: 'Máy' }];
const MAT_IN: { id: string; label: string }[] = [{ id: '1', label: '1 mặt' }, { id: '2', label: '2 mặt' }];
const BO_KEM: { id: string; label: string }[] = [{ id: '1', label: 'Tự trở (1 bộ kẽm)' }, { id: '2', label: 'Bắt đôi (2 bộ kẽm)' }];

// Loại khuôn bế (dieline) cho hộp giấy — whitelist + mặc định theo sản phẩm.
const BOX_TYPES: { id: string; label: string }[] = [
    { id: 'rte', label: 'Hộp nắp gài so le (RTE)' },
    { id: 'slb', label: 'Hộp đáy gài tự động' },
    { id: 'gable', label: 'Hộp quai xách (Gable)' },
    { id: 'pizza', label: 'Hộp Pizza (FEFCO 0426)' },
    { id: 'tray', label: 'Hộp diêm / Khay (FEFCO 0410)' },
];

// Catalog field từng loại — nguồn cho bảng Mặc định / Ẩn / Khoá.
const FIELDS: Record<ProductType, FieldDef[]> = {
    to_roi: [
        { key: 'kichThuoc', label: 'Kích thước', kind: 'kich' },
        { key: 'soLuong', label: 'Số lượng', kind: 'num' },
        { key: 'materialCode', label: 'Giấy in', kind: 'mat' },
        { key: 'soMatIn', label: 'Số mặt in', kind: 'select', options: MAT_IN },
        { key: 'soKemIn', label: 'Kiểu in (số màu)', kind: 'soMau' },
        { key: 'soBoKem', label: 'Kiểu trở bản (bộ kẽm)', kind: 'select', options: BO_KEM },
        { key: 'vatTuBeMat', label: 'Vật tư bề mặt', kind: 'vtbm' },
        { key: 'thanhPhamGap', label: 'Thành phẩm gấp', kind: 'select', options: TP },
        { key: 'khuon', label: 'Khuôn bế', kind: 'bool' },
        { key: 'be', label: 'Bế', kind: 'bool' },
        { key: 'catXen', label: 'Cắt xén', kind: 'bool' },
        { key: 'dongGoi', label: 'Đóng gói', kind: 'bool' },
        { key: 'thietKe', label: 'Thiết kế (VND)', kind: 'num' },
    ],
    bi_thu_folder: [
        { key: 'kichThuoc', label: 'Kích thước', kind: 'kich' },
        { key: 'soLuong', label: 'Số lượng', kind: 'num' },
        { key: 'materialCode', label: 'Giấy in', kind: 'mat' },
        { key: 'soMatIn', label: 'Số mặt in', kind: 'select', options: MAT_IN },
        { key: 'soKemIn', label: 'Kiểu in (số màu)', kind: 'soMau' },
        { key: 'soBoKem', label: 'Kiểu trở bản (bộ kẽm)', kind: 'select', options: BO_KEM },
        { key: 'vatTuBeMat', label: 'Vật tư bề mặt', kind: 'vtbm' },
        { key: 'thanhPhamDan', label: 'Thành phẩm dán', kind: 'select', options: TP },
        { key: 'khuon', label: 'Khuôn bế', kind: 'bool' },
        { key: 'be', label: 'Bế', kind: 'bool' },
        { key: 'dongGoi', label: 'Đóng gói', kind: 'bool' },
        { key: 'thietKe', label: 'Thiết kế (VND)', kind: 'num' },
    ],
    sp_khac: [
        { key: 'soLuong', label: 'Số lượng', kind: 'num' },
        { key: 'soMatIn', label: 'Số mặt in', kind: 'select', options: MAT_IN },
        { key: 'khoIn', label: 'Khổ in', kind: 'kho' },
        { key: 'materialCode', label: 'Giấy in', kind: 'mat' },
        { key: 'soMau', label: 'Kiểu in (số màu)', kind: 'soMau' },
        { key: 'soBoKem', label: 'Kiểu trở bản (bộ kẽm)', kind: 'select', options: BO_KEM },
        { key: 'vatTuBeMat', label: 'Vật tư bề mặt', kind: 'vtbm' },
        { key: 'khuon', label: 'Khuôn bế', kind: 'bool' },
        { key: 'epKimViTri', label: 'Ép kim', kind: 'epkim' },
        { key: 'thanhPham', label: 'Thành phẩm', kind: 'select', options: TP },
        { key: 'be', label: 'Bế', kind: 'bool' },
        { key: 'catXen', label: 'Cắt xén', kind: 'bool' },
        { key: 'dongGoi', label: 'Đóng gói', kind: 'bool' },
        { key: 'thietKe', label: 'Thiết kế (VND)', kind: 'num' },
    ],
    hop_giay: [
        { key: 'boxType', label: 'Loại khuôn (xếp bài)', kind: 'select', options: BOX_TYPES },
        { key: 'soLuong', label: 'Số lượng', kind: 'num' },
        { key: 'cao', label: 'Cao (cm)', kind: 'num' },
        { key: 'rong', label: 'Rộng (cm)', kind: 'num' },
        { key: 'hong', label: 'Hông (cm)', kind: 'num' },
        { key: 'khoIn', label: 'Khổ in', kind: 'kho' },
        { key: 'materialCode', label: 'Giấy in', kind: 'mat' },
        { key: 'soMatIn', label: 'Số mặt in', kind: 'select', options: MAT_IN },
        { key: 'soMau', label: 'Kiểu in (số màu)', kind: 'soMau' },
        { key: 'soBoKem', label: 'Kiểu trở bản (bộ kẽm)', kind: 'select', options: BO_KEM },
        { key: 'vatTuBeMat', label: 'Vật tư bề mặt', kind: 'vtbm' },
        { key: 'danHop', label: 'Dán hộp', kind: 'select', options: [{ id: 'khong', label: 'Không' }, { id: 'tc', label: 'Thủ công' }, { id: 'auto', label: 'Máy/Tự động' }] },
        { key: 'epKimViTri', label: 'Ép kim', kind: 'epkim' },
        { key: 'be', label: 'Bế', kind: 'bool' },
        { key: 'boi2Lop', label: 'Bồi 2 lớp', kind: 'bool' },
        { key: 'dongGoi', label: 'Đóng gói', kind: 'bool' },
        { key: 'thietKe', label: 'Thiết kế (VND)', kind: 'num' },
    ],
    tui_giay: [
        { key: 'soLuong', label: 'Số lượng', kind: 'num' },
        { key: 'cao', label: 'Cao (cm)', kind: 'num' },
        { key: 'rong', label: 'Rộng (cm)', kind: 'num' },
        { key: 'hong', label: 'Hông (cm)', kind: 'num' },
        { key: 'mi', label: 'Mí (cm)', kind: 'num' },
        { key: 'materialCode', label: 'Giấy in', kind: 'mat' },
        { key: 'soKem', label: 'Kiểu in (số màu)', kind: 'soMau' },
        { key: 'vatTuBeMat', label: 'Vật tư bề mặt', kind: 'vtbm' },
        { key: 'dayXachLoai', label: 'Dây xách', kind: 'select', options: [{ id: 'khong', label: 'Không' }, { id: '1', label: '1 dây' }, { id: '2', label: '2 dây' }] },
        { key: 'dayXachDonGia', label: 'Đơn giá dây (VND)', kind: 'num' },
        { key: 'thungSl', label: 'SL thùng caton', kind: 'num' },
        { key: 'thungDonGia', label: 'Đơn giá thùng (VND)', kind: 'num' },
        { key: 'dongGoi', label: 'Đóng gói', kind: 'bool' },
        { key: 'thietKe', label: 'Thiết kế (VND)', kind: 'num' },
    ],
};

// Whitelist nào áp cho loại nào.
const HAS_KHO: ProductType[] = ['sp_khac', 'hop_giay'];
const HAS_KICH: ProductType[] = ['to_roi', 'bi_thu_folder'];
const HAS_EPKIM: ProductType[] = ['sp_khac', 'hop_giay'];
const HAS_BOX: ProductType[] = ['hop_giay'];

export default function OffsetProductsPage() {
    const [pb, setPb] = useState<Pricebook | null>(null);
    const [config, setConfig] = useState<ConfigMap>({});
    const [active, setActive] = useState<ProductType>('to_roi');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [pbRes, cfgRes] = await Promise.all([
                api.get<Pricebook>('/pricing/offset/pricebook'),
                api.get<ConfigMap>('/pricing/offset/cfg/product-config'),
            ]);
            if (pbRes.success && pbRes.data) setPb(pbRes.data);
            if (cfgRes.success && cfgRes.data) setConfig(cfgRes.data);
        } catch { /* keep defaults */ }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const showToast = (msg: string, type: 'success' | 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const cfg = config[active] ?? {};
    const patch = (fn: (c: ProductConfig) => ProductConfig) =>
        setConfig(prev => ({ ...prev, [active]: fn(prev[active] ?? {}) }));

    // ── Whitelist toggle ──
    const allIds = useMemo(() => ({
        mat: (pb?.materials ?? []).map(m => m.code),
        vtbm: (pb?.vatTuBeMat ?? []).map(v => v.ten),
        epkim: (pb?.epKim?.rows ?? []).map(r => r.viTri),
        kho: (pb?.khoIn ?? []).map(k => k.khoIn),
        kich: active === 'to_roi'
            ? (pb?.fixedSizes?.toRoi ?? []).map(f => f.kichThuoc)
            : (pb?.fixedSizes?.biThuFolder ?? []).map(f => f.kichThuoc),
    }), [pb, active]);

    type ListKey = 'allowedMaterials' | 'allowedVatTuBeMat' | 'allowedEpKim' | 'allowedKhoIn' | 'allowedKichThuoc' | 'allowedBoxTypes';
    const isAllowed = (listKey: ListKey, id: string) => {
        const arr = cfg[listKey];
        return !arr || arr.includes(id);
    };
    const toggleAllowed = (listKey: ListKey, full: string[], id: string) => patch(c => {
        const cur = (c[listKey] !== undefined ? c[listKey]! : full).slice();
        const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
        // Đủ tất cả → undefined (nghĩa là "cho phép tất cả"); rỗng giữ [] (ẩn hết).
        const sameAsAll = next.length === full.length && full.every(x => next.includes(x));
        return { ...c, [listKey]: sameAsAll ? undefined : next };
    });
    const setAll = (listKey: ListKey, on: boolean, full: string[]) =>
        patch(c => ({ ...c, [listKey]: on ? undefined : [] }));

    // ── Defaults ──
    const getDefault = (key: string) => cfg.defaults?.[key];
    const setDefault = (key: string, v: string | number | boolean | undefined) => patch(c => {
        const defs = { ...(c.defaults ?? {}) };
        if (v === undefined || v === '') delete defs[key];
        else defs[key] = v;
        return { ...c, defaults: Object.keys(defs).length ? defs : undefined };
    });

    // ── Hidden / Locked ──
    const inSet = (which: 'hidden' | 'locked', key: string) => (cfg[which] ?? []).includes(key);
    const toggleSet = (which: 'hidden' | 'locked', key: string) => patch(c => {
        const cur = c[which] ?? [];
        const next = cur.includes(key) ? cur.filter(x => x !== key) : [...cur, key];
        return { ...c, [which]: next.length ? next : undefined };
    });

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/pricing/offset/cfg/product-config', { config });
            if (res.success) showToast('Đã lưu cấu hình sản phẩm', 'success');
            else throw new Error(res.error);
        } catch (e: unknown) {
            showToast('Lỗi: ' + (e instanceof Error ? e.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}

            <div className="mb-4 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cấu hình loại offset</h1>
                    <p className="text-slate-500 text-sm mt-1">Whitelist tài nguyên + mặc định + ẩn/khoá field cho từng loại; form báo giá tự áp.{' '}
                        <Link href="/pricing/settings/offset-fees" className="text-indigo-600 underline">Phí & chiết khấu</Link></p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {saving ? 'Đang lưu...' : '💾 Lưu'}
                </button>
            </div>

            {/* Tabs loại sản phẩm */}
            <OffsetSettingsNav activeTab="offset-products" />
            <div className="flex gap-2 mb-5 flex-wrap">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActive(t.id)}
                        className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${active === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* WHITELIST */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <WhitelistCard title="Giấy in" items={(pb?.materials ?? []).map(m => ({ id: m.code, label: `${m.code} — ${m.materialName}` }))}
                            isOn={id => isAllowed('allowedMaterials', id)} toggle={id => toggleAllowed('allowedMaterials', allIds.mat, id)}
                            onAll={on => setAll('allowedMaterials', on, allIds.mat)} />
                        <WhitelistCard title="Vật tư bề mặt" items={(pb?.vatTuBeMat ?? []).map(v => ({ id: v.ten, label: v.ten }))}
                            isOn={id => isAllowed('allowedVatTuBeMat', id)} toggle={id => toggleAllowed('allowedVatTuBeMat', allIds.vtbm, id)}
                            onAll={on => setAll('allowedVatTuBeMat', on, allIds.vtbm)} />
                        {HAS_KHO.includes(active) && (
                            <WhitelistCard title="Khổ in" items={(pb?.khoIn ?? []).map(k => ({ id: k.khoIn, label: k.loaiKem ? `${k.khoIn} (${k.loaiKem})` : k.khoIn }))}
                                isOn={id => isAllowed('allowedKhoIn', id)} toggle={id => toggleAllowed('allowedKhoIn', allIds.kho, id)}
                                onAll={on => setAll('allowedKhoIn', on, allIds.kho)} />
                        )}
                        {HAS_KICH.includes(active) && (
                            <WhitelistCard title="Kích thước" items={(active === 'to_roi' ? (pb?.fixedSizes?.toRoi ?? []).map(f => ({ id: f.kichThuoc, label: f.kichThuoc })) : (pb?.fixedSizes?.biThuFolder ?? []).map(f => ({ id: f.kichThuoc, label: `${f.kichThuoc} (${f.loai})` })))}
                                isOn={id => isAllowed('allowedKichThuoc', id)} toggle={id => toggleAllowed('allowedKichThuoc', allIds.kich, id)}
                                onAll={on => setAll('allowedKichThuoc', on, allIds.kich)} />
                        )}
                        {HAS_EPKIM.includes(active) && (
                            <WhitelistCard title="Ép kim" items={(pb?.epKim?.rows ?? []).map(r => ({ id: r.viTri, label: r.viTri }))}
                                isOn={id => isAllowed('allowedEpKim', id)} toggle={id => toggleAllowed('allowedEpKim', allIds.epkim, id)}
                                onAll={on => setAll('allowedEpKim', on, allIds.epkim)} />
                        )}
                        {HAS_BOX.includes(active) && (
                            <WhitelistCard title="Loại khuôn (xếp bài)" items={BOX_TYPES.map(b => ({ id: b.id, label: b.label }))}
                                isOn={id => isAllowed('allowedBoxTypes', id)} toggle={id => toggleAllowed('allowedBoxTypes', BOX_TYPES.map(b => b.id), id)}
                                onAll={on => setAll('allowedBoxTypes', on, BOX_TYPES.map(b => b.id))} />
                        )}
                    </div>

                    {/* FIELDS: default / hidden / locked */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500">Mặc định & Hiển thị field</h2>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                                    <th className="text-left font-bold px-4 py-2">Field</th>
                                    <th className="text-left font-bold px-4 py-2">Giá trị mặc định</th>
                                    <th className="text-center font-bold px-3 py-2">Ẩn</th>
                                    <th className="text-center font-bold px-3 py-2">Khoá</th>
                                </tr>
                            </thead>
                            <tbody>
                                {FIELDS[active].map(f => (
                                    <tr key={f.key} className="border-b border-slate-50 hover:bg-slate-50/40">
                                        <td className="px-4 py-2 font-semibold text-slate-700">{f.label}</td>
                                        <td className="px-4 py-2">
                                            <DefaultEditor field={f} pb={pb} value={getDefault(f.key)} onChange={v => setDefault(f.key, v)} />
                                        </td>
                                        <td className="text-center px-3 py-2">
                                            <input type="checkbox" checked={inSet('hidden', f.key)} onChange={() => toggleSet('hidden', f.key)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" />
                                        </td>
                                        <td className="text-center px-3 py-2">
                                            <input type="checkbox" checked={inSet('locked', f.key)} onChange={() => toggleSet('locked', f.key)} className="w-4 h-4 text-indigo-600 rounded border-slate-300" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[12px] text-slate-400">Bỏ tick tất cả ở whitelist = ẩn hết lựa chọn đó. Tick đủ = cho phép tất cả. Field <b>Ẩn</b> nên đặt kèm <b>Giá trị mặc định</b> để báo giá vẫn hợp lệ.</p>
                </div>
            </div>
        </div>
    );
}

function WhitelistCard({ title, items, isOn, toggle, onAll }: {
    title: string; items: { id: string; label: string }[];
    isOn: (id: string) => boolean; toggle: (id: string) => void; onAll: (on: boolean) => void;
}) {
    const allOn = items.length > 0 && items.every(i => isOn(i.id));
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 text-sm">{title}</span>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={allOn} onChange={e => onAll(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                    Tất cả
                </label>
            </div>
            <div className="max-h-44 overflow-y-auto flex flex-col gap-1 pr-1">
                {items.length === 0 && <span className="text-[12px] text-slate-400 italic">Chưa có dữ liệu.</span>}
                {items.map(i => (
                    <label key={i.id} className="flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
                        <input type="checkbox" checked={isOn(i.id)} onChange={() => toggle(i.id)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                        <span className="truncate">{i.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

function DefaultEditor({ field, pb, value, onChange }: {
    field: FieldDef; pb: Pricebook | null; value: string | number | boolean | undefined;
    onChange: (v: string | number | boolean | undefined) => void;
}) {
    const cls = 'text-sm px-2 py-1 border border-slate-200 rounded-lg bg-white focus:border-indigo-500 outline-none';
    if (field.kind === 'num') {
        return <input type="number" value={value === undefined ? '' : Number(value)} placeholder="—"
            onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={`${cls} w-32`} />;
    }
    if (field.kind === 'bool') {
        return (
            <select value={value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? undefined : e.target.value === 'true')} className={cls}>
                <option value="">— Không đặt —</option>
                <option value="true">Bật</option>
                <option value="false">Tắt</option>
            </select>
        );
    }
    // Build option list per kind.
    let opts: { id: string; label: string }[] = field.options ?? [];
    if (field.kind === 'mat') opts = (pb?.materials ?? []).map(m => ({ id: m.code, label: `${m.code} — ${m.materialName}` }));
    else if (field.kind === 'vtbm') opts = (pb?.vatTuBeMat ?? []).map(v => ({ id: v.ten, label: v.ten }));
    else if (field.kind === 'kho') opts = (pb?.khoIn ?? []).map(k => ({ id: k.khoIn, label: k.loaiKem ? `${k.khoIn} (${k.loaiKem})` : k.khoIn }));
    else if (field.kind === 'epkim') opts = [{ id: 'Không', label: 'Không' }, ...(pb?.epKim?.rows ?? []).map(r => ({ id: r.viTri, label: r.viTri }))];
    else if (field.kind === 'soMau') opts = (pb?.soMauOptions ?? [1, 2, 4, 5, 6]).map(n => ({ id: String(n), label: n === 4 ? '4 màu (CMYK)' : `${n} màu` }));
    // soMau lưu số; các select khác lưu chuỗi.
    const isNumKind = field.kind === 'soMau';
    return (
        <select value={value === undefined ? '' : String(value)}
            onChange={e => onChange(e.target.value === '' ? undefined : (isNumKind ? Number(e.target.value) : e.target.value))} className={cls}>
            <option value="">— Không đặt —</option>
            {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
    );
}
