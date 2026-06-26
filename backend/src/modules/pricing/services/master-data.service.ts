import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaperSize, PricingTier, PrintType, Unit, LargeFormatPricing } from '../../../entities';
import { Printer } from '../entities/printers.entity';

@Injectable()
export class MasterDataService {
    constructor(
        @InjectRepository(PaperSize) private paperRepo: Repository<PaperSize>,
        @InjectRepository(PricingTier) private tierRepo: Repository<PricingTier>,
        @InjectRepository(PrintType) private printRepo: Repository<PrintType>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        @InjectRepository(Printer) private printDeviceRepo: Repository<Printer>,
        @InjectRepository(LargeFormatPricing) private lfTierRepo: Repository<LargeFormatPricing>,
    ) { }

    // --- Paper Sizes ---
    async findAllPaperSizes(scope?: string) {
        const where: any = {};
        if (scope === 'loose') where.scopeLoose = true;
        if (scope === 'bound') where.scopeBound = true;
        if (scope === 'large_format') where.scopeLargeFormat = true;
        if (scope === 'offset') where.scopeOffset = true;
        
        return this.paperRepo.find({ where, order: { name: 'ASC' } });
    }
    async findPaperSizeById(id: string) { return this.paperRepo.findOne({ where: { id: parseInt(id) } }); }
    async createPaperSize(data: Partial<PaperSize>) { return this.paperRepo.save(this.paperRepo.create(data)); }
    async updatePaperSize(id: string, data: Partial<PaperSize>) {
        await this.paperRepo.update(parseInt(id), data);
        return this.paperRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deletePaperSize(id: string) { await this.paperRepo.delete(parseInt(id)); }

    // --- Pricing Tiers ---
    async findAllTiers(materialId?: string) {
        const where: Record<string, unknown> = {};
        if (materialId) where.materialId = parseInt(materialId);
        return this.tierRepo.find({ where, order: { quantityFrom: 'ASC' } });
    }
    async findTierById(id: string) { return this.tierRepo.findOne({ where: { id: parseInt(id) } }); }
    async createTier(data: Partial<PricingTier>) {
        await this.checkTierOverlap(data);
        return this.tierRepo.save(this.tierRepo.create(data));
    }
    async updateTier(id: string, data: Partial<PricingTier>) {
        const existing = await this.tierRepo.findOne({ where: { id: parseInt(id) } });
        if (!existing) throw new BadRequestException('Tier not found');
        
        await this.checkTierOverlap({ ...existing, ...data }, parseInt(id));
        await this.tierRepo.update(parseInt(id), data);
        return this.tierRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteTier(id: string) { await this.tierRepo.delete(parseInt(id)); }

    private async checkTierOverlap(data: Partial<PricingTier>, excludeId: number = 0) {
        if (!data.materialId || !data.paperSizeId) return; // Basic validation would handle this

        const query = this.tierRepo.createQueryBuilder('pt')
            .where('pt.materialId = :materialId', { materialId: data.materialId })
            .andWhere('pt.paperSizeId = :paperSizeId', { paperSizeId: data.paperSizeId })
            .andWhere('pt.printSide = :printSide', { printSide: data.printSide || 'single' })
            .andWhere('pt.printType = :printType', { printType: data.printType || '4c' })
            .andWhere('pt.technology = :technology', { technology: data.technology || 'digital_toner' });
            
        if (excludeId) {
            query.andWhere('pt.id != :excludeId', { excludeId });
        }

        const existingTiers = await query.getMany();
        
        const qFrom = data.quantityFrom || 0;
        const qTo = data.quantityTo !== null && data.quantityTo !== undefined ? data.quantityTo : Number.MAX_SAFE_INTEGER;

        for (const tier of existingTiers) {
            const eFrom = tier.quantityFrom || 0;
            const eTo = tier.quantityTo !== null && tier.quantityTo !== undefined ? tier.quantityTo : Number.MAX_SAFE_INTEGER;
            
            if (qFrom <= eTo && qTo >= eFrom) {
                const rangeStr = `${eFrom} - ${tier.quantityTo !== null ? tier.quantityTo : '∞'}`;
                throw new BadRequestException(`Khoảng số lượng bị trùng với định mức đã có (${rangeStr}). Vui lòng chọn khoảng phân bổ khác.`);
            }
        }
    }

    // --- Print Types ---
    async findAllPrintTypes() { return this.printRepo.find({ order: { name: 'ASC' } }); }
    async findPrintTypeById(id: string) { return this.printRepo.findOne({ where: { id: parseInt(id) } }); }
    async createPrintType(data: Partial<PrintType>) { return this.printRepo.save(this.printRepo.create(data)); }
    async updatePrintType(id: string, data: Partial<PrintType>) {
        await this.printRepo.update(parseInt(id), data);
        return this.printRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deletePrintType(id: string) { await this.printRepo.delete(parseInt(id)); }

    // --- Units ---
    async findAllUnits() { return this.unitRepo.find({ order: { name: 'ASC' } }); }
    async createUnit(data: Partial<Unit>) { return this.unitRepo.save(this.unitRepo.create(data)); }
    async updateUnit(id: string, data: Partial<Unit>) {
        await this.unitRepo.update(parseInt(id), data);
        return this.unitRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteUnit(id: string) { await this.unitRepo.delete(parseInt(id)); }

    // --- Printers ---
    async findAllPrinters() { return this.printDeviceRepo.find({ order: { name: 'ASC' } }); }

    // --- Large Format Pricing Tiers ---
    async findAllLargeFormatTiers(materialId?: string) {
        const where: Record<string, unknown> = {};
        if (materialId) where.materialId = parseInt(materialId);
        return this.lfTierRepo.find({ where, order: { areaFrom: 'ASC' } });
    }
    async findLargeFormatTierById(id: string) { return this.lfTierRepo.findOne({ where: { id: parseInt(id) } }); }
    async createLargeFormatTier(data: Partial<LargeFormatPricing>) {
        return this.lfTierRepo.save(this.lfTierRepo.create(data));
    }
    async updateLargeFormatTier(id: string, data: Partial<LargeFormatPricing>) {
        await this.lfTierRepo.update(parseInt(id), data);
        return this.lfTierRepo.findOne({ where: { id: parseInt(id) } });
    }
    async deleteLargeFormatTier(id: string) { await this.lfTierRepo.delete(parseInt(id)); }
}
