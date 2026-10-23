/**
 * Printing Constraints Validator
 * Hard-coded constraint validation — catches printing rule violations
 * regardless of whether AI model followed prompt instructions.
 *
 * Extracted from AiSuggestService for independent testability.
 * All functions are pure (no side effects, no DB access).
 */

import { toMatchText } from '../../common/text/vietnamese';

/**
 * Validate printing constraints against customer conversation context.
 * Returns an array of warning strings for detected violations.
 */
export function checkPrintingConstraints(
    chatHistory: string,
    lastCustomerMsg: string,
    productMatch?: any,
): string[] {
    const warnings: string[] = [];
    /**
     * Audit 2026-08-29: mọi regex dưới đây trước đây chạy trên chuỗi CÓ DẤU ⇒ tin nhắn không
     * dấu ("decal in 2 mat", "can mo ma viet but bi") không kích hoạt hard check nào. Nay tất cả
     * so khớp trên bản ĐÃ BỎ DẤU + BUNG VIẾT TẮT, và các pattern cũng được viết ở dạng không
     * dấu (bản không dấu của "cán mờ" là "can mo").
     *
     * Nối thêm bản gốc-lowercase vào chuỗi so khớp để không làm hồi quy các pattern có dấu
     * đang được test bảo vệ.
     */
    const lastMsg = `${lastCustomerMsg.toLowerCase()} ⟂ ${toMatchText(lastCustomerMsg)}`;
    const recentLines = chatHistory.split('\n').slice(-10).join('\n');
    const rawFull = recentLines + ' ' + lastCustomerMsg;
    const fullContext = `${rawFull.toLowerCase()} ⟂ ${toMatchText(rawFull)}`;

    // BUGFIX 3: Avoid mixed product context. Fallback to fullContext only if productMatch is missing.
    const productContext = productMatch?.product
        ? `${String(productMatch.product).toLowerCase()} ⟂ ${toMatchText(String(productMatch.product))}`
        : fullContext;

    // Extract GSM values from LAST MESSAGE only (not old specs in history)
    const gsmMatches = lastMsg.match(/(?:couche|c|giấy|giay|art|offset|kraft|ivory|duplex|bristol|ford)\s*(\d{2,3})\s*(?:gsm|g)?/gi) || [];
    const gsmRegex = /(\d{2,3})\s*(?:gsm|g)?/i;
    const detectedGsmSet = new Set<number>();
    for (const m of gsmMatches) {
        const num = m.match(gsmRegex);
        if (num) {
            const val = parseInt(num[1], 10);
            if (val >= 70 && val <= 400) detectedGsmSet.add(val);
        }
    }
    // Also match standalone "150gsm" patterns
    const standaloneGsm = lastMsg.match(/(\d{2,3})\s*gsm/gi) || [];
    for (const m of standaloneGsm) {
        const num = m.match(/(\d{2,3})/);
        if (num) {
            const val = parseInt(num[1], 10);
            if (val >= 70 && val <= 400) detectedGsmSet.add(val);
        }
    }

    // Detect product type from PRODUCT CONTEXT (mỗi pattern có cả biến thể có dấu và không dấu)
    const isDecal = /decal|sticker|tem nh[ãa]n|tem d[áa]n|nh[ãa]n d[áa]n/.test(productContext);
    const isBanner = /banner|hiflex|standee|b[ạa]t|b[ăa]ng r[ôo]n/.test(productContext);
    const isPoster = /poster|[áa]p ph[íi]ch/.test(productContext);
    const isCatalogue = /catalogue|catalog|h[ồo] s[ơo] n[ăa]ng l[ựu]c/.test(productContext);

    // Detect finishing from LAST MESSAGE + context
    const LAMINATION_RE = /c[áa]n m[ờo]|c[áa]n b[óo]ng|c[áa]n m[àa]ng|c[áa]n 2 m[ặa]t|c[áa]n 1 m[ặa]t|c[áa]n velvet|c[áa]n nhung|c[áa]n m[ềe]m|lamination/;
    const hasLamination = LAMINATION_RE.test(lastMsg) || LAMINATION_RE.test(fullContext);
    const hasSpotUV = /uv c[ụu]c b[ộo]|spot uv|uv spot|uv n[ổo]i/.test(fullContext);
    const hasGlossLam = /c[áa]n b[óo]ng/.test(fullContext);
    const hasWriting = /vi[ếe]t|b[úu]t bi|ghi ch[úu]|[đd]i[ềe]n th[ôo]ng tin|ghi t[êe]n|vi[ếe]t tay/.test(fullContext);
    const has2Sides = /2 m[ặa]t|hai m[ặa]t|in 2|double/.test(fullContext);
    const hasSaddleStitch = /[đd][óo]ng ghim|ghim|saddle/.test(fullContext);

    // Detect material from LAST MESSAGE
    const isKraft = /kraft|gi[ấa]y n[âa]u/.test(lastMsg) || /kraft/.test(fullContext);
    const isOffset = /offset|gi[ấa]y offset/.test(lastMsg);
    const hasFullColorPhoto = /[ảa]nh|full.?color|photo|h[ìi]nh [ảa]nh ch[ấa]t l[ưu][ợo]ng/.test(lastMsg);

    // Extract page count if mentioned
    const pageMatch = lastMsg.match(/(\d+)\s*trang/);
    const pageCount = pageMatch ? parseInt(pageMatch[1], 10) : 0;

    // ─── UNIVERSAL RULES ───

    // [MAT-001] Kraft + ảnh full color → colors will be muted
    if (isKraft && hasFullColorPhoto) {
        warnings.push(`Giấy kraft (nâu) sẽ làm màu in tối hơn, ảnh sẽ không rõ. Nên dùng couche/art nếu cần in ảnh đẹp, hoặc in nền trắng trước (white ink).`);
    }

    // [MAT-002] Offset + ảnh full color → poor quality
    if (isOffset && hasFullColorPhoto) {
        warnings.push(`Giấy offset (không tráng) in ảnh sẽ xỉn, mờ. Nên dùng couche hoặc art paper để in ảnh chất lượng cao.`);
    }

    // ─── DECAL / STICKER ───

    if (isDecal && has2Sides) {
        warnings.push(`Decal/sticker CHỈ in được 1 mặt (mặt sau là keo dán). Không thể in 2 mặt.`);
    }
    if (isDecal && hasLamination && /2 m[ặa]t/.test(lastMsg)) {
        warnings.push(`Decal CHỈ cán được 1 mặt (mặt in). Mặt sau là keo dán, không thể cán.`);
    }

    // ─── BANNER / STANDEE / POSTER ───

    if (isBanner && hasLamination && !(/standee|\bpp\b/.test(fullContext))) {
        warnings.push(`Banner/hiflex/bạt KHÔNG cần cán màng (vật liệu đã chống nước sẵn). Standee PP thì có thể cán mờ/bóng để bảo vệ.`);
    }
    if ((isBanner || isPoster) && has2Sides) {
        warnings.push(`${isBanner ? 'Banner/standee' : 'Poster'} CHỈ in được 1 mặt.`);
    }

    // ─── CATALOGUE ───

    if (isCatalogue) {
        if (hasSaddleStitch && pageCount > 0 && pageCount % 4 !== 0) {
            warnings.push(`Đóng ghim cần tổng số trang chia hết cho 4 (hiện ${pageCount} trang). Gần nhất: ${Math.ceil(pageCount / 4) * 4} trang.`);
        }
    }

    // ─── UV SPOT + CÁN BÓNG ───

    if (hasSpotUV && hasGlossLam) {
        warnings.push(`UV cục bộ trên nền cán BÓNG sẽ không thấy hiệu ứng (cả 2 đều bóng, không có tương phản). Nên dùng cán MỜ + UV cục bộ để tạo hiệu ứng nổi bật.`);
    }

    // ─── CÁN MÀNG + VIẾT BÚT BI ───

    if (hasLamination && hasWriting) {
        warnings.push(`Bề mặt cán màng không viết được bằng bút bi (lớp màng nhựa không thấm mực). Nếu cần viết lên, KHÔNG cán mặt cần viết.`);
    }

    // ─── ĐỊNH LƯỢNG GIẤY (GSM) ───
    //
    // Audit 2026-08-29: `detectedGsmSet` trước đây được TÍNH rồi KHÔNG ĐỌC Ở ĐÂU (4 tham chiếu,
    // toàn bộ là ghi) ⇒ nhóm rule GSM-* trong `printing-constraints.json` và KB chỉ tồn tại ở tầng
    // prompt, KHÔNG có hard check nào. Dưới đây là các rule GSM gây sai kỹ thuật rõ ràng.
    //
    // Ngưỡng lấy theo `quy-tac-rang-buoc-nganh-in.md` (bản KB do nghiệp vụ viết), KHÔNG theo
    // LAM-001 cũ của JSON (bản đó nói "<200gsm không nên cán màng" — trái thực tế đang bán và đã
    // được sửa cùng đợt audit này).
    const gsmValues = [...detectedGsmSet];
    if (gsmValues.length > 0) {
        const minGsm = Math.min(...gsmValues);
        const maxGsm = Math.max(...gsmValues);

        // [GSM-001] Giấy quá mỏng mà đòi cán màng → dễ cong vênh; phủ UV phù hợp hơn.
        if (hasLamination && minGsm < 80) {
            warnings.push(
                `Giấy ${minGsm}gsm khá mỏng để cán màng (dễ cong vênh, co rút không đều). ` +
                `Nên phủ UV thay cán màng, hoặc tăng lên từ 120gsm nếu cần cán.`,
            );
        }

        // [GSM-002] Namecard/danh thiếp dưới 250gsm → mềm, cầm không chắc tay.
        if (/namecard|name card|danh thi[ếe]p|card visit/.test(productContext) && maxGsm < 250) {
            warnings.push(
                `Danh thiếp ${maxGsm}gsm sẽ mềm, cầm không chắc tay. Thông dụng là 300gsm ` +
                `(cao cấp 350gsm hoặc giấy mỹ thuật).`,
            );
        }

        // [GSM-004] Ruột catalogue/brochure quá dày → khó lật, tốn cước.
        if (isCatalogue && pageCount > 8 && minGsm > 200) {
            warnings.push(
                `Ruột ${minGsm}gsm là quá dày cho cuốn ${pageCount} trang (khó lật, nặng, tốn cước). ` +
                `Ruột thường 120–170gsm, bìa mới dùng 250–300gsm.`,
            );
        }

        // [GSM-007] Tờ rơi/flyer quá dày → không cần thiết, đội giá.
        if (/t[ờo] r[ơo]i|flyer|leaflet|t[ờo] b[ưu][ớo]m/.test(productContext) && minGsm > 200) {
            warnings.push(
                `Tờ rơi ${minGsm}gsm dày hơn mức cần thiết (đội giá mà khách nhận vẫn bỏ). ` +
                `Thông dụng 150gsm, tiết kiệm 120gsm.`,
            );
        }
    }

    // Final dedup safety net
    return [...new Set(warnings)];
}
