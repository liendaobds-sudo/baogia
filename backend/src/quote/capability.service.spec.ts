/**
 * Unit test cho CapabilityService — biên cấu hình Đơn_Vị.
 *
 * Feature: print-method-unification
 *
 * Bao phủ:
 *  - Đơn_Vị 0-phương-pháp: `setFlag(..., false)` trên phương pháp chưa bật KHÔNG
 *    vướng ràng buộc "phương pháp khả dụng cuối cùng"; `getEnabledMethods` rỗng.
 *  - Ba cấu hình: chỉ-digital / chỉ-offset / cả-hai — xác nhận `getEnabledMethods`
 *    và `isEnabled` trả đúng.
 *
 * Validates: Requirements 1.4, 1.7
 */
import { MethodCapability } from '../entities/method-capability.entity';
import {
    CapabilityService,
    DEFAULT_UNIT_ID,
    LastEnabledMethodError,
} from './capability.service';

/**
 * Repository giả lập trong bộ nhớ — hiện thực đúng các phương thức TypeORM mà
 * {@link CapabilityService} dùng (find / findOne / create / save) cùng ngữ nghĩa
 * UNIQUE (unitId, methodId). Cho phép kiểm thử logic THẬT của service không cần DB.
 *
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

/** Dựng service với repo in-memory, seed sẵn các phương pháp đang bật. */
async function makeService(
    unitId: string,
    initiallyEnabled: string[],
): Promise<{ service: CapabilityService; repo: InMemoryCapabilityRepo }> {
    const repo = new InMemoryCapabilityRepo();
    const service = new CapabilityService(repo as any);
    for (const methodId of initiallyEnabled) {
        await repo.save(repo.create({ unitId, methodId, enabled: true }));
    }
    return { service, repo };
}

describe('CapabilityService — biên cấu hình Đơn_Vị', () => {
    describe('Đơn_Vị 0-phương-pháp (Req 1.7, 1.4)', () => {
        it('getEnabledMethods trả về rỗng khi chưa có bản ghi nào', async () => {
            const { service } = await makeService('unit-empty', []);
            await expect(service.getEnabledMethods('unit-empty')).resolves.toEqual(
                [],
            );
        });

        it('isEnabled trả false cho mọi phương pháp khi Đơn_Vị 0-phương-pháp', async () => {
            const { service } = await makeService('unit-empty', []);
            await expect(
                service.isEnabled('unit-empty', 'digital'),
            ).resolves.toBe(false);
            await expect(
                service.isEnabled('unit-empty', 'offset'),
            ).resolves.toBe(false);
        });

        it('setFlag(..., false) trên phương pháp chưa bật KHÔNG ném LastEnabledMethodError', async () => {
            const { service } = await makeService('unit-empty', []);
            // Đơn_Vị 0-phương-pháp không vướng ràng buộc "phương pháp cuối cùng".
            await expect(
                service.setFlag('unit-empty', 'digital', false),
            ).resolves.toBeDefined();
            // Vẫn không có phương pháp nào khả dụng sau thao tác.
            await expect(service.getEnabledMethods('unit-empty')).resolves.toEqual(
                [],
            );
            await expect(
                service.isEnabled('unit-empty', 'digital'),
            ).resolves.toBe(false);
        });

        it('Đơn_Vị mặc định (default) không có bản ghi cũng là 0-phương-pháp hợp lệ', async () => {
            const { service } = await makeService(DEFAULT_UNIT_ID, []);
            await expect(service.getEnabledMethods()).resolves.toEqual([]);
            // Tắt phương pháp chưa bật trên default cũng không vướng ràng buộc.
            await expect(
                service.setFlag(undefined, 'offset', false),
            ).resolves.toBeDefined();
        });
    });

    describe('Cấu hình chỉ-digital (Req 1.4)', () => {
        it('getEnabledMethods chỉ chứa digital; isEnabled phản ánh đúng', async () => {
            const { service } = await makeService('unit-d', ['digital']);
            await expect(service.getEnabledMethods('unit-d')).resolves.toEqual([
                'digital',
            ]);
            await expect(service.isEnabled('unit-d', 'digital')).resolves.toBe(
                true,
            );
            await expect(service.isEnabled('unit-d', 'offset')).resolves.toBe(
                false,
            );
        });

        it('digital là phương pháp khả dụng cuối cùng ⇒ không tắt được', async () => {
            const { service } = await makeService('unit-d', ['digital']);
            await expect(
                service.setFlag('unit-d', 'digital', false),
            ).rejects.toBeInstanceOf(LastEnabledMethodError);
        });
    });

    describe('Cấu hình chỉ-offset (Req 1.4)', () => {
        it('getEnabledMethods chỉ chứa offset; isEnabled phản ánh đúng', async () => {
            const { service } = await makeService('unit-o', ['offset']);
            await expect(service.getEnabledMethods('unit-o')).resolves.toEqual([
                'offset',
            ]);
            await expect(service.isEnabled('unit-o', 'offset')).resolves.toBe(
                true,
            );
            await expect(service.isEnabled('unit-o', 'digital')).resolves.toBe(
                false,
            );
        });

        it('offset là phương pháp khả dụng cuối cùng ⇒ không tắt được', async () => {
            const { service } = await makeService('unit-o', ['offset']);
            await expect(
                service.setFlag('unit-o', 'offset', false),
            ).rejects.toBeInstanceOf(LastEnabledMethodError);
        });
    });

    describe('Cấu hình cả-hai (digital + offset) (Req 1.4)', () => {
        it('getEnabledMethods chứa cả hai; isEnabled đúng cho cả hai', async () => {
            const { service } = await makeService('unit-b', [
                'digital',
                'offset',
            ]);
            const enabled = await service.getEnabledMethods('unit-b');
            expect(new Set(enabled)).toEqual(new Set(['digital', 'offset']));
            await expect(service.isEnabled('unit-b', 'digital')).resolves.toBe(
                true,
            );
            await expect(service.isEnabled('unit-b', 'offset')).resolves.toBe(
                true,
            );
        });

        it('tắt một trong hai vẫn còn phương pháp khả dụng ⇒ cho phép', async () => {
            const { service } = await makeService('unit-b', [
                'digital',
                'offset',
            ]);
            await expect(
                service.setFlag('unit-b', 'offset', false),
            ).resolves.toBeDefined();
            await expect(service.getEnabledMethods('unit-b')).resolves.toEqual([
                'digital',
            ]);
            // Sau khi còn lại 1 phương pháp, phương pháp đó trở thành "cuối cùng".
            await expect(
                service.setFlag('unit-b', 'digital', false),
            ).rejects.toBeInstanceOf(LastEnabledMethodError);
        });
    });
});
