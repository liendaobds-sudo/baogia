import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { MediaController } from './media.controller';
import { ROLES_KEY } from '../auth/roles.guard';
import { UserRole } from '../../entities/user.entity';

/**
 * MediaController /settings (audit finding 🔴 → fix):
 *  - CHỈ ADMIN/SUPER_ADMIN (trước đây không guard → bất kỳ ai đặt gốc lưu trữ).
 *  - Validate path: từ chối gốc hệ thống ('/', 'C:\') / tương đối / chứa '..'.
 */
describe('MediaController — settings hardening', () => {
    const rolesOf = (fn: any): UserRole[] | undefined =>
        Reflect.getMetadata(ROLES_KEY, fn) as UserRole[] | undefined;

    it('getSettings & updateSettings yêu cầu ADMIN + SUPER_ADMIN', () => {
        expect(rolesOf(MediaController.prototype.getSettings)).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
        expect(rolesOf(MediaController.prototype.updateSettings)).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    });

    describe('validate storage path', () => {
        let repo: any;
        let ctrl: MediaController;
        beforeEach(() => {
            repo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((d: any) => d), save: jest.fn(async () => ({})) };
            ctrl = new MediaController(repo);
        });

        it.each(['/', 'C:\\', '/etc', 'relative/path', '/a/../b'])('từ chối path nguy hiểm: %s', async (p) => {
            await expect(ctrl.updateSettings({ zalo_media_storage_path: p })).rejects.toThrow(BadRequestException);
            expect(repo.save).not.toHaveBeenCalled();
        });

        it('chấp nhận path chuyên dụng đủ sâu', async () => {
            const res = await ctrl.updateSettings({ zalo_media_storage_path: '/srv/app/zalo_media' });
            expect(res).toEqual({ success: true });
            expect(repo.save).toHaveBeenCalled();
        });

        it('cho phép rỗng (xoá cấu hình → fallback mặc định)', async () => {
            const res = await ctrl.updateSettings({ zalo_media_storage_path: '' });
            expect(res).toEqual({ success: true });
        });
    });
});
