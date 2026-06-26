import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MasterDataService } from '../services/master-data.service';
import { PaperSize, PricingTier, PrintType, LargeFormatPricing } from '../../../entities';
import { CreatePaperSizeDto, UpdatePaperSizeDto } from '../dto/paper-size.dto';
import { CreatePricingTierDto, UpdatePricingTierDto } from '../dto/pricing-tier.dto';
import { CreatePrintTypeDto, UpdatePrintTypeDto } from '../dto/print-types.dto';
import { CreateLargeFormatPricingDto, UpdateLargeFormatPricingDto } from '../dto/large-format-pricing.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('erp/paper-sizes')
export class PaperSizesController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll(@Query('id') id?: string, @Query('scope') scope?: string) {
        if (id) {
            const data = await this.service.findPaperSizeById(id);
            return data ? { success: true, data } : { success: false, error: 'Not found' };
        }
        return { success: true, data: await this.service.findAllPaperSizes(scope) };
    }
    @Post()
    async create(@Body() data: CreatePaperSizeDto) {
        if (!data.name || !data.code) return { success: false, error: 'Name and code are required' };
        return { success: true, data: await this.service.createPaperSize(data), message: 'Paper size created successfully' };
    }
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: UpdatePaperSizeDto) { return { success: true, data: await this.service.updatePaperSize(id, data), message: 'Updated successfully' }; }
    @Delete(':id')
    async remove(@Param('id') id: string) { await this.service.deletePaperSize(id); return { success: true, data: null, message: 'Deleted successfully' }; }
}

@UseGuards(AuthGuard('jwt'))
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
    async create(@Body() data: CreatePricingTierDto) { return { success: true, data: await this.service.createTier(data), message: 'Pricing tier created' }; }
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: UpdatePricingTierDto) { return { success: true, data: await this.service.updateTier(id, data), message: 'Updated' }; }
    @Delete(':id')
    async remove(@Param('id') id: string) { await this.service.deleteTier(id); return { success: true, data: null, message: 'Deleted' }; }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/print-types')
export class PrintTypesController {
    constructor(private readonly service: MasterDataService) {}

    @Get()
    async findAll() { return { success: true, data: await this.service.findAllPrintTypes() }; }
    @Post()
    async create(@Body() data: CreatePrintTypeDto) { return { success: true, data: await this.service.createPrintType(data) }; }
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: UpdatePrintTypeDto) { return { success: true, data: await this.service.updatePrintType(id, data) }; }
    @Delete(':id')
    async remove(@Param('id') id: string) { await this.service.deletePrintType(id); return { success: true, data: null }; }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/units')
export class UnitsController {
    constructor(private readonly service: MasterDataService) {}
    @Get()
    async findAll() { return { success: true, data: await this.service.findAllUnits() }; }
    @Post()
    async create(@Body() data: any) { return { success: true, data: await this.service.createUnit(data) }; }
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: any) { return { success: true, data: await this.service.updateUnit(id, data) }; }
    @Delete(':id')
    async remove(@Param('id') id: string) { await this.service.deleteUnit(id); return { success: true, data: null }; }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/printers')
export class ErpPrintersController {
    constructor(private readonly service: MasterDataService) {}
    @Get()
    async findAll() { return { success: true, data: await this.service.findAllPrinters() }; }
}

@UseGuards(AuthGuard('jwt'))
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
    async create(@Body() data: CreateLargeFormatPricingDto) { return { success: true, data: await this.service.createLargeFormatTier(data), message: 'Large format tier created' }; }
    @Put(':id')
    async update(@Param('id') id: string, @Body() data: UpdateLargeFormatPricingDto) { return { success: true, data: await this.service.updateLargeFormatTier(id, data), message: 'Updated' }; }
    @Delete(':id')
    async remove(@Param('id') id: string) { await this.service.deleteLargeFormatTier(id); return { success: true, data: null, message: 'Deleted' }; }
}
