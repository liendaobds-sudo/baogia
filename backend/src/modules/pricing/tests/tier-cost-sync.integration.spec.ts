/**
 * Tầng 2 — Giá vốn chảy vào định mức: test service (mocked TypeORM repos).
 *
 * Kiểm phần CHẠM DỮ LIỆU của MasterDataService (helper thuần tier-cost.ts đã test riêng):
 *   - createTier/updateTier: tách paper_cost + ink_cost → price_per_sheet = tổng; đường cũ
 *     (chỉ gửi price_per_sheet) không bị phá.
 *   - syncCostFromMaterial: set paper_cost = materials.cost_price, cập nhật tổng + cost_synced_at,
 *     BỎ QUA khi cost_price <= 0 (không zero-hoá tier), lọc theo materialId.
 *   - findAllTiers: cột phái sinh cost_drift qua JOIN materials.cost_price.
 *
 * Run: npx jest --testPathPattern=tier-cost-sync.integration.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MasterDataService } from '../services/master-data.service';
import { Material, PaperSize, PricingTier, PrintType, Unit, LargeFormatPricing } from '../../../entities';
import { Printer } from '../entities/printers.entity';

// createQueryBuilder mặc định: chainable, getMany trả [] (checkTierOverlap không thấy trùng).
// findAllTiers tests tự override để trả getRawAndEntities.
const chainableQb = () => ({
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
});

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn((entity) => Promise.resolve({ ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => chainableQb()),
    manager: { query: jest.fn().mockResolvedValue([]) },
});

describe('Tầng 2: giá vốn → định mức (service, mocked repos)', () => {
    let service: MasterDataService;
    let tierRepo: ReturnType<typeof createMockRepo>;
    let materialRepo: ReturnType<typeof createMockRepo>;
    let printerRepo: ReturnType<typeof createMockRepo>;
    let paperRepo: ReturnType<typeof createMockRepo>;
    let lfRepo: ReturnType<typeof createMockRepo>;

    beforeEach(async () => {
        tierRepo = createMockRepo();
        materialRepo = createMockRepo();
        printerRepo = createMockRepo();
        paperRepo = createMockRepo();
        lfRepo = createMockRepo();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MasterDataService,
                { provide: getRepositoryToken(PaperSize), useValue: paperRepo },
                { provide: getRepositoryToken(PricingTier), useValue: tierRepo },
                { provide: getRepositoryToken(PrintType), useValue: createMockRepo() },
                { provide: getRepositoryToken(Unit), useValue: createMockRepo() },
                { provide: getRepositoryToken(Printer), useValue: printerRepo },
                { provide: getRepositoryToken(LargeFormatPricing), useValue: lfRepo },
                { provide: getRepositoryToken(Material), useValue: materialRepo },
            ],
        }).compile();
        service = module.get<MasterDataService>(MasterDataService);
    });

    describe('createTier — tách paper/ink', () => {
        it('gửi paperCost + inkCost → price_per_sheet = tổng', async () => {
            await service.createTier({ materialId: 1, paperSizeId: 2, paperCost: 3000, inkCost: 800 } as any);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.paperCost).toBe(3000);
            expect(saved.inkCost).toBe(800);
            expect(saved.pricePerSheet).toBe(3800);
        });

        it('chỉ gửi paperCost (ink thiếu) → ink coi như 0, tổng = paper', async () => {
            await service.createTier({ materialId: 1, paperSizeId: 2, paperCost: 2500 } as any);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.pricePerSheet).toBe(2500);
            expect(saved.inkCost).toBe(0);
        });

        it('đường cũ: chỉ gửi pricePerSheet (không paper/ink) → giữ nguyên, không phá', async () => {
            await service.createTier({ materialId: 1, paperSizeId: 2, pricePerSheet: 1234 } as any);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.pricePerSheet).toBe(1234);
        });
    });

    describe('updateTier — tách paper/ink với bản ghi cũ', () => {
        it('gửi inkCost mới, paperCost lấy từ existing → tổng đúng', async () => {
            tierRepo.findOne.mockResolvedValue({ id: 5, materialId: 1, paperSizeId: 2, paperCost: 3000, inkCost: 500, printSide: 'single', printType: '4c', technology: 'digital_toner' });
            await service.updateTier('5', { inkCost: 900 } as any);
            const patch = tierRepo.update.mock.calls[0][1];
            expect(patch.paperCost).toBe(3000); // giữ từ existing
            expect(patch.inkCost).toBe(900);
            expect(patch.pricePerSheet).toBe(3900);
        });
    });

    describe('syncCostFromMaterial', () => {
        it('cost_price > 0 → set paper_cost = cost_price, tổng = paper + ink, ghi cost_synced_at', async () => {
            tierRepo.find.mockResolvedValue([{ id: 5, materialId: 1, paperCost: 2000, inkCost: 700, pricePerSheet: 2700 }]);
            materialRepo.find.mockResolvedValue([{ id: 1, costPrice: 3200 }]);

            const res = await service.syncCostFromMaterial('1');

            expect(res.synced).toBe(1);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.paperCost).toBe(3200);
            expect(saved.pricePerSheet).toBe(3900); // 3200 + 700 (ink giữ nguyên)
            expect(saved.costSyncedAt).toBeInstanceOf(Date);
        });

        it('cost_price <= 0 → BỎ QUA, không ghi (không zero-hoá tier)', async () => {
            tierRepo.find.mockResolvedValue([{ id: 5, materialId: 1, paperCost: 2000, inkCost: 700 }]);
            materialRepo.find.mockResolvedValue([{ id: 1, costPrice: 0 }]);

            const res = await service.syncCostFromMaterial('1');

            expect(res.synced).toBe(0);
            expect(tierRepo.save).not.toHaveBeenCalled();
        });

        it('material không tìm thấy → bỏ qua tier đó', async () => {
            tierRepo.find.mockResolvedValue([{ id: 5, materialId: 99, paperCost: 2000, inkCost: 0 }]);
            materialRepo.find.mockResolvedValue([]);

            const res = await service.syncCostFromMaterial('99');

            expect(res.synced).toBe(0);
            expect(tierRepo.save).not.toHaveBeenCalled();
        });

        it('nhiều tier: chỉ đồng bộ tier có cost hợp lệ', async () => {
            tierRepo.find.mockResolvedValue([
                { id: 5, materialId: 1, paperCost: 2000, inkCost: 500 },
                { id: 6, materialId: 2, paperCost: 1000, inkCost: 300 },
            ]);
            materialRepo.find.mockResolvedValue([
                { id: 1, costPrice: 3000 },
                { id: 2, costPrice: 0 }, // cost 0 → bỏ
            ]);

            const res = await service.syncCostFromMaterial();

            expect(res.synced).toBe(1);
            expect(tierRepo.save).toHaveBeenCalledTimes(1);
        });
    });

    describe('findAllTiers — cost_drift qua JOIN', () => {
        const mockQb = (entities: any[], raw: any[]) => ({
            leftJoin: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
        });

        it('paper_cost khác cost_price hiện tại → cost_drift = true', async () => {
            tierRepo.createQueryBuilder.mockReturnValue(
                mockQb([{ id: 5, materialId: 1, paperCost: 2000 }], [{ current_cost_price: 3200 }]) as any,
            );
            const res: any = await service.findAllTiers();
            expect(res[0].cost_drift).toBe(true);
            expect(res[0].current_cost_price).toBe(3200);
        });

        it('paper_cost == cost_price → cost_drift = false', async () => {
            tierRepo.createQueryBuilder.mockReturnValue(
                mockQb([{ id: 5, materialId: 1, paperCost: 3200 }], [{ current_cost_price: 3200 }]) as any,
            );
            const res: any = await service.findAllTiers();
            expect(res[0].cost_drift).toBe(false);
        });

        it('cost_price null (vật tư không còn) → cost_drift = false', async () => {
            tierRepo.createQueryBuilder.mockReturnValue(
                mockQb([{ id: 5, materialId: 1, paperCost: 2000 }], [{ current_cost_price: null }]) as any,
            );
            const res: any = await service.findAllTiers();
            expect(res[0].cost_drift).toBe(false);
        });
    });

    // ── Tầng 3: 5 thành phần + gợi ý per-máy ──

    describe('createTier — 5 thành phần (giá vốn thuần)', () => {
        it('gửi đủ 5 thành phần → price_per_sheet = tổng, KHÔNG markup', async () => {
            await service.createTier({
                materialId: 1, paperSizeId: 2,
                paperCost: 300, inkCost: 250, machineCost: 250, laborCost: 360, overheadCost: 300,
            } as any);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.pricePerSheet).toBe(1460); // 300+250+250+360+300, cộng thô — không nhân %
            expect(saved.machineCost).toBe(250);
            expect(saved.laborCost).toBe(360);
            expect(saved.overheadCost).toBe(300);
        });

        it('gửi một phần (machine thiếu) → coi như 0, tổng đúng', async () => {
            await service.createTier({
                materialId: 1, paperSizeId: 2, paperCost: 300, inkCost: 200,
            } as any);
            const saved = tierRepo.save.mock.calls[0][0];
            expect(saved.pricePerSheet).toBe(500); // 300+200, machine/labor/overhead = 0
            expect(saved.machineCost).toBe(0);
        });
    });

    describe('updateTier — 5 thành phần với existing', () => {
        it('gửi machineCost mới, phần khác giữ từ existing → tổng đúng', async () => {
            tierRepo.findOne.mockResolvedValue({
                id: 5, materialId: 1, paperSizeId: 2, printSide: 'single', printType: '4c', technology: 'digital_toner',
                paperCost: 300, inkCost: 250, machineCost: 100, laborCost: 360, overheadCost: 300,
            });
            await service.updateTier('5', { machineCost: 250 } as any);
            const patch = tierRepo.update.mock.calls[0][1];
            expect(patch.machineCost).toBe(250); // mới
            expect(patch.laborCost).toBe(360);   // giữ từ existing
            expect(patch.pricePerSheet).toBe(1460); // 300+250+250+360+300
        });
    });

    describe('suggestTierCost — gợi ý breakdown, KHÔNG ghi DB', () => {
        it('đọc cost_price + ink + printer → breakdown 5 thành phần', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, costPrice: 300 });
            // ink_costs qua raw SQL manager.query
            materialRepo.manager = { query: jest.fn().mockResolvedValue([{ ml_per_sheet: 0.5, price_per_ml: 500 }]) } as any;
            printerRepo.findOne.mockResolvedValue({
                id: 9, machineValue: 1_200_000_000, depreciationYears: 5, sheetsPerMonth: 100_000,
                electricityPerHour: 50_000, sheetsPerHour: 1_000, staffCount: 3, avgSalaryMonthly: 12_000_000,
                rentMonthly: 20_000_000, utilitiesMonthly: 5_000_000, otherMonthly: 5_000_000,
            });
            paperRepo.findOne.mockResolvedValue({ id: 2, name: 'A4' });

            const res: any = await service.suggestTierCost({ material_id: 1, printer_id: 9, print_type: '4c', sides: 1, paper_size_id: 2 });

            // giấy 300; mực 0.5×500×0.5(A4)×1 = 125; máy 250; công 360; overhead 300
            expect(res.breakdown.paperCost).toBeCloseTo(300, 6);
            expect(res.breakdown.inkCost).toBeCloseTo(125, 6);
            expect(res.breakdown.machineCost).toBeCloseTo(250, 6);
            expect(res.breakdown.laborCost).toBeCloseTo(360, 6);
            expect(res.breakdown.overheadCost).toBeCloseTo(300, 6);
            expect(res.breakdown.total).toBeCloseTo(1335, 6);
            // KHÔNG ghi DB.
            expect(tierRepo.save).not.toHaveBeenCalled();
        });

        it('không chọn máy → máy/công/overhead = 0, chỉ giấy + mực', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, costPrice: 300 });
            materialRepo.manager = { query: jest.fn().mockResolvedValue([]) } as any;

            const res: any = await service.suggestTierCost({ material_id: 1, sides: 1 });

            expect(res.breakdown.machineCost).toBe(0);
            expect(res.breakdown.inkCost).toBe(0); // không print_type → không tra ink
            expect(res.breakdown.total).toBeCloseTo(300, 6);
        });

        it('vật tư không tồn tại → ném lỗi', async () => {
            materialRepo.findOne.mockResolvedValue(null);
            await expect(service.suggestTierCost({ material_id: 999 })).rejects.toThrow();
        });
    });

    // ── Tầng 3 khổ lớn: 4 thành phần/m² + gợi ý per-máy (cost_basis='sqm') ──

    describe('createLargeFormatTier — 4 thành phần (giá vốn thuần/m²)', () => {
        it('gửi đủ 4 thành phần → price_per_sqm = tổng, KHÔNG markup', async () => {
            await service.createLargeFormatTier({
                materialId: 1, areaFrom: 0, areaTo: 999999,
                materialCost: 50000, machineCost: 8000, laborCost: 6000, overheadCost: 4000,
            } as any);
            const saved = lfRepo.save.mock.calls[0][0];
            expect(saved.pricePerSqm).toBe(68000); // 50000+8000+6000+4000, cộng thô
            expect(saved.machineCost).toBe(8000);
        });

        it('đường cũ: chỉ gửi pricePerSqm (không thành phần) → giữ nguyên, không phá', async () => {
            await service.createLargeFormatTier({ materialId: 1, areaFrom: 0, pricePerSqm: 75000 } as any);
            const saved = lfRepo.save.mock.calls[0][0];
            expect(saved.pricePerSqm).toBe(75000);
        });
    });

    describe('suggestLargeFormatCost — gợi ý breakdown/m², KHÔNG ghi DB', () => {
        it('đọc cost_price + printer (cost_basis sqm) → breakdown 4 thành phần', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, costPrice: 50000 });
            printerRepo.findOne.mockResolvedValue({
                id: 9, machineValue: 1_200_000_000, depreciationYears: 5,
                electricityPerHour: 40_000, staffCount: 2, avgSalaryMonthly: 12_000_000,
                rentMonthly: 20_000_000, utilitiesMonthly: 5_000_000, otherMonthly: 5_000_000,
                sqmPerMonth: 10_000, sqmPerHour: 50, costBasis: 'sqm',
            });

            const res: any = await service.suggestLargeFormatCost({ material_id: 1, printer_id: 9 });

            // vật liệu 50000; máy = 1.2tỷ/60/10000 + 40000/50 = 2000 + 800 = 2800;
            // công = (2×12tr)/10000 = 2400; overhead = 30tr/10000 = 3000
            expect(res.breakdown.materialCost).toBeCloseTo(50000, 6);
            expect(res.breakdown.machineCost).toBeCloseTo(2800, 6);
            expect(res.breakdown.laborCost).toBeCloseTo(2400, 6);
            expect(res.breakdown.overheadCost).toBeCloseTo(3000, 6);
            expect(res.breakdown.total).toBeCloseTo(58200, 6);
            expect(lfRepo.save).not.toHaveBeenCalled();
        });

        it('không chọn máy → chỉ vật liệu, máy/công/overhead = 0', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, costPrice: 50000 });
            const res: any = await service.suggestLargeFormatCost({ material_id: 1 });
            expect(res.breakdown.machineCost).toBe(0);
            expect(res.breakdown.total).toBeCloseTo(50000, 6);
        });

        it('vật tư không tồn tại → ném lỗi', async () => {
            materialRepo.findOne.mockResolvedValue(null);
            await expect(service.suggestLargeFormatCost({ material_id: 999 })).rejects.toThrow();
        });
    });

    describe('findAllLargeFormatTiers — cột phái sinh current_cost_price qua JOIN materials', () => {
        const mockQb = (entities: any[], raw: any[]) => ({
            leftJoin: jest.fn().mockReturnThis(),
            addSelect: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawAndEntities: jest.fn().mockResolvedValue({ entities, raw }),
        });

        it('gắn current_cost_price từ raw JOIN vào mỗi tier', async () => {
            lfRepo.createQueryBuilder.mockReturnValue(
                mockQb(
                    [{ id: 1, materialId: 5, pricePerSqm: 60000 }],
                    [{ current_cost_price: 52000 }],
                ) as any,
            );
            const res: any = await service.findAllLargeFormatTiers();
            expect(res[0].current_cost_price).toBe(52000);
            expect(res[0].pricePerSqm).toBe(60000);
        });

        it('cost_price null (vật tư không còn) → current_cost_price = null', async () => {
            lfRepo.createQueryBuilder.mockReturnValue(
                mockQb([{ id: 1, materialId: 5 }], [{ current_cost_price: null }]) as any,
            );
            const res: any = await service.findAllLargeFormatTiers();
            expect(res[0].current_cost_price).toBeNull();
        });
    });

    describe('checkTierOverlap — chặn tạo tier trùng khoảng số lượng (qua createTier)', () => {
        // checkTierOverlap là private, chạy trong createTier. Mock createQueryBuilder.getMany
        // trả tier ĐÃ CÓ khoảng 1-100; tier mới 50-200 chồng lấn → phải ném lỗi.
        it('khoảng SL chồng lấn tier đã có → ném BadRequestException', async () => {
            tierRepo.createQueryBuilder.mockReturnValue({
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([{ id: 7, quantityFrom: 1, quantityTo: 100 }]),
            } as any);
            await expect(
                service.createTier({ materialId: 1, paperSizeId: 2, quantityFrom: 50, quantityTo: 200 } as any),
            ).rejects.toThrow(/trùng/);
            expect(tierRepo.save).not.toHaveBeenCalled(); // không lưu khi trùng
        });

        it('khoảng SL KHÔNG chồng (tier cũ 1-100, mới 101-200) → tạo bình thường', async () => {
            tierRepo.createQueryBuilder.mockReturnValue({
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([{ id: 7, quantityFrom: 1, quantityTo: 100 }]),
            } as any);
            await service.createTier({ materialId: 1, paperSizeId: 2, quantityFrom: 101, quantityTo: 200 } as any);
            expect(tierRepo.save).toHaveBeenCalled();
        });
    });
});
