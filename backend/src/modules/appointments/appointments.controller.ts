import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppointmentsService, CreateAppointmentDto, UpdateAppointmentDto } from './appointments.service';
import { AppointmentStatus } from '../../entities/appointment.entity';

@Controller('appointments')
@UseGuards(AuthGuard('jwt'))
export class AppointmentsController {
    constructor(private readonly service: AppointmentsService) {}

    @Post()
    create(@Body() dto: CreateAppointmentDto) {
        return this.service.create(dto);
    }

    @Get()
    findAll(
        @Query('contactId') contactId?: string,
        @Query('status') status?: AppointmentStatus,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('assignedUserId') assignedUserId?: string,
    ) {
        return this.service.findAll({ contactId, status, dateFrom, dateTo, assignedUserId });
    }

    @Get('today')
    getToday() {
        return this.service.getTodayAppointments();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @HttpCode(204)
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
