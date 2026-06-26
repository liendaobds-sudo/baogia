/**
 * MaterialsService — Integration Tests (mocked TypeORM)
 *
 * Tests CRUD operations, validation logic, duplicate checks, and stock adjustments.
 * Run: npx jest --testPathPattern=materials.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { MaterialsService } from '../services/materials.service';
import { Material, MaterialType } from '../../../entities';
import { MaterialCategory } from '../entities/material-categories.entity';
import { ProcessingOption } from '../entities/processing-options.entity';
import { ProcessingPricing } from '../../../entities/processing-pricing.entity';

// ─── Mock helpers ───

const mockQueryBuilder = () => {
    const qb: any = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getRawMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue(null),
        getOne: jest.fn().mockResolvedValue(null),
    };
    return qb;
};

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 1, ...data })),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder()),
});

const createMockDataSource = () => ({
    query: jest.fn().mockResolvedValue([]),
    createQueryRunner: jest.fn().mockReturnValue({
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        query: jest.fn(),
        manager: {
            create: jest.fn((_, data) => data),
            save: jest.fn((data) => Promise.resolve({ id: 99, ...data })),
            findOne: jest.fn().mockResolvedValue(null),
            remove: jest.fn(),
        },
    }),
    getRepository: jest.fn().mockReturnValue({
        count: jest.fn().mockResolvedValue(0),
    }),
});

describe('MaterialsService', () => {
    let service: MaterialsService;
    let materialRepo: ReturnType<typeof createMockRepo>;
    let typeRepo: ReturnType<typeof createMockRepo>;
    let catRepo: ReturnType<typeof createMockRepo>;
    let optRepo: ReturnType<typeof createMockRepo>;
    let ppRepo: ReturnType<typeof createMockRepo>;
    let dataSource: ReturnType<typeof createMockDataSource>;

    beforeEach(async () => {
        materialRepo = createMockRepo();
        typeRepo = createMockRepo();
        catRepo = createMockRepo();
        optRepo = createMockRepo();
        ppRepo = createMockRepo();
        dataSource = createMockDataSource();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                MaterialsService,
                { provide: getRepositoryToken(Material), useValue: materialRepo },
                { provide: getRepositoryToken(MaterialType), useValue: typeRepo },
                { provide: getRepositoryToken(MaterialCategory), useValue: catRepo },
                { provide: getRepositoryToken(ProcessingOption), useValue: optRepo },
                { provide: getRepositoryToken(ProcessingPricing), useValue: ppRepo },
                { provide: getDataSourceToken(), useValue: dataSource },
            ],
        }).compile();

        service = module.get<MaterialsService>(MaterialsService);
    });

    // ================================================================
    // CREATE
    // ================================================================

    describe('createMaterial', () => {
        it('should throw if name is missing', async () => {
            await expect(service.createMaterial({ name: '' })).rejects.toThrow('Name is required');
        });

        it('should throw if stock is negative', async () => {
            await expect(service.createMaterial({ name: 'Test', stock: -1 })).rejects.toThrow('Tồn kho không được âm');
        });

        it('should auto-generate code if not provided', async () => {
            materialRepo.findOne.mockResolvedValue(null); // no dup code
            const qb = mockQueryBuilder();
            qb.getOne.mockResolvedValue(null); // no dup name
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.createMaterial({ name: 'Giấy Couché 200gsm' });
            expect(result).toBeDefined();
            expect(materialRepo.create).toHaveBeenCalled();
            expect(materialRepo.save).toHaveBeenCalled();
        });

        it('should throw if code already exists', async () => {
            materialRepo.findOne.mockResolvedValueOnce({ id: 5, code: 'DUPE' });
            await expect(service.createMaterial({ name: 'Test', code: 'DUPE' })).rejects.toThrow('Material code already exists');
        });

        it('should throw if name already exists', async () => {
            materialRepo.findOne.mockResolvedValueOnce(null); // code OK
            const qb = mockQueryBuilder();
            qb.getOne.mockResolvedValue({ id: 5, name: 'existing' }); // name dup
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            await expect(service.createMaterial({ name: 'existing' })).rejects.toThrow('Material name already exists');
        });

        it('should set stock on create (stock_quantity is not a real column)', async () => {
            materialRepo.findOne.mockResolvedValue(null);
            const qb = mockQueryBuilder();
            qb.getOne.mockResolvedValue(null);
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            await service.createMaterial({ name: 'Test', stock: 100 });
            const createCall = materialRepo.create.mock.calls[0][0];
            expect(createCall.stock).toBe(100);
            // `stock_quantity` không phải cột thật trong bảng materials → không được set.
            expect(createCall.stock_quantity).toBeUndefined();
        });
    });

    // ================================================================
    // UPDATE
    // ================================================================

    describe('updateMaterial', () => {
        it('should throw if material not found', async () => {
            materialRepo.findOne.mockResolvedValue(null);
            await expect(service.updateMaterial('999', { name: 'test' })).rejects.toThrow('Material not found');
        });

        it('should throw if duplicate code', async () => {
            materialRepo.findOne
                .mockResolvedValueOnce({ id: 1, code: 'OLD', name: 'Material 1' }) // exists
                .mockResolvedValueOnce({ id: 2, code: 'DUPE' }); // dup

            await expect(service.updateMaterial('1', { code: 'DUPE' })).rejects.toThrow('Material code already exists');
        });

        it('should apply stock_adjustment delta', async () => {
            const existing = { id: 1, code: 'M1', name: 'Test', stock: '50' };
            materialRepo.findOne.mockResolvedValue(existing);

            await service.updateMaterial('1', { stock_adjustment: 25 } as any);
            expect(materialRepo.save).toHaveBeenCalled();
            const saved = materialRepo.save.mock.calls[0][0];
            expect(parseFloat(saved.stock)).toBe(75);
        });

        it('should not allow stock below 0 with adjustment', async () => {
            const existing = { id: 1, code: 'M1', name: 'Test', stock: '10' };
            materialRepo.findOne.mockResolvedValue(existing);

            await service.updateMaterial('1', { stock_adjustment: -100 } as any);
            const saved = materialRepo.save.mock.calls[0][0];
            expect(parseFloat(saved.stock)).toBe(0); // clamped to 0
        });

        it('should block UoM change when transactions exist', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, code: 'M1', name: 'Test' });
            dataSource.getRepository.mockReturnValue({ count: jest.fn().mockResolvedValue(5) });

            await expect(service.updateMaterial('1', { unit: 'kg' }))
                .rejects.toThrow(/Không thể đổi đơn vị/);
        });
    });

    // ================================================================
    // DELETE
    // ================================================================

    describe('deleteMaterial', () => {
        it('should throw if material not found', async () => {
            materialRepo.findOne.mockResolvedValue(null);
            await expect(service.deleteMaterial('999')).rejects.toThrow('Material not found');
        });

        it('should throw if has dependencies', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, name: 'Test', code: 'M1' });
            dataSource.query.mockResolvedValueOnce([{ cnt: '3' }]); // inventory_slip_items

            await expect(service.deleteMaterial('1')).rejects.toThrow(/Không thể xóa/);
        });

        it('should cascade delete pricing_tiers in transaction', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, name: 'Test', code: 'M1' });
            dataSource.query.mockResolvedValue([{ cnt: '0' }]); // no deps

            const qr = dataSource.createQueryRunner();
            await service.deleteMaterial('1');
            expect(qr.connect).toHaveBeenCalled();
            expect(qr.startTransaction).toHaveBeenCalled();
            expect(qr.commitTransaction).toHaveBeenCalled();
            expect(qr.release).toHaveBeenCalled();
        });
    });

    // ================================================================
    // CHECK CODE / NAME UNIQUENESS
    // ================================================================

    describe('checkCode', () => {
        it('should return false for empty code', async () => {
            const result = await service.checkCode('');
            expect(result.exists).toBe(false);
        });

        it('should return true when code exists', async () => {
            materialRepo.findOne.mockResolvedValue({ id: 1, code: 'M1' });
            const result = await service.checkCode('M1');
            expect(result.exists).toBe(true);
        });
    });

    describe('checkName', () => {
        it('should return false for empty name', async () => {
            const result = await service.checkName('');
            expect(result.exists).toBe(false);
        });

        it('should return existing_code when name exists', async () => {
            const qb = mockQueryBuilder();
            qb.getOne.mockResolvedValue({ id: 1, code: 'M1', name: 'Test' });
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.checkName('Test');
            expect(result.exists).toBe(true);
            expect(result.existing_code).toBe('M1');
        });
    });

    // ================================================================
    // FIND METHODS
    // ================================================================

    describe('findMaterialById', () => {
        it('should return null when not found', async () => {
            const qb = mockQueryBuilder();
            qb.getRawOne.mockResolvedValue(null);
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await service.findMaterialById('999');
            expect(result).toBeNull();
        });
    });

    describe('findLowStock', () => {
        it('should call QueryBuilder with correct WHERE', async () => {
            const qb = mockQueryBuilder();
            materialRepo.createQueryBuilder.mockReturnValue(qb);

            await service.findLowStock();
            expect(qb.where).toHaveBeenCalledWith('m.stock < m.min_stock');
        });
    });

    // ================================================================
    // MATERIAL TYPES (Repository)
    // ================================================================

    describe('findAllTypes', () => {
        it('should call typeRepo.find with correct order', async () => {
            typeRepo.find.mockResolvedValue([{ id: 1, name: 'Paper' }]);
            const result = await service.findAllTypes();
            expect(typeRepo.find).toHaveBeenCalled();
            expect(result).toHaveLength(1);
        });
    });

    describe('findAllCategories', () => {
        // GUARD: material_categories.is_active là smallint trong Postgres.
        // Lọc active PHẢI dùng số 1, KHÔNG dùng boolean true (Postgres ném
        // "invalid input syntax for type smallint: true"). Khóa cứng để tránh tái phát.
        it('should filter active with numeric 1 (not boolean true) on smallint column', async () => {
            catRepo.find.mockResolvedValue([]);
            await service.findAllCategories('1');
            const arg = catRepo.find.mock.calls[0][0];
            expect(arg.where.is_active).toBe(1);
            expect(arg.where.is_active).not.toBe(true);
        });

        it('should not filter is_active when activeOnly is not "1"', async () => {
            catRepo.find.mockResolvedValue([]);
            await service.findAllCategories();
            const arg = catRepo.find.mock.calls[0][0];
            expect(arg.where.is_active).toBeUndefined();
        });
    });

    // ================================================================
    // INVENTORY SLIP (Transaction)
    // ================================================================

    describe('createInventorySlip', () => {
        it('should handle import type and increase stock', async () => {
            const qr = dataSource.createQueryRunner();
            qr.manager.findOne.mockResolvedValue({ id: 1, stock_quantity: '100' });

            const result = await service.createInventorySlip({
                type: 'import',
                items: [{ material_id: 1, quantity: 50 }],
            });

            expect(result.success).toBe(true);
            expect(qr.commitTransaction).toHaveBeenCalled();
        });

        it('should rollback on error', async () => {
            const qr = dataSource.createQueryRunner();
            qr.manager.save.mockRejectedValueOnce(new Error('DB error'));

            const result = await service.createInventorySlip({
                type: 'import',
                items: [{ material_id: 1, quantity: 50 }],
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('DB error');
            expect(qr.rollbackTransaction).toHaveBeenCalled();
        });
    });
});
