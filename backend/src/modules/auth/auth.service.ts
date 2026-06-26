import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { User, UserRole } from '../../entities';
import { LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);

    constructor(
        @InjectRepository(User)
        private usersRepo: Repository<User>,
        @InjectDataSource()
        private dataSource: DataSource,
        private jwtService: JwtService,
        private configService: ConfigService,
        private redis: RedisService,
    ) {}

    async login(dto: LoginDto) {
        try {
            // Support login by email or username (legacy ERP uses username)
            const loginIdentifier = dto.email || dto.username;
            this.logger.debug(`Login attempt with identifier: "${loginIdentifier}"`);
            if (!loginIdentifier) {
                throw new UnauthorizedException('Email hoặc tên đăng nhập là bắt buộc');
            }

            // If input looks like email, search by email directly
            // Otherwise try: email = input@zeplao.vn, or match fullName
            const isEmail = loginIdentifier.includes('@');
            let user;

            if (isEmail) {
                user = await this.usersRepo.findOne({
                    where: { email: loginIdentifier, isActive: true },
                });
            } else {
                // Try username@zeplao.vn first, then fullName match
                user = await this.usersRepo.findOne({
                    where: { email: `${loginIdentifier}@zeplao.vn`, isActive: true },
                });
                if (!user) {
                    user = await this.usersRepo.findOne({
                        where: { fullName: loginIdentifier, isActive: true },
                    });
                }
            }

            if (!user) {
                throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
            }


            const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
            if (!isPasswordValid) {
                throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
            }

            // Update last login
            user.lastLoginAt = new Date();
            await this.usersRepo.save(user);

            const tokens = await this.generateTokens(user);

            // Compute permissions with the SAME fail-closed logic as JwtStrategy.
            // JwtStrategy remains the source of req.user.permissions on subsequent
            // requests; here we expose them once at login for the client.
            const permissions = await this.loadPermissions(user.role);

            return {
                ...tokens,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                    avatarUrl: user.avatarUrl,
                    tenantId: user.tenantId || null,
                    permissions,
                },
            };
        } catch (error) {
            this.logger.error(`Login failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Refresh token rotation — old refresh token is blacklisted after use.
     * This prevents replay attacks with stolen refresh tokens.
     */
    async refreshToken(refreshToken: string) {
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
            });

            // Check if this refresh token has been blacklisted (already rotated)
            if (payload.jti && (await this.isTokenBlacklisted(payload.jti))) {
                this.logger.warn(`Attempted reuse of rotated refresh token: ${payload.jti}`);
                throw new UnauthorizedException('Refresh token đã được sử dụng');
            }

            const user = await this.usersRepo.findOne({
                where: { id: payload.sub, isActive: true },
            });

            if (!user) {
                throw new UnauthorizedException('Token không hợp lệ');
            }

            // Blacklist the old refresh token (rotation)
            if (payload.jti) {
                this.blacklistToken(payload.jti, payload.exp * 1000);
            }

            return this.generateTokens(user);
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            throw new UnauthorizedException('Refresh token hết hạn hoặc không hợp lệ');
        }
    }

    /**
     * Invalidate all tokens for a user session (called on logout).
     */
    async logout(accessToken: string): Promise<void> {
        try {
            const payload = this.jwtService.decode(accessToken) as any;
            if (payload.jti) {
                this.blacklistToken(payload.jti, (payload.exp || 0) * 1000);
                this.logger.log(`Token blacklisted on logout: ${payload.jti}`);
            }
        } catch {
            // Token decode failure is non-critical for logout
        }
    }

    async isTokenBlacklisted(jti: string): Promise<boolean> {
        try {
            return await this.redis.exists(`blacklist:${jti}`);
        } catch {
            return false; // If Redis is down, allow token (fail-open)
        }
    }

    private blacklistToken(jti: string, expiryMs: number): void {
        const ttlMs = expiryMs - Date.now();
        if (ttlMs > 0) {
            this.redis.set(`blacklist:${jti}`, 'true', Math.ceil(ttlMs / 1000));
        }
    }

    private async generateTokens(user: User) {
        // Each token gets a unique JTI for blacklist tracking
        const accessJti = randomUUID();
        const refreshJti = randomUUID();

        const basePayload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId || null };

        const accessToken = this.jwtService.sign(
            { ...basePayload, jti: accessJti },
            {
                secret: this.configService.get('JWT_SECRET'),
                expiresIn: this.configService.get('JWT_EXPIRES_IN', '7d'),
            },
        );

        const refreshToken = this.jwtService.sign(
            { ...basePayload, jti: refreshJti },
            {
                secret: this.configService.get('JWT_REFRESH_SECRET'),
                expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
            },
        );

        // Compute expiresIn from config (e.g. '7d' → 604800s, '1h' → 3600s)
        const expiresInConfig = this.configService.get('JWT_EXPIRES_IN', '7d');
        const expiresIn = this.parseExpiresIn(expiresInConfig);

        return {
            accessToken,
            refreshToken,
            expiresIn,
        };
    }

    /**
     * Load permissions for a role using the SAME fail-closed logic as JwtStrategy.
     * admin/super_admin → ['*']; otherwise query role_permissions by role name and
     * map to permission strings; on any error return [] (fail-closed).
     */
    private async loadPermissions(role: string): Promise<string[]> {
        const normalizedRole = (role || '').toLowerCase();
        if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
            return ['*']; // Admin has all permissions
        }
        try {
            const rows = await this.dataSource.query(
                `SELECT rp.permission FROM public.role_permissions rp
                 JOIN public.roles r ON rp.role_id = r.id
                 WHERE LOWER(r.name) = $1`, [normalizedRole],
            );
            return rows.map((r: any) => r.permission);
        } catch (err) {
            // Fail-closed: on any error loading permissions, grant nothing.
            // Log role + error message only — never the token/payload.
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to load permissions for role="${normalizedRole}"; denying all permissions (fail-closed). Error: ${message}`);
            return [];
        }
    }

    async validateUser(userId: string): Promise<User> {
        const user = await this.usersRepo.findOne({
            where: { id: userId, isActive: true },
        });
        if (!user) {
            throw new UnauthorizedException();
        }
        return user;
    }

    /**
     * Seed initial admin user if none exists
     */
    async seedAdmin() {
        const adminExists = await this.usersRepo.findOne({
            where: [
                { role: UserRole.ADMIN },
                { role: UserRole.SUPER_ADMIN },
                { email: 'admin@zeplao.vn' },
            ],
        });

        if (!adminExists) {
            // Read from env var, or generate a secure random password
            let adminPassword = this.configService.get<string>('ADMIN_DEFAULT_PASSWORD');
            let generated = false;

            if (!adminPassword) {
                // Generate a cryptographically secure random password
                const crypto = await import('crypto');
                adminPassword = crypto.randomBytes(16).toString('base64url');
                generated = true;
            }

            const passwordHash = await bcrypt.hash(adminPassword, 10);
            // Issue #10 fix: Seed as SUPER_ADMIN (not ADMIN) for full access
            const admin = this.usersRepo.create({
                email: 'admin@zeplao.vn',
                passwordHash,
                fullName: 'Admin ZeplaoPrint',
                role: UserRole.SUPER_ADMIN,
            });
            await this.usersRepo.save(admin);

            this.logger.log('Seeded admin user: admin@zeplao.vn');
            if (generated) {
                // Log only first 4 chars — NEVER log full password
                this.logger.warn(`Generated admin password: ${adminPassword.substring(0, 4)}****... — CHANGE THIS IMMEDIATELY`);
                this.logger.warn(`Full password written to: admin-password.txt (delete after first login)`);
                // Write to file for one-time retrieval
                try {
                    const fs = await import('fs');
                    fs.writeFileSync('admin-password.txt', `Admin: admin@zeplao.vn\nPassword: ${adminPassword}\n\n⚠️ DELETE THIS FILE IMMEDIATELY AFTER FIRST LOGIN`, 'utf-8');
                } catch { /* non-critical */ }
            } else {
                this.logger.warn('Admin created with ADMIN_DEFAULT_PASSWORD from env — CHANGE THIS AFTER FIRST LOGIN');
            }
        }
    }

    /** Parse JWT expiresIn string (e.g. '7d', '1h', '30m') into seconds */
    private parseExpiresIn(value: string): number {
        const match = value.match(/^(\d+)(s|m|h|d)$/);
        if (!match) return 604800; // default 7 days
        const num = parseInt(match[1]);
        const unit = match[2];
        switch (unit) {
            case 's': return num;
            case 'm': return num * 60;
            case 'h': return num * 3600;
            case 'd': return num * 86400;
            default: return 604800;
        }
    }
}
