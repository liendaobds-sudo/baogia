/**
 * Tầng 1 — Nhập kho theo lô → cost_price sống: test đường DB (mocked queryRunner).
 *
 * Kiểm phần CHẠM DỮ LIỆU của MaterialsService.createInventorySlip (helper thuần cost-helpers.ts
 * đã test riêng):
 *   - Nhập lô ram: baseQty = purchase_qty × factor; cost_price bình quân gia quyền.
 *   - Nhập 2 lô giá khác nhau: cost_price = bình quân đúng theo tồn.
 *   - Nhập KHÔNG giá (unit_cost_base rỗng): cost_price giữ nguyên, chỉ cộng tồn.
 *   - Quy đổi kg → tờ (từ gsm + khổ), rồi bình quân.
 *   - Xuất kho: không đụng cost_price; thiếu tồn → ném lỗi.
 *
 * Run: npx jest --testPathPattern=inventory-cost.integration.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';

import { MaterialsService } from '../services/materials.service';
import { Material, MaterialType, InventorySlip, InventorySlipItem } from '../../../entities';
import { MaterialCategory } from '../entities/material-categories.entity';
import { ProcessingOption } from '../entities/processing-options.entity';
import { ProcessingPricing } from '../../../entities/processing-pricing.entity';

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn((entity) => Promise.resolve({ ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
});

/**
 * QueryRunner giả: manager.findOne trả `material` (cùng object xuyên suốt để đọc lại cost/stock
 * đã ghi); create trả nguyên data; save ghi id cho slip. `savedMaterials` gom material sau mỗi
 * save để assert giá trị cuối. `savedItems` gom dòng phiếu (kiểm quantity đã quy đổi).
 */
function makeDataSource(material: any) {
    const savedItems: any[] = [];
    let slipId = 100;
    const manager = {
        create: jest.fn((_entity: any, data: any) => ({ ...data })),
        save: jest.fn((entity: any) => {
            // slip (có `type`) → gán id; slipItem (có material_id) → gom; material → no-op (mutate tại chỗ).
            if (entity && entity.type && entity.items === undefined && entity.material_id === undefined && !('stock' in entity)) {
                return Promise.resolve({ ...entity, id: ++slipId });
            }
            if (entity && entity.material_id !== undefined && entity.quantity !== undefined) {
                savedItems.push(entity);
                return Promise.resolve({ ...entity, id: 1 });
            }
            return Promise.resolve(entity);
        }),
        findOne: jest.fn((_entity: any, _opts: any) => Promise.resolve(material)),
    };
    const queryRunner = {
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([]),
        manager,
    };
    const dataSource = {
        createQueryRunner: jest.fn(() => queryRunner),
        query: jest.fn().mockResolvedValue([]),
        getRepository: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
    };
    return { dataSource, queryRunner, manager, savedItems };
}

async function buildService(dataSource: any): Promise<MaterialsService> {
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            MaterialsService,
            { provide: getRepositoryToken(Material), useValue: createMockRepo() },
            { provide: getRepositoryToken(MaterialType), useValue: createMockRepo() },
            { provide: getRepositoryToken(MaterialCategory), useValue: createMockRepo() },
            { provide: getRepositoryToken(ProcessingOption), useValue: createMockRepo() },
            { provide: getRepositoryToken(ProcessingPricing), useValue: createMockRepo() },
            { provide: getDataSourceToken(), useValue: dataSource },
        ],
    }).compile();
    return module.get<MaterialsService>(MaterialsService);
}

describe('Tầng 1: nhập kho → cost_price (service, mocked queryRunner)', () => {
    it('nhập lô RAM: baseQty = purchase_qty × 500, cost_price bình quân từ tồn cũ', async () => {
        // Giấy sheet, tồn cũ 1000 tờ @ cost 2000đ/tờ. Nhập 2 ram (1000 tờ) giá 3.000.000đ/ram.
        // unit_cost_base = 3.000.000 / 500 = 6000đ/tờ. Bình quân = (2000×1000 + 6000×1000)/2000 = 4000.
        const material = { id: 1, name: 'Couche', materialFormat: 'sheet', stock: 1000, costPrice: 2000 };
        const { dataSource, savedItems } = makeDataSource(material);
        const service = await buildService(dataSource);

        const res = await service.createInventorySlip({
            type: 'import',
            items: [{ material_id: 1, purchase_unit: 'ram', purchase_qty: 2, purchase_price: 3_000_000 }],
        });

        expect(res.success).toBe(true);
        expect(savedItems[0].quantity).toBe(1000); // 2 × 500
        expect(savedItems[0].conversion_factor).toBe(500);
        expect(savedItems[0].unit_cost_base).toBe(6000);
        expect(material.stock).toBe(2000); // 1000 + 1000
        expect(material.costPrice).toBe(4000); // bình quân
    });

    it('tồn cũ = 0 → cost_price = giá lô (không có gì để bình quân)', async () => {
        const material = { id: 1, name: 'Couche', materialFormat: 'sheet', stock: 0, costPrice: 0 };
        const { dataSource } = makeDataSource(material);
        const service = await buildService(dataSource);

        await service.createInventorySlip({
            type: 'import',
            items: [{ material_id: 1, purchase_unit: 'ram', purchase_qty: 1, purchase_price: 2_500_000 }],
        });

        expect(material.costPrice).toBe(5000); // 2.500.000 / 500
        expect(material.stock).toBe(500);
    });

    it('nhập KHÔNG giá (chỉ số lượng) → cost_price giữ nguyên, chỉ cộng tồn', async () => {
        const material = { id: 1, name: 'Couche', materialFormat: 'sheet', stock: 500, costPrice: 3000 };
        const { dataSource } = makeDataSource(material);
        const service = await buildService(dataSource);

        await service.createInventorySlip({
            type: 'import',
            items: [{ material_id: 1, quantity: 200 }],
        });

        expect(material.costPrice).toBe(3000); // không đổi
        expect(material.stock).toBe(700);
    });

    it('quy đổi KG → tờ (gsm 300, khổ 650×860mm) rồi bình quân', async () => {
        // 1 tờ = 300 × 0.65 × 0.86 / 1000 = 0.16770 kg → factor = 1/0.16770 ≈ 5.9631 tờ/kg.
        // Nhập 100 kg giá 30.000đ/kg. baseQty ≈ 596.31 tờ. unit_cost_base = 30000 × 0.16770 = 5031đ/tờ.
        const material = { id: 1, name: 'Couche 300', materialFormat: 'sheet', gsm: 300, width: 650, height: 860, stock: 0, costPrice: 0 };
        const { dataSource, savedItems } = makeDataSource(material);
        const service = await buildService(dataSource);

        await service.createInventorySlip({
            type: 'import',
            items: [{ material_id: 1, purchase_unit: 'kg', purchase_qty: 100, purchase_price: 30_000 }],
        });

        // baseQty ≈ 596.3 tờ (kiểm tương đối).
        expect(savedItems[0].quantity).toBeCloseTo(596.3, 0);
        // cost_price ≈ 5031đ/tờ (30000 × khối lượng 1 tờ).
        expect(material.costPrice).toBeCloseTo(5031, -1);
    });

    it('xuất kho: KHÔNG đụng cost_price, trừ tồn', async () => {
        const material = { id: 1, name: 'Couche', materialFormat: 'sheet', stock: 1000, costPrice: 3000 };
        const { dataSource } = makeDataSource(material);
        const service = await buildService(dataSource);

        await service.createInventorySlip({
            type: 'export',
            reason: 'Xuất sản xuất',
            items: [{ material_id: 1, quantity: 300 }],
        });

        expect(material.costPrice).toBe(3000); // không đổi
        expect(material.stock).toBe(700);
    });

    it('xuất quá tồn → rollback + trả lỗi', async () => {
        const material = { id: 1, name: 'Couche', materialFormat: 'sheet', stock: 100, costPrice: 3000 };
        const { dataSource, queryRunner } = makeDataSource(material);
        const service = await buildService(dataSource);

        const res = await service.createInventorySlip({
            type: 'export',
            items: [{ material_id: 1, quantity: 500 }],
        });

        expect(res.success).toBe(false);
        expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
});
