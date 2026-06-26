import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Tenant context mang theo (tenantId, userId, role) xuyên suốt một request HTTP
 * hoặc một job nền (BullMQ/cron/socket/zca-js), để tầng dữ liệu lấy tenant mà
 * KHÔNG cần truyền tay qua mọi hàm.
 *
 * G0 (giai đoạn này): CHỈ cung cấp context, CHƯA enforce. Giai đoạn G2 mới bật
 * RLS dựa trên context này. Tách 2 bước để không sập worker khi lật công tắc.
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4_
 */
export interface TenantContext {
    /** Org (tenant) hiện hành — biên giới cô lập dữ liệu. */
    tenantId: number;
    /** User thực hiện; 'system' cho job nội bộ. */
    userId: string;
    /** Role của actor; 'system' cho job nội bộ. */
    role: string;
    /**
     * Cho phép bỏ qua tenant-guard CHO MỘT SỐ truy vấn cross-tenant hợp lệ
     * (job toàn cục, lookup có kiểm soát). Mặc định false. Đặt true PHẢI có lý do.
     */
    bypass?: boolean;
    /**
     * EntityManager gắn-theo-request (do TenantConnectionInterceptor mở 1 transaction
     * có SET LOCAL app.current_tenant). Khi có → service nên dùng nó cho ĐỌC để RLS lọc
     * đúng. Khi không (mặc định/RLS tắt) → service dùng repo mặc định như cũ.
     */
    manager?: unknown;
}

// Singleton store cấp module — chia sẻ cho mọi nơi import service.
const storage = new AsyncLocalStorage<TenantContext>();

@Injectable()
export class TenantContextService {
    /** Gắn context cho phần async hiện tại trở đi (dùng trong interceptor HTTP). */
    enter(ctx: TenantContext): void {
        storage.enterWith(ctx);
    }

    /** Lấy context hiện hành; undefined nếu đang chạy ngoài mọi scope. */
    get(): TenantContext | undefined {
        return storage.getStore();
    }

    /** Lấy context; THROW nếu thiếu (fail-loud cho org-scoped query). */
    require(): TenantContext {
        const ctx = storage.getStore();
        if (!ctx) {
            throw new Error(
                '[tenant] Không có tenant context. Org-scoped query phải chạy trong ' +
                'request (interceptor) hoặc withTenant(tenantId, fn).',
            );
        }
        return ctx;
    }

    /** Lấy tenantId hiện hành; null nếu ngoài scope (cho code chịu được thiếu context). */
    currentTenantId(): number | null {
        return storage.getStore()?.tenantId ?? null;
    }

    /** Gắn EntityManager theo request (do TenantConnectionInterceptor gọi). */
    attachManager(manager: unknown): void {
        const ctx = storage.getStore();
        if (ctx) ctx.manager = manager;
    }

    /** EntityManager gắn-theo-request nếu có (RLS bật); ngược lại undefined. */
    manager<T = unknown>(): T | undefined {
        return storage.getStore()?.manager as T | undefined;
    }

    /**
     * Chạy `fn` trong một tenant scope tường minh — cho worker/cron/socket/
     * listener zca-js chạy NGOÀI request HTTP.
     */
    withTenant<T>(
        tenantId: number,
        fn: () => Promise<T> | T,
        opts?: { userId?: string; role?: string; bypass?: boolean },
    ): Promise<T> | T {
        return storage.run(
            {
                tenantId,
                userId: opts?.userId ?? 'system',
                role: opts?.role ?? 'system',
                bypass: opts?.bypass ?? false,
            },
            fn,
        );
    }

    /**
     * Chạy `fn` ở chế độ SYSTEM bypass — CHỈ cho query hợp lệ chạy ngoài tenant
     * (healthcheck, migration, lookup cross-tenant có kiểm soát). KHÔNG dùng cho
     * business logic — đó là đường vòng qua cô lập.
     */
    runSystem<T>(fn: () => Promise<T> | T): Promise<T> | T {
        return storage.run({ tenantId: 0, userId: 'system', role: 'system', bypass: true }, fn);
    }
}
