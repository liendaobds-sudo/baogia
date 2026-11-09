/**
 * Pricing Service — Core Pricing Calculations
 *
 * 1:1 port of PricingPrint-backend/includes/pricing_helper.php
 * All pure functions produce IDENTICAL results to PHP (verified by contract tests).
 *
 * DB-dependent functions use TypeORM repositories instead of PDO.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, MoreThanOrEqual } from 'typeorm';
import { PricingTier, Material, PaperSize, PrintType, Unit, Product, ProductCategory } from '../../entities';
import { BoundCalculatorService } from './services/bound-calculator.service';
import { weightedAvgCost } from './lib/cost-helpers';

// ─── Types ─────────────────────────────────────

export interface GridLayoutResult {
    itemsPerSheet: number;
    efficiency: number;
}

export interface WasteConfig {
    wasteIncludeInQuote: boolean;
    wasteDigitalPercent: number;
    wasteOffsetPercent: number;
    wasteLaminationPercent: number;
    wasteDieCutPercent: number;
    wasteBindingPercent: number;
    wasteMinimumSheets: number;
}

export interface PricingConfig {
    pricingMethod: 'markup' | 'margin';
    defaultMarkup: number;
    minMargin: number;
    priceRounding: number;
    autoUpdateSelling: boolean;
    [key: string]: unknown;
}

export interface ProcessingCostResult {
    name: string;
    cost: number;
    priceType: string;
}

@Injectable()
export class PricingService {
    private readonly logger = new Logger(PricingService.name);

    constructor(
        @InjectRepository(PricingTier) private tierRepo: Repository<PricingTier>,
        @InjectRepository(Material) private materialRepo: Repository<Material>,
    ) { }

    /**
     * Load pricing config from DB (pricing_config table).
     * Port of: pricing_helper.php → getPricingConfig()
     */
    async getPricingConfig(): Promise<Record<string, string>> {
        const defaults: Record<string, string> = {
            pricing_method: 'markup',
            default_markup: '50',
            min_margin: '20',
            price_rounding: '100',
            auto_update_selling: '1',
            waste_include_in_quote: '1',
            waste_offset_percent: '3',
            waste_digital_percent: '1',
            waste_lamination_percent: '1',
            waste_die_cut_percent: '2',
            waste_binding_percent: '2',
            waste_minimum_sheets: '10',
            // Trần hao theo % lượt chạy (thay số cứng 0.1) + fallback markup/margin — cấu hình được.
            waste_max_percent_of_run: '10',
            margin_clamp_percent: '50',
            // Đóng cuốn: số trang/tờ + số trang bìa (thay số cứng 4/2).
            pages_per_sheet_saddle: '4',
            pages_per_sheet_flat: '2',
            bound_cover_pages: '4',
            // Khổ lớn: % hao chiều dài mặc định + trần kiểm tra đầu vào.
            large_format_default_waste_percent: '10',
            large_format_max_width_m: '50',
            large_format_max_height_m: '100',
            large_format_max_qty: '10000',
        };
        try {
            const rows = await this.tierRepo.manager.query(
                'SELECT config_key, config_value FROM pricing_config',
            );
            const config: Record<string, string> = {};
            for (const row of rows) {
                config[row.config_key] = row.config_value;
            }
            return { ...defaults, ...config };
        } catch {
            return { ...defaults };
        }
    }

    // ═══════════════════════════════════════════════
    // 1. PURE FUNCTIONS — No DB dependency
    //    Identical to PHP, covered by contract tests
    // ═══════════════════════════════════════════════

    /**
     * Calculate grid layout — how many items fit on a sheet.
     * Port of: pricing_helper.php → calculateGridLayout()
     */
    /**
     * Count items in a pure grid (single orientation).
     */
    private _gridCount(areaW: number, areaH: number, iW: number, iH: number, gapH: number, gapV: number): { cols: number; rows: number; count: number; usedW: number; usedH: number } {
        const cols = Math.floor((areaW + gapH) / (iW + gapH));
        const rows = Math.floor((areaH + gapV) / (iH + gapV));
        const count = cols > 0 && rows > 0 ? cols * rows : 0;
        const usedW = cols > 0 ? cols * iW + (cols - 1) * gapH : 0;
        const usedH = rows > 0 ? rows * iH + (rows - 1) * gapV : 0;
        return { cols, rows, count, usedW, usedH };
    }

    /**
     * Mixed layout: fill the main area with one orientation, then fill
     * the remaining strip (right or bottom) with the opposite orientation.
     * Matches frontend layout-engine.ts calculateMixedStrategy().
     */
    private _mixedCount(areaW: number, areaH: number, mainW: number, mainH: number, gapH: number, gapV: number, origW: number, origH: number): number {
        const main = this._gridCount(areaW, areaH, mainW, mainH, gapH, gapV);
        if (main.count <= 0) return 0;

        const remW = areaW - main.usedW - gapH;
        const remH = areaH - main.usedH - gapV;

        // Try filling the right strip
        let sideCount = 0;
        if (remW > 0) {
            const sn = this._gridCount(remW, areaH, origW, origH, gapH, gapV);
            const sr = this._gridCount(remW, areaH, origH, origW, gapH, gapV);
            sideCount = Math.max(sn.count, sr.count);
        }

        // Try filling the bottom strip
        let bottomCount = 0;
        if (remH > 0) {
            const bn = this._gridCount(areaW, remH, origW, origH, gapH, gapV);
            const br = this._gridCount(areaW, remH, origH, origW, gapH, gapV);
            bottomCount = Math.max(bn.count, br.count);
        }

        return main.count + Math.max(sideCount, bottomCount);
    }

    calculateGridLayout(
        printableWidth: number,
        printableHeight: number,
        itemWidth: number,
        itemHeight: number,
        gapH = 2,
        gapV = 2,
    ): GridLayoutResult {
        if (itemWidth <= 0 || itemHeight <= 0) {
            return { itemsPerSheet: 0, efficiency: 0 };
        }

        // Strategy 1: Normal grid
        const s1 = this._gridCount(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV).count;
        // Strategy 2: Rotated grid
        const s2 = this._gridCount(printableWidth, printableHeight, itemHeight, itemWidth, gapH, gapV).count;
        // Strategy 3: Mixed — normal main + fill remainder
        const s3 = this._mixedCount(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV, itemWidth, itemHeight);
        // Strategy 4: Mixed — rotated main + fill remainder
        const s4 = this._mixedCount(printableWidth, printableHeight, itemHeight, itemWidth, gapH, gapV, itemWidth, itemHeight);

        const itemsPerSheet = Math.max(s1, s2, s3, s4);

        // Calculate efficiency
        const sheetArea = printableWidth * printableHeight;
        const usedArea = itemsPerSheet * itemWidth * itemHeight;
        const efficiency = sheetArea > 0
            ? Math.round((usedArea / sheetArea) * 1000) / 10
            : 0;

        return { itemsPerSheet, efficiency };
    }

    /**
     * Calculate staggered/hexagonal layout for circles.
     * Port of: pricing_helper.php → calculateStaggeredLayout()
     */
    calculateStaggeredLayout(
        printableWidth: number,
        printableHeight: number,
        itemWidth: number,
        itemHeight: number,
        gapH = 2,
        gapV = 2,
    ): GridLayoutResult {
        if (itemWidth <= 0 || itemHeight <= 0) {
            return { itemsPerSheet: 0, efficiency: 0 };
        }

        // Try both orientations
        const items1 = this._calculateStaggeredCore(printableWidth, printableHeight, itemWidth, itemHeight, gapH, gapV);
        const items2 = this._calculateStaggeredCore(printableWidth, printableHeight, itemHeight, itemWidth, gapV, gapH);
        const itemsPerSheet = Math.max(items1, items2);

        // Calculate efficiency
        const sheetArea = printableWidth * printableHeight;
        const usedArea = itemsPerSheet * itemWidth * itemHeight;
        const efficiency = sheetArea > 0
            ? Math.round((usedArea / sheetArea) * 1000) / 10
            : 0;

        return { itemsPerSheet, efficiency };
    }

    /** Core stagger calculation for one orientation */
    private _calculateStaggeredCore(
        usableW: number, usableH: number,
        itemW: number, itemL: number,
        gapH: number, gapV: number,
    ): number {
        const rx = itemW / 2;
        const ry = itemL / 2;

        if (usableW < itemW || usableH < itemL) return 0;

        const stepX = itemW + gapH;
        const stepY = Math.sqrt(3) * (ry + gapV / 2);
        const cols = Math.floor(usableW / stepX);
        const rows = Math.floor(usableH / stepY);

        let count = 0;
        for (let row = 0; row <= rows; row++) {
            const isOddRow = row % 2 !== 0;
            const numItemsInRow = isOddRow
                ? Math.floor((usableW - stepX / 2) / stepX)
                : cols;

            for (let col = 0; col < numItemsInRow; col++) {
                let x = col * stepX + rx;
                if (isOddRow) x += stepX / 2;
                const y = row * stepY + ry;

                // Boundary check
                if (x - rx < 0 || x + rx > usableW || y - ry < 0 || y + ry > usableH) continue;
                count++;
            }
        }
        return count;
    }

    /**
     * Calculate waste sheets based on print method and processes.
     * Port of: pricing_helper.php → calculateWasteSheets()
     */
    calculateWasteSheets(
        requiredSheets: number,
        config: Record<string, string>,
        printMethod: 'digital' | 'offset' = 'digital',
        processes: string[] = [],
    ): number {
        const includeWaste = (config['waste_include_in_quote'] ?? '1') === '1';
        if (!includeWaste) return requiredSheets;

        let wastePercent = 0;

        // Base waste by print method
        if (printMethod === 'offset') {
            wastePercent += parseFloat(config['waste_offset_percent'] ?? '3');
        } else {
            wastePercent += parseFloat(config['waste_digital_percent'] ?? '1');
        }

        // Additional waste by processes
        for (const proc of processes) {
            if (['can_mo', 'can_bong', 'lamination'].includes(proc)) {
                wastePercent += parseFloat(config['waste_lamination_percent'] ?? '1');
            }
            if (['be', 'die_cut'].includes(proc)) {
                wastePercent += parseFloat(config['waste_die_cut_percent'] ?? '2');
            }
            if (['binding', 'keo_gay', 'lo_xo', 'ghim'].includes(proc)) {
                wastePercent += parseFloat(config['waste_binding_percent'] ?? '2');
            }
        }

        // Calculate
        let wasteSheets = Math.ceil(requiredSheets * wastePercent / 100);
        const minWaste = parseInt(config['waste_minimum_sheets'] ?? '10');
        // Trần hao = % lượt chạy (cấu hình `waste_max_percent_of_run`, mặc định 10%).
        const maxPct = parseFloat(config['waste_max_percent_of_run'] ?? '10') / 100;
        wasteSheets = Math.max(wasteSheets, Math.min(minWaste, requiredSheets * maxPct));

        return requiredSheets + Math.floor(wasteSheets);
    }

    /**
     * Calculate selling price from cost price based on config.
     * Port of: pricing_helper.php → calculateSellingPrice()
     */
    calculateSellingPrice(
        costPrice: number,
        config: { pricing_method: string; default_markup: string; min_margin: string; price_rounding: string; margin_clamp_percent?: string },
    ): number {
        const method = config.pricing_method || 'markup';
        let percentage = parseFloat(config.default_markup ?? '50');
        const rounding = parseInt(config.price_rounding ?? '100');
        const minMargin = parseFloat(config.min_margin ?? '20');
        // Trần % cho phương pháp "margin" (tránh chia 0 khi ≥100%) — cấu hình được.
        const marginClamp = parseFloat(config.margin_clamp_percent ?? '50');

        if (costPrice <= 0) return 0;

        let price: number;
        switch (method) {
            case 'markup':
                price = costPrice * (1 + percentage / 100);
                break;
            case 'margin':
                if (percentage >= 100) percentage = marginClamp;
                price = costPrice / (1 - percentage / 100);
                break;
            default:
                // Phương pháp lạ → dùng markup theo % cấu hình (không gán cứng ×1.5).
                price = costPrice * (1 + percentage / 100);
        }

        // Ensure minimum margin
        const minPrice = costPrice / (1 - minMargin / 100);
        if (price < minPrice) price = minPrice;

        // Round up to nearest rounding value
        if (rounding > 0) {
            price = Math.ceil(price / rounding) * rounding;
        }

        return price;
    }

    /**
     * Calculate weighted average cost.
     * Port of: pricing_helper.php → calculateWeightedAvgCost()
     */
    calculateWeightedAvgCost(
        oldCost: number, oldQty: number,
        newPrice: number, newQty: number,
    ): number {
        return weightedAvgCost(oldCost, oldQty, newPrice, newQty);
    }

    // ═══════════════════════════════════════════════
    // 2. DB-DEPENDENT FUNCTIONS — Use TypeORM
    // ═══════════════════════════════════════════════

    /**
     * Get pricing tier for material.
     * Port of: pricing_helper.php → getPricingTierByMaterial()
     * Cascading fallback: exact match → without print_type → without paper_size → any tier
     */
    async getPricingTierByMaterial(
        materialId: number,
        paperSizeId: number,
        printSide: string,
        printType: string,
        quantity: number,
    ): Promise<number> {
        // Exact match
        const exact = await this.tierRepo.findOne({
            where: {
                materialId,
                paperSizeId,
                printSide,
                printType,
                quantityFrom: LessThanOrEqual(quantity),
            },
            order: { quantityFrom: 'DESC' },
        });
        if (exact) return exact.pricePerSheet;

        // Fallback 1: without print_type
        const fb1 = await this.tierRepo.findOne({
            where: {
                materialId,
                paperSizeId,
                printSide,
                quantityFrom: LessThanOrEqual(quantity),
            },
            order: { quantityFrom: 'DESC' },
        });
        if (fb1) return fb1.pricePerSheet;

        // Fallback 2: without paper_size
        const fb2 = await this.tierRepo.findOne({
            where: {
                materialId,
                printSide,
                quantityFrom: LessThanOrEqual(quantity),
            },
            order: { quantityFrom: 'DESC' },
        });
        if (fb2) return fb2.pricePerSheet;

        // Fallback 3: bất kỳ bậc nào của vật tư này, nhưng VẪN phải hợp lệ theo số lượng.
        //
        // Audit 2026-08-29: bản cũ là `findOne({ where: { materialId }, order: { quantityFrom: 'DESC' } })`
        // — bỏ CẢ `quantityFrom <= quantity`, `paperSizeId` và `printSide` ⇒ luôn trả bậc số lượng
        // LỚN NHẤT, tức đơn giá/tờ THẤP NHẤT, cho mọi số lượng. Nhánh này kích hoạt thật khi vật tư
        // có bậc giá nhưng thiếu bậc cho `print_side` đang chọn (mặc định 'double'), vì fb1/fb2 vẫn
        // lọc `printSide`. Hệ quả: báo giá dưới giá vốn mà không có dấu hiệu nào.
        //
        // Nay giữ ràng buộc số lượng (bậc cao nhất mà `quantityFrom <= quantity`). Không tìm được
        // bậc hợp lệ ⇒ trả 0; caller (`hasAnyTier` + loose/bound guard) đã chặn báo giá 0 đồng
        // tường minh thay vì âm thầm tính tiếp.
        const fb3 = await this.tierRepo.findOne({
            where: { materialId, quantityFrom: LessThanOrEqual(quantity) },
            order: { quantityFrom: 'DESC' },
        });
        if (fb3) return fb3.pricePerSheet;

        return 0;
    }

    /**
     * Vật tư có BẤT KỲ định mức giá nào (`pricing_tiers`) không.
     * Dùng để CHẶN báo giá khi vật tư chưa cấu hình định mức — `getPricingTierByMaterial`
     * trả 0 cả khi thiếu tier lẫn khi tier = 0 hợp lệ, không phân biệt được; hàm này tách
     * riêng "có tier hay không" để caller (loose/bound) chặn đúng thay vì âm thầm tính giá 0.
     */
    async hasAnyTier(materialId: number): Promise<boolean> {
        const row = await this.tierRepo.findOne({ where: { materialId } });
        return row != null;
    }

    /**
     * Bản đồ "mã gia công → loại bù hao" do người dùng cấu hình (pricing_config
     * key 'waste_category_map', JSON {code: 'lamination'|'die_cut'|'binding'}).
     * Cho phép gia công mã tùy biến của từng nhà in vẫn được cộng bù hao đúng loại,
     * thay vì danh sách mã cứng trong calculateWasteSheets. Trống/lỗi → {}.
     */
    async getWasteCategoryMap(): Promise<Record<string, string>> {
        try {
            const rows = await this.tierRepo.manager.query(
                "SELECT config_value FROM pricing_config WHERE config_key = 'waste_category_map' LIMIT 1",
            );
            if (rows?.length) {
                const v = rows[0].config_value;
                const parsed = typeof v === 'string' ? JSON.parse(v) : v;
                return parsed && typeof parsed === 'object' ? parsed : {};
            }
        } catch { /* thiếu/không parse được → coi như rỗng */ }
        return {};
    }

    /**
     * Get processing option cost.
     * Port of: pricing_helper.php → getProcessingCost()
     */
    async getProcessingCost(
        processingId: number,
        side: string,
        paperSizeId: number,
        quantity: number,
        sheets: number,
    ): Promise<ProcessingCostResult> {
        // Use raw query — processing_options table doesn't have a TypeORM entity
        // is_active là cột smallint trong Postgres → PHẢI dùng `= 1`, KHÔNG dùng `= true`
        // (Postgres chặt kiểu: `smallint = boolean` ném lỗi "operator does not exist").
        // `"priceType"` PHẢI trích dẫn: cột là camelCase, Postgres fold identifier không
        // trích dẫn về chữ thường (`pricetype`) → "column does not exist". Khớp đường offset.
        const results = await this.tierRepo.manager.query(
            `SELECT id, name, price, "priceType" FROM processing_options WHERE id = $1 AND is_active = 1`,
            [processingId],
        );

        if (!results || results.length === 0) {
            return { name: 'Unknown', cost: 0, priceType: 'unknown' };
        }

        const option = results[0];
        const price = parseFloat(option.price ?? 0);
        const priceType = option.priceType ?? 'per_item';
        const sideMultiplier = side === 'double' || side === '2' ? 2 : 1;

        let cost: number;
        switch (priceType) {
            case 'per_item':
                cost = price * quantity * sideMultiplier;
                break;
            case 'per_sheet':
                cost = price * sheets * sideMultiplier;
                break;
            case 'per_m2': {
                // per_m2 = đơn giá/m² × TỔNG diện tích tờ in (m²) × số mặt.
                // Tổng diện tích = diện tích 1 tờ (mm² → m²) × số tờ (đã gồm bù hao).
                // Trước đây tính `price * sheets` → bỏ qua kích thước tờ, sai tiền cho
                // gia công tính theo m² (vd cán/phủ). paper_sizes có cột `width`/`height` (mm).
                const sheetAreaM2 = await this._getSheetAreaM2(paperSizeId);
                cost = price * sheetAreaM2 * sheets * sideMultiplier;
                break;
            }
            case 'fixed':
            case 'per_batch':
                cost = price;
                break;
            default:
                cost = price * quantity;
        }

        return { name: option.name, cost, priceType };
    }

    /** Diện tích một tờ giấy theo m² từ paper_sizes (cột width/height tính bằng mm). */
    private async _getSheetAreaM2(paperSizeId: number): Promise<number> {
        if (!paperSizeId) return 0;
        const rows = await this.tierRepo.manager
            .query(`SELECT width, height FROM paper_sizes WHERE id = $1 LIMIT 1`, [paperSizeId])
            .catch(() => [] as any[]);
        if (!rows || rows.length === 0) return 0;
        const w = parseFloat(rows[0].width) || 0;
        const h = parseFloat(rows[0].height) || 0;
        return (w * h) / 1_000_000;
    }

    /**
     * Get binding cost for bound products.
     * Port of: pricing_helper.php → getBindingCost()
     */
    async getBindingCost(
        bindingType: string,
        quantity: number,
        pageCount: number,
    ): Promise<number> {
        // binding_types table query — use raw query since we don't have entity yet
        try {
            const result = await this.tierRepo.manager.query(
                `SELECT price_per_book, price_per_page FROM binding_types WHERE code = $1 AND is_active = true LIMIT 1`,
                [bindingType],
            );
            if (result.length > 0) {
                const pricePerBook = parseFloat(result[0].price_per_book ?? 0);
                const pricePerPage = parseFloat(result[0].price_per_page ?? 0);
                return (pricePerBook + (pricePerPage * pageCount)) * quantity;
            }
            // Không có dòng khớp code → fail-closed (không báo giá đóng cuốn 0đ âm thầm).
            throw new Error(
                `Chưa cấu hình kiểu đóng cuốn "${bindingType}" (binding_types). Không thể tính giá bound.`,
            );
        } catch (e) {
            if (e instanceof Error && e.message.includes('đóng cuốn')) throw e;
            this.logger.error(`getBindingCost query failed (code='${bindingType}')`, e as any);
            throw new Error(
                `Lỗi tra cứu chi phí đóng cuốn "${bindingType}". Không thể tính giá bound.`,
            );
        }
    }
}
