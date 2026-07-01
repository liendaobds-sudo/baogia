import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CapabilityService } from './capability.service';
import { resolveMethodForQuoteType } from './method-mapping';
import { MethodId } from './types/method-plugin.types';

/**
 * Kiểm một Phương_Pháp_In có khả dụng cho tenant hiện hành không; ném 403 nếu bị tắt.
 * Dùng cho các Đường_Tính_Giá HTTP (facade digital, offset). Thông báo CHỈ nêu
 * phương pháp bị chặn, KHÔNG lộ cấu hình tenant khác (Req 4.6, 4.7).
 */
export async function assertMethodEnabled(
    cap: CapabilityService,
    methodId: MethodId,
): Promise<void> {
    const enabled = await cap.resolveEnabledMethods();
    if (!enabled.includes(methodId)) {
        throw new ForbiddenException(
            `Phương pháp in '${methodId}' không khả dụng cho đơn vị của bạn.`,
        );
    }
}

/**
 * Suy dẫn Phương_Pháp_In từ `quote_type` rồi kiểm khả dụng cho tenant.
 * - `quote_type` không nhận dạng → 400 (tách bạch với "phương pháp bị tắt" — Req 5.4, 10.2).
 * - phương pháp bị tắt cho tenant → 403 (Req 4.1).
 */
export async function assertQuoteTypeEnabled(
    cap: CapabilityService,
    quoteType?: string | null,
): Promise<MethodId> {
    const methodId = resolveMethodForQuoteType(quoteType);
    if (!methodId) {
        throw new BadRequestException(
            `Không nhận dạng loại sản phẩm '${quoteType ?? ''}'.`,
        );
    }
    await assertMethodEnabled(cap, methodId);
    return methodId;
}
