import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialType } from '../../../entities/material-type.entity';
import { CreateMaterialTypeDto, UpdateMaterialTypeDto } from '../dto/material-types.dto';

@Injectable()
export class MaterialTypesService {
  constructor(
    @InjectRepository(MaterialType)
    private repository: Repository<MaterialType>,
  ) {}

  async findAll(): Promise<MaterialType[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<MaterialType> {
    const item = await this.repository.findOne({ where: { id: id as any } });
    if (!item) throw new NotFoundException('Not found');
    return item;
  }

  async create(dto: CreateMaterialTypeDto): Promise<MaterialType> {
    const item = this.repository.create(dto);
    return this.repository.save(item);
  }

  async update(id: number, dto: UpdateMaterialTypeDto): Promise<MaterialType> {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repository.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
