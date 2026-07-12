/**
 * ProductsService — Integration Test cho validate lưu sản phẩm theo Phạm_Vi (mocked TypeORM)
 *
 * Khẳng định luồng lưu sản phẩm (createProduct/updateProduct → applyQuoteConfig →
 * validateAllowedScopes) tuân theo Quy_Tắc_Phạm_Vi (nguồn sự thật duy nhất):
 *   - Danh_Sách_Được_Phép sạch (chỉ tài nguyên trong phạm vi) → lưu thành công (repo.save được gọi).
 *   - Danh_Sách_Được_Phép có phần tử ngoài phạm vi (vd Tài_Nguyên_Chỉ_Offset trong luồng `loose`)
 *     → ném UnprocessableEntityException (422) kèm danh sách `outOfScope`, KHÔNG persist (repo.save
 *     KHÔNG được gọi).
 *
 * _Validates: Requirements 4.4, 4.5_
 *
 * Run: npx jest --testPathPattern=products.service.scope-validation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import {
    Product,
    ProductCategory,
    UnifiedProduct,
    UnifiedProductCategory,
} from '../../../entities';

// ─────────────────────────────────────────────────────────────────────────────
// Dữ liệu Cờ_Phạm_Vi giả lập cho ba nhóm Tài_Nguyên_Dùng_Chung.
// Đối với luồng `loose`:
//   - id IN_SCOPE_*  → scope_loose Bật  → TRONG phạm vi
//   - id OFFSET_ONLY → scope_offset Bật, mọi cờ in nhanh Tắt → Tài_Nguyên_Chỉ_Offset → NGOÀI phạm vi
// ─────────────────────────────────────────────────────────────────────────────

type ScopeRow = {
    id: number;
    name: string;
    scope_loose: number | boolean;
    scope_bound: number | boolean;
    scope_large_format: number | boolean;
    scope_offset: boolean;
};

const SCOPE_ROWS: Record<string, Record<number, ScopeRow>> = {
    processing_options: {
        // Trong phạm vi loose
        2: { id: 2, name: 'Cán màng', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false },
        // Tài_Nguyên_Chỉ_Offset → ngoài phạm vi loose
        39: { id: 39, name: 'BẾ', scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
        40: { id: 40, name: 'ÉP KIM', scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
    },
    materials: {
        100: { id: 100, name: 'Couche 150', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false },
        199: { id: 199, name: 'Giấy offset only', scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
    },
    paper_sizes: {
        300: { id: 300, name: 'A4', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false },
        399: { id: 399, name: 'Khổ offset only', scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
    },
};

// ─── Mock helpers ───

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ ...data })),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

/**
 * dataSource.query giả lập: phục vụ cả
 *   - validateAllowedScopes: SELECT id, name, scope_* FROM <table> WHERE id = ANY($1)
 *   - cleanOrphanIds:        SELECT id FROM <table> WHERE id = ANY($1)
 * Trả về các hàng tương ứng với id được hỏi (lọc bỏ id không tồn tại để mô phỏng orphan).
 */
const createMockDataSource = () => ({
    query: jest.fn((sql: string, params?: unknown[]) => {
        const tableMatch = /FROM\s+(\w+)/i.exec(sql);
        const table = tableMatch?.[1] ?? '';
        const rowsForTable = SCOPE_ROWS[table] ?? {};
        const ids: number[] = Array.isArray(params?.[0]) ? (params![0] as number[]) : [];
        const rows = ids.map((id) => rowsForTable[Number(id)]).filter(Boolean);
        return Promise.resolve(rows);
    }),
});

describe('ProductsService — validate lưu sản phẩm theo Phạm_Vi (Req 4.4, 4.5)', () => {
    let service: ProductsService;
    let productRepo: ReturnType<typeof createMockRepo>;
    let catRepo: ReturnType<typeof createMockRepo>;
    let tmplRepo: ReturnType<typeof createMockRepo>;
    let tmplCatRepo: ReturnType<typeof createMockRepo>;
    let dataSource: ReturnType<typeof createMockDataSource>;

    beforeEach(async () => {
        productRepo = createMockRepo();
        catRepo = createMockRepo();
        tmplRepo = createMockRepo();
        tmplCatRepo = createMockRepo();
        dataSource = createMockDataSource();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsService,
                { provide: getRepositoryToken(Product), useValue: productRepo },
                { provide: getRepositoryToken(ProductCategory), useValue: catRepo },
                { provide: getRepositoryToken(UnifiedProduct), useValue: tmplRepo },
                { provide: getRepositoryToken(UnifiedProductCategory), useValue: tmplCatRepo },
                { provide: getDataSourceToken(), useValue: dataSource },
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
    });

    // ================================================================
    // createProduct — clean allowed list
    // ================================================================

    describe('createProduct — Danh_Sách_Được_Phép sạch', () => {
        it('lưu thành công khi allowed_* chỉ chứa tài nguyên trong phạm vi loose', async () => {
            const result = await service.createProduct({
                code: 'TEST-OK',
                name_vi: 'Sản phẩm hợp lệ',
                quote_type: 'loose',
                quote_config: {
                    allowed_processing: [2],
                    allowed_materials: [100],
                    allowed_paper_sizes: [300],
                },
            });

            // repo.save ĐƯỢC gọi → đã persist
            expect(tmplRepo.save).toHaveBeenCalledTimes(1);
            expect(result).toMatchObject({ id: 1, code: 'TEST-OK' });

            // Allowed lists được giữ lại (tất cả hợp lệ, không bị cleanOrphan loại)
            const saved = tmplRepo.save.mock.calls[0][0];
            expect(saved.allowedProcessing).toEqual([2]);
            expect(saved.allowedMaterials).toEqual([100]);
            expect(saved.allowedPaperSizes).toEqual([300]);
        });
    });

    // ================================================================
    // createProduct — out-of-scope allowed list → 422, no save
    // ================================================================

    describe('createProduct — Danh_Sách_Được_Phép có phần tử ngoài phạm vi', () => {
        it('ném 422 với danh sách outOfScope và KHÔNG persist khi allowed_processing chứa Tài_Nguyên_Chỉ_Offset', async () => {
            const call = service.createProduct({
                code: 'TEST-BAD',
                name_vi: 'Sản phẩm vi phạm',
                quote_type: 'loose',
                quote_config: {
                    // 2 hợp lệ; 39, 40 là chỉ-offset → ngoài phạm vi loose
                    allowed_processing: [2, 39, 40],
                },
            });

            await expect(call).rejects.toBeInstanceOf(UnprocessableEntityException);

            // KHÔNG persist khi có vi phạm
            expect(tmplRepo.save).not.toHaveBeenCalled();

            // Kiểm tra payload lỗi nêu đích danh tài nguyên vi phạm
            try {
                await service.createProduct({
                    code: 'TEST-BAD',
                    name_vi: 'Sản phẩm vi phạm',
                    quote_type: 'loose',
                    quote_config: { allowed_processing: [2, 39, 40] },
                });
            } catch (err) {
                const response = (err as UnprocessableEntityException).getResponse() as any;
                expect(response.success).toBe(false);
                expect(response.quote_type).toBe('loose');
                const procViolation = response.details.find((d: any) => d.table === 'processing_options');
                expect(procViolation).toBeDefined();
                const violatingIds = procViolation.items.map((i: any) => i.id).sort();
                expect(violatingIds).toEqual([39, 40]);
                // tài nguyên hợp lệ (2) KHÔNG nằm trong danh sách vi phạm
                expect(violatingIds).not.toContain(2);
            }
        });

        it('phát hiện vi phạm xuyên suốt cả ba nhóm (Gia_Công, Vật_Tư, Khổ_Giấy)', async () => {
            const call = service.createProduct({
                code: 'TEST-BAD-ALL',
                name_vi: 'Vi phạm cả ba nhóm',
                quote_type: 'loose',
                quote_config: {
                    allowed_processing: [39],
                    allowed_materials: [199],
                    allowed_paper_sizes: [399],
                },
            });

            await expect(call).rejects.toBeInstanceOf(UnprocessableEntityException);
            expect(tmplRepo.save).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // updateProduct — same validation path
    // ================================================================

    describe('updateProduct — áp dụng cùng Quy_Tắc_Phạm_Vi', () => {
        it('ném 422 và KHÔNG persist khi cập nhật allowed_* ngoài phạm vi', async () => {
            tmplRepo.findOne.mockResolvedValue({
                id: 7,
                quoteType: 'loose',
                formConfig: null,
            } as unknown as UnifiedProduct);

            const call = service.updateProduct('7', {
                quote_config: { allowed_processing: [39] },
            });

            await expect(call).rejects.toBeInstanceOf(UnprocessableEntityException);
            expect(tmplRepo.save).not.toHaveBeenCalled();
        });

        it('lưu thành công khi cập nhật allowed_* hợp lệ', async () => {
            tmplRepo.findOne.mockResolvedValue({
                id: 7,
                quoteType: 'loose',
                formConfig: null,
            } as unknown as UnifiedProduct);

            await service.updateProduct('7', {
                quote_config: { allowed_processing: [2] },
            });

            expect(tmplRepo.save).toHaveBeenCalledTimes(1);
        });
    });
});
