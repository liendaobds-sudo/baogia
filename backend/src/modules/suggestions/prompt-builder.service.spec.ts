import { PromptBuilderService } from './prompt-builder.service';

describe('PromptBuilderService', () => {
    let service: PromptBuilderService;

    beforeEach(() => {
        service = new PromptBuilderService();
    });

    // ─── simplifyForCustomer ───

    describe('simplifyForCustomer', () => {
        it('should translate "matte lamination" to "cán mờ"', () => {
            expect(service.simplifyForCustomer('matte lamination')).toBe('cán mờ');
        });

        it('should translate "glossy lamination" to "cán bóng"', () => {
            expect(service.simplifyForCustomer('glossy lamination')).toBe('cán bóng');
        });

        it('should translate "die-cut" to "bế (cắt theo hình)"', () => {
            expect(service.simplifyForCustomer('die-cut')).toBe('bế (cắt theo hình)');
        });

        it('should translate "saddle stitch" to "đóng ghim"', () => {
            expect(service.simplifyForCustomer('saddle stitch')).toBe('đóng ghim');
        });

        it('should translate "perfect binding" to "đóng keo gáy"', () => {
            expect(service.simplifyForCustomer('perfect binding')).toBe('đóng keo gáy');
        });

        it('should translate "hot foil stamping" to "ép nhũ"', () => {
            expect(service.simplifyForCustomer('hot foil stamping')).toBe('ép nhũ');
        });

        it('should translate "soft touch" to full Vietnamese', () => {
            expect(service.simplifyForCustomer('soft touch')).toBe('cán mềm mịn (sờ mượt như nhung)');
        });

        it('should translate "scoring" to "cấn (tạo nếp gấp)"', () => {
            expect(service.simplifyForCustomer('scoring')).toBe('cấn (tạo nếp gấp)');
        });

        it('should handle multiple terms in one string', () => {
            const result = service.simplifyForCustomer('in namecard matte lamination 2 mặt, die-cut');
            expect(result).toContain('cán mờ');
            expect(result).toContain('bế (cắt theo hình)');
        });

        it('should collapse multiple spaces', () => {
            expect(service.simplifyForCustomer('hello   world')).toBe('hello world');
        });

        it('should keep Vietnamese terms intact (couche, gsm, CMYK)', () => {
            const input = 'in couche 300gsm CMYK';
            expect(service.simplifyForCustomer(input)).toBe('in couche 300gsm CMYK');
        });
    });

    // ─── getSystemPrompt ───

    describe('getSystemPrompt', () => {
        it('should return a non-empty system prompt', () => {
            const prompt = service.getSystemPrompt();
            expect(prompt.length).toBeGreaterThan(100);
        });

        it('should contain core principles', () => {
            const prompt = service.getSystemPrompt();
            expect(prompt).toContain('SUY LUẬN TRƯỚC — HỎI SAU');
            expect(prompt).toContain('FORMAT JSON');
        });

        it('should contain Vietnamese language rules', () => {
            const prompt = service.getSystemPrompt();
            expect(prompt).toContain('Tiếng Việt');
            expect(prompt).toContain('"mình"');
        });

        it('should contain contradiction detection rules', () => {
            const prompt = service.getSystemPrompt();
            expect(prompt).toContain('PHÁT HIỆN MÂU THUẪN');
            expect(prompt).toContain('hình vuông');
            expect(prompt).toContain('4×5cm');
        });

        it('should contain missing_info cross-check rules', () => {
            const prompt = service.getSystemPrompt();
            expect(prompt).toContain('TRƯỚC KHI đưa câu hỏi vào missing_info');
            expect(prompt).toContain('KIỂM TRA');
        });
    });

    // ─── buildProductFieldsPrompt ───

    describe('buildProductFieldsPrompt', () => {
        it('should return empty string for undefined template', () => {
            expect(service.buildProductFieldsPrompt(undefined)).toBe('');
        });

        it('should return empty string for template without fields', () => {
            expect(service.buildProductFieldsPrompt({
                id: 1, code: 'NC', name: 'Namecard', product_type: 'loose' as any, keywords: [],
            })).toBe('');
        });

        it('should list required fields', () => {
            const result = service.buildProductFieldsPrompt({
                id: 1, code: 'NC', name: 'Namecard', product_type: 'loose' as any,
                keywords: [],
                fields: [{
                    id: 1, field_code: 'qty', field_name: 'Số lượng',
                    field_type: 'number', is_required: true,
                    ai_question: 'Bạn cần in bao nhiêu namecard?',
                    ai_keywords: [],
                }],
            });

            expect(result).toContain('BẮT BUỘC');
            expect(result).toContain('Số lượng');
            expect(result).toContain('Bạn cần in bao nhiêu namecard?');
        });
    });

    // ─── formatQuoteForPrompt ───

    describe('formatQuoteForPrompt', () => {
        it('should format a successful quote with breakdown', () => {
            const result = service.formatQuoteForPrompt({
                productType: 'namecard',
                total: 2500000,
                unitPrice: 5000,
                breakdown: [
                    { item: 'In offset', cost: 1500000 },
                    { item: 'Cán mờ', cost: 1000000 },
                ],
                requiresManualQuote: false,
                source: 'pricing',
            } as any);

            expect(result).toContain('2.500.000đ');
            expect(result).toContain('5.000đ');
            expect(result).toContain('In offset');
            expect(result).toContain('Cán mờ');
        });

        it('should format missing fields', () => {
            const result = service.formatQuoteForPrompt({
                missingFields: ['quantity', 'material'],
                question: 'Bạn cần in bao nhiêu?',
            } as any);

            expect(result).toContain('Thiếu thông tin');
            expect(result).toContain('quantity');
        });

        it('must not expose a stale/manual quote total as a customer price', () => {
            const result = service.formatQuoteForPrompt({
                productType: 'offset',
                total: 900000,
                currency: 'VND',
                breakdown: [{ item: 'legacy', detail: '', cost: 900000 }],
                requiresManualQuote: true,
                source: 'none',
                reason: 'Cần nhân viên báo giá',
            } as any);

            expect(result).not.toContain('900.000đ');
            expect(result).toContain('Cần báo giá thủ công');
        });

        it('should return empty string for null result', () => {
            expect(service.formatQuoteForPrompt(null as any)).toBe('');
        });
    });

    // ─── buildTaskInstructions ───

    describe('buildTaskInstructions', () => {
        const defaultParams = {
            isComparison: false,
            isObjection: false,
            detectedObjections: [] as string[],
            lastCustomerMsg: 'hello',
            isShortFollowUp: false,
            isGenericReply: false,
            learningContext: '',
            kbAlternatives: '',
        };

        it('should include base task instructions', () => {
            const result = service.buildTaskInstructions(defaultParams);
            expect(result).toContain('Nhiệm vụ');
            expect(result).toContain('Kết quả báo giá');
            expect(result).toContain('CHỈ được nêu số tiền');
            expect(result).toContain('KHÔNG phải nguồn báo giá');
            expect(result).not.toContain('bảng giá tham khảo → đưa range giá');
        });

        it('should include comparison instructions when isComparison=true', () => {
            const result = service.buildTaskInstructions({ ...defaultParams, isComparison: true });
            expect(result).toContain('SO SÁNH');
            expect(result).toContain('KHUYẾN NGHỊ');
        });

        it('should include objection handling when isObjection=true', () => {
            const result = service.buildTaskInstructions({
                ...defaultParams,
                isObjection: true,
                detectedObjections: ['price'],
                lastCustomerMsg: 'đắt quá',
            });
            expect(result).toContain('PHẢN ĐỐI');
            expect(result).toContain('GIÁ');
        });

        it('should include short follow-up instructions for short replies', () => {
            const result = service.buildTaskInstructions({
                ...defaultParams,
                isShortFollowUp: true,
                lastCustomerMsg: 'có',
            });
            expect(result).toContain('KHÁCH TRẢ LỜI NGẮN');
            expect(result).toContain('"có"');
        });

        it('should include learning context when provided', () => {
            const result = service.buildTaskInstructions({
                ...defaultParams,
                learningContext: '\n## Agent feedback: prefer shorter replies',
            });
            expect(result).toContain('Agent feedback');
        });
    });

    // ─── buildUserPrompt ───

    describe('buildUserPrompt', () => {
        it('should include chat history and context', () => {
            const result = service.buildUserPrompt({
                chatHistory: 'Khách: xin chào\nNV: chào bạn',
                customerProfileContext: '',
                kbContext: 'no KB',
                cannedContext: '',
                printingKnowledgeContext: '',
                productFieldsContext: '',
                quoteContext: '',
                orderHistoryContext: '',
                taskInstructions: '## Task instructions',
            });

            expect(result).toContain('xin chào');
            expect(result).toContain('no KB');
            expect(result).toContain('Task instructions');
        });

        it('should include canned context when provided', () => {
            const result = service.buildUserPrompt({
                chatHistory: '',
                customerProfileContext: '',
                kbContext: '',
                cannedContext: 'Matched response: greeting',
                printingKnowledgeContext: '',
                productFieldsContext: '',
                quoteContext: '',
                orderHistoryContext: '',
                taskInstructions: '',
            });

            expect(result).toContain('Câu trả lời mẫu');
            expect(result).toContain('Matched response: greeting');
        });
    });
});
