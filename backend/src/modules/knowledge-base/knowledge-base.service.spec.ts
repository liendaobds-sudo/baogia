/**
 * KnowledgeBaseService — Unit Tests (mocked TypeORM repositories and fs)
 *
 * Tests CRUD operations for KB documents and chunks.
 * Run: npx jest --testPathPattern=knowledge-base.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { KnowledgeBaseService } from './knowledge-base.service';
import { EmbeddingService } from './embedding.service';
import { KbDocument, KbDocStatus } from '../../entities/kb-document.entity';
import { KbChunk } from '../../entities/kb-chunk.entity';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import * as fs from 'fs';

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 'doc-1', ...data })),
    save: jest.fn((entity) => Promise.resolve({ id: 'doc-1', ...entity })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    remove: jest.fn().mockResolvedValue({ affected: 1 }),
});

const mockHttpService = {
    axiosRef: {
        post: jest.fn().mockResolvedValue({
            data: { embedding: { values: [0.1, 0.2, 0.3] } }
        }),
    },
};

const mockConfigService = {
    get: jest.fn().mockReturnValue('fake-api-key'),
};

describe('KnowledgeBaseService', () => {
    let service: KnowledgeBaseService;
    let docRepo: ReturnType<typeof createMockRepo>;
    let chunkRepo: ReturnType<typeof createMockRepo>;

    beforeEach(async () => {
        docRepo = createMockRepo();
        chunkRepo = createMockRepo();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                KnowledgeBaseService,
                EmbeddingService,
                { provide: getRepositoryToken(KbDocument), useValue: docRepo },
                { provide: getRepositoryToken(KbChunk), useValue: chunkRepo },
                { provide: HttpService, useValue: mockHttpService },
                { provide: ConfigService, useValue: mockConfigService },
                // Ngoài HTTP context (unit test) → get() undefined → KHÔNG lọc tenant,
                // giữ nguyên hành vi/assertion cũ.
                { provide: TenantContextService, useValue: { get: () => undefined } },
            ],
        }).compile();

        // Mock fs using spyOn to avoid breaking Jest/TypeORM
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
        jest.spyOn(fs, 'readFileSync').mockReturnValue('Sample KB content for testing\n## Section 1\nContent 1\n## Section 2\nContent 2');
        jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);

        service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // ================================================================
    // findAll / findOne / getChunks
    // ================================================================

    describe('findAll', () => {
        it('should return all documents ordered by createdAt DESC', async () => {
            const docs = [{ id: 'doc-1', title: 'Test Doc' }];
            docRepo.find.mockResolvedValue(docs);

            const result = await service.findAll();
            expect(result).toEqual(docs);
            expect(docRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ order: { createdAt: 'DESC' } })
            );
        });
    });

    describe('findOne', () => {
        it('should throw NotFoundException if doc not found', async () => {
            docRepo.findOne.mockResolvedValue(null);
            await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
        });

        it('should return doc if found', async () => {
            const doc = { id: 'doc-1', title: 'Test Doc' };
            docRepo.findOne.mockResolvedValue(doc);

            const result = await service.findOne('doc-1');
            expect(result).toEqual(doc);
            expect(docRepo.findOne).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
        });
    });

    describe('getChunks', () => {
        it('should return chunks for a document', async () => {
            const chunks = [{ id: 'chunk-1', chunkIndex: 0 }];
            chunkRepo.find.mockResolvedValue(chunks);

            const result = await service.getChunks('doc-1');
            expect(result).toEqual(chunks);
            expect(chunkRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { documentId: 'doc-1', isActive: true } })
            );
        });
    });

    // ================================================================
    // uploadAndProcess
    // ================================================================

    describe('uploadAndProcess', () => {
        it('should throw error for unsupported file type', async () => {
            const file = { originalname: 'test.pdf', buffer: Buffer.from('test'), mimetype: 'application/pdf', size: 100 };
            await expect(service.uploadAndProcess(file)).rejects.toThrow(/chưa được hỗ trợ/);
        });

        it('should create document, write file, and process chunks', async () => {
            const file = { originalname: 'test.md', buffer: Buffer.from('test'), mimetype: 'text/markdown', size: 100 };
            
            // Mock findOne to return the newly created document
            docRepo.findOne.mockResolvedValue({ id: 'doc-1', title: 'test', status: KbDocStatus.INDEXED });

            const result = await service.uploadAndProcess(file, 'user-1', ['tag1']);

            expect(fs.writeFileSync).toHaveBeenCalled();
            expect(docRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'test',
                    fileType: 'md',
                    tags: ['tag1'],
                    status: KbDocStatus.PROCESSING,
                })
            );
            expect(docRepo.save).toHaveBeenCalled();
            
            // Since we use mock processDocument indirectly via fs mock, check if chunk repo was saved
            expect(chunkRepo.save).toHaveBeenCalled();
            expect(result.status).toBe(KbDocStatus.INDEXED);
        });

        it('không log filename/title upload chứa PII', async () => {
            const canary = 'Ho-so-Lan-0901234567-lan@example.test.md';
            const file = {
                originalname: canary,
                buffer: Buffer.from('safe content'),
                mimetype: 'text/markdown',
                size: 100,
            };
            docRepo.findOne.mockResolvedValue({ id: 'doc-1', title: canary, status: KbDocStatus.INDEXED });
            const log = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

            await service.uploadAndProcess(file, 'user-1', ['tag1']);

            const logged = log.mock.calls.flat().join(' ');
            expect(logged).not.toContain(canary);
            expect(logged).not.toContain('0901234567');
            expect(logged).not.toContain('lan@example.test');
        });
    });

    // ================================================================
    // updateContent
    // ================================================================

    describe('updateContent', () => {
        it('should update file on disk, rechunk, and update doc', async () => {
            const doc = { id: 'doc-1', title: 'Test', fileUrl: 'test.md' };
            docRepo.findOne.mockResolvedValue(doc);

            await service.updateContent('doc-1', 'New content', 'New Title', ['newTag']);

            expect(fs.writeFileSync).toHaveBeenCalledWith('test.md', 'New content', 'utf-8');
            expect(chunkRepo.delete).toHaveBeenCalledWith({ documentId: 'doc-1' });
            expect(chunkRepo.save).toHaveBeenCalled(); // Since it rechunks
        });
    });

    // ================================================================
    // deleteDocument
    // ================================================================

    describe('deleteDocument', () => {
        it('should delete chunks, file on disk, and document record', async () => {
            const doc = { id: 'doc-1', fileUrl: 'test.md' };
            docRepo.findOne.mockResolvedValue(doc);

            await service.deleteDocument('doc-1');

            expect(chunkRepo.delete).toHaveBeenCalledWith({ documentId: 'doc-1' });
            expect(fs.unlinkSync).toHaveBeenCalledWith('test.md');
            expect(docRepo.remove).toHaveBeenCalledWith(doc);
        });
    });
});
