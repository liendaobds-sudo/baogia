import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PermissionsGuard, Permissions } from '../../auth/permissions.guard';
import { CustomersService } from '../services/customers.service';
import { RfmScoringService } from '../services/rfm-scoring.service';
import { CreateCustomerDto, UpdateCustomerDto } from '../dto/create-customer.dto';
import { Customer, CustomerPriceGroup } from '../../../entities';

@ApiTags('Customers')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/customers')
export class ErpCustomersController {
    constructor(
        private readonly service: CustomersService,
        private readonly rfmService: RfmScoringService,
    ) { }

    @Get()
    @Permissions('customer.view')
    async findAll(
        @Query('action') action?: string,
        @Query('search') search?: string,
        @Query('q') q?: string,
        @Query('tag') tag?: string,
        @Query('segment') segment?: string,
        @Query('lifecycle_stage') lifecycleStage?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('phone') phone?: string,
        @Query('query') query?: string,
    ) {
        if (action === 'lookup') {
            return { success: true, data: await this.service.lookupByPhone(phone || '') };
        }
        if (action === 'smart_lookup') {
            return { success: true, data: await this.service.smartLookup(query || '') };
        }

        const data = await this.service.findAllCustomers({
            search: search || q, tag, segment,
            lifecycle_stage: lifecycleStage,
            page: page ? parseInt(page) : undefined,
            limit: limit ? parseInt(limit) : undefined,
        });
        return { success: true, data };
    }

    @Get(':id')
    @Permissions('customer.view')
    async findOne(@Param('id') id: string) {
        const data = await this.service.findCustomerById(id);
        if (!data) return { success: false, error: 'Customer not found' };
        return { success: true, data };
    }

    @Post()
    @Permissions('customer.create')
    async create(@Body() body: CreateCustomerDto) {
        try {
            return { success: true, data: await this.service.createCustomer(body), message: 'Customer created successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Put(':id')
    @Permissions('customer.edit')
    async update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
        try {
            return { success: true, data: await this.service.updateCustomer(id, body), message: 'Customer updated successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Delete(':id')
    @Permissions('customer.delete')
    async remove(@Param('id') id: string) {
        try {
            await this.service.deleteCustomer(id);
            return { success: true, message: 'Customer deleted successfully' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Get(':id/interactions')
    @Permissions('customer.view')
    async getInteractions(@Param('id') id: string) {
        return { success: true, data: await this.service.findInteractions(id) };
    }

    @Post(':id/interactions')
    @Permissions('customer.create')
    async addInteraction(@Param('id') id: string, @Body() body: any) {
        try {
            const data = await this.service.createInteraction({ ...body, customer_id: parseInt(id) });
            return { success: true, data, message: 'Interaction created' };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }

    @Post('rfm/calculate')
    @Permissions('customer.edit')
    async calculateRfm() {
        try {
            const result = await this.rfmService.calculateAll();
            return { success: true, data: result, message: `Đã tính RFM cho ${result.scored} khách hàng` };
        } catch (e: unknown) {
            throw new HttpException(e instanceof Error ? e.message : 'Unknown error', HttpStatus.BAD_REQUEST);
        }
    }
}

/**
 * Nhóm giá khách hàng (chứa `discount_percent`).
 *
 * Audit 2026-08-29: trước đây chỉ có `AuthGuard('jwt')` mà KHÔNG có `PermissionsGuard`
 * ⇒ mọi user đăng nhập (kể cả role thấp nhất) ghi/xoá được cấu hình chiết khấu. Nay
 * dùng cùng quyền `customer.*` như controller khách hàng.
 */
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('erp/customer-price-groups')
export class ErpCustomerPriceGroupsController {
    constructor(private readonly service: CustomersService) { }

    @Get()
    @Permissions('customer.view')
    async findAll() { return { success: true, data: await this.service.findAllGroups() }; }
    @Post()
    @Permissions('customer.create')
    async create(@Body() body: Partial<CustomerPriceGroup>) { return { success: true, data: await this.service.createGroup(body), message: 'Group created' }; }
    @Put(':id')
    @Permissions('customer.edit')
    async update(@Param('id') id: string, @Body() body: Partial<CustomerPriceGroup>) { return { success: true, data: await this.service.updateGroup(id, body), message: 'Group updated' }; }
    @Delete(':id')
    @Permissions('customer.delete')
    async remove(@Param('id') id: string) { await this.service.deleteGroup(id); return { success: true, message: 'Group deleted' }; }
}
