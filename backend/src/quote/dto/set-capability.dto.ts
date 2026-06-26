import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO cho `PUT /quote/capabilities/:methodId` — admin bật/tắt một Phương_Pháp_In.
 *
 * Chỉ chấp nhận `enabled: boolean` (bắt buộc) và `unitId` tuỳ chọn (mặc định 'default').
 * ValidationPipe toàn cục dùng `whitelist + forbidNonWhitelisted` nên mọi trường lạ
 * sẽ bị từ chối (Req 1.8 — đầu vào hợp lệ).
 */
export class SetCapabilityDto {
    /** Trạng thái mong muốn của Cờ_Năng_Lực: true = bật, false = tắt (Req 1.2, 1.3). */
    @IsBoolean()
    enabled: boolean;

    /** Đơn_Vị áp dụng; bỏ trống ⇒ 'default' (multi-tenant tắt). */
    @IsOptional()
    @IsString()
    @MaxLength(50)
    unitId?: string;
}
