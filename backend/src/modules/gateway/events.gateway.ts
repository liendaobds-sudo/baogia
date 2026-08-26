import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { tenantRlsEnabled } from '../../common/tenant/tenant-background';
import { requireSecret } from '../../common/config/secret-validation';

export interface AgentThoughtEvent {
    conversationId: string;
    status: 'thinking' | 'tool_result_ready';
    tool: string;
    message: string;
}

export interface ProactiveFollowUpEvent {
    conversationId: string;
    contactName: string;
    message: string;
    status: string;
    followUpId: string;
}

@Injectable()
@WebSocketGateway({
    cors: {
        origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
            // Dynamic CORS: allow configured origins + localhost for dev
            const allowed = (process.env.FRONTEND_URL || 'http://localhost:3000')
                .split(',')
                .map(s => s.trim());
            if (process.env.NODE_ENV !== 'production') {
                allowed.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:8080');
            }
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`WS origin not allowed: ${origin}`));
            }
        },
        credentials: true,
    },
    namespace: '/',
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(EventsGateway.name);
    private removeSessionRevokedListener?: () => void;

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
        private redis: RedisService,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly authService: AuthService,
    ) {}

    afterInit(server: Server): void {
        this.server = server;
        this.removeSessionRevokedListener = this.redis.onSessionRevoked((revocation) => {
            // Mỗi replica nhận pub/sub và tự ngắt JTI hiện tại + toàn bộ access token
            // cùng session family (các token access cũ sau refresh cũng bị đóng).
            if (revocation.jti) {
                this.server.in(`session:${revocation.jti}`).disconnectSockets(true);
            }
            if (revocation.sessionId) {
                this.server.in(`auth-session:${revocation.sessionId}`).disconnectSockets(true);
            }
        });
    }

    onModuleDestroy(): void {
        this.removeSessionRevokedListener?.();
    }

    private socketTenantId(client: Socket): number | null {
        const tenantId = (client as any).tenantId;
        return Number.isSafeInteger(tenantId) && tenantId > 0 ? tenantId : null;
    }

    private conversationRoom(tenantId: number, conversationId: string): string {
        return `tenant:${tenantId}:conversation:${conversationId}`;
    }

    private accountRoom(tenantId: number, accountId: string): string {
        return `tenant:${tenantId}:account:${accountId}`;
    }

    /**
     * Query ownership trong đúng tenant context khi PostgreSQL RLS được bật.
     * Cả predicate tenant_id và SET LOCAL đều bắt buộc: predicate bảo vệ khi RLS tắt,
     * còn SET LOCAL cho phép policy fail-closed nhìn thấy đúng row khi RLS bật.
     */
    private async queryOwnedResource(
        sql: string,
        resourceId: string,
        tenantId: number,
    ): Promise<any[]> {
        const run = (manager: Pick<EntityManager, 'query'> | Pick<DataSource, 'query'>) =>
            manager.query(sql, [resourceId, tenantId]);

        if (!tenantRlsEnabled()) return run(this.dataSource);

        return this.dataSource.transaction(async (manager) => {
            await manager.query(`SELECT set_config('app.current_tenant', $1, true)`, [String(tenantId)]);
            return run(manager);
        });
    }

    /**
     * Kiểm quyền TRƯỚC khi cho socket vào room hội thoại (audit 2026-07-25).
     *
     * Trước đây `join_conversation` join thẳng room theo UUID client gửi lên, mà
     * `emitNewMessage` phát TOÀN BỘ nội dung tin nhắn vào room đó ⇒ bất kỳ JWT hợp lệ nào
     * biết/đoán được UUID hội thoại đều nghe được tin nhắn realtime của hội thoại đó
     * (kể cả của tenant khác).
     *
     * Socket thiếu tenant và row tenant_id NULL đều bị từ chối. Dữ liệu tổ chức không
     * được dùng nhánh legacy/baseline vì room chứa nội dung hội thoại thời gian thực.
     */
    private async canJoinConversation(client: Socket, conversationId: string): Promise<boolean> {
        if (!conversationId || typeof conversationId !== 'string') return false;
        const tenantId = this.socketTenantId(client);
        if (tenantId == null) return false;

        try {
            const rows = await this.queryOwnedResource(
                'SELECT 1 FROM conversations WHERE id = $1 AND tenant_id = $2 LIMIT 1',
                conversationId,
                tenantId,
            );
            return rows.length > 0;
        } catch (e) {
            // Không nuốt im: lỗi tra cứu ⇒ TỪ CHỐI (fail-closed) + log để chẩn đoán.
            this.logger.error(
                `canJoinConversation lookup failed (conv=${conversationId}): ${e instanceof Error ? e.message : e}`,
            );
            return false;
        }
    }

    async handleConnection(client: Socket) {
        try {
            // Chỉ nhận token qua Socket.IO auth payload; query string dễ lọt vào access log,
            // proxy history và telemetry URL.
            const tokenCandidate = client.handshake.auth?.token;

            if (typeof tokenCandidate !== 'string' || !tokenCandidate) throw new Error('missing token');

            const jwtSecret = requireSecret(
                'JWT_SECRET',
                this.configService.get<string>('JWT_SECRET'),
                this.configService.get<string>('NODE_ENV') === 'production',
            );
            const payload = this.jwtService.verify(tokenCandidate, {
                secret: jwtSecret,
            });

            if (typeof payload?.sub !== 'string' || !payload.sub) throw new Error('missing subject');
            if (typeof payload?.jti !== 'string' || !payload.jti) throw new Error('missing jti');

            // Security-critical: dùng Redis strict tại seam WebSocket. Lỗi Redis cũng
            // từ chối handshake ở mọi môi trường, không kế thừa nhánh dev fail-open.
            if (await this.redis.existsStrict(`blacklist:${payload.jti}`)) {
                throw new Error('revoked session');
            }
            if (payload.sid && await this.redis.existsStrict(`blacklist:session:${payload.sid}`)) {
                throw new Error('revoked session family');
            }

            // Không tin role/tenant trong JWT cũ. validateUser chỉ trả user còn active;
            // role + tenant sau đổi quyền được lấy trực tiếp từ DB ở mỗi handshake.
            const user = await this.authService.validateUser(payload.sub);
            const tenantId = user.tenantId == null ? null : Number(user.tenantId);
            if (tenantId != null && (!Number.isSafeInteger(tenantId) || tenantId <= 0)) {
                throw new Error('invalid current tenant');
            }

            // Store user info on socket
            (client as any).userId = user.id;
            (client as any).userRole = user.role;
            (client as any).tenantId = tenantId;
            (client as any).sessionJti = payload.jti;
            (client as any).authSessionId = typeof payload.sid === 'string' ? payload.sid : null;

            // Join user-specific room
            client.join(`user:${user.id}`);
            client.join(`session:${payload.jti}`);
            if (typeof payload.sid === 'string' && payload.sid) {
                client.join(`auth-session:${payload.sid}`);
            }

            if (tenantId != null) {
                client.join(`tenant:${tenantId}`);
            }

            // Track connection (Redis optional)
            try {
                await this.redis.sadd(`user_sockets:${user.id}`, client.id);
                await this.redis.sadd('online_users', user.id);
            } catch { /* Redis unavailable — skip tracking */ }

            this.logger.log(`WS connected: user=${user.id} socket=${client.id}`);
        } catch {
            client.disconnect();
        }
    }

    async handleDisconnect(client: Socket) {
        const userId = (client as any).userId;
        if (userId) {
            try {
                await this.redis.srem(`user_sockets:${userId}`, client.id);
                const remaining = await this.redis.smembers(`user_sockets:${userId}`);
                if (remaining.length === 0) {
                    await this.redis.srem('online_users', userId);
                }
            } catch { /* Redis unavailable */ }
        }
        this.logger.log(`WS disconnected: ${client.id}`);
    }

    @SubscribeMessage('join_conversation')
    async handleJoinConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string },
    ) {
        const conversationId = data?.conversationId;
        if (!(await this.canJoinConversation(client, conversationId))) {
            this.logger.warn(
                `WS join_conversation DENIED: user=${(client as any).userId} conv=${conversationId}`,
            );
            return { event: 'join_denied', data: { conversationId } };
        }
        const tenantId = this.socketTenantId(client)!;
        client.join(this.conversationRoom(tenantId, conversationId));
        return { event: 'joined', data: { conversationId } };
    }

    @SubscribeMessage('leave_conversation')
    handleLeaveConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string },
    ) {
        const tenantId = this.socketTenantId(client);
        if (tenantId != null && data?.conversationId) {
            client.leave(this.conversationRoom(tenantId, data.conversationId));
        }
    }

    @SubscribeMessage('join_account')
    async handleJoinAccount(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { accountId: string },
    ) {
        const accountId = data?.accountId;
        // Cùng lý do với join_conversation: room `account:<id>` nhận `zalo:qr` + trạng thái
        // kết nối của tài khoản Zalo ⇒ phải chốt theo tenant, không tin id client gửi lên.
        if (!(await this.canJoinAccount(client, accountId))) {
            this.logger.warn(
                `WS join_account DENIED: user=${(client as any).userId} account=${accountId}`,
            );
            return { event: 'join_denied', data: { accountId } };
        }
        const tenantId = this.socketTenantId(client)!;
        client.join(this.accountRoom(tenantId, accountId));
        return { event: 'joined_account', data: { accountId } };
    }

    private async canJoinAccount(client: Socket, accountId: string): Promise<boolean> {
        if (!accountId || typeof accountId !== 'string') return false;
        const tenantId = this.socketTenantId(client);
        if (tenantId == null) return false;

        try {
            const rows = await this.queryOwnedResource(
                `SELECT 1
                 FROM zalo_accounts za
                 INNER JOIN channels ch ON ch.id = za.channel_id
                 WHERE za.id = $1 AND ch.tenant_id = $2
                 LIMIT 1`,
                accountId,
                tenantId,
            );
            return rows.length > 0;
        } catch (e) {
            this.logger.error(
                `canJoinAccount lookup failed (account=${accountId}): ${e instanceof Error ? e.message : e}`,
            );
            return false;
        }
    }

    @SubscribeMessage('leave_account')
    handleLeaveAccount(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { accountId: string },
    ) {
        const tenantId = this.socketTenantId(client);
        if (tenantId != null && data?.accountId) {
            client.leave(this.accountRoom(tenantId, data.accountId));
        }
    }

    // ===== Emit methods (called by services) =====

    /**
     * Đích phát dữ liệu tổ chức luôn là room tenant, độc lập với cờ RLS của DB.
     * Thiếu/sai tenantId phải drop; tuyệt đối không fallback `server.emit` toàn cục.
     */
    private businessTarget(
        tenantId: unknown,
        event: string,
    ): { emit: (event: string, ...args: any[]) => any } | null {
        if (!Number.isSafeInteger(tenantId) || Number(tenantId) <= 0) {
            this.logger.warn(`WS business event "${event}" dropped: thiếu tenantId hợp lệ`);
            return null;
        }
        return this.server.to(`tenant:${tenantId}`);
    }

    private emitTenantEvent(tenantId: unknown, event: string, payload: unknown): boolean {
        const target = this.businessTarget(tenantId, event);
        if (!target) return false;
        target.emit(event, payload);
        return true;
    }

    private emitConversationEvent(
        tenantId: unknown,
        conversationId: string,
        event: string,
        payload: unknown,
    ): boolean {
        if (!this.businessTarget(tenantId, event)) return false;
        const normalizedTenantId = Number(tenantId);
        this.server.to(this.conversationRoom(normalizedTenantId, conversationId)).emit(event, payload);
        return true;
    }

    /**
     * Emit new message to all users in the conversation room
     */
    emitNewMessage(conversationId: string, message: any, tenantId?: number): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'new_message', {
            conversationId,
            message,
        });
    }

    /**
     * Emit conversation update to all connected agents
     */
    emitConversationUpdated(conversation: any, tenantId?: number) {
        return this.emitTenantEvent(tenantId, 'conversation_updated', { conversation });
    }

    /**
     * Emit new conversation to all connected agents
     */
    emitNewConversation(conversation: any, tenantId?: number) {
        return this.emitTenantEvent(tenantId, 'new_conversation', { conversation });
    }

    /**
     * Emit message status update
     */
    emitMessageStatus(conversationId: string, messageId: string, status: string, tenantId?: number): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'message_status', {
            conversationId,
            messageId,
            status,
        });
    }

    /**
     * Check how many clients are viewing a conversation room
     */
    getConversationRoomSize(conversationId: string, tenantId?: number): number {
        try {
            if (!Number.isSafeInteger(tenantId) || Number(tenantId) <= 0) return 0;
            const room = this.server?.sockets?.adapter?.rooms?.get(
                this.conversationRoom(Number(tenantId), conversationId),
            );
            return room ? room.size : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Emit typing indicator
     */
    emitTyping(conversationId: string, extUserId: string, isTyping: boolean, tenantId?: number): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'typing', {
            conversationId,
            extUserId,
            isTyping,
        });
    }

    /**
     * Emit notification to specific user
     */
    emitNotification(userId: string, notification: any, tenantId?: number): boolean {
        if (!this.businessTarget(tenantId, 'notification')) return false;
        this.server.to(`user:${userId}`).emit('notification', notification);
        return true;
    }

    /**
     * Get count of online agents
     */
    async getOnlineCount(): Promise<number> {
        try { const members = await this.redis.smembers('online_users'); return members.length; } catch { return 0; }
    }

    /**
     * Feature 6: Emit SLA warning before deadline
     */
    emitSlaWarning(conversationId: string, minutesLeft: number, tenantId?: number) {
        return this.emitTenantEvent(tenantId, 'sla_warning', { conversationId, minutesLeft });
    }

    /**
     * Feature 7: Emit dashboard KPI update to all agents
     */
    emitDashboardUpdate(kpi: any, tenantId?: number) {
        return this.emitTenantEvent(tenantId, 'dashboard_update', kpi);
    }

    /**
     * Feature 1: Emit auto-reply notification
     */
    emitAutoReply(conversationId: string, message: any, tenantId?: number) {
        const tenantTarget = this.businessTarget(tenantId, 'auto_reply_sent');
        if (!tenantTarget) return false;
        this.server.to(this.conversationRoom(Number(tenantId), conversationId)).emit('auto_reply_sent', {
            conversationId,
            message,
        });
        tenantTarget.emit('conversation_updated', {
            conversation: { id: conversationId, lastAutoReply: new Date() },
        });
        return true;
    }

    emitFollowUpScheduled(
        tenantId: number,
        conversationId: string,
        data: { followUpId: string; scheduledAt: Date; attempt: number; context: string | null },
    ): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'follow_up_scheduled', data);
    }

    emitFollowUpCancelled(
        tenantId: number,
        conversationId: string,
        count: number,
    ): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'follow_up_cancelled', {
            conversationId,
            count,
        });
    }

    emitFollowUpDue(
        tenantId: number,
        data: { followUpId: string; conversationId: string; message: string; attempt: number; context: string | null },
    ): boolean {
        return this.emitTenantEvent(tenantId, 'follow_up_due', data);
    }

    emitProactiveFollowUp(tenantId: number, data: ProactiveFollowUpEvent): boolean {
        return this.emitTenantEvent(tenantId, 'proactive_followup', data);
    }

    emitAgentThought(tenantId: number, data: AgentThoughtEvent): boolean {
        return this.emitTenantEvent(tenantId, 'agent_thought', data);
    }

    emitSuggestionGenerated(
        tenantId: number,
        conversationId: string,
        suggestion: unknown,
        suggestionId: string,
    ): boolean {
        const tenantTarget = this.businessTarget(tenantId, 'suggestion_available');
        if (!tenantTarget) return false;
        this.server.to(this.conversationRoom(Number(tenantId), conversationId)).emit('new_suggestion', {
            conversationId,
            suggestion,
        });
        tenantTarget.emit('suggestion_available', { conversationId, suggestionId });
        return true;
    }

    emitSuggestionSent(
        tenantId: number,
        conversationId: string,
        suggestionId: string,
        auto: boolean,
    ): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'suggestion_sent', {
            conversationId,
            suggestionId,
            auto,
        });
    }

    /**
     * Emit message reaction update
     */
    emitMessageReacted(conversationId: string, messageId: string, reactions: any, tenantId?: number): boolean {
        return this.emitConversationEvent(tenantId, conversationId, 'message_reacted', {
            conversationId,
            messageId,
            reactions,
        });
    }

    /** Seam có kiểm tenant cho các mutation room ít phổ biến (recall/pin/star/delete). */
    emitConversationScopedEvent(
        tenantId: number | null | undefined,
        conversationId: string,
        event: string,
        payload: unknown,
    ): boolean {
        return this.emitConversationEvent(tenantId, conversationId, event, payload);
    }

    /** Seam có kiểm tenant cho event Zalo/account và producer hạ tầng. */
    emitTenantScopedEvent(
        tenantId: number | null | undefined,
        event: string,
        payload: unknown,
    ): boolean {
        return this.emitTenantEvent(tenantId, event, payload);
    }

    emitAccountScopedEvent(
        tenantId: number | null | undefined,
        accountId: string,
        event: string,
        payload: unknown,
    ): boolean {
        if (!this.businessTarget(tenantId, event)) return false;
        this.server.to(this.accountRoom(Number(tenantId), accountId)).emit(event, payload);
        return true;
    }
}
