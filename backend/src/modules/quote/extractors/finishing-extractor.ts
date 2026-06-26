/**
 * Finishing Extractor
 * Extracts finishing/processing options from Vietnamese text.
 * 25+ patterns: lamination, UV, foil, die-cut, folding, etc.
 * Ported from Kprint: includes/ai_quote/extractors/FinishingExtractor.php
 */

// Static finishing patterns: regex → finishing code
const finishingPatterns: Array<{ pattern: RegExp; code: string }> = [
    // Lamination (cán màng)
    { pattern: /cán\s*mờ|can\s*mo|\bmatt\b/iu, code: 'can_mo' },
    { pattern: /cán\s*bóng|can\s*bong|\bglossy\b/iu, code: 'can_bong' },

    // UV coating
    { pattern: /uv\s*spot|uv\s*cục\s*bộ/iu, code: 'uv_spot' },
    { pattern: /uv\s*full|uv\s*toàn\s*bộ/iu, code: 'uv_full' },
    { pattern: /\buv\b/iu, code: 'uv' },

    // Foil stamping (ép kim)
    { pattern: /ép\s*kim\s*vàng|ep\s*kim\s*vang|gold\s*foil/iu, code: 'ep_kim_vang' },
    { pattern: /ép\s*kim\s*bạc|ep\s*kim\s*bac|silver\s*foil/iu, code: 'ep_kim_bac' },
    { pattern: /ép\s*kim|ep\s*kim|foil\s*stamp/iu, code: 'ep_kim' },

    // Embossing
    { pattern: /dập\s*nổi|dap\s*noi|emboss/iu, code: 'dap_noi' },
    { pattern: /dập\s*chìm|dap\s*chim|deboss/iu, code: 'dap_chim' },

    // Die cutting — specific first
    { pattern: /bế\s*demi|be\s*demi|kiss\s*cut/iu, code: 'be_demi' },
    { pattern: /bế\s*(?:theo\s*)?hình|bế\s*(?:theo\s*)?form|be\s*hinh|die\s*cut|full\s*cut/iu, code: 'be_hinh' },
    { pattern: /bế\s*chữ|be\s*chu/iu, code: 'be_chu' },
    { pattern: /bế\s*tem|be\s*tem/iu, code: 'be_tem' },
    { pattern: /\bbế\b|\bbe\s+(?!$)/iu, code: 'be' },

    // Trimming / Cutting
    { pattern: /xén\s*thẳng|xen\s*thang|cắt\s*thẳng|cat\s*thang|straight\s*cut|trim/iu, code: 'xen_thang' },
    { pattern: /cắt\s*rời|cat\s*roi|xén\s*rời/iu, code: 'cat_roi' },
    { pattern: /cắt\s*xén|cat\s*xen/iu, code: 'xen_thang' },

    // Laminating plastic
    { pattern: /ép\s*nhựa|ep\s*nhua|ép\s*plastic|laminate/iu, code: 'ep_nhua' },

    // Hole punching
    { pattern: /đục\s*lỗ|duc\s*lo|punch|bấm\s*lỗ/iu, code: 'duc_lo' },

    // Perforation
    { pattern: /răng\s*cưa|rang\s*cua|dập\s*răng|perforate/iu, code: 'rang_cua' },

    // Folding
    { pattern: /gấp\s*đôi|gap\s*doi|fold/iu, code: 'gap_doi' },
    { pattern: /gấp\s*3|gap\s*3|tri-fold/iu, code: 'gap_3' },
    { pattern: /gấp\s*4|gap\s*4/iu, code: 'gap_4' },
];

// Group mapping for deduplication
const groupMap: Record<string, string> = {
    be: 'die_cut',
    be_demi: 'die_cut',
    be_hinh: 'die_cut',
    be_chu: 'die_cut',
    be_tem: 'die_cut',
    can_mo: 'lamination',
    can_bong: 'lamination',
};

const specificCodes = ['be_demi', 'be_hinh', 'be_chu', 'be_tem', 'uv_spot', 'uv_full', 'ep_kim_vang', 'ep_kim_bac'];

/**
 * Extract finishing options from text (flat list)
 */
export function extractFinishing(text: string): string[] {
    const found: string[] = [];
    const groupToCode: Record<string, string> = {};

    for (const { pattern, code } of finishingPatterns) {
        if (!pattern.test(text)) continue;

        // Skip generic 'be' if specific variant already found
        if (code === 'be' && found.some((f) => f.startsWith('be_'))) continue;

        const group = groupMap[code] || code;
        const isSpecific = specificCodes.includes(code);

        if (!groupToCode[group]) {
            groupToCode[group] = code;
            found.push(code);
        } else if (isSpecific && !specificCodes.includes(groupToCode[group])) {
            // Replace generic with specific
            const idx = found.indexOf(groupToCode[group]);
            if (idx !== -1) {
                found[idx] = code;
                groupToCode[group] = code;
            }
        }
    }

    return found;
}

/**
 * Get human-readable finishing names
 */
export function getFinishingNames(codes: string[]): string[] {
    const nameMap: Record<string, string> = {
        can_mo: 'Cán mờ',
        can_bong: 'Cán bóng',
        uv: 'UV',
        uv_spot: 'UV cục bộ',
        uv_full: 'UV toàn bộ',
        ep_kim: 'Ép kim',
        ep_kim_vang: 'Ép kim vàng',
        ep_kim_bac: 'Ép kim bạc',
        dap_noi: 'Dập nổi',
        dap_chim: 'Dập chìm',
        be: 'Bế',
        be_demi: 'Bế demi',
        be_hinh: 'Bế hình',
        be_chu: 'Bế chữ',
        be_tem: 'Bế tem',
        xen_thang: 'Xén thẳng',
        cat_roi: 'Cắt rời',
        ep_nhua: 'Ép nhựa',
        duc_lo: 'Đục lỗ',
        rang_cua: 'Răng cưa',
        gap_doi: 'Gấp đôi',
        gap_3: 'Gấp 3',
        gap_4: 'Gấp 4',
    };

    return codes.map((code) => nameMap[code] || code);
}
