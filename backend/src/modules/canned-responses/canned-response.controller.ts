import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { CannedResponseService } from './canned-response.service';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './canned-response.dto';

@Controller('canned-responses')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class CannedResponseController {
    constructor(private service: CannedResponseService) { }

    @Get()
    findAll(@Request() req: any) {
        return this.service.findAll(req.user?.id);
    }

    @Get('search')
    search(@Query('q') q: string) {
        return this.service.search(q || '');
    }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    create(@Body() body: CreateCannedResponseDto, @Request() req: any) {
        return this.service.create({ ...body, createdById: req.user?.id });
    }

    @Put(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    update(@Param('id') id: string, @Body() body: UpdateCannedResponseDto) {
        return this.service.update(id, body);
    }

    @Post(':id/use')
    use(@Param('id') id: string) {
        return this.service.incrementUse(id);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    delete(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
