/**
 * Property-based test cho CapabilityService — tính duy nhất trạng thái.
 *
 * Feature: print-method-unification, Property 2: Đúng một trạng thái cho mỗi cặp (Đơn_Vị, Phương_Pháp)
 *
 * Property 2 (Design — Correctness Properties):
 *   For any dãy thao tác bật/tắt trên một cặp (unitId, methodId), trạng thái lưu
 *   trữ luôn là đúng một giá trị bật/tắt bằng giá trị của thao tác cuối cùng
 *   (không tồn tại hai bản ghi mâu thuẫn).
 *
 * Validates: Requirements 1.1
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { MethodCapability } from '../entities/method-capability.entity';
import { CapabilityService } from './capability.service';

const NUM_RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

/** Một phương pháp "lá chắn" luôn bật để thao tác trên target không bao giờ chạm
 *  ràng buộc "phương pháp khả dụng cuối cùng" (Req 1.6) — vốn thuộc Property 3. */
const GUARD_METHOD = '__guard__';

/**
 * Repository giả lập trong bộ nhớ, hiện thực đúng các phương thức TypeORM mà
 * {@link CapabilityService} sử dụng (find / findOne / create / save) cùng ngữ nghĩa
 * UNIQUE (unitId, methodId). Cho phép kiểm thử logic THẬT của service không cần DB.
 */
class InMemoryCapabilityRepo {
    private rows: MethodCapability[] = [];
    private seq = 1;

    private static matches(
        row: MethodCapability,
        where: Partial<MethodCapability>,
    ): boolean {
        return (Object.keys(where) as (keyof MethodCapability)[]).every(
            (k) => row[k] === where[k],
        );
    }

    private static clone(row: MethodCapability): MethodCapability {
        return { ...row } as MethodCapability;
    }

    async find(opts: {
        where: Partial<MethodCapability>;
    }): Promise<MethodCapability[]> {
        return this.rows
            .filter((r) => InMemoryCapabilityRepo.matches(r, opts.where))
            .map(InMemoryCapabilityRepo.clone);
    }

    async findOne(opts: {
        where: Partial<MethodCapability>;
    }): Promise<MethodCapability | null> {
        const found = this.rows.find((r) =>
            InMemoryCapabilityRepo.matches(r, opts.where),
        );
        return found ? InMemoryCapabilityRepo.clone(found) : null;
    }

    create(data: Partial<MethodCapability>): MethodCapability {
        return { ...data } as MethodCapability;
    }

    async save(entity: MethodCapability): Promise<MethodCapability> {
        // Upsert theo id (nếu có) hoặc theo cặp UNIQUE (unitId, methodId).
        const existing =
            entity.id != null
                ? this.rows.find((r) => r.id === entity.id)
                : this.rows.find(
                      (r) =>
                          r.unitId === entity.unitId &&
                          r.methodId === entity.methodId,
                  );
        if (existing) {
            Object.assign(existing, entity);
            existing.updatedAt = new Date();
            return InMemoryCapabilityRepo.clone(existing);
        }
        const row: MethodCapability = {
            ...entity,
            id: this.seq++,
            updatedAt: new Date(),
        } as MethodCapability;
        this.rows.push(row);
        return InMemoryCapabilityRepo.clone(row);
    }

    /** Đếm số bản ghi thô (không clone) khớp cặp — dùng để bắt bản ghi trùng. */
    countRaw(unitId: string, methodId: string): number {
        return this.rows.filter(
            (r) => r.unitId === unitId && r.methodId === methodId,
        ).length;
    }
}

describe('CapabilityService — tính duy nhất trạng thái (property)', () => {
    // Feature: print-method-unification, Property 2: Đúng một trạng thái cho mỗi cặp (Đơn_Vị, Phương_Pháp)
    it('Property 2: dãy bật/tắt trên một cặp luôn để lại đúng một trạng thái = thao tác cuối (Req 1.1)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('default', 'tenant-a', 'tenant-b'),
                fc.constantFrom(...METHOD_POOL),
                // Dãy thao tác bật/tắt (>=1) lặp lại trên cùng một cặp.
                fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
                async (unitId, target, ops) => {
                    const repo = new InMemoryCapabilityRepo();
                    const service = new CapabilityService(repo as any);

                    // Seed phương pháp lá chắn luôn bật để target có thể tắt tự do.
                    await service.setFlag(unitId, GUARD_METHOD, true);

                    for (const enabled of ops) {
                        await service.setFlag(unitId, target, enabled);

                        // Bất biến 1: không bao giờ có hai bản ghi cho cùng một cặp.
                        expect(repo.countRaw(unitId, target)).toBeLessThanOrEqual(
                            1,
                        );

                        // Bất biến 2: trạng thái đọc ra khớp thao tác vừa áp dụng.
                        expect(await service.isEnabled(unitId, target)).toBe(
                            enabled,
                        );
                    }

                    // Sau toàn bộ dãy: đúng một bản ghi, giá trị = thao tác cuối cùng.
                    const last = ops[ops.length - 1];
                    expect(repo.countRaw(unitId, target)).toBe(1);
                    expect(await service.isEnabled(unitId, target)).toBe(last);

                    // listFlags chỉ trả đúng một dòng cho cặp (không bản ghi mâu thuẫn).
                    const flags = await service.listFlags(unitId);
                    const forTarget = flags.filter((f) => f.methodId === target);
                    expect(forTarget).toHaveLength(1);
                    expect(forTarget[0].enabled).toBe(last);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
