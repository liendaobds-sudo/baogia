import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';

/**
 * Generates HTML-based quote documents (print → PDF) in Vietnamese business format.
 */
@Injectable()
export class QuotePdfService {
    private readonly logger = new Logger(QuotePdfService.name);

    constructor(
        @InjectDataSource() private dataSource: DataSource,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    /**
     * Đọc `site_settings` ĐÚNG tenant của báo giá (audit 2026-08-29).
     *
     * Trước đây `SELECT key, value FROM site_settings` không có WHERE và gán vào cùng
     * một object ⇒ hàng của tenant nào đọc sau thì THẮNG ⇒ PDF gửi khách có thể mang
     * tên/địa chỉ/MST/logo của tenant KHÁC (vừa rò dữ liệu, vừa sai chứng từ).
     *
     * Ưu tiên `quote.tenant_id` (nguồn chính xác nhất — báo giá thuộc tenant nào thì in
     * pháp nhân của tenant đó), sau đó mới tới tenant context của request.
     * Hàng `tenant_id IS NULL` (dữ liệu di sản trước Pha A) được dùng làm fallback và
     * KHÔNG ghi đè hàng có tenant khớp.
     */
    private async loadSiteSettings(quoteTenantId?: unknown): Promise<Record<string, string>> {
        const parsed = Number(quoteTenantId);
        const tenantId = Number.isSafeInteger(parsed) && parsed > 0
            ? parsed
            : this.tenantCtx?.currentTenantId() ?? null;

        const site: Record<string, string> = {};
        try {
            const rows: { key: string; value: string; tenant_id: number | null }[] = tenantId == null
                // Không xác định được tenant → chỉ dùng hàng dùng chung, không trộn tenant khác.
                ? await this.dataSource.query(
                    'SELECT key, value, tenant_id FROM site_settings WHERE tenant_id IS NULL',
                )
                : await this.dataSource.query(
                    'SELECT key, value, tenant_id FROM site_settings WHERE tenant_id = $1 OR tenant_id IS NULL',
                    [tenantId],
                );

            // Nạp hàng NULL trước, rồi hàng đúng tenant ghi đè lên.
            for (const r of rows ?? []) if (r?.tenant_id == null && r?.key) site[r.key] = r.value;
            for (const r of rows ?? []) if (r?.tenant_id != null && r?.key) site[r.key] = r.value;
        } catch (e) {
            // Cột tenant_id chưa tồn tại (DB trước Pha A) → thoái về truy vấn cũ, ghi log.
            this.logger.warn(
                `site_settings theo tenant thất bại, dùng bản không lọc: ${e instanceof Error ? e.message : e}`,
            );
            const rows = await this.dataSource
                .query('SELECT key, value FROM site_settings')
                .catch(() => []);
            for (const r of rows ?? []) if (r?.key) site[r.key] = r.value;
        }
        return site;
    }

    /** Số tiền VND → chữ (đơn giản, đủ dùng báo giá). */
    numberToVietnameseWords(n: number): string {
        const num = Math.round(Math.abs(n) || 0);
        if (num === 0) return 'Không đồng';
        const ones = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
        const read3 = (x: number, full: boolean): string => {
            const tr = Math.floor(x / 100);
            const ch = Math.floor((x % 100) / 10);
            const dv = x % 10;
            let s = '';
            if (tr > 0 || full) {
                if (tr > 0) s += ones[tr] + ' trăm';
                else if (full && (ch > 0 || dv > 0)) s += 'không trăm';
            }
            if (ch > 1) {
                s += (s ? ' ' : '') + ones[ch] + ' mươi';
                if (dv === 1) s += ' mốt';
                else if (dv === 5) s += ' lăm';
                else if (dv > 0) s += ' ' + ones[dv];
            } else if (ch === 1) {
                s += (s ? ' ' : '') + 'mười';
                if (dv === 5) s += ' lăm';
                else if (dv > 0) s += ' ' + ones[dv];
            } else if (dv > 0) {
                if (s) s += ' lẻ ' + ones[dv];
                else s += ones[dv];
            }
            return s.trim();
        };
        const scales = ['', 'nghìn', 'triệu', 'tỷ'];
        const parts: string[] = [];
        let rest = num;
        let si = 0;
        while (rest > 0 && si < scales.length) {
            const chunk = rest % 1000;
            if (chunk > 0) {
                const w = read3(chunk, rest >= 1000);
                parts.unshift(w + (scales[si] ? ' ' + scales[si] : ''));
            }
            rest = Math.floor(rest / 1000);
            si++;
        }
        const body = parts.join(' ').replace(/\s+/g, ' ').trim();
        return body.charAt(0).toUpperCase() + body.slice(1) + ' đồng chẵn';
    }

    private esc(s: unknown): string {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private offsetSpecOf(pd: any): string {
        const c = pd?.config || {};
        const m = pd?.result?.meta || {};
        const parts: string[] = [];
        let size = c.kichThuoc || '';
        if (!size) {
            if (c.hong != null && c.hong !== '') {
                size = `${c.cao}×${c.rong}×${c.hong}${c.mi != null && c.mi !== '' ? `×${c.mi}` : ''}cm`;
            } else if (c.rong && c.cao) size = `${c.rong}×${c.cao}cm`;
        }
        if (size) parts.push(`KT: ${size}`);
        if (m.khoBinh || m.khoGiayLon) parts.push(`Khổ: ${m.khoBinh || m.khoGiayLon}`);
        if (c.materialCode) parts.push(`Giấy: ${c.materialCode}`);
        const soMau = c.soKemIn ?? c.soMau ?? c.soKem;
        if (soMau) parts.push(`${soMau} màu${m.loaiKem ? ` (${m.loaiKem})` : ''}`);
        if (m.soConToLon) parts.push(`${m.soConToLon} con/tờ`);
        if (m.soToLon) parts.push(`${Number(m.soToLon).toLocaleString('vi-VN')} tờ in`);
        return parts.join(' · ');
    }

    private digitalSpecOf(item: Record<string, any>, pd: any): string {
        const c = pd?.configParams || {};
        const parts: string[] = [];
        const w = item.item_width ?? c.itemWidth ?? c.lfWidth;
        const h = item.item_height ?? c.itemHeight ?? c.lfHeight;
        if (w && h) parts.push(`${w}×${h} mm`);
        const mat = item.material_name || c.materialName;
        if (mat) parts.push(String(mat));
        const paper = item.paper_size_name || c.paperSizeName;
        if (paper) parts.push(`Khổ giấy: ${paper}`);
        const side = item.print_side || c.printSide;
        if (side) {
            parts.push(side === 'double' || side === '2' ? '2 mặt' : side === 'single' || side === '1' ? '1 mặt' : String(side));
        }
        if (item.print_type || c.printType || c.lfPrintType) {
            parts.push(String(item.print_type || c.printType || c.lfPrintType));
        }
        if (c.bPageCount || item.page_count) parts.push(`${c.bPageCount || item.page_count} trang`);
        if (c.bBindingType || item.binding_type) parts.push(`Đóng: ${c.bBindingType || item.binding_type}`);
        if (Array.isArray(c.processingNames) && c.processingNames.length) {
            parts.push('GC: ' + c.processingNames.join(', '));
        }
        if (Array.isArray(c.accessoryNames) && c.accessoryNames.length) {
            parts.push('PK: ' + c.accessoryNames.join(', '));
        }
        return parts.join(' · ');
    }

    async generateHtml(quote: Record<string, any>): Promise<string> {
        const site = await this.loadSiteSettings(quote?.tenant_id ?? quote?.tenantId);

        let bankAccounts: { bank_name?: string; account_number?: string; account_name?: string }[] = [];
        try { bankAccounts = JSON.parse(site['bank_accounts'] || '[]'); } catch { /* empty */ }
        const primaryBank = bankAccounts[0] || {};

        const items = quote.items || [];
        const formatVnd = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
        const formatDate = (d: string | number | Date | null | undefined) =>
            d ? new Date(d).toLocaleDateString('vi-VN') : '';

        const pickNum = (v: unknown, fallback: number): number => {
            const n = parseFloat(String(v));
            return Number.isFinite(n) ? n : fallback;
        };

        const total = pickNum(quote.total, 0);
        const discountAmount = pickNum(quote.discount_amount, 0);
        const afterDiscount = Math.max(0, total - discountAmount);
        const vatRate = pickNum(quote.vat_rate, 0);
        const vatAmount = pickNum(quote.vat_amount, Math.round(afterDiscount * vatRate / 100));
        const shippingFee = pickNum(quote.shipping_fee, 0);
        const grandTotal = pickNum(quote.grand_total, afterDiscount + vatAmount + shippingFee);
        const validityDays = pickNum(quote.validity_days, 7);

        let validUntil = quote.valid_until;
        if (!validUntil && quote.created_at) {
            const d = new Date(quote.created_at);
            d.setDate(d.getDate() + validityDays);
            validUntil = d.toISOString().slice(0, 10);
        }

        const companyName = site['company_name'] || 'ZEPLAO PRINT';
        const companyAddress = site['company_address'] || '';
        const companyPhone = site['company_phone'] || '';
        const companyEmail = site['company_email'] || '';
        const companyTaxCode = site['company_tax_code'] || '';
        const companyWebsite = site['website'] || '';
        const companyLogo = site['company_logo'] || site['logo'] || '';
        const companyBank = primaryBank.account_number || site['company_bank_account'] || '';
        const companyBankName = primaryBank.bank_name || site['company_bank_name'] || '';
        const companyBankHolder = primaryBank.account_name || site['company_bank_holder'] || companyName;
        const paymentTerms = site['payment_terms'] || 'Thanh toán 50% khi đặt hàng, 50% khi nhận hàng.';
        const deliveryTerms = site['delivery_terms'] || 'Giao hàng trong vòng 3–5 ngày làm việc kể từ ngày duyệt file.';

        const itemRows = items
            .filter((item: Record<string, unknown>) => !item.parent_id)
            .map((item: Record<string, unknown>, i: number) => {
                const qty = parseInt(String(item.quantity), 10) || 1;
                const itemTotal = parseFloat(String(item.item_total)) || 0;
                const unitPrice = qty > 0 ? Math.round(itemTotal / qty) : 0;
                let pd: any = {};
                try {
                    pd = typeof item.printing_detail === 'string'
                        ? JSON.parse(item.printing_detail as string)
                        : (item.printing_detail || {});
                } catch { /* empty */ }
                let specs = '';
                if (pd?.offset) specs = this.offsetSpecOf(pd);
                else specs = this.digitalSpecOf(item, pd);

                return `<tr>
                    <td class="c">${i + 1}</td>
                    <td><div class="pname">${this.esc(item.product_name || 'Sản phẩm')}</div>
                        ${specs ? `<div class="pspec">${this.esc(specs)}</div>` : ''}</td>
                    <td class="c">${qty}</td>
                    <td class="c">${this.esc(item.unit || 'cái')}</td>
                    <td class="r">${formatVnd(unitPrice)}</td>
                    <td class="r b">${formatVnd(itemTotal)}</td>
                </tr>`;
            }).join('');

        const logoHtml = companyLogo
            ? `<img class="logo" src="${this.esc(companyLogo)}" alt="logo" />`
            : `<div class="logo-ph">${this.esc(companyName.slice(0, 1))}</div>`;

        const bankBlock = companyBank
            ? `<div class="bank">
                <div class="bank-title">Thông tin chuyển khoản</div>
                <p><strong>${this.esc(companyBankName || 'Ngân hàng')}</strong></p>
                <p>STK: <strong>${this.esc(companyBank)}</strong></p>
                <p>CTK: ${this.esc(companyBankHolder)}</p>
                <p class="muted">Nội dung: ${this.esc(quote.code)} – ${this.esc(quote.customer_name || '')}</p>
               </div>`
            : '';

        return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<title>Báo giá ${this.esc(quote.code)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; color: #0f172a; font-size: 13px; line-height: 1.5; padding: 28px 32px; }
  .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; border: 1px solid #e2e8f0; }
  .logo-ph { width: 64px; height: 64px; border-radius: 8px; background: #1d4ed8; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; }
  .company-name { font-size: 18px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; }
  .company-info { font-size: 11px; color: #475569; margin-top: 4px; }
  .doc-meta { text-align: right; }
  .doc-meta h1 { font-size: 24px; color: #1d4ed8; letter-spacing: 0.04em; }
  .doc-meta .code { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 4px; }
  .doc-meta .date { font-size: 12px; color: #64748b; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .card h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #1d4ed8; margin-bottom: 6px; }
  .card p { font-size: 12px; color: #334155; margin: 2px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  table.items th { background: #1d4ed8; color: #fff; padding: 9px 8px; font-size: 12px; text-align: left; }
  table.items td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  table.items tr:nth-child(even) td { background: #f8fafc; }
  .pname { font-weight: 700; color: #0f172a; }
  .pspec { font-size: 11px; color: #64748b; margin-top: 3px; }
  .c { text-align: center; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .totals { width: 360px; margin-left: auto; margin-bottom: 12px; }
  .totals td { padding: 5px 8px; font-size: 13px; }
  .totals .label { text-align: right; color: #475569; }
  .totals .value { text-align: right; font-weight: 600; min-width: 130px; }
  .totals .grand td { border-top: 2px solid #1d4ed8; padding-top: 8px; font-size: 15px; color: #1d4ed8; font-weight: 800; }
  .words { text-align: right; font-size: 12px; color: #334155; font-style: italic; margin: 4px 0 16px; }
  .terms { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; font-size: 12px; color: #475569; }
  .terms h4 { color: #1d4ed8; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; }
  .terms p { margin: 3px 0; }
  .footer-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; margin-top: 8px; }
  .bank-title { font-weight: 700; text-transform: uppercase; font-size: 11px; margin-bottom: 6px; color: #0f172a; }
  .muted { color: #64748b; font-size: 11px; }
  .signs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 28px; text-align: center; font-size: 12px; }
  .signs .title { font-weight: 700; margin-bottom: 4px; }
  .signs .hint { font-size: 11px; color: #64748b; font-style: italic; margin-bottom: 56px; }
  .validity { margin-top: 18px; text-align: center; font-size: 11px; color: #94a3b8; font-style: italic; }
  @media print {
    body { padding: 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      ${logoHtml}
      <div>
        <div class="company-name">${this.esc(companyName)}</div>
        <div class="company-info">
          ${companyAddress ? this.esc(companyAddress) + '<br/>' : ''}
          ${companyPhone ? 'ĐT: ' + this.esc(companyPhone) : ''}
          ${companyEmail ? ' · Email: ' + this.esc(companyEmail) : ''}
          ${companyTaxCode ? '<br/>MST: ' + this.esc(companyTaxCode) : ''}
          ${companyWebsite ? '<br/>' + this.esc(companyWebsite) : ''}
        </div>
      </div>
    </div>
    <div class="doc-meta">
      <h1>BÁO GIÁ</h1>
      <div class="code">${this.esc(quote.code)}</div>
      <div class="date">
        Ngày lập: ${formatDate(quote.created_at)}
        ${validUntil ? '<br/>Hiệu lực đến: ' + formatDate(validUntil) : ''}
      </div>
    </div>
  </div>

  <div class="parties">
    <div class="card">
      <h3>Khách hàng</h3>
      <p><strong>${this.esc(quote.customer_name || 'Khách lẻ')}</strong></p>
      ${quote.customer_unit ? `<p>Đơn vị: ${this.esc(quote.customer_unit)}</p>` : ''}
      ${quote.customer_phone ? `<p>Điện thoại: ${this.esc(quote.customer_phone)}</p>` : ''}
      ${quote.customer_email ? `<p>Email: ${this.esc(quote.customer_email)}</p>` : ''}
      ${quote.customer_address ? `<p>Địa chỉ: ${this.esc(quote.customer_address)}</p>` : ''}
      ${quote.tax_code ? `<p>MST: ${this.esc(quote.tax_code)}</p>` : ''}
      ${quote.customer_contact ? `<p>Liên hệ: ${this.esc(quote.customer_contact)}</p>` : ''}
    </div>
    <div class="card">
      <h3>Thông tin báo giá</h3>
      <p>Loại: ${this.esc(quote.type || 'In nhanh')}</p>
      <p>Trạng thái: ${this.esc(quote.status || 'draft')}</p>
      ${quote.delivery_time ? `<p>Thời gian giao: ${this.esc(quote.delivery_time)}</p>` : ''}
      <p>Người lập: ${this.esc(quote.created_by_name || '—')}</p>
      <p>Hiệu lực: ${validityDays} ngày${validUntil ? ` (đến ${formatDate(validUntil)})` : ''}</p>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:40px" class="c">STT</th>
        <th>Sản phẩm / Quy cách</th>
        <th style="width:56px" class="c">SL</th>
        <th style="width:48px" class="c">ĐVT</th>
        <th style="width:100px" class="r">Đơn giá</th>
        <th style="width:110px" class="r">Thành tiền</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="6" class="c" style="color:#94a3b8;padding:16px">Không có hạng mục</td></tr>'}
    </tbody>
  </table>

  <table class="totals">
    ${discountAmount > 0 ? `
    <tr><td class="label">Tạm tính:</td><td class="value">${formatVnd(total)} ₫</td></tr>
    <tr><td class="label">Chiết khấu${quote.discount_type === 'percent' ? ` (${this.esc(quote.discount_value)}%)` : ''}:</td>
        <td class="value" style="color:#dc2626">−${formatVnd(discountAmount)} ₫</td></tr>` : ''}
    <tr><td class="label">Cộng tiền hàng (chưa VAT):</td><td class="value">${formatVnd(afterDiscount)} ₫</td></tr>
    ${vatRate > 0 ? `<tr><td class="label">Thuế GTGT (${vatRate}%):</td><td class="value">${formatVnd(vatAmount)} ₫</td></tr>` : ''}
    ${shippingFee > 0 ? `<tr><td class="label">Phí giao hàng:</td><td class="value">${formatVnd(shippingFee)} ₫</td></tr>` : ''}
    <tr class="grand"><td class="label">TỔNG THANH TOÁN:</td><td class="value">${formatVnd(grandTotal)} ₫</td></tr>
  </table>
  <div class="words">Bằng chữ: <strong>${this.esc(this.numberToVietnameseWords(grandTotal))}</strong></div>

  <div class="terms">
    <h4>Điều khoản</h4>
    <p>💳 <strong>Thanh toán:</strong> ${this.esc(paymentTerms)}</p>
    <p>🚚 <strong>Giao hàng:</strong> ${this.esc(deliveryTerms)}</p>
    <p>📄 Đơn giá dòng là thành tiền trước thuế${vatRate > 0 ? `; VAT ${vatRate}% tính trên tổng sau chiết khấu.` : ' (báo giá không áp VAT).'}</p>
    ${quote.customer_note ? `<p>📝 <strong>Ghi chú:</strong> ${this.esc(quote.customer_note)}</p>` : ''}
  </div>

  <div class="footer-grid">
    ${bankBlock || '<div></div>'}
    <div></div>
  </div>

  <div class="signs">
    <div>
      <div class="title">KHÁCH HÀNG</div>
      <div class="hint">(Ký, ghi rõ họ tên)</div>
    </div>
    <div>
      <div class="title">QUẢN LÝ</div>
      <div class="hint">(Ký, ghi rõ họ tên)</div>
    </div>
    <div>
      <div class="title">NGƯỜI LẬP</div>
      <div class="hint">(Ký, ghi rõ họ tên)</div>
      <div style="font-weight:700">${this.esc(quote.created_by_name || '')}</div>
    </div>
  </div>

  <div class="validity">
    Báo giá ${this.esc(quote.code)} — hiệu lực ${validityDays} ngày kể từ ngày lập
    ${validUntil ? ` · hết hạn ${formatDate(validUntil)}` : ''}.
  </div>
</body>
</html>`;
    }
}
