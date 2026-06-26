import { Controller, Get, Post, Body, Logger, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SystemSetting } from '../../../entities/system-setting.entity';
import { SiteSetting, PricingConfig } from '../../../entities';

@Controller('erp')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
    private readonly logger = new Logger(SettingsController.name);

    constructor(
        @InjectRepository(SystemSetting)
        private readonly settingsRepo: Repository<SystemSetting>,
        @InjectRepository(SiteSetting)
        private readonly siteRepo: Repository<SiteSetting>,
        @InjectRepository(PricingConfig)
        private readonly configRepo: Repository<PricingConfig>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    // ═══════════════════════════════════════════
    //  Company Info — GET / POST
    // ═══════════════════════════════════════════

    @Get('company-info')
    async getCompanyInfo() {
        try {
            const siteRows = await this.siteRepo.find();
            const site: Record<string, string> = {};
            for (const r of siteRows) site[r.key] = r.value;

            // Get VAT from pricing_config
            const vatRow = await this.dataSource.query(
                "SELECT config_value FROM pricing_config WHERE config_key = 'vat_rate'"
            ).catch(() => []);
            const vatRate = vatRow.length > 0 ? parseFloat(vatRow[0].config_value) : 0;

            // Parse bank_accounts JSON
            let bankAccounts: { bank_name: string; account_number: string; account_name: string }[] = [];
            try { bankAccounts = JSON.parse(site['bank_accounts'] || '[]'); } catch { /* empty */ }

            return {
                success: true,
                data: {
                    company_name: site['company_name'] || '',
                    company_description: site['company_description'] || '',
                    hotline: site['company_phone'] || '',
                    email: site['company_email'] || '',
                    address: site['company_address'] || '',
                    tax_code: site['company_tax_code'] || '',
                    working_hours: site['working_hours'] || '',
                    website: site['website'] || '',
                    zalo: site['zalo'] || '',
                    facebook: site['facebook'] || '',
                    bank_accounts: bankAccounts,
                    payment_terms: site['payment_terms'] || '',
                    delivery_terms: site['delivery_terms'] || '',
                    vat_rate: vatRate,
                },
            };
        } catch (error) {
            this.logger.error('Failed to get company info', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    @Post('company-info')
    async updateCompanyInfo(@Body() data: Record<string, unknown>) {
        try {
            const mapping: Record<string, string> = {
                company_name: 'company_name',
                company_description: 'company_description',
                hotline: 'company_phone',
                email: 'company_email',
                address: 'company_address',
                tax_code: 'company_tax_code',
                working_hours: 'working_hours',
                website: 'website',
                zalo: 'zalo',
                facebook: 'facebook',
                payment_terms: 'payment_terms',
                delivery_terms: 'delivery_terms',
            };

            for (const [inputKey, dbKey] of Object.entries(mapping)) {
                if (data[inputKey] !== undefined) {
                    let setting = await this.siteRepo.findOne({ where: { key: dbKey } });
                    if (!setting) setting = this.siteRepo.create({ key: dbKey });
                    setting.value = String(data[inputKey]);
                    await this.siteRepo.save(setting);
                }
            }

            // Bank accounts as JSON
            if (data.bank_accounts !== undefined) {
                let setting = await this.siteRepo.findOne({ where: { key: 'bank_accounts' } });
                if (!setting) setting = this.siteRepo.create({ key: 'bank_accounts' });
                setting.value = JSON.stringify(data.bank_accounts);
                await this.siteRepo.save(setting);
            }

            // VAT rate → pricing_config
            if (data.vat_rate !== undefined) {
                const vatValue = String(data.vat_rate);
                const existing = await this.dataSource.query(
                    "SELECT id FROM pricing_config WHERE config_key = 'vat_rate'"
                ).catch(() => []);

                if (existing.length > 0) {
                    await this.dataSource.query(
                        "UPDATE pricing_config SET config_value = $2 WHERE config_key = 'vat_rate'",
                        [vatValue],
                    );
                } else {
                    await this.dataSource.query(
                        "INSERT INTO pricing_config (config_key, config_value, description) VALUES ('vat_rate', ?, 'Thuế GTGT (%)')",
                        [vatValue],
                    );
                }
            }

            return { success: true, message: 'Đã lưu thông tin công ty' };
        } catch (error) {
            this.logger.error('Failed to save company info', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    // ═══════════════════════════════════════════
    //  Lợi nhuận & Làm tròn (In Nhanh) — GET / POST
    //  Quản lý markup/margin của báo giá in nhanh (digital). Trước đây chỉ có
    //  trong pricing_config mặc định code (50%), KHÔNG sửa được qua UI → nhà in
    //  không tự đặt được % lợi nhuận. Lưu vào pricing_config (key không tiền tố).
    // ═══════════════════════════════════════════

    private async readConfigNumber(key: string, fallback: string): Promise<string> {
        const row = await this.configRepo.findOne({ where: { configKey: key } });
        return row?.configValue ?? fallback;
    }

    private async upsertConfig(key: string, value: string, description: string): Promise<void> {
        let row = await this.configRepo.findOne({ where: { configKey: key } });
        if (!row) row = this.configRepo.create({ configKey: key, description });
        row.configValue = value;
        await this.configRepo.save(row);
    }

    @Get('pricing-markup')
    async getPricingMarkup() {
        try {
            return {
                success: true,
                data: {
                    pricing_method: await this.readConfigNumber('pricing_method', 'markup'),
                    default_markup: parseFloat(await this.readConfigNumber('default_markup', '50')),
                    min_margin: parseFloat(await this.readConfigNumber('min_margin', '20')),
                    price_rounding: parseInt(await this.readConfigNumber('price_rounding', '100'), 10),
                },
            };
        } catch (error) {
            this.logger.error('Failed to get pricing markup', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    @Post('pricing-markup')
    async updatePricingMarkup(@Body() data: Record<string, unknown>) {
        try {
            if (data.pricing_method !== undefined) {
                const method = String(data.pricing_method) === 'margin' ? 'margin' : 'markup';
                await this.upsertConfig('pricing_method', method, 'Phương pháp tính giá bán (markup/margin)');
            }
            if (data.default_markup !== undefined) {
                await this.upsertConfig('default_markup', String(Number(data.default_markup) || 0), 'Markup/Margin mặc định (%)');
            }
            if (data.min_margin !== undefined) {
                await this.upsertConfig('min_margin', String(Number(data.min_margin) || 0), 'Biên lợi nhuận tối thiểu (%)');
            }
            if (data.price_rounding !== undefined) {
                await this.upsertConfig('price_rounding', String(Number(data.price_rounding) || 0), 'Làm tròn giá bán (đồng)');
            }
            return { success: true, message: 'Đã lưu cấu hình lợi nhuận' };
        } catch (error) {
            this.logger.error('Failed to save pricing markup', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    // ═══════════════════════════════════════════
    //  Waste Config — GET / POST
    // ═══════════════════════════════════════════

    @Get('waste-config')
    async getWasteConfig() {
        try {
            // NGUỒN SỰ THẬT = pricing_config (engine getPricingConfig đọc tại đây).
            // Fallback giá trị cũ còn kẹt ở system_settings (split-brain trước đây) để không mất dữ liệu.
            const WASTE_KEYS = [
                'waste_digital_percent', 'waste_offset_percent', 'waste_lamination_percent',
                'waste_die_cut_percent', 'waste_binding_percent', 'waste_foiling_percent', 'waste_include_in_quote',
            ];
            const cfgRows = await this.configRepo.find();
            const cfg: Record<string, string> = {};
            for (const r of cfgRows) cfg[r.configKey] = r.configValue;
            const legacyRows = await this.settingsRepo.find({ where: WASTE_KEYS.map((key) => ({ key })) });
            const map: Record<string, string> = {};
            for (const s of legacyRows) map[s.key] = s.value;
            // pricing_config ưu tiên hơn system_settings cũ.
            for (const k of WASTE_KEYS) if (cfg[k] !== undefined) map[k] = cfg[k];

            // Bản đồ loại bù hao theo mã gia công (pricing_config — nơi engine đọc).
            let wasteCategoryMap: Record<string, string> = {};
            const wcmRow = await this.configRepo.findOne({ where: { configKey: 'waste_category_map' } });
            if (wcmRow?.configValue) {
                try { wasteCategoryMap = JSON.parse(wcmRow.configValue); } catch { /* ignore */ }
            }

            return {
                success: true,
                data: {
                    digital_waste_pct: parseFloat(map['waste_digital_percent']) || 3,
                    offset_waste_pct: parseFloat(map['waste_offset_percent']) || 5,
                    lamination_waste_pct: parseFloat(map['waste_lamination_percent']) || 2,
                    die_cut_waste_pct: parseFloat(map['waste_die_cut_percent']) || 1,
                    binding_waste_pct: parseFloat(map['waste_binding_percent']) || 3,
                    foiling_waste_pct: parseFloat(map['waste_foiling_percent']) || 2,
                    enabled: map['waste_include_in_quote'] === '1',
                    waste_category_map: wasteCategoryMap,
                }
            };
        } catch (error) {
            this.logger.error('Failed to get waste config', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    @Post('waste-config')
    async updateWasteConfig(@Body() config: { [key: string]: unknown }) {
        try {
            // Ghi vào pricing_config — bảng engine đọc (sửa split-brain: trước đây ghi system_settings nên không tác động giá).
            const pairs: [string, string][] = [
                ['waste_digital_percent', String(config.digital_waste_pct ?? 0)],
                ['waste_offset_percent', String(config.offset_waste_pct ?? 0)],
                ['waste_lamination_percent', String(config.lamination_waste_pct ?? 0)],
                ['waste_die_cut_percent', String(config.die_cut_waste_pct ?? 0)],
                ['waste_binding_percent', String(config.binding_waste_pct ?? 0)],
                ['waste_foiling_percent', String(config.foiling_waste_pct ?? 0)],
                ['waste_include_in_quote', config.enabled ? '1' : '0'],
            ];
            for (const [key, value] of pairs) {
                await this.upsertConfig(key, value, 'Tỷ lệ bù hao (%) / cờ bật bù hao');
            }

            // Bản đồ loại bù hao theo mã gia công → pricing_config (engine đọc tại đây).
            if (config.waste_category_map !== undefined && config.waste_category_map !== null) {
                const json = JSON.stringify(config.waste_category_map);
                await this.upsertConfig('waste_category_map', json, 'Map mã gia công → loại bù hao (lamination/die_cut/binding)');
            }

            return { success: true, message: 'Settings saved' };
        } catch (error) {
            this.logger.error('Failed to save waste config', error);
            return { success: false, error: 'Internal server error' };
        }
    }
}

