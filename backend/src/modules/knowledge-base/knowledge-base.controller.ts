import {
    Controller, Get, Post, Put, Delete, Param, Body, UseGuards,
    UploadedFile, UseInterceptors, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CskhScopeGuard } from '../../common/app-scope/cskh-scope.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KbGeneratorService } from './kb-generator.service';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UserRole } from '../../entities';

/** Giới hạn dung lượng file KB upload — chặn DoS đọc file lớn vào bộ nhớ. */
const KB_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5MB (KB là .txt/.md)

@Controller('kb')
@UseGuards(AuthGuard('jwt'), CskhScopeGuard)
export class KnowledgeBaseController {
    constructor(
        private kbService: KnowledgeBaseService,
        private kbGenerator: KbGeneratorService,
    ) { }

    @Get('documents')
    listDocuments() {
        return this.kbService.findAll();
    }

    @Get('documents/:id')
    getDocument(@Param('id') id: string) {
        return this.kbService.findOne(id);
    }

    @Get('documents/:id/chunks')
    getChunks(@Param('id') id: string) {
        return this.kbService.getChunks(id);
    }

    @Get('documents/:id/content')
    getDocumentContent(@Param('id') id: string) {
        return this.kbService.getDocumentContent(id);
    }

    @Post('upload')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: KB_UPLOAD_MAX_BYTES } }))
    async uploadDocument(
        @UploadedFile() file: any,
        @Body() body: { tags?: string },
        @Req() req: any,
    ) {
        const tags = body.tags ? body.tags.split(',').map((t: string) => t.trim()) : [];
        const userId = req.user?.sub || req.user?.id;
        return this.kbService.uploadAndProcess(
            {
                originalname: file.originalname,
                buffer: file.buffer,
                mimetype: file.mimetype,
                size: file.size,
            },
            userId,
            tags,
        );
    }

    @Put('documents/:id/content')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    updateDocumentContent(
        @Param('id') id: string,
        @Body() body: { content: string; title?: string; tags?: string[] },
    ) {
        return this.kbService.updateContent(id, body.content, body.title, body.tags);
    }

    @Post('search')
    searchChunks(@Body() body: { query: string; limit?: number }) {
        return this.kbService.searchChunks(body.query, body.limit || 5);
    }

    @Post('load-static')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async loadStaticDocs() {
        return this.kbGenerator.loadStaticDocs();
    }

    @Post('generate-from-pricing')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async generateFromPricing() {
        return this.kbGenerator.generateFromPricing();
    }

    @Post('reindex-embeddings')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    async reindexEmbeddings() {
        return this.kbService.reindexEmbeddings();
    }

    @Delete('documents/:id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
    deleteDocument(@Param('id') id: string) {
        return this.kbService.deleteDocument(id);
    }
}
