import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KbDocument, KbChunk } from '../../entities';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KbSeedService } from './kb-seed.service';
import { KbGeneratorService } from './kb-generator.service';
import { EmbeddingService } from './embedding.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
    // PricingModule cấp `ProductsService` cho `KbGeneratorService.generateFromPricing`
    // (audit 2026-08-29: trước đây hàm đó gọi HTTP vào chính mình mà không có token ⇒ luôn 401).
    // `forwardRef` vì PricingModule ↔ các module CSKH đã có phụ thuộc chéo.
    imports: [TypeOrmModule.forFeature([KbDocument, KbChunk]), HttpModule, forwardRef(() => PricingModule)],
    controllers: [KnowledgeBaseController],
    providers: [KnowledgeBaseService, KbSeedService, KbGeneratorService, EmbeddingService],
    exports: [KnowledgeBaseService, EmbeddingService],
})
export class KnowledgeBaseModule { }
