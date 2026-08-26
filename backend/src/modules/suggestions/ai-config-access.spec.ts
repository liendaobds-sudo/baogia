import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuggestionsController } from './suggestions.controller';
import { KnowledgeBaseController } from '../knowledge-base/knowledge-base.controller';
import { ROLES_KEY, RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../entities/user.entity';

/**
 * Khoá hành vi phân quyền (audit findings 🔴/🟠 → fix):
 *  - Cấu hình AI provider (ai-config) + automation-config: CHỈ SUPER_ADMIN.
 *  - Thao tác quản trị KB (upload/update/delete/load-static/generate/reindex):
 *    CHỈ ADMIN/SUPER_ADMIN (đọc/tra cứu vẫn mở cho CSKH).
 */
const rolesOf = (fn: any): UserRole[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, fn) as UserRole[] | undefined;

describe('Phân quyền ai-config / automation-config', () => {
    it.each([
        ['getAiConfig'],
        ['saveAiConfig'],
        ['testAiProvider'],
        ['getAutomationConfig'],
        ['saveAutomationConfig'],
    ])('%s chỉ cho SUPER_ADMIN', (method) => {
        const roles = rolesOf((SuggestionsController.prototype as any)[method]);
        expect(roles).toEqual([UserRole.SUPER_ADMIN]);
    });

    it('RolesGuard trả 403 cho tenant ADMIN và cho SUPER_ADMIN đi qua', () => {
        const guard = new RolesGuard(new Reflector());
        const contextFor = (role: UserRole): ExecutionContext => ({
            getHandler: () => SuggestionsController.prototype.saveAiConfig,
            getClass: () => SuggestionsController,
            switchToHttp: () => ({
                getRequest: () => ({ user: { role } }),
            }),
        } as unknown as ExecutionContext);

        expect(() => guard.canActivate(contextFor(UserRole.ADMIN))).toThrow(ForbiddenException);
        try {
            guard.canActivate(contextFor(UserRole.ADMIN));
        } catch (error) {
            expect((error as ForbiddenException).getStatus()).toBe(403);
        }
        expect(guard.canActivate(contextFor(UserRole.SUPER_ADMIN))).toBe(true);
    });

    it('generate (dùng bởi agent) KHÔNG bị giới hạn role', () => {
        expect(rolesOf((SuggestionsController.prototype as any).generate)).toBeUndefined();
    });
});

describe('Phân quyền thao tác quản trị KB', () => {
    it.each([
        ['uploadDocument'],
        ['updateDocumentContent'],
        ['loadStaticDocs'],
        ['generateFromPricing'],
        ['reindexEmbeddings'],
        ['deleteDocument'],
    ])('%s chỉ cho ADMIN + SUPER_ADMIN', (method) => {
        const roles = rolesOf((KnowledgeBaseController.prototype as any)[method]);
        expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
    });

    it.each([
        ['listDocuments'],
        ['searchChunks'],
    ])('%s vẫn mở cho user CSKH (không giới hạn role)', (method) => {
        expect(rolesOf((KnowledgeBaseController.prototype as any)[method])).toBeUndefined();
    });
});
