import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PricingService } from '../pricing.service';

export interface BoundInputConfig {
  quantity: number;
  page_count: number;
  binding_type: string;
  item_width?: number;
  item_height?: number;
  spine_width?: number;
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
  accessories?: Array<{
    id: number;
    quantity?: number;
    qty?: number;
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
    const bookW = parseFloat(input.item_width as any) || 0;
    const bookH = parseFloat(input.item_height as any) || 0;
    const spineWidth = Math.max(0, parseFloat(input.spine_width as any) || 0);
    const warnings: string[] = [];

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
    let coverSheetsPerBook = 1;
    let totalCoverSheetsOut = 0;
    const cover = input.cover;
    if (cover && cover.material_id && cover.paper_size_id) {
      let coversPerSheet = 1;
      if (bookW > 0 && bookH > 0) {
        const dims = await this.getUsablePaperDims(cover.paper_size_id);
        if (dims) {
          // Bình bìa trải đôi (2 × rộng × cao). Nếu tờ giấy nhỏ chỉ vừa tờ đơn (vd lò xo 2 tờ bìa rời),
          // mỗi tờ đơn ứng với 1/2 bộ bìa.
          const coverSpreadW = bookW * 2 + spineWidth;
          const spreadFit = this.pricing.calculateGridLayout(
            dims.usableW,
            dims.usableH,
            coverSpreadW,
            bookH,
            2,
            2,
          ).itemsPerSheet;
          if (spreadFit > 0) {
            coversPerSheet = spreadFit;
          } else {
            const singleLeafFit = this.pricing.calculateGridLayout(
              dims.usableW,
              dims.usableH,
              bookW,
              bookH,
              2,
              2,
            ).itemsPerSheet;
            if (singleLeafFit > 0) {
              coversPerSheet = singleLeafFit / 2;
            }
          }
        }
      }
      coverSheetsPerBook = Number((1 / coversPerSheet).toFixed(2));
      const coverSheets = Math.ceil(quantity / coversPerSheet);
      const coverProcessCodes = await this.resolveProcessWasteCodes(cover.processing || []);
      const totalCoverSheets = this.pricing.calculateWasteSheets(coverSheets, config, 'digital', coverProcessCodes);
      totalCoverSheetsOut = totalCoverSheets;

      // Chặn giấy bìa chưa có định mức: tra tier miss → getPricingTierByMaterial trả 0 âm thầm
      // → báo giá thiếu tiền giấy mà không ai biết. Thiếu tier → lỗi rõ, buộc cấu hình trước.
      if (!(await this.pricing.hasAnyTier(cover.material_id))) {
        throw new BadRequestException(`Giấy bìa "${await this.materialName(cover.material_id)}" chưa có định mức giá — vào Định mức in nhanh để cấu hình.`);
      }

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
        const normSide = proc.side === 'double' || proc.side === '2' ? 'double' : 'single';
        const procCost = await this.pricing.getProcessingCost(
          proc.id,
          normSide,
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
      if (inner.page_count !== undefined && inner.page_count !== null) {
        innerPageCount = parseInt(inner.page_count as any) || 0;
      } else {
        const totalInners = input.inner?.length || 1;
        const basePages = Math.floor(pageCount / totalInners);
        const remainder = pageCount % totalInners;
        // Last inner gets the extra pages so nothing is lost
        innerPageCount = innerIdx === totalInners - 1 ? basePages + remainder : basePages;
      }

      if (innerPageCount <= 0) {
        innerDetails.push({
          sheets_per_book: 0,
          total_sheets: 0,
          cost: 0,
        });
        continue;
      }

      const isSaddle =
        bindingType === 'saddle_stitch' ||
        bindingType === 'ghim_giua' ||
        bindingType === 'ghim_long' ||
        bindingType === 'staple';
      const innerSides = (inner.print_side || 'double') === 'single' ? 1 : 2;
      if (isSaddle && innerPageCount > 0 && innerPageCount % 4 !== 0) {
        warnings.push(`Đóng ghim giữa yêu cầu số trang ruột chia hết cho 4 (hiện tại: ${innerPageCount} trang ruột). Hệ thống đã làm tròn lên tờ đôi gần nhất.`);
      }
      let pagesPerSheet = 0;

      if (bookW > 0 && bookH > 0) {
        const dims = await this.getUsablePaperDims(inner.paper_size_id);
        if (dims) {
          if (isSaddle) {
            // Ghim giữa/lồng: bình theo tờ đôi trải (2 × rộng × cao), mỗi tờ đôi có 2 lá × số mặt in
            const spreadsPerSheet = this.pricing.calculateGridLayout(
              dims.usableW,
              dims.usableH,
              bookW * 2,
              bookH,
              2,
              2,
            ).itemsPerSheet;
            if (spreadsPerSheet > 0) {
              pagesPerSheet = spreadsPerSheet * 2 * innerSides;
            }
          } else {
            // Đóng phẳng (keo nhiệt, lò xo, khâu chỉ): bình theo lá đơn (rộng × cao), mỗi lá có innerSides trang
            const leavesPerSheet = this.pricing.calculateGridLayout(
              dims.usableW,
              dims.usableH,
              bookW,
              bookH,
              2,
              2,
            ).itemsPerSheet;
            if (leavesPerSheet > 0) {
              pagesPerSheet = leavesPerSheet * innerSides;
            }
          }
        }
      }

      if (pagesPerSheet <= 0) {
        const basePages = isSaddle
          ? parseInt(config['pages_per_sheet_saddle'] ?? '4')
          : parseInt(config['pages_per_sheet_flat'] ?? '2');
        pagesPerSheet = innerSides === 1 ? Math.max(1, Math.floor(basePages / 2)) : basePages;
      }

      const innerSheetsPerBook = Number((innerPageCount / pagesPerSheet).toFixed(2));
      const innerSheets = Math.ceil((innerPageCount * quantity) / pagesPerSheet);

      // Calculate waste sheets
      const innerProcessCodes = await this.resolveProcessWasteCodes(inner.processing || []);
      // Bounding implies a binding process waste
      innerProcessCodes.push('binding');
      const totalInnerSheets = this.pricing.calculateWasteSheets(innerSheets, config, 'digital', innerProcessCodes);

      // Chặn giấy ruột chưa có định mức (xem lý do ở phần bìa).
      if (!(await this.pricing.hasAnyTier(inner.material_id))) {
        throw new BadRequestException(`Giấy ruột "${await this.materialName(inner.material_id)}" chưa có định mức giá — vào Định mức in nhanh để cấu hình.`);
      }

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
        const normSide = proc.side === 'double' || proc.side === '2' ? 'double' : 'single';
        const procCost = await this.pricing.getProcessingCost(
          proc.id,
          normSide,
          inner.paper_size_id,
          quantity,
          totalInnerSheets,
        );
        thisInnerCost += procCost.cost;
      }

      innerCost += thisInnerCost;

      innerDetails.push({
        sheets_per_book: innerSheetsPerBook,
        pages_per_sheet: pagesPerSheet,
        total_sheets: totalInnerSheets,
        cost: Math.round(thisInnerCost),
      });
    }

    // 4. Binding calculation
    const bindingCost = await this.pricing.getBindingCost(bindingType, quantity, pageCount);

    // 5. Accessories calculation (server-authoritative, đồng nhất với loose & large_format)
    let accessoriesCost = 0;
    const accessoriesDetails: Array<{ id: number; name: string; qty: number; cost: number }> = [];
    if (input.accessories && Array.isArray(input.accessories) && input.accessories.length > 0) {
      for (const acc of input.accessories) {
        if (acc?.id == null) continue;
        const rows = await this.dataSource
          .query('SELECT price, name FROM accessories WHERE id = $1 AND is_active = 1', [acc.id])
          .catch(() => [] as Array<{ price: string; name: string }>);
        if (!rows?.length) {
          throw new BadRequestException(`Phụ kiện id=${acc.id} không tồn tại hoặc đã tắt`);
        }
        const unit = parseFloat(rows[0].price) || 0;
        const qty = Math.max(1, parseInt(String(acc.qty ?? acc.quantity ?? 1), 10) || 1);
        const cost = unit * qty;
        accessoriesCost += cost;
        accessoriesDetails.push({
          id: acc.id,
          name: rows[0].name || String(acc.id),
          qty,
          cost: Math.round(cost),
        });
      }
    }

    // 6. Aggregate totals
    const subtotal = coverCost + innerCost + bindingCost + accessoriesCost;
    const total = subtotal;
    const pricePerItem = quantity > 0 ? Math.round(total / quantity) : 0;

    return {
      type: 'bound',
      cover_cost: Math.round(coverCost),
      inner_cost: Math.round(innerCost),
      binding_cost: Math.round(bindingCost),
      accessories_cost: Math.round(accessoriesCost),
      accessories_details: accessoriesDetails,
      inner_details: innerDetails,
      subtotal: Math.round(subtotal),
      total: Math.round(total),
      price_per_item: pricePerItem,
      breakdown: {
        quantity,
        page_count: pageCount,
        binding_type: bindingType,
        cover_sheets_per_book: coverSheetsPerBook,
        total_cover_sheets: totalCoverSheetsOut,
        ...(spineWidth > 0 ? { spine_width_mm: spineWidth, cover_spread_width_mm: bookW > 0 ? bookW * 2 + spineWidth : 0 } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      },
    };
  }

  /** Tra kích thước vùng in khả dụng (mm) của tờ giấy từ bảng paper_sizes. */
  private async getUsablePaperDims(paperSizeId: number): Promise<{ usableW: number; usableH: number } | null> {
    if (!paperSizeId) return null;
    const rows = await this.dataSource
      .query(
        'SELECT width, height, margin_left, margin_right, margin_top, margin_bottom FROM paper_sizes WHERE id = $1 LIMIT 1',
        [paperSizeId],
      )
      .catch(() => []);
    const ps = rows?.[0];
    if (!ps) return null;
    const w = parseFloat(ps.width) || 0;
    const h = parseFloat(ps.height) || 0;
    if (w <= 0 || h <= 0) return null;
    const mLeft = parseFloat(ps.margin_left ?? 5) || 0;
    const mRight = parseFloat(ps.margin_right ?? 5) || 0;
    const mTop = parseFloat(ps.margin_top ?? 5) || 0;
    const mBottom = parseFloat(ps.margin_bottom ?? 5) || 0;
    const usableW = w - mLeft - mRight;
    const usableH = h - mTop - mBottom;
    if (usableW <= 0 || usableH <= 0) return null;
    return { usableW, usableH };
  }

  /** Ánh xạ danh sách gia công bìa/ruột sang mã bù hao (can_mo/lamination/die_cut...). */
  private async resolveProcessWasteCodes(
    processing: Array<{ id?: number; code?: string }>,
  ): Promise<string[]> {
    if (!processing || processing.length === 0) return [];
    const wasteCatMap = await this.pricing.getWasteCategoryMap().catch(() => ({} as Record<string, string>));
    const codes: string[] = [];
    const idsToLookup: number[] = [];

    for (const p of processing) {
      if (p.code) {
        codes.push(wasteCatMap[p.code] || p.code);
      } else if (p.id) {
        idsToLookup.push(Number(p.id));
      }
    }

    if (idsToLookup.length > 0) {
      const placeholders = idsToLookup.map((_, idx) => `$${idx + 1}`).join(',');
      const rows = await this.dataSource
        .query(`SELECT id, code FROM processing_options WHERE id IN (${placeholders})`, idsToLookup)
        .catch(() => [] as Array<{ id: number; code: string }>);
      for (const r of rows) {
        if (r?.code) {
          codes.push(wasteCatMap[r.code] || r.code);
        }
      }
    }

    return codes;
  }

  /** Tên vật tư cho thông báo lỗi (thiếu định mức). Không thấy → dùng chính id. */
  private async materialName(materialId: number): Promise<string> {
    const rows = await this.dataSource
      .query('SELECT name FROM materials WHERE id = $1 LIMIT 1', [materialId])
      .catch(() => [] as Array<{ name: string }>);
    return rows?.[0]?.name || `#${materialId}`;
  }
}
