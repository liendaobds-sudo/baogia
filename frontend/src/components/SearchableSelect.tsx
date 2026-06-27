'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X, Lock } from 'lucide-react';

interface Option {
  id: string | number;
  label: string;
  /** Tên danh mục — nếu có, các option cùng group sẽ gom dưới 1 dòng tiêu đề. */
  group?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  error?: boolean;
  disabled?: boolean;
}

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "Chọn tuỳ chọn...",
  error = false,
  disabled = false
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Lấy label của item đang được chọn hiện tại
  const selectedOption = options.find(opt => opt.id.toString() === value?.toString());
  const displayLabel = selectedOption
    ? (selectedOption.group ? `${selectedOption.group} › ${selectedOption.label}` : selectedOption.label)
    : '';

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // Lọc options dựa trên từ khoá (khớp cả tên sản phẩm lẫn tên danh mục)
  const filteredOptions = options.filter(opt => {
    const q = searchTerm.toLowerCase();
    return opt.label.toLowerCase().includes(q) || (opt.group?.toLowerCase().includes(q) ?? false);
  });

  const handleSelect = (id: string | number) => {
    onChange(id);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {/* Nút bấm để mở Dropdown */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
        className={`flex items-center justify-between w-full px-2 h-8 text-[11px] text-left border rounded-md outline-none transition-colors
          ${disabled ? 'bg-slate-100 cursor-not-allowed opacity-70' : 'bg-white cursor-pointer'}
          ${error ? 'border-red-500 focus:ring-red-500/20' : 'border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'}
        `}
      >
        <span className={`block truncate ${!selectedOption ? 'text-slate-400' : 'text-slate-800'}`}>
          {selectedOption ? displayLabel : placeholder}
        </span>
        {disabled
          ? <Lock size={12} className="text-slate-400 ml-1 shrink-0" />
          : <ChevronDown size={14} className="text-slate-400 ml-1 shrink-0" />}
      </button>

      {/* Box thả xuống */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col">
          {/* Ô input Search */}
          <div className="flex items-center px-2 py-2 sticky top-0 bg-white border-b border-border">
            <Search size={14} className="text-text-muted mr-2" />
            <input
              type="text"
              className="w-full text-sm outline-none border-none focus:ring-0 p-0 text-text-primary placeholder-text-muted"
              placeholder="Tìm kiếm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
            {searchTerm && (
              <X 
                size={14} 
                className="text-text-muted cursor-pointer hover:text-text-primary ml-1" 
                onClick={() => setSearchTerm('')} 
              />
            )}
          </div>

          {/* Danh sách List */}
          <ul className="overflow-y-auto w-full py-1 custom-scrollbar">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-center text-text-muted">
                Không tìm thấy kết quả
              </li>
            ) : (
              (() => {
                const rows: React.ReactNode[] = [];
                let lastGroup: string | undefined;
                filteredOptions.forEach((opt) => {
                  const g = opt.group;
                  // Mở danh mục mới → chèn dòng tiêu đề (không bấm được).
                  if (g && g !== lastGroup) {
                    rows.push(
                      <li key={`grp-${g}`} className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50/70 select-none cursor-default">
                        {g}
                      </li>
                    );
                    lastGroup = g;
                  }
                  if (!g) lastGroup = undefined;
                  rows.push(
                    <li
                      key={opt.id}
                      onClick={() => handleSelect(opt.id)}
                      className={`${g ? 'pl-6 pr-3' : 'px-3'} py-2 text-sm cursor-pointer hover:bg-primary-light hover:text-primary transition-colors
                        ${opt.id.toString() === value?.toString() ? 'bg-primary/5 text-primary font-medium' : 'text-text-primary'}
                      `}
                    >
                      {opt.label}
                    </li>
                  );
                });
                return rows;
              })()
            )}
          </ul>
        </div>
      )}

      {/* Ẩn thanh cuộn mặc định xấu xí */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
      `}</style>
    </div>
  );
}
