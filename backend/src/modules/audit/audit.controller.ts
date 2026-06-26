import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
    constructor(private auditService: AuditService) { }

    @Get()
    findAll(
        @Query('entityType') entityType?: string,
        @Query('entityId') entityId?: string,
        @Query('userId') userId?: string,
        @Query('action') action?: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.auditService.findAll({ entityType, entityId, userId, action, page: +(page || 1), limit: +(limit || 50) });
    }
}
