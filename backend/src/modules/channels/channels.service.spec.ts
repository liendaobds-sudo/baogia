/**
 * ChannelsService — Unit Tests (mocked TypeORM repositories)
 *
 * Tests CRUD operations for channels.
 * Run: npx jest --testPathPattern=channels.service.spec
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { Channel } from '../../entities';

// ─── Mock helpers ───

const createMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data) => ({ id: 'ch-1', ...data })),
    save: jest.fn((entity) => Promise.resolve({ id: 'ch-1', ...entity })),
});

describe('ChannelsService', () => {
    let service: ChannelsService;
    let channelsRepo: ReturnType<typeof createMockRepo>;

    beforeEach(async () => {
        channelsRepo = createMockRepo();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChannelsService,
                { provide: getRepositoryToken(Channel), useValue: channelsRepo },
                // Ngoài context (unit test) → get() undefined → không lọc tenant.
                { provide: TenantContextService, useValue: { get: () => undefined } },
            ],
        }).compile();

        service = module.get<ChannelsService>(ChannelsService);
    });

    // ================================================================
    // findAll
    // ================================================================

    describe('findAll', () => {
        it('should return channels ordered by createdAt DESC, secret masked', async () => {
            const channels = [{ id: 'ch-1', name: 'Zalo', webhookSecret: 's3cret' }];
            channelsRepo.find.mockResolvedValue(channels);

            const result = await service.findAll();
            // webhookSecret bị loại, thay bằng hasWebhookSecret; không lộ secret.
            expect(result.data[0]).toMatchObject({ id: 'ch-1', name: 'Zalo', hasWebhookSecret: true });
            expect((result.data[0] as any).webhookSecret).toBeUndefined();
            expect(channelsRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ order: { createdAt: 'DESC' } }),
            );
        });
    });

    // ================================================================
    // findOne
    // ================================================================

    describe('findOne', () => {
        it('should throw NotFoundException if channel not found', async () => {
            channelsRepo.findOne.mockResolvedValue(null);
            await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
        });

        it('should return channel if found', async () => {
            const channel = { id: 'ch-1', name: 'Zalo' };
            channelsRepo.findOne.mockResolvedValue(channel);

            const result = await service.findOne('ch-1');
            expect(result).toEqual(channel);
            expect(channelsRepo.findOne).toHaveBeenCalledWith({
                where: { id: 'ch-1' },
            });
        });
    });

    // ================================================================
    // create
    // ================================================================

    describe('create', () => {
        it('should create and save a new channel', async () => {
            const data = { name: 'FB Page' };
            const result = await service.create(data);

            expect(channelsRepo.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'FB Page' }));
            expect(channelsRepo.save).toHaveBeenCalled();
            expect(result.id).toBe('ch-1');
            expect(result.name).toBe('FB Page');
        });
    });

    // ================================================================
    // update
    // ================================================================

    describe('update', () => {
        it('should throw NotFoundException if channel not found', async () => {
            channelsRepo.findOne.mockResolvedValue(null);
            await expect(service.update('999', { name: 'New Name' })).rejects.toThrow(NotFoundException);
        });

        it('should assign new data and save', async () => {
            const channel = { id: 'ch-1', name: 'Old Name', isActive: true };
            channelsRepo.findOne.mockResolvedValue(channel);

            const result = await service.update('ch-1', { name: 'New Name', isActive: false });
            expect(result.name).toBe('New Name');
            expect(result.isActive).toBe(false);
            expect(channelsRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'New Name', isActive: false }),
            );
        });
    });
});
