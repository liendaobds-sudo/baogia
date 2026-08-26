import { SearchKnowledgeBaseTool } from './search-kb.tool';

describe('SearchKnowledgeBaseTool — pricing provenance', () => {
    const tenant = { currentTenantId: jest.fn(() => 7) } as any;

    it('does not advertise KB as a source for customer prices', () => {
        const tool = new SearchKnowledgeBaseTool({} as any, tenant);

        expect(tool.description).not.toContain('giá tham khảo');
        expect(tool.description).toContain('không phải nguồn báo giá');
    });

    it('fails closed when the agent has no matching tenant context', async () => {
        const kb = { searchChunks: jest.fn() } as any;
        const tool = new SearchKnowledgeBaseTool(kb, tenant);

        await expect(tool.execute({ query: 'decal' }, { tenantId: 8 }))
            .resolves.toContain('thiếu hoặc sai ngữ cảnh đơn vị');
        expect(kb.searchChunks).not.toHaveBeenCalled();
    });

    it('searches only after the server-provided tenant matches the active context', async () => {
        const kb = { searchChunks: jest.fn().mockResolvedValue([]) } as any;
        const tool = new SearchKnowledgeBaseTool(kb, tenant);

        await tool.execute({ query: 'decal' }, { tenantId: 7 });

        expect(kb.searchChunks).toHaveBeenCalledWith('decal', 3);
    });
});
