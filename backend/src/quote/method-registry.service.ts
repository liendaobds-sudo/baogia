/**
 * MethodRegistry — bảng đăng ký Plugin_Phương_Pháp theo `methodId`.
 *
 * Tầng method-agnostic của Công_Cụ_Báo_Giá hợp nhất: tra cứu đúng một
 * Plugin_Phương_Pháp theo `methodId ∈ {digital, offset, ...}` và định tuyến
 * câu hỏi "plugin có áp dụng được cho sản phẩm + thông số này không" tới plugin.
 *
 * Mở rộng được: thêm phương pháp mới (vd Khổ_Lớn) chỉ cần `register(plugin)`,
 * không đổi tầng Sản_Phẩm/Thông_Số (Req 1.5, 3.6). Khi tra cứu một `methodId`
 * chưa đăng ký, ném lỗi rõ ràng thay vì trả undefined (Req 4.6).
 *
 * _Requirements: 1.5, 3.6, 4.6_
 */
import { Injectable } from '@nestjs/common';
import {
    MethodId,
    MethodPlugin,
    ProductRef,
    Specification,
} from './types/method-plugin.types';

/** Ném khi tra cứu/định tuyến tới một `methodId` chưa được đăng ký (Req 4.6). */
export class MethodNotRegisteredError extends Error {
    constructor(
        public readonly methodId: MethodId,
        public readonly registered: MethodId[],
    ) {
        super(
            `Phương_Pháp_In '${methodId}' chưa được đăng ký. ` +
                `Các phương pháp đã đăng ký: [${registered.join(', ') || 'không có'}].`,
        );
        this.name = 'MethodNotRegisteredError';
    }
}

@Injectable()
export class MethodRegistry {
    /** Bảng đăng ký plugin theo methodId (đúng một plugin / methodId). */
    private readonly plugins = new Map<MethodId, MethodPlugin>();

    /**
     * Đăng ký một Plugin_Phương_Pháp. Đăng ký lại cùng `methodId` sẽ ghi đè
     * plugin trước đó, giữ bất biến "đúng một plugin cho mỗi methodId".
     */
    register(plugin: MethodPlugin): void {
        if (!plugin || !plugin.methodId) {
            throw new Error('Không thể đăng ký plugin thiếu methodId.');
        }
        this.plugins.set(plugin.methodId, plugin);
    }

    /**
     * Tra cứu plugin theo `methodId`.
     * @throws MethodNotRegisteredError nếu `methodId` chưa được đăng ký (Req 4.6).
     */
    getPlugin(methodId: MethodId): MethodPlugin {
        const plugin = this.plugins.get(methodId);
        if (!plugin) {
            throw new MethodNotRegisteredError(methodId, this.listMethodIds());
        }
        return plugin;
    }

    /**
     * `true` nếu phương pháp đã đăng ký và áp dụng được cho sản phẩm + thông số.
     * Định tuyến tới `plugin.appliesTo` (Req 5.1, 5.5).
     * @throws MethodNotRegisteredError nếu `methodId` chưa được đăng ký (Req 4.6).
     */
    appliesTo(
        methodId: MethodId,
        product: ProductRef,
        spec: Specification,
    ): boolean {
        return this.getPlugin(methodId).appliesTo(product, spec);
    }

    /** Liệt kê các `methodId` đã đăng ký (mở rộng được — Req 1.5). */
    listMethodIds(): MethodId[] {
        return Array.from(this.plugins.keys());
    }
}
