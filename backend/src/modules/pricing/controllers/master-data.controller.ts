import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { MasterDataService } from '../services/master-data.service';
import { PaperSize, PricingTier, PrintType, LargeFormatPricing } from '../../../entities';
import { CreatePaperSizeDto, UpdatePaperSizeDto } from '../dto/paper-size.dto';
import { CreatePricingTierDto, UpdatePricingTierDto } from '../dto/pricing-tier.dto';
import { CreatePrintTypeDto, UpdatePrintTypeDto } from '../dto/print-types.dto';
import { CreateLargeFormatPricingDto, UpdateLargeFormatPricingDto } from '../dto/large-format-pricing.dto';
import { UpdateScopeDto } from '../dto/update-scope.dto';
import { PrintersService } from '../services/printers.service';
import { CreatePrinterDto, UpdatePrinterDto } from '../dto/printers.dto';

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/paper-sizes')
export class PaperSizesController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll(
        @Query('id') id?: string,
        @Query('scope') scope?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        if (id) {
            const data = await this.service.findPaperSizeById(id);
            return data ? { success: true, data } : { success: false, error: 'Not found' };
        }
        return {
            success: true,
            data: await this.service.findAllPaperSizes(scope, activeOnly === 'true'),
        };
    }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: CreatePaperSizeDto) {
        if (!data.name || !data.code) return { success: false, error: 'Name and code are required' };
        return { success: true, data: await this.service.createPaperSize(data), message: 'Paper size created successfully' };
    }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: UpdatePaperSizeDto) { return { success: true, data: await this.service.updatePaperSize(id, data), message: 'Updated successfully' }; }
    // PATCH /erp/paper-sizes/:id/scope — gán Cờ_Phạm_Vi (Màn_Quản_Trị_Phạm_Vi).
    @Patch(':id/scope')
    @Permissions('pricing.edit')
    async updateScope(@Param('id') id: string, @Body() data: UpdateScopeDto) {
        const result = await this.service.updatePaperSizeScope(id, data);
        return { success: true, data: result.data, scopeLabel: result.scopeLabel, message: 'Scope updated successfully' };
    }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.service.deletePaperSize(id); return { success: true, data: null, message: 'Deleted successfully' }; }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/pricing-tiers')
export class PricingTiersController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll(@Query('id') id?: string, @Query('material_id') materialId?: string) {
        if (id) {
            const data = await this.service.findTierById(id);
            return data ? { success: true, data } : { success: false, error: 'Not found' };
        }
        return { success: true, data: await this.service.findAllTiers(materialId) };
    }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: CreatePricingTierDto) { return { success: true, data: await this.service.createTier(data), message: 'Pricing tier created' }; }
    // Đồng bộ paper_cost từ materials.cost_price (tầng 2). material_id rỗng → đồng bộ tất cả.
    @Post('sync-cost')
    @Permissions('pricing.edit')
    async syncCost(@Body() body: { material_id?: number }) {
        const result = await this.service.syncCostFromMaterial(body?.material_id != null ? String(body.material_id) : undefined);
        return { success: true, data: result, message: `Đã đồng bộ ${result.synced} định mức` };
    }
    // Gợi ý giá định mức từ chi phí (tầng 3) — KHÔNG ghi DB, chỉ trả breakdown 5 thành phần để xem trước.
    @Post('suggest')
    @Permissions('pricing.edit')
    async suggest(@Body() body: { material_id: number; printer_id?: number; print_type?: string; sides?: number; paper_size_id?: number }) {
        return { success: true, data: await this.service.suggestTierCost(body) };
    }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: UpdatePricingTierDto) { return { success: true, data: await this.service.updateTier(id, data), message: 'Updated' }; }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.service.deleteTier(id); return { success: true, data: null, message: 'Deleted' }; }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/print-types')
export class PrintTypesController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll() { return { success: true, data: await this.service.findAllPrintTypes() }; }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: CreatePrintTypeDto) { return { success: true, data: await this.service.createPrintType(data) }; }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: UpdatePrintTypeDto) { return { success: true, data: await this.service.updatePrintType(id, data) }; }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.service.deletePrintType(id); return { success: true, data: null }; }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/units')
export class UnitsController {
    constructor(private readonly service: MasterDataService) {}
    @Get()
    async findAll() { return { success: true, data: await this.service.findAllUnits() }; }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: any) { return { success: true, data: await this.service.createUnit(data) }; }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: any) { return { success: true, data: await this.service.updateUnit(id, data) }; }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.service.deleteUnit(id); return { success: true, data: null }; }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/printers')
export class ErpPrintersController {
    constructor(
        private readonly service: MasterDataService,
        private readonly printers: PrintersService,
    ) {}
    @Get()
    async findAll() { return { success: true, data: await this.service.findAllPrinters() }; }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: CreatePrinterDto) { return { success: true, data: await this.printers.create(data), message: 'Printer created' }; }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: UpdatePrinterDto) { return { success: true, data: await this.printers.update(Number(id), data), message: 'Updated' }; }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.printers.remove(Number(id)); return { success: true, data: null, message: 'Deleted' }; }
}

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/large-format-pricing')
export class LargeFormatPricingController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll(@Query('id') id?: string, @Query('material_id') materialId?: string) {
        if (id) {
            const data = await this.service.findLargeFormatTierById(id);
            return data ? { success: true, data } : { success: false, error: 'Not found' };
        }
        return { success: true, data: await this.service.findAllLargeFormatTiers(materialId) };
    }
    @Post()
    @Permissions('pricing.edit')
    async create(@Body() data: CreateLargeFormatPricingDto) { return { success: true, data: await this.service.createLargeFormatTier(data), message: 'Large format tier created' }; }
    // Gợi ý giá định mức khổ lớn từ chi phí (tầng 3) — KHÔNG ghi DB, trả breakdown 4 thành phần/m².
    @Post('suggest')
    @Permissions('pricing.edit')
    async suggest(@Body() body: { material_id: number; printer_id?: number }) {
        return { success: true, data: await this.service.suggestLargeFormatCost(body) };
    }
    @Put(':id')
    @Permissions('pricing.edit')
    async update(@Param('id') id: string, @Body() data: UpdateLargeFormatPricingDto) { return { success: true, data: await this.service.updateLargeFormatTier(id, data), message: 'Updated' }; }
    @Delete(':id')
    @Permissions('pricing.edit')
    async remove(@Param('id') id: string) { await this.service.deleteLargeFormatTier(id); return { success: true, data: null, message: 'Deleted' }; }
}
