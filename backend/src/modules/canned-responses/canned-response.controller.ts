import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CannedResponseService } from './canned-response.service';

@Controller('canned-responses')
@UseGuards(AuthGuard('jwt'))
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
    create(@Body() body: any, @Request() req: any) {
        return this.service.create({ ...body, createdById: req.user?.id });
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Post(':id/use')
    use(@Param('id') id: string) {
        return this.service.incrementUse(id);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
