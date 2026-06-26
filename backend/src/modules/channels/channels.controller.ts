import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { ChannelsService } from './channels.service';

@Controller('channels')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class ChannelsController {
    constructor(private channelsService: ChannelsService) { }

    @Get()
    findAll() { return this.channelsService.findAll(); }

    @Post()
    create(@Body() body: any) { return this.channelsService.create(body); }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) { return this.channelsService.update(id, body); }
}
