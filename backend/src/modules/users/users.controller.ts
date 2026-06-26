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
    findOne(@Param('id') id: string) {
        return this.usersService.findOne(id);
    }

    @Post()
    @Roles(UserRole.ADMIN)
    create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Put(':id')
    @Roles(UserRole.ADMIN)
    update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
        return this.usersService.update(id, dto);
    }

    @Delete(':id')
    @Roles(UserRole.ADMIN)
    remove(@Param('id') id: string) {
        return this.usersService.remove(id);
    }
}
