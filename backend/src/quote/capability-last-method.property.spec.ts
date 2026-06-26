/**
 * Property-based test cho CapabilityService — ràng buộc phương pháp khả dụng cuối cùng.
 *
 * Feature: print-method-unification, Property 3: Không tắt được phương pháp khả dụng cuối cùng
 *
 * Property 3 (Design — Correctness Properties):
 *   For any Đơn_Vị có đúng một Phương_Pháp_Khả_Dụng, thao tác tắt phương pháp đó bị
 *   từ chối và tập Phương_Pháp_Khả_Dụng không đổi; với Đơn_Vị có ≥2 phương pháp khả
 *   dụng, tắt một phương pháp luôn thành công và làm tập đó giảm đúng một phần tử.
 *   (Đơn_Vị 0-phương-pháp không vướng ràng buộc này.)
 *
 * Validates: Requirements 1.6
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { MethodCapability } from '../entities/method-capability.entity';
import {
    CapabilityService,
    LastEnabledMethodError,
} from './capability.service';

const NUM_RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

/**
 * Repository giả lập trong bộ nhớ, hiện thực đúng các phương thức TypeORM mà
 * {@link CapabilityService} sử dụng (find / findOne / create / save) cùng ngữ nghĩa
 * UNIQUE (unitId, methodId). Cho phép kiểm thử logic THẬT của service không cần DB.
 * (Tái dùng mẫu từ capability-toggle.property.spec.ts.)
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
}

/** Dựng service với repo in-memory đã được seed sẵn tập phương pháp đang bật. */
async function makeService(
    unitId: string,
    initiallyEnabled: string[],
): Promise<CapabilityService> {
    const repo = new InMemoryCapabilityRepo();
    const service = new CapabilityService(repo as any);
    for (const methodId of initiallyEnabled) {
        await repo.save(repo.create({ unitId, methodId, enabled: true }));
    }
    return service;
}

describe('CapabilityService — ràng buộc phương pháp cuối cùng (property)', () => {
    // Feature: print-method-unification, Property 3: Không tắt được phương pháp khả dụng cuối cùng
    it('Property 3: không tắt được phương pháp cuối; tắt được khi có ≥2; Đơn_Vị 0-phương-pháp không vướng ràng buộc (Req 1.6)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('default', 'tenant-a', 'tenant-b'),
                // Tập phương pháp đang bật ban đầu (có thể rỗng để bao trường hợp 0-phương-pháp).
                fc.uniqueArray(fc.constantFrom(...METHOD_POOL), {
                    minLength: 0,
                    maxLength: METHOD_POOL.length,
                }),
                async (unitId, enabledMethods) => {
                    const service = await makeService(unitId, enabledMethods);

                    const before = new Set(
                        await service.getEnabledMethods(unitId),
                    );
                    expect(before.size).toBe(enabledMethods.length);

                    if (enabledMethods.length === 0) {
                        // --- Đơn_Vị 0-phương-pháp: tắt bất kỳ phương pháp nào không
                        // vướng ràng buộc (phương pháp vốn đã tắt) — thao tác thành công,
                        // tập khả dụng vẫn rỗng (Req 1.6, 1.7). ---
                        const target = METHOD_POOL[0];
                        await expect(
                            service.setFlag(unitId, target, false),
                        ).resolves.toBeDefined();
                        const after = new Set(
                            await service.getEnabledMethods(unitId),
                        );
                        expect(after.size).toBe(0);
                        return;
                    }

                    if (enabledMethods.length === 1) {
                        // --- Đúng một phương pháp khả dụng: tắt nó bị TỪ CHỐI, tập không đổi. ---
                        const last = enabledMethods[0];
                        await expect(
                            service.setFlag(unitId, last, false),
                        ).rejects.toBeInstanceOf(LastEnabledMethodError);

                        const after = new Set(
                            await service.getEnabledMethods(unitId),
                        );
                        expect(after.size).toBe(1);
                        expect(after.has(last)).toBe(true);
                        return;
                    }

                    // --- ≥2 phương pháp khả dụng: tắt bất kỳ một phương pháp luôn
                    // thành công và làm tập giảm đúng một phần tử. ---
                    for (const target of enabledMethods) {
                        const svc = await makeService(unitId, enabledMethods);
                        await expect(
                            svc.setFlag(unitId, target, false),
                        ).resolves.toBeDefined();

                        const after = new Set(
                            await svc.getEnabledMethods(unitId),
                        );
                        expect(after.size).toBe(enabledMethods.length - 1);
                        expect(after.has(target)).toBe(false);
                        for (const m of enabledMethods) {
                            if (m !== target) expect(after.has(m)).toBe(true);
                        }
                    }
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
