import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaterialCategory } from '../entities/material-categories.entity';
import { CreateMaterialCategoryDto, UpdateMaterialCategoryDto } from '../dto/material-categories.dto';

@Injectable()
export class MaterialCategoriesService {
  constructor(
    @InjectRepository(MaterialCategory)
    private repository: Repository<MaterialCategory>,
  ) {}

  async findAll(): Promise<MaterialCategory[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<MaterialCategory> {
    const item = await this.repository.findOne({ where: { id: id as any } });
    if (!item) throw new NotFoundException('Not found');
    return item;
  }

  async create(dto: CreateMaterialCategoryDto): Promise<MaterialCategory> {
    const item = this.repository.create(dto);
    return this.repository.save(item);
  }

  async update(id: number, dto: UpdateMaterialCategoryDto): Promise<MaterialCategory> {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repository.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
