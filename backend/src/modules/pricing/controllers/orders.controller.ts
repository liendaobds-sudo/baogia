import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { OrdersService } from '../services/orders.service';
import { CreateQuoteDto, UpdateQuoteDto } from '../dto/create-order.dto';

@ApiTags('Orders')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/orders')
export class ErpOrdersController {
    constructor(private readonly service: OrdersService) { }

    @Get('expire')
    @Permissions('quote.view', 'order.view')
    async expireQuotes() { return { success: true, data: await this.service.expireQuotes() }; }

    @Get()
    @Permissions('quote.view', 'order.view')
    async findAll(
        @Query('status') status?: string, @Query('keyword') keyword?: string,
        @Query('code') code?: string, @Query('customer_name') customerName?: string,
        @Query('customer_phone') customerPhone?: string, @Query('created_by') createdBy?: string,
        @Query('date_from') dateFrom?: string, @Query('date_to') dateTo?: string,
        @Query('page') page?: string, @Query('limit') limit?: string,
    ) {
        const data = await this.service.findAllQuotes({
            status, keyword, code, customer_name: customerName,
            customer_phone: customerPhone, created_by: createdBy,
            date_from: dateFrom, date_to: dateTo,
            page: page ? parseInt(page) : undefined, limit: limit ? parseInt(limit) : undefined,
        });
        return { success: true, data };
    }

    @Get(':id')
    @Permissions('quote.view', 'order.view')
    async findOne(@Param('id') id: string) {
        const data = await this.service.findQuoteById(id);
        if (!data) return { success: false, error: 'Quote not found' };
        return { success: true, data };
    }

    @Post()
    @Permissions('quote.create')
    async create(@Body() body: CreateQuoteDto, @Req() req: any) {
        try {
            const userId = req.user?.sub || req.user?.id || 0;
            return { success: true, data: await this.service.createQuote(body as unknown as Record<string, unknown>, userId), message: 'Quote created successfully' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/clone')
    @Permissions('quote.create')
    async clone(@Param('id') id: string, @Req() req: any) {
        try {
            const userId = req.user?.sub || req.user?.id || 0;
            return { success: true, data: await this.service.cloneQuote(id, userId), message: 'Đã sao chép báo giá thành công' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/submit')
    @Permissions('quote.edit')
    async submit(@Param('id') id: string) {
        try {
            await this.service.submitForApproval(id);
            return { success: true, message: 'Đã gửi duyệt báo giá' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/approve')
    @Permissions('quote.approve')
    async approve(@Param('id') id: string, @Req() req: any) {
        try {
            await this.service.approveQuote(id, req.user?.id);
            return { success: true, message: 'Báo giá đã được duyệt' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/reject')
    @Permissions('quote.approve')
    async reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
        try {
            await this.service.rejectQuote(id, body.reason, req.user?.id);
            return { success: true, message: 'Đã từ chối báo giá' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/send')
    @Permissions('quote.edit')
    async send(@Param('id') id: string) {
        try {
            await this.service.sendQuote(id);
            return { success: true, message: 'Đã đánh dấu báo giá là "Đã gửi"' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/accept')
    @Permissions('order.approve')
    async accept(@Param('id') id: string) {
        try {
            await this.service.acceptQuote(id);
            return { success: true, message: 'Khách hàng đã chấp nhận báo giá' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/complete')
    @Permissions('order.approve')
    async complete(@Param('id') id: string) {
        try {
            await this.service.completeQuote(id);
            return { success: true, message: 'Báo giá đã được hoàn thành' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/cancel')
    @Permissions('order.approve')
    async cancel(@Param('id') id: string, @Body() body: { reason?: string }) {
        try {
            await this.service.cancelQuote(id, body.reason);
            return { success: true, message: 'Báo giá đã bị huỷ' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Post(':id/send-zalo')
    @Permissions('quote.edit')
    async sendZalo(@Param('id') id: string, @Body() body: { conversation_id: string }) {
        try {
            const data = await this.service.sendViaZalo(id, body.conversation_id);
            return { success: true, data };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.NOT_IMPLEMENTED); }
    }

    @Post(':id/send-email')
    @Permissions('quote.edit')
    async sendEmail(@Param('id') id: string, @Body() body: { email: string; subject?: string }) {
        try {
            const data = await this.service.sendViaEmail(id, body.email, body.subject);
            return { success: true, data };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.NOT_IMPLEMENTED); }
    }

    @Put(':id')
    @Permissions('quote.edit')
    async update(@Param('id') id: string, @Body() body: UpdateQuoteDto) {
        try {
            return { success: true, data: await this.service.updateQuote(id, body as unknown as Record<string, unknown>), message: 'Quote updated' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }

    @Delete(':id')
    @Permissions('quote.delete')
    async remove(@Param('id') id: string) {
        try {
            await this.service.deleteQuote(id);
            return { success: true, message: 'Quote deleted successfully' };
        } catch (e: unknown) { throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST); }
    }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/order-versions')
export class ErpOrderVersionsController {
    constructor(private readonly service: OrdersService) { }

    @Get()
    @Permissions('quote.view', 'order.view')
    async findByQuote(@Query('quote_id') quoteId: string) {
        if (!quoteId) return { success: false, error: 'quote_id is required' };
        return { success: true, data: await this.service.findVersionsByQuote(quoteId) };
    }
    @Post()
    @Permissions('quote.edit')
    async createVersion(@Body() body: { quote_id: string; note?: string; created_by?: number }) {
        try {
            const data = await this.service.createVersion(body.quote_id, body.note || '', body.created_by || 0);
            return { success: true, data, message: 'Version created' };
        } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }
    @Get(':id')
    @Permissions('quote.view', 'order.view')
    async findOne(@Param('id') id: string) {
        const data = await this.service.findVersionById(id);
        if (!data) return { success: false, error: 'Version not found' };
        return { success: true, data };
    }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/order-pdf')
export class ErpOrderPdfController {
    constructor(private readonly service: OrdersService) { }

    @Get(':id')
    @Permissions('quote.view', 'order.view')
    async getQuotePdf(@Param('id') id: string) {
        const data = await this.service.getQuotePdf(id);
        if (!data) return { success: false, error: 'Quote not found' };
        return { success: true, data };
    }
}
