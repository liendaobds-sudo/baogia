import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { Conversation, ConversationStatus } from '../../entities/conversation.entity';
import { Appointment, AppointmentStatus } from '../../entities/appointment.entity';

export interface SmartNotification {
    id: string;
    type: 'warning' | 'info' | 'error';
    priority: 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    createdAt: string;
    actionUrl?: string;
}

@Injectable()
export class SmartNotificationsService {
    constructor(
        @InjectRepository(Conversation)
        private readonly conversationRepo: Repository<Conversation>,
        @InjectRepository(Appointment)
        private readonly appointmentRepo: Repository<Appointment>,
    ) {}

    /**
     * Compute notifications on-the-fly — no stored records needed.
     * Inspired by ZaloCRM notification-routes.ts
     *
     * Sources:
     * 1. Unreplied conversations > 30 min
     * 2. SLA breached conversations
     * 3. Today's scheduled appointments
     * 4. Tomorrow's appointments count
     */
    async getSmartNotifications(): Promise<SmartNotification[]> {
        const notifications: SmartNotification[] = [];

        // 1. Unreplied conversations > 30 minutes
        const thirtyMinAgo = new Date(Date.now() - 30 * 60_000);
        const unrepliedCount = await this.conversationRepo.count({
            where: {
                status: ConversationStatus.NEW,
                lastCustomerMessageAt: LessThan(thirtyMinAgo),
            },
        });

        if (unrepliedCount > 0) {
            notifications.push({
                id: 'unreplied',
                type: 'warning',
                priority: 'high',
                title: `${unrepliedCount} cuộc trò chuyện chưa trả lời`,
                detail: 'Có tin nhắn chưa phản hồi quá 30 phút',
                createdAt: new Date().toISOString(),
                actionUrl: '/conversations?status=new',
            });
        }

        // 2. SLA breached conversations
        const slaBreachedCount = await this.conversationRepo.count({
            where: { slaBreached: true, status: ConversationStatus.IN_PROGRESS },
        });

        if (slaBreachedCount > 0) {
            notifications.push({
                id: 'sla-breached',
                type: 'error',
                priority: 'high',
                title: `${slaBreachedCount} cuộc trò chuyện vượt SLA`,
                detail: 'Cần xử lý ngay để duy trì chất lượng dịch vụ',
                createdAt: new Date().toISOString(),
                actionUrl: '/conversations?slaBreached=true',
            });
        }

        // 3. Today's scheduled appointments
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        const todayApts = await this.appointmentRepo.find({
            where: {
                appointmentDate: Between(todayStart, todayEnd),
                status: AppointmentStatus.SCHEDULED,
            },
            relations: ['contact'],
            take: 5,
            order: { appointmentTime: 'ASC' },
        });

        for (const apt of todayApts) {
            notifications.push({
                id: `apt-${apt.id}`,
                type: 'info',
                priority: 'medium',
                title: `Lịch hẹn: ${apt.contact?.displayName || 'Khách hàng'}`,
                detail: `${apt.appointmentTime || ''} - ${apt.notes || apt.type || 'Tư vấn'}`,
                createdAt: apt.appointmentDate.toISOString(),
                actionUrl: `/appointments/${apt.id}`,
            });
        }

        // 4. Tomorrow's appointments
        const tomorrowStart = new Date(todayEnd);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

        const tomorrowCount = await this.appointmentRepo.count({
            where: {
                appointmentDate: Between(tomorrowStart, tomorrowEnd),
                status: AppointmentStatus.SCHEDULED,
            },
        });

        if (tomorrowCount > 0) {
            notifications.push({
                id: 'tmr-apts',
                type: 'info',
                priority: 'low',
                title: `${tomorrowCount} lịch hẹn ngày mai`,
                detail: 'Chuẩn bị cho ngày mai',
                createdAt: new Date().toISOString(),
                actionUrl: '/appointments?date=tomorrow',
            });
        }

        // Sort: high priority first
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        notifications.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        return notifications;
    }
}
