/**
 * Property-based test cho CapabilityService — toggle round-trip.
 *
 * Feature: print-method-unification, Property 1: Toggle capability round-trip
 *
 * Property 1 (Design — Correctness Properties):
 *   For any Đơn_Vị và bất kỳ Phương_Pháp_In nào, bật rồi tắt (hoặc tắt rồi bật)
 *   Cờ_Năng_Lực trả Đơn_Vị về đúng tập Phương_Pháp_Khả_Dụng ban đầu; và sau khi
 *   bật, phương pháp đó thuộc tập khả dụng, sau khi tắt thì không thuộc.
 *
 * Validates: Requirements 1.2, 1.3
 *
 * Chạy >= 100 iteration bằng fast-check.
 */
import * as fc from 'fast-check';
import { MethodCapability } from '../entities/method-capability.entity';
import { CapabilityService } from './capability.service';

const NUM_RUNS = 200;

/** Tập Phương_Pháp_In dùng để sinh dữ liệu (mở rộng được — Req 1.5). */
const METHOD_POOL = ['digital', 'offset', 'large_format', 'screen', 'flexo', 'uv'];

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

describe('CapabilityService — toggle round-trip (property)', () => {
    // Feature: print-method-unification, Property 1: Toggle capability round-trip
    it('Property 1: bật↔tắt một phương pháp trả Đơn_Vị về đúng tập khả dụng ban đầu (Req 1.2, 1.3)', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom('default', 'tenant-a', 'tenant-b'),
                fc.constantFrom(...METHOD_POOL),
                fc.uniqueArray(fc.constantFrom(...METHOD_POOL)),
                fc.boolean(),
                async (unitId, target, othersRaw, targetInitiallyEnabled) => {
                    // Bảo đảm luôn còn ≥1 phương pháp khả dụng KHÁC target, để thao
                    // tác tắt target không bao giờ chạm ràng buộc "phương pháp cuối"
                    // (Req 1.6) — vốn được kiểm bởi Property 3, không thuộc phạm vi
                    // round-trip này.
                    const guardPool = METHOD_POOL.filter((m) => m !== target);
                    let others = othersRaw.filter((m) => m !== target);
                    if (others.length === 0) others = [guardPool[0]];

                    const initialEnabled = [...others];
                    if (targetInitiallyEnabled) initialEnabled.push(target);

                    const service = await makeService(unitId, initialEnabled);

                    const beforeSet = new Set(
                        await service.getEnabledMethods(unitId),
                    );
                    const s0 = await service.isEnabled(unitId, target);
                    expect(s0).toBe(targetInitiallyEnabled);

                    // --- Bước 1: lật trạng thái target ---
                    await service.setFlag(unitId, target, !s0);
                    const afterToggle = await service.isEnabled(unitId, target);
                    // Req 1.2 (bật ⇒ thuộc tập) / Req 1.3 (tắt ⇒ rời tập).
                    expect(afterToggle).toBe(!s0);
                    const midSet = new Set(
                        await service.getEnabledMethods(unitId),
                    );
                    expect(midSet.has(target)).toBe(!s0);
                    // Các phương pháp khác không bị ảnh hưởng.
                    for (const m of guardPool) {
                        expect(midSet.has(m)).toBe(beforeSet.has(m));
                    }

                    // --- Bước 2: lật ngược lại (round-trip) ---
                    await service.setFlag(unitId, target, s0);
                    const restored = await service.isEnabled(unitId, target);
                    expect(restored).toBe(s0);

                    // Tập khả dụng trở về đúng trạng thái ban đầu.
                    const afterSet = new Set(
                        await service.getEnabledMethods(unitId),
                    );
                    expect(afterSet.size).toBe(beforeSet.size);
                    for (const m of beforeSet) expect(afterSet.has(m)).toBe(true);
                    for (const m of afterSet) expect(beforeSet.has(m)).toBe(true);
                },
            ),
            { numRuns: NUM_RUNS },
        );
    });
});
