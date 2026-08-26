/**
 * ContactsController — Unit Tests (mocked TypeORM repositories)
 *
 * Tests contact list/search, export CSV, details fetching, and updating.
 * Run: npx jest --testPathPattern=contacts.controller.spec
 */

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactsController } from './contacts.controller';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { Contact, Conversation, Message } from '../../entities';

// ─── Mock helpers ───

const mockQueryBuilder = () => {
    const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        loadRelationCountAndMap: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getMany: jest.fn().mockResolvedValue([]),
    };
    return qb;
};

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder()),
});

// Mock Express Response
const mockResponse = () => {
    const res: any = {};
    res.setHeader = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
};

describe('ContactsController', () => {
    let controller: ContactsController;
    let contactRepo: ReturnType<typeof createMockRepo>;
    let convRepo: ReturnType<typeof createMockRepo>;
    let msgRepo: ReturnType<typeof createMockRepo>;

    beforeEach(async () => {
        contactRepo = createMockRepo();
        convRepo = createMockRepo();
        msgRepo = createMockRepo();

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ContactsController],
            providers: [
                { provide: getRepositoryToken(Contact), useValue: contactRepo },
                { provide: getRepositoryToken(Conversation), useValue: convRepo },
                { provide: getRepositoryToken(Message), useValue: msgRepo },
            ],
        })
            .overrideGuard(CskhScopeGuard)
            .useValue({ canActivate: () => true })
            .compile();

        controller = module.get<ContactsController>(ContactsController);
    });

    // ================================================================
    // findAll
    // ================================================================

    describe('findAll', () => {
        it('should return paginated contacts with mapped data', async () => {
            const qb = mockQueryBuilder();
            qb.getManyAndCount.mockResolvedValue([
                [
                    {
                        id: 'contact-1',
                        displayName: 'Test Contact',
                        channel: { id: 'ch-1', name: 'Zalo', type: 'zalo_oa' },
                        conversationCount: 5,
                    },
                ],
                1, // total count
            ]);
            contactRepo.createQueryBuilder.mockReturnValue(qb);

            const result = await controller.findAll(1, 10);
            expect(result.total).toBe(1);
            expect(result.page).toBe(1);
            expect(result.totalPages).toBe(1);
            expect(result.data).toHaveLength(1);
            expect(result.data[0].displayName).toBe('Test Contact');
            expect(result.data[0].conversationCount).toBe(5);
            expect(qb.skip).toHaveBeenCalledWith(0);
            expect(qb.take).toHaveBeenCalledWith(10);
        });

        it('should apply search filter if provided', async () => {
            const qb = mockQueryBuilder();
            contactRepo.createQueryBuilder.mockReturnValue(qb);

            await controller.findAll(1, 10, 'john');
            // Điều kiện OR phải bọc ngoặc — nếu không, andWhere tenant-filter phía sau
            // chỉ AND với vế cuối và search có thể lọt hàng ngoài tenant.
            expect(qb.where).toHaveBeenCalledWith(
                '(LOWER(c.displayName) LIKE :s OR LOWER(c.phone) LIKE :s OR LOWER(c.email) LIKE :s)',
                { s: '%john%' }
            );
        });

        it('should apply pipeline filter if provided', async () => {
            const qb = mockQueryBuilder();
            contactRepo.createQueryBuilder.mockReturnValue(qb);

            await controller.findAll(1, 10, undefined, 'qualified');
            expect(qb.andWhere).toHaveBeenCalledWith(
                'c.pipeline_status = :pipeline',
                { pipeline: 'qualified' }
            );
        });
    });

    // ================================================================
    // exportCSV
    // ================================================================

    describe('exportCSV', () => {
        // Task 23 (tenant-data-isolation): export chuyển từ repo.find() full-table sang
        // query builder có tenant-filter + trần LIMIT+1 — mock theo đường mới.
        it('should generate and send CSV data correctly', async () => {
            const qb = mockQueryBuilder();
            qb.getMany.mockResolvedValue([
                {
                    displayName: 'John Doe',
                    phone: '0901234567',
                    email: 'john@test.com',
                    channel: { name: 'Zalo OA' },
                    tags: ['VIP', 'New'],
                    firstContactAt: new Date('2026-01-01T10:00:00Z'),
                    lastContactAt: new Date('2026-01-02T10:00:00Z'),
                },
                {
                    displayName: 'Jane "Smith"', // test quote escaping
                    phone: null,
                    tags: null,
                }
            ]);
            contactRepo.createQueryBuilder.mockReturnValue(qb);

            const res = mockResponse();
            await controller.exportCSV(res);

            expect(contactRepo.createQueryBuilder).toHaveBeenCalled();
            // LIMIT+1 để phát hiện vượt trần 50.000 hàng mà không cần COUNT riêng.
            expect(qb.take).toHaveBeenCalledWith(50_001);
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
            expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=contacts.csv');
            
            const sentData = res.send.mock.calls[0][0];
            // Check BOM
            expect(sentData.startsWith('\uFEFF')).toBe(true);
            // Check Header
            expect(sentData).toContain('Tên,Điện thoại,Email,Kênh,Tags,Liên hệ đầu,Liên hệ cuối');
            // Check formatting
            expect(sentData).toContain('"John Doe","0901234567","john@test.com","Zalo OA","VIP; New"');
            // Check escaping
            expect(sentData).toContain('Jane ""Smith""');
        });

        it('từ chối khi danh bạ vượt trần 50.000 hàng (Req 8.5 — không trả tệp một phần)', async () => {
            const qb = mockQueryBuilder();
            qb.getMany.mockResolvedValue(
                Array.from({ length: 50_001 }, (_, i) => ({ displayName: `C${i}` })),
            );
            contactRepo.createQueryBuilder.mockReturnValue(qb);

            const res = mockResponse();
            await expect(controller.exportCSV(res)).rejects.toThrow(BadRequestException);
            expect(res.send).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // findOne
    // ================================================================

    describe('findOne', () => {
        it('should return error if contact not found', async () => {
            contactRepo.findOne.mockResolvedValue(null);
            const result = await controller.findOne('999');
            expect(result).toEqual({ error: 'Not found' });
        });

        it('should return contact with recent conversations and message count', async () => {
            contactRepo.findOne.mockResolvedValue({
                id: 'contact-1',
                displayName: 'Test',
            });
            
            convRepo.find.mockResolvedValue([
                {
                    id: 'conv-1',
                    status: 'open',
                    assignee: { id: 'agent-1', fullName: 'Agent Name' },
                }
            ]);

            msgRepo.count.mockResolvedValue(42);

            const result: any = await controller.findOne('contact-1');
            
            expect(result.id).toBe('contact-1');
            expect(result.totalMessages).toBe(42);
            expect(result.conversations).toHaveLength(1);
            expect(result.conversations[0].id).toBe('conv-1');
            expect(result.conversations[0].assignee?.fullName).toBe('Agent Name');
            
            // Verify find calls
            expect(convRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { contactId: 'contact-1' }, take: 20 })
            );
            expect(msgRepo.count).toHaveBeenCalledWith(
                expect.objectContaining({ where: { conversation: { contactId: 'contact-1' } } })
            );
        });
    });

    // ================================================================
    // update
    // ================================================================

    describe('update', () => {
        it('should only update allowed fields', async () => {
            contactRepo.update.mockResolvedValue({ affected: 1 });
            contactRepo.findOne.mockResolvedValue({ id: 'contact-1', displayName: 'New Name' });

            // 'id' and 'createdAt' should be ignored
            const result: any = await controller.update('contact-1', {
                displayName: 'New Name',
                id: 'hacker',
                pipelineStatus: 'qualified',
                notes: 'test notes'
            } as any);

            expect(contactRepo.update).toHaveBeenCalledWith('contact-1', {
                displayName: 'New Name',
                pipelineStatus: 'qualified',
                notes: 'test notes'
            });

            expect(result.displayName).toBe('New Name');
        });

        it('should ignore undefined values', async () => {
            // update() giờ findOne trước để chặn IDOR — contact phải "tồn tại" thì mới ghi.
            contactRepo.findOne.mockResolvedValue({ id: 'contact-1', phone: '0123' });
            await controller.update('contact-1', { displayName: undefined, phone: '0123' });
            
            expect(contactRepo.update).toHaveBeenCalledWith('contact-1', {
                phone: '0123'
            });
        });

        it('trả "Not found" và không ghi khi contact không tồn tại (chặn IDOR)', async () => {
            contactRepo.findOne.mockResolvedValue(null);
            const result: any = await controller.update('contact-x', { phone: '0999' });

            expect(result).toEqual({ error: 'Not found' });
            expect(contactRepo.update).not.toHaveBeenCalled();
        });
    });
});
