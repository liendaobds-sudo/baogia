'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const { login, error, isLoading, user } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // If already logged in → redirect to inbox
    useEffect(() => {
        if (user) {
            router.replace('/inbox');
        }
    }, [user, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await login(email, password);
            router.push('/inbox');
        } catch {
            // error is displayed via context
        }
    };

    // Don't show login form if already authenticated
    if (user) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }}>
                Đang chuyển hướng...
            </div>
        );
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <h1>🔵 ZeplaoPrint</h1>
                <p>AI Agent Assist cho CSKH ngành In ấn</p>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Email</label>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@company.vn"
                            required
                            disabled={isLoading}
                            autoComplete="email"
                        />
                    </div>

                    <div className="input-group">
                        <label>Mật khẩu</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••"
                            required
                            disabled={isLoading}
                            autoComplete="current-password"
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        {isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                    </button>
                </form>
            </div>
        </div>
    );
}
