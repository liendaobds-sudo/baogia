import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Generates HTML-based PDF quotes in Vietnamese legal format.
 * Extracted from OrdersService for single-responsibility.
 */
@Injectable()
export class QuotePdfService {
    private readonly logger = new Logger(QuotePdfService.name);

    constructor(
        @InjectDataSource() private dataSource: DataSource,
    ) {}

    /**
     * Generate full HTML for a quote PDF.
     * Loads company info from site_settings + VAT from pricing_config.
     */
    async generateHtml(quote: Record<string, any>): Promise<string> {
        // Load company info from site_settings
        const siteRows = await this.dataSource.query('SELECT key, value FROM site_settings').catch(() => []);
        const site: Record<string, string> = {};
        for (const r of siteRows) site[r.key] = r.value;

        // Load VAT config
        const configRows = await this.dataSource.query('SELECT config_key, config_value FROM pricing_config').catch(() => []);
        const config: Record<string, string> = {};
        for (const r of configRows) config[r.config_key] = r.config_value;
        // Config loaded for fallback (VAT is now per-quote but falls back to config)

        const items = quote.items || [];
        const formatVnd = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
        const formatDate = (d: string | number | Date | null | undefined) => d ? new Date(d).toLocaleDateString('vi-VN') : '';
        const total = parseFloat(quote.total) || 0;
        const discountAmount = parseFloat(quote.discount_amount) || 0;
        const subtotalBeforeDiscount = total + discountAmount;
        // Use VAT from the quote itself (user-customized per quote), fallback to config
        const vatRate = parseFloat(quote.vat_rate) || parseFloat(config['vat_rate'] || '0');
        const vatAmount = parseFloat(quote.vat_amount) || Math.round(total * vatRate / 100);
        const shippingFee = parseFloat(quote.shipping_fee) || 0;
        const grandTotal = parseFloat(quote.grand_total) || (total + vatAmount + shippingFee);
        const offsetSpecOf = (pd: any): string => {
            const c = pd?.config || {}; const m = pd?.result?.meta || {};
            const parts: string[] = [];
            let size = c.kichThuoc || '';
            if (!size) {
                if (c.hong != null && c.hong !== '') size = `${c.cao}×${c.rong}×${c.hong}${c.mi != null && c.mi !== '' ? `×${c.mi}` : ''}cm`;
                else if (c.rong && c.cao) size = `${c.rong}×${c.cao}cm`;
            }
            if (size) parts.push(`KT: ${size}`);
            if (m.khoBinh || m.khoGiayLon) parts.push(`Khổ: ${m.khoBinh || m.khoGiayLon}`);
            if (c.materialCode) parts.push(`Giấy: ${c.materialCode}`);
            const soMau = c.soKemIn ?? c.soMau ?? c.soKem;
            if (soMau) parts.push(`${soMau} màu${m.loaiKem ? ` (${m.loaiKem})` : ''}`);
            if (m.soConToLon) parts.push(`${m.soConToLon} con/tờ`);
            return parts.join(' | ');
        };

        const companyName = site['company_name'] || 'ZEPLAO PRINT';
        const companyAddress = site['company_address'] || '';
        const companyPhone = site['company_phone'] || '';
        const companyEmail = site['company_email'] || '';
        const companyTaxCode = site['company_tax_code'] || '';
        const companyBank = site['company_bank_account'] || '';
        const companyBankName = site['company_bank_name'] || '';
        const paymentTerms = site['payment_terms'] || 'Thanh toán 50% khi đặt hàng, 50% khi nhận hàng.';
        const deliveryTerms = site['delivery_terms'] || 'Giao hàng trong vòng 3-5 ngày làm việc kể từ ngày duyệt báo giá.';

        const itemRows = items
            .filter((item: Record<string, unknown>) => !item.parent_id)
            .map((item: Record<string, unknown>, i: number) => {
                const qty = parseInt(String(item.quantity)) || 1;
                const itemTotal = parseFloat(String(item.item_total)) || 0;
                const unitPrice = qty > 0 ? Math.round(itemTotal / qty) : 0;
                const specs: string[] = [];
                let pd: any = {};
                try { pd = typeof item.printing_detail === 'string' ? JSON.parse(item.printing_detail) : (item.printing_detail || {}); } catch { /* giữ rỗng */ }
                if (pd?.offset) {
                    const s = offsetSpecOf(pd);
                    if (s) specs.push(s);
                } else {
                    if (item.material_name) specs.push(String(item.material_name));
                    if (item.paper_size_name) specs.push(String(item.paper_size_name));
                    if (item.item_width && item.item_height) specs.push(`${item.item_width}x${item.item_height}mm`);
                }
                return `<tr>
                    <td style="text-align:center">${i + 1}</td>
                    <td><strong>${item.product_name || 'Sản phẩm'}</strong>${specs.length > 0 ? `<br><span style="color:#718096;font-size:12px">${specs.join(' | ')}</span>` : ''}</td>
                    <td style="text-align:center">${qty}</td>
                    <td style="text-align:center">${item.unit || 'tờ'}</td>
                    <td style="text-align:right">${formatVnd(unitPrice)}</td>
                    <td style="text-align:right;font-weight:600">${formatVnd(itemTotal)}</td>
                </tr>`;
            }).join('');

        return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Báo giá ${quote.code}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Segoe UI',Arial,sans-serif; padding:40px; color:#1a202c; font-size:13px; line-height:1.5; }
.header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; padding-bottom:16px; border-bottom:3px solid #2b6cb0; }
.company-name { font-size:22px; font-weight:700; color:#2b6cb0; }
.company-info { font-size:11px; color:#4a5568; margin-top:4px; line-height:1.6; }
.quote-title { text-align:right; }
.quote-title h1 { font-size:26px; color:#2b6cb0; margin-bottom:4px; }
.quote-code { font-size:15px; color:#4a5568; font-weight:600; }
.quote-date { font-size:12px; color:#718096; margin-top:4px; }
.customer-section { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px; padding:16px; background:#f7fafc; border-radius:6px; }
.customer-section h3 { font-size:13px; color:#2b6cb0; margin-bottom:6px; text-transform:uppercase; }
.customer-section p { font-size:12px; color:#4a5568; margin:2px 0; }
table { width:100%; border-collapse:collapse; margin-bottom:16px; }
th { background:#2b6cb0; color:white; padding:10px 8px; text-align:left; font-size:12px; }
td { padding:9px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; }
tr:nth-child(even) { background:#f7fafc; }
.summary-table { width:350px; margin-left:auto; border-collapse:collapse; }
.summary-table td { padding:6px 12px; border:none; font-size:13px; }
.summary-table .label { text-align:right; color:#4a5568; }
.summary-table .value { text-align:right; font-weight:600; min-width:120px; }
.summary-table .grand { font-size:18px; color:#2b6cb0; font-weight:700; }
.terms { margin-top:20px; padding:16px; background:#f7fafc; border-radius:6px; font-size:12px; }
.terms h4 { color:#2b6cb0; font-size:13px; margin-bottom:8px; }
.terms p { color:#4a5568; margin:4px 0; }
.signature { margin-top:40px; padding-top:20px; border-top:1px solid #e2e8f0; display:grid; grid-template-columns:1fr 1fr; gap:40px; }
.signature div { text-align:center; }
.signature .title { font-weight:600; margin-bottom:70px; font-size:13px; }
.validity { margin-top:12px; text-align:center; font-size:11px; color:#a0aec0; font-style:italic; }
@media print { body { padding:20px; } }
</style></head><body>

<div class="header">
  <div>
    <div class="company-name">${companyName}</div>
    <div class="company-info">
      ${companyAddress ? companyAddress + '<br>' : ''}
      ${companyPhone ? 'ĐT: ' + companyPhone : ''}${companyEmail ? ' | Email: ' + companyEmail : ''}
      ${companyTaxCode ? '<br>MST: ' + companyTaxCode : ''}
    </div>
  </div>
  <div class="quote-title">
    <h1>BÁO GIÁ</h1>
    <div class="quote-code">${quote.code}</div>
    <div class="quote-date">Ngày: ${formatDate(quote.created_at)}${quote.valid_until ? '<br>Hiệu lực đến: ' + formatDate(quote.valid_until) : ''}</div>
  </div>
</div>

<div class="customer-section">
  <div>
    <h3>Thông tin khách hàng</h3>
    <p><strong>${quote.customer_name || 'Khách lẻ'}</strong></p>
    ${quote.customer_unit ? `<p>Đơn vị: ${quote.customer_unit}</p>` : ''}
    ${quote.customer_phone ? `<p>ĐT: ${quote.customer_phone}</p>` : ''}
    ${quote.customer_address ? `<p>ĐC: ${quote.customer_address}</p>` : ''}
    ${quote.tax_code ? `<p>MST: ${quote.tax_code}</p>` : ''}
  </div>
  <div>
    <h3>Thông tin giao hàng</h3>
    <p>Loại: ${quote.type || 'In nhanh'}</p>
    ${quote.delivery_time ? `<p>Thời gian giao: ${quote.delivery_time}</p>` : ''}
    <p>Người lập: ${quote.created_by_name || 'Admin'}</p>
  </div>
</div>

<table>
  <thead><tr>
    <th style="width:40px">STT</th>
    <th>Sản phẩm / Chất liệu</th>
    <th style="width:60px;text-align:center">SL</th>
    <th style="width:50px;text-align:center">ĐVT</th>
    <th style="width:100px;text-align:right">Đơn giá</th>
    <th style="width:120px;text-align:right">Thành tiền</th>
  </tr></thead>
  <tbody>${itemRows || '<tr><td colspan="6" style="text-align:center;color:#a0aec0">Không có sản phẩm</td></tr>'}</tbody>
</table>

<table class="summary-table">
  ${discountAmount > 0 ? `
  <tr><td class="label">Tạm tính:</td><td class="value">${formatVnd(subtotalBeforeDiscount)}₫</td></tr>
  <tr><td class="label">Chiết khấu${quote.discount_type === 'percent' ? ` (${quote.discount_value}%)` : ''}:</td><td class="value" style="color:#e53e3e">-${formatVnd(discountAmount)}₫</td></tr>
  ` : ''}
  <tr><td class="label">Cộng tiền hàng:</td><td class="value">${formatVnd(total)}₫</td></tr>
  ${vatRate > 0 ? `<tr><td class="label">Thuế GTGT (${vatRate}%):</td><td class="value">${formatVnd(vatAmount)}₫</td></tr>` : ''}
  ${shippingFee > 0 ? `<tr><td class="label">Phí giao hàng:</td><td class="value">${formatVnd(shippingFee)}₫</td></tr>` : ''}
  <tr style="border-top:2px solid #2b6cb0"><td class="label" style="font-size:15px"><strong>TỔNG THANH TOÁN:</strong></td><td class="value grand">${formatVnd(grandTotal)}₫</td></tr>
</table>

<div class="terms">
  <h4>Điều khoản</h4>
  <p>💳 <strong>Thanh toán:</strong> ${paymentTerms}</p>
  <p>🚚 <strong>Giao hàng:</strong> ${deliveryTerms}</p>
  ${companyBank ? `<p>🏦 <strong>Ngân hàng:</strong> ${companyBank}${companyBankName ? ' — ' + companyBankName : ''}</p>` : ''}
  ${quote.customer_note ? `<p>📝 <strong>Ghi chú:</strong> ${quote.customer_note}</p>` : ''}
</div>

<div class="signature">
  <div><div class="title">KHÁCH HÀNG</div><div>(Ký, ghi rõ họ tên)</div></div>
  <div><div class="title">NGƯỜI LẬP BÁO GIÁ</div><div>(Ký, ghi rõ họ tên)</div></div>
</div>

<div class="validity">Báo giá này có hiệu lực ${quote.validity_days || 7} ngày kể từ ngày lập.</div>

</body></html>`;
    }
}
