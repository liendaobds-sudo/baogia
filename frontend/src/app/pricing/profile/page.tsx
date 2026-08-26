"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Pricing profile stub previously called non-existent /erp/profile.
 * Redirect to the live CSKH profile at /profile.
 */
export default function PricingProfileRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/profile');
    }, [router]);

    return (
        <div className="flex items-center justify-center h-full text-slate-500 text-sm">
            Đang chuyển tới hồ sơ…
        </div>
    );
}
