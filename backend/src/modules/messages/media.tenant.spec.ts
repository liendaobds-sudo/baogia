import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { MediaController } from './media.controller';

/**
 * Audit 2026-08-29 — `GET /media/file` chống path traversal tốt nhưng KHÔNG kiểm file
 * thuộc tenant nào ⇒ user đã đăng nhập của tenant B đọc được media của tenant A nếu biết
 * đường dẫn tương đối.
 *
 * `ZaloMediaArchiverService` lưu theo `t<tenantId>/YYYY/MM/DD/...`, nên tiền tố thư mục là
 * chốt cưỡng chế. File KHÔNG có tiền tố `t<N>/` là dữ liệu di sản (trước khi phân vùng) —
 * vẫn phục vụ để không mất ảnh cũ.
 */
describe('MediaController — cô lập tenant theo tiền tố thư mục', () => {
    const build = (tenant?: { tenantId: number; bypass?: boolean }) => {
        const repo = { findOne: jest.fn().mockResolvedValue(null) } as any;
        const tenantCtx = tenant ? ({ get: () => tenant } as any) : undefined;
        const ctrl = new MediaController(repo, tenantCtx);
        return { ctrl, assertOwns: (p: string) => (ctrl as any).assertTenantOwnsPath(p) };
    };

    it('tenant khớp tiền tố ⇒ cho phép', () => {
        const { assertOwns } = build({ tenantId: 1 });
        expect(() => assertOwns('t1/2026/01/01/a.jpg')).not.toThrow();
    });

    it('tenant KHÁC tiền tố ⇒ 404 (không tiết lộ sự tồn tại)', () => {
        const { assertOwns } = build({ tenantId: 2 });
        expect(() => assertOwns('t1/2026/01/01/a.jpg')).toThrow(NotFoundException);
    });

    it('không có tenant context nhưng path đã phân vùng ⇒ chặn', () => {
        const { assertOwns } = build(undefined);
        expect(() => assertOwns('t1/2026/01/01/a.jpg')).toThrow(NotFoundException);
    });

    it('bypass tường minh ⇒ cho phép (đường super-admin có kiểm soát)', () => {
        const { assertOwns } = build({ tenantId: 9, bypass: true });
        expect(() => assertOwns('t1/2026/01/01/a.jpg')).not.toThrow();
    });

    it('path di sản (không tiền tố tenant) ⇒ giữ tương thích, không chặn', () => {
        const { assertOwns } = build({ tenantId: 2 });
        expect(() => assertOwns('2026/01/01/a.jpg')).not.toThrow();
    });

    it('tiền tố gần giống nhưng không đúng dạng t<số> ⇒ coi là di sản, không chặn', () => {
        const { assertOwns } = build({ tenantId: 2 });
        expect(() => assertOwns('temp/2026/a.jpg')).not.toThrow();
        expect(() => assertOwns('t1x/2026/a.jpg')).not.toThrow();
    });

    it('phân tách bằng dấu \\ (Windows) vẫn được cưỡng chế', () => {
        const { assertOwns } = build({ tenantId: 2 });
        expect(() => assertOwns('t1\\2026\\01\\a.jpg')).toThrow(NotFoundException);
    });

    it('không nhầm t10 với t1', () => {
        const { assertOwns } = build({ tenantId: 1 });
        expect(() => assertOwns('t10/2026/a.jpg')).toThrow(NotFoundException);
    });
});
