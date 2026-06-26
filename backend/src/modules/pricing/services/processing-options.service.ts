import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessingOption } from '../entities/processing-options.entity';
import { CreateProcessingOptionDto, UpdateProcessingOptionDto } from '../dto/processing-options.dto';

@Injectable()
export class ProcessingOptionsService {
  constructor(
    @InjectRepository(ProcessingOption)
    private repository: Repository<ProcessingOption>,
  ) {}

  async findAll(): Promise<ProcessingOption[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<ProcessingOption> {
    const item = await this.repository.findOne({ where: { id: id as any } });
    if (!item) throw new NotFoundException('Not found');
    return item;
  }

  async create(dto: CreateProcessingOptionDto): Promise<ProcessingOption> {
    const item = this.repository.create(dto);
    return this.repository.save(item);
  }

  async update(id: number, dto: UpdateProcessingOptionDto): Promise<ProcessingOption> {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repository.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
