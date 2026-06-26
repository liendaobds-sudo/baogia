/**
 * KB Seed Script
 * Seeds Knowledge Base with sample documents about printing products.
 * Called during KnowledgeBaseService initialization.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KbDocument } from '../../entities/kb-document.entity';
import * as fs from 'fs';
import * as path from 'path';

const SEED_DOCS = [
    // seed-docs/
    { dir: 'seed-docs', filename: 'san-pham-in-an.md', tags: ['sản phẩm', 'catalogue', 'tem', 'name card', 'tờ rơi', 'standee'] },
    { dir: 'seed-docs', filename: 'chat-lieu-in-an.md', tags: ['chất liệu', 'giấy', 'couche', 'art', 'offset', 'decal', 'gia công'] },
    { dir: 'seed-docs', filename: 'faq-khach-hang.md', tags: ['FAQ', 'giao hàng', 'thanh toán', 'thời gian', 'chất lượng', 'file'] },
    // data/
    { dir: 'data', filename: 'bang-gia-tham-khao.md', tags: ['tư vấn', 'sản phẩm', 'hướng dẫn', 'tờ rơi', 'danh thiếp', 'catalogue', 'decal'] },
    { dir: 'data', filename: 'cau-hoi-thuong-gap.md', tags: ['FAQ', 'đặt hàng', 'thanh toán', 'file thiết kế', 'giao hàng'] },
    { dir: 'data', filename: 'gia-cong-sau-in.md', tags: ['gia công', 'cán mờ', 'cán bóng', 'ép nhũ', 'UV', 'bế', 'dập nổi'] },
    { dir: 'data', filename: 'thoi-gian-giao-hang.md', tags: ['thời gian', 'giao hàng', 'sản xuất', 'express'] },
    { dir: 'data', filename: 'san-pham-in-an.md', tags: ['sản phẩm', 'tờ rơi', 'poster', 'brochure', 'catalogue'] },
    { dir: 'data', filename: 'chat-lieu-in-an.md', tags: ['chất liệu', 'giấy', 'couche', 'art', 'offset'] },
    { dir: 'data', filename: 'so-sanh-chat-lieu.md', tags: ['so sánh', 'chất liệu', 'couche', 'art', 'offset'] },
    { dir: 'data', filename: 'quy-cach-ky-thuat.md', tags: ['kỹ thuật', 'quy cách', 'file', 'CMYK', 'bleed'] },
    { dir: 'data', filename: 'quy-tac-rang-buoc-nganh-in.md', tags: ['quy tắc', 'ràng buộc', 'cán màng', 'giấy', 'đóng cuốn', 'ép nhũ', 'bế', 'chất liệu', 'số lượng', 'màu sắc'] },
];

@Injectable()
export class KbSeedService implements OnModuleInit {
    private readonly logger = new Logger(KbSeedService.name);

    constructor(
        private kbService: KnowledgeBaseService,
        @InjectRepository(KbDocument) private docRepo: Repository<KbDocument>,
    ) { }

    async onModuleInit() {
        try {
            await this.seedIfEmpty();
            // Auto re-chunk existing docs with smart chunking (safe — only re-chunks old-format docs)
            await this.kbService.rechunkAllDocuments();
        } catch (err: any) {
            this.logger.warn(`KB init: ${err.message}`);
        }
    }

    async seedIfEmpty() {
        const existing = await this.docRepo.count();
        if (existing > 0) {
            this.logger.log(`📚 KB already has ${existing} documents, skipping seed`);
            return;
        }

        this.logger.log('🌱 Seeding Knowledge Base with sample documents...');
        const baseDir = path.resolve(process.cwd(), 'src', 'modules', 'knowledge-base');

        for (const doc of SEED_DOCS) {
            const filePath = path.join(baseDir, doc.dir, doc.filename);
            if (!fs.existsSync(filePath)) {
                this.logger.warn(`Seed file not found: ${doc.dir}/${doc.filename}`);
                continue;
            }

            const buffer = fs.readFileSync(filePath);
            try {
                await this.kbService.uploadAndProcess(
                    {
                        originalname: doc.filename,
                        buffer,
                        mimetype: 'text/markdown',
                        size: buffer.length,
                    },
                    undefined,
                    doc.tags,
                );
                this.logger.log(`✅ KB seeded: ${doc.dir}/${doc.filename}`);
            } catch (err: any) {
                this.logger.error(`❌ Failed to seed ${doc.filename}: ${err.message}`);
            }
        }

        this.logger.log('🌱 KB seeding complete!');
    }
}
