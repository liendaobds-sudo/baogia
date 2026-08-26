type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

function filenameFromContentDisposition(value: string | null): string | null {
    if (!value) return null;
    const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = value.match(/filename="?([^";]+)"?/i)?.[1];
    const raw = encoded || plain;
    if (!raw) return null;

    try {
        return decodeURIComponent(raw).replace(/[\\/\u0000-\u001f\u007f]/g, '_');
    } catch {
        return raw.replace(/[\\/\u0000-\u001f\u007f]/g, '_');
    }
}

/** Tải file qua authFetch để Bearer/refresh flow vẫn được áp dụng. */
export async function downloadAuthenticatedFile(
    authFetch: AuthFetch,
    url: string,
    fallbackFilename: string,
): Promise<void> {
    const response = await authFetch(url, {
        method: 'GET',
        headers: { Accept: 'text/csv,application/octet-stream' },
    });
    if (!response.ok) {
        throw new Error(`Tải tệp thất bại (HTTP ${response.status}).`);
    }

    const blob = await response.blob();
    const filename = filenameFromContentDisposition(
        response.headers.get('Content-Disposition'),
    ) || fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}
