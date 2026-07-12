"use client";
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../_components/apiClient';

/**
 * Định mức Kẽm / Vật tư bề mặt / Ép kim — In Offset. Trước đây chỉ seed, chưa có UI.
 * Nạp từ GET /pricing/offset/pricebook; lưu qua cfg/kem · cfg/vat-tu-be-mat · cfg/ep-kim · cfg/param.
 */
interface KemRow { soKem: number; donGia: number }
interface Vtbm { ten: string; donGiaKg: number; soMat: string | null }
interface EpKim { viTri: string; duoi100: number; tu100_499: number; tu500_999: number; tren1000: number }

export default function OffsetMaterialsPage() {
    const [kemNho, setKemNho] = useState<KemRow[]>([]);
    const [kemLon, setKemLon] = useState<KemRow[]>([]);
    const [don1Nho, setDon1Nho] = useState(0);
    const [don1Lon, setDon1Lon] = useState(0);
    const [vtbm, setVtbm] = useState<Vtbm[]>([]);
    const [epkim, setEpkim] = useState<EpKim[]>([]);
    const [epMoc, setEpMoc] = useState({ m1: 100, m2: 500, m3: 1000 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get<any>('/pricing/offset/pricebook');
            const d = res.data;
            if (res.success && d) {
                setKemNho([...(d.kem?.kemNho ?? [])].sort((a: KemRow, b: KemRow) => a.soKem - b.soKem));
                setKemLon([...(d.kem?.kemLon ?? [])].sort((a: KemRow, b: KemRow) => a.soKem - b.soKem));
                setDon1Nho(d.kem?.donGia1Kem?.kemNho ?? 0);
                setDon1Lon(d.kem?.donGia1Kem?.kemLon ?? 0);
                setVtbm(d.vatTuBeMat ?? []);
                setEpkim(d.epKim?.rows ?? []);
                setEpMoc({
                    m1: Number(d.params?.EpKim_Moc1) || 100,
                    m2: Number(d.params?.EpKim_Moc2) || 500,
                    m3: Number(d.params?.EpKim_Moc3) || 1000,
                });
            }
        } catch { /* keep empty */ }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const showToast = (msg: string, type: 'success' | 'error') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Kẽm: đơn giá 1 kẽm (param) + bảng giá theo số kẽm.
            await api.post('/pricing/offset/cfg/param', { key: 'DonGia1Kem_KemNho', value: Math.round(don1Nho || 0) });
            await api.post('/pricing/offset/cfg/param', { key: 'DonGia1Kem_KemLon', value: Math.round(don1Lon || 0) });
            for (const r of kemNho) await api.post('/pricing/offset/cfg/kem', { bang: 'kemNho', soKem: Math.round(r.soKem), donGia: Math.round(r.donGia || 0) });
            for (const r of kemLon) await api.post('/pricing/offset/cfg/kem', { bang: 'kemLon', soKem: Math.round(r.soKem), donGia: Math.round(r.donGia || 0) });
            for (const v of vtbm) if (v.ten) await api.post('/pricing/offset/cfg/vat-tu-be-mat', { ten: v.ten, donGiaKg: Number(v.donGiaKg) || 0, soMat: v.soMat || null });
            for (const e of epkim) if (e.viTri) await api.post('/pricing/offset/cfg/ep-kim', { viTri: e.viTri, duoi100: Number(e.duoi100) || 0, tu100_499: Number(e.tu100_499) || 0, tu500_999: Number(e.tu500_999) || 0, tren1000: Number(e.tren1000) || 0 });
            showToast('Đã lưu định mức kẽm / vật tư bề mặt / ép kim', 'success');
            await load();
        } catch (err: unknown) {
            showToast('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'), 'error');
        }
        setSaving(false);
    };

    const delKem = async (bang: 'kemNho' | 'kemLon', soKem: number) => {
        await api.delete(`/pricing/offset/cfg/kem/${bang}/${soKem}`).catch(() => {});
        (bang === 'kemNho' ? setKemNho : setKemLon)(prev => prev.filter(r => r.soKem !== soKem));
    };
    const delVtbm = async (ten: string) => {
        await api.delete(`/pricing/offset/cfg/vat-tu-be-mat/${encodeURIComponent(ten)}`).catch(() => {});
        setVtbm(prev => prev.filter(v => v.ten !== ten));
    };
    const delEpkim = async (viTri: string) => {
        await api.delete(`/pricing/offset/cfg/ep-kim/${encodeURIComponent(viTri)}`).catch(() => {});
        setEpkim(prev => prev.filter(e => e.viTri !== viTri));
    };

    const numCls = 'w-full text-right text-sm px-2 py-1 border border-slate-200 rounded bg-white focus:border-indigo-500 outline-none';
    const txtCls = 'w-full text-sm px-2 py-1 border border-slate-200 rounded bg-white focus:border-indigo-500 outline-none';

    if (loading) return <div className="flex items-center justify-center h-full"><svg className="animate-spin h-8 w-8 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>;

    const KemTable = ({ bang, rows, setRows }: { bang: 'kemNho' | 'kemLon'; rows: KemRow[]; setRows: (r: KemRow[]) => void }) => (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-sm">{bang === 'kemNho' ? 'Lên bài — Kẽm nhỏ' : 'Lên bài — Kẽm lớn'}</span>
                <button onClick={() => setRows([...rows, { soKem: (rows.at(-1)?.soKem ?? 0) + 1, donGia: 0 }])} className="text-[12px] text-indigo-600 font-semibold">+ Dòng</button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">Đơn giá công lên bài (canh máy) theo <b>số màu in</b>. Dưới ngưỡng MOQ tính trọn gói; vượt thì cộng tiền chạy máy.</p>
            <table className="w-full text-sm">
                <thead><tr className="text-[11px] uppercase text-slate-400"><th className="text-left py-1">Số màu</th><th className="text-right">Đơn giá lên bài (VND)</th><th></th></tr></thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-50">
                            <td className="py-1 pr-2"><input type="number" value={r.soKem} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, soKem: Number(e.target.value) } : x))} className={`${numCls} w-16 text-left`} /></td>
                            <td><input type="number" value={r.donGia} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, donGia: Number(e.target.value) } : x))} className={numCls} /></td>
                            <td className="text-right pl-2"><button onClick={() => delKem(bang, r.soKem)} className="text-red-500 text-xs">Xoá</button></td>
                        </tr>
                    ))}
                    {rows.length === 0 && <tr><td colSpan={3} className="text-center text-[12px] text-slate-400 py-3 italic">Chưa có dòng — bấm "+ Dòng"</td></tr>}
                </tbody>
            </table>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-slate-50/50 p-6">
            {toast && <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>}
            <div className="mb-5 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Kẽm / vật tư bề mặt / ép kim — offset</h1>
                    <p className="text-slate-500 text-sm mt-1">Định mức in ấn offset; form báo giá tự dùng.{' '}
                        <Link href="/pricing/settings/offset-products" className="text-indigo-600 underline">Cấu hình sản phẩm</Link></p>
                </div>
                <button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm disabled:opacity-50">{saving ? 'Đang lưu...' : '💾 Lưu'}</button>
            </div>

            <div className="flex-1 overflow-y-auto"><div className="max-w-5xl mx-auto space-y-6">
                {/* Giới thiệu: 3 khối nuôi dòng nào trong báo giá */}
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-[12px] text-slate-600 leading-relaxed">
                    Trang này khai báo 3 nhóm chi phí, mỗi nhóm nuôi một dòng trong bảng báo giá offset:
                    <ul className="mt-1.5 space-y-1 list-disc pl-5">
                        <li><b>Kẽm</b> → dòng <b>"Làm kẽm"</b> (phí mỗi bản kẽm) và <b>"Lên bài (canh máy)"</b> (đơn giá theo số màu).</li>
                        <li><b>Vật tư bề mặt</b> → dòng <b>"Cán màng / XLBM"</b> (tính theo diện tích × đơn giá/kg × số mặt × số tờ).</li>
                        <li><b>Ép kim</b> → dòng <b>"Ép kim"</b> (theo vị trí và bậc số lượng).</li>
                    </ul>
                    <span className="block mt-1.5 text-slate-400">Kẽm <b>nhỏ/lớn</b> tương ứng máy in khổ nhỏ/khổ lớn — engine tự chọn theo khổ in. "Số màu" = số bản kẽm của một bộ.</span>
                </div>
                {/* KẼM */}
                <div>
                    <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500 mb-1">Kẽm (bản in)</h2>
                    <p className="text-[11px] text-slate-400 mb-2">Phí <b>làm kẽm</b> = đơn giá 1 bản × số màu × số bộ. Đơn giá <b>lên bài</b> theo số màu nằm ở 2 bảng phía dưới.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <div className="text-[12px] font-bold text-slate-600 mb-1">Phí làm 1 bản kẽm nhỏ (VND)</div>
                            <input type="number" value={don1Nho} onChange={e => setDon1Nho(Number(e.target.value))} className={`${numCls} w-40`} />
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                            <div className="text-[12px] font-bold text-slate-600 mb-1">Phí làm 1 bản kẽm lớn (VND)</div>
                            <input type="number" value={don1Lon} onChange={e => setDon1Lon(Number(e.target.value))} className={`${numCls} w-40`} />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <KemTable bang="kemNho" rows={kemNho} setRows={setKemNho} />
                        <KemTable bang="kemLon" rows={kemLon} setRows={setKemLon} />
                    </div>
                </div>

                {/* VẬT TƯ BỀ MẶT */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500">Vật tư bề mặt (cán màng)</h2>
                        <button onClick={() => setVtbm([...vtbm, { ten: '', donGiaKg: 0, soMat: '1 mặt' }])} className="text-[12px] text-indigo-600 font-semibold">+ Dòng</button>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">Màng/keo phủ bề mặt. Chi phí = diện tích khổ in (m²) × <b>đơn giá/kg</b> × số mặt × số tờ. "Số mặt" mặc định của vật tư (1 hay 2 mặt).</p>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                        <table className="w-full text-sm">
                            <thead><tr className="text-[11px] uppercase text-slate-400"><th className="text-left py-1">Tên</th><th className="text-right">Đơn giá/kg</th><th className="text-center">Số mặt</th><th></th></tr></thead>
                            <tbody>
                                {vtbm.map((v, i) => (
                                    <tr key={i} className="border-t border-slate-50">
                                        <td className="py-1 pr-2"><input value={v.ten} onChange={e => setVtbm(vtbm.map((x, j) => j === i ? { ...x, ten: e.target.value } : x))} className={txtCls} /></td>
                                        <td className="px-2"><input type="number" value={v.donGiaKg} onChange={e => setVtbm(vtbm.map((x, j) => j === i ? { ...x, donGiaKg: Number(e.target.value) } : x))} className={numCls} /></td>
                                        <td className="px-2 text-center"><select value={v.soMat ?? ''} onChange={e => setVtbm(vtbm.map((x, j) => j === i ? { ...x, soMat: e.target.value || null } : x))} className="text-sm px-2 py-1 border border-slate-200 rounded bg-white"><option value="">—</option><option value="1 mặt">1 mặt</option><option value="2 mặt">2 mặt</option></select></td>
                                        <td className="text-right pl-2"><button onClick={() => delVtbm(v.ten)} className="text-red-500 text-xs">Xoá</button></td>
                                    </tr>
                                ))}
                                {vtbm.length === 0 && <tr><td colSpan={4} className="text-center text-[12px] text-slate-400 py-3 italic">Chưa có vật tư — bấm "+ Dòng"</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ÉP KIM */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-[12px] font-black uppercase tracking-wider text-slate-500">Ép kim (theo vị trí & số lượng)</h2>
                        <button onClick={() => setEpkim([...epkim, { viTri: '', duoi100: 0, tu100_499: 0, tu500_999: 0, tren1000: 0 }])} className="text-[12px] text-indigo-600 font-semibold">+ Dòng</button>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">Đơn giá theo vị trí ép, chia bậc số lượng. Ngưỡng bậc ({epMoc.m1}/{epMoc.m2}/{epMoc.m3}) chỉnh ở{' '}
                        <Link href="/pricing/settings/offset-fees" className="text-indigo-600 underline">Phí & Chiết khấu</Link>. Dưới mốc 1 tính trọn gói, từ mốc 1 trở lên tính theo đơn giá mỗi cái.</p>
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className="text-[11px] uppercase text-slate-400"><th className="text-left py-1">Vị trí</th><th className="text-right">&lt;{epMoc.m1} (trọn gói)</th><th className="text-right">{epMoc.m1}–{epMoc.m2 - 1} (/cái)</th><th className="text-right">{epMoc.m2}–{epMoc.m3 - 1} (/cái)</th><th className="text-right">≥{epMoc.m3} (/cái)</th><th></th></tr></thead>
                            <tbody>
                                {epkim.map((e, i) => (
                                    <tr key={i} className="border-t border-slate-50">
                                        <td className="py-1 pr-2"><input value={e.viTri} onChange={ev => setEpkim(epkim.map((x, j) => j === i ? { ...x, viTri: ev.target.value } : x))} className={txtCls} /></td>
                                        <td className="px-1"><input type="number" value={e.duoi100} onChange={ev => setEpkim(epkim.map((x, j) => j === i ? { ...x, duoi100: Number(ev.target.value) } : x))} className={numCls} /></td>
                                        <td className="px-1"><input type="number" value={e.tu100_499} onChange={ev => setEpkim(epkim.map((x, j) => j === i ? { ...x, tu100_499: Number(ev.target.value) } : x))} className={numCls} /></td>
                                        <td className="px-1"><input type="number" value={e.tu500_999} onChange={ev => setEpkim(epkim.map((x, j) => j === i ? { ...x, tu500_999: Number(ev.target.value) } : x))} className={numCls} /></td>
                                        <td className="px-1"><input type="number" value={e.tren1000} onChange={ev => setEpkim(epkim.map((x, j) => j === i ? { ...x, tren1000: Number(ev.target.value) } : x))} className={numCls} /></td>
                                        <td className="text-right pl-2"><button onClick={() => delEpkim(e.viTri)} className="text-red-500 text-xs">Xoá</button></td>
                                    </tr>
                                ))}
                                {epkim.length === 0 && <tr><td colSpan={6} className="text-center text-[12px] text-slate-400 py-3 italic">Chưa có vị trí ép kim — bấm "+ Dòng"</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div></div>
        </div>
    );
}
