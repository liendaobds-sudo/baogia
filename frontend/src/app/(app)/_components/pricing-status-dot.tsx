'use client';

import { useEffect, useState } from 'react';

import { API_URL as API } from '@/lib/api';

export function PricingStatusDot() {
    const [healthy, setHealthy] = useState<boolean | null>(null);

    useEffect(() => {
        async function check() {
            try {
                const r = await fetch(`${API}/pricing/health`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('zh_token') || ''}` },
                    signal: AbortSignal.timeout(3000),
                });
                const data = await r.json();
                setHealthy(data.success === true || data.healthy === true);
            } catch {
                setHealthy(false);
            }
        }
        check();
        const iv = setInterval(check, 30000);
        return () => clearInterval(iv);
    }, []);

    const color = healthy === null ? '#6b7280' : healthy ? '#22c55e' : '#ef4444';

    return (
        <span
            style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: color,
                marginLeft: 'auto',
            }}
            title={healthy ? 'PricingPrint Online' : 'PricingPrint Offline'}
        />
    );
}
