import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { MaterialsService } from '../services/materials.service';
import { CreateMaterialDto, UpdateMaterialDto } from '../dto/create-material.dto';
import { Material, MaterialType } from '../../../entities';
import { MaterialCategory } from '../entities/material-categories.entity';
import { ProcessingOption } from '../entities/processing-options.entity';
import { CreateMaterialTypeDto, UpdateMaterialTypeDto } from '../dto/material-types.dto';
import { CreateMaterialCategoryDto, UpdateMaterialCategoryDto } from '../dto/material-categories.dto';
import { CreateProcessingOptionDto, UpdateProcessingOptionDto } from '../dto/processing-options.dto';
import { ProductType } from '../scope/resource-scope-rule';
import { UpdateScopeDto } from '../dto/update-scope.dto';

@ApiTags('Materials')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/materials')
export class ErpMaterialsController {
    constructor(private readonly service: MaterialsService) { }

    @Get()
    @Permissions('material.view', 'quote.view', 'quote.create')
    async findAll(
        @Query('action') action?: string,
        @Query('type') type?: string,
        @Query('category') category?: string,
        @Query('status') status?: string,
        @Query('keyword') keyword?: string,
        @Query('scope') scope?: string,
        @Query('activeOnly') activeOnly?: string,
        @Query('tab_scope') tabScope?: string,
        @Query('material_format') materialFormat?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('code') code?: string,
        @Query('name') name?: string,
        @Query('exclude_id') excludeId?: string,
    ) {
        // Action-based endpoints (matching PHP ?action=xxx pattern)
        if (action === 'low_stock') {
            return { success: true, data: await this.service.findLowStock() };
        }
        if (action === 'missing_pricing') {
            return { success: true, data: await this.service.findMissingPricing(limit ? parseInt(limit) : undefined) };
        }
        if (action === 'check_code') {
            return { success: true, data: await this.service.checkCode(code || '', excludeId) };
        }
        if (action === 'check_name') {
            return { success: true, data: await this.service.checkName(name || '', excludeId) };
        }

        // Default: list with filters + optional pagination
        const data = await this.service.findAllMaterials({
            type, category, status, keyword, scope,
            activeOnly: activeOnly === 'true',
            tab_scope: tabScope, material_format: materialFormat,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
        return { success: true, data };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const data = await this.service.findMaterialById(id);
        if (!data) return { success: false, error: 'Not found' };
        return { success: true, data };
    }

    @Post()
    @Permissions('material.edit')
    async create(@Body() data: CreateMaterialDto) {
        try {
            return { success: true, data: await this.service.createMaterial(data), message: 'Material created successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Put(':id')
    @Permissions('material.edit')
    async update(@Param('id') id: string, @Body() data: UpdateMaterialDto) {
        try {
            return { success: true, data: await this.service.updateMaterial(id, data), message: 'Material updated successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Delete(':id')
    @Permissions('material.edit')
    async remove(@Param('id') id: string) {
        try {
            await this.service.deleteMaterial(id);
            return { success: true, message: 'Material and its associated pricing tiers deleted successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    // PATCH /erp/materials/:id/scope — gán Cờ_Phạm_Vi (Màn_Quản_Trị_Phạm_Vi).
    // validateScopeFlags ở service: không hợp lệ → 422 + invalidFlags, giữ giá trị cũ.
    @Patch(':id/scope')
    @Permissions('material.view')
    async updateScope(@Param('id') id: string, @Body() data: UpdateScopeDto) {
        const result = await this.service.updateMaterialScope(id, data);
        return { success: true, data: result.data, scopeLabel: result.scopeLabel, message: 'Scope updated successfully' };
    }
}

@ApiTags('Material Types')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/material-types')
export class ErpMaterialTypesController {
    constructor(private readonly service: MaterialsService) { }

    @Get()
    async findAll() { return { success: true, data: await this.service.findAllTypes() }; }
    @Post()
    @Permissions('material.edit')
    async create(@Body() data: CreateMaterialTypeDto) { return { success: true, data: await this.service.createType(data) }; }
    @Put(':id')
    @Permissions('material.edit')
    async update(@Param('id') id: string, @Body() data: UpdateMaterialTypeDto) { return { success: true, data: await this.service.updateType(id, data) }; }
    @Delete(':id')
    @Permissions('material.edit')
    async remove(@Param('id') id: string) { await this.service.deleteType(id); return { success: true }; }
}

@ApiTags('Material Categories')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/material-categories')
export class ErpMaterialCategoriesController {
    constructor(private readonly service: MaterialsService) { }

    @Get()
    async findAll(@Query('active_only') activeOnly?: string) { return { success: true, data: await this.service.findAllCategories(activeOnly) }; }
    @Post()
    @Permissions('material.edit')
    async create(@Body() data: CreateMaterialCategoryDto) { return { success: true, data: await this.service.createCategory(data) }; }
    @Put(':id')
    @Permissions('material.edit')
    async update(@Param('id') id: string, @Body() data: UpdateMaterialCategoryDto) { return { success: true, data: await this.service.updateCategory(id, data) }; }
    @Delete(':id')
    @Permissions('material.edit')
    async remove(@Param('id') id: string) { await this.service.deleteCategory(id); return { success: true }; }
}

@ApiTags('Processing Options')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/processing-options')
export class ErpProcessingOptionsController {
    constructor(private readonly service: MaterialsService) { }

    @Get()
    async findAll(
        @Query('scope') scope?: string,
        @Query('activeOnly') activeOnly?: string,
    ) {
        const validScopes = ['loose', 'bound', 'large_format'];
        const scopeParam = scope && validScopes.includes(scope) ? (scope as ProductType) : undefined;
        return {
            success: true,
            data: await this.service.findAllProcessingOptions({
                scope: scopeParam,
                activeOnly: activeOnly === 'true',
            }),
        };
    }
    @Post()
    @Permissions('material.edit')
    async create(@Body() data: CreateProcessingOptionDto) { return { success: true, data: await this.service.createProcessingOption(data) }; }
    @Put(':id')
    @Permissions('material.edit')
    async update(@Param('id') id: string, @Body() data: UpdateProcessingOptionDto) { return { success: true, data: await this.service.updateProcessingOption(id, data) }; }
    // PATCH /erp/processing-options/:id/scope — gán Cờ_Phạm_Vi (Màn_Quản_Trị_Phạm_Vi).
    @Patch(':id/scope')
    @Permissions('material.edit')
    async updateScope(@Param('id') id: string, @Body() data: UpdateScopeDto) {
        const result = await this.service.updateProcessingOptionScope(id, data);
        return { success: true, data: result.data, scopeLabel: result.scopeLabel, message: 'Scope updated successfully' };
    }
    @Delete(':id')
    @Permissions('material.edit')
    async remove(@Param('id') id: string) { await this.service.deleteProcessingOption(id); return { success: true }; }
}

// Giá gia công (thành phần giá) — TRƯỚC ĐÂY hoàn toàn PUBLIC. Thêm guard + RBAC.
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/processing-pricing')
export class ErpProcessingPricingController {
    constructor(private readonly service: MaterialsService) { }

    @Get()
    async findAll() { return { success: true, data: await this.service.findAllProcessingPricing() }; }

    @Post()
    @Permissions('material.edit')
    async create(@Body() data: any) { return { success: true, data: await this.service.createProcessingPricing(data) }; }

    @Put(':id')
    @Permissions('material.edit')
    async update(@Param('id') id: string, @Body() data: any) { return { success: true, data: await this.service.updateProcessingPricing(id, data) }; }

    @Delete(':id')
    @Permissions('material.edit')
    async remove(@Param('id') id: string) { await this.service.deleteProcessingPricing(id); return { success: true }; }
}
