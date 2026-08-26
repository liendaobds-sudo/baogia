/**
 * KB Hybrid Retrieval — test SUA LOI RECALL.
 * Chung minh: chunk gan nghia nhung KHONG trung tu khoa nao van duoc truy hoi
 * (truoc day bi keyword-gate loai bo). Run: npx jest hybrid-search
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { KnowledgeBaseService } from './knowledge-base.service';
import { EmbeddingService } from './embedding.service';
import { KbDocument } from '../../entities/kb-document.entity';
import { KbChunk } from '../../entities/kb-chunk.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import * as fs from 'fs';

describe('KnowledgeBaseService — hybrid retrieval (recall fix)', () => {
    let service: KnowledgeBaseService;
    let chunkRepo: any;

    // 2 chunk:
    //  A: trung tu khoa "card" + embedding [1,0,0]
    //  B: KHONG trung tu khoa nao + embedding [0,1,0] (gan voi query embedding)
    const chunkA: Partial<KbChunk> = {
        id: 'A', documentId: 'd1', content: 'Báo giá card visit cán mờ 2 mặt', isActive: true,
        embedding: [1, 0, 0], tags: [], metadata: {} as any,
    };
    const chunkB: Partial<KbChunk> = {
        id: 'B', documentId: 'd2', content: 'Danh thiếp giấy mỹ thuật xử lý bề mặt cao cấp', isActive: true,
        embedding: [0, 1, 0], tags: [], metadata: {} as any,
    };

    beforeEach(async () => {
        chunkRepo = {
            find: jest.fn().mockResolvedValue([chunkA, chunkB]),
            count: jest.fn().mockResolvedValue(2),
            createQueryBuilder: jest.fn(),
        };
        const httpService = {
            // generateEmbedding(query) -> tra ve [0,1,0] (gan chunkB)
            axiosRef: { post: jest.fn().mockResolvedValue({ data: { embedding: { values: [0, 1, 0] } } }) },
        };
        const configService = { get: jest.fn().mockReturnValue('fake-key') };

        const moduleRef: TestingModule = await Test.createTestingModule({
            providers: [
                KnowledgeBaseService,
                EmbeddingService,
                { provide: getRepositoryToken(KbDocument), useValue: {} },
                { provide: getRepositoryToken(KbChunk), useValue: chunkRepo },
                { provide: HttpService, useValue: httpService },
                { provide: ConfigService, useValue: configService },
                { provide: TenantContextService, useValue: { get: () => undefined } },
            ],
        }).compile();
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        service = moduleRef.get(KnowledgeBaseService);
    });

    afterEach(() => jest.clearAllMocks());

    it('truy hồi được chunk gần nghĩa KHÔNG trùng từ khóa (nhờ vector)', async () => {
        // Query "card visit cán mờ": chunkB khong chua tu khoa nao, nhung embedding gan.
        const results = await service.searchChunks('card visit cán mờ', 5);
        const ids = results.map((c) => c.id);

        // Truoc fix: chunkB bi loai (LIKE gate) -> chi co A.
        // Sau fix: chunkB van vao ket qua nho diem dense.
        expect(ids).toContain('B');
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('trả rỗng khi KB không có chunk active', async () => {
        chunkRepo.find.mockResolvedValue([]);
        const results = await service.searchChunks('bất kỳ', 5);
        expect(results).toEqual([]);
    });

    it('không log raw query hội thoại chứa PII', async () => {
        const canary = 'Lan 0901234567 lan@example.test cần in card visit cán mờ';
        const logger = { log: jest.fn(), warn: jest.fn() };
        (service as any).logger = logger;

        await service.searchChunks(canary, 5);

        const logged = logger.log.mock.calls.flat().join(' ');
        expect(logged).toContain(`queryChars=${canary.length}`);
        expect(logged).not.toContain(canary);
        expect(logged).not.toContain('0901234567');
    });
});
