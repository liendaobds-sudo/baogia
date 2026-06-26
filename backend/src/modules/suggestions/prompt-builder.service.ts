/**
 * Prompt Builder Service
 * Constructs AI prompts (system + user) for the chatbot pipeline.
 * Extracted from ai-suggest.service.ts for maintainability.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PricingResult } from '../quote/quote.interfaces';
import { type ProductTemplate, type ProductField } from '../quote/extractors';

// Map field codes to master data type
const MATERIAL_FIELDS = ['material', 'vat_lieu', 'chat_lieu', 'giay', 'paper', 'coverMaterial', 'innerMaterial'];
const PROCESSING_FIELDS: Record<string, string[]> = {
    'can_mang': ['lamination', 'lamination_gloss', 'lamination_matte', 'lamination_velvet'],
    'lamination': ['lamination', 'lamination_gloss', 'lamination_matte', 'lamination_velvet'],
    'gia_cong_be': ['shaping', 'die_cut', 'die_cutting'],
    'finishing': ['finishing', 'post_process'],
    'gia_cong': [],  // all processing
    'processing': [], // all processing
    'bindingType': ['binding'],
};

interface MasterDataForPrompt {
    materials?: Array<{ id?: number; name: string; display_name?: string }>;
    processingOptions?: Array<{ id?: number; name: string; category?: string }>;
    paperSizes?: Array<{ id?: number; name: string }>;
    config?: {
        default_print_side?: string;
        default_print_type?: string;
        default_quantity?: number;
        lock_print_side?: boolean;
        lock_print_type?: boolean;
    };
}

// Map config keys → field codes they override
const CONFIG_DEFAULT_MAP: Record<string, string[]> = {
    'default_print_side': ['printSides', 'so_mat_in', 'print_side'],
    'default_print_type': ['printType', 'loai_in', 'print_type'],
    'default_quantity': ['quantity', 'so_luong'],
};
const CONFIG_LOCK_MAP: Record<string, string[]> = {
    'lock_print_side': ['printSides', 'so_mat_in', 'print_side'],
    'lock_print_type': ['printType', 'loai_in', 'print_type'],
};

// ── Modular System Prompts ──
const BASE_SYSTEM_PROMPT = `Bạn là TƯ VẤN VIÊN CHUYÊN GIA ngành in ấn, công ty KPrint/ZeplaoPrint. Soạn reply cho CSKH gửi khách qua Zalo OA.

## NGUYÊN TẮC CỐT LÕI: SUY LUẬN TRƯỚC — HỎI SAU
Bạn là CHUYÊN GIA, không phải chatbot hỏi form:
1. SUY LUẬN từ ngữ cảnh → TỰ RECOMMEND chất liệu/kích thước + giải thích LÝ DO.
2. CHỈ HỎI khi có 2+ lựa chọn ngang nhau hoặc thông tin KHÔNG THỂ suy luận.
3. Khi xác định sản phẩm và còn NHIỀU trường thiếu → hỏi TẤT CẢ trường CHƯA CÓ trong 1 reply. KHÔNG hỏi lại trường đã có trong lịch sử. FORMAT: mỗi câu hỏi trên 1 dòng riêng, dùng bullet "•".
4. Luôn hỏi file thiết kế nếu chưa hỏi.

## QUY TẮC BẮT BUỘC:
1. Tiếng Việt, thân thiện, xưng "mình", gọi "bạn". Dùng từ phổ thông, giữ nguyên Couche/PVC/gsm. Chỉ dịch thuật ngữ Anh chuyên ngành (matte lamination→cán mờ, die-cut→bế, saddle stitch→đóng ghim).
2. GIÁ: Nhân viên sẽ tính giá chính xác qua hệ thống báo giá. KHÔNG bịa giá. Nếu có [Kết quả báo giá] → copy chính xác. Nếu không → "Mình sẽ báo giá chi tiết cho bạn ngay nha."
3. TRÍCH XUẤT từ TOÀN BỘ lịch sử: đọc TẤT CẢ tin nhắn trước để lấy thông tin. KHÔNG hỏi lại thông tin khách ĐÃ NÓI.
4. PHÁT HIỆN MÂU THUẪN: Nếu thông tin khách cung cấp MÂU THUẪN nhau → PHẢI hỏi xác nhận, KHÔNG im lặng bỏ qua. (Ví dụ in hình vuông nhưng yêu cầu 4×5cm).
5. KHÔNG nhận định giá ("giá tốt", "giá rẻ"). Chỉ tư vấn dựa trên [Tài liệu nội bộ].
6. TRẢ LỜI NGẮN GỌN: max 4-6 dòng, đúng câu hỏi, không lan man.
7. THAY ĐỔI THÔNG SỐ: Khi khách thay đổi 1 thông số → TRẢ LỜI TRỰC TIẾP bằng giá mới. KHÔNG hỏi lại các trường đã có.
8. SẢN PHẨM NGOÀI DANH MỤC: Kiểm tra sản phẩm khách yêu cầu có trong [Danh sách sản phẩm] hoặc [Tài liệu nội bộ] không. Nếu KHÔNG CÓ → TRẢ LỜI THẲNG: "Dạ hiện tại bên mình chưa cung cấp dịch vụ [tên sản phẩm] ạ...".
9. TRƯỚC KHI đưa câu hỏi vào missing_info, HÃY KIỂM TRA lại ngữ cảnh. Tự suy luận nếu có thể. Mọi thiếu sót phải được cảnh báo.

## XỬ LÝ TIN NHẮN ĐẶC BIỆT:
- Nếu khách gửi ảnh/file → xác nhận đã nhận, hỏi thêm chi tiết: "Dạ mình nhận được hình ảnh rồi. Bạn muốn in sản phẩm giống mẫu này không ạ?"
- Nếu NV hỏi NHIỀU câu hỏi và khách chỉ trả lời 1 từ ("có"/"ok"/"được") → XÁC NHẬN từng câu: "Dạ bạn trả lời 'có' cho cả 2 câu hỏi (…) đúng không ạ?"
- "Cao cấp"/"sang trọng"/"chất lượng" → ngụ ý cần gia công tốt (ép nhũ, UV, cán nhung) → GỢI Ý luôn, không chờ hỏi.

## PHONG CÁCH (QUAN TRỌNG — nói chuyện như NGƯỜI THẬT nhắn Zalo):
- Viết như nhân viên đang nhắn tin: câu ngắn, ấm, đi thẳng vấn đề. KHÔNG viết như tài liệu/hệ thống.
- TUYỆT ĐỐI KHÔNG dùng markdown trong nội dung reply: không "##", không "**in đậm**", không "###", không tiêu đề mục. Khách trên Zalo thấy ký hiệu này rất kỳ.
- KHÔNG dùng emoji làm tiêu đề/trang trí (📊💰✨🎯...). Tối đa 1 emoji nhẹ cuối câu nếu thật tự nhiên (😊), thường thì KHÔNG cần.
- KHÔNG sáo rỗng/màu mè: tránh "Tuyệt vời!", "Rất hân hạnh", "Quý khách", lời chào dài dòng, câu cảm thán thừa. Nói mộc mạc, thật.
- Liệt kê: chỉ dùng bullet "•" khi đưa 2-3 lựa chọn/câu hỏi cho dễ đọc; còn lại viết thành câu liền mạch. KHÔNG liệt kê kiểu báo cáo.
- Suy luận được → RECOMMEND LUÔN, kèm lý do ngắn: "Mình nghĩ X hợp hơn vì [lý do]".
- Nhiều option → so sánh gọn trong 1-2 câu: "A bền hơn, B tiết kiệm hơn".
- Thuyết phục tự nhiên, không lố: "Khách bên mình hay chọn loại này", "Chênh nhẹ thôi mà bền hơn hẳn".
- Độ dài: 2-5 câu là đủ. Đừng nói nhiều.

## LUỒNG: XÁC ĐỊNH SP → SUY LUẬN + RECOMMEND → THU THẬP THÔNG TIN → CHỐT ĐƠN
- Đọc lịch sử để biết giai đoạn, KHÔNG quay lại giai đoạn đã qua.
- "có"/"không"/"ok" = trả lời câu hỏi trước → ghi nhận, tiến tiếp.

## FORMAT JSON:
{"replies":[{"text":"nội dung","label":"nhãn ngắn"}],"sources":[{"doc":"tên KB","section":"heading"}],"missing_info":[{"slot":"tên","question":"câu hỏi"}],"parsed_quote":{"material_id":null,"paper_size_id":null,"processing_ids":[],"quantity":null,"width":null,"height":null,"print_side":null},"intent":"hỏi_giá|hỏi_sản_phẩm|hỏi_kỹ_thuật|đặt_hàng|phàn_nàn|chào_hỏi|chung","sentiment":1-5,"confidence":0.0-1.0}
- sources=[] nếu không dùng KB.
- missing_info: CHỈ chứa thông tin THỰC SỰ CHƯA BIẾT. Nếu khách đã nói chất liệu (VD: "decal giấy") → KHÔNG đưa vào missing_info dù có nhiều ID trùng tên. Nếu bạn đã suy luận được → KHÔNG đưa vào missing_info. missing_info=[] nếu đủ info.
- parsed_quote: Khi khách nói chất liệu (VD: "decal giấy") → tìm ID khớp nhất trong danh sách, điền vào material_id. Nếu có nhiều ID cùng tên → chọn ID đầu tiên khớp. CHỈ để null khi THỰC SỰ không biết chất liệu. KHÔNG bịa ID.`;

// Backwards compatibility for external files relying on the export
export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

const MAX_TOTAL_PROMPT = 16000;

@Injectable()
export class PromptBuilderService {
    private readonly logger = new Logger(PromptBuilderService.name);

    /**
     * Replace truly obscure ENGLISH jargon — keep common Vietnamese terms intact
     * Giữ nguyên: Couche, cán mờ, cán bóng, PVC, kraft, gsm, CMYK — đây là từ phổ thông
     */
    simplifyForCustomer(text: string): string {
        const dictionary: [RegExp, string][] = [
            [/matte lamination/gi, 'cán mờ'],
            [/glossy lamination/gi, 'cán bóng'],
            [/soft\s*touch/gi, 'cán mềm mịn (sờ mượt như nhung)'],
            [/die[\-\s]cut/gi, 'bế (cắt theo hình)'],
            [/saddle\s*stitch/gi, 'đóng ghim'],
            [/perfect\s*binding/gi, 'đóng keo gáy'],
            [/hot\s*foil\s*stamping/gi, 'ép nhũ'],
            [/\bhot\s*foil\b/gi, 'ép nhũ'],
            [/\bscoring\b/gi, 'cấn (tạo nếp gấp)'],
            [/\blamination\b/gi, 'cán màng']
        ];
        
        let result = text;
        for (const [regex, replacement] of dictionary) {
            result = result.replace(regex, replacement);
        }
        
        return result.replace(/\s{2,}/g, ' ').trim();
    }

    /**
     * Build the complete user prompt with all context
     */
    buildUserPrompt(params: {
        chatHistory: string;
        customerProfileContext: string;
        kbContext: string;
        cannedContext: string;
        printingKnowledgeContext: string;
        productFieldsContext: string;
        quoteContext: string;
        pricingCatalogContext?: string;
        orderHistoryContext: string;
        taskInstructions: string;
        outcomeContext?: string;
        similarConvContext?: string;
    }): string {
        // Safe calculation of allowed chat history length so we don't truncate instructions / json
        const baseUserPromptLength = `## Lịch sử hội thoại(mới nhất ở cuối):\n\n${params.customerProfileContext}\n${params.productFieldsContext}\n## Tài liệu nội bộ liên quan:\n${params.kbContext}\n${params.cannedContext ? `\n## Câu trả lời mẫu đã định sẵn (ưu tiên sử dụng nếu phù hợp):\n${params.cannedContext}\n` : ''}\n${params.printingKnowledgeContext}${params.quoteContext}${params.pricingCatalogContext || ''}${params.orderHistoryContext}\n${params.taskInstructions}`.length;
        
        // Ensure at least 1000 characters for chat history, leave 500 buffer
        const maxAllowedChatHistoryLength = Math.max(1000, MAX_TOTAL_PROMPT - SYSTEM_PROMPT.length - baseUserPromptLength - 500); 

        let truncatedChatHistory = params.chatHistory;
        if (params.chatHistory.length > maxAllowedChatHistoryLength) {
            this.logger.warn(`⚠️ Chat history too long (${params.chatHistory.length} chars > ${maxAllowedChatHistoryLength}), truncating top messages...`);
            const excess = params.chatHistory.length - maxAllowedChatHistoryLength;
            // Truncate from the beginning (older messages), keeping the newest at the end
            truncatedChatHistory = '[...lịch sử cũ đã bị cắt bớt để bảo vệ giới hạn độ dài của context...]\n' + params.chatHistory.substring(excess);
        }

        const userPrompt = `## Lịch sử hội thoại(mới nhất ở cuối):
${truncatedChatHistory}
${params.customerProfileContext}
${params.productFieldsContext}
## Tài liệu nội bộ liên quan:
${params.kbContext}
${params.cannedContext ? `\n## Câu trả lời mẫu đã định sẵn (ưu tiên sử dụng nếu phù hợp):\n${params.cannedContext}\n` : ''}
${params.printingKnowledgeContext}${params.quoteContext}${params.pricingCatalogContext || ''}${params.orderHistoryContext}${params.outcomeContext || ''}${params.similarConvContext || ''}
${params.taskInstructions}`;

        return userPrompt;
    }

    /**
     * Build task instructions with context-specific injections
     */
    buildTaskInstructions(params: {
        isComparison: boolean;
        isObjection: boolean;
        detectedObjections: string[];
        lastCustomerMsg: string;
        isShortFollowUp: boolean;
        isGenericReply: boolean;
        learningContext: string;
        memoryContext?: string;
        kbAlternatives: string;
        needsUsageContext?: boolean;
        usageQuestion?: string;
    }): string {
        let instructions = `## Nhiệm vụ:
Dựa trên toàn bộ ngữ cảnh trên, soạn phản hồi cho tin nhắn cuối cùng của KHÁCH.
- TRƯỚC TIÊN: tổng hợp TẤT CẢ thông tin đã có từ toàn bộ lịch sử hội thoại (số lượng, sản phẩm, chất liệu, kích thước, hình dạng, gia công). KHÔNG hỏi lại bất kỳ thông tin nào đã xuất hiện ở BẤT KỲ tin nhắn nào trước đó.
- KIỂM TRA MÂU THUẪN: nếu thông tin khách cung cấp mâu thuẫn (vd: "vuông" + "4×5cm", "in 2 mặt" + "decal") → HỎI XÁC NHẬN thay vì bỏ qua.
- missing_info CHỈ chứa thông tin THỰC SỰ CHƯA CÓ. Trước khi thêm vào missing_info, đọc lại TẤT CẢ tin nhắn khách — nếu đã nói rồi, KHÔNG thêm.
- Nếu có[Kết quả báo giá] với giá cụ thể → ĐƯA GIÁ vào phản hồi.
- Nếu có[Thông tin cần thu thập] với nhiều trường BẮT BUỘC còn thiếu → HỏI TẤT CẢ trường thiếu trong 1 lượt reply, dạng danh sách rõ ràng. KHÔNG chỉ hỏi 1-2 trường rồi chờ.
- Loại bỏ khỏi danh sách hỏi những trường đã có trong lịch sử chat.
- Nếu tài liệu nội bộ có bảng giá tham khảo → đưa range giá để khách tham khảo, kèm disclaimer.
- Khi hỏi chất liệu → GỢI Ý cụ thể 2 - 3 lựa chọn từ KB, KHÔNG hỏi chung chung.
- Trả về JSON đúng format đã quy định trong system prompt.`;

        // Inject learning context
        if (params.learningContext) instructions += params.learningContext;
        if (params.memoryContext) instructions += params.memoryContext;

        // Comparison instruction
        if (params.isComparison) {
            instructions += `\n\n## ĐẶC BIỆT — KHÁCH ĐANG HỎI SO SÁNH:
Khách hỏi so sánh giữa các loại / phương án.Bạn PHẢI:
1. So sánh CỤ THỂ theo tiêu chí: độ dày, ứng dụng, ưu điểm, mức giá
2. Sử dụng format danh sách: mỗi tiêu chí 1 dòng
3. Đưa ra KHUYẾN NGHỊ rõ ràng: "Nếu cần X → chọn A. Nếu cần Y → chọn B."
4. Lấy data từ[Tài liệu nội bộ] — KHÔNG bịa.`;
        }

        // Objection handling
        if (params.isObjection) {
            const objTypeMap: Record<string, string> = {
                price: 'GIÁ — khách thấy đắt/muốn giảm giá',
                competitor: 'ĐỐI THỦ — khách so sánh với bên khác',
                time: 'THỜI GIAN — khách cần gấp hơn',
                hesitation: 'DO DỰ — khách chưa quyết định',
                quality: 'CHẤT LƯỢNG — khách lo ngại chất lượng in',
            };
            const objDescriptions = params.detectedObjections.map(t => objTypeMap[t]).join(', ');

            instructions += `\n\n## ĐẶC BIỆT — KHÁCH ĐANG PHẢN ĐỐI:
Loại phản đối: ${objDescriptions}
Tin nhắn khách: "${params.lastCustomerMsg}"

Bạn PHẢI áp dụng pattern XỬ LÝ PHẢN ĐỐI đã quy định ở Giai đoạn 4:
1. Công nhận cảm nhận khách TRƯỚC — không phủ nhận.
2. Giải thích giá trị / đưa giải pháp thay thế.
3. Kết thúc bằng CTA mời khách hành động tiếp.
4. intent PHẢI là "phản_đối".

⚠️ QUAN TRỌNG: CHỈ gợi ý phương án thay thế từ[Tài liệu nội bộ]hoặc[Phương án thay thế từ KB].
KHÔNG được bịa loại giấy, định lượng, hoặc giá không có trong tài liệu.
Nếu không có data thay thế → nói: "Em sẽ kiểm tra và gửi bạn các phương án tiết kiệm hơn ạ."${params.kbAlternatives}`;
        }

        // Short follow-up
        if (params.isShortFollowUp || params.isGenericReply) {
            instructions += `\n\n## ĐẶC BIỆT — KHÁCH TRẢ LỜI NGẮN(follow - up):
Tin nhắn cuối của khách là "${params.lastCustomerMsg}" — đây là CÂU TRẢ LỜI cho câu hỏi trước đó của nhân viên / bot.

Bạn PHẢI:
1. Đọc lại tin nhắn TRƯỚC ĐÓ của NV / Agent để hiểu câu hỏi đang chờ trả lời.
2. GHI NHẬN thông tin: "${params.lastCustomerMsg}" trả lời cho câu hỏi đó.
3. XÁC NHẬN ngắn gọn: "Dạ mình ghi nhận [thông tin khách vừa cung cấp]."
4. CHUYỂN SANG bước tiếp theo trong luồng bán hàng:
- Nếu còn thiếu thông tin → hỏi thông số TIẾP THEO(kích thước, số lượng, chất liệu...).
   - Nếu đủ thông tin → báo giá hoặc tóm tắt đơn hàng.
   - Nếu khách đồng ý giá → hướng dẫn đặt cọc / thanh toán.
5. TUYỆT ĐỐI KHÔNG lặp lại thông tin đã trao đổi.
6. TUYỆT ĐỐI KHÔNG hỏi lại câu hỏi khách đã trả lời.

Ví dụ: Khách: "có" → "Dạ ghi nhận, em chọn PVC chống nước cho mình ạ. Mình cần kích thước bao nhiêu ạ?"
Khách: "ok" (sau báo giá) → "Tuyệt vời! Em gửi thông tin đặt cọc cho mình nhé ạ."`;
        }

        // Context Inference Blocker (Claw Code Pattern: Tool Permission Denial)
        if (params.needsUsageContext && params.usageQuestion) {
            instructions += `\n\n## ⛔ TỪ CHỐI BÁO GIÁ (KHOÁ QUYỀN TOOL) QUAN TRỌNG:
Khách hàng TÌM HIỂU VỀ SẢN PHẨM nhưng chưa cung cấp đủ MỤC ĐÍCH SỬ DỤNG cụ thể (vd: dán lên chai lọ chất liệu gì, dán trong kho lạnh khô hông, etc.).
Bạn BẮT BUỘC PHẢI THỰC HIỆN:
1. TUYỆT ĐỐI KHÔNG điền \`parsed_quote\` hoặc bắt đầu tư vấn thông số giá.
2. PHẢI thêm câu hỏi sau vào mảng \`missing_info\` và phản hồi lại khách: "${params.usageQuestion}"`;
        }

        return instructions;
    }

    /**
     * Build structured prompt context from Pricing product template fields
     * Optionally uses master data to build dynamic questions listing allowed options
     */
    buildProductFieldsPrompt(template?: ProductTemplate, masterData?: MasterDataForPrompt): string {
        if (!template || !template.fields || template.fields.length === 0) return '';

        let text = `\n## Thông tin cần thu thập cho "${template.name}" (${template.code}):\n`;

        // Determine which field codes have config defaults or are locked
        const configDefaults = new Map<string, string>();  // fieldCode → default value
        const lockedFields = new Set<string>();
        if (masterData?.config) {
            for (const [configKey, fieldCodes] of Object.entries(CONFIG_DEFAULT_MAP)) {
                const val = (masterData.config as any)[configKey];
                if (val) {
                    for (const fc of fieldCodes) configDefaults.set(fc, String(val));
                }
            }
            for (const [lockKey, fieldCodes] of Object.entries(CONFIG_LOCK_MAP)) {
                if ((masterData.config as any)[lockKey]) {
                    for (const fc of fieldCodes) lockedFields.add(fc);
                }
            }
        }

        const required = template.fields.filter(f => f.is_required);
        const optional = template.fields.filter(f => !f.is_required);

        // Collect auto-filled fields (locked or has config default)
        const autoFilledNotes: string[] = [];

        // Map raw Pricing config values to Vietnamese labels
        const humanize = (val: string): string => {
            const map: Record<string, string> = {
                'double': '2 mặt', 'single': '1 mặt',
                '4c': 'in 4 màu (CMYK)', '1c': 'in 1 màu',
            };
            return map[val] || val;
        };

        if (required.length > 0) {
            text += '### Trường BẮT BUỘC (phải hỏi khách):\n';
            for (const f of required) {
                // Locked field → skip entirely, note as auto-filled
                if (lockedFields.has(f.field_code)) {
                    const val = configDefaults.get(f.field_code) || f.default_value || '';
                    autoFilledNotes.push(`- ${f.field_name}: **${humanize(val)}** (đã khóa, không cần hỏi)`);
                    continue;
                }
                // Field with config default → don't ask, note as default
                if (configDefaults.has(f.field_code)) {
                    const val = configDefaults.get(f.field_code)!;
                    autoFilledNotes.push(`- ${f.field_name}: mặc định **${humanize(val)}** (chỉ hỏi nếu khách yêu cầu khác)`);
                    continue;
                }
                const question = this.getFieldQuestion(f, masterData);
                if (question === null) continue; // Skip: field has no allowed options in Pricing config
                text += `- **${f.field_name}**: ${question}`;
                const options = this.getFieldOptions(f);
                if (options) text += ` (${options})`;
                text += '\n';
            }
        }

        if (optional.length > 0) {
            text += '### Trường tùy chọn (hỏi nếu khách chưa nói):\n';
            for (const f of optional) {
                // Locked/defaulted optional fields → also skip
                if (lockedFields.has(f.field_code) || configDefaults.has(f.field_code)) {
                    const val = configDefaults.get(f.field_code) || f.default_value || '';
                    autoFilledNotes.push(`- ${f.field_name}: mặc định **${humanize(val)}**`);
                    continue;
                }
                const question = this.getFieldQuestion(f, masterData);
                if (question === null) continue; // Skip: field has no allowed options in Pricing config
                text += `- ${f.field_name}`;
                if (f.default_value) text += ` (mặc định: ${f.default_value})`;
                if (question !== f.field_name + '?') text += `: ${question}`;
                text += '\n';
            }
        }

        // Show auto-filled defaults so AI knows what's already decided
        if (autoFilledNotes.length > 0) {
            text += '### Giá trị mặc định (KHÔNG hỏi — đã cài đặt sẵn):\n';
            text += autoFilledNotes.join('\n') + '\n';
        }

        // Add shape mapping rule if template has shape field
        const hasShapeField = template.fields.some(f => ['shape', 'hinh_dang', 'hinh_dang_sp'].includes(f.field_code));
        if (hasShapeField) {
            text += `\n### QUY TẮC HÌNH DẠNG:\n`;
            text += `- Nếu khách ĐÃ NÓI hình dạng ("hình vuông", "hình tròn", "chữ nhật") → GHI NHẬN, KHÔNG hỏi lại. Loại hình dạng khỏi missing_info.\n`;
            text += `- Chỉ hỏi hình dạng nếu khách HOÀN TOÀN chưa đề cập.\n`;
            text += `- Lựa chọn: "tròn/elip", "vuông/chữ nhật", hay "hình dạng đặc biệt"\n`;
            text += `- PHÁT HIỆN MÂU THUẪN: Nếu khách nói "vuông" nhưng kích thước W×H mà W≠H → ĐÓ LÀ CHỮ NHẬT, PHẢI hỏi xác nhận: "Bạn nói hình vuông nhưng kích thước W×H là chữ nhật. Bạn muốn vuông (WxW hoặc HxH) hay chữ nhật (W×H) ạ?"\n`;
            text += `- Nếu khách chọn "hình dạng đặc biệt" → ghi nhận là "rectangle" (vuông/chữ nhật) để tính giá, giải thích: "Dạ mình ghi nhận, hình dạng đặc biệt sẽ được tính theo khung vuông/chữ nhật bao quanh nha."\n`;
        }

        const actualRequired = required.filter(f => !lockedFields.has(f.field_code) && !configDefaults.has(f.field_code)).length;
        text += `\n→ BẮT BUỘC: Hỏi TẤT CẢ ${actualRequired} trường bắt buộc trên trong 1 reply dạng danh sách. Đưa TẤT CẢ trường chưa có vào missing_info.\n`;
        return text;
    }

    /**
     * Get the appropriate question for a field, with overrides for specific fields.
     * Returns null if masterData is available but has NO matching items for this field
     * (meaning the field is not applicable for this product and should be skipped).
     */
    private getFieldQuestion(field: ProductField, masterData?: MasterDataForPrompt): string | null {
        // Shape fields: use specific Vietnamese question
        if (['shape', 'hinh_dang'].includes(field.field_code)) {
            return 'Sản phẩm hình tròn/elip, vuông/chữ nhật, hay hình dạng đặc biệt?';
        }

        // Dynamic: material fields → list allowed materials WITH IDs for direct mapping
        if (MATERIAL_FIELDS.includes(field.field_code)) {
            if (masterData?.materials?.length) {
                const items = masterData.materials.map(m => {
                    const label = m.display_name || m.name;
                    return m.id ? `${label} (id=${m.id})` : label;
                });
                const preview = items.length <= 5 ? items.join(', ') : items.slice(0, 4).join(', ') + ` (+${items.length - 4} loại khác)`;
                return `${field.field_name}: ${preview}?`;
            }
            // masterData exists but no materials → skip this question
            if (masterData) return null;
        }

        // Dynamic: processing fields → list allowed processing by category WITH IDs
        const catFilter = PROCESSING_FIELDS[field.field_code];
        if (catFilter !== undefined) {
            if (masterData?.processingOptions?.length) {
                const items = catFilter.length > 0
                    ? masterData.processingOptions.filter(p => catFilter.includes(p.category || ''))
                    : masterData.processingOptions;
                if (items.length > 0) {
                    return `${field.field_name}: ${items.map(p => p.id ? `${p.name} (id=${p.id})` : p.name).join(', ')}?`;
                }
            }
            // masterData exists but no matching processing → skip this question
            if (masterData) return null;
        }

        return field.ai_question || field.field_name + '?';
    }

    /**
     * Extract options string from Pricing field
     */
    getFieldOptions(field: ProductField): string | null {
        if (!field.options) return null;
        const opts = field.options;
        const items = opts.labels || opts.choices || opts.values || [];
        if (items.length === 0) return null;
        return `Lựa chọn: ${items.slice(0, 8).join(', ')}${items.length > 8 ? '...' : ''}`;
    }

    /**
     * Format quote result for AI prompt
     */
    formatQuoteForPrompt(quoteResult: PricingResult): string {
        if (!quoteResult) return '';

        let text = '\n## Kết quả báo giá tự động:\n';

        if (quoteResult.total && quoteResult.total > 0) {
            text += `Sản phẩm: ${quoteResult.productType}\n`;
            text += `Tổng: ${quoteResult.total.toLocaleString('vi-VN')}đ\n`;
            if (quoteResult.unitPrice) {
                text += `Đơn giá: ${quoteResult.unitPrice.toLocaleString('vi-VN')}đ\n`;
            }
            text += 'Chi tiết:\n';
            for (const item of quoteResult.breakdown) {
                text += `- ${item.item}: ${item.cost.toLocaleString('vi-VN')}đ ${item.missing ? '(thiếu định mức)' : ''}\n`;
            }
        } else if (quoteResult.missingFields && quoteResult.missingFields.length > 0) {
            text += `Thiếu thông tin: ${quoteResult.missingFields.join(', ')}\n`;
            if (quoteResult.question) {
                text += `Câu hỏi gợi ý: ${quoteResult.question}\n`;
            }
        } else if (quoteResult.requiresManualQuote) {
            text += `Cần báo giá thủ công: ${quoteResult.reason || 'Không tìm thấy bảng giá'}\n`;
        }

        return text;
    }

    /**
     * Get the dynamically assembled system prompt based on detected product
     */
    getSystemPrompt(productCode?: string): string {
        // ALL DOMAIN KNOWLEDGE MUST BE INFERRED FROM THE KNOWLEDGE BASE (seed-docs/*.md)
        // Hardcoding domain logic inside the prompt builder violates the core verify.md rules.
        return BASE_SYSTEM_PROMPT;
    }
}
