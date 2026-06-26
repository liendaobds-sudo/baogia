'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-context';

import { API_BASE } from '@/lib/api';

interface SocketContextValue {
    socket: Socket | null;
    connected: boolean;
    joinConversation: (conversationId: string) => void;
    leaveConversation: (conversationId: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
    socket: null,
    connected: false,
    joinConversation: () => { },
    leaveConversation: () => { },
});

export function SocketProvider({ children }: { children: ReactNode }) {
    const { token } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        if (!token) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
                setConnected(false);
            }
            return;
        }

        // Extract origin from API_BASE to ensure we connect to root namespace '/'
        // Example: 'http://localhost:4000/api/v1' -> 'http://localhost:4000'
        let socketUrl = API_BASE;
        try {
            socketUrl = new URL(API_BASE).origin;
        } catch (e) {
            // Fallback if API_BASE is relative
            if (socketUrl.includes('/api/v1')) {
                socketUrl = socketUrl.split('/api/v1')[0] || window.location.origin;
            }
        }

        const sock = io(socketUrl, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
            autoConnect: false, // Don't connect immediately — wait until mounted check
        });

        sock.on('connect', () => {
            if (mountedRef.current) setConnected(true);
        });

        sock.on('disconnect', () => {
            if (mountedRef.current) setConnected(false);
        });

        // Connect after setup — avoids race condition with StrictMode cleanup
        sock.connect();
        if (mountedRef.current) setSocket(sock);

        return () => {
            mountedRef.current = false;
            // Delay disconnect slightly to avoid "WebSocket is closed before the connection is established" warning in React Strict Mode
            setTimeout(() => sock.disconnect(), 200);
            setSocket(null);
            setConnected(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const joinConversation = useCallback((conversationId: string) => {
        socket?.emit('join_conversation', { conversationId });
    }, [socket]);

    const leaveConversation = useCallback((conversationId: string) => {
        socket?.emit('leave_conversation', { conversationId });
    }, [socket]);

    return (
        <SocketContext.Provider value={{ socket, connected, joinConversation, leaveConversation }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    return useContext(SocketContext);
}
