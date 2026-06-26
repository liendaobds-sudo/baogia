import { useEffect, useState, useCallback } from 'react';
import { DataTable, ColumnDef } from '../../../_components/DataTable';
import { CrudModal, DeleteConfirm, FieldDef } from '../../../_components/CrudModal';
import { api } from '../../../_components/apiClient';

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
    rollLength?: number;
    scopeLoose?: boolean;
    scopeBound?: boolean;
    scopeLargeFormat?: boolean;
    scopeOffset?: boolean;
    isActive: boolean;
}

const FIELDS: FieldDef[] = [
    { key: 'code', label: 'Mã khổ giấy', type: 'text', required: true, placeholder: 'VD: A4, A3, SRA3' },
    { key: 'name', label: 'Tên khổ giấy', type: 'text', required: true, placeholder: 'Khổ A4 (210x297mm)' },
    { key: 'widthMm', label: 'Chiều rộng (mm)', type: 'number', required: true, min: 1 },
    { key: 'heightMm', label: 'Chiều dài (mm)', type: 'number', required: true, min: 1 },
    { key: 'marginTop', label: 'Lề nhíp trên (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginBottom', label: 'Lề dưới (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginLeft', label: 'Lề trái (mm)', type: 'number', required: false, min: 0 },
    { key: 'marginRight', label: 'Lề phải (mm)', type: 'number', required: false, min: 0 },
    { key: 'rollLength', label: 'Độ dài cuộn (m)', type: 'number', required: false, min: 0, placeholder: 'Nếu là cuộn' },
    { key: 'scopeLoose', label: 'Cho SP Rời', type: 'checkbox', defaultValue: true },
    { key: 'scopeBound', label: 'Cho SP Cuốn', type: 'checkbox', defaultValue: true },
    { key: 'scopeLargeFormat', label: 'Cho In Khổ Lớn', type: 'checkbox', defaultValue: false },
];

export function DigitalPaperSizes() {
    const [data, setData] = useState<PaperSize[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<PaperSize | null>(null);
    const [deleteItem, setDeleteItem] = useState<PaperSize | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        const res = await api.get<PaperSize[]>('/erp/paper-sizes');
        if (res.success && res.data) {
            setData(res.data.filter(p => !p.scopeOffset));
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSave = async (formData: Record<string, unknown>) => {
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
        { header: 'Mã Khổ', accessorKey: 'code' },
        { header: 'Tên Khổ Giấy', accessorKey: 'name' },
        { header: 'Chiều Rộng', cell: (p) => `${p.widthMm} mm` },
        { header: 'Chiều Dài', cell: (p) => `${p.heightMm} mm` },
        { header: 'Diện Tích', cell: (p) => p.areaSqm ? `${p.areaSqm} m²` : `${((p.widthMm * p.heightMm) / 1_000_000).toFixed(4)} m²` },
        { header: 'Phạm vi', cell: (p) => {
            const s = [p.scopeLoose && 'Rời', p.scopeBound && 'Cuốn', p.scopeLargeFormat && 'Khổ lớn'].filter(Boolean);
            return s.length ? <span className="text-xs text-slate-600">{s.join(' · ')}</span> : <span className="text-slate-300 text-xs">—</span>;
        }},
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
            <div className="p-4 border-b border-slate-100 flex justify-end">
                <button onClick={() => { setEditItem(null); setModalOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Tạo Khổ Mới
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <DataTable columns={columns} data={data} isLoading={loading} />
            </div>

            <CrudModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditItem(null); }} onSave={handleSave} title="Khổ Giấy" fields={FIELDS} initialData={editItem} isEdit={!!editItem} />
            <DeleteConfirm isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} itemName={deleteItem?.name || ''} />
        </div>
    );
}
