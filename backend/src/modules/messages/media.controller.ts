import { Controller, Get, Post, Body, Query, Res, Req, Headers, Param, StreamableFile, NotFoundException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../../entities/system-setting.entity';
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
    @Get('settings')
    async getSettings() {
        let setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
        return { success: true, zalo_media_storage_path: setting?.value || '' };
    }

    @Post('settings')
    async updateSettings(@Body() body: { zalo_media_storage_path: string }) {
        let setting = await this.settingRepo.findOne({ where: { key: 'zalo_media_storage_path' } });
        if (!setting) {
            setting = this.settingRepo.create({ key: 'zalo_media_storage_path', value: body.zalo_media_storage_path });
        } else {
            setting.value = body.zalo_media_storage_path;
        }
        await this.settingRepo.save(setting);
        return { success: true };
    }


}
