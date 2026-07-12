import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SiteSetting, SystemSetting, PricingConfig, SetupFee } from '../../../entities';

@Injectable()
export class SystemSettingsService {
    constructor(
        @InjectRepository(SiteSetting) private siteRepo: Repository<SiteSetting>,
        @InjectRepository(SystemSetting) private sysRepo: Repository<SystemSetting>,
        @InjectRepository(PricingConfig) private configRepo: Repository<PricingConfig>,
        @InjectRepository(SetupFee) private feeRepo: Repository<SetupFee>,
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
}
