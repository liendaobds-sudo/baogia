import { IsString, IsOptional, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { AppointmentStatus } from '../../../entities/appointment.entity';

export class CreateAppointmentDto {
    @IsUUID()
    contactId: string;

    @IsOptional()
    @IsUUID()
    assignedUserId?: string;

    @IsDateString()
    appointmentDate: string;

    @IsOptional()
    @IsString()
    appointmentTime?: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdateAppointmentDto {
    @IsOptional()
    @IsDateString()
    appointmentDate?: string;

    @IsOptional()
    @IsString()
    appointmentTime?: string;

    @IsOptional()
    @IsString()
    type?: string;

    @IsOptional()
    @IsEnum(AppointmentStatus)
    status?: AppointmentStatus;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsUUID()
    assignedUserId?: string;
}
