import { Controller, Post, Body, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { MaterialsService } from '../services/materials.service';
import { CreateInventorySlipDto } from '../dto/inventory-slip.dto';

@ApiTags('Inventory')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/inventory')
export class ErpInventoryController {
    constructor(private readonly materialsService: MaterialsService) {}

    @Post()
    @Permissions('material.create', 'material.edit')
    async createInventorySlip(@Body() data: CreateInventorySlipDto) {
        const result = await this.materialsService.createInventorySlip(data as unknown as Record<string, unknown>);
        if (!result.success) {
            throw new HttpException(result.error || 'Failed to create inventory slip', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        return result;
    }
}
