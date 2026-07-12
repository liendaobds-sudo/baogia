import { Controller, Post, UseGuards, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('chat-media')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class ChatMediaController {
    constructor(private readonly configService: ConfigService) {}

    // Upload image for chat — saves to local uploads/chat/ folder
    @Post('upload-image')
    @UseInterceptors(FileInterceptor('image'))
    async uploadImage(
        @UploadedFile() file: any,
        @Req() req: any,
    ) {
        if (!file) {
            return { error: 'No file uploaded' };
        }

        // Validate file type
        const blockedTypes = ['application/x-msdownload', 'application/x-sh', 'text/x-php'];
        const blockedExts = ['.exe', '.bat', '.sh', '.php', '.js'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (blockedTypes.includes(file.mimetype) || blockedExts.includes(ext)) {
            return { error: `File type ${file.mimetype} or extension ${ext} usually not allowed.` };
        }

        // Max 50MB
        if (file.size > 50 * 1024 * 1024) {
            return { error: 'File too large. Max 50MB.' };
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
