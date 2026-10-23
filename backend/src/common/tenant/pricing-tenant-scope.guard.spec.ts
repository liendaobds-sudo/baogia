/**
 * ANTI-DRIFT GUARD: service pricing nào còn CHƯA có lọc tenant ở tầng ứng dụng.
 *
 * Bối cảnh (audit 2026-08-29): 19 service trong `modules/pricing/services/` không có một tham
 * chiếu `tenant` nào, trong khi các bảng chúng đọc/ghi (`pricing_config`, `setup_fees`,
 * `pricing_tiers`, `paper_sizes`, `materials`, `products`, `printers`…) đều nằm trong manifest RLS
 * — tức được phân loại là DỮ LIỆU CỦA TENANT. Vì RLS chưa flip và app đang nối bằng superuser,
 * đây là đọc/ghi chéo tenant thật trên dữ liệu tới hạn về tiền.
 *
 * Việc siết cả 19 service là thay đổi lớn, làm dần. Test này KHÔNG bắt buộc phải xanh-hoá ngay;
 * nó chỉ **đóng băng danh sách hiện tại** để:
 *   1. Không có service MỚI nào lặng lẽ thêm vào nhóm "không lọc tenant".
 *   2. Khi một service được siết, người sửa BUỘC phải gỡ tên khỏi allowlist ⇒ tiến độ đo được.
 *
 * Cách kiểm: quét mã nguồn bằng fs + regex, không import service (tránh side effect DI).
 */
import * as fs from 'fs';
import * as path from 'path';

const SERVICES_DIR = path.resolve(__dirname, '../../modules/pricing/services');

/**
 * Service CHƯA lọc tenant ở tầng app — dựa hoàn toàn vào RLS sau khi flip.
 * ⚠️ CHỈ ĐƯỢC PHÉP THU HẸP danh sách này. Thêm tên mới = ship thêm một lỗ hổng.
 *
 * Ghi chú phân loại:
 *  - `master-data`, `offset-master-data`, `paper-sizes`, `print-types`, `printers`, `products`,
 *    `processing-options`, `material-types`, `material-categories`, `units`, `large-format-...`:
 *    danh mục/bảng giá — rủi ro CHÍNH là GHI chéo tenant.
 *  - `pricing-facade`, `bound-calculator`, `large-format-calculator`, `sheet-optimizer`,
 *    `rfm-scoring`, `pagination.helper`: tính toán thuần / helper, đọc qua service khác.
 */
const NOT_YET_TENANT_SCOPED: ReadonlySet<string> = new Set([
    'bound-calculator.service.ts',
    'large-format-calculator.service.ts',
    'master-data.service.ts',
    'material-categories.service.ts',
    'material-types.service.ts',
    'offset-master-data.service.ts',
    'pagination.helper.ts',
    'paper-sizes.service.ts',
    'pricing-facade.service.ts',
    'print-types.service.ts',
    'printers.service.ts',
    'processing-options.service.ts',
    'products.service.ts',
    'rfm-scoring.service.ts',
    'sheet-optimizer.service.ts',
    'units.service.ts',
]);

/** Service ĐÃ được siết trong đợt audit — nếu mất dấu vết tenant là hồi quy. */
const MUST_STAY_TENANT_SCOPED: readonly string[] = [
    'orders.service.ts',
    'pricing-dashboard.service.ts',
    'quote-pdf.service.ts',
    'stats.service.ts',
    'system-settings.service.ts',
    'customers.service.ts',
];

function listServiceFiles(): string[] {
    if (!fs.existsSync(SERVICES_DIR)) return [];
    return fs
        .readdirSync(SERVICES_DIR)
        .filter((f) => (f.endsWith('.service.ts') || f.endsWith('.helper.ts')) && !f.endsWith('.spec.ts'));
}

const mentionsTenant = (file: string): boolean =>
    /tenant/i.test(fs.readFileSync(path.join(SERVICES_DIR, file), 'utf8'));

describe('Anti-drift: lọc tenant trong modules/pricing/services', () => {
    const files = listServiceFiles();

    it('quét được danh sách service (sanity)', () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it('KHÔNG có service mới nào thiếu lọc tenant ngoài allowlist đã biết', () => {
        const unscoped = files.filter((f) => !mentionsTenant(f));
        const unexpected = unscoped.filter((f) => !NOT_YET_TENANT_SCOPED.has(f));
        if (unexpected.length > 0) {
            throw new Error(
                `Phát hiện ${unexpected.length} service pricing MỚI không có lọc tenant:\n` +
                unexpected.map((f) => `  - ${f}`).join('\n') +
                '\n\nBảng master-data/pricing đều là dữ liệu của tenant (có trong TENANT_RLS_MANIFEST).\n' +
                '→ Dùng `common/tenant/tenant-sql.ts` (tenantSqlScope / tenantQbCondition) cho query,\n' +
                '  và gắn tenant_id khi INSERT. Nếu thật sự là dữ liệu nền tảng dùng chung, hãy giải\n' +
                '  trình và thêm vào allowlist trong file test này.',
            );
        }
        expect(unexpected).toEqual([]);
    });

    it('allowlist chỉ được THU HẸP: mọi tên trong allowlist phải còn tồn tại và vẫn chưa scoped', () => {
        const stale: string[] = [];
        for (const f of NOT_YET_TENANT_SCOPED) {
            if (!files.includes(f)) { stale.push(`${f} (file không còn tồn tại)`); continue; }
            if (mentionsTenant(f)) stale.push(`${f} (đã có lọc tenant → GỠ khỏi allowlist)`);
        }
        if (stale.length > 0) {
            throw new Error(
                'Allowlist đã lỗi thời — cập nhật `NOT_YET_TENANT_SCOPED`:\n' +
                stale.map((s) => `  - ${s}`).join('\n'),
            );
        }
        expect(stale).toEqual([]);
    });

    it.each(MUST_STAY_TENANT_SCOPED)('%s giữ được lọc tenant (chống hồi quy)', (file) => {
        expect(files).toContain(file);
        expect(mentionsTenant(file)).toBe(true);
    });
});
