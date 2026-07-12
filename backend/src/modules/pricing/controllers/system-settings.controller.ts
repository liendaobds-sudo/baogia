import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { SystemSettingsService } from '../services/system-settings.service';
import { PricingConfig } from '../../../entities';

@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/system-settings')
export class ErpSystemSettingsController {
    constructor(private readonly service: SystemSettingsService) {}
    @Get()
    @Permissions('settings.view')
    async findAll() { return { success: true, data: await this.service.findAllSettings() }; }
    @Post()
    @Permissions('settings.edit')
    async update(@Body() body: { site: Record<string, string>; system: Record<string, string> }) { await this.service.updateSettings(body); return { success: true, message: 'Settings updated successfully' }; }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/pricing-config')
export class ErpPricingConfigController {
    constructor(private readonly service: SystemSettingsService) {}
    @Get()
    async findAll() { return { success: true, data: await this.service.findAllConfigs() }; }
    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Partial<PricingConfig>) { return { success: true, data: await this.service.updateConfig(id, body), message: 'Pricing config updated' }; }
}

@UseGuards(AuthGuard('jwt'))
@Controller('erp/setup-fees')
export class ErpSetupFeesController {
    constructor(private readonly service: SystemSettingsService) {}

    @Get()
    async findAll(
        @Query('action') action?: string,
        @Query('id') id?: string,
        @Query('type') type?: string,
        @Query('category') category?: string,
        @Query('active') active?: string,
        @Query('grouped') grouped?: string,
        @Query('print_method') printMethod?: string,
        @Query('sheets') sheets?: string,
        @Query('sides') sides?: string,
        @Query('paper_size_id') paperSizeId?: string,
        @Query('has_die_cut') hasDieCut?: string,
        @Query('has_design') hasDesign?: string,
        @Query('is_new_die_mold') isNewDieMold?: string,
    ) {
        // Calculate action
        if (action === 'calculate') {
            return {
                success: true,
                data: await this.service.calculateSetupFees({
                    print_method: printMethod, sheets: sheets ? parseInt(sheets) : 0,
                    sides: sides ? parseInt(sides) : 1, paper_size_id: paperSizeId,
                    has_die_cut: hasDieCut === '1', has_design: hasDesign,
                    is_new_die_mold: isNewDieMold !== '0',
                }),
            };
        }

        // Single by ID
        if (id) {
            const data = await this.service.findFeeById(id);
            if (!data) return { success: false, error: 'Setup fee not found' };
            return { success: true, data };
        }

        // List with filters
        return { success: true, data: await this.service.findAllFees({ type, category, active, grouped }) };
    }

    @Post()
    async create(@Body() body: { code: string; name: string; fee_type: string; category?: string; price_per_unit?: number | string; price_per_side?: number | string; price_fixed?: number | string; paper_size_id?: number | null; min_sheets?: number | string; description?: string; is_active?: boolean | number }) {
        try {
            return { success: true, data: await this.service.createFee(body), message: 'Đã tạo phí setup thành công' };
        } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Partial<{ code: string; name: string; fee_type: string; category: string; price_per_unit: number | string; price_per_side: number | string; price_fixed: number | string; paper_size_id: number | null; min_sheets: number | string; description: string; is_active: boolean | number }>) {
        try {
            return { success: true, data: await this.service.updateFee(id, body), message: 'Đã cập nhật phí setup' };
        } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.service.deleteFee(id);
        return { success: true, message: 'Đã xóa phí setup' };
    }
}

// Chi phí mực in (ink_costs) — dữ liệu live cho deriveTierCost (master-data.service).
// Cụm production_costs singleton (findAllCosts/saveCosts/calculateCostPerSheet/generatePricingTiers)
// đã bị gỡ: tầng chi phí chuyển sang hồ sơ per-máy (printers) + deriveTierCost.
@UseGuards(AuthGuard('jwt'))
@Controller('erp/production-costs')
export class ErpProductionCostsController {
    constructor(private readonly service: SystemSettingsService) {}

    @Get()
    async findAll(@Query('action') action?: string) {
        if (action === 'ink_costs') {
            return { success: true, data: await this.service.findAllInkCosts() };
        }
        return { success: false, error: 'Unsupported action' };
    }

    @Post()
    async save(
        @Query('action') action?: string,
        @Body() body: Record<string, unknown> = {},
    ) {
        try {
            if (action === 'ink_costs') {
                if (!body.items || !Array.isArray(body.items)) return { success: false, error: 'Invalid data format' };
                await this.service.saveInkCosts(body.items);
                return { success: true, message: 'Đã lưu chi phí mực in' };
            }
            return { success: false, error: 'Unsupported action' };
        } catch (e: unknown) { return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
    }
}
