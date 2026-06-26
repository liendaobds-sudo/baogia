import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { API_URL as API } from '@/lib/api';

interface CustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CustomerModal({ isOpen, onClose, onSuccess }: CustomerModalProps) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

    const [formData, setFormData] = useState({
        customerType: 'individual',
        code: '',
        name: '',
        phone: '',
        company: '',
        taxCode: '',
        email: '',
        address: '',
        contactPerson: '',
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`${API}/erp/customers`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customer_type: formData.customerType,
                    code: formData.code,
                    name: formData.name,
                    phone: formData.phone,
                    company: formData.company,
                    tax_code: formData.taxCode,
                    email: formData.email,
                    address: formData.address,
                    contact_person: formData.contactPerson,
                })
            });
            const data = await res.json();
            if (data.success) {
                onSuccess();
            } else {
                alert('Lỗi: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Có lỗi xảy ra khi tạo khách hàng.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-lg font-black text-slate-800 m-0">Tạo khách hàng mới</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    <form id="customer-form" onSubmit={handleSubmit}>
                        {/* Basic Info Block */}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-5 relative">
                            <div className="absolute top-0 left-0 px-3 py-1 bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-br-lg rounded-tl-lg">Thông tin cơ bản (Bắt buộc)</div>
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Phân loại</label>
                                    <select 
                                        value={formData.customerType} 
                                        onChange={e => setFormData({...formData, customerType: e.target.value})}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                                    >
                                        <option value="individual">Cá nhân</option>
                                        <option value="company">Doanh nghiệp / Tổ chức</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Mã Khách hàng</label>
                                    <input 
                                        value={formData.code} 
                                        onChange={e => setFormData({...formData, code: e.target.value})}
                                        placeholder="Để trống tự động tạo..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 font-mono placeholder:font-sans" 
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tên khách hàng <span className="text-red-500">*</span></label>
                                    <input 
                                        required
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        placeholder="Nhập tên..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" 
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Số điện thoại / Zalo <span className="text-red-500">*</span></label>
                                    <input 
                                        required
                                        value={formData.phone} 
                                        onChange={e => setFormData({...formData, phone: e.target.value})}
                                        placeholder="09xx..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 font-mono placeholder:font-sans" 
                                    />
                                </div>
                                
                                {formData.customerType === 'company' && (
                                    <>
                                        <div className="flex flex-col gap-1.5 col-span-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Tên Đơn vị / Công ty <span className="text-red-500">*</span></label>
                                            <input 
                                                required
                                                value={formData.company} 
                                                onChange={e => setFormData({...formData, company: e.target.value})}
                                                placeholder="CÔNG TY CỔ PHẦN..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50" 
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5 col-span-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Mã số thuế <span className="text-red-500">*</span></label>
                                            <input 
                                                required
                                                value={formData.taxCode} 
                                                onChange={e => setFormData({...formData, taxCode: e.target.value})}
                                                placeholder="010..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-50 font-mono placeholder:font-sans" 
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Toggle Advanced Info */}
                        <div className="flex items-center justify-center my-4">
                            <button 
                                type="button"
                                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                                className="flex items-center justify-center gap-1.5 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider rounded-md border-none cursor-pointer transition-colors"
                            >
                                {isAdvancedOpen ? 'Ẩn thông tin mở rộng' : 'Thêm thông tin mở rộng'}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-200 ${isAdvancedOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                        </div>

                        {/* Advanced Info Block */}
                        {isAdvancedOpen && (
                            <div className="grid grid-cols-2 gap-4 mt-2 mb-2 p-4 border border-dashed border-slate-300 bg-slate-50/50 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                                {formData.customerType === 'individual' && (
                                    <>
                                        <div className="flex flex-col gap-1.5 col-span-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Đơn vị / Công ty</label>
                                            <input 
                                                value={formData.company} 
                                                onChange={e => setFormData({...formData, company: e.target.value})}
                                                placeholder="Công ty A..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" 
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1.5 col-span-2">
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Mã số thuế</label>
                                            <input 
                                                value={formData.taxCode} 
                                                onChange={e => setFormData({...formData, taxCode: e.target.value})}
                                                placeholder="Mã số thuế..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50 font-mono placeholder:font-sans" 
                                            />
                                        </div>
                                    </>
                                )}
                                <div className="flex flex-col gap-1.5 col-span-2">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Địa chỉ giao hàng</label>
                                    <input 
                                        value={formData.address} 
                                        onChange={e => setFormData({...formData, address: e.target.value})}
                                        placeholder="Số nhà, đường, quận..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" 
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Email</label>
                                    <input 
                                        value={formData.email} 
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                        placeholder="email@domain.com"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" 
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Người đại diện</label>
                                    <input 
                                        value={formData.contactPerson} 
                                        onChange={e => setFormData({...formData, contactPerson: e.target.value})}
                                        placeholder="Tên người nhận..."
                                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-[13px] font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50" 
                                    />
                                </div>
                            </div>
                        )}
                    </form>
                </div>
                
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg font-bold text-[13px] text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer">
                        Đóng
                    </button>
                    <button type="submit" form="customer-form" disabled={loading} className="px-6 py-2.5 rounded-lg font-bold text-[13px] text-white bg-indigo-600 border-none hover:bg-indigo-700 transition-colors shadow-[0_2px_10px_-3px_rgba(79,70,229,0.5)] cursor-pointer disabled:opacity-50 flex items-center gap-2">
                        {loading ? 'Đang lưu...' : 'Lưu khách hàng'}
                    </button>
                </div>
            </div>
        </div>
    );
}
