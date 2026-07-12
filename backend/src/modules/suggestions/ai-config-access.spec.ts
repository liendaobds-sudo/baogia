import 'reflect-metadata';
import { SuggestionsController } from './suggestions.controller';
import { KnowledgeBaseController } from '../knowledge-base/knowledge-base.controller';
import { ROLES_KEY } from '../auth/roles.guard';
import { UserRole } from '../../entities/user.entity';

/**
 * Khoá hành vi phân quyền (audit findings 🔴/🟠 → fix):
 *  - Cấu hình AI provider (ai-config) + automation-config: CHỈ ADMIN/SUPER_ADMIN
 *    (trước đây agent thường ghi được → lộ key/endpoint SSRF).
 *  - Thao tác quản trị KB (upload/update/delete/load-static/generate/reindex):
 *    CHỈ ADMIN/SUPER_ADMIN (đọc/tra cứu vẫn mở cho CSKH).
 */
const rolesOf = (fn: any): UserRole[] | undefined =>
    Reflect.getMetadata(ROLES_KEY, fn) as UserRole[] | undefined;

describe('Phân quyền ai-config / automation-config', () => {
    it.each([
        ['getAiConfig'],
        ['saveAiConfig'],
        ['getAutomationConfig'],
        ['saveAutomationConfig'],
    ])('%s chỉ cho ADMIN + SUPER_ADMIN', (method) => {
        const roles = rolesOf((SuggestionsController.prototype as any)[method]);
        expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
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
