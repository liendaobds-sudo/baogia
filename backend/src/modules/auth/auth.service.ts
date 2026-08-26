import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { requireSecret } from '../../common/config/secret-validation';
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
            const permissions = await this.loadPermissions(user.role, user.tenantId ?? null);

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
                secret: this.requireRefreshSecret(),
            });

            if (!payload?.jti || !payload?.exp) {
                throw new UnauthorizedException('Refresh token thiếu định danh phiên');
            }

            if (
                typeof payload.sid === 'string'
                && payload.sid
                && await this.redis.existsStrict(`blacklist:session:${payload.sid}`)
            ) {
                throw new UnauthorizedException('Phiên đăng nhập đã bị vô hiệu hóa');
            }

            // Atomic check + consume. Không tách exists/set vì hai request song song
            // có thể cùng vượt qua check và cùng phát một cặp token mới.
            const ttlSeconds = Math.max(1, Math.ceil(payload.exp - Date.now() / 1000));
            const claimed = await this.redis.claimOnceStrict(
                `blacklist:${payload.jti}`,
                'refresh-rotated',
                ttlSeconds,
            );
            if (!claimed) {
                this.logger.warn(`Attempted reuse of rotated refresh token: ${payload.jti}`);
                throw new UnauthorizedException('Refresh token đã được sử dụng');
            }

            const user = await this.usersRepo.findOne({
                where: { id: payload.sub, isActive: true },
            });

            if (!user) {
                throw new UnauthorizedException('Token không hợp lệ');
            }

            return this.generateTokens(
                user,
                typeof payload.sid === 'string' && payload.sid ? payload.sid : randomUUID(),
            );
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            throw new UnauthorizedException('Refresh token hết hạn hoặc không hợp lệ');
        }
    }

    /**
     * Invalidate all tokens for a user session (called on logout).
     */
    async logout(accessToken: string, refreshToken?: string): Promise<void> {
        let payload: any;
        try {
            payload = this.jwtService.decode(accessToken) as any;
        } catch {
            // Token decode failure is non-critical for logout
            return;
        }
        let refreshPayload: any = null;
        if (refreshToken) {
            try {
                refreshPayload = this.jwtService.verify(refreshToken, {
                    secret: this.requireRefreshSecret(),
                });
            } catch {
                throw new UnauthorizedException('Refresh token không hợp lệ khi đăng xuất');
            }
            if (payload?.sub && refreshPayload?.sub !== payload.sub) {
                throw new UnauthorizedException('Refresh token không thuộc phiên đăng nhập hiện hành');
            }
        }

        const accessJti = typeof payload?.jti === 'string' ? payload.jti : undefined;
        const refreshJti = typeof refreshPayload?.jti === 'string' ? refreshPayload.jti : undefined;
        const accessSid = typeof payload?.sid === 'string' ? payload.sid : undefined;
        const refreshSid = typeof refreshPayload?.sid === 'string' ? refreshPayload.sid : undefined;
        if (accessSid && refreshSid && accessSid !== refreshSid) {
            throw new UnauthorizedException('Access token và refresh token không cùng phiên');
        }
        const sessionId = accessSid || refreshSid;

        // Ghi revoke rộng nhất trước. Nếu Redis lỗi giữa chuỗi, session family đã bị
        // khóa thì cả access/refresh hiện tại lẫn token access đã rotate đều vô hiệu.
        // Với token legacy không có sid, khóa refresh trước để không thể mint access mới;
        // access cũ còn sống giúp caller có thể thử logout lại sau lỗi tạm thời.
        if (sessionId) {
            const configuredRefreshTtl = this.parseExpiresIn(
                this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
            );
            const refreshTtl = refreshPayload?.exp
                ? Math.max(1, Math.ceil(refreshPayload.exp - Date.now() / 1000))
                : configuredRefreshTtl;
            await this.redis.setStrict(
                `blacklist:session:${sessionId}`,
                'logout',
                Math.max(1, refreshTtl),
            );
        }
        if (refreshJti) await this.blacklistToken(refreshJti, (refreshPayload.exp || 0) * 1000);
        if (accessJti) await this.blacklistToken(accessJti, (payload.exp || 0) * 1000);
        if (accessJti || sessionId) {
            await this.redis.publishSessionRevokedStrict(accessJti, sessionId);
            this.logger.log(`Session revoked on logout: ${sessionId || accessJti}`);
        }
    }

    async isTokenBlacklisted(jti: string, sessionId?: string): Promise<boolean> {
        try {
            if (await this.redis.existsStrict(`blacklist:${jti}`)) return true;
            if (sessionId && await this.redis.existsStrict(`blacklist:session:${sessionId}`)) return true;
            return false;
        } catch (err) {
            // Production: fail-closed (treat as blacklisted) so stolen tokens cannot
            // be used while Redis is down after logout/rotation.
            // Dev: fail-open so local work continues without Redis.
            const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
            if (isProduction) {
                const message = err instanceof Error ? err.message : String(err);
                this.logger.error(`Redis blacklist check failed (fail-closed): ${message}`);
                return true;
            }
            this.logger.warn('Redis blacklist check failed (dev fail-open)');
            return false;
        }
    }

    private async blacklistToken(jti: string, expiryMs: number): Promise<void> {
        const ttlMs = expiryMs - Date.now();
        if (ttlMs > 0) {
            await this.redis.setStrict(`blacklist:${jti}`, 'true', Math.ceil(ttlMs / 1000));
        }
    }

    private requireRefreshSecret(): string {
        // Cùng chính sách với JWT_SECRET (xem common/config/secret-validation.ts):
        // thiếu ⇒ lỗi ở mọi môi trường; production còn chặn secret ngắn/placeholder.
        return requireSecret(
            'JWT_REFRESH_SECRET',
            this.configService.get<string>('JWT_REFRESH_SECRET'),
            this.configService.get<string>('NODE_ENV') === 'production',
        );
    }

    private async generateTokens(user: User, sessionId = randomUUID()) {
        // Each token gets a unique JTI for blacklist tracking
        const accessJti = randomUUID();
        const refreshJti = randomUUID();
        const refreshSecret = this.requireRefreshSecret();

        const basePayload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId || null,
            sid: sessionId,
        };

        // Default access TTL shortened from 7d → 1h (override via JWT_EXPIRES_IN)
        const accessExpires = this.configService.get('JWT_EXPIRES_IN', '1h');

        const accessToken = this.jwtService.sign(
            { ...basePayload, jti: accessJti },
            {
                secret: this.configService.get('JWT_SECRET'),
                expiresIn: accessExpires,
            },
        );

        const refreshToken = this.jwtService.sign(
            { ...basePayload, jti: refreshJti },
            {
                secret: refreshSecret,
                expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '30d'),
            },
        );

        // Compute expiresIn from config (e.g. '7d' → 604800s, '1h' → 3600s)
        const expiresInConfig = accessExpires;
        const expiresIn = this.parseExpiresIn(expiresInConfig);

        return {
            accessToken,
            refreshToken,
            expiresIn,
        };
    }

    /**
     * Bộ_Phân_Giải_Quyền (Req 9.3/9.4): tra quyền theo CẶP (tên role, tenant của user)
     * thay vì chỉ theo tên — role cùng tên ở tenant khác không còn dùng chung quyền.
     *
     * Quy tắc ưu tiên: role riêng của tenant (r.tenant_id = tenantId) THẮNG role hệ
     * thống cùng tên (r.tenant_id IS NULL — baseline dùng chung). Không tìm thấy role
     * khớp → [] (fail-closed) + log warn. Lỗi query → [] (fail-closed).
     *
     * JwtStrategy dùng CHUNG hàm này (nguồn sự thật duy nhất, hết lệch bản sao).
     */
    async loadPermissions(role: string, tenantId: number | null): Promise<string[]> {
        const normalizedRole = (role || '').toLowerCase();
        if (normalizedRole === 'admin' || normalizedRole === 'super_admin') {
            return ['*']; // Admin has all permissions
        }
        try {
            const rows: { permission: string; tenant_id: number | null }[] = await this.dataSource.query(
                `SELECT rp.permission, r.tenant_id FROM public.role_permissions rp
                 JOIN public.roles r ON rp.role_id = r.id
                 WHERE LOWER(r.name) = $1 AND (r.tenant_id = $2 OR r.tenant_id IS NULL)`,
                [normalizedRole, tenantId],
            );
            if (rows.length === 0) {
                this.logger.warn(`Không tìm thấy role "${normalizedRole}" cho tenant ${tenantId ?? 'NULL'} — trả quyền rỗng (fail-closed)`);
                return [];
            }
            const tenantScoped = rows.filter(r => r.tenant_id != null);
            return (tenantScoped.length > 0 ? tenantScoped : rows).map(r => r.permission);
        } catch (err) {
            // Fail-closed: on any error loading permissions, grant nothing.
            // Log role + error message only — never the token/payload.
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to load permissions for role="${normalizedRole}" tenant=${tenantId ?? 'NULL'}; denying all permissions (fail-closed). Error: ${message}`);
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
            // Không sinh rồi log credential. DB mới phải được provision bằng secret
            // one-shot qua environment/secret manager; thiếu thì fail-fast có hướng dẫn.
            const adminPassword = this.configService.get<string>('ADMIN_DEFAULT_PASSWORD');
            if (!adminPassword) {
                throw new Error(
                    'Chưa có super-admin và thiếu ADMIN_DEFAULT_PASSWORD. ' +
                    'Hãy cấp secret one-shot để bootstrap, đăng nhập đổi mật khẩu rồi xóa biến này.',
                );
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
            this.logger.warn('Super-admin đã được bootstrap; hãy đổi mật khẩu và xóa ADMIN_DEFAULT_PASSWORD khỏi môi trường.');
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
