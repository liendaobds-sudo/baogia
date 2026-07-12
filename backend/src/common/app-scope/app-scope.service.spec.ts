import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TenantAppScope } from '../../entities/tenant-app-scope.entity';
import { AppScopeService } from './app-scope.service';

/**
 * Unit test AppScopeService (tenant-app-scope) — DB SQLite in-memory (better-sqlite3) thật.
 *
 * Phủ: baseline inheritance, cấu hình tường minh, cô lập giữa tenant, resolver runtime,
 * và ngữ nghĩa fail-open khi thiếu tenant context.
 *
 * _Requirements: 1, 2, 3, 6_
 */
describe('AppScopeService — phạm vi Trục_Ứng_Dụng theo tenant', () => {
    let svc: AppScopeService;
    let repo: Repository<TenantAppScope>;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'better-sqlite3',
                    database: ':memory:',
                    dropSchema: true,
                    synchronize: true,
                    entities: [TenantAppScope],
                }),
                TypeOrmModule.forFeature([TenantAppScope]),
            ],
            providers: [AppScopeService],
        }).compile();

        svc = moduleRef.get(AppScopeService);
        repo = moduleRef.get(getRepositoryToken(TenantAppScope));

        // Seed baseline (tenant_id NULL): CSKH bật — như migration.
        await repo.save(repo.create({ tenantId: null, appKey: 'cskh', enabled: true }));
    });

    it('tenant chưa cấu hình → kế thừa baseline (CSKH bật)', async () => {
        expect(await svc.isCskhEnabledForTenant(101)).toBe(true);
        const scope = await svc.getScopeForTenant(101);
        expect(scope).toEqual({ cskh: true, source: 'inherited' });
    });

    it('tắt CSKH cho tenant → chỉ tenant đó tắt; tenant khác vẫn kế thừa baseline', async () => {
        await svc.setCskhForTenant(101, false);
        expect(await svc.isCskhEnabledForTenant(101)).toBe(false);
        expect(await svc.isCskhEnabledForTenant(202)).toBe(true);
        const scope = await svc.getScopeForTenant(101);
        expect(scope).toEqual({ cskh: false, source: 'explicit' });
    });

    it('bật lại CSKH sau khi tắt → cập nhật đúng hàng tường minh (không tạo trùng)', async () => {
        await svc.setCskhForTenant(101, false);
        await svc.setCskhForTenant(101, true);
        expect(await svc.isCskhEnabledForTenant(101)).toBe(true);
        const rows = await repo.find({ where: { tenantId: 101 } });
        expect(rows.length).toBe(1);
    });

    it('baseline tắt (mặc-định-nền = tắt) → tenant chưa cấu hình kế thừa tắt', async () => {
        await repo.update({ tenantId: IsNull(), appKey: 'cskh' }, { enabled: false });
        expect(await svc.isCskhEnabledForTenant(303)).toBe(false);
    });

    it('không có hàng baseline nào → coi CSKH bật (tương thích ngược)', async () => {
        await repo.clear();
        expect(await svc.isCskhEnabledForTenant(404)).toBe(true);
    });

    it('resolveEnabledApps: thiếu tenant context → baogia + cskh (fail-open baseline)', async () => {
        // Không inject TenantContextService → currentTenantId() null → baseline.
        const apps = await svc.resolveEnabledApps();
        expect(apps).toContain('baogia');
        expect(apps).toContain('cskh');
    });

    it('baogia LUÔN có trong tập khả dụng (lõi bất khả tắt)', async () => {
        await repo.update({ tenantId: IsNull(), appKey: 'cskh' }, { enabled: false });
        const apps = await svc.resolveEnabledApps();
        expect(apps).toContain('baogia');
    });
});
