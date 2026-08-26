"use client";

import { API_URL } from '@/lib/api';

export default function ApiDocsPage() {
    const swagger = API_URL.replace(/\/api\/v1\/?$/, '') + '/api/v1/docs';
    return (
        <div className="p-8 max-w-lg mx-auto text-center space-y-3">
            <h1 className="text-xl font-bold text-slate-800">API Docs</h1>
            <p className="text-slate-500 text-sm">
                Tài liệu OpenAPI (Swagger) chỉ bật khi backend không ở production.
            </p>
            <a href={swagger} target="_blank" rel="noopener noreferrer" className="text-indigo-600 text-sm font-semibold">
                Mở Swagger →
            </a>
        </div>
    );
}
