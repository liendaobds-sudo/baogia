"use client";

export default function AiQuoteConfigPage() {
    return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-3">
            <h1 className="text-xl font-bold text-slate-800">AI Quote Config</h1>
            <p className="text-slate-500 text-sm">
                Cấu hình AI chatbot nằm tại trang <strong>AI &amp; Kiến thức</strong> (CSKH)
                và file <code className="text-xs">backend/ai-config.json</code> / biến môi trường AI.
            </p>
            <a href="/ai" className="text-indigo-600 text-sm font-semibold">→ Mở AI &amp; Kiến thức</a>
        </div>
    );
}
