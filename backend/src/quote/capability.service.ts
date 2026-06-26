import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MethodCapability } from '../entities/method-capability.entity';
import { MethodId } from './types/method-plugin.types';

/** Đơn_Vị ngầm định khi multi-tenant tắt (Design — "Định nghĩa Đơn_Vị"). */
export const DEFAULT_UNIT_ID = 'default';

/**
 * Ném khi cố tắt Phương_Pháp_Khả_Dụng cuối cùng của một Đơn_Vị đang vận hành
 * (đã có ≥1 phương pháp khả dụng). Tầng API ánh xạ lỗi này → HTTP 409 (Req 1.6).
 */
export class LastEnabledMethodError extends Error {
    constructor(
        public readonly unitId: string,
        public readonly methodId: MethodId,
    ) {
        super(
            `Không thể tắt phương pháp khả dụng cuối cùng ('${methodId}') của Đơn_Vị '${unitId}' đang vận hành.`,
        );
        this.name = 'LastEnabledMethodError';
    }
}

/**
 * CapabilityService — quản lý Cờ_Năng_Lực `(unitId, methodId) → enabled`.
 *
 * Quy tắc nghiệp vụ (Design — CapabilityService):
 * - Mỗi cặp (unitId, methodId) có đúng một trạng thái; chưa có bản ghi ⇒ `enabled=false`,
 *   nên Đơn_Vị mới có thể tồn tại với 0 phương pháp (Req 1.1, 1.7).
 * - `setFlag(..., false)` bị từ chối nếu đó là phương pháp khả dụng cuối cùng VÀ
 *   Đơn_Vị đã có ≥1 phương pháp khả dụng. Đơn_Vị 0-phương-pháp không vướng ràng buộc
 *   này (Req 1.6).
 */
@Injectable()
export class CapabilityService {
    constructor(
        @InjectRepository(MethodCapability)
        private readonly repo: Repository<MethodCapability>,
    ) {}

    /** Tập Phương_Pháp_Khả_Dụng (cờ đang bật) của Đơn_Vị (Req 1.2, 1.3). */
    async getEnabledMethods(unitId: string = DEFAULT_UNIT_ID): Promise<MethodId[]> {
        const rows = await this.repo.find({ where: { unitId, enabled: true } });
        return rows.map((r) => r.methodId);
    }

    /** Một phương pháp có đang khả dụng cho Đơn_Vị không. Chưa có bản ghi ⇒ false (Req 1.7). */
    async isEnabled(
        unitId: string = DEFAULT_UNIT_ID,
        methodId: MethodId,
    ): Promise<boolean> {
        const row = await this.repo.findOne({ where: { unitId, methodId } });
        return row?.enabled ?? false;
    }

    /**
     * Bật/tắt Cờ_Năng_Lực cho một cặp (unitId, methodId) (Req 1.2, 1.3).
     * Ném {@link LastEnabledMethodError} khi tắt phương pháp khả dụng cuối cùng
     * của Đơn_Vị đã có ≥1 phương pháp khả dụng (Req 1.6).
     */
    async setFlag(
        unitId: string = DEFAULT_UNIT_ID,
        methodId: MethodId,
        enabled: boolean,
    ): Promise<MethodCapability> {
        if (!enabled) {
            const enabledMethods = await this.getEnabledMethods(unitId);
            const isCurrentlyEnabled = enabledMethods.includes(methodId);
            // Chỉ chặn khi đang tắt đúng phương pháp khả dụng cuối cùng của Đơn_Vị
            // đang vận hành (có đúng 1 phương pháp khả dụng và đó chính là phương pháp này).
            if (isCurrentlyEnabled && enabledMethods.length === 1) {
                throw new LastEnabledMethodError(unitId, methodId);
            }
        }

        let row = await this.repo.findOne({ where: { unitId, methodId } });
        if (row) {
            row.enabled = enabled;
        } else {
            row = this.repo.create({ unitId, methodId, enabled });
        }
        return this.repo.save(row);
    }

    /** Liệt kê toàn bộ cờ năng lực (bật và tắt) của Đơn_Vị. */
    async listFlags(unitId: string = DEFAULT_UNIT_ID): Promise<MethodCapability[]> {
        return this.repo.find({ where: { unitId } });
    }
}
