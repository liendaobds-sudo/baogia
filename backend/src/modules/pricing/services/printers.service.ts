import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Printer } from '../entities/printers.entity';
import { CreatePrinterDto, UpdatePrinterDto } from '../dto/printers.dto';

@Injectable()
export class PrintersService {
  constructor(
    @InjectRepository(Printer)
    private repository: Repository<Printer>,
  ) {}

  async findAll(): Promise<Printer[]> {
    return this.repository.find();
  }

  async findOne(id: number): Promise<Printer> {
    const item = await this.repository.findOne({ where: { id: id as any } });
    if (!item) throw new NotFoundException('Not found');
    return item;
  }

  async create(dto: CreatePrinterDto): Promise<Printer> {
    const item = this.repository.create(dto);
    return this.repository.save(item);
  }

  async update(id: number, dto: UpdatePrinterDto): Promise<Printer> {
    const item = await this.findOne(id);
    Object.assign(item, dto);
    return this.repository.save(item);
  }

  async remove(id: number): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
  }
}
