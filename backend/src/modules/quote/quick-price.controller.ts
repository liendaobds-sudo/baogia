import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuickPrice } from '../../entities/quick-price.entity';

@Controller('quick-prices')
@UseGuards(AuthGuard('jwt'))
export class QuickPriceController {

    constructor(
        @InjectRepository(QuickPrice) private repo: Repository<QuickPrice>,
    ) { }

    @Get()
    async findAll() {
        const data = await this.repo.find({ order: { name: 'ASC' } });
        return { data };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.repo.findOne({ where: { id } });
    }

    @Post()
    async create(@Body() body: Partial<QuickPrice>) {
        const entity = this.repo.create({
            name: body.name,
            keywords: body.keywords || [],
            unit: body.unit || 'tờ',
            tiers: body.tiers || [],
            notes: body.notes || '',
            isActive: body.isActive ?? true,
        });
        return this.repo.save(entity);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: Partial<QuickPrice>) {
        await this.repo.update(id, {
            name: body.name,
            keywords: body.keywords,
            unit: body.unit,
            tiers: body.tiers,
            notes: body.notes,
            isActive: body.isActive,
        });
        return this.repo.findOne({ where: { id } });
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await this.repo.delete(id);
        return { success: true };
    }
}
