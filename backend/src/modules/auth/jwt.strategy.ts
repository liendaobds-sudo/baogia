import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { requireSecret } from '../../common/config/secret-validation';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
    ) {
        // Audit 2026-07-25: ngoài việc BẮT BUỘC có secret, ở production còn chặn secret yếu
        // (quá ngắn) hoặc secret mẫu dạng "your-secret…" — vì `.env` dev đang nằm trên đường
        // nạp config nên rất dễ đi lên prod mà app vẫn khởi động bình thường.
        const jwtSecret = requireSecret(
            'JWT_SECRET',
            configService.get<string>('JWT_SECRET'),
            configService.get<string>('NODE_ENV') === 'production',
        );
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret,
        });
    }

    async validate(payload: { sub: string; email: string; role: string; jti: string; sid?: string }) {
        // Token do hệ thống hiện tại luôn có JTI. Cho token thiếu JTI đi tiếp sẽ tạo
        // một access token không thể blacklist khi logout, lệch với WebSocket handshake.
        if (
            typeof payload?.sub !== 'string'
            || !payload.sub
            || typeof payload?.jti !== 'string'
            || !payload.jti
        ) {
            throw new UnauthorizedException('Token thiếu định danh phiên');
        }

        // Check if this token has been blacklisted (logout, rotation)
        if (await this.authService.isTokenBlacklisted(payload.jti, payload.sid)) {
            throw new UnauthorizedException('Token đã bị vô hiệu hóa');
        }

        const user = await this.authService.validateUser(payload.sub);
        if (!user) {
            throw new UnauthorizedException();
        }

        // Phân giải quyền theo CẶP (tên role, tenant của user) — dùng chung
        // AuthService.loadPermissions (fail-closed, ưu tiên role riêng tenant,
        // role hệ thống tenant_id NULL làm baseline). Xem Req 9.3/9.4.
        const permissions = await this.authService.loadPermissions(user.role, user.tenantId ?? null);

        return { id: user.id, email: user.email, role: user.role, fullName: user.fullName, tenantId: user.tenantId, permissions };
    }
}
