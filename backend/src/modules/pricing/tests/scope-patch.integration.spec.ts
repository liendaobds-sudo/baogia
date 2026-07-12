/**
 * PATCH scope — Integration Tests (mocked TypeORM repositories)
 *
 * Kiểm chứng hành vi endpoint PATCH /erp/{resource}/:id/scope ở tầng service
 * (Màn_Quản_Trị_Phạm_Vi) cho cả ba nhóm Tài_Nguyên_Dùng_Chung:
 *   - MaterialsService.updateProcessingOptionScope (processing_options — smallint)
 *   - MaterialsService.updateMaterialScope          (materials — boolean)
 *   - MasterDataService.updatePaperSizeScope        (paper_sizes — boolean)
 *
 * Hai kịch bản cốt lõi cho mỗi nhóm:
 *   1. PATCH với Cờ_Phạm_Vi KHÔNG hợp lệ (vd scope_loose=2)
 *        → ném UnprocessableEntityException (422), repo.save KHÔNG được gọi,
 *          giá trị cũ được giữ nguyên (không ghi DB).
 *   2. PATCH với Cờ_Phạm_Vi hợp lệ
 *        → repo.save được gọi với các cờ đã map đúng kiểu cột,
 *          và lần đọc kế tiếp (findOne sau save) phản ánh giá trị mới,
 *          kết quả trả về gồm tài nguyên đã cập nhật + scopeLabel.
 *
 * Validates: Requirements 1.8, 5.2, 5.3, 5.7, 5.8
 * Run: npx jest --testPathPattern=scope-patch.integration.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnprocessableEntityException } from '@nestjs/common';

import { MaterialsService } from '../services/materials.service';
import { MasterDataService } from '../services/master-data.service';
import { Material, MaterialType, PaperSize, PricingTier, PrintType, Unit, LargeFormatPricing } from '../../../entities';
import { MaterialCategory } from '../entities/material-categories.entity';
import { ProcessingOption } from '../entities/processing-options.entity';
import { ProcessingPricing } from '../../../entities/processing-pricing.entity';
import { Printer } from '../entities/printers.entity';

// ─── Mock helpers ───

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 1, ...data })),
    save: jest.fn((entity) => Promise.resolve({ ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
});

const createMockDataSource = () => ({
    query: jest.fn().mockResolvedValue([]),
    createQueryRunner: jest.fn(),
    getRepository: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
});

describe('PATCH scope (integration, mocked repos)', () => {
    // ════════════════════════════════════════════════════════════════
    // MaterialsService.updateProcessingOptionScope (processing_options — smallint)
    // ════════════════════════════════════════════════════════════════
    describe('MaterialsService.updateProcessingOptionScope', () => {
        let service: MaterialsService;
        let optRepo: ReturnType<typeof createMockRepo>;

        beforeEach(async () => {
            optRepo = createMockRepo();
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MaterialsService,
                    { provide: getRepositoryToken(Material), useValue: createMockRepo() },
                    { provide: getRepositoryToken(MaterialType), useValue: createMockRepo() },
                    { provide: getRepositoryToken(MaterialCategory), useValue: createMockRepo() },
                    { provide: getRepositoryToken(ProcessingOption), useValue: optRepo },
                    { provide: getRepositoryToken(ProcessingPricing), useValue: createMockRepo() },
                    { provide: getDataSourceToken(), useValue: createMockDataSource() },
                ],
            }).compile();
            service = module.get<MaterialsService>(MaterialsService);
        });

        it('invalid flags (scope_loose=2) → 422 and repo.save NOT called (old values kept)', async () => {
            // Giá trị cũ trong DB: chỉ loose đang Bật.
            const existing = { id: 7, code: 'CANMANG', name: 'Cán màng', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false };
            optRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updateProcessingOptionScope('7', { scope_loose: 2 } as any),
            ).rejects.toBeInstanceOf(UnprocessableEntityException);

            // KHÔNG ghi DB → giá trị cũ giữ nguyên (Req 5.8).
            expect(optRepo.save).not.toHaveBeenCalled();
            expect(existing.scope_loose).toBe(1);
        });

        it('invalid offset (scope_offset non-boolean) → 422 with invalidFlags, no save', async () => {
            optRepo.findOne.mockResolvedValue({ id: 7, scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false });

            await expect(
                service.updateProcessingOptionScope('7', { scope_offset: 1 } as any),
            ).rejects.toMatchObject({
                response: { success: false, invalidFlags: ['scope_offset'] },
            });
            expect(optRepo.save).not.toHaveBeenCalled();
        });

        it('valid flags → save called with mapped smallint flags; next GET reflects new values + scopeLabel', async () => {
            const existing = { id: 7, code: 'CANMANG', name: 'Cán màng', scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false };
            // findOne #1 → existing (trước cập nhật); findOne #2 → giá trị đã ghi (mô phỏng GET kế tiếp).
            optRepo.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, scope_loose: 1, scope_bound: 1, scope_large_format: 0, scope_offset: false });

            const result = await service.updateProcessingOptionScope('7', { scope_bound: 1, scope_loose: 1 });

            // save nhận entity với cờ smallint đã map (nguyên 0/1).
            expect(optRepo.save).toHaveBeenCalledTimes(1);
            const saved = optRepo.save.mock.calls[0][0];
            expect(saved.scope_bound).toBe(1);
            expect(saved.scope_loose).toBe(1);

            // Kết quả phản ánh giá trị đọc lại + nhãn phân loại.
            expect(result.data.scope_bound).toBe(1);
            expect(result.scopeLabel).toBe('Tờ rời, Đóng cuốn');
        });
    });

    // ════════════════════════════════════════════════════════════════
    // MaterialsService.updateMaterialScope (materials — boolean)
    // ════════════════════════════════════════════════════════════════
    describe('MaterialsService.updateMaterialScope', () => {
        let service: MaterialsService;
        let materialRepo: ReturnType<typeof createMockRepo>;

        beforeEach(async () => {
            materialRepo = createMockRepo();
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MaterialsService,
                    { provide: getRepositoryToken(Material), useValue: materialRepo },
                    { provide: getRepositoryToken(MaterialType), useValue: createMockRepo() },
                    { provide: getRepositoryToken(MaterialCategory), useValue: createMockRepo() },
                    { provide: getRepositoryToken(ProcessingOption), useValue: createMockRepo() },
                    { provide: getRepositoryToken(ProcessingPricing), useValue: createMockRepo() },
                    { provide: getDataSourceToken(), useValue: createMockDataSource() },
                ],
            }).compile();
            service = module.get<MaterialsService>(MaterialsService);
        });

        it('invalid flags (scope_large_format=5) → 422 and repo.save NOT called (old values kept)', async () => {
            const existing = { id: 3, code: 'C200', name: 'Couché 200', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false };
            materialRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updateMaterialScope('3', { scope_large_format: 5 } as any),
            ).rejects.toBeInstanceOf(UnprocessableEntityException);

            expect(materialRepo.save).not.toHaveBeenCalled();
            expect(existing.scopeLargeFormat).toBe(false); // giữ nguyên giá trị cũ
        });

        it('valid flags → save called with mapped boolean flags; next GET reflects new values + scopeLabel', async () => {
            // unitPrice > 0: vật tư offset phải có giá giấy (guard bug-class chặn giá 0).
            const existing = { id: 3, code: 'C200', name: 'Couché 200', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, unitPrice: 15000 };
            materialRepo.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, scopeLoose: false, scopeBound: false, scopeLargeFormat: false, scopeOffset: true });

            const result = await service.updateMaterialScope('3', { scope_loose: 0, scope_offset: true });

            // materials là cột boolean → smallint 0/1 chuyển thành false/true.
            expect(materialRepo.save).toHaveBeenCalledTimes(1);
            const saved = materialRepo.save.mock.calls[0][0];
            expect(saved.scopeLoose).toBe(false);
            expect(saved.scopeOffset).toBe(true);

            // scope_offset bật + mọi cờ in nhanh tắt → Tài_Nguyên_Chỉ_Offset.
            expect(result.scopeLabel).toBe('Chỉ Offset');
        });

        // GUARD (bug class: bật scope_offset trên vật tư giá 0 → engine đọc chi phí giấy = 0, giá sai âm thầm).
        it('bật scope_offset khi đơn giá = 0 → 400 và KHÔNG save (chặn chi phí giấy = 0)', async () => {
            const existing = { id: 3, code: 'C200', name: 'Couché 200', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, unitPrice: 0 };
            materialRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updateMaterialScope('3', { scope_offset: true }),
            ).rejects.toThrow(/đơn giá/);
            expect(materialRepo.save).not.toHaveBeenCalled();
        });

        it('bật scope_offset khi đơn giá > 0 → save bình thường', async () => {
            const existing = { id: 3, code: 'C200', name: 'Couché 200', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, unitPrice: '15000' };
            materialRepo.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, scopeOffset: true });

            await service.updateMaterialScope('3', { scope_offset: true });
            expect(materialRepo.save).toHaveBeenCalledTimes(1);
        });
    });

    // ════════════════════════════════════════════════════════════════
    // MasterDataService.updatePaperSizeScope (paper_sizes — boolean)
    // ════════════════════════════════════════════════════════════════
    describe('MasterDataService.updatePaperSizeScope', () => {
        let service: MasterDataService;
        let paperRepo: ReturnType<typeof createMockRepo>;

        beforeEach(async () => {
            paperRepo = createMockRepo();
            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    MasterDataService,
                    { provide: getRepositoryToken(PaperSize), useValue: paperRepo },
                    { provide: getRepositoryToken(PricingTier), useValue: createMockRepo() },
                    { provide: getRepositoryToken(PrintType), useValue: createMockRepo() },
                    { provide: getRepositoryToken(Unit), useValue: createMockRepo() },
                    { provide: getRepositoryToken(Printer), useValue: createMockRepo() },
                    { provide: getRepositoryToken(LargeFormatPricing), useValue: createMockRepo() },
                    { provide: getRepositoryToken(Material), useValue: createMockRepo() },
                ],
            }).compile();
            service = module.get<MasterDataService>(MasterDataService);
        });

        it('invalid flags (scope_bound=-1) → 422 and repo.save NOT called (old values kept)', async () => {
            const existing = { id: 2, name: 'A4', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false };
            paperRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updatePaperSizeScope('2', { scope_bound: -1 } as any),
            ).rejects.toBeInstanceOf(UnprocessableEntityException);

            expect(paperRepo.save).not.toHaveBeenCalled();
            expect(existing.scopeBound).toBe(false);
        });

        it('valid flags → save called with mapped boolean flags; next GET reflects new values + scopeLabel', async () => {
            const existing = { id: 2, name: 'A4', scopeLoose: true, scopeBound: false, scopeLargeFormat: false, scopeOffset: false };
            paperRepo.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, scopeLoose: true, scopeBound: true, scopeLargeFormat: false, scopeOffset: false });

            const result = await service.updatePaperSizeScope('2', { scope_bound: 1 });

            expect(paperRepo.save).toHaveBeenCalledTimes(1);
            const saved = paperRepo.save.mock.calls[0][0];
            expect(saved.scopeBound).toBe(true);

            expect(result.data.scopeBound).toBe(true);
            expect(result.scopeLabel).toBe('Tờ rời, Đóng cuốn');
        });

        // GUARD (bug class: bật scope_offset qua màn Scope trên khổ thiếu field engine đọc).
        // Đóng đường vòng làm rỗng validation ở create/update — chặn trước khi save.
        it('bật scope_offset khi thiếu kho_giay_lon → 400 và KHÔNG save (fail fast)', async () => {
            const existing = { id: 2, name: '79x109', scopeLoose: false, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, khoGiayLon: null, loaiKem: 'Kẽm nhỏ' };
            paperRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updatePaperSizeScope('2', { scope_offset: true }),
            ).rejects.toThrow(/Khổ giấy lớn/);
            expect(paperRepo.save).not.toHaveBeenCalled();
        });

        it('bật scope_offset khi thiếu loai_kem → 400 và KHÔNG save (chặn giá sai âm thầm)', async () => {
            const existing = { id: 2, name: '79x109', scopeLoose: false, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, khoGiayLon: '79cm x 109cm', loaiKem: null };
            paperRepo.findOne.mockResolvedValue(existing);

            await expect(
                service.updatePaperSizeScope('2', { scope_offset: true }),
            ).rejects.toThrow(/Loại kẽm/);
            expect(paperRepo.save).not.toHaveBeenCalled();
        });

        it('bật scope_offset khi đủ kho_giay_lon + loai_kem → save bình thường', async () => {
            const existing = { id: 2, name: '79x109', scopeLoose: false, scopeBound: false, scopeLargeFormat: false, scopeOffset: false, khoGiayLon: '79cm x 109cm', loaiKem: 'Kẽm lớn' };
            paperRepo.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, scopeOffset: true });

            await service.updatePaperSizeScope('2', { scope_offset: true });
            expect(paperRepo.save).toHaveBeenCalledTimes(1);
        });
    });
});
