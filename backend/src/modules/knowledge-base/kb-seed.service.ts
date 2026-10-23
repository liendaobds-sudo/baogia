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
import * as crypto from 'crypto';
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
    // Bổ sung 2026-08-29 (audit kiến thức AI) — 3 tài liệu chuyển từ kb-docs/ (trước đây KHÔNG
    // được nạp bởi bất kỳ đường nào) + 2 tài liệu viết mới cho hai vùng trắng của KB.
    { dir: 'data', filename: 'chuan-bi-file-thiet-ke.md', tags: ['file thiết kế', 'CMYK', 'RGB', 'bleed', 'safe zone', 'dpi', 'font', 'pantone', 'overprint'] },
    { dir: 'data', filename: 'ky-thuat-in-nang-cao.md', tags: ['offset', 'digital', 'in UV', 'in lụa', 'chuyển nhiệt', 'khổ lớn', 'bao bì', 'biển hiệu'] },
    { dir: 'data', filename: 'anti-patterns-tu-van.md', tags: ['anti-pattern', 'lỗi tư vấn', 'báo giá', 'phản đối', 'deadline'] },
    { dir: 'data', filename: 'kho-giay-va-dan-khuon.md', tags: ['khổ giấy', 'khổ tờ', 'dàn khuôn', 'imposition', 'số con', 'cắn nhíp', 'gripper', 'bleed', 'gutter', 'bù hao', 'kẽm', 'A4', 'A3'] },
    { dir: 'data', filename: 'bao-bi-hop-giay.md', tags: ['hộp giấy', 'bao bì', 'nắp gài', 'âm dương', 'hộp cứng', 'túi giấy', 'khuôn bế', 'cấn', 'dieline', 'carton'] },
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

    /**
     * Đường dẫn gốc tới thư mục chứa file seed.
     *
     * Ưu tiên thư mục cạnh chính file này (`__dirname`) — chạy được cả khi tiến trình khởi động
     * từ dist và bất kể cwd. `nest-cli.json` đã được bổ sung asset `**\/*.md` (2026-08-29) để các
     * tài liệu markdown thực sự có mặt trong dist. Fallback về `src/` cho môi trường dev/test.
     */
    private baseDir(): string {
        const nextToThisFile = __dirname;
        if (fs.existsSync(path.join(nextToThisFile, 'data'))) return nextToThisFile;
        return path.resolve(process.cwd(), 'src', 'modules', 'knowledge-base');
    }

    /**
     * Nạp seed.
     *
     * Audit 2026-08-29: bản cũ chỉ `count() > 0 → return`, nên sau lần khởi động đầu tiên MỌI thay
     * đổi nội dung file seed và MỌI tài liệu seed thêm mới đều không bao giờ vào DB. Trên môi
     * trường đang chạy, sửa markdown KB gần như không có tác dụng gì.
     *
     * Nay: bỏ qua theo TỪNG TÀI LIỆU dựa trên tiêu đề + hash nội dung:
     *  - chưa có tài liệu cùng tiêu đề       → seed mới;
     *  - đã có nhưng nội dung nguồn đã đổi   → seed lại (xoá bản cũ rồi nạp bản mới);
     *  - đã có và nội dung trùng             → bỏ qua.
     * Cách này giữ nguyên tài liệu do người dùng tự upload (không nằm trong SEED_DOCS).
     *
     * Hash được so với BẢN ĐÃ LƯU trên đĩa (`fileUrl`) chứ không lưu thêm cột mới, để không cần
     * migration trên DB đang phục vụ. Nếu file lưu bị thiếu → coi như đã đổi và nạp lại.
     */
    async seedIfEmpty() {
        const baseDir = this.baseDir();
        const existingDocs = await this.docRepo.find({ select: ['id', 'title', 'fileUrl'] });
        const byTitle = new Map(existingDocs.map((d) => [d.title, d]));

        let created = 0, refreshed = 0, skipped = 0;

        for (const doc of SEED_DOCS) {
            const filePath = path.join(baseDir, doc.dir, doc.filename);
            if (!fs.existsSync(filePath)) {
                this.logger.warn(`Seed file not found: ${doc.dir}/${doc.filename}`);
                continue;
            }

            const buffer = fs.readFileSync(filePath);
            const hash = this.sha256(buffer);
            const title = doc.filename.replace(/\.md$/i, '');
            const current = byTitle.get(title);

            if (current) {
                if (this.storedHash(current.fileUrl) === hash) { skipped++; continue; }
                // Nội dung nguồn đã đổi → xoá bản cũ (kèm chunk) rồi nạp lại.
                try {
                    await this.kbService.deleteDocument(current.id);
                } catch (err: any) {
                    this.logger.warn(`Không xoá được bản cũ "${title}": ${err.message}`);
                    continue;
                }
            }

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
                if (current) { refreshed++; this.logger.log(`♻️ KB re-seeded (file đã đổi): ${doc.dir}/${doc.filename}`); }
                else { created++; this.logger.log(`✅ KB seeded: ${doc.dir}/${doc.filename}`); }
            } catch (err: any) {
                this.logger.error(`❌ Failed to seed ${doc.filename}: ${err.message}`);
            }
        }

        this.logger.log(
            `🌱 KB seed xong: ${created} mới, ${refreshed} nạp lại vì file đổi, ${skipped} giữ nguyên ` +
            `(tổng ${SEED_DOCS.length} tài liệu nguồn).`,
        );
        return { created, refreshed, skipped, total: SEED_DOCS.length };
    }

    private sha256(buffer: Buffer): string {
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    /** Hash của bản đã lưu trên đĩa; trả '' khi file không còn (⇒ buộc nạp lại). */
    private storedHash(fileUrl?: string | null): string {
        if (!fileUrl || !fs.existsSync(fileUrl)) return '';
        try {
            return this.sha256(fs.readFileSync(fileUrl));
        } catch {
            return '';
        }
    }
}

/** Danh sách tài liệu seed — export để test kiểm tra file nguồn thực sự tồn tại. */
export { SEED_DOCS };
