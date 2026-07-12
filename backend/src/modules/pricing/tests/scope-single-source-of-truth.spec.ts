/**
 * Integration test — MỘT NGUỒN SỰ THẬT (single source of truth) cho phân loại Phạm_Vi.
 *
 * Khẳng định hai code path đọc Gia_Công (`processing_options`) cho luồng in nhanh dùng CHUNG
 * một Quy_Tắc_Phạm_Vi canonical, nên trả về CÙNG tập tài nguyên trong-phạm-vi:
 *   - master-data:  PricingFacadeService.getMasterData('processing_options')
 *   - erp endpoint: MaterialsService.findAllProcessingOptions({ scope: 'loose' })
 *                   (tương đương GET /erp/processing-options?scope=loose)
 *
 * Cùng một tập `processing_options` (cờ scope đa dạng) được nạp cho cả hai đường; test so khớp
 * tập id kết quả với nhau VÀ với kỳ vọng canonical (`filterForProductType`). Đây là chốt chặn
 * cho triệu chứng "tick rồi mà không hiện": nếu hai nguồn lệch quy tắc, test gãy.
 *
 * _Validates: Requirements 1.2, 3.1_
 * Run: npx jest --testPathPattern=scope-single-source-of-truth
 */

import { PricingFacadeService } from '../services/pricing-facade.service';
import { MaterialsService } from '../services/materials.service';
import { filterForProductType, ScopedResource } from '../scope/resource-scope-rule';

/**
 * Tập Gia_Công cố định với cờ scope đa dạng (cờ smallint 0/1 + scope_offset boolean),
 * khớp shape thật của bảng `processing_options`.
 *
 * Thiết kế dữ liệu để cả hai đường (master-data lọc `is_active=1 AND NOT offset-only`,
 * erp lọc `isActive AND resourceInScope(loose)`) hội tụ về cùng tập-trong-phạm-vi 'loose':
 * mọi tài nguyên ĐANG HOẠT ĐỘNG đều hoặc thuộc 'loose', hoặc là Chỉ-Offset; tài nguyên
 * không hoạt động bị cả hai loại. Nhờ đó equality là phép so khớp có ý nghĩa, không ngẫu nhiên.
 */
const PROCESSING_FIXTURE: (ScopedResource & { code: string; name: string })[] = [
    // Hoạt động, thuộc loose (đơn) → cả hai GIỮ
    { id: 2, code: 'CANMANG', name: 'Cán màng', is_active: 1, scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false },
    // Hoạt động, loose + bound → cả hai GIỮ (không phải Chỉ-Offset; có cờ loose)
    { id: 3, code: 'CANMO', name: 'Cán mờ', is_active: 1, scope_loose: 1, scope_bound: 1, scope_large_format: 0, scope_offset: false },
    // Hoạt động, loose + large_format + offset → cả hai GIỮ (có cờ loose nên không Chỉ-Offset)
    { id: 4, code: 'PHUNNHU', name: 'Phủ nhũ', is_active: 1, scope_loose: 1, scope_bound: 0, scope_large_format: 1, scope_offset: true },
    // Hoạt động, CHỈ-OFFSET (mọi cờ in nhanh tắt) → cả hai LOẠI
    { id: 40, code: 'BE', name: 'Bế', is_active: 1, scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
    // Hoạt động, CHỈ-OFFSET → cả hai LOẠI
    { id: 41, code: 'EPKIM', name: 'Ép kim', is_active: 1, scope_loose: 0, scope_bound: 0, scope_large_format: 0, scope_offset: true },
    // KHÔNG hoạt động dù có cờ loose → cả hai LOẠI (is_active≠1)
    { id: 50, code: 'QC', name: 'QC thành phẩm', is_active: 0, scope_loose: 1, scope_bound: 0, scope_large_format: 0, scope_offset: false },
];

/** Lấy tập id đã sắp xếp để so khớp tập (không phụ thuộc thứ tự). */
const idSet = (rows: { id: number }[]): number[] => rows.map((r) => r.id).sort((a, b) => a - b);

/**
 * Dựng PricingFacadeService chỉ với materialRepo (đường master-data processing_options chỉ
 * dùng `materialRepo.manager.query`). `query` mô phỏng SQL `WHERE is_active = 1` của service.
 */
function buildFacade(fixture: ScopedResource[]): PricingFacadeService {
    const materialRepo: any = {
        manager: {
            query: jest.fn(async (sql: string) => {
                // master-data gọi: SELECT * FROM processing_options WHERE is_active = 1 ORDER BY id
                if (/from\s+processing_options/i.test(sql)) {
                    return fixture.filter((r) => r.is_active === 1);
                }
                return [];
            }),
        },
    };
    return new PricingFacadeService(
        null as any, materialRepo, null as any, null as any,
        null as any, null as any, null as any, null as any,
    );
}

/** Dựng MaterialsService chỉ với optRepo (findAllProcessingOptions chỉ dùng `optRepo.find`). */
function buildMaterialsService(fixture: ScopedResource[]): MaterialsService {
    const optRepo: any = { find: jest.fn().mockResolvedValue(fixture) };
    return new MaterialsService(
        null as any, null as any, null as any, optRepo,
        null as any, null as any, undefined,
    );
}

describe('Single source of truth — master-data vs erp processing-options (scope=loose)', () => {
    it('hai đường trả CÙNG tập id Gia_Công trong-phạm-vi loose', async () => {
        const facade = buildFacade(PROCESSING_FIXTURE);
        const materials = buildMaterialsService(PROCESSING_FIXTURE);

        // master-data path
        const md = await facade.getMasterData('processing_options');
        expect(md.success).toBe(true);
        const masterDataIds = idSet((md.data as any).processing_options);

        // erp path: GET /erp/processing-options?scope=loose
        const erp = await materials.findAllProcessingOptions({ scope: 'loose' });
        const erpIds = idSet(erp as any);

        // Cốt lõi: hai nguồn KHÔNG lệch quy tắc
        expect(masterDataIds).toEqual(erpIds);
    });

    it('tập trùng khớp đúng bằng kỳ vọng canonical filterForProductType(loose)', async () => {
        const facade = buildFacade(PROCESSING_FIXTURE);
        const materials = buildMaterialsService(PROCESSING_FIXTURE);

        const canonicalIds = idSet(filterForProductType(PROCESSING_FIXTURE, 'loose'));
        // Chỉ các Gia_Công hoạt động + thuộc loose: {2,3,4}; loại Chỉ-Offset {40,41} và bất hoạt {50}
        expect(canonicalIds).toEqual([2, 3, 4]);

        const md = await facade.getMasterData('processing_options');
        const masterDataIds = idSet((md.data as any).processing_options);
        const erpIds = idSet(await materials.findAllProcessingOptions({ scope: 'loose' }) as any);

        expect(masterDataIds).toEqual(canonicalIds);
        expect(erpIds).toEqual(canonicalIds);
    });

    it('Tài_Nguyên_Chỉ_Offset và tài nguyên bất hoạt bị loại khỏi CẢ HAI nguồn', async () => {
        const facade = buildFacade(PROCESSING_FIXTURE);
        const materials = buildMaterialsService(PROCESSING_FIXTURE);

        const md = await facade.getMasterData('processing_options');
        const masterDataIds = idSet((md.data as any).processing_options);
        const erpIds = idSet(await materials.findAllProcessingOptions({ scope: 'loose' }) as any);

        for (const excludedId of [40, 41, 50]) {
            expect(masterDataIds).not.toContain(excludedId);
            expect(erpIds).not.toContain(excludedId);
        }
    });
});
