import { Controller, Post, Body, UseGuards, Get, Query, Param, Put, Delete, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QuoteService } from './quote.service';
import { QuoteCrudService } from './quote-crud.service';
import { Response } from 'express';

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
    create(@Body() data: any) {
        return this.quoteCrudService.createQuote(data, 1);
    }

    @Put(':id')
    update(@Param('id') id: number, @Body() data: any) {
        return this.quoteCrudService.updateQuote(id, data, 1);
    }

    @Delete(':id')
    remove(@Param('id') id: number) {
        return this.quoteCrudService.deleteQuote(id);
    }

    @Post(':id/clone')
    clone(@Param('id') id: number) {
        return this.quoteCrudService.cloneQuote(id, 1);
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
