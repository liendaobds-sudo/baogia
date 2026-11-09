import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../../_components/CrudModal';
import { api } from '../../../_components/apiClient';
import { OffsetSettingsNav } from '../../_components/OffsetSettingsNav';

interface PaperSize {
    id: number;
    code: string;
    name: string;
    widthMm: number;
    heightMm: number;
    areaSqm: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    scopeOffset?: boolean;
    isActive: boolean;
    khoGiayLon?: string;
    chiaTo?: string;
    soConBaiIn?: number;
    soConToLon?: number;
    loaiKem?: string;
    gripperCm?: number;
    gutterCm?: number;
}

const FIELDS: FieldDef[] = [
    { key: 'code', label: 'Mã khổ in (VD: 65x86)', type: 'text', required: true, placeholder: '65x86' },
    { key: 'name', label: 'Tên khổ in', type: 'text', required: true, placeholder: 'Khổ 65x86' },
    { key: 'widthMm', label: 'Chiều rộng (mm)', type: 'number', required: true, min: 1 },
    { key: 'heightMm', label: 'Chiều dài (mm)', type: 'number', required: true, min: 1 },
    { key: 'marginTop', label: 'Nhíp trên (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginBottom', label: 'Nhíp dưới (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginLeft', label: 'Lề trái (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginRight', label: 'Lề phải (mm)', type: 'number', required: false, min: 0 },
    { key: 'gripperCm', label: 'Nhíp máy in (cm) — mặc định 1.0cm', type: 'number', required: false, min: 0 },
    { key: 'gutterCm', label: 'Khe hở dao cắt (cm) — mặc định 0.3cm', type: 'number', required: false, min: 0 },
    { key: 'khoGiayLon', label: 'Khổ giấy lớn', type: 'text', required: true, placeholder: 'VD: 79cm x 109cm' },
    { key: 'chiaTo', label: 'Kiểu chia tờ', type: 'text', required: false, placeholder: 'VD: Cắt 2' },
    { key: 'soConToLon', label: 'Số con / tờ lớn', type: 'number', required: false, min: 1 },
    { key: 'soConBaiIn', label: 'Số con tối đa / bài in', type: 'number', required: false, min: 1 },
    {
        key: 'loaiKem',
        label: 'Loại kẽm',
        type: 'select',
        options: [
            { label: 'Kẽm nhỏ', value: 'Kẽm nhỏ' },
            { label: 'Kẽm lớn', value: 'Kẽm lớn' }
        ],
        required: false
    },
    { key: 'scopeOffset', label: 'Sử dụng cho In Offset', type: 'checkbox', defaultValue: true },
];

export function OffsetPaperSizes() {
    const [data, setData] = useState<PaperSize[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<PaperSize | null>(null);
    const [deleteItem, setDeleteItem] = useState<PaperSize | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<PaperSize[]>('/erp/paper-sizes?scope=offset');
        if (res.success && res.data) setData(res.data);
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
        // Ensure scopeOffset is forced if they forgot to check it
        formData.scopeOffset = true;
        if (editItem) {
            const res = await api.put(`/erp/paper-sizes/${editItem.id}`, formData);
            if (!res.success) throw new Error(res.error || 'Lỗi cập nhật');
        } else {
            const res = await api.post('/erp/paper-sizes', formData);
            if (!res.success) throw new Error(res.error || 'Lỗi thêm mới');
        }
        await loadData();
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        await api.delete(`/erp/paper-sizes/${deleteItem.id}`);
        await loadData();
    };

    const columns: ColumnDef<PaperSize>[] = [
        { header: 'Mã Khổ In', accessorKey: 'code' },
        { header: 'Tên Khổ In', accessorKey: 'name' },
        { header: 'Kích Thước', cell: (p) => <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">{p.widthMm} x {p.heightMm} mm</span> },
        { header: 'Nhíp Trên / Dưới', cell: (p) => <span className="text-slate-600">{p.marginTop || 0} / {p.marginBottom || 0} mm</span> },
        { header: 'Lề Trái / Phải', cell: (p) => <span className="text-slate-600">{p.marginLeft || 0} / {p.marginRight || 0} mm</span> },
        { header: 'Nhíp / Khe (cm)', cell: (p) => <span className="text-slate-600 text-xs">{p.gripperCm ?? 1.0} / {p.gutterCm ?? 0.3} cm</span> },
        { header: 'Khổ giấy lớn', cell: (p) => p.khoGiayLon ? <span className="text-slate-600">{p.khoGiayLon}</span> : <span className="text-slate-300 text-xs">—</span> },
        { header: 'Số con/tờ', cell: (p) => p.soConToLon ? <span className="text-slate-700 font-semibold">{p.soConToLon}</span> : <span className="text-slate-300 text-xs">—</span> },
        { header: 'Loại kẽm', cell: (p) => p.loaiKem ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700">{p.loaiKem}</span> : <span className="text-slate-300 text-xs">—</span> },
        { header: 'Thao tác', cell: (p) => (
            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => { setEditItem(p); setModalOpen(true); }} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors" title="Sửa">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button onClick={() => setDeleteItem(p)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Xóa">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
        )}
    ];

    return (
        <div className="flex flex-col h-full bg-white rounded-b-xl border border-t-0 border-slate-200">
            <div className="p-4 pb-0 bg-slate-50/40"><OffsetSettingsNav activeTab="paper-sizes" /></div>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
                <div className="text-sm text-slate-600">
                    Khai báo kích thước khổ in Offset và không gian chừa mép cho Nhíp (Gripper Margin).
                </div>
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Tạo Khổ Offset Mới
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <DataTable columns={columns} data={data} isLoading={loading} />
            </div>

            <CrudModal 
                isOpen={modalOpen} 
                onClose={() => { setModalOpen(false); setEditItem(null); }} 
                onSave={handleSave} 
                title="Khổ In Offset" 
                fields={FIELDS}
                initialData={editItem} 
                isEdit={!!editItem} 
            />
            <DeleteConfirm 
                isOpen={!!deleteItem} 
                onClose={() => setDeleteItem(null)} 
                onConfirm={handleDelete} 
                itemName={`Khổ In: ${deleteItem?.name || ''}`} 
            />
        </div>
    );
}
