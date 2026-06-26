import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { Contact } from '../../entities/contact.entity';
import { Message } from '../../entities/message.entity';
import { Appointment } from '../../entities/appointment.entity';

describe('SearchService', () => {
    let service: SearchService;

    const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SearchService,
                {
                    provide: getRepositoryToken(Contact),
                    useValue: {
                        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                    },
                },
                {
                    provide: getRepositoryToken(Message),
                    useValue: {
                        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                    },
                },
                {
                    provide: getRepositoryToken(Appointment),
                    useValue: {
                        createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
                    },
                },
            ],
        }).compile();

        service = module.get<SearchService>(SearchService);
    });

    describe('search', () => {
        it('should return empty results for query shorter than 2 chars', async () => {
            const result = await service.search('a');
            expect(result).toEqual({ contacts: [], messages: [], appointments: [] });
        });

        it('should return empty results for empty query', async () => {
            const result = await service.search('');
            expect(result).toEqual({ contacts: [], messages: [], appointments: [] });
        });

        it('should return empty results for undefined query', async () => {
            const result = await service.search(undefined as any);
            expect(result).toEqual({ contacts: [], messages: [], appointments: [] });
        });

        it('should search across contacts, messages, and appointments', async () => {
            mockQueryBuilder.getMany.mockResolvedValue([{ id: 'test-1' }]);

            const result = await service.search('test query');

            expect(result.contacts).toBeDefined();
            expect(result.messages).toBeDefined();
            expect(result.appointments).toBeDefined();
        });
    });
});
