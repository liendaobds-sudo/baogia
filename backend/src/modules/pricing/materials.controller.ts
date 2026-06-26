/**
 * Materials CRUD Controller
 *
 * Port of: api/materials.php (612 lines PHP → NestJS)
 * Supports: list, get, create, update, delete, filters, pagination, validation
 *
 * Response format matches PHP: { success: true, data: ... }
 */

import {
    Controller, Get, Post, Put, Delete,
    Body, Query, Param, Logger, HttpCode,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { Material } from '../../entities';

@Controller('erp/materials')
export class MaterialsController {
    private readonly logger = new Logger(MaterialsController.name);

    constructor(
        @InjectRepository(Material) private repo: Repository<Material>,
    ) { }

    // ═══════════════════════════════════════
    // GET /materials — List all with filters
    // ═══════════════════════════════════════

    @Get()
    async findAll(
        @Query('id') id?: string,
        @Query('action') action?: string,
        @Query('type') type?: string,
        @Query('status') status?: string,
        @Query('keyword') keyword?: string,
        @Query('scope') scope?: string,
        @Query('category') category?: string,
        @Query('material_format') materialFormat?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('code') code?: string,
        @Query('name') name?: string,
        @Query('exclude_id') excludeId?: string,
    ) {
        try {
            // Single material by ID
            if (id) {
                const material = await this.repo.findOne({ where: { id: parseInt(id) } });
                if (!material) return { success: false, error: 'Material not found' };
                return { success: true, data: material };
            }

            // Action: check_code
            if (action === 'check_code') {
                if (!code) return { success: true, data: { exists: false } };
                const qb = this.repo.createQueryBuilder('m').where('m.code = :code', { code });
                if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId: parseInt(excludeId) });
                const exists = await qb.getCount() > 0;
                return { success: true, data: { exists, code } };
            }

            // Action: check_name
            if (action === 'check_name') {
                if (!name) return { success: true, data: { exists: false } };
                const qb = this.repo.createQueryBuilder('m').where('LOWER(m.name) = LOWER(:name)', { name });
                if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId: parseInt(excludeId) });
                const existing = await qb.getOne();
                return { success: true, data: { exists: !!existing, name, existing_code: existing?.code ?? null } };
            }

            // Action: low_stock
            if (action === 'low_stock') {
                const materials = await this.repo.createQueryBuilder('m')
                    .where('m.stock < m.min_stock')
                    .orderBy('m.name', 'ASC')
                    .getMany();
                return { success: true, data: materials };
            }

            // Build query with filters
            const qb = this.repo.createQueryBuilder('m');

            if (type) qb.andWhere('m.type = :type', { type });
            if (category) qb.andWhere('m.category = :category', { category });
            if (materialFormat) qb.andWhere('m.material_format = :materialFormat', { materialFormat });

            if (status === 'low_stock') {
                qb.andWhere('m.min_stock > 0 AND m.stock <= m.min_stock');
            } else if (status === 'normal') {
                qb.andWhere('(m.min_stock = 0 OR m.min_stock IS NULL OR m.stock > m.min_stock)');
            } else if (status) {
                qb.andWhere('m.status = :status', { status });
            }

            if (keyword) {
                qb.andWhere('(m.code LIKE :kw OR m.name LIKE :kw)', { kw: `%${keyword}%` });
            }

            if (scope === 'loose') qb.andWhere('m.scope_loose = 1');
            if (scope === 'bound') qb.andWhere('m.scope_bound = 1');
            if (scope === 'large_format') qb.andWhere('m.scope_large_format = 1');

            qb.orderBy('m.name', 'ASC');

            // Pagination
            const pageNum = page ? Math.max(1, parseInt(page)) : null;
            const limitNum = limit ? Math.max(1, Math.min(500, parseInt(limit))) : null;

            if (pageNum && limitNum) {
                const total = await qb.getCount();
                const offset = (pageNum - 1) * limitNum;
                const items = await qb.skip(offset).take(limitNum).getMany();
                const totalPages = Math.ceil(total / limitNum);

                return {
                    success: true,
                    data: {
                        items,
                        pagination: {
                            page: pageNum, limit: limitNum, total,
                            total_pages: totalPages,
                            has_prev: pageNum > 1,
                            has_next: pageNum < totalPages,
                        },
                    },
                };
            }

            const materials = await qb.getMany();
            return { success: true, data: materials };
        } catch (error) {
            this.logger.error('Materials list error', error);
            return { success: false, error: 'Có lỗi xảy ra' };
        }
    }

    // ═══════════════════════════════════════
    // POST /materials — Create
    // ═══════════════════════════════════════

    @Post()
    async create(@Body() data: Partial<Material>) {
        try {
            if (!data.name) return { success: false, error: 'Name is required' };

            // Auto-generate code if empty
            if (!data.code) {
                const micro = Date.now().toString().slice(-4);
                data.code = `MAT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${micro}${Math.floor(Math.random() * 10)}`;
            }

            // Check duplicate code
            const existing = await this.repo.findOne({ where: { code: data.code } });
            if (existing) return { success: false, error: `Material code already exists (${data.code})` };

            const material = this.repo.create(data);
            const saved = await this.repo.save(material);
            return { success: true, data: saved, message: 'Material created successfully' };
        } catch (error) {
            this.logger.error('Material create error', error);
            return { success: false, error: 'Có lỗi xảy ra' };
        }
    }

    // ═══════════════════════════════════════
    // PUT /materials/:id — Update
    // ═══════════════════════════════════════

    @Put(':id')
    async update(@Param('id') id: string, @Body() data: Partial<Material>) {
        try {
            const material = await this.repo.findOne({ where: { id: parseInt(id) } });
            if (!material) return { success: false, error: 'Material not found' };

            // Check duplicate code
            if (data.code && data.code !== material.code) {
                const dup = await this.repo.findOne({ where: { code: data.code } });
                if (dup) return { success: false, error: 'Material code already exists' };
            }

            Object.assign(material, data);
            const saved = await this.repo.save(material);
            return { success: true, data: saved, message: 'Material updated successfully' };
        } catch (error) {
            this.logger.error('Material update error', error);
            return { success: false, error: 'Có lỗi xảy ra' };
        }
    }

    // ═══════════════════════════════════════
    // DELETE /materials/:id — Delete with dependency check
    // ═══════════════════════════════════════

    @Delete(':id')
    async remove(@Param('id') id: string) {
        try {
            const materialId = parseInt(id);
            const material = await this.repo.findOne({ where: { id: materialId } });
            if (!material) return { success: false, error: 'Material not found' };

            // Check dependencies
            const deps: string[] = [];
            const manager = this.repo.manager;

            const invCount = await manager.query(
                'SELECT COUNT(*) as cnt FROM inventory_slip_items WHERE material_id = $1',
                [materialId],
            ).catch(() => [{ cnt: 0 }]);
            if (invCount[0]?.cnt > 0) deps.push(`Phiếu kho: ${invCount[0].cnt} bản ghi`);

            const tierCount = await manager.query(
                'SELECT COUNT(*) as cnt FROM pricing_tiers WHERE material_id = $1',
                [materialId],
            ).catch(() => [{ cnt: 0 }]);
            if (tierCount[0]?.cnt > 0) deps.push(`Định mức giá: ${tierCount[0].cnt} bản ghi`);

            const quoteCount = await manager.query(
                'SELECT COUNT(*) as cnt FROM quote_items WHERE material_id = $1',
                [materialId],
            ).catch(() => [{ cnt: 0 }]);
            if (quoteCount[0]?.cnt > 0) deps.push(`Báo giá: ${quoteCount[0].cnt} bản ghi`);

            if (deps.length > 0) {
                return { success: false, error: `Không thể xóa vật tư "${material.name}" vì đang được sử dụng: ${deps.join(', ')}` };
            }

            await this.repo.remove(material);
            return { success: true, data: null, message: 'Material deleted successfully' };
        } catch (error) {
            this.logger.error('Material delete error', error);
            return { success: false, error: 'Có lỗi xảy ra' };
        }
    }
}
