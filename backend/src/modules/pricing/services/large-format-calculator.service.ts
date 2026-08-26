import { Injectable, BadRequestException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LARGE_FORMAT_LIMITS } from '../../quote/pricing-defaults';

export interface LargeFormatMaterialInfo {
  id: number;
  roll_width?: number;
  charge_full_width?: boolean;
  min_charge_area?: number;
  waste_percent?: number;
  price_per_sqm?: number;
  price?: number;
}

export interface ProcessingInfo {
  priceType: 'per_m2' | 'per_item' | 'fixed';
  price: number;
}

export interface AccessoryInfo {
  price: number;
  quantity: number;
}

export interface LargeFormatCalculationResult {
  success: boolean;
  warnings: string[];
  metrics: {
    printAreaPerItem: number;
    totalPrintArea: number;
    chargeAreaPerItem: number;
    totalChargeArea: number;
    chargeWidth: number;
    widthWastePercent: number;
    inventoryArea: number;
  };
  pricing: {
    pricePerSqm: number;
    pricePrint: number;
    priceProcessing: number;
    priceAccessories: number;
    total: number;
    pricePerItem: number;
  };
}

@Injectable()
export class LargeFormatCalculatorService {
  constructor(
      @InjectDataSource() private dataSource: DataSource
  ) {}

  async calculate(
    printWidthMm: number,
    printHeightMm: number,
    quantity: number,
    material: LargeFormatMaterialInfo,
    printerMultiplier: number = 1,
    processing: ProcessingInfo[] = [],
    accessories: AccessoryInfo[] = [],
    opts: { maxWidthM?: number; maxHeightM?: number; maxQty?: number; defaultWastePercent?: number } = {},
  ): Promise<LargeFormatCalculationResult> {

    // Trần kiểm tra đầu vào + % hao mặc định — cấu hình được (mặc định giữ nguyên hành vi cũ).
    const maxWidthM = opts.maxWidthM ?? LARGE_FORMAT_LIMITS.maxWidthM;
    const maxHeightM = opts.maxHeightM ?? LARGE_FORMAT_LIMITS.maxHeightM;
    const maxQty = opts.maxQty ?? LARGE_FORMAT_LIMITS.maxQty;
    const defaultWastePercent = opts.defaultWastePercent ?? LARGE_FORMAT_LIMITS.defaultWastePercent;

    // Large format expects meters typically, convert if given in mm
    // Let's assume the API receives mm and we convert to m
    const printWidth = new Decimal(printWidthMm).dividedBy(1000);
    const printHeight = new Decimal(printHeightMm).dividedBy(1000);
    const dQuantity = new Decimal(quantity);

    const warnings: string[] = [];

    if (printWidth.lte(0)) throw new BadRequestException('Chiều rộng phải lớn hơn 0');
    if (printWidth.gt(maxWidthM)) throw new BadRequestException(`Chiều rộng tối đa ${maxWidthM}m`);
    if (printHeight.lte(0)) throw new BadRequestException('Chiều dài phải lớn hơn 0');
    if (printHeight.gt(maxHeightM)) throw new BadRequestException(`Chiều dài tối đa ${maxHeightM}m`);
    if (dQuantity.lte(0)) throw new BadRequestException('Số lượng phải lớn hơn 0');
    if (dQuantity.gt(maxQty)) throw new BadRequestException(`Số lượng tối đa ${maxQty.toLocaleString('en-US')}`);

    const rollWidth = new Decimal(material.roll_width || 0);
    const chargeFull = material.charge_full_width || false;
    const minChargeArea = new Decimal(material.min_charge_area || 0);

    let chargeWidth = printWidth;
    if (chargeFull && rollWidth.gt(0) && printWidth.lte(rollWidth)) {
      chargeWidth = rollWidth;
    }

    if (rollWidth.gt(0) && printWidth.gt(rollWidth)) {
        warnings.push(`Khổ in (${printWidth.toNumber()}m) vượt quá khổ cuộn (${rollWidth.toNumber()}m)`);
    }

    const printAreaPerItem = printWidth.times(printHeight);
    let chargeAreaPerItem = chargeWidth.times(printHeight);

    if (minChargeArea.gt(0) && chargeAreaPerItem.lt(minChargeArea)) {
        chargeAreaPerItem = minChargeArea;
    }

    const totalPrintArea = printAreaPerItem.times(dQuantity);
    const totalChargeArea = chargeAreaPerItem.times(dQuantity);

    let widthWastePercent = new Decimal(0);
    if (chargeFull && rollWidth.gt(0) && printWidth.lt(rollWidth)) {
        widthWastePercent = chargeWidth.minus(printWidth).dividedBy(chargeWidth).times(100);
    }

    const lengthWastePercent = new Decimal(material.waste_percent || defaultWastePercent);
    const inventoryAreaPerItem = chargeWidth.times(printHeight).times(lengthWastePercent.dividedBy(100).plus(1));
    const inventoryArea = inventoryAreaPerItem.times(dQuantity);

    // Get base price
    let pricePerSqm = await this.getTieredPricing(material.id, totalChargeArea.toNumber());
    if (pricePerSqm === 0) {
        pricePerSqm = Number(material.price_per_sqm || material.price || 0);
    }

    const pricePrint = totalChargeArea.times(pricePerSqm).times(printerMultiplier);

    let priceProcessing = new Decimal(0);
    for (const proc of processing) {
        if (proc.priceType === 'per_m2') {
            priceProcessing = priceProcessing.plus(totalChargeArea.times(proc.price));
        } else if (proc.priceType === 'per_item') {
            priceProcessing = priceProcessing.plus(dQuantity.times(proc.price));
        } else if (proc.priceType === 'fixed') {
            priceProcessing = priceProcessing.plus(proc.price);
        }
    }

    let priceAccessories = new Decimal(0);
    for (const acc of accessories) {
        priceAccessories = priceAccessories.plus(new Decimal(acc.price).times(acc.quantity));
    }

    const total = pricePrint.plus(priceProcessing).plus(priceAccessories);

    return {
      success: true,
      warnings,
      metrics: {
        printAreaPerItem: printAreaPerItem.toDP(4).toNumber(),
        totalPrintArea: totalPrintArea.toDP(4).toNumber(),
        chargeAreaPerItem: chargeAreaPerItem.toDP(4).toNumber(),
        totalChargeArea: totalChargeArea.toDP(4).toNumber(),
        chargeWidth: chargeWidth.toDP(4).toNumber(),
        widthWastePercent: widthWastePercent.toDP(2).toNumber(),
        inventoryArea: inventoryArea.toDP(4).toNumber()
      },
      pricing: {
        pricePerSqm,
        pricePrint: pricePrint.ceil().toNumber(),
        priceProcessing: priceProcessing.ceil().toNumber(),
        priceAccessories: priceAccessories.ceil().toNumber(),
        total: total.ceil().toNumber(),
        pricePerItem: total.dividedBy(dQuantity).ceil().toNumber()
      }
    };
  }

  private async getTieredPricing(materialId: number, totalAreaSqm: number): Promise<number> {
      try {
          const res = await this.dataSource.query(`
            SELECT price_per_sqm 
            FROM large_format_pricing 
            WHERE material_id = $1 
            AND area_from <= $2 
            AND (area_to IS NULL OR area_to >= $3)
            ORDER BY area_from DESC 
            LIMIT 1
          `, [materialId, totalAreaSqm, totalAreaSqm]);

          if (res && res.length > 0) {
              return Number(res[0].price_per_sqm);
          }
      } catch (e) {
          // Ignore error, table might not exist in tests or it's empty
      }
      return 0;
  }
}
