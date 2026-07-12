import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppScopeService } from './app-scope.service';

/**
 * Endpoint self-service: frontend lấy tập Trục_Ứng_Dụng khả dụng của TENANT hiện hành
 * (theo token), để lọc menu/route. KHÔNG nhận tham số tenant từ client — resolver đọc
 * tenant từ context (Req 3.2, 5.1).
 *
 * _Requirements: 5.1_
 */
@Controller('me')
@UseGuards(AuthGuard('jwt'))
export class AppScopeController {
    constructor(private readonly appScope: AppScopeService) {}

    @Get('app-scope')
    async getMyAppScope() {
        const enabledApps = await this.appScope.resolveEnabledApps();
        return { success: true, data: { enabledApps } };
    }
}
