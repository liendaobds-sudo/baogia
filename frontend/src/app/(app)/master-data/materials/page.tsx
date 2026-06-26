'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function MaterialsPage() {
    const { token } = useAuth();
    const [materials, setMaterials] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!token) return;
        const fetchMaterials = async () => {
            try {
                const res = await fetch('http://localhost:4000/api/v1/erp/materials?limit=50', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const json = await res.json();
                    setMaterials(json.data?.items || json.data || []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchMaterials();
    }, [token]);

    const filteredMaterials = materials.filter(m => 
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        m.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header section with Glassmorphism */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/70 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-800">Quản lý Vật liệu</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Danh sách vật tư in ấn, giấy, và phụ liệu phục vụ tính giá.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Tìm mã hoặc tên..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/50 outline-none w-64 transition-all"
                        />
                    </div>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium shadow-sm shadow-blue-500/20 transition-all flex items-center gap-2">
                        <span>+</span> Thêm Mới
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-medium">
                            <tr>
                                <th className="px-6 py-4 whitespace-nowrap">Mã VL</th>
                                <th className="px-6 py-4">Tên vật liệu</th>
                                <th className="px-6 py-4">Loại</th>
                                <th className="px-6 py-4">Khổ giấy</th>
                                <th className="px-6 py-4 text-right">Giá gốc</th>
                                <th className="px-6 py-4 text-right">Tồn kho</th>
                                <th className="px-6 py-4 text-center">Trạng thái</th>
                                <th className="px-6 py-4 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                // Skeleton loader
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-16"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-48"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-20"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-16 ml-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-12 ml-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-6 bg-slate-200 rounded-full w-16 mx-auto"></div></td>
                                        <td className="px-6 py-4"><div className="h-8 bg-slate-200 rounded w-8 ml-auto"></div></td>
                                    </tr>
                                ))
                            ) : filteredMaterials.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                                        Không tìm thấy vật liệu nào.
                                    </td>
                                </tr>
                            ) : (
                                filteredMaterials.map((m) => (
                                    <tr key={m.id} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500 whitespace-nowrap">{m.code}</td>
                                        <td className="px-6 py-4 font-medium text-slate-800">{m.name}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 text-xs font-medium text-slate-700">
                                                {m.type_name || m.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{m.paper_size_name || '-'}</td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-700">
                                            {new Intl.NumberFormat('vi-VN').format(m.unit_price)} ₫
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {m.stock <= (m.min_stock || 0) ? (
                                                <span className="text-red-600 font-medium">{m.stock} {m.unit_name}</span>
                                            ) : (
                                                <span className="text-slate-600">{m.stock} {m.unit_name}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                m.status === 'normal' ? 'bg-green-100 text-green-700' : 
                                                m.status === 'disabled' ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'
                                            }`}>
                                                {m.status === 'normal' ? 'Hoạt động' : m.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors opacity-0 group-hover:opacity-100" title="Chỉnh sửa">
                                                ✏️
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination placeholder */}
                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <span className="text-sm text-slate-500">
                        Hiển thị <b>{filteredMaterials.length}</b> kết quả
                    </span>
                    <div className="flex gap-1">
                        <button className="px-3 py-1 rounded border border-slate-200 bg-white text-slate-400 cursor-not-allowed">Trước</button>
                        <button className="px-3 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">Sau</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
