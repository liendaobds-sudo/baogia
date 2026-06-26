import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service';

@Controller('search')
@UseGuards(AuthGuard('jwt'))
export class SearchController {
    constructor(private readonly searchService: SearchService) {}

    /** GET /search?q=keyword — Global search across contacts, messages, appointments */
    @Get()
    search(@Query('q') q: string) {
        return this.searchService.search(q);
    }
}
