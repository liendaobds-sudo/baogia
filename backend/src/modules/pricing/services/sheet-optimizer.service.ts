import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Decimal } from 'decimal.js';
import { PricingService } from '../pricing.service';

export interface ProductSize {
  width: number;
  height: number;
}

export interface SheetOptimizerResult {
  success: boolean;
  error?: string;
  searchCriteria?: { type: string; gsm: number; scope: string };
  optimal?: SheetOption;
  alternatives?: SheetOption[];
  all?: SheetOption[];
  skippedNoPricing?: number;
}

interface SheetOption {
  material: {
    id: number;
    name: string;
    code: string | null;
    stock: number;
    paper_size_id: number | null;
  };
  sheet: {
    name: string;
    width: number;
    height: number;
  };
  ups: number;
  layout: string;
  rotated: boolean;
  sheetsNeeded: number;
  wasteFactor: number;
  totalSheets: number;
  wastePercent: number;
  pricePerSheet: number;
  totalCost: number;
  hasStock: boolean;
  hasPricing: boolean;
}

interface LayoutResult {
  cols: number;
  rows: number;
  total: number;
  layoutType: string;
}

interface MaterialRow {
  id: number;
  name: string;
  code: string | null;
  sheet_width: string | number;
  sheet_height: string | number;
  paper_size_name: string;
  paper_size_id: number | null;
  cost_price: string | number;
  stock: number;
  pricePerSheet?: string | number;
  unit_price?: string | number;
  [key: string]: unknown;
}

interface MaterialInput {
  type: string;
  gsm: number;
}

export interface BoundCalculationResult {
  success: boolean;
  bindingType: string;
  isSaddleStitch: boolean;
  pagesPerSheet: number;
  cover: {
    pages: number;
    sheetsPerItem: number;
    totalSheets: number;
    printSize: ProductSize;
    optimization: SheetOptimizerResult | null;
  };
  inner: {
    pages: number;
    sheetsPerItem: number;
    totalSheets: number;
    printSize: ProductSize;
    optimization: SheetOptimizerResult | null;
  };
  totalPages: number;
}

@Injectable()
export class SheetOptimizerService {
  private cache: Map<string, { value: unknown; expiry: number }> = new Map();
  public static readonly DEFAULT_WASTE_FACTOR = 1.05;
  public static readonly BLEED_MARGIN = 3;
  public static readonly GUTTER = 2;

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly pricingService: PricingService,
  ) {}

  async findOptimal(
    productSize: ProductSize,
    materialType: string,
    gsm: number,
    quantity: number,
    scope: string = 'loose',
    shape: string | null = null,
    materialId: number | null = null,
    materialName: string | null = null
  ): Promise<SheetOptimizerResult> {
    const itemWidth = productSize.width;
    const itemHeight = productSize.height;

    // Whitelist scope to prevent SQL injection via dynamic column name
    const validScopes = ['loose', 'bound', 'large_format'];
    if (!validScopes.includes(scope)) scope = 'loose';
    const scopeColumn = `scope_${scope}`;
    let materials: MaterialRow[] = [];

    if (materialId) {
      const q = `
        SELECT m.*, ps.name as paper_size_name, ps.width as sheet_width, ps.height as sheet_height
        FROM materials m
        JOIN paper_sizes ps ON m.paper_size_id = ps.id
        WHERE m.id = $1 AND m.${scopeColumn} = true
      `;
      materials = await this.dataSource.query(q, [materialId]);
    }

    if (materials.length === 0 && materialName) {
      const searchPattern = '%' + materialName + '%';
      const q = `
        SELECT m.*, ps.name as paper_size_name, ps.width as sheet_width, ps.height as sheet_height
        FROM materials m
        JOIN paper_sizes ps ON m.paper_size_id = ps.id
        WHERE m.name LIKE $1 AND m.${scopeColumn} = true AND m.stock > 0
        ORDER BY CASE WHEN m.name = $2 THEN 0 ELSE 1 END, ps.width * ps.height ASC
      `;
      materials = await this.dataSource.query(q, [searchPattern, materialName]);
      if (materials.length === 0) {
        const q2 = `
          SELECT m.*, ps.name as paper_size_name, ps.width as sheet_width, ps.height as sheet_height
          FROM materials m
          JOIN paper_sizes ps ON m.paper_size_id = ps.id
          WHERE m.name LIKE $1 AND m.${scopeColumn} = true
          ORDER BY CASE WHEN m.name = $2 THEN 0 ELSE 1 END, ps.width * ps.height ASC
        `;
        materials = await this.dataSource.query(q2, [searchPattern, materialName]);
      }
    }

    if (materials.length === 0) {
      const materialPattern = gsm > 0 ? `%${materialType}%${gsm}%` : `%${materialType}%`;
      const q = `
        SELECT m.*, ps.name as paper_size_name, ps.width as sheet_width, ps.height as sheet_height
        FROM materials m
        JOIN paper_sizes ps ON m.paper_size_id = ps.id
        WHERE m.name LIKE $1 AND m.${scopeColumn} = true AND m.stock > 0
        ORDER BY ps.width * ps.height ASC
      `;
      materials = await this.dataSource.query(q, [materialPattern]);
      if (materials.length === 0) {
        const q2 = `
          SELECT m.*, ps.name as paper_size_name, ps.width as sheet_width, ps.height as sheet_height
          FROM materials m
          JOIN paper_sizes ps ON m.paper_size_id = ps.id
          WHERE m.name LIKE $1 AND m.${scopeColumn} = true
          ORDER BY ps.width * ps.height ASC
        `;
        materials = await this.dataSource.query(q2, [materialPattern]);
      }
    }

    if (materials.length === 0) {
      return {
        success: false,
        error: 'Không tìm thấy vật tư phù hợp',
        searchCriteria: { type: materialType, gsm, scope }
      };
    }

    const options: SheetOption[] = [];
    for (const material of materials) {
      const sheetWidth = Number(material.sheet_width);
      const sheetHeight = Number(material.sheet_height);

      if (sheetWidth <= 0 || sheetHeight <= 0) continue;

      let bestLayout: LayoutResult;
      let isRotated = false;

      if (shape === 'circle' || shape === 'ellipse') {
        bestLayout = this.calculateStaggeredCircle(itemWidth, itemHeight, sheetWidth, sheetHeight);
        isRotated = false;
      } else {
        const normal = this.calculateUps(itemWidth, itemHeight, sheetWidth, sheetHeight);
        const rotated = this.calculateUps(itemHeight, itemWidth, sheetWidth, sheetHeight);
        
        bestLayout = normal.total >= rotated.total ? normal : rotated;
        isRotated = normal.total < rotated.total;
      }

      if (bestLayout.total <= 0) continue;

      const sheetsNeeded = Math.ceil(quantity / bestLayout.total);
      const totalSheets = sheetsNeeded; // Matches frontend exactly

      const usedArea = new Decimal(bestLayout.total).times(itemWidth).times(itemHeight);
      const sheetArea = new Decimal(sheetWidth).times(sheetHeight);
      const wastePercent = sheetArea.minus(usedArea).dividedBy(sheetArea).times(100).toNumber();

      const pricePerSheet = Number(material.pricePerSheet || material.unit_price || 0);
      const totalCost = new Decimal(totalSheets).times(pricePerSheet).toNumber();

      const hasPricing = await this.checkMaterialHasPricing(material.id);

      options.push({
        material: {
          id: material.id,
          name: material.name,
          code: material.code || null,
          stock: Number(material.stock),
          paper_size_id: material.paper_size_id || null
        },
        sheet: {
          name: material.paper_size_name,
          width: sheetWidth,
          height: sheetHeight
        },
        ups: bestLayout.total,
        layout: `${bestLayout.cols}x${bestLayout.rows}`,
        rotated: isRotated,
        sheetsNeeded,
        wasteFactor: SheetOptimizerService.DEFAULT_WASTE_FACTOR,
        totalSheets,
        wastePercent: Math.round(wastePercent * 10) / 10,
        pricePerSheet,
        totalCost,
        hasStock: material.stock >= totalSheets,
        hasPricing
      });
    }

    if (options.length === 0) {
      return {
        success: false,
        error: 'Không tìm được khổ giấy phù hợp cho kích thước sản phẩm'
      };
    }

    options.sort((a, b) => {
      if (a.hasPricing !== b.hasPricing) return a.hasPricing ? -1 : 1;
      if (a.hasStock !== b.hasStock) return a.hasStock ? -1 : 1;
      return a.wastePercent - b.wastePercent;
    });

    const optionsWithPricing = options.filter(o => o.hasPricing);
    const finalOptions = optionsWithPricing.length > 0 ? optionsWithPricing : options;

    return {
      success: true,
      optimal: finalOptions[0],
      alternatives: finalOptions.slice(1, 3),
      all: finalOptions,
      skippedNoPricing: options.length - finalOptions.length
    };
  }

  private calculateUps(itemW: number, itemH: number, sheetW: number, sheetH: number) {
    const gutter = SheetOptimizerService.GUTTER;
    const strategies: LayoutResult[] = [];

    strategies.push(this.calculateGridStrategy(sheetW, sheetH, itemW, itemH, gutter, false));
    strategies.push(this.calculateGridStrategy(sheetW, sheetH, itemH, itemW, gutter, true));
    strategies.push(this.calculateMixedStrategy(sheetW, sheetH, itemW, itemH, gutter, false));
    strategies.push(this.calculateMixedStrategy(sheetW, sheetH, itemH, itemW, gutter, true));

    let best = { cols: 0, rows: 0, total: 0, layoutType: 'none' };
    for (const s of strategies) {
      if (s.total > best.total) {
        best = s;
      }
    }
    return best;
  }

  private calculateGridStrategy(areaW: number, areaH: number, itemW: number, itemH: number, gutter: number, rotated: boolean) {
    const cols = Math.floor(new Decimal(areaW).plus(gutter).dividedBy(new Decimal(itemW).plus(gutter)).toNumber());
    const rows = Math.floor(new Decimal(areaH).plus(gutter).dividedBy(new Decimal(itemH).plus(gutter)).toNumber());

    if (cols <= 0 || rows <= 0) return { cols: 0, rows: 0, total: 0, layoutType: 'none' };

    return {
      cols,
      rows,
      total: cols * rows,
      layoutType: rotated ? 'rotated-grid' : 'grid'
    };
  }

  private calculateMixedStrategy(areaW: number, areaH: number, mainW: number, mainH: number, gutter: number, mainRotated: boolean) {
    const dAreaW = new Decimal(areaW);
    const dAreaH = new Decimal(areaH);
    const dMainW = new Decimal(mainW);
    const dMainH = new Decimal(mainH);
    const dGutter = new Decimal(gutter);

    const mainCols = Math.floor(dAreaW.plus(dGutter).dividedBy(dMainW.plus(dGutter)).toNumber());
    const mainRows = Math.floor(dAreaH.plus(dGutter).dividedBy(dMainH.plus(dGutter)).toNumber());

    if (mainCols <= 0 || mainRows <= 0) return { cols: 0, rows: 0, total: 0, layoutType: 'none' };

    const mainCount = mainCols * mainRows;
    const mainUsedW = new Decimal(mainCols).times(dMainW).plus(new Decimal(mainCols - 1).times(dGutter));
    const mainUsedH = new Decimal(mainRows).times(dMainH).plus(new Decimal(mainRows - 1).times(dGutter));

    const origW = mainRotated ? mainH : mainW;
    const origH = mainRotated ? mainW : mainH;

    const remW = dAreaW.minus(mainUsedW).minus(dGutter).toNumber();
    const remH = dAreaH.minus(mainUsedH).minus(dGutter).toNumber();

    let sideCount = 0;
    if (remW > 0) {
      const snCols = Math.floor(new Decimal(remW).plus(gutter).dividedBy(new Decimal(origW).plus(gutter)).toNumber());
      const snRows = Math.floor(new Decimal(areaH).plus(gutter).dividedBy(new Decimal(origH).plus(gutter)).toNumber());
      const snCount = Math.max(0, snCols * snRows);

      const srCols = Math.floor(new Decimal(remW).plus(gutter).dividedBy(new Decimal(origH).plus(gutter)).toNumber());
      const srRows = Math.floor(new Decimal(areaH).plus(gutter).dividedBy(new Decimal(origW).plus(gutter)).toNumber());
      const srCount = Math.max(0, srCols * srRows);

      sideCount = Math.max(snCount, srCount);
    }

    let bottomCount = 0;
    if (remH > 0) {
      const bnCols = Math.floor(new Decimal(areaW).plus(gutter).dividedBy(new Decimal(origW).plus(gutter)).toNumber());
      const bnRows = Math.floor(new Decimal(remH).plus(gutter).dividedBy(new Decimal(origH).plus(gutter)).toNumber());
      const bnCount = Math.max(0, bnCols * bnRows);

      const brCols = Math.floor(new Decimal(areaW).plus(gutter).dividedBy(new Decimal(origH).plus(gutter)).toNumber());
      const brRows = Math.floor(new Decimal(remH).plus(gutter).dividedBy(new Decimal(origW).plus(gutter)).toNumber());
      const brCount = Math.max(0, brCols * brRows);

      bottomCount = Math.max(bnCount, brCount);
    }

    const fillCount = Math.max(sideCount, bottomCount);
    let layoutType = 'grid';
    if (fillCount > 0) {
      layoutType = sideCount > bottomCount ? 'mixed-side' : 'mixed-bottom';
    } else {
      layoutType = mainRotated ? 'rotated-grid' : 'grid';
    }

    return {
      cols: mainCols,
      rows: mainRows,
      total: mainCount + fillCount,
      layoutType
    };
  }

  private calculateStaggeredCircle(itemW: number, itemH: number, sheetW: number, sheetH: number) {
    const gutter = SheetOptimizerService.GUTTER;
    const diameter = Math.max(itemW, itemH);
    const m = 5;

    const areaW = new Decimal(sheetW).minus(m).minus(m);
    const areaH = new Decimal(sheetH).minus(m).minus(m);

    const stepX = new Decimal(diameter).plus(gutter);
    const stepY = new Decimal(diameter).times(0.866).plus(gutter);

    const itemsPerRow = Math.floor(areaW.plus(gutter).dividedBy(stepX).toNumber());
    const itemsPerRowOffset = Math.floor(areaW.minus(diameter / 2).plus(gutter).dividedBy(stepX).toNumber());
    const numRows = Math.floor(areaH.minus(diameter).plus(gutter).dividedBy(stepY).toNumber()) + 1;

    let totalItems = 0;
    for (let row = 0; row < numRows; row++) {
      if (row % 2 === 0) totalItems += itemsPerRow;
      else totalItems += itemsPerRowOffset;
    }

    const gridResult = this.calculateGridStrategy(sheetW, sheetH, itemW, itemH, gutter, false);
    const bestTotal = Math.max(totalItems, gridResult.total);

    return {
      cols: itemsPerRow,
      rows: numRows,
      total: bestTotal,
      layoutType: totalItems > gridResult.total ? 'staggered' : 'grid'
    };
  }

  private async checkMaterialHasPricing(materialId: number): Promise<boolean> {
    const cacheKey = `material_has_pricing:${materialId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
        return cached.value as boolean;
    }

    const res = await this.dataSource.query("SELECT COUNT(*) as count FROM pricing_tiers WHERE material_id = $1", [materialId]);
    const hasPricing = Number(res[0].count) > 0;
    this.cache.set(cacheKey, { value: hasPricing, expiry: Date.now() + 1000 * 60 * 5 });
    return hasPricing;
  }

  async calculateBound(
    boundSize: ProductSize,
    pageCount: number,
    quantity: number,
    coverMaterial: MaterialInput,
    innerMaterial: MaterialInput,
    includesCover: boolean = true,
    bindingType: string | { name?: string } | null = null
  ): Promise<BoundCalculationResult> {
    const bindingName = typeof bindingType === 'object' && bindingType ? (bindingType.name || '').toLowerCase() : (bindingType || '').toLowerCase();
    
    const isSaddleStitch = bindingName.includes('ghim') || bindingName.includes('saddle') || bindingName.includes('kim');
    const cfg = await this.pricingService.getPricingConfig();
    const pagesPerSheet = isSaddleStitch
      ? parseInt(cfg['pages_per_sheet_saddle'] ?? '4')
      : parseInt(cfg['pages_per_sheet_flat'] ?? '2');

    const coverPages = parseInt(cfg['bound_cover_pages'] ?? '4');
    let innerPages = includesCover ? pageCount - coverPages : pageCount;
    if (innerPages < 0) innerPages = 0;

    const innerSheets = Math.ceil(innerPages / pagesPerSheet);
    const totalInnerSheets = innerSheets * quantity;
    const totalCoverSheets = quantity;

    const coverPrintSize = { width: boundSize.width * 2, height: boundSize.height };
    const innerPrintSize = isSaddleStitch ? coverPrintSize : boundSize;

    let coverResult: SheetOptimizerResult | null = null;
    if (coverMaterial) {
      coverResult = await this.findOptimal(coverPrintSize, coverMaterial.type, coverMaterial.gsm, totalCoverSheets, 'bound');
    }

    let innerResult: SheetOptimizerResult | null = null;
    if (innerMaterial && innerPages > 0) {
      innerResult = await this.findOptimal(innerPrintSize, innerMaterial.type, innerMaterial.gsm, totalInnerSheets, 'bound');
    }

    return {
      success: true,
      bindingType: bindingName,
      isSaddleStitch,
      pagesPerSheet,
      cover: {
        pages: coverPages,
        sheetsPerItem: 1,
        totalSheets: totalCoverSheets,
        printSize: coverPrintSize,
        optimization: coverResult
      },
      inner: {
        pages: innerPages,
        sheetsPerItem: innerSheets,
        totalSheets: totalInnerSheets,
        printSize: innerPrintSize,
        optimization: innerResult
      },
      totalPages: coverPages + innerPages
    };
  }

  async quickEstimate(productSize: ProductSize, quantity: number, sheetSize = { width: 650, height: 1000 }) {
    const itemW = productSize.width;
    const itemH = productSize.height;

    const normal = this.calculateUps(itemW, itemH, sheetSize.width, sheetSize.height);
    const rotated = this.calculateUps(itemH, itemW, sheetSize.width, sheetSize.height);

    const bestLayout = normal.total >= rotated.total ? normal : rotated;
    const sheetsNeeded = Math.ceil(quantity / Math.max(1, bestLayout.total));

    // Use dynamic waste config from pricing_config table (consistent with PricingFacadeService)
    let totalSheets: number;
    try {
      const config = await this.pricingService.getPricingConfig();
      totalSheets = this.pricingService.calculateWasteSheets(sheetsNeeded, config, 'digital', []);
    } catch {
      // Fallback to static factor if PricingService unavailable
      totalSheets = Math.ceil(sheetsNeeded * SheetOptimizerService.DEFAULT_WASTE_FACTOR);
    }

    return {
      ups: bestLayout.total,
      layout: `${bestLayout.cols}x${bestLayout.rows}`,
      sheetsNeeded,
      totalSheets,
      sheetSize
    };
  }
}
