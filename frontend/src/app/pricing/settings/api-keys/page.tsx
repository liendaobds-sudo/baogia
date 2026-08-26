"use client";

/**
 * SaaS API keys UI is not backed by a Nest endpoint yet.
 * Avoid dead /erp/api-keys calls in production.
 */
export default function ApiKeysUnavailablePage() {
    return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-3">
            <h1 className="text-xl font-bold text-slate-800">API Keys</h1>
            <p className="text-slate-500 text-sm">
                Tính năng quản lý API key SaaS chưa được triển khai backend.
                Dùng kênh nội bộ / Super Admin nếu cần tích hợp.
            </p>
        </div>
    );
}
