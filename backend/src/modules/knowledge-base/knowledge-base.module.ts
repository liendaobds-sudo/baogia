import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KbDocument, KbChunk } from '../../entities';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KbSeedService } from './kb-seed.service';
import { KbGeneratorService } from './kb-generator.service';
import { EmbeddingService } from './embedding.service';

@Module({
    imports: [TypeOrmModule.forFeature([KbDocument, KbChunk]), HttpModule],
    controllers: [KnowledgeBaseController],
    providers: [KnowledgeBaseService, KbSeedService, KbGeneratorService, EmbeddingService],
    exports: [KnowledgeBaseService, EmbeddingService],
})
export class KnowledgeBaseModule { }
