"use client";

import React, { useState } from 'react';

export interface ColumnDef<T> {
    header: string;
    accessorKey?: keyof T;
    cell?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
    columns: ColumnDef<T>[];
    data: T[];
    onRowClick?: (item: T) => void;
    isLoading?: boolean;
    actions?: React.ReactNode;
    /** Ghim cột cuối (thao tác) cố định bên phải để luôn thấy dù bảng tràn ngang. */
    stickyActions?: boolean;
}

export function DataTable<T>({ columns, data, onRowClick, isLoading, actions, stickyActions }: DataTableProps<T>) {
    const [searchTerm, setSearchTerm] = useState('');
    const lastIdx = columns.length - 1;

    const filteredData = data.filter(item => {
        if (!searchTerm) return true;
        return Object.values(item as any).some(val => 
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="relative w-64">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input 
                        type="text" 
                        placeholder="Tìm kiếm..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                    />
                </div>
                <div>
                    {actions}
                </div>
            </div>
            
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50/80 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200 shadow-sm text-slate-600 font-bold uppercase text-[11px] tracking-wider">
                        <tr>
                            {columns.map((col, i) => (
                                <th key={i} className={`px-6 py-4 ${stickyActions && i === lastIdx ? 'sticky right-0 z-20 bg-slate-50 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]' : ''}`}>{col.header}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-10 text-center text-slate-500 text-sm">
                                    <div className="flex justify-center items-center gap-2">
                                        <svg className="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Đang tải dữ liệu...
                                    </div>
                                </td>
                            </tr>
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-10 text-center text-slate-500 text-sm">Không tìm thấy kết quả phù hợp.</td>
                            </tr>
                        ) : (
                            filteredData.map((item, i) => (
                                <tr 
                                    key={i} 
                                    onClick={() => onRowClick?.(item)}
                                    className={`hover:bg-slate-50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                                >
                                    {columns.map((col, j) => (
                                        <td key={j} className={`px-6 py-4 text-slate-700 font-medium border-l-[3px] border-transparent first:border-l-indigo-500/0 hover:first:border-l-indigo-500 transition-all ${stickyActions && j === lastIdx ? 'sticky right-0 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]' : ''}`}>
                                            {col.cell ? col.cell(item) : (col.accessorKey ? String((item as any)[col.accessorKey]) : '')}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs text-slate-500">
                Hiển thị {filteredData.length} kết quả
            </div>
        </div>
    );
}
