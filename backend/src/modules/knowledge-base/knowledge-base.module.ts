import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KbDocument, KbChunk } from '../../entities';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KbSeedService } from './kb-seed.service';
import { KbGeneratorService } from './kb-generator.service';

@Module({
    imports: [TypeOrmModule.forFeature([KbDocument, KbChunk]), HttpModule],
    controllers: [KnowledgeBaseController],
    providers: [KnowledgeBaseService, KbSeedService, KbGeneratorService],
    exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule { }
