import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from '../../../entities';
import { CreateUnitDto, UpdateUnitDto } from '../dto/unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private unitsRepository: Repository<Unit>,
  ) {}

  async findAll(): Promise<Unit[]> {
    return this.unitsRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Unit> {
    const unit = await this.unitsRepository.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  async create(createUnitDto: CreateUnitDto): Promise<Unit> {
    if (createUnitDto.code) {
      const existing = await this.unitsRepository.findOne({ where: { code: createUnitDto.code } });
      if (existing) throw new BadRequestException(`Unit code already exists (${createUnitDto.code})`);
    }

    const unit = this.unitsRepository.create(createUnitDto);
    if (!unit.type) unit.type = 'count';
    
    return this.unitsRepository.save(unit);
  }

  async update(id: number, updateUnitDto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.findOne(id);

    if (updateUnitDto.code && updateUnitDto.code !== unit.code) {
      const existing = await this.unitsRepository.findOne({ where: { code: updateUnitDto.code } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('Unit code already exists');
      }
    }

    Object.assign(unit, updateUnitDto);
    return this.unitsRepository.save(unit);
  }

  async remove(id: number): Promise<void> {
    const unit = await this.findOne(id);
    await this.unitsRepository.remove(unit);
  }
}
