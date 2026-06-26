import {
    Controller, Get, Post, Put, Delete, Param, Body, UseGuards,
    UploadedFile, UseInterceptors, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KbGeneratorService } from './kb-generator.service';

@Controller('kb')
@UseGuards(AuthGuard('jwt'))
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
    @UseInterceptors(FileInterceptor('file'))
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
    async loadStaticDocs() {
        return this.kbGenerator.loadStaticDocs();
    }

    @Post('generate-from-pricing')
    async generateFromPricing() {
        return this.kbGenerator.generateFromPricing();
    }

    @Post('reindex-embeddings')
    async reindexEmbeddings() {
        return this.kbService.reindexEmbeddings();
    }

    @Delete('documents/:id')
    deleteDocument(@Param('id') id: string) {
        return this.kbService.deleteDocument(id);
    }
}
