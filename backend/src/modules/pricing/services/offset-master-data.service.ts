import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OffsetMachineConfig, PlatePricing, WasteRule } from '../../../entities';

/**
 * OffsetMasterDataService — CRUD cho dữ liệu master Offset
 * Admin có thể custom hoàn toàn: khổ máy, giá kẽm, bảng bù hao.
 * File độc lập — KHÔNG ảnh hưởng In KTS.
 */
@Injectable()
export class OffsetMasterDataService {
    private readonly logger = new Logger(OffsetMasterDataService.name);

    constructor(
        @InjectRepository(OffsetMachineConfig) private machineRepo: Repository<OffsetMachineConfig>,
        @InjectRepository(PlatePricing) private plateRepo: Repository<PlatePricing>,
        @InjectRepository(WasteRule) private wasteRepo: Repository<WasteRule>,
    ) {}

    // ═══ Machine Config CRUD ═══

    async getMachines(): Promise<OffsetMachineConfig[]> {
        return this.machineRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    }

    async getMachineById(id: number): Promise<OffsetMachineConfig | null> {
        return this.machineRepo.findOne({ where: { id } });
    }

    async createMachine(data: Partial<OffsetMachineConfig>): Promise<OffsetMachineConfig> {
        const machine = this.machineRepo.create(data);
        return this.machineRepo.save(machine);
    }

    async updateMachine(id: number, data: Partial<OffsetMachineConfig>): Promise<OffsetMachineConfig | null> {
        await this.machineRepo.update(id, data);
        return this.machineRepo.findOne({ where: { id } });
    }

    async deleteMachine(id: number): Promise<void> {
        await this.machineRepo.update(id, { isActive: false });
    }

    // ═══ Plate Pricing CRUD ═══

    async getPlatePricings(machineId?: number): Promise<PlatePricing[]> {
        const qb = this.plateRepo.createQueryBuilder('p')
            .where('p.isActive = :active', { active: true });
        if (machineId) qb.andWhere('p.machineId = :mid', { mid: machineId });
        qb.orderBy('p.id', 'ASC');
        return qb.getMany();
    }

    async createPlatePricing(data: Partial<PlatePricing>): Promise<PlatePricing> {
        const plate = this.plateRepo.create(data);
        return this.plateRepo.save(plate);
    }

    async updatePlatePricing(id: number, data: Partial<PlatePricing>): Promise<PlatePricing | null> {
        await this.plateRepo.update(id, data);
        return this.plateRepo.findOne({ where: { id } });
    }

    async deletePlatePricing(id: number): Promise<void> {
        await this.plateRepo.update(id, { isActive: false });
    }

    // ═══ Waste Rules CRUD ═══

    async getWasteRules(printMethod?: string): Promise<WasteRule[]> {
        const qb = this.wasteRepo.createQueryBuilder('w')
            .where('w.isActive = :active', { active: true });
        if (printMethod) qb.andWhere('w.printMethod = :pm', { pm: printMethod });
        // Loại các dòng "pricebook" (đường cong hao hụt của ENGINE offset) khỏi danh sách waste-rule VẬN HÀNH —
        // chúng được sửa qua /pricing/offset/cfg/hao-hut, không phải màn waste-rules.
        qb.andWhere("(w.description IS NULL OR w.description <> 'pricebook')");
        qb.orderBy('w.quantityFrom', 'ASC');
        return qb.getMany();
    }

    async createWasteRule(data: Partial<WasteRule>): Promise<WasteRule> {
        const rule = this.wasteRepo.create(data);
        return this.wasteRepo.save(rule);
    }

    async updateWasteRule(id: number, data: Partial<WasteRule>): Promise<WasteRule | null> {
        await this.wasteRepo.update(id, data);
        return this.wasteRepo.findOne({ where: { id } });
    }

    async deleteWasteRule(id: number): Promise<void> {
        await this.wasteRepo.update(id, { isActive: false });
    }

    // ═══ Aggregated Master Data (for Frontend dropdown) ═══

    async getAllMasterData() {
        const [machines, plates, wasteRules] = await Promise.all([
            this.getMachines(),
            this.getPlatePricings(),
            this.getWasteRules('offset'),
        ]);
        return { machines, plates, wasteRules };
    }
}
