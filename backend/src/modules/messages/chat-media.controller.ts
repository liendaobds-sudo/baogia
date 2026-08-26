import { Controller, Post, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

/** Giới hạn kích thước ảnh chat — áp NGAY ở tầng multer (không để nạp hết vào RAM rồi mới kiểm). */
const CHAT_UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

@Controller('chat-media')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class ChatMediaController {
    constructor(private readonly configService: ConfigService) {}

    // Upload image for chat — saves to local uploads/chat/ folder
    /**
     * Upload ảnh cho chat.
     *
     * Audit 2026-07-25 — 2 vấn đề đã vá:
     *  1. `FileInterceptor('image')` KHÔNG có `limits` ⇒ multer memoryStorage nạp TRỌN file vào
     *     RAM rồi mới tới lệnh kiểm `file.size > 50MB` ⇒ kiểm tra vô nghĩa về mặt bảo vệ bộ nhớ.
     *     Nay giới hạn ngay ở tầng multer (413 do multer ném khi vượt).
     *  2. Dùng BLOCKLIST 3 MIME + 5 đuôi ⇒ `.svg`/`.html` lọt qua và được serve tĩnh ở dev
     *     (`/uploads/...`) ⇒ stored XSS. Nay chuyển sang ALLOWLIST ảnh.
     */
    @Post('upload-image')
    @UseInterceptors(FileInterceptor('image', {
        limits: { fileSize: CHAT_UPLOAD_MAX_BYTES, files: 1 },
    }))
    async uploadImage(
        @UploadedFile() file: any,
        @Req() req: any,
    ) {
        if (!file) {
            return { error: 'No file uploaded' };
        }

        // ALLOWLIST: chỉ nhận ảnh raster phổ biến. SVG bị loại có chủ đích (chứa script được).
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const ext = path.extname(file.originalname || '').toLowerCase();

        if (!allowedMimes.includes(String(file.mimetype).toLowerCase()) || !allowedExts.includes(ext)) {
            return {
                error: `Chỉ nhận ảnh (${allowedExts.join(', ')}). Nhận được: ${file.mimetype || 'không rõ'} / ${ext || 'không có đuôi'}`,
            };
        }

        // Lưới an toàn thứ hai (multer đã chặn trước, giữ lại cho trường hợp cấu hình lệch).
        if (file.size > CHAT_UPLOAD_MAX_BYTES) {
            return { error: `File quá lớn. Tối đa ${Math.floor(CHAT_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.` };
        }

        // Save to uploads/chat/
        const uploadDir = path.resolve(process.cwd(), 'uploads', 'chat');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileExt = path.extname(file.originalname) || '.bin';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${fileExt}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, file.buffer);

        // Return URL for client
        const baseUrl = this.configService.get<string>('API_BASE_URL') || `http://localhost:${this.configService.get<number>('PORT', 4000)}`;
        const url = `${baseUrl}/uploads/chat/${filename}`;

        return {
            url,
            filename,
            mimetype: file.mimetype,
            size: file.size,
        };
    }
}
