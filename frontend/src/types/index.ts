// ════════════════════════════════════════════════════
// ZeplaoPrint — Shared TypeScript Types
// Shared between frontend pages to eliminate duplication
// ════════════════════════════════════════════════════

// ═══ Auth ═══
export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: 'admin' | 'supervisor' | 'agent';
    avatarUrl?: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: AuthUser;
}

// ═══ Conversations ═══
export type ConversationStatus =
    | 'new'
    | 'in_progress'
    | 'waiting_customer'
    | 'waiting_file'
    | 'quoted'
    | 'won'
    | 'lost'
    | 'closed';

export type ConversationPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface Conversation {
    id: string;
    channelId: string;
    contactId: string;
    assigneeId?: string;
    status: ConversationStatus;
    priority: ConversationPriority;
    subject?: string;
    productType?: string;
    lastMessageAt?: string;
    lastCustomerMessageAt?: string;
    slaDeadline?: string;
    slaBreached: boolean;
    unreadCount: number;
    tags: string[];
    isPinned?: boolean;
    metadata: Record<string, any>;
    closedAt?: string;
    createdAt: string;
    updatedAt: string;
    contact?: Contact;
    assignee?: AuthUser;
}

// ═══ Messages ═══
export type SenderType = 'customer' | 'agent' | 'system';
export type ContentType = 'text' | 'image' | 'file' | 'sticker' | 'location' | 'quote_card';
export type MessageStatus = 'received' | 'sending' | 'sent' | 'failed' | 'delivered' | 'read';

export interface Message {
    id: string;
    conversationId: string;
    senderType: SenderType;
    senderId?: string;
    content?: string;
    contentType: ContentType;
    attachments: any[];
    externalMsgId?: string;
    status: MessageStatus;
    reactions?: Record<string, number>;
    suggestionId?: string;
    suggestionAction?: 'sent_as_is' | 'edited' | 'manual';
    createdAt: string;
}

// ═══ Contacts ═══
export type PipelineStatus = 'new' | 'contacted' | 'interested' | 'converted' | 'lost';

export interface Contact {
    id: string;
    channelId: string;
    externalUserId: string;
    displayName?: string;
    avatarUrl?: string;
    phone?: string;
    email?: string;
    tags: string[];
    memoryFacts: { fact: string; source: string; at: string }[];
    metadata: Record<string, any>;
    firstContactAt?: string;
    lastContactAt?: string;
    pipelineStatus: PipelineStatus;
    source?: string;
    notes?: string;
    nextAppointment?: string;
    createdAt: string;
}

// ═══ Appointments ═══
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

export interface Appointment {
    id: string;
    contactId: string;
    assignedUserId?: string;
    appointmentDate: string;
    appointmentTime?: string;
    type?: string;
    status: AppointmentStatus;
    notes?: string;
    reminderSent: boolean;
    createdAt: string;
    contact?: Contact;
}

// ═══ Notifications ═══
export interface SmartNotification {
    id: string;
    type: 'warning' | 'info' | 'error';
    priority: 'high' | 'medium' | 'low';
    title: string;
    detail: string;
    createdAt: string;
    actionUrl?: string;
}

// ═══ Search ═══
export interface SearchResult {
    contacts: Partial<Contact>[];
    messages: Partial<Message>[];
    appointments: Partial<Appointment>[];
}

// ═══ Dashboard KPI ═══
export interface DashboardKpi {
    conversations: {
        total: number;
        open: number;
        byStatus: Record<string, number>;
    };
    messages: { total: number };
    suggestionUsage: {
        total: number;
        sentAsIs: number;
        edited: number;
        rejected: number;
        acceptRate: number;
        avgLatencyMs: number;
    };
    sla: {
        totalBreaches: number;
        complianceRate: number;
    };
    system: {
        onlineAgents: number;
    };
}

// ═══ UI Constants ═══
export const STATUS_LABELS: Record<ConversationStatus, string> = {
    new: 'Mới',
    in_progress: 'Đang xử lý',
    waiting_customer: 'Chờ KH',
    waiting_file: 'Chờ file',
    quoted: 'Đã báo giá',
    won: 'Thành công',
    lost: 'Thất bại',
    closed: 'Đóng',
};

export const STATUS_COLORS: Record<ConversationStatus, string> = {
    new: '#3b82f6',
    in_progress: '#f59e0b',
    waiting_customer: '#8b5cf6',
    waiting_file: '#ec4899',
    quoted: '#06b6d4',
    won: '#10b981',
    lost: '#ef4444',
    closed: '#6b7280',
};

export const PIPELINE_LABELS: Record<PipelineStatus, string> = {
    new: 'Mới',
    contacted: 'Đã liên hệ',
    interested: 'Quan tâm',
    converted: 'Đã chuyển đổi',
    lost: 'Mất',
};

export const PIPELINE_COLORS: Record<PipelineStatus, string> = {
    new: '#3b82f6',
    contacted: '#f59e0b',
    interested: '#8b5cf6',
    converted: '#10b981',
    lost: '#ef4444',
};
