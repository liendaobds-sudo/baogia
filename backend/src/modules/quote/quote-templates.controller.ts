import { Controller, Get, Query, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { QuoteTemplatesService } from './quote-templates.service';

@Controller('quote-templates')
@UseGuards(AuthGuard('jwt'))
export class QuoteTemplatesController {
    constructor(private readonly templatesService: QuoteTemplatesService) {}

    @Get('list')
    async getList() {
        return this.templatesService.getGroupedCategories();
    }

    @Get('parents')
    async getParents() {
        return this.templatesService.getParents();
    }

    @Get('get')
    async getSingle(@Query('code') code: string) {
        if (!code) throw new BadRequestException('Missing template code');
        const template = await this.templatesService.getTemplateByCode(code);
        if (!template) throw new NotFoundException('Template not found');
        return template;
    }

    @Get('defaults')
    async getDefaults(@Query('code') code: string) {
        if (!code) throw new BadRequestException('Missing template code');
        const defaults = await this.templatesService.getTemplateDefaults(code);
        if (!defaults) throw new NotFoundException('Template not found');
        return defaults;
    }

    @Get('search')
    async search(@Query('q') q: string) {
        if (!q || q.length < 2) throw new BadRequestException('Search query too short');
        return this.templatesService.searchTemplates(q);
    }
}
