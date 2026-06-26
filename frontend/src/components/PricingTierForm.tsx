'use client';

import React, { useEffect } from 'react';
import { useForm, useFieldArray, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Trash2, Save } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';

const tierSchema = z.object({
  quantity_from: z.number().min(1, 'SL từ phải ≥ 1'),
  quantity_to: z.number().nullable(),
  paper_price: z.number().min(0, 'Giá không hợp lệ'),
  ink_price: z.number().min(0, 'Giá không hợp lệ'),
  total_price: z.number(),
});

const formSchema = z.object({
  material_id: z.string().min(1, 'Vui lòng chọn vật liệu'),
  paper_size_id: z.string().min(1, 'Vui lòng chọn khổ giấy'),
  print_side: z.string().min(1, 'Vui lòng chọn mặt in'),
  technology_id: z.string().min(1, 'Vui lòng chọn công nghệ in'),
  tiers: z.array(tierSchema).min(1, 'Phải có ít nhất 1 mốc giá'),
});

type FormValues = z.infer<typeof formSchema>;

export default function PricingTierForm({
  materials = [],
  paperSizes = [],
  technologies = [],
  onSubmit,
  isSubmitting
}: {
  materials: any[];
  paperSizes: any[];
  technologies: any[];
  onSubmit: (data: FormValues) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      material_id: '',
      paper_size_id: '',
      print_side: '',
      technology_id: '',
      tiers: [{ quantity_from: 1, quantity_to: null, paper_price: 0, ink_price: 0, total_price: 0 }],
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tiers",
  });

  // Watch for auto-sum
  const watchTiers = useWatch({ control, name: "tiers" });

  useEffect(() => {
    // Tự động tính tổng tiền mỗi khi giá giấy hoặc giá mực thay đổi
    watchTiers.forEach((tier, index) => {
      const paper = Number(tier.paper_price) || 0;
      const ink = Number(tier.ink_price) || 0;
      const total = paper + ink;
      if (total !== tier.total_price) {
        setValue(`tiers.${index}.total_price`, total, { shouldValidate: true });
      }
    });
  }, [watchTiers, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card bg-white shadow-sm space-y-6">
      
      {/* 1. Header Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="input-group">
          <label>Vật liệu in</label>
          <Controller
            control={control}
            name="material_id"
            render={({ field }) => (
              <SearchableSelect
                options={materials.map(m => ({ id: m.id, label: m.name }))}
                value={field.value}
                onChange={field.onChange}
                placeholder="-- Chọn vật liệu --"
                error={!!errors.material_id}
              />
            )}
          />
          {errors.material_id && <span className="text-red-500 text-xs mt-1">{errors.material_id.message}</span>}
        </div>

        <div className="input-group">
          <label>Khổ giấy</label>
          <Controller
            control={control}
            name="paper_size_id"
            render={({ field }) => (
              <SearchableSelect
                options={paperSizes.map(p => ({ id: p.id, label: `${p.name} (${p.dimension_x} x ${p.dimension_y})` }))}
                value={field.value}
                onChange={field.onChange}
                placeholder="-- Chọn khổ giấy --"
                error={!!errors.paper_size_id}
              />
            )}
          />
          {errors.paper_size_id && <span className="text-red-500 text-xs mt-1">{errors.paper_size_id.message}</span>}
        </div>

        <div className="input-group">
          <label>Mặt in</label>
          <Controller
            control={control}
            name="print_side"
            render={({ field }) => (
              <SearchableSelect
                options={[{ id: '1', label: '1 Mặt' }, { id: '2', label: '2 Mặt' }]}
                value={field.value}
                onChange={field.onChange}
                placeholder="-- Chọn mặt in --"
                error={!!errors.print_side}
              />
            )}
          />
          {errors.print_side && <span className="text-red-500 text-xs mt-1">{errors.print_side.message}</span>}
        </div>

        <div className="input-group">
          <label>Công nghệ in</label>
          <Controller
            control={control}
            name="technology_id"
            render={({ field }) => (
              <SearchableSelect
                options={technologies.map(t => ({ id: t.id, label: t.name }))}
                value={field.value}
                onChange={field.onChange}
                placeholder="-- Chọn công nghệ --"
                error={!!errors.technology_id}
              />
            )}
          />
          {errors.technology_id && <span className="text-red-500 text-xs mt-1">{errors.technology_id.message}</span>}
        </div>
      </div>

      <hr className="border-border my-6" />

      {/* 2. Tiers Array (Dynamic Row Elements) */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-text-primary text-base">Thiết lập các mốc giá</h3>
          <button 
            type="button" 
            onClick={() => append({ quantity_from: 1, quantity_to: null, paper_price: 0, ink_price: 0, total_price: 0 })}
            className="btn btn-secondary text-sm flex items-center gap-2"
          >
            <Plus size={16} /> Thêm mốc giá
          </button>
        </div>

        {/* Responsive Table / Cards */}
        <div className="space-y-4">
          {/* Header Row for Desktop */}
          <div className="hidden md:grid grid-cols-12 gap-4 text-xs font-semibold text-text-secondary pb-2 border-b border-border">
            <div className="col-span-2">Từ SL</div>
            <div className="col-span-2">Đến SL</div>
            <div className="col-span-3">Giá Giấy (₫)</div>
            <div className="col-span-3">Giá Mực (₫)</div>
            <div className="col-span-1">Tổng/Tờ</div>
            <div className="col-span-1 text-right">Xoá</div>
          </div>

          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start bg-slate-50 md:bg-transparent p-4 md:p-0 rounded-lg md:rounded-none border md:border-none border-border">
              <div className="col-span-2 flex flex-col md:block">
                <span className="md:hidden text-xs text-text-muted mb-1 font-semibold">Từ SL</span>
                <input type="number" className="input text-sm" {...register(`tiers.${index}.quantity_from`, { valueAsNumber: true })} />
                {errors.tiers?.[index]?.quantity_from && <span className="text-red-500 text-xs block mt-1">{errors.tiers[index].quantity_from.message}</span>}
              </div>

              <div className="col-span-2 flex flex-col md:block">
                <span className="md:hidden text-xs text-text-muted mb-1 font-semibold">Đến SL (Tùy chọn)</span>
                <input type="number" className="input text-sm" placeholder="Max" {...register(`tiers.${index}.quantity_to`, { valueAsNumber: true })} />
              </div>

              <div className="col-span-3 flex flex-col md:block">
                <span className="md:hidden text-xs text-text-muted mb-1 font-semibold">Giá Giấy</span>
                <input type="number" step="0.01" className="input text-sm" {...register(`tiers.${index}.paper_price`, { valueAsNumber: true })} />
              </div>

              <div className="col-span-3 flex flex-col md:block">
                <span className="md:hidden text-xs text-text-muted mb-1 font-semibold">Giá Mực</span>
                <input type="number" step="0.01" className="input text-sm" {...register(`tiers.${index}.ink_price`, { valueAsNumber: true })} />
              </div>

              <div className="col-span-1 flex flex-col justify-center items-start md:items-center">
                <span className="md:hidden text-xs text-text-muted mb-1 font-semibold">Tổng/Tờ</span>
                <div className="font-bold text-primary mt-2">{watchTiers[index]?.total_price?.toLocaleString() || 0} ₫</div>
              </div>

              <div className="col-span-1 flex justify-end items-center pt-2 md:pt-1">
                <button 
                  type="button" 
                  onClick={() => remove(index)}
                  className="p-2 text-danger hover:bg-danger-light rounded-md transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end pt-6">
        <button type="submit" disabled={isSubmitting} className="btn btn-primary flex items-center gap-2 px-6">
          {isSubmitting ? (
             <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : <Save size={18} />}
          {isSubmitting ? 'Đang lưu...' : 'Lưu Định Mức'}
        </button>
      </div>

    </form>
  );
}
