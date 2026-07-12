import { Controller, Get, Post, Body, Query, Res, Req, Headers, Param, UseGuards, BadRequestException, StreamableFile, NotFoundException, Injectable, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../entities/system-setting.entity';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('media')
export class MediaController {
    private readonly logger = new Logger(MediaController.name);

    constructor(
        @InjectRepository(SystemSetting)
        private settingRepo: Repository<SystemSetting>
    ) {}

    @Get('file')
    async getFile(
        @Query('path') filePath: string,
        @Res() res: Response
    ) {
        if (!filePath) {
            throw new NotFoundException('Path missing');
        }

        try {
            // Retrieve storage path from settings, fallback to local uploads
            const setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
            const storageRoot = setting?.value ? setting.value : path.join(process.cwd(), 'uploads', 'zalo_backups');

            // Prevent directory traversal attacks
            const normalizedParam = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
            const absolutePath = path.join(storageRoot, normalizedParam);

            if (!fs.existsSync(absolutePath)) {
                this.logger.warn(`File not found: ${absolutePath}`);
                throw new NotFoundException();
            }

            // Simple mime-type guessing based on extension
            const ext = path.extname(absolutePath).toLowerCase();
            let mimeType = 'application/octet-stream';
            if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
            else if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.webp') mimeType = 'image/webp';
            else if (ext === '.pdf') mimeType = 'application/pdf';
            else if (ext === '.mp4') mimeType = 'video/mp4';

            res.set({
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000', // 1 year cache
            });

            const stream = fs.createReadStream(absolutePath);
            stream.pipe(res);
        } catch (error: any) {
            this.logger.error(`Error serving file: ${error.message}`);
            res.status(404).send('Not Found');
        }
    }
    // Cấu hình lưu trữ = ADMIN-only (trước đây KHÔNG guard → bất kỳ ai đặt gốc lưu trữ
    // tuỳ ý rồi đọc file hệ thống qua GET /media/file). Nay JWT + ADMIN + validate path.
    @Get('settings')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getSettings() {
        let setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
        return { success: true, zalo_media_storage_path: setting?.value || '' };
    }

    @Post('settings')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async updateSettings(@Body() body: { zalo_media_storage_path: string }) {
        const raw = (body?.zalo_media_storage_path || '').trim();
        if (raw) this.assertSafeStoragePath(raw);
        let setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
        if (!setting) {
            setting = this.settingRepo.create({ key: 'zalo_media_storage_path', value: raw });
        } else {
            setting.value = raw;
        }
        await this.settingRepo.save(setting);
        return { success: true };
    }

    /**
     * Chặn đặt gốc lưu trữ là thư mục gốc hệ thống ('/', 'C:\') hay quá nông — vì
     * GET /media/file phục vụ file dưới gốc này (public cho <img>). Yêu cầu absolute,
     * không chứa '..', và có ít nhất 2 cấp thư mục để không trỏ vào root hệ thống.
     */
    private assertSafeStoragePath(p: string): void {
        if (!path.isAbsolute(p)) {
            throw new BadRequestException('Đường dẫn lưu trữ phải là đường dẫn tuyệt đối.');
        }
        if (p.includes('..')) {
            throw new BadRequestException('Đường dẫn lưu trữ không được chứa "..".');
        }
        const norm = path.normalize(p);
        const { root } = path.parse(norm);
        // Số cấp thư mục dưới root (loại phần rỗng). < 2 ⇒ quá gần root hệ thống → từ chối.
        const rel = norm.slice(root.length).split(/[\\/]/).filter(Boolean);
        if (rel.length < 2) {
            throw new BadRequestException('Đường dẫn lưu trữ quá gần thư mục gốc hệ thống; hãy dùng thư mục con chuyên dụng.');
        }
    }
}
