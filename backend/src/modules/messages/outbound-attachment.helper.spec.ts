import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    loadInternalChatAttachment,
    OUTBOUND_ATTACHMENT_MAX_BYTES,
} from './outbound-attachment.helper';

function makePng(width = 2, height = 3): Buffer {
    const data = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(data, 0);
    data.writeUInt32BE(width, 16);
    data.writeUInt32BE(height, 20);
    return data;
}

describe('loadInternalChatAttachment', () => {
    let sandbox: string;
    let storageRoot: string;

    beforeEach(async () => {
        sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'zeplao-outbound-attachment-'));
        storageRoot = path.join(sandbox, 'uploads', 'chat');
        await fs.mkdir(storageRoot, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(sandbox, { recursive: true, force: true });
    });

    const options = () => ({
        storageRoot,
        allowedBaseUrls: ['http://localhost:4000'],
    });

    it('đọc async tệp ảnh nội bộ hợp lệ từ URL do upload endpoint trả về', async () => {
        const data = makePng();
        await fs.writeFile(path.join(storageRoot, 'safe-image.png'), data);

        const result = await loadInternalChatAttachment(
            'http://localhost:4000/uploads/chat/safe-image.png',
            options(),
        );

        expect(result).toMatchObject({
            filename: 'safe-image.png',
            mimeType: 'image/png',
            size: data.length,
        });
        expect(result.data.equals(data)).toBe(true);
    });

    it.each([
        '/uploads/chat/../../secret.png',
        '/uploads/chat/%2e%2e/secret.png',
        '/uploads/chat/subdir/%2e%2e/%2e%2e/secret.png',
        '/uploads/chat/subdir%5c..%5csecret.png',
    ])('từ chối traversal: %s', async (reference) => {
        await expect(loadInternalChatAttachment(reference, options())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối URL HTTP của host bên ngoài dù pathname trông giống upload nội bộ', async () => {
        await fs.writeFile(path.join(storageRoot, 'safe-image.png'), makePng());

        await expect(
            loadInternalChatAttachment('https://attacker.example/uploads/chat/safe-image.png', options()),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối junction/symlink thoát khỏi storage root sau canonical realpath', async () => {
        const outsideDir = path.join(sandbox, 'outside');
        await fs.mkdir(outsideDir);
        await fs.writeFile(path.join(outsideDir, 'secret.png'), makePng());
        await fs.symlink(outsideDir, path.join(storageRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

        await expect(
            loadInternalChatAttachment('/uploads/chat/escape/secret.png', options()),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối file vượt giới hạn trước khi đọc toàn bộ vào bộ nhớ', async () => {
        const filePath = path.join(storageRoot, 'too-large.png');
        const handle = await fs.open(filePath, 'w');
        try {
            await handle.truncate(OUTBOUND_ATTACHMENT_MAX_BYTES + 1);
        } finally {
            await handle.close();
        }

        await expect(
            loadInternalChatAttachment('/uploads/chat/too-large.png', options()),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('từ chối file có đuôi ảnh nhưng MIME thực tế không thuộc allowlist', async () => {
        await fs.writeFile(path.join(storageRoot, 'fake.png'), Buffer.from('<html>not an image</html>'));

        await expect(
            loadInternalChatAttachment('/uploads/chat/fake.png', options()),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});
