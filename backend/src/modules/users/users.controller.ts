import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class UsersController {
    constructor(private usersService: UsersService) { }

    @Get()
    @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
    findAll(@Req() req: any) {
        return this.usersService.findAll(req.user.tenantId);
    }

    @Get(':id')
    @Roles(UserRole.ADMIN, UserRole.SUPERVISOR)
    findOne(@Param('id') id: string, @Req() req: any) {
        return this.usersService.findOne(id, req.user.tenantId);
    }

    @Post()
    @Roles(UserRole.ADMIN)
    create(@Body() dto: CreateUserDto, @Req() req: any) {
        return this.usersService.create(dto, req.user.tenantId);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN)
    update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
        return this.usersService.update(id, dto, req.user.tenantId);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    remove(@Param('id') id: string, @Req() req: any) {
        return this.usersService.remove(id, req.user.tenantId);
    }
}
