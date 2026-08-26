import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

/** Khớp giới hạn tại endpoint upload chat; luôn kiểm lại trước khi gửi ra provider. */
export const OUTBOUND_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

export interface PreparedOutboundAttachment {
    data: Buffer;
    filename: string;
    mimeType: string;
    size: number;
}

export interface OutboundAttachmentOptions {
    storageRoot: string;
    allowedBaseUrls: readonly string[];
    maxBytes?: number;
}

const UPLOAD_PATH_PREFIX = '/uploads/chat/';

const EXTENSIONS_BY_MIME: Readonly<Record<string, readonly string[]>> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    'image/webp': ['.webp'],
    'image/heic': ['.heic'],
    'image/heif': ['.heif'],
};

function invalidAttachment(reason: string): BadRequestException {
    return new BadRequestException(`Tệp đính kèm không hợp lệ: ${reason}`);
}

function normalizeBaseUrl(raw: string): URL | null {
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url;
    } catch {
        return null;
    }
}

function expectedUploadPrefix(baseUrl: URL): string {
    const basePath = baseUrl.pathname.replace(/\/+$/, '').replace(/^\/$/, '');
    return `${basePath}${UPLOAD_PATH_PREFIX}` || UPLOAD_PATH_PREFIX;
}

function extractRelativeUploadPath(reference: string, allowedBaseUrls: readonly string[]): string {
    const value = reference.trim();
    if (!value || value.includes('\0')) {
        throw invalidAttachment('thiếu đường dẫn');
    }

    let encodedRelativePath: string;

    if (value.startsWith('/')) {
        // `//host/path` là URL protocol-relative, không phải đường dẫn upload nội bộ.
        if (value.startsWith('//')) throw invalidAttachment('không chấp nhận URL bên ngoài');

        const parsed = new URL(value, 'http://internal.invalid');
        if (parsed.search || parsed.hash || !parsed.pathname.startsWith(UPLOAD_PATH_PREFIX)) {
            throw invalidAttachment('chỉ chấp nhận đường dẫn /uploads/chat/');
        }
        encodedRelativePath = parsed.pathname.slice(UPLOAD_PATH_PREFIX.length);
    } else {
        let parsed: URL;
        try {
            parsed = new URL(value);
        } catch {
            throw invalidAttachment('đường dẫn không đúng định dạng');
        }

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw invalidAttachment('chỉ chấp nhận tệp đã upload nội bộ');
        }

        const matchingBase = allowedBaseUrls
            .map(normalizeBaseUrl)
            .filter((url): url is URL => url !== null)
            .find((base) => {
                const prefix = expectedUploadPrefix(base);
                return parsed.origin === base.origin && parsed.pathname.startsWith(prefix);
            });

        if (!matchingBase || parsed.search || parsed.hash) {
            throw invalidAttachment('không chấp nhận URL bên ngoài');
        }

        encodedRelativePath = parsed.pathname.slice(expectedUploadPrefix(matchingBase).length);
    }

    let relativePath: string;
    try {
        relativePath = decodeURIComponent(encodedRelativePath);
    } catch {
        throw invalidAttachment('đường dẫn mã hóa không hợp lệ');
    }

    // URL phải dùng dấu `/`; backslash trên Windows có thể biến thành separator sau resolve.
    if (!relativePath || relativePath.includes('\\') || relativePath.includes('\0')) {
        throw invalidAttachment('đường dẫn chứa ký tự không hợp lệ');
    }

    const segments = relativePath.split('/');
    if (
        segments.some((segment) =>
            !segment ||
            segment === '.' ||
            segment === '..' ||
            !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment),
        )
    ) {
        throw invalidAttachment('phát hiện đường dẫn thoát thư mục upload');
    }

    return segments.join(path.sep);
}

function isStrictlyInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function detectImageMime(data: Buffer): string | null {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        data.length >= 8 &&
        data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return 'image/png';
    }
    if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6))) {
        return 'image/gif';
    }
    if (
        data.length >= 12 &&
        data.toString('ascii', 0, 4) === 'RIFF' &&
        data.toString('ascii', 8, 12) === 'WEBP'
    ) {
        return 'image/webp';
    }
    if (data.length >= 12 && data.toString('ascii', 4, 8) === 'ftyp') {
        const brands = data.toString('ascii', 8, Math.min(data.length, 32));
        if (/heic|heix|hevc|hevx/.test(brands)) return 'image/heic';
        if (/mif1|msf1/.test(brands)) return 'image/heif';
    }
    return null;
}

/**
 * Nạp một tệp do endpoint chat-media tạo ra.
 *
 * Hai lớp confinement được dùng cùng lúc:
 *  1. path.resolve/path.relative chặn traversal theo chuỗi;
 *  2. realpath của cả root và file chặn symlink/junction trỏ ra ngoài root.
 */
export async function loadInternalChatAttachment(
    reference: string,
    options: OutboundAttachmentOptions,
): Promise<PreparedOutboundAttachment> {
    const relativePath = extractRelativeUploadPath(reference, options.allowedBaseUrls);
    const configuredRoot = path.resolve(options.storageRoot);

    let realRoot: string;
    try {
        realRoot = await fs.realpath(configuredRoot);
    } catch {
        throw invalidAttachment('thư mục upload chưa sẵn sàng');
    }

    const lexicalCandidate = path.resolve(realRoot, relativePath);
    if (!isStrictlyInside(realRoot, lexicalCandidate)) {
        throw invalidAttachment('phát hiện đường dẫn thoát thư mục upload');
    }

    let realCandidate: string;
    try {
        realCandidate = await fs.realpath(lexicalCandidate);
    } catch {
        throw invalidAttachment('không tìm thấy tệp đã upload');
    }

    if (!isStrictlyInside(realRoot, realCandidate)) {
        throw invalidAttachment('tệp liên kết nằm ngoài thư mục upload');
    }

    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        handle = await fs.open(realCandidate, 'r');
        const stat = await handle.stat();
        const maxBytes = options.maxBytes ?? OUTBOUND_ATTACHMENT_MAX_BYTES;

        if (!stat.isFile()) throw invalidAttachment('đường dẫn không phải tệp');
        if (stat.size <= 0) throw invalidAttachment('tệp rỗng');
        if (stat.size > maxBytes) {
            throw invalidAttachment(`kích thước vượt quá ${Math.floor(maxBytes / (1024 * 1024))}MB`);
        }

        const data = await handle.readFile();
        // Kiểm lại sau read để không tin metadata nếu file bị thay đổi đồng thời.
        if (data.length > maxBytes) {
            throw invalidAttachment(`kích thước vượt quá ${Math.floor(maxBytes / (1024 * 1024))}MB`);
        }

        const mimeType = detectImageMime(data);
        const extension = path.extname(relativePath).toLowerCase();
        if (!mimeType || !EXTENSIONS_BY_MIME[mimeType]?.includes(extension)) {
            throw invalidAttachment('MIME thực tế không khớp định dạng ảnh cho phép');
        }

        return {
            data,
            filename: path.basename(relativePath),
            mimeType,
            size: data.length,
        };
    } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw invalidAttachment('không thể đọc tệp đã upload');
    } finally {
        await handle?.close().catch(() => undefined);
    }
}
