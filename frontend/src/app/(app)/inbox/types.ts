export interface User {
    id: string;
    fullName: string;
    email: string;
}

export interface Contact {
    displayName: string;
    avatarUrl: string;
    externalUserId?: string;
}

export interface Conversation {
    id: string;
    status: string;
    priority: string;
    lastMessageAt: string;
    slaDeadline: string;
    slaBreached: boolean;
    contact: Contact;
    assignee?: User;
    lastMessage?: string;
    unreadCount?: number;
    tags?: string[];
    channel?: { id: string; type: string; name: string };
    isPinned?: boolean;
    metadata?: Record<string, any>;
    externalId?: string;
}

export interface ChatMessage {
    id: string;
    senderType: string;
    senderName?: string;
    senderAvatarUrl?: string;
    content: string;
    contentType: string;
    attachments?: { url: string; type: string; name?: string; preview?: string; localUrl?: string }[];
    status: string;
    reactions?: Record<string, number>;
    quoteId?: string;
    quoteData?: any;
    isPinned?: boolean;
    isStarred?: boolean;
    isLocalDeleted?: boolean;
    createdAt: string;
}

export interface Suggestion {
    id: string;
    replies: { text: string; label?: string }[];
    missingInfo: { slot: string; question: string }[];
    sources?: { docId?: string; docName?: string; heading?: string; excerpt?: string }[];
    warnings?: string[];
    sentiment?: number;
    triggerMessageId?: string;
    confidence: number;
    intent: string;
    model: string;
    status: string;
    createdAt: string;
}

export interface QuickReply {
    id: string;
    title: string;
    content: string;
    shortcut: string;
    category: string;
}

export interface Note {
    id: string;
    content: string;
    isPinned: boolean;
    author: User;
    createdAt: string;
    scope?: 'conversation' | 'customer' | 'global';
}

export interface Participant {
    id: string;
    userId: string;
    role: string;
    canViewCustomerInfo: boolean;
    user: User;
    addedAt: string;
}

