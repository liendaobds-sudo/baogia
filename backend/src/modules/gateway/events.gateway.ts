import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    ConnectedSocket,
    MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

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
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(EventsGateway.name);

    constructor(
        private jwtService: JwtService,
        private configService: ConfigService,
        private redis: RedisService,
    ) {}

    async handleConnection(client: Socket) {
        try {
            const token =
                client.handshake.auth?.token ||
                client.handshake.query?.token as string;

            if (!token) {
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token, {
                secret: this.configService.get('JWT_SECRET'),
            });

            // Store user info on socket
            (client as any).userId = payload.sub;
            (client as any).userRole = payload.role;

            // Join user-specific room
            client.join(`user:${payload.sub}`);

            // Track connection (Redis optional)
            try {
                await this.redis.sadd(`user_sockets:${payload.sub}`, client.id);
                await this.redis.sadd('online_users', payload.sub);
            } catch { /* Redis unavailable — skip tracking */ }

            this.logger.log(`WS connected: ${payload.email} (${client.id})`);
        } catch (error) {
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
    handleJoinConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string },
    ) {
        client.join(`conversation:${data.conversationId}`);
        return { event: 'joined', data: { conversationId: data.conversationId } };
    }

    @SubscribeMessage('leave_conversation')
    handleLeaveConversation(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { conversationId: string },
    ) {
        client.leave(`conversation:${data.conversationId}`);
    }

    @SubscribeMessage('join_account')
    handleJoinAccount(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { accountId: string },
    ) {
        client.join(`account:${data.accountId}`);
        return { event: 'joined_account', data: { accountId: data.accountId } };
    }

    @SubscribeMessage('leave_account')
    handleLeaveAccount(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { accountId: string },
    ) {
        client.leave(`account:${data.accountId}`);
    }

    // ===== Emit methods (called by services) =====

    /**
     * Emit new message to all users in the conversation room
     */
    emitNewMessage(conversationId: string, message: any) {
        this.server.to(`conversation:${conversationId}`).emit('new_message', {
            conversationId,
            message,
        });
    }

    /**
     * Emit conversation update to all connected agents
     */
    emitConversationUpdated(conversation: any) {
        this.server.emit('conversation_updated', { conversation });
    }

    /**
     * Emit new conversation to all connected agents
     */
    emitNewConversation(conversation: any) {
        this.server.emit('new_conversation', { conversation });
    }

    /**
     * Emit message status update
     */
    emitMessageStatus(conversationId: string, messageId: string, status: string) {
        this.server.to(`conversation:${conversationId}`).emit('message_status', {
            conversationId,
            messageId,
            status,
        });
    }

    /**
     * Check how many clients are viewing a conversation room
     */
    getConversationRoomSize(conversationId: string): number {
        try {
            const room = this.server?.sockets?.adapter?.rooms?.get(`conversation:${conversationId}`);
            return room ? room.size : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Emit typing indicator
     */
    emitTyping(conversationId: string, extUserId: string, isTyping: boolean) {
        this.server.to(`conversation:${conversationId}`).emit('typing', {
            conversationId,
            extUserId,
            isTyping,
        });
    }

    /**
     * Emit notification to specific user
     */
    emitNotification(userId: string, notification: any) {
        this.server.to(`user:${userId}`).emit('notification', notification);
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
    emitSlaWarning(conversationId: string, minutesLeft: number) {
        this.server.emit('sla_warning', { conversationId, minutesLeft });
    }

    /**
     * Feature 7: Emit dashboard KPI update to all agents
     */
    emitDashboardUpdate(kpi: any) {
        this.server.emit('dashboard_update', kpi);
    }

    /**
     * Feature 1: Emit auto-reply notification
     */
    emitAutoReply(conversationId: string, message: any) {
        this.server.to(`conversation:${conversationId}`).emit('auto_reply_sent', {
            conversationId,
            message,
        });
        this.server.emit('conversation_updated', {
            conversation: { id: conversationId, lastAutoReply: new Date() },
        });
    }

    /**
     * Emit message reaction update
     */
    emitMessageReacted(conversationId: string, messageId: string, reactions: any) {
        this.server.to(`conversation:${conversationId}`).emit('message_reacted', {
            conversationId,
            messageId,
            reactions,
        });
    }
}
