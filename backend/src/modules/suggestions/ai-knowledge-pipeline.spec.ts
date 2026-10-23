/**
 * Kiem tra cac sua loi cua audit "do thong minh + kien thuc chatbot AI" (2026-08-29).
 *
 * Nhom 1 — chuan hoa khong dau: helper dung chung + cac call-site truoc day chi so khop CO DAU.
 * Nhom 2 — noi lai kien thuc bi bo roi: nhom rule `delivery_production` va `fileDesignRules`.
 * Nhom 3 — go mau thuan tri thuc trong `printing-constraints.json`.
 * Nhom 4 — phat hien san pham: hop giay, viet tat, nhieu san pham trong 1 cau, nguong tin cay.
 * Nhom 5 — tai lieu seed: moi file trong SEED_DOCS phai ton tai that.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
    removeAccents, normalizeVi, toMatchText, matchesAnyTerm, tokenizeForSearch,
} from '../../common/text/vietnamese';
import { ContextInferenceService } from './context-inference.service';
import { PromptBuilderService } from './prompt-builder.service';
import {
    detectProduct, detectAllProducts, loadProductTemplates, MIN_PRODUCT_CONFIDENCE,
} from '../quote/extractors/product-detector';
import { SEED_DOCS } from '../knowledge-base/kb-seed.service';

/** Doc JSON tu dia (khong dung `import` de tranh phu thuoc cau hinh esModuleInterop/resolveJsonModule). */
const constraints = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'src', 'data', 'knowledge', 'printing-constraints.json'), 'utf-8'),
);

describe('1. Helper chuan hoa tieng Viet', () => {
    it('removeAccents bo dau va xu ly d/D', () => {
        expect(removeAccents('Đóng ghim giữa')).toBe('Dong ghim giua');
        expect(removeAccents('cán mờ')).toBe('can mo');
    });

    it('normalizeVi ha chu thuong + bo dau + gop khoang trang', () => {
        expect(normalizeVi('  CÁN   Mờ  2 Mặt ')).toBe('can mo 2 mat');
    });

    it('toMatchText bung viet tat pho bien', () => {
        expect(toMatchText('nc 300gsm')).toContain('namecard');
        expect(toMatchText('ko can mang')).toContain('khong');
        expect(toMatchText('sl 1000')).toContain('so luong');
    });

    it('toMatchText KHONG bung viet tat da nghia (cm/cb/kg/bc)', () => {
        // 'cm' la centimet, khong duoc bien thanh 'can mo'.
        expect(toMatchText('kich thuoc 5 cm')).not.toContain('can mo');
        expect(toMatchText('giay 300 kg')).not.toContain('khong');
        expect(toMatchText('bc quy 3')).not.toContain('brochure');
    });

    it('matchesAnyTerm khop ca ban co dau va khong dau', () => {
        expect(matchesAnyTerm('in tờ rơi cán mờ', ['cán mờ'])).toBe(true);
        expect(matchesAnyTerm('in to roi can mo', ['cán mờ'])).toBe(true);
        expect(matchesAnyTerm('in to roi can mo', ['ép nhũ'])).toBe(false);
    });

    it('tokenizeForSearch tra ve token khong dau, bo token 1 ky tu', () => {
        const { normalized } = tokenizeForSearch('Cán mờ 2 mặt, giá?');
        expect(normalized).toContain('can');
        expect(normalized).toContain('mat');
        expect(normalized.every((t) => t.length > 1)).toBe(true);
    });
});

describe('2. Kien thuc bi bo roi da duoc noi vao prompt', () => {
    let ctx: ContextInferenceService;

    beforeAll(async () => {
        ctx = new ContextInferenceService();
        await ctx.onModuleInit();
    });

    it('nhom delivery_production duoc inject khi khach hoi thoi gian (co dau)', () => {
        const out = ctx.buildConstraintRulesContext('in tờ rơi bao lâu xong ạ');
        expect(out).toMatch(/TIME-00\d/);
    });

    it('nhom delivery_production duoc inject khi khach gõ KHONG DAU', () => {
        const out = ctx.buildConstraintRulesContext('in to roi bao lau xong a');
        expect(out).toMatch(/TIME-00\d/);
    });

    it('fileDesignRules duoc inject khi khach noi ve file/mau', () => {
        const out = ctx.buildFileDesignRulesContext('em gửi file jpg được không, màu có đúng không');
        expect(out).toContain('QUY TẮC FILE THIẾT KẾ');
        expect(out).toMatch(/CMYK/);
        expect(out).toMatch(/300 dpi/i);
    });

    it('fileDesignRules KHONG inject khi hoi thoai khong lien quan (tiet kiem ngan sach)', () => {
        expect(ctx.buildFileDesignRulesContext('bên mình giao hàng tận nơi không')).toBe('');
        expect(ctx.buildFileDesignRulesContext(undefined)).toBe('');
    });

    it('persuasion.json (usageContextKeywords) da co call-site that', () => {
        const out = ctx.buildPersuasionContext('em cần decal dán chai nước ngoài trời, làm gấp nhé');
        expect(out).toContain('TÍN HIỆU NGỮ CẢNH SỬ DỤNG');
        expect(out).toMatch(/ngoài trời/);
        expect(out).toMatch(/gấp/);
    });

    it('persuasion khong inject khi khong co tin hieu ngu canh', () => {
        expect(ctx.buildPersuasionContext('cho mình xin số điện thoại')).toBe('');
        expect(ctx.buildPersuasionContext(undefined)).toBe('');
    });

    it('goi y dien dat co canh bao KHONG in placeholder cho khach', () => {
        const out = ctx.buildPersuasionContext('mình cần loại cao cấp');
        expect(out).toMatch(/không in ra dấu ngoặc nhọn/i);
    });

    it('quy tac rang buoc khop duoc khi khach gõ khong dau', () => {
        const out = ctx.buildConstraintRulesContext('in namecard can mo');
        // Truoc audit: khong dau ⇒ khong nhom nao khop ⇒ luon roi ve 3 nhom mac dinh.
        expect(out).toMatch(/LAM-00\d|GSM-00\d|DIE-00\d|FOIL-00\d/);
    });

    it('inferContext khop san pham khi khach gõ khong dau', () => {
        const withAccent = ctx.inferContext('em can in danh thiếp');
        const noAccent = ctx.inferContext('em can in danh thiep');
        expect(withAccent.matchedProduct).toBeTruthy();
        expect(noAccent.matchedProduct).toBe(withAccent.matchedProduct);
    });

    it('matchEdgeCase khop khi khach gõ khong dau', () => {
        expect(ctx.matchEdgeCase('hom nay thoi tiet the nao')).not.toBeNull();
    });
});

describe('2b. simplifyForCustomer giu cau truc dong', () => {
    const builder = new PromptBuilderService();

    it('giu xuong dong (bang markdown khong bi dan lien)', () => {
        const table = '| Khổ | mm |\n|---|---|\n| A4 | 210 × 297 |';
        const out = builder.simplifyForCustomer(table);
        expect(out.split('\n').length).toBe(3);
    });

    it('van gop khoang trang ngang', () => {
        expect(builder.simplifyForCustomer('hello   world')).toBe('hello world');
    });

    it('van dich thuat ngu tieng Anh', () => {
        expect(builder.simplifyForCustomer('matte lamination')).toBe('cán mờ');
    });
});

describe('3. Go mau thuan tri thuc trong printing-constraints.json', () => {
    const lamination = (constraints as any).constraintRules.lamination.rules as any[];
    const byId = (id: string) => lamination.find((r) => r.id === id);

    it('LAM-001 khong con noi "<200gsm KHONG nen can mang" va thong nhat voi hard check 80gsm', () => {
        const r = byId('LAM-001');
        expect(r).toBeTruthy();
        expect(r.if).toContain('80gsm');
        expect(r.if).not.toContain('200gsm');
    });

    it('LAM-003 chi con banner/hiflex/bat — KHONG con gop standee', () => {
        const r = byId('LAM-003');
        expect(r.severity).toBe('hard_rule');
        expect(r.if.toLowerCase()).not.toContain('standee');
    });

    it('LAM-009 cho phep can standee/PP (khop voi hard check trong code)', () => {
        const r = byId('LAM-009');
        expect(r).toBeTruthy();
        expect(r.if.toLowerCase()).toContain('standee');
        expect(r.then).toMatch(/CÓ THỂ cán/);
    });

    it('khong con rule hard_rule nao cam can mang tren standee', () => {
        const forbidStandee = lamination.filter(
            (r) => r.severity === 'hard_rule'
                && /standee/i.test(r.if)
                && /KHÔNG cán/i.test(r.then),
        );
        expect(forbidStandee).toEqual([]);
    });
});

describe('4. Phat hien san pham', () => {
    beforeEach(() => {
        // Khong dung Pricing template → buoc di duong static regex (nhu cron/queue/test).
        loadProductTemplates([]);
    });

    it('nhan dien hop giay (truoc audit tra null)', () => {
        const m = detectProduct('báo giá hộp giấy 500 cái giúp mình');
        expect(m).not.toBeNull();
        expect(m!.product).toBe('paper_box');
    });

    it('nhan dien hop carton va bao bi hop', () => {
        expect(detectProduct('in hộp carton đựng bánh')?.product).toBe('paper_box');
        expect(detectProduct('lam hop giay nap gai')?.product).toBe('paper_box');
    });

    it('tui giay van la paper_bag (khong bi hop giay chiem)', () => {
        expect(detectProduct('in túi giấy kraft quai xoắn')?.product).toBe('paper_bag');
    });

    it('nhan dien qua viet tat va khong dau', () => {
        expect(detectProduct('nc 300gsm 2 mặt')?.product).toBe('namecard');
        expect(detectProduct('bao gia to roi a5')?.product).toBe('flyer');
        expect(detectProduct('in danh thiep')?.product).toBe('namecard');
    });

    it('detectAllProducts tra ve NHIEU san pham theo thu tu xuat hien', () => {
        const all = detectAllProducts('em cần in namecard và tờ rơi');
        const codes = all.map((m) => m.product);
        expect(codes).toContain('namecard');
        expect(codes).toContain('flyer');
        expect(codes.indexOf('namecard')).toBeLessThan(codes.indexOf('flyer'));
    });

    it('nguong tin cay loai bo khop yeu tu Pricing template', () => {
        loadProductTemplates([
            { id: 1, code: 'weak', name: 'X', product_type: 'loose', keywords: ['ab'] } as any,
        ]);
        // score = 2 ⇒ confidence 0.1 < MIN_PRODUCT_CONFIDENCE ⇒ khong duoc khoa vao san pham nay.
        const m = detectProduct('cho minh hoi ab nhe');
        expect(m?.product).not.toBe('weak');
        expect(MIN_PRODUCT_CONFIDENCE).toBeGreaterThan(0.1);
    });

    it('khop manh tu Pricing template van duoc nhan', () => {
        loadProductTemplates([
            { id: 2, code: 'offset_namecard', name: 'Danh thiếp offset', product_type: 'loose', keywords: ['danh thiếp', 'namecard'] } as any,
        ]);
        const m = detectProduct('báo giá danh thiếp 1000 cái');
        expect(m?.product).toBe('offset_namecard');
        expect(m!.confidence).toBeGreaterThanOrEqual(MIN_PRODUCT_CONFIDENCE);
    });

    afterAll(() => loadProductTemplates([]));
});

describe('5. Tai lieu seed', () => {
    const baseDir = path.resolve(process.cwd(), 'src', 'modules', 'knowledge-base');

    it('moi file trong SEED_DOCS ton tai that tren dia', () => {
        const missing = SEED_DOCS
            .filter((d) => !fs.existsSync(path.join(baseDir, d.dir, d.filename)))
            .map((d) => `${d.dir}/${d.filename}`);
        expect(missing).toEqual([]);
    });

    it('hai vung trang cua KB da duoc bo sung va dang ky seed', () => {
        const names = SEED_DOCS.map((d) => d.filename);
        expect(names).toContain('kho-giay-va-dan-khuon.md');
        expect(names).toContain('bao-bi-hop-giay.md');
    });

    it('3 tai lieu tu kb-docs/ (truoc day khong bao gio duoc nap) da vao seed', () => {
        const names = SEED_DOCS.map((d) => d.filename);
        expect(names).toContain('chuan-bi-file-thiet-ke.md');
        expect(names).toContain('ky-thuat-in-nang-cao.md');
        expect(names).toContain('anti-patterns-tu-van.md');
    });

    it('tai lieu kho giay noi du cac khai niem tinh gia cot loi', () => {
        const md = fs.readFileSync(path.join(baseDir, 'data', 'kho-giay-va-dan-khuon.md'), 'utf-8');
        for (const term of ['số con', 'cắn nhíp', 'bù hao', 'kẽm', 'bleed', 'khổ tờ nhập']) {
            expect(md.toLowerCase()).toContain(term.toLowerCase());
        }
    });

    it('tai lieu bao bi noi du cac kieu hop va thong tin bat buoc', () => {
        const md = fs.readFileSync(path.join(baseDir, 'data', 'bao-bi-hop-giay.md'), 'utf-8');
        for (const term of ['nắp gài', 'âm dương', 'hộp cứng', 'túi giấy', 'khuôn bế', 'cấn', 'dieline']) {
            expect(md.toLowerCase()).toContain(term.toLowerCase());
        }
    });

    it('KB khong con ghi cung thuong hieu cu hoac VAT 8%', () => {
        const dirs = ['data', 'seed-docs'];
        const offenders: string[] = [];
        for (const dir of dirs) {
            for (const f of fs.readdirSync(path.join(baseDir, dir)).filter((x) => x.endsWith('.md'))) {
                const content = fs.readFileSync(path.join(baseDir, dir, f), 'utf-8');
                if (/KPrint/.test(content)) offenders.push(`${dir}/${f}: KPrint`);
                if (/VAT\s*8\s*%/i.test(content)) offenders.push(`${dir}/${f}: VAT 8%`);
            }
        }
        expect(offenders).toEqual([]);
    });
});
