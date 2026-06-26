import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PricingService } from '../pricing.service';

export interface BoundInputConfig {
  quantity: number;
  page_count: number;
  binding_type: string;
  cover?: {
    material_id: number;
    paper_size_id: number;
    print_side?: string;
    print_type?: string;
    processing?: Array<{
      id: number;
      side?: string;
      code?: string;
    }>;
  };
  inner?: Array<{
    material_id: number;
    paper_size_id: number;
    page_count?: number;
    print_side?: string;
    print_type?: string;
    processing?: Array<{
      id: number;
      side?: string;
      code?: string;
    }>;
  }>;
}

@Injectable()
export class BoundCalculatorService {
  constructor(
    private readonly pricing: PricingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async calculate(input: BoundInputConfig): Promise<any> {
    const quantity = parseInt(input.quantity as any) || 0;
    const pageCount = parseInt(input.page_count as any) || 0;
    const bindingType = input.binding_type || 'saddle_stitch';

    if (quantity <= 0 || pageCount <= 0) {
      throw new BadRequestException('Bắt buộc nhập: quantity, page_count');
    }

    // 1. Fetch config settings
    const configRows = await this.dataSource.query('SELECT config_key, config_value FROM pricing_config').catch(() => []);
    const config: Record<string, string> = {};
    for (const row of configRows) {
      config[row.config_key] = row.config_value;
    }

    // 2. Cover calculation
    let coverCost = 0;
    const cover = input.cover;
    if (cover && cover.material_id && cover.paper_size_id) {
      const coverSheets = quantity; // 1 sheet per book
      const coverProcessCodes = (cover.processing || []).map((p) => p.code || String(p.id));
      const totalCoverSheets = this.pricing.calculateWasteSheets(coverSheets, config, 'digital', coverProcessCodes);

      const coverPricePerSheet = await this.pricing.getPricingTierByMaterial(
        cover.material_id,
        cover.paper_size_id,
        cover.print_side || 'double',
        cover.print_type || '4c',
        totalCoverSheets,
      );
      coverCost = coverPricePerSheet * totalCoverSheets;

      // Cover processing
      for (const proc of cover.processing || []) {
        if (!proc.id) continue;
        const procCost = await this.pricing.getProcessingCost(
          proc.id,
          proc.side || 'single',
          cover.paper_size_id,
          quantity,
          totalCoverSheets,
        );
        coverCost += procCost.cost;
      }
    }

    // 3. Inner calculation
    let innerCost = 0;
    const innerDetails: Record<string, unknown>[] = [];
    for (let innerIdx = 0; innerIdx < (input.inner || []).length; innerIdx++) {
      const inner = input.inner![innerIdx];
      if (!inner.material_id || !inner.paper_size_id) continue;

      // Ensure we have page count for this specific inner material.
      // If not provided, distribute total pages evenly — last inner gets remainder to avoid losing pages.
      let innerPageCount: number;
      if (inner.page_count) {
        innerPageCount = parseInt(inner.page_count as any);
      } else {
        const totalInners = input.inner?.length || 1;
        const basePages = Math.floor(pageCount / totalInners);
        const remainder = pageCount % totalInners;
        // Last inner gets the extra pages so nothing is lost
        innerPageCount = innerIdx === totalInners - 1 ? basePages + remainder : basePages;
      }
      
      const isSaddle = bindingType === 'saddle_stitch' || bindingType === 'ghim_giua';
      const pagesPerSheet = isSaddle
        ? parseInt(config['pages_per_sheet_saddle'] ?? '4')
        : parseInt(config['pages_per_sheet_flat'] ?? '2');
      const innerSheetsPerBook = Math.ceil(innerPageCount / pagesPerSheet);
      const innerSheets = innerSheetsPerBook * quantity;
      
      // Calculate waste sheets
      const innerProcessCodes = (inner.processing || []).map((p) => p.code || String(p.id));
      // Bounding implies a binding process waste
      innerProcessCodes.push('binding'); 
      const totalInnerSheets = this.pricing.calculateWasteSheets(innerSheets, config, 'digital', innerProcessCodes);

      const innerPricePerSheet = await this.pricing.getPricingTierByMaterial(
        inner.material_id,
        inner.paper_size_id,
        inner.print_side || 'double',
        inner.print_type || '4c',
        totalInnerSheets,
      );
      let thisInnerCost = innerPricePerSheet * totalInnerSheets;

      // Inner processing
      for (const proc of inner.processing || []) {
        if (!proc.id) continue;
        const procCost = await this.pricing.getProcessingCost(
          proc.id,
          proc.side || 'single',
          inner.paper_size_id,
          quantity,
          totalInnerSheets,
        );
        thisInnerCost += procCost.cost;
      }

      innerCost += thisInnerCost;

      innerDetails.push({
        sheets_per_book: innerSheetsPerBook,
        total_sheets: totalInnerSheets,
        cost: Math.round(thisInnerCost),
      });
    }

    // 4. Binding calculation
    const bindingCost = await this.pricing.getBindingCost(bindingType, quantity, pageCount);

    // 5. Aggregate totals
    const subtotal = coverCost + innerCost + bindingCost;
    const total = subtotal; // If accessories were here, they would affect total. For now just equal.
    const pricePerItem = quantity > 0 ? Math.round(total / quantity) : 0;

    return {
      type: 'bound',
      cover_cost: Math.round(coverCost),
      inner_cost: Math.round(innerCost),
      binding_cost: Math.round(bindingCost),
      inner_details: innerDetails,
      subtotal: Math.round(subtotal),
      total: Math.round(total),
      price_per_item: pricePerItem,
      breakdown: {
        quantity,
        page_count: pageCount,
        binding_type: bindingType,
      },
    };
  }
}
