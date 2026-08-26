import {
    Controller, Post, Body, UseGuards, Get, Query, Param, Put, Delete, Res, GoneException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QuoteService } from './quote.service';
import { QuoteCrudService } from './quote-crud.service';
import { Response } from 'express';

/**
 * Quote calc + legacy read helpers.
 * Writes (create/update/delete/clone) are retired — use POST /erp/orders (OrdersService recompute).
 */
@Controller('quote')
@UseGuards(AuthGuard('jwt'))
export class QuoteController {
    constructor(
        private quoteService: QuoteService,
        private quoteCrudService: QuoteCrudService
    ) { }

    @Post('pricing-calc')
    calculateErp(@Body() body: any) { return this.quoteService.calculateMiniQuote(body); }

    @Get()
    findAll(@Query() query: any) {
        if (query.action === 'versions') return { data: [] };
        return this.quoteCrudService.findAll(query);
    }

    @Get(':id')
    findOne(@Param('id') id: number) {
        return this.quoteCrudService.findOne(id);
    }

    @Post()
    create(@Body() _data: any) {
        throw new GoneException(
            'POST /quote đã ngừng hỗ trợ. Dùng POST /api/v1/erp/orders (OrdersService) để tạo báo giá có recompute giá server-side.',
        );
    }

    @Put(':id')
    update(@Param('id') _id: number, @Body() _data: any) {
        throw new GoneException(
            'PUT /quote/:id đã ngừng hỗ trợ. Dùng PUT /api/v1/erp/orders/:id.',
        );
    }

    @Delete(':id')
    remove(@Param('id') _id: number) {
        throw new GoneException(
            'DELETE /quote/:id đã ngừng hỗ trợ. Dùng DELETE /api/v1/erp/orders/:id.',
        );
    }

    @Post(':id/clone')
    clone(@Param('id') _id: number) {
        throw new GoneException(
            'POST /quote/:id/clone đã ngừng hỗ trợ. Dùng POST /api/v1/erp/orders/:id/clone.',
        );
    }

    @Post(':id/send')
    send(@Param('id') id: number) {
        return this.quoteCrudService.sendQuote(id);
    }

    @Get(':id/pdf')
    async exportPdf(@Param('id') id: number, @Res() res: Response) {
        const html = await this.quoteCrudService.generatePdfHtml(id);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="bao-gia-${id}.html"`);
        res.send(html);
    }
}
