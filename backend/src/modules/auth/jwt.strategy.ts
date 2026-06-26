import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        private configService: ConfigService,
        private authService: AuthService,
        @InjectDataSource() private dataSource: DataSource,
    ) {
        const jwtSecret = configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
            throw new Error('JWT_SECRET must be set in environment variables. Cannot start with insecure default.');
        }
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtSecret,
        });
    }

    async validate(payload: { sub: string; email: string; role: string; jti: string }) {
        // Check if this token has been blacklisted (logout, rotation)
        if (payload.jti && (await this.authService.isTokenBlacklisted(payload.jti))) {
            throw new UnauthorizedException('Token đã bị vô hiệu hóa');
        }

        const user = await this.authService.validateUser(payload.sub);
        if (!user) {
            throw new UnauthorizedException();
        }

        // Load permissions from role_permissions table (public schema)
        let permissions: string[] = [];
        const role = (user.role || '').toLowerCase();
        if (role === 'admin' || role === 'super_admin') {
            permissions = ['*']; // Admin has all permissions
        } else {
            try {
                const rows = await this.dataSource.query(
                    `SELECT rp.permission FROM public.role_permissions rp
                     JOIN public.roles r ON rp.role_id = r.id
                     WHERE LOWER(r.name) = $1`, [role],
                );
                permissions = rows.map((r: any) => r.permission);
            } catch (err) {
                // Fail-closed: on any error loading permissions, grant nothing.
                // Log role + error message only — never the token/payload.
                const message = err instanceof Error ? err.message : String(err);
                console.error(`[JwtStrategy] Failed to load permissions for role="${role}"; denying all permissions (fail-closed). Error: ${message}`);
                permissions = [];
            }
        }

        return { id: user.id, email: user.email, role: user.role, fullName: user.fullName, tenantId: user.tenantId, permissions };
    }
}
