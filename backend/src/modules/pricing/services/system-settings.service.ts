import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SiteSetting, SystemSetting, PricingConfig, SetupFee, ProductionCost } from '../../../entities';

@Injectable()
export class SystemSettingsService {
    constructor(
        @InjectRepository(SiteSetting) private siteRepo: Repository<SiteSetting>,
        @InjectRepository(SystemSetting) private sysRepo: Repository<SystemSetting>,
        @InjectRepository(PricingConfig) private configRepo: Repository<PricingConfig>,
        @InjectRepository(SetupFee) private feeRepo: Repository<SetupFee>,
        @InjectRepository(ProductionCost) private costRepo: Repository<ProductionCost>,
        @InjectDataSource() private dataSource: DataSource,
    ) { }

    // ═════════════════════════════════════════
    //  System Settings
    // ═════════════════════════════════════════

    async findAllSettings() {
        return { site: await this.siteRepo.find(), system: await this.sysRepo.find() };
    }

    async updateSettings(body: { site: Record<string, string>; system: Record<string, string> }) {
        if (body.site) {
            for (const [key, value] of Object.entries(body.site)) {
                let setting = await this.siteRepo.findOne({ where: { key } });
                if (!setting) setting = this.siteRepo.create({ key });
                setting.value = String(value);
                await this.siteRepo.save(setting);
            }
        }
        if (body.system) {
            for (const [key, value] of Object.entries(body.system)) {
                let setting = await this.sysRepo.findOne({ where: { key } });
                if (!setting) setting = this.sysRepo.create({ key });
                setting.value = String(value);
                await this.sysRepo.save(setting);
            }
        }
    }

    // ═════════════════════════════════════════
    //  Pricing Config
    // ═════════════════════════════════════════

    async findAllConfigs() { return this.configRepo.find({ order: { id: 'ASC' } }); }
    async updateConfig(id: string, data: Partial<PricingConfig>) {
        await this.configRepo.update(parseInt(id), data);
        return this.configRepo.findOne({ where: { id: parseInt(id) } });
    }

    // ═════════════════════════════════════════
    //  Setup Fees — CRUD + filters + calculate
    // ═════════════════════════════════════════

    async findAllFees(filters: { type?: string; category?: string; active?: string; grouped?: string } = {}) {
        let sql = `
            SELECT sf.*, ps.name as paper_size_name
            FROM setup_fees sf
            LEFT JOIN paper_sizes ps ON sf.paper_size_id = ps.id
            WHERE 1=1
        `;
        const params: (string | number)[] = [];

        if (filters.type) { params.push(filters.type); sql += ` AND sf.fee_type = $${params.length}`; }
        if (filters.category) { params.push(filters.category); sql += ` AND (sf.category = $${params.length} OR sf.category = 'all')`; }
        if (filters.active !== undefined) { params.push(filters.active === 'true' ? 1 : 0); sql += ` AND sf.is_active = $${params.length}`; }

        sql += ' ORDER BY sf.fee_type, sf.name';
        const fees = await this.dataSource.query(sql, params);

        if (filters.grouped === 'true') {
            const grouped: Record<string, Record<string, unknown>[]> = {};
            for (const f of fees) {
                if (!grouped[f.fee_type]) grouped[f.fee_type] = [];
                grouped[f.fee_type].push(f);
            }
            return grouped;
        }
        return fees;
    }

    async findFeeById(id: string) {
        const [fee] = await this.dataSource.query(`
            SELECT sf.*, ps.name as paper_size_name
            FROM setup_fees sf LEFT JOIN paper_sizes ps ON sf.paper_size_id = ps.id
            WHERE sf.id = $1
        `, [id]);
        return fee || null;
    }

    async createFee(data: { code: string; name: string; fee_type: string; category?: string; price_per_unit?: number | string; price_per_side?: number | string; price_fixed?: number | string; paper_size_id?: number | null; min_sheets?: number | string; description?: string; is_active?: boolean | number }) {
        if (!data.code || !data.name || !data.fee_type) throw new Error('Code, Name và Fee Type là bắt buộc');

        const validTypes = ['ctp', 'plate', 'die_mold', 'setup_machine', 'design', 'other'];
        if (!validTypes.includes(data.fee_type)) throw new Error('Fee type không hợp lệ');

        // Check duplicate code
        const [dup] = await this.dataSource.query('SELECT id FROM setup_fees WHERE code = $1', [data.code.toUpperCase()]);
        if (dup) throw new Error('Mã phí đã tồn tại');

        await this.dataSource.query(`
            INSERT INTO setup_fees (code, name, fee_type, category, price_per_unit, price_per_side, price_fixed, paper_size_id, min_sheets, description, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            data.code.toUpperCase(), data.name, data.fee_type,
            data.category || 'all',
            parseFloat(String(data.price_per_unit || 0)), parseFloat(String(data.price_per_side || 0)),
            parseFloat(String(data.price_fixed || 0)),
            data.paper_size_id || null, parseInt(String(data.min_sheets || 0)),
            data.description || '', data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
        ]);

        const [{ id }] = await this.dataSource.query(`SELECT currval(pg_get_serial_sequence('setup_fees', 'id')) as id`);
        return this.findFeeById(String(id));
    }

    async updateFee(id: string, data: Partial<{ code: string; name: string; fee_type: string; category: string; price_per_unit: number | string; price_per_side: number | string; price_fixed: number | string; paper_size_id: number | null; min_sheets: number | string; description: string; is_active: boolean | number }>) {
        const [existing] = await this.dataSource.query('SELECT * FROM setup_fees WHERE id = $1', [id]);
        if (!existing) throw new Error('Không tìm thấy phí setup');

        // Check duplicate code
        if (data.code && data.code.toUpperCase() !== existing.code) {
            const [dup] = await this.dataSource.query('SELECT id FROM setup_fees WHERE code = $2 AND id != $3', [data.code.toUpperCase(), id]);
            if (dup) throw new Error('Mã phí đã tồn tại');
        }

        await this.dataSource.query(`
            UPDATE setup_fees SET code=$4, name=$5, fee_type=$6, category=$7,
            price_per_unit=$8, price_per_side=$9, price_fixed=$10, paper_size_id=$11,
            min_sheets=$12, description=$13, is_active=$14 WHERE id = $15
        `, [
            (data.code || existing.code).toUpperCase(),
            data.name ?? existing.name, data.fee_type ?? existing.fee_type,
            data.category ?? existing.category,
            parseFloat(data.price_per_unit ?? existing.price_per_unit),
            parseFloat(data.price_per_side ?? existing.price_per_side),
            parseFloat(data.price_fixed ?? existing.price_fixed),
            data.paper_size_id !== undefined ? (data.paper_size_id || null) : existing.paper_size_id,
            parseInt(data.min_sheets ?? existing.min_sheets),
            data.description ?? existing.description,
            data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active, id,
        ]);
        return this.findFeeById(id);
    }

    async deleteFee(id: string) { await this.dataSource.query('DELETE FROM setup_fees WHERE id = $1', [id]); }

    /**
     * Calculate setup fees for a quote (matches PHP calculateSetupFees)
     */
    async calculateSetupFees(params: {
        print_method?: string; sheets?: number; sides?: number;
        paper_size_id?: string; has_die_cut?: boolean; has_design?: string;
        is_new_die_mold?: boolean;
    }) {
        const printMethod = params.print_method || 'digital';
        const sheets = params.sheets || 0;
        const sides = params.sides || 1;
        const paperSizeId = params.paper_size_id || null;
        const hasDieCut = params.has_die_cut || false;
        const hasDesign = params.has_design || null;
        const isNewDieMold = params.is_new_die_mold !== false;

        const fees: { id?: number; name: string; type?: string; cost: number; amount?: number; detail?: string }[] = [];
        let total = 0;

        // 1. CTP/Plate fees for offset
        if (printMethod === 'offset') {
            const [ctp] = await this.dataSource.query(`
                SELECT * FROM setup_fees WHERE fee_type = 'ctp'
                AND (paper_size_id = $1 OR paper_size_id IS NULL)
                AND (category = 'offset' OR category = 'all')
                AND is_active = true AND (min_sheets = 0 OR min_sheets > $2)
                ORDER BY paper_size_id DESC LIMIT 1
            `, [paperSizeId, sheets]).catch(() => [null]);

            if (ctp && sheets < ctp.min_sheets) {
                const ctpCost = sides * parseFloat(ctp.price_per_side);
                if (ctpCost > 0) {
                    fees.push({ id: ctp.id, name: ctp.name, type: 'ctp', cost: ctpCost, detail: `${sides} mặt × ${Math.round(ctp.price_per_side)}đ` });
                    total += ctpCost;
                }
            }
        }

        // 2. Setup machine fee
        const [setup] = await this.dataSource.query(`
            SELECT * FROM setup_fees WHERE fee_type = 'setup_machine'
            AND (category = $1 OR category = 'all') AND is_active = true
            ORDER BY category DESC LIMIT 1
        `, [printMethod]).catch(() => [null]);

        if (setup && sheets < setup.min_sheets) {
            const setupCost = parseFloat(setup.price_fixed);
            if (setupCost > 0) {
                fees.push({ id: setup.id, name: setup.name, type: 'setup_machine', cost: setupCost, detail: 'Phí cố định' });
                total += setupCost;
            }
        }

        // 3. Die mold fee
        if (hasDieCut && isNewDieMold) {
            const [dieMold] = await this.dataSource.query(`
                SELECT * FROM setup_fees WHERE fee_type = 'die_mold' AND is_active = true ORDER BY price_fixed ASC LIMIT 1
            `).catch(() => [null]);
            if (dieMold) {
                const dieCharge = parseFloat(dieMold.price_fixed);
                fees.push({ id: dieMold.id, name: dieMold.name, type: 'die_mold', cost: dieCharge, detail: 'Khuôn bế mới' });
                total += dieCharge;
            }
        }

        // 4. Design fee
        if (hasDesign) {
            const [design] = await this.dataSource.query(`
                SELECT * FROM setup_fees WHERE fee_type = 'design' AND code = $1 AND is_active = true
            `, [hasDesign]).catch(() => [null]);
            if (design) {
                const designCost = parseFloat(design.price_fixed);
                fees.push({ id: design.id, name: design.name, type: 'design', cost: designCost, detail: 'Phí thiết kế' });
                total += designCost;
            }
        }

        return {
            fees, total,
            breakdown: fees.map(f => `${f.name}: ${Math.round(f.cost)}đ`),
        };
    }

    // ═════════════════════════════════════════
    //  Production Costs — CRUD + calculate + generate tiers
    // ═════════════════════════════════════════

    async findAllCosts() {
        const [data] = await this.dataSource.query('SELECT * FROM production_costs WHERE is_active = true ORDER BY id DESC LIMIT 1');
        if (!data) {
            return {
                machine_name: 'Máy in chính', machine_value: 500000000, machine_depreciation_years: 5,
                sheets_per_month: 100000, electricity_per_hour: 50000, sheets_per_hour: 2000,
                production_staff_count: 3, avg_salary_monthly: 12000000,
                rent_monthly: 20000000, utilities_monthly: 5000000, other_monthly: 5000000,
                default_markup_percent: 30,
            };
        }
        return data;
    }

    async saveCosts(data: Record<string, string | number>) {
        if (!data.sheets_per_month || !data.default_markup_percent) {
            throw new Error('sheets_per_month và default_markup_percent là bắt buộc');
        }

        const [existing] = await this.dataSource.query('SELECT id FROM production_costs WHERE is_active = true LIMIT 1');
        const fields = {
            machine_name: data.machine_name || 'Máy in chính',
            machine_value: data.machine_value || 0,
            machine_depreciation_years: data.machine_depreciation_years || 5,
            sheets_per_month: data.sheets_per_month,
            electricity_per_hour: data.electricity_per_hour || 0,
            sheets_per_hour: data.sheets_per_hour || 1000,
            production_staff_count: data.production_staff_count || 0,
            avg_salary_monthly: data.avg_salary_monthly || 0,
            rent_monthly: data.rent_monthly || 0,
            utilities_monthly: data.utilities_monthly || 0,
            other_monthly: data.other_monthly || 0,
            default_markup_percent: data.default_markup_percent,
        };

        if (existing) {
            const keys = Object.keys(fields);
            const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
            await this.dataSource.query(
                `UPDATE production_costs SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1}`,
                [...Object.values(fields), existing.id],
            );
        } else {
            const keys = Object.keys(fields);
            const cols = keys.join(', ');
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
            await this.dataSource.query(`INSERT INTO production_costs (${cols}) VALUES (${placeholders})`, Object.values(fields));
        }
    }

    async updateCost(id: string, data: Partial<ProductionCost>) {
        await this.costRepo.update(parseInt(id), data);
        return this.costRepo.findOne({ where: { id: parseInt(id) } });
    }

    // ─── Ink Costs ───

    async findAllInkCosts() {
        return this.dataSource.query('SELECT * FROM ink_costs WHERE is_active = true ORDER BY print_type').catch(() => []);
    }

    async saveInkCosts(items: { print_type: string; print_type_name: string; ml_per_sheet: number | string; price_per_ml: number | string; description: string }[]) {
        for (const item of items) {
            await this.dataSource.query(`
                INSERT INTO ink_costs (print_type, print_type_name, ml_per_sheet, price_per_ml, description)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT(print_type) DO UPDATE SET print_type_name = excluded.print_type_name,
                ml_per_sheet = excluded.ml_per_sheet, price_per_ml = excluded.price_per_ml,
                description = excluded.description, updated_at = NOW()
            `, [item.print_type, item.print_type_name || item.print_type, item.ml_per_sheet || 0.5, item.price_per_ml || 500, item.description || '']);
        }
    }

    // ─── Calculate Cost Per Sheet ───

    async calculateCostPerSheet(params: {
        material_id?: string; paper_size?: string; print_type?: string;
        sides?: number; quantity?: number;
    }) {
        const paperSize = params.paper_size || 'A3';
        const printType = params.print_type || '4c';
        const sides = params.sides || 1;
        const quantity = params.quantity || 1000;

        const config = await this.findAllCosts();
        if (!config.sheets_per_month) throw new Error('Chưa cấu hình chi phí sản xuất');

        // Ink cost
        const [inkConfig] = await this.dataSource.query('SELECT * FROM ink_costs WHERE print_type = $1 LIMIT 1', [printType]).catch(() => [null]);

        // Size factor
        const sizeFactors: Record<string, number> = { A3: 1, A4: 0.5, A5: 0.25, A6: 0.125, B3: 1.1, B4: 0.55, B5: 0.275 };
        const sizeFactor = sizeFactors[paperSize] ?? 1;

        // Material cost
        let materialCostPerSheet = 800 * sizeFactor;
        if (params.material_id) {
            const [mat] = await this.dataSource.query('SELECT cost_price, gsm FROM materials WHERE id = $1', [params.material_id]).catch(() => [null]);
            if (mat) {
                const gsm = mat.gsm || 150;
                const a3Area = 0.125;
                const sheetsPerKg = 1000 / (gsm * a3Area);
                const costPerKg = mat.cost_price || 50000;
                materialCostPerSheet = (costPerKg / sheetsPerKg) * sizeFactor;
            }
        }

        const inkCostPerSheet = inkConfig ? (inkConfig.ml_per_sheet * inkConfig.price_per_ml * sizeFactor * sides) : 0;
        const monthlyDepreciation = config.machine_value / (config.machine_depreciation_years * 12);
        const electricityCost = config.electricity_per_hour / Math.max(1, config.sheets_per_hour);
        let machineCostPerSheet = (monthlyDepreciation / Math.max(1, config.sheets_per_month)) + electricityCost;
        let laborCostPerSheet = (config.production_staff_count * config.avg_salary_monthly) / Math.max(1, config.sheets_per_month);
        const overheadCostPerSheet = (config.rent_monthly + config.utilities_monthly + config.other_monthly) / Math.max(1, config.sheets_per_month);

        if (sides === 2) { machineCostPerSheet *= 1.5; laborCostPerSheet *= 1.3; }

        const totalCost = materialCostPerSheet + inkCostPerSheet + machineCostPerSheet + laborCostPerSheet + overheadCostPerSheet;
        const markup = config.default_markup_percent / 100;
        const sellingPrice = Math.ceil(totalCost * (1 + markup) / 50) * 50;

        return {
            paper_size: paperSize, print_type: printType, sides, quantity,
            breakdown: {
                material: Math.round(materialCostPerSheet), ink: Math.round(inkCostPerSheet),
                machine: Math.round(machineCostPerSheet), labor: Math.round(laborCostPerSheet),
                overhead: Math.round(overheadCostPerSheet),
            },
            total_cost: Math.round(totalCost), markup_percent: config.default_markup_percent,
            selling_price: sellingPrice,
            total_order_cost: Math.round(totalCost * quantity),
            total_order_price: Math.round(sellingPrice * quantity),
            profit_per_sheet: Math.round(sellingPrice - totalCost),
            profit_total: Math.round((sellingPrice - totalCost) * quantity),
        };
    }

    // ─── Generate Pricing Tiers (bulk) ───

    async generatePricingTiers(data: Record<string, unknown>) {
        const materials = (data.materials || []) as number[];
        const print_types = (data.print_types || []) as string[];
        const sides = (data.sides || []) as number[];
        const quantity_tiers = (data.quantity_tiers || []) as { quantity_from: number | string; quantity_to: number | string; discount_percent: number | string }[];
        const markup_percent = data.markup_percent as number | string || 0;
        const overwrite = !!data.overwrite;
        let materialIds: number[] = materials;
        const printTypes: string[] = print_types.length ? print_types : ['4c', '1c'];
        const sidesArr: number[] = sides.length ? sides : [1, 2];
        const quantityTiers = quantity_tiers.length ? quantity_tiers : [{ quantity_from: 1, quantity_to: 999999, discount_percent: 0 }];
        const markupPercent = parseFloat(String(markup_percent || 30));

        const config = await this.findAllCosts();
        if (!config.sheets_per_month) throw new Error('Chưa cấu hình chi phí sản xuất');

        if (materialIds.length === 0) {
            const rows = await this.dataSource.query("SELECT id FROM materials WHERE category = 'printing'").catch(() => []);
            materialIds = rows.map((r: { id: number }) => r.id);
        }

        if (materialIds.length === 0) return { generated: 0, errors: ['No materials found'] };

        const placeholders = materialIds.map((_, i) => `$${i + 1}`).join(',');
        const mats = await this.dataSource.query(
            `SELECT m.*, ps.name as paper_size_name FROM materials m LEFT JOIN paper_sizes ps ON m.paper_size_id = ps.id WHERE m.id IN (${placeholders})`,
            materialIds,
        );

        const sizeFactors: Record<string, number> = { A3: 1, A4: 0.5, A5: 0.25, A6: 0.125, B3: 1.1, B4: 0.55 };
        let generated = 0;
        const errors: string[] = [];

        for (const material of mats) {
            const pSize = material.paper_size_name || 'A3';
            const materialCost = parseFloat(material.cost_price) || 800;
            const sizeFactor = sizeFactors[pSize] ?? 1;

            for (const printType of printTypes) {
                const [inkConfig] = await this.dataSource.query('SELECT * FROM ink_costs WHERE print_type = $1 LIMIT 1', [printType]).catch(() => [null]);

                for (const side of sidesArr) {
                    const inkCost = inkConfig ? (inkConfig.ml_per_sheet * inkConfig.price_per_ml * sizeFactor * side) : 0;
                    let machineCost = (config.machine_value / (config.machine_depreciation_years * 12) / Math.max(1, config.sheets_per_month))
                        + (config.electricity_per_hour / Math.max(1, config.sheets_per_hour));
                    let laborCost = (config.production_staff_count * config.avg_salary_monthly) / Math.max(1, config.sheets_per_month);
                    const overheadCost = (config.rent_monthly + config.utilities_monthly + config.other_monthly) / Math.max(1, config.sheets_per_month);

                    if (side === 2) { machineCost *= 1.5; laborCost *= 1.3; }

                    const baseCost = materialCost + inkCost + machineCost + laborCost + overheadCost;
                    const basePrice = baseCost * (1 + markupPercent / 100);

                    for (const tier of quantityTiers) {
                        const qFrom = parseInt(String(tier.quantity_from || 1));
                        const qTo = parseInt(String(tier.quantity_to || 999999));
                        const discount = parseFloat(String(tier.discount_percent || 0));
                        const finalPrice = Math.ceil(basePrice * (1 - discount / 100) / 50) * 50;

                        const tierName = `${material.name} / ${side} mặt / ${printType === '4c' ? '4 màu' : '1 màu'} / SL ${qFrom}-${qTo}`;

                        try {
                            const sql = overwrite
                                ? `INSERT INTO pricing_tiers (material_id, name, paper_size, print_side, print_type, quantity_from, quantity_to, min_qty, max_qty, price_per_sheet)
                                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT(material_id, paper_size, print_side, print_type, quantity_from) DO UPDATE SET price_per_sheet = excluded.price_per_sheet, updated_at = NOW()`
                                : `INSERT INTO pricing_tiers (material_id, name, paper_size, print_side, print_type, quantity_from, quantity_to, min_qty, max_qty, price_per_sheet)
                                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`;

                            const result = await this.dataSource.query(sql, [material.id, tierName, pSize, side, printType, qFrom, qTo, qFrom, qTo, finalPrice]);
                            if (result.affectedRows > 0) generated++;
                        } catch (e: unknown) {
                            errors.push(`Error for ${material.name}: ${e instanceof Error ? e.message : String(e)}`);
                        }
                    }
                }
            }
        }

        return { generated, errors };
    }
}
