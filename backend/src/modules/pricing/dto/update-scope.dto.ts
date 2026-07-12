import { IsOptional, IsNumber, IsBoolean } from 'class-validator';

/**
 * DTO cập nhật Cờ_Phạm_Vi cho một Tài_Nguyên_Dùng_Chung từ Màn_Quản_Trị_Phạm_Vi
 * (PATCH /erp/{processing-options|materials|paper-sizes}/:id/scope).
 *
 * Tất cả cờ đều optional → cho phép cập nhật một phần (chỉ ghi cờ được gửi lên).
 * - `scope_loose`, `scope_bound`, `scope_large_format`: smallint 0/1 (theo processing_options;
 *   với materials/paper_sizes — cột boolean — sẽ được service chuyển 0/1 → false/true).
 * - `scope_offset`: boolean cho cả ba nhóm.
 *
 * Giá trị được kiểm chứng bằng `validateScopeFlags` ở tầng service trước khi ghi
 * (smallint ∈ {0,1}, offset ∈ {true,false}); không hợp lệ → 422, giữ nguyên giá trị cũ.
 *
 * _Requirements: 5.1, 5.2, 5.5, 5.8, 6.2_
 */
export class UpdateScopeDto {
    @IsOptional() @IsNumber() scope_loose?: number;
    @IsOptional() @IsNumber() scope_bound?: number;
    @IsOptional() @IsNumber() scope_large_format?: number;
    @IsOptional() @IsBoolean() scope_offset?: boolean;
}
