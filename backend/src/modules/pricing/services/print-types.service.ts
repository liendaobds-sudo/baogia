import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrintType } from '../../../entities';
import { CreatePrintTypeDto, UpdatePrintTypeDto } from '../dto/print-types.dto';

@Injectable()
export class PrintTypesService {
  constructor(
    @InjectRepository(PrintType)
    private repository: Repository<PrintType>,
  ) {}

  async findAll(): Promise<PrintType[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<PrintType> {
    const item = await this.repository.findOne({ where: { id: id as any } });
    if (!item) throw new NotFoundException('Not found');
    return item;
  }

  async create(dto: CreatePrintTypeDto): Promise<PrintType> {
    const item = this.repository.create(dto);
    return this.repository.save(item);
  }

  async update(id: number, dto: UpdatePrintTypeDto): Promise<PrintType> {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repository.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
