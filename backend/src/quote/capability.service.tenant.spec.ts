import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MethodCapability } from '../entities/method-capability.entity';
import {
    CapabilityService,
    LastEnabledMethodError,
    tenantUnitId,
} from './capability.service';

/**
 * Unit test API năng lực THEO TENANT (Task 3.4) — DB SQLite in-memory (better-sqlite3) thật.
 * _Requirements: 2.1, 2.2, 2.5, 6.3, 10.1_
 */
describe('CapabilityService — theo tenant', () => {
    let svc: CapabilityService;
    let repo: Repository<MethodCapability>;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    dropSchema: true,
                    synchronize: true,
                    entities: [MethodCapability],
                }),
                TypeOrmModule.forFeature([MethodCapability]),
            ],
            providers: [CapabilityService],
        }).compile();

        svc = moduleRef.get(CapabilityService);
        repo = moduleRef.get(getRepositoryToken(MethodCapability));

        // Seed baseline (tenant_id NULL): bật cả hai — như migration gốc.
        await repo.save([
            repo.create({ unitId: 'default', tenantId: null, methodId: 'digital', enabled: true }),
            repo.create({ unitId: 'default', tenantId: null, methodId: 'offset', enabled: true }),
        ]);
    });

    it('tenant chưa cấu hình → kế thừa baseline (bật cả hai)', async () => {
        const methods = await svc.getEnabledMethodsForTenant(101);
        expect(methods.sort()).toEqual(['digital', 'offset']);
    });

    it('tenantId null → trả baseline', async () => {
        expect((await svc.getEnabledMethodsForTenant(null)).sort()).toEqual(['digital', 'offset']);
    });

    it('tắt offset cho tenant → chỉ còn digital; tenant khác KHÔNG bị ảnh hưởng', async () => {
        await svc.setFlagForTenant(101, 'offset', false);
        expect(await svc.getEnabledMethodsForTenant(101)).toEqual(['digital']);
        // Tenant 202 vẫn kế thừa baseline.
        expect((await svc.getEnabledMethodsForTenant(202)).sort()).toEqual(['digital', 'offset']);
    });

    it('materialize baseline khi tắt lần đầu: sinh hàng tường minh cho tenant', async () => {
        await svc.setFlagForTenant(101, 'offset', false);
        const rows = await svc.listFlagsForTenant(101);
        expect(rows.length).toBe(2);
        expect(rows.every((r) => r.unitId === tenantUnitId(101))).toBe(true);
        const offset = rows.find((r) => r.methodId === 'offset');
        expect(offset?.enabled).toBe(false);
    });

    it('tắt phương pháp khả dụng CUỐI CÙNG của tenant → LastEnabledMethodError (409)', async () => {
        await svc.setFlagForTenant(101, 'offset', false); // còn digital
        await expect(svc.setFlagForTenant(101, 'digital', false)).rejects.toBeInstanceOf(
            LastEnabledMethodError,
        );
        // Trạng thái không đổi: digital vẫn bật.
        expect(await svc.getEnabledMethodsForTenant(101)).toEqual(['digital']);
    });

    it('isEnabledForTenant phản ánh đúng cấu hình', async () => {
        await svc.setFlagForTenant(101, 'offset', false);
        expect(await svc.isEnabledForTenant(101, 'digital')).toBe(true);
        expect(await svc.isEnabledForTenant(101, 'offset')).toBe(false);
    });

    it('API cũ theo unitId vẫn hoạt động (backward-compat)', async () => {
        expect((await svc.getEnabledMethods('default')).sort()).toEqual(['digital', 'offset']);
    });
});
