import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import * as fs from 'fs';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KbDocument } from '../../entities/kb-document.entity';
import { KbChunk } from '../../entities/kb-chunk.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

/**
 * Khoá hành vi cô lập tenant của KB (audit finding 🔴 → fix): khi CHẠY TRONG HTTP context
 * (tenant hiện hành xác định), MỌI đọc KB phải lọc `tenant_id = <current> OR NULL (shared)`,
 * KHÔNG bao giờ trả tài liệu/chunk RIÊNG của tenant khác.
 *
 * Đây là lưới an toàn tầng ứng dụng cho tới khi RLS (Pha B) được flip.
 */
describe('KnowledgeBaseService — cô lập tenant (application-layer)', () => {
    const TENANT = 7;
    let service: KnowledgeBaseService;
    let docRepo: any;
    let chunkRepo: any;

    const makeRepo = () => ({
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({ id: 'doc-1', tenantId: TENANT }),
        create: jest.fn((d) => d),
        save: jest.fn((e) => Promise.resolve(e)),
        delete: jest.fn(),
        remove: jest.fn(),
    });

    beforeEach(async () => {
        docRepo = makeRepo();
        chunkRepo = makeRepo();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KnowledgeBaseService,
                { provide: getRepositoryToken(KbDocument), useValue: docRepo },
                { provide: getRepositoryToken(KbChunk), useValue: chunkRepo },
                { provide: HttpService, useValue: { axiosRef: { post: jest.fn() } } },
                { provide: ConfigService, useValue: { get: jest.fn() } },
                // Giả lập ĐANG Ở TRONG request của tenant #7 (non-bypass).
                { provide: TenantContextService, useValue: { get: () => ({ tenantId: TENANT, userId: 'u', role: 'agent', bypass: false }) } },
            ],
        }).compile();
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        service = module.get(KnowledgeBaseService);
    });

    afterEach(() => jest.clearAllMocks());

    /** where phải là mảng OR: [{...tenantId:7}, {...tenantId:IsNull}] */
    const expectTenantScoped = (where: any, base: Record<string, any>) => {
        expect(Array.isArray(where)).toBe(true);
        expect(where).toHaveLength(2);
        expect(where[0]).toMatchObject({ ...base, tenantId: TENANT });
        expect(where[1].tenantId).toBeDefined(); // FindOperator IsNull()
        expect(where[1].tenantId.constructor.name).toBe('FindOperator');
        // Không bao giờ có nhánh tenant khác.
        expect(where.some((w: any) => typeof w.tenantId === 'number' && w.tenantId !== TENANT)).toBe(false);
    };

    it('findAll → lọc tenant hiện hành + shared', async () => {
        await service.findAll();
        expectTenantScoped(docRepo.find.mock.calls[0][0].where, {});
    });

    it('findOne → không lấy được tài liệu tenant khác (where kèm tenant)', async () => {
        await service.findOne('doc-1');
        expectTenantScoped(docRepo.findOne.mock.calls[0][0].where, { id: 'doc-1' });
    });

    it('getChunks → lọc tenant', async () => {
        await service.getChunks('doc-1');
        expectTenantScoped(chunkRepo.find.mock.calls[0][0].where, { documentId: 'doc-1', isActive: true });
    });

    it('searchChunks → ứng viên chỉ trong tenant + shared', async () => {
        chunkRepo.find.mockResolvedValue([]); // rỗng → trả [] sớm, đủ để kiểm where
        await service.searchChunks('bất kỳ', 5);
        expectTenantScoped(chunkRepo.find.mock.calls[0][0].where, { isActive: true });
    });

    it('context bypass (system/cron) → KHÔNG lọc tenant (job nền hoạt động như cũ)', async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KnowledgeBaseService,
                { provide: getRepositoryToken(KbDocument), useValue: docRepo },
                { provide: getRepositoryToken(KbChunk), useValue: chunkRepo },
                { provide: HttpService, useValue: { axiosRef: { post: jest.fn() } } },
                { provide: ConfigService, useValue: { get: jest.fn() } },
                { provide: TenantContextService, useValue: { get: () => ({ tenantId: 0, userId: 'system', role: 'system', bypass: true }) } },
            ],
        }).compile();
        const sysSvc = module.get(KnowledgeBaseService);
        await sysSvc.findAll();
        // where không phải mảng OR → không lọc theo tenant.
        expect(Array.isArray(docRepo.find.mock.calls[0][0].where)).toBe(false);
    });

    it('upload → gán tenant hiện hành cho document', async () => {
        docRepo.findOne.mockResolvedValue({ id: 'doc-1', status: 'indexed', tenantId: TENANT });
        const file = { originalname: 'x.md', buffer: Buffer.from('nội dung ## H\nvăn bản'), mimetype: 'text/markdown', size: 10 };
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('nội dung ## H\nvăn bản');
        await service.uploadAndProcess(file, 'u1', []);
        expect(docRepo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: TENANT }));
    });
});
