/**
 * Printing Constraints Validator
 * Hard-coded constraint validation — catches printing rule violations
 * regardless of whether AI model followed prompt instructions.
 *
 * Extracted from AiSuggestService for independent testability.
 * All functions are pure (no side effects, no DB access).
 */

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
    const lastMsg = lastCustomerMsg.toLowerCase();
    const recentLines = chatHistory.split('\n').slice(-10).join('\n');
    const fullContext = (recentLines + ' ' + lastCustomerMsg).toLowerCase();

    // BUGFIX 3: Avoid mixed product context. Fallback to fullContext only if productMatch is missing.
    const productContext = productMatch?.product ? productMatch.product.toLowerCase() : fullContext;

    // Extract GSM values from LAST MESSAGE only (not old specs in history)
    const gsmMatches = lastMsg.match(/(?:couche|c|giấy|art|offset|kraft|ivory)\s*(\d{2,3})\s*(?:gsm|g)?/gi) || [];
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

    // Detect product type from PRODUCT CONTEXT
    const isDecal = /decal|sticker|tem nhãn|tem dán|nhãn dán/.test(productContext);
    const isBanner = /banner|hiflex|standee|bạt|băng rôn/.test(productContext);
    const isPoster = /poster|áp phích/.test(productContext);
    const isCatalogue = /catalogue|catalog|hồ sơ năng lực/.test(productContext);

    // Detect finishing from LAST MESSAGE + context
    const hasLamination = /cán mờ|cán bóng|cán màng|cán 2 mặt|cán 1 mặt|cán velvet|cán nhung|cán mềm|lamination/.test(lastMsg) ||
        /cán mờ|cán bóng|cán màng|cán 2 mặt|cán 1 mặt|cán velvet|cán nhung|cán mềm/.test(fullContext);
    const hasSpotUV = /uv cục bộ|spot uv|uv spot|uv nổi/.test(fullContext);
    const hasGlossLam = /cán bóng/.test(fullContext);
    const hasWriting = /viết|bút bi|ghi chú|điền thông tin|ghi tên|viết tay/.test(fullContext);
    const has2Sides = /2 mặt|hai mặt|in 2|double/.test(fullContext);
    const hasSaddleStitch = /đóng ghim|ghim|saddle/.test(fullContext);

    // Detect material from LAST MESSAGE
    const isKraft = /kraft|giấy nâu/.test(lastMsg) || /kraft/.test(fullContext);
    const isOffset = /offset|giấy offset/.test(lastMsg);
    const hasFullColorPhoto = /ảnh|full.?color|photo|hình ảnh chất lượng/.test(lastMsg);

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
    if (isDecal && hasLamination && /2 mặt/.test(lastMsg)) {
        warnings.push(`Decal CHỈ cán được 1 mặt (mặt in). Mặt sau là keo dán, không thể cán.`);
    }

    // ─── BANNER / STANDEE / POSTER ───

    if (isBanner && hasLamination && !(/standee|pp/.test(fullContext))) {
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

    // Final dedup safety net
    return [...new Set(warnings)];
}
