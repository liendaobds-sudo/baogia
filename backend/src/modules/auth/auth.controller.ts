import {
    Controller,
    Post,
    Get,
    Body,
    HttpCode,
    HttpStatus,
    UseGuards,
    Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post(['', 'login'])
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto) {
        const result = await this.authService.login(dto);
        // Return BOTH legacy ERP-compatible format AND modern React/NextJS format
        return {
            success: true,
            
            // Legacy format (PricingPrint api.js)
            token: result.accessToken,
            data: result.user,
            
            // Modern format (ZeplaoPrint frontend auth-context.tsx)
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresIn: result.expiresIn,
            user: result.user,
        };
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Body() dto: RefreshTokenDto) {
        return this.authService.refreshToken(dto.refreshToken);
    }

    @Post('logout')
    @UseGuards(AuthGuard('jwt'))
    @HttpCode(HttpStatus.OK)
    async logout(@Request() req, @Body() body?: { refreshToken?: string }) {
        // Extract token from Authorization header and blacklist it
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace('Bearer ', '');
        await this.authService.logout(token, body?.refreshToken);
        return { message: 'Đăng xuất thành công' };
    }

    @Get('me')
    @UseGuards(AuthGuard('jwt'))
    async getProfile(@Request() req) {
        // The JWT strategy validates the user and appends it to req.user
        return { success: true, data: req.user };
    }
}
