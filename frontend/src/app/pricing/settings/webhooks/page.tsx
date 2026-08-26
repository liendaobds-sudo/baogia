"use client";

export default function WebhooksUnavailablePage() {
    return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-3">
            <h1 className="text-xl font-bold text-slate-800">Webhooks</h1>
            <p className="text-slate-500 text-sm">
                Cấu hình webhook SaaS (outbound ERP events) chưa có backend.
                Webhook Zalo OA cấu hình tại Cài đặt CSKH → Channels.
            </p>
            <a href="/settings" className="text-indigo-600 text-sm font-semibold">← Về Cài đặt CSKH</a>
        </div>
    );
}
