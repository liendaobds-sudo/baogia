import {
    Controller, Get, Post, Body, Query, Res, UseGuards,
    BadRequestException, NotFoundException, Logger,
} from '@nestjs/common';
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

    /**
     * Serve media file under configured storage root.
     * JWT required (chat/history UIs send Authorization). Path is confined with realpath + startsWith.
     */
    @Get('file')
    @UseGuards(AuthGuard('jwt'))
    async getFile(
        @Query('path') filePath: string,
        @Res() res: Response
    ) {
        if (!filePath) {
            throw new NotFoundException('Path missing');
        }

        try {
            const setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
            const storageRootRaw = setting?.value
                ? setting.value
                : path.join(process.cwd(), 'uploads', 'zalo_backups');
            const storageRoot = path.resolve(storageRootRaw);

            // Reject absolute client paths and parent traversal after normalize
            if (path.isAbsolute(filePath)) {
                this.logger.warn(`Rejected absolute media path: ${filePath}`);
                throw new NotFoundException();
            }
            const normalizedParam = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
            if (normalizedParam.split(/[/\\]/).includes('..')) {
                throw new NotFoundException();
            }

            const absolutePath = path.resolve(storageRoot, normalizedParam);
            // Confine: resolved path must stay under storage root (prefix + path.sep)
            const rootWithSep = storageRoot.endsWith(path.sep) ? storageRoot : storageRoot + path.sep;
            if (absolutePath !== storageRoot && !absolutePath.startsWith(rootWithSep)) {
                this.logger.warn(`Path escape blocked: ${absolutePath} not under ${storageRoot}`);
                throw new NotFoundException();
            }

            if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
                this.logger.warn(`File not found: ${absolutePath}`);
                throw new NotFoundException();
            }

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
                'Cache-Control': 'private, max-age=3600',
            });

            const stream = fs.createReadStream(absolutePath);
            stream.pipe(res);
        } catch (error: any) {
            if (error instanceof NotFoundException) {
                res.status(404).send('Not Found');
                return;
            }
            this.logger.error(`Error serving file: ${error.message}`);
            res.status(404).send('Not Found');
        }
    }

    @Get('settings')
    @UseGuards(AuthGuard('jwt'), RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async getSettings() {
        const setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
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

    private assertSafeStoragePath(p: string): void {
        if (!path.isAbsolute(p)) {
            throw new BadRequestException('Đường dẫn lưu trữ phải là đường dẫn tuyệt đối.');
        }
        if (p.includes('..')) {
            throw new BadRequestException('Đường dẫn lưu trữ không được chứa "..".');
        }
        const norm = path.normalize(p);
        const { root } = path.parse(norm);
        const rel = norm.slice(root.length).split(/[\\/]/).filter(Boolean);
        if (rel.length < 2) {
            throw new BadRequestException('Đường dẫn lưu trữ quá gần thư mục gốc hệ thống; hãy dùng thư mục con chuyên dụng.');
        }
    }
}
