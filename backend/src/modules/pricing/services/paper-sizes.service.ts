import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PaperSize } from '../../../entities';
import { CreatePaperSizeDto, UpdatePaperSizeDto } from '../dto/paper-size.dto';

@Injectable()
export class PaperSizesService {
  constructor(
    @InjectRepository(PaperSize)
    private paperSizesRepository: Repository<PaperSize>,
  ) {}

  async findAll(): Promise<PaperSize[]> {
    return this.paperSizesRepository.find({
      order: {
        isStandard: 'DESC',
        name: 'ASC'
      },
    });
  }

  async findOne(id: number): Promise<PaperSize> {
    const size = await this.paperSizesRepository.findOne({ where: { id } });
    if (!size) {
      throw new NotFoundException('Paper size not found');
    }
    return size;
  }

  async create(dto: CreatePaperSizeDto): Promise<PaperSize> {
    const existing = await this.paperSizesRepository.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException('Paper size code already exists');
    }

    const size = this.paperSizesRepository.create(dto);
    return this.paperSizesRepository.save(size);
  }

  async update(id: number, dto: UpdatePaperSizeDto): Promise<PaperSize> {
    const size = await this.findOne(id);

    if (dto.code && dto.code !== size.code) {
      const existing = await this.paperSizesRepository.findOne({ where: { code: dto.code } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('Paper size code already exists');
      }
    }

    Object.assign(size, dto);
    return this.paperSizesRepository.save(size);
  }

  async remove(id: number): Promise<void> {
    const size = await this.findOne(id);
    try {
      await this.paperSizesRepository.remove(size);
    } catch (error: unknown) {
      throw new BadRequestException('Không thể xóa: khổ giấy đang được sử dụng. ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async removeMultiple(ids: number[]): Promise<{ deleted: number, errors: string[] }> {
    let deleted = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const size = await this.paperSizesRepository.findOne({ where: { id } });
        if (size) {
          await this.paperSizesRepository.remove(size);
          deleted++;
        } else {
          errors.push(`ID ${id}: Not found`);
        }
      } catch (error: unknown) {
        errors.push(`ID ${id}: ` + (error instanceof Error ? error.message : String(error)));
      }
    }
    
    return { deleted, errors };
  }
}
