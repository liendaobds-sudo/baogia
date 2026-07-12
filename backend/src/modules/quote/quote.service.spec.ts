import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QuoteService } from './quote.service';

import {
    Material, PaperSize, ProcessingPricing,
    ProductCategory, Product, ProductQuoteConfig, ProductAiField,
    PrintType, Unit
} from '../../entities';
import { PricingApiService } from './pricing-api.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';

describe('QuoteService - createQuoteFromChat', () => {
    let service: QuoteService;
    let mockDataSource: any;
    let mockQueryRunner: any;

    beforeEach(async () => {
        mockQueryRunner = {
            connect: jest.fn(),
            startTransaction: jest.fn(),
            commitTransaction: jest.fn(),
            rollbackTransaction: jest.fn(),
            release: jest.fn(),
            query: jest.fn(),
        };

        mockDataSource = {
            query: jest.fn(),
            createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
            options: { type: 'postgres' },
        };

        const mockRepo = {
            find: jest.fn().mockResolvedValue([]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QuoteService,
                { provide: getRepositoryToken(Material), useValue: mockRepo },
                { provide: getRepositoryToken(PaperSize), useValue: mockRepo },
                { provide: getRepositoryToken(ProcessingPricing), useValue: mockRepo },
                { provide: getRepositoryToken(ProductCategory), useValue: mockRepo },
                { provide: getRepositoryToken(Product), useValue: mockRepo },
                { provide: getRepositoryToken(ProductQuoteConfig), useValue: mockRepo },
                { provide: getRepositoryToken(ProductAiField), useValue: mockRepo },
                { provide: getRepositoryToken(PrintType), useValue: mockRepo },
                { provide: getRepositoryToken(Unit), useValue: mockRepo },
                { provide: PricingApiService, useValue: { calculateErp: jest.fn(), isHealthy: jest.fn().mockResolvedValue(true) } },
                { provide: getDataSourceToken(), useValue: mockDataSource },
                { provide: DataSource, useValue: mockDataSource },
            ],
        }).compile();

        service = module.get<QuoteService>(QuoteService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should throw an error if missing session_id', async () => {
        await expect(service.createQuoteFromChat('', {}, {})).rejects.toThrow('Invalid input');
    });

    it('should throw an error if missing customer info', async () => {
        const quoteData = { product: 'Namecard', quantity: 200 };
        await expect(service.createQuoteFromChat('session_123', quoteData, {})).rejects.toThrow('Customer info missing');
    });

    it('should return idempotent response if exact quote was created in the last 5 minutes', async () => {
        const quoteData = { product: 'Namecard', quantity: 200 };
        const customerInfo = { name: 'A', phone: '090' };
        
        mockDataSource.query.mockResolvedValue([{ id: 99, code: 'Q-2026-00099' }]);

        const result = await service.createQuoteFromChat('session_123', quoteData, customerInfo);

        expect(result.idempotent).toBe(true);
        expect(result.quoteId).toBe(99);
        expect(result.quoteNumber).toBe('Q-2026-00099');
        expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('should create new customer and quote successfully if no idempotency conflict', async () => {
        const quoteData = { product: 'Namecard', quantity: 5, price: 100000 };
        const customerInfo = { name: 'John Doe', phone: '0901234567' };

        mockDataSource.query.mockResolvedValue([]);

        mockQueryRunner.query.mockImplementation((queryStr: string) => {
            if (queryStr.includes('SELECT id FROM customers WHERE phone')) {
                return Promise.resolve([]);
            }
            if (queryStr.includes('INSERT INTO customers')) {
                return Promise.resolve([{ id: 55 }]);
            }
            if (queryStr.includes('INSERT INTO quotes')) {
                return Promise.resolve([{ id: 77 }]);
            }
            if (queryStr.includes('INSERT INTO quote_items')) {
                return Promise.resolve({ insertId: 88 }); 
            }
            if (queryStr.includes('SELECT id FROM ai_conversations')) {
                return Promise.resolve([]);
            }
            if (queryStr.includes('INSERT INTO ai_conversations')) {
                return Promise.resolve({ insertId: 11 }); 
            }
            if (queryStr.includes('UPDATE quotes SET code')) {
                return Promise.resolve(true); 
            }
            return Promise.resolve([]);
        });

        const result = await service.createQuoteFromChat('session_888', quoteData, customerInfo);

        expect(result.success).toBe(true);
        expect(result.quoteId).toBe(77);
        expect(result.customerId).toBe(55);
        expect(result.quoteNumber).toBe('Q-2026-00077');
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should link to existing customer and conversation if they exist', async () => {
        const quoteData = { product: 'Flyer', quantity: 1000, price: 500 };
        const customerInfo = { name: 'Jane Doe', phone: '0987654321' };

        mockDataSource.query.mockResolvedValue([]);

        mockQueryRunner.query.mockImplementation((queryStr: string) => {
            if (queryStr.includes('SELECT id FROM customers')) {
                return Promise.resolve([{ id: 22 }]);
            }
            if (queryStr.includes('INSERT INTO quotes')) {
                return Promise.resolve([{ id: 33 }]);
            }
            if (queryStr.includes('INSERT INTO quote_items')) {
                return Promise.resolve(true); 
            }
            if (queryStr.includes('SELECT id FROM ai_conversations')) {
                return Promise.resolve([{ id: 44 }]);
            }
            if (queryStr.includes('UPDATE ai_conversations')) {
                return Promise.resolve(true); 
            }
            if (queryStr.includes('UPDATE quotes SET code')) {
                return Promise.resolve(true); 
            }
            return Promise.resolve([]);
        });

        const result = await service.createQuoteFromChat('session_999', quoteData, customerInfo);

        expect(result.success).toBe(true);
        expect(result.quoteId).toBe(33);
        expect(result.customerId).toBe(22);
        
        expect(mockQueryRunner.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO customers'), expect.anything());
        expect(mockQueryRunner.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO ai_conversations'), expect.anything());
        expect(mockQueryRunner.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE ai_conversations'), expect.anything());
        expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback and rethrow error if any SQL operation fails', async () => {
        const quoteData = { product: 'Flyer', quantity: 1000, price: 500 };
        const customerInfo = { name: 'Error Guy', phone: '0901234567' };

        mockDataSource.query.mockResolvedValue([]);

        mockQueryRunner.query.mockImplementation((queryStr: string) => {
            if (queryStr.includes('INSERT INTO quotes')) {
                throw new Error('Database disconnected!');
            }
            return Promise.resolve([{ id: 1 }]); 
        });

        await expect(service.createQuoteFromChat('sess', quoteData, customerInfo)).rejects.toThrow('Database disconnected!');

        expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
        expect(mockQueryRunner.release).toHaveBeenCalled();
    });
});

describe('QuoteService - getCacheKey tenant isolation', () => {
    let service: QuoteService;
    let tenantCtx: TenantContextService;
    const ORIGINAL_FLAG = process.env.TENANT_RLS_ENABLED;

    const buildParsed = (): any => ({
        product: 'Namecard',
        type: 'loose',
        quantity: 200,
        material: { id: 5 },
        size: { width: 90, height: 55 },
        printSides: 2,
    });

    // Truy cập private getCacheKey để kiểm tra hành vi đóng khoá cache.
    const cacheKey = (parsed: any): string => (service as any).getCacheKey(parsed);

    beforeEach(async () => {
        const mockRepo = { find: jest.fn().mockResolvedValue([]) };
        const mockDataSource = { query: jest.fn(), options: { type: 'postgres' } };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QuoteService,
                { provide: getRepositoryToken(Material), useValue: mockRepo },
                { provide: getRepositoryToken(PaperSize), useValue: mockRepo },
                { provide: getRepositoryToken(ProcessingPricing), useValue: mockRepo },
                { provide: getRepositoryToken(ProductCategory), useValue: mockRepo },
                { provide: getRepositoryToken(Product), useValue: mockRepo },
                { provide: getRepositoryToken(ProductQuoteConfig), useValue: mockRepo },
                { provide: getRepositoryToken(ProductAiField), useValue: mockRepo },
                { provide: getRepositoryToken(PrintType), useValue: mockRepo },
                { provide: getRepositoryToken(Unit), useValue: mockRepo },
                { provide: PricingApiService, useValue: { isHealthy: jest.fn().mockResolvedValue(true) } },
                { provide: getDataSourceToken(), useValue: mockDataSource },
                { provide: DataSource, useValue: mockDataSource },
                TenantContextService,
            ],
        }).compile();

        service = module.get<QuoteService>(QuoteService);
        tenantCtx = module.get<TenantContextService>(TenantContextService);
    });

    afterEach(() => {
        if (ORIGINAL_FLAG === undefined) delete process.env.TENANT_RLS_ENABLED;
        else process.env.TENANT_RLS_ENABLED = ORIGINAL_FLAG;
        jest.clearAllMocks();
    });

    it('flag OFF → key has NO tenant prefix (byte-for-byte plain md5)', () => {
        delete process.env.TENANT_RLS_ENABLED;
        const key = tenantCtx.withTenant(7, () => cacheKey(buildParsed())) as string;
        // md5 hex = 32 ký tự, không có tiền tố `t<id>:`
        expect(key).toMatch(/^[a-f0-9]{32}$/);
        expect(key).not.toContain(':');
    });

    it('flag ON + tenantId → key prefixed with t<id>:', () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const key = tenantCtx.withTenant(7, () => cacheKey(buildParsed())) as string;
        expect(key).toMatch(/^t7:[a-f0-9]{32}$/);
    });

    it('flag ON + no tenant context → key unchanged (no prefix)', () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const key = cacheKey(buildParsed());
        expect(key).toMatch(/^[a-f0-9]{32}$/);
        expect(key).not.toContain(':');
    });

    it('flag ON → two tenants with identical params get DIFFERENT keys', () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const keyA = tenantCtx.withTenant(1, () => cacheKey(buildParsed())) as string;
        const keyB = tenantCtx.withTenant(2, () => cacheKey(buildParsed())) as string;
        expect(keyA).not.toEqual(keyB);
        expect(keyA).toBe('t1:' + keyB.slice('t2:'.length));
    });

    it('flag ON → same tenant + same params get the SAME key (cache hit preserved)', () => {
        process.env.TENANT_RLS_ENABLED = 'true';
        const k1 = tenantCtx.withTenant(3, () => cacheKey(buildParsed())) as string;
        const k2 = tenantCtx.withTenant(3, () => cacheKey(buildParsed())) as string;
        expect(k1).toEqual(k2);
    });
});
