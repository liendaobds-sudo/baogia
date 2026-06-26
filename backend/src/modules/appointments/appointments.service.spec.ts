import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppointmentsService } from './appointments.service';
import { Appointment, AppointmentStatus } from '../../entities/appointment.entity';
import { Contact } from '../../entities/contact.entity';

describe('AppointmentsService', () => {
    let service: AppointmentsService;
    let appointmentRepo: any;
    let contactRepo: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AppointmentsService,
                {
                    provide: getRepositoryToken(Appointment),
                    useValue: {
                        create: jest.fn((dto) => ({ id: 'apt-1', ...dto })),
                        save: jest.fn((entity) => Promise.resolve({ ...entity, id: 'apt-1' })),
                        find: jest.fn().mockResolvedValue([]),
                        findOne: jest.fn(),
                        update: jest.fn(),
                        delete: jest.fn(),
                        count: jest.fn().mockResolvedValue(0),
                    },
                },
                {
                    provide: getRepositoryToken(Contact),
                    useValue: {
                        update: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<AppointmentsService>(AppointmentsService);
        appointmentRepo = module.get(getRepositoryToken(Appointment));
        contactRepo = module.get(getRepositoryToken(Contact));
    });

    describe('create', () => {
        it('should create an appointment and sync nextAppointment', async () => {
            appointmentRepo.findOne.mockResolvedValue(null);

            const result = await service.create({
                contactId: 'contact-1',
                appointmentDate: '2026-04-01',
                appointmentTime: '14:30',
                type: 'consultation',
                notes: 'Tư vấn in ấn',
            });

            expect(appointmentRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    contactId: 'contact-1',
                    appointmentTime: '14:30',
                }),
            );
            expect(appointmentRepo.save).toHaveBeenCalled();
            // Should try to sync nextAppointment on contact
            expect(contactRepo.update).toHaveBeenCalledWith('contact-1', expect.anything());
        });
    });

    describe('findAll', () => {
        it('should return appointments with filters', async () => {
            appointmentRepo.find.mockResolvedValue([
                { id: 'apt-1', contactId: 'c-1', status: AppointmentStatus.SCHEDULED },
            ]);

            const result = await service.findAll({ status: AppointmentStatus.SCHEDULED });

            expect(appointmentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ status: AppointmentStatus.SCHEDULED }),
                }),
            );
        });
    });

    describe('update', () => {
        it('should update appointment status', async () => {
            appointmentRepo.findOne.mockResolvedValue({
                id: 'apt-1',
                contactId: 'c-1',
                status: AppointmentStatus.COMPLETED,
            });

            const result = await service.update('apt-1', {
                status: AppointmentStatus.COMPLETED,
            });

            expect(appointmentRepo.update).toHaveBeenCalledWith(
                'apt-1',
                expect.objectContaining({ status: AppointmentStatus.COMPLETED }),
            );
        });
    });

    describe('getTodayAppointments', () => {
        it('should filter by today date and scheduled status', async () => {
            await service.getTodayAppointments();
            expect(appointmentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        status: AppointmentStatus.SCHEDULED,
                    }),
                }),
            );
        });
    });

    describe('getTomorrowCount', () => {
        it('should return count of scheduled appointments for tomorrow', async () => {
            appointmentRepo.count.mockResolvedValue(3);
            const count = await service.getTomorrowCount();
            expect(count).toBe(3);
        });
    });
});
