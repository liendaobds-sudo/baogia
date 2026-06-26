/**
 * Whitelist server-side cho hàng cuốn (bìa/ruột).
 *
 * validateAgainstProductWhitelist là chốt chặn KHÔNG cho lách whitelist qua API/chatbot.
 * Trước đây chỉ soát material/khổ/gia công ở CẤP TRÊN của payload; hàng cuốn đặt
 * material/khổ/gia công trong `cover` và `inner[]` nên bị bỏ lọt. Test này khoá
 * hành vi: vi phạm ở bìa hoặc ruột phải bị từ chối.
 */
import { PricingFacadeService } from './pricing-facade.service';

function buildFacade(allowed: {
    mats?: string[]; papers?: string[]; procs?: string[]; accs?: string[];
}) {
    const materialRepo: any = {
        manager: {
            query: jest.fn().mockResolvedValue([{
                allowed_materials: JSON.stringify(allowed.mats ?? []),
                allowed_paper_sizes: JSON.stringify(allowed.papers ?? []),
                allowed_processing: JSON.stringify(allowed.procs ?? []),
                allowed_accessories: JSON.stringify(allowed.accs ?? []),
            }]),
        },
    };
    // Chỉ materialRepo được dùng trong validateAgainstProductWhitelist; còn lại null.
    const svc = new PricingFacadeService(
        null as any, materialRepo, null as any, null as any,
        null as any, null as any, null as any, null as any,
    );
    return { svc, materialRepo };
}

// Truy cập method private để test trực tiếp (không cần dựng toàn engine).
const validate = (svc: PricingFacadeService, input: any): Promise<string | null> =>
    (svc as any).validateAgainstProductWhitelist(input);

describe('validateAgainstProductWhitelist — hàng cuốn (bìa/ruột)', () => {
    it('bìa dùng vật liệu ngoài whitelist → bị từ chối', async () => {
        const { svc } = buildFacade({ mats: ['10'], papers: ['1'], procs: ['5'] });
        const err = await validate(svc, {
            type: 'bound', product_code: 'catalog',
            cover: { material_id: 999, paper_size_id: 1 },
            inner: [{ material_id: 10, paper_size_id: 1 }],
        });
        expect(err).toMatch(/bìa/i);
    });

    it('ruột dùng gia công ngoài whitelist → bị từ chối', async () => {
        const { svc } = buildFacade({ mats: ['10'], papers: ['1'], procs: ['5'] });
        const err = await validate(svc, {
            type: 'bound', product_code: 'catalog',
            cover: { material_id: 10, paper_size_id: 1 },
            inner: [{ material_id: 10, paper_size_id: 1, processing: [{ id: 777 }] }],
        });
        expect(err).toMatch(/ruột/i);
    });

    it('bìa + ruột đều hợp lệ → không lỗi', async () => {
        const { svc } = buildFacade({ mats: ['10', '11'], papers: ['1'], procs: ['5'] });
        const err = await validate(svc, {
            type: 'bound', product_code: 'catalog',
            cover: { material_id: 11, paper_size_id: 1, processing: [{ id: 5 }] },
            inner: [{ material_id: 10, paper_size_id: 1 }],
        });
        expect(err).toBeNull();
    });

    it('không có product_code → bỏ qua kiểm (tương thích legacy/chatbot)', async () => {
        const { svc, materialRepo } = buildFacade({ mats: ['10'] });
        const err = await validate(svc, {
            type: 'bound',
            cover: { material_id: 999, paper_size_id: 9 },
        });
        expect(err).toBeNull();
        expect(materialRepo.manager.query).not.toHaveBeenCalled();
    });

    it('mã sản phẩm lạ (không có trong unified_products) → bỏ qua kiểm', async () => {
        const materialRepo: any = { manager: { query: jest.fn().mockResolvedValue([]) } };
        const svc = new PricingFacadeService(
            null as any, materialRepo, null as any, null as any,
            null as any, null as any, null as any, null as any,
        );
        const err = await (svc as any).validateAgainstProductWhitelist({
            type: 'bound', product_code: 'khong-ton-tai',
            cover: { material_id: 999, paper_size_id: 9 },
        });
        expect(err).toBeNull();
    });
});
