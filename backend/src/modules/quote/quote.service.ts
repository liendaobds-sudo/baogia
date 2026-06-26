import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import Fuse from 'fuse.js';

import {
    Material, PaperSize, ProcessingPricing,
    ProductCategory, Product, ProductQuoteConfig, ProductAiField,
    PrintType, Unit,
    Quote, QuoteItem, Customer, AiConversation
} from '../../entities';
import { ParsedQuote, PricingResult, PricingBreakdownItem } from './quote.interfaces';
import { getPricingBindingCode } from './extractors';
import { PricingApiService } from './pricing-api.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { applyTenantToConnection } from '../../common/tenant/tenant-transaction';

@Injectable()
export class QuoteService implements OnModuleInit {
    private readonly logger = new Logger(QuoteService.name);
    private pricingHealthy = false;
    // Pricing pricing cache (10 min TTL)
    private priceCache = new Map<string, { result: PricingResult; timestamp: number }>();
    private readonly PRICE_CACHE_TTL = 10 * 60 * 1000;

    // Pricing master data cache for material/processing ID resolution
    private pricingMaterialsCache: any[] = [];
    private pricingProcessingCache: any[] = [];
    private pricingPaperSizesCache: any[] = [];
    private pricingFormOptionsCache: any = {};
    private pricingAccessoriesCache: any[] = [];
    private masterDataLastRefresh = 0;
    private readonly MASTER_DATA_TTL = 5 * 60 * 1000; // 5 min

    private getCacheKey(parsed: ParsedQuote): string {
        // Gồm TẤT CẢ trường ảnh hưởng giá để các lựa chọn khác nhau (gia công, cán màng,
        // đóng cuốn, bìa/ruột) không đụng cùng một key → tránh trả về giá cache sai.
        const keyObj = {
            product: parsed.product,
            type: parsed.type,
            quantity: parsed.quantity,
            material: parsed.material?.id ?? parsed.material?.code ?? parsed.material?.name,
            size: parsed.size ? `${parsed.size.width}x${parsed.size.height}` : null,
            shape: parsed.shape ?? null,
            printSides: parsed.printSides,
            finishing: parsed.finishing ?? null,
            lamination: parsed.lamination ?? null,
            pageCount: parsed.pageCount ?? null,
            bindingType: parsed.bindingType?.code ?? null,
            coverMaterial: parsed.coverMaterial?.name ?? null,
            innerMaterial: parsed.innerMaterial?.name ?? null,
        };
        return crypto.createHash('md5').update(JSON.stringify(keyObj)).digest('hex');
    }

    constructor(
        @InjectRepository(Material) private materialsRepo: Repository<Material>,
        @InjectRepository(PaperSize) private paperSizesRepo: Repository<PaperSize>,
        @InjectRepository(ProcessingPricing) private processingPricingRepo: Repository<ProcessingPricing>,
        @InjectRepository(ProductCategory) private productCategoriesRepo: Repository<ProductCategory>,
        @InjectRepository(Product) private productsRepo: Repository<Product>,
        @InjectRepository(ProductQuoteConfig) private productConfigsRepo: Repository<ProductQuoteConfig>,
        @InjectRepository(ProductAiField) private productAiFieldsRepo: Repository<ProductAiField>,
        @InjectRepository(PrintType) private printTypeRepo: Repository<PrintType>,
        @InjectRepository(Unit) private unitRepo: Repository<Unit>,
        private readonly pricingApi: PricingApiService,
        @InjectDataSource() private dataSource: DataSource,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) { }

    /**
     * Khi master-data giá thay đổi (admin sửa bảng giá/vật tư...) → xoá cache giá kết quả
     * + ép làm mới cache master-data lần truy vấn tới. Tránh trả giá CŨ cho khách.
     */
    @OnEvent('pricing.changed')
    onPricingChanged(): void {
        const n = this.priceCache.size;
        this.priceCache.clear();
        this.masterDataLastRefresh = 0; // ép getMasterData refresh lần tới
        this.logger.log(`♻️ pricing.changed → xoá ${n} mục price-cache + reset master-data cache`);
    }

    async onModuleInit() {
        // Check Pricing connection
        try {
            this.pricingHealthy = await this.pricingApi.isHealthy();
            this.logger.log(`🔗 Pricing connection: ${this.pricingHealthy ? '✅ Online' : '❌ Offline'}`);
        } catch {
            this.pricingHealthy = false;
            this.logger.warn('⚠️ Pricing connection check failed');
        }

        // Load Pricing master data for material/processing ID resolution
        if (this.pricingHealthy) {
            try {
                // Load ALL scopes — bound/large_format materials & processing are needed for AI pipeline
                this.pricingMaterialsCache = await this.pricingApi.getMaterials();
                this.pricingProcessingCache = await this.pricingApi.getProcessingOptions();
                this.pricingPaperSizesCache = await this.pricingApi.getPaperSizes();
                this.pricingFormOptionsCache = await this.pricingApi.getFormOptions();
                this.masterDataLastRefresh = Date.now();
                this.logger.log(`📦 Loaded Pricing master data: ${this.pricingMaterialsCache.length} materials, ${this.pricingPaperSizesCache.length} paper sizes, ${this.pricingProcessingCache.length} processing options`);
            } catch (err: any) {
                this.logger.warn(`⚠️ Could not load Pricing master data: ${err.message}`);
            }
        }
    }

    /**
     * Get default paper size ID from cached Pricing data
     */
    private getDefaultPaperSizeId(): number {
        if (this.pricingPaperSizesCache.length === 0) return 1;
        const stdSize = this.pricingPaperSizesCache.find((ps: any) => ps.is_standard == 1 || ps.is_standard === '1');
        return stdSize ? parseInt(stdSize.id) : parseInt(this.pricingPaperSizesCache[0].id);
    }

    /**
     * Resolve material name/type/gsm to Pricing material_id + paper_size_id
     * Uses cached Pricing master data for fuzzy matching (fallback when AI doesn't provide direct IDs)
     */
    private resolveMaterialId(material: { name?: string; type?: string; gsm?: number } | undefined): {
        material_id: number; paper_size_id: number;
    } | null {
        if (!material || this.pricingMaterialsCache.length === 0) return null;

        const type = material.type?.toLowerCase();
        const gsm = material.gsm;

        const buildResult = (match: any) => {
            let paperSizeId = match.paper_size_id ? parseInt(match.paper_size_id) : null;
            // Fallback: pick first standard paper size if material has no linked paper_size_id
            if (!paperSizeId && this.pricingPaperSizesCache.length > 0) {
                const stdSize = this.pricingPaperSizesCache.find((ps: any) => ps.is_standard == 1 || ps.is_standard === '1');
                paperSizeId = stdSize ? parseInt(stdSize.id) : parseInt(this.pricingPaperSizesCache[0].id);
                this.logger.debug(`📐 Paper size fallback: using ${stdSize?.name || this.pricingPaperSizesCache[0].name} (id=${paperSizeId})`);
            }
            if (!paperSizeId) return null;
            return { material_id: parseInt(match.id), paper_size_id: paperSizeId };
        };

        // Strategy 0: Exact Name Match (Highest priority to avoid fuzzy mismatch)
        if (material.name) {
            const matchExact = this.pricingMaterialsCache.find((m: any) => {
                const mName = (m.name || m.display_name || '').toLowerCase();
                return mName === material.name!.toLowerCase() && (!gsm || parseInt(m.gsm) === gsm);
            });
            if (matchExact) {
                this.logger.debug(`📍 Material resolved (exact name): ${material.name} → id=${matchExact.id}`);
                return buildResult(matchExact);
            }
        }

        // Strategy 1: Match by type + gsm (exact)
        if (type && gsm) {
            const match = this.pricingMaterialsCache.find((m: any) => {
                const mType = (m.type || m.category || '').toLowerCase();
                const mName = (m.name || '').toLowerCase();
                const mGsm = parseInt(m.gsm);
                return (mType === type || mName.includes(type)) && mGsm === gsm;
            });
            if (match) {
                this.logger.debug(`📍 Material resolved: ${material.name} → id=${match.id}, paper_size_id=${match.paper_size_id}`);
                return buildResult(match);
            }
        }

        // Strategy 1.5: Match by material name containing type + gsm
        // Handles case where material.type in DB is 'paper' but name is 'Couche 150gsm'
        if (type && gsm) {
            const match = this.pricingMaterialsCache.find((m: any) => {
                const mName = (m.name || m.display_name || '').toLowerCase();
                const mGsm = parseInt(m.gsm);
                return mName.includes(type) && mGsm === gsm;
            });
            if (match) {
                this.logger.debug(`📍 Material resolved (name+gsm): ${material.name} → id=${match.id}`);
                return buildResult(match);
            }
        }

        // Strategy 2: Match by type only (take first match)
        if (type) {
            const match = this.pricingMaterialsCache.find((m: any) => {
                const mType = (m.type || m.category || '').toLowerCase();
                const mName = (m.name || '').toLowerCase();
                return mType === type || mName.includes(type);
            });
            if (match) {
                this.logger.debug(`📍 Material resolved (type-only): ${material.name} → id=${match.id}`);
                return buildResult(match);
            }
        }

        // Strategy 3: Match by name substring
        if (material.name) {
            const nameLower = material.name.toLowerCase();
            const match = this.pricingMaterialsCache.find((m: any) =>
                (m.name || '').toLowerCase().includes(nameLower) ||
                nameLower.includes((m.name || '').toLowerCase())
            );
            if (match) {
                this.logger.debug(`📍 Material resolved (name): ${material.name} → id=${match.id}`);
                return buildResult(match);
            }
            
            // Strategy 4: Fuse.js fallback
            const fuse = new Fuse(this.pricingMaterialsCache, {
                keys: ['name', 'display_name', 'type', 'category'],
                threshold: 0.4
            });
            const fuzzyResult = fuse.search(material.name);
            if (fuzzyResult && fuzzyResult.length > 0 && fuzzyResult[0].item) {
                this.logger.debug(`📍 Material resolved (Fuse.js): ${material.name} → id=${fuzzyResult[0].item.id}`);
                return buildResult(fuzzyResult[0].item);
            }
        }

        this.logger.warn(`⚠️ Could not resolve material: ${material.name} (type=${type}, gsm=${gsm})`);
        return null;
    }

    /**
     * Resolve processing/finishing codes to Pricing processing IDs
     */
    private resolveProcessingIds(codes: string[]): Array<{ id: number; side?: string }> {
        if (!codes || this.pricingProcessingCache.length === 0) return [];

        const resolved: Array<{ id: number; side?: string }> = [];
        for (const code of codes) {
            const codeLower = code.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
            const match = this.pricingProcessingCache.find((p: any) => {
                const pCode = (p.code || '').toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
                const pName = (p.name || '').toLowerCase();
                return pCode === codeLower || pCode.includes(codeLower) ||
                    pName.includes(codeLower) || codeLower.includes(pCode);
            });
            if (match) {
                this.logger.debug(`📍 Processing resolved: ${code} → id=${match.id} (${match.name})`);
                resolved.push({ id: parseInt(match.id) });
            } else {
                this.logger.warn(`⚠️ Could not resolve processing: ${code}`);
            }
        }
        return resolved;
    }

    // ═══════════════════════════════════════════════
    // Calculate from ParsedQuote — Pricing only
    // ═══════════════════════════════════════════════

    async calculateFromParsed(parsed: ParsedQuote): Promise<PricingResult> {
        const type = parsed.type || 'loose';
        const quantity = parsed.quantity || 0;
        const warnings: string[] = [...(parsed.warnings || [])];

        // If not complete, return missing info
        if (!parsed.isComplete) {
            return {
                productType: parsed.product || 'unknown',
                type,
                total: null,
                currency: 'VND',
                breakdown: [],
                requiresManualQuote: false,
                warnings,
                missingFields: parsed.missingFields,
                question: parsed.question,
            };
        }

        // Check pricing cache first
        const cacheKey = this.getCacheKey(parsed);
        const cached = this.priceCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
            this.logger.log('💰 Price from cache (Pricing)');
            return { ...cached.result, warnings: [...warnings, ...(cached.result.warnings || [])] };
        }

        // Calculate price via Pricing API (single source of truth — NO local fallback)
        try {
            const pricingResult = await this.calculateViaErp(parsed, type, quantity);
            if (pricingResult) {
                this.logger.log('💰 Price calculated via Pricing API');
                // Store in cache
                this.priceCache.set(cacheKey, { result: pricingResult, timestamp: Date.now() });
                return { ...pricingResult, warnings: [...warnings, ...(pricingResult.warnings || [])] };
            }
        } catch (err: any) {
            this.logger.warn(`⚠️ Pricing pricing failed: ${err.message}`);
        }

        // Pricing unavailable — DO NOT use hardcoded prices
        this.logger.warn('⚠️ Pricing unavailable — returning manual quote request');
        return {
            productType: parsed.product || 'unknown',
            type,
            total: null,
            currency: 'VND',
            breakdown: [],
            requiresManualQuote: true,
            reason: 'Chưa có giá từ hệ thống Pricing. Nhân viên sẽ tra cứu và báo giá chính xác.',
            warnings: [...warnings, 'Giá chưa có trong Pricing — cần tra cứu thủ công'],
            source: 'none',
        };
    }

    /**
     * Try to calculate price via Pricing API
     * Returns null if Pricing is unavailable
     */
    private async calculateViaErp(parsed: ParsedQuote, type: string, quantity: number): Promise<PricingResult | null> {
        const isHealthy = await this.pricingApi.isHealthy();
        if (!isHealthy) return null;

        const pricingData: any = { type, quantity };
        // Gắn mã sản phẩm để backend kiểm whitelist (đồng bộ mini + thủ công).
        // Khi nhận diện được template Pricing, `parsed.product` chính là template code;
        // mã lạ (fallback tĩnh) sẽ được validator bỏ qua an toàn.
        if (parsed.product) pricingData.product_code = parsed.product;

        if (type === 'loose') {
            pricingData.item_width = parsed.size?.width || 90;
            pricingData.item_height = parsed.size?.height || 55;
            pricingData.print_side = parsed.printSides === 2 ? 'double' : 'single';
            pricingData.shape = parsed.shape || 'rectangle';

            // Prefer direct IDs (from AI with Pricing master data injection) over fuzzy matching
            if (parsed.material?.id) {
                pricingData.material_id = parsed.material.id;
                pricingData.paper_size_id = parsed.material.paperSizeId || this.getDefaultPaperSizeId();
                this.logger.debug(`📍 Material from direct ID: material_id=${pricingData.material_id}, paper_size_id=${pricingData.paper_size_id}`);
            } else {
                // Fallback: fuzzy match material name → Pricing material_id
                const resolved = this.resolveMaterialId(parsed.material);
                if (resolved) {
                    pricingData.material_id = resolved.material_id;
                    pricingData.paper_size_id = resolved.paper_size_id;
                } else {
                    this.logger.warn(`⚠️ Cannot resolve material for Pricing: ${parsed.material?.name || 'unknown'}`);
                    return null;
                }
            }

            // Resolve processing/finishing codes → Pricing processing IDs
            if (parsed.finishing && parsed.finishing.length > 0) {
                const resolvedProc = this.resolveProcessingIds(parsed.finishing);
                if (resolvedProc.length > 0) {
                    pricingData.processing = resolvedProc;
                }
            }

            // Also resolve lamination as processing (skip if already in finishing to avoid duplicates)
            if (parsed.lamination && (!parsed.finishing || !parsed.finishing.includes(parsed.lamination))) {
                const resolvedLam = this.resolveProcessingIds([parsed.lamination]);
                if (resolvedLam.length > 0) {
                    pricingData.processing = [...(pricingData.processing || []), ...resolvedLam];
                }
            }
        } else if (type === 'bound') {
            pricingData.page_count = parsed.pageCount || 24;

            // Convert chatbot binding code to Pricing code
            const chatbotBindingCode = parsed.bindingType?.code || 'ghim_long';
            pricingData.binding_type = parsed.bindingType?.pricingCode || getPricingBindingCode(chatbotBindingCode);
            this.logger.debug(`📍 Binding type: ${chatbotBindingCode} → Pricing: ${pricingData.binding_type}`);

            // Resolve cover material
            const coverResolved = this.resolveMaterialId(parsed.coverMaterial);
            if (coverResolved) {
                const coverProcessing: Array<{ id: number; side?: string }> = [];

                // Resolve cover finishing (lamination, foil, etc.)
                if (parsed.coverFinishing && parsed.coverFinishing.length > 0) {
                    const resolvedProc = this.resolveProcessingIds(parsed.coverFinishing);
                    coverProcessing.push(...resolvedProc);
                }
                if (parsed.coverLamination) {
                    const lamCode = parsed.coverLamination.type;
                    if (lamCode && (!parsed.coverFinishing || !parsed.coverFinishing.includes(lamCode))) {
                        const resolvedLam = this.resolveProcessingIds([lamCode]);
                        coverProcessing.push(...resolvedLam);
                    }
                }

                pricingData.cover = {
                    material_id: coverResolved.material_id,
                    paper_size_id: coverResolved.paper_size_id,
                    print_side: 'double',
                    ...(coverProcessing.length > 0 ? { processing: coverProcessing } : {}),
                };
            }

            // Resolve inner material
            const innerResolved = this.resolveMaterialId(parsed.innerMaterial);
            if (innerResolved) {
                pricingData.inner = [{
                    material_id: innerResolved.material_id,
                    paper_size_id: innerResolved.paper_size_id,
                    print_side: 'double',
                }];
            }
        } else if (type === 'large_format') {
            pricingData.width = parsed.size?.width || 600;
            pricingData.height = parsed.size?.height || 1600;

            // Enforce mm unit for very small inputs that likely represent meters (e.g. 2x3m parsed as 2, 3)
            if (pricingData.width <= 20 && pricingData.width > 0) pricingData.width *= 1000;
            if (pricingData.height <= 20 && pricingData.height > 0) pricingData.height *= 1000;

            const resolved = this.resolveMaterialId(parsed.material);
            if (resolved) {
                pricingData.material_id = resolved.material_id;
            } else {
                this.logger.warn(`⚠️ Cannot resolve large format material: ${parsed.material?.name || 'unknown'}`);
                return null;
            }
        }

        this.logger.debug(`🔗 Pricing calculate request:`, pricingData);
        const result = await this.pricingApi.calculatePrice(pricingData);
        if (!result || result.total === undefined) return null;

        // Build detailed breakdown including material cost from Pricing
        const breakdownItems: PricingBreakdownItem[] = [];
        const bd = result.breakdown || {};
        if (bd.total_sheets && bd.price_per_sheet) {
            breakdownItems.push({
                item: 'Vật tư in',
                detail: `${bd.items_per_sheet || '?'} sản phẩm/tờ, ${bd.total_sheets} tờ × ${Math.round(bd.price_per_sheet).toLocaleString('vi-VN')}đ/tờ`,
                cost: result.material_cost || 0,
            });
        }
        // Add processing details
        for (const d of (result.processing_details || result.finishing_details || []) as any[]) {
            breakdownItems.push({ item: d.name, detail: d.detail || '', cost: d.cost });
        }

        // B1 fix: báo cho khách GIÁ BÁN (grand_total = đã markup + VAT), KHÔNG phải giá vốn (total).
        // Fallback về giá vốn chỉ khi grand_total thiếu/0 (phòng thủ, tránh báo giá = 0).
        const sellingTotal = (typeof result.grand_total === 'number' && result.grand_total > 0)
            ? result.grand_total
            : result.total;
        const sellingPerItem = (typeof result.grand_total_per_item === 'number' && result.grand_total_per_item > 0)
            ? result.grand_total_per_item
            : (quantity > 0 ? Math.round(sellingTotal / quantity) : 0);

        return {
            productType: parsed.product || type,
            type: type as any,
            total: Math.round(sellingTotal),
            unitPrice: sellingPerItem,
            currency: 'VND',
            breakdown: breakdownItems,
            requiresManualQuote: false,
            warnings: [],
            source: 'pricing',
        };
    }

    /**
     * Expose cached Pricing master data for Mini Quote Form
     * Refreshes cache if stale (TTL-based)
     */
    async getMasterData() {
        // Refresh cache if stale OR if processing cache is empty (data might have been added after startup)
        const isStale = Date.now() - this.masterDataLastRefresh > this.MASTER_DATA_TTL;
        const hasEmptyCache = this.pricingProcessingCache.length === 0;
        if (this.pricingHealthy && (isStale || hasEmptyCache)) {
            try {
                // Load ALL scopes for complete master data
                this.pricingMaterialsCache = await this.pricingApi.getMaterials();
                this.pricingProcessingCache = await this.pricingApi.getProcessingOptions();
                this.pricingPaperSizesCache = await this.pricingApi.getPaperSizes();
                this.pricingFormOptionsCache = await this.pricingApi.getFormOptions();
                this.pricingAccessoriesCache = await this.pricingApi.getAccessories();
                this.masterDataLastRefresh = Date.now();
                this.logger.log(`📦 Refreshed Pricing master data: ${this.pricingMaterialsCache.length} materials, ${this.pricingProcessingCache.length} processing, ${this.pricingAccessoriesCache.length} accessories`);
            } catch (err: any) {
                this.logger.warn(`⚠️ Master data refresh failed: ${err.message}`);
            }
        }

        return {
            materials: (Array.isArray(this.pricingMaterialsCache) ? this.pricingMaterialsCache : []).map((m: any) => ({
                id: m.id, name: m.name, display_name: m.display_name || m.displayName, type: m.type || m.category, gsm: m.gsm,
                has_pricing: parseInt(m.has_pricing || m.hasPricing || '0') > 0,
                paper_size_id: m.paper_size_id || m.paperSizeId || null,
                paper_size_name: m.paper_size_name || m.paperSizeName || null,
                scope_loose: !!(m.scope_loose ?? m.scopeLoose),
                scope_bound: !!(m.scope_bound ?? m.scopeBound),
                scope_large_format: !!(m.scope_large_format ?? m.scopeLargeFormat),
            })),
            paperSizes: (Array.isArray(this.pricingPaperSizesCache) ? this.pricingPaperSizesCache : []).map((ps: any) => ({
                id: ps.id, name: ps.name, width: ps.width, height: ps.height,
            })),
            processingOptions: (Array.isArray(this.pricingProcessingCache) ? this.pricingProcessingCache : []).map((p: any) => ({
                id: p.id, code: p.code, name: p.name,
                category: p.category || p.type || 'other',
                scope_loose: !!(p.scope_loose ?? p.scopeLoose),
                scope_bound: !!(p.scope_bound ?? p.scopeBound),
                scope_large_format: !!(p.scope_large_format ?? p.scopeLargeFormat),
            })),
            accessories: (Array.isArray(this.pricingAccessoriesCache) ? this.pricingAccessoriesCache : []).map((a: any) => ({
                id: a.id, code: a.code, name: a.name, price: a.price, unit: a.unit,
            })),
            formOptions: this.pricingFormOptionsCache || {},
        };
    }

    /**
     * Get master data filtered by product config (allowed materials, paper sizes, processing)
     * Calls Pricing master_data.php?product_id=X&type=all
     */
    async getMasterDataForProduct(productId: number) {
        try {
            const data = await this.pricingApi.getMasterData(productId);

            // ── Fetch per-product config from unified_products ──
            let allowedMaterials: string[] | null = null;
            let allowedPaperSizes: string[] | null = null;
            let allowedProcessing: string[] | null = null;
            let allowedAccessories: string[] | null = null;
            let productQuoteType: string = 'loose';
            let productConfig: any = null;
            try {
                const rows = await this.dataSource.query(
                    `SELECT allowed_materials, allowed_paper_sizes, allowed_processing, allowed_accessories,
                            quote_type, default_materials, default_finishing, form_config
                     FROM unified_products WHERE id = $1`, [productId]
                );
                if (rows.length > 0) {
                    const row = rows[0];
                    productQuoteType = row.quote_type || 'loose';
                    allowedMaterials = this.parseJsonArray(row.allowed_materials);
                    allowedPaperSizes = this.parseJsonArray(row.allowed_paper_sizes);
                    allowedProcessing = this.parseJsonArray(row.allowed_processing);
                    allowedAccessories = this.parseJsonArray(row.allowed_accessories);
                    // Parse form_config for lock_print_side, default_print_side, etc.
                    if (row.form_config) {
                        try {
                            const fc = typeof row.form_config === 'string' ? JSON.parse(row.form_config) : row.form_config;
                            productConfig = {
                                default_print_side: fc.default_print_side || undefined,
                                default_print_type: fc.default_print_type || undefined,
                                default_quantity: fc.default_quantity || undefined,
                                lock_print_side: !!fc.lock_print_side,
                                lock_print_type: !!fc.lock_print_type,
                            };
                        } catch { /* ignore parse errors */ }
                    }
                }
            } catch (e) {
                this.logger.warn(`Could not fetch product config for id=${productId}: ${e.message}`);
            }

            // Also check product_quote_configs table for defaults
            try {
                const cfgRows = await this.dataSource.query(
                    `SELECT * FROM product_quote_configs WHERE product_id = $1 LIMIT 1`, [productId]
                );
                if (cfgRows.length > 0) productConfig = cfgRows[0];
            } catch { /* table may not exist */ }

            // ── Filter materials by allowed list ──
            let materials = (data.materials || []).map((m: any) => ({
                id: m.id, name: m.name, display_name: m.display_name, type: m.type || m.category, gsm: m.gsm,
                has_pricing: parseInt(m.has_pricing || '0') > 0, paper_size_id: m.paperSizeId || m.paper_size_id,
                valid_paper_size_ids: m.valid_paper_size_ids || [],
            }));
            if (allowedMaterials && allowedMaterials.length > 0) {
                const allowedSet = new Set(allowedMaterials.map(String));
                materials = materials.filter((m: any) => allowedSet.has(String(m.id)));
            }

            // ── Filter paper sizes by allowed list ──
            let paperSizes = (data.paper_sizes || []).map((ps: any) => ({
                id: ps.id, name: ps.name, width: ps.width || ps.widthMm, height: ps.height || ps.heightMm,
            }));
            if (allowedPaperSizes && allowedPaperSizes.length > 0) {
                const allowedSet = new Set(allowedPaperSizes.map(String));
                paperSizes = paperSizes.filter((ps: any) => allowedSet.has(String(ps.id)));
            }

            // ── Filter processing options strictly by allowed list ──
            let processingOptions = (data.processing_options || data.processing || []).map((p: any) => ({
                id: p.id, code: p.code, name: p.name, category: p.category || p.type || 'other',
                price: p.price || p.base_price || 0, unit: p.unit || 'cái',
                scope_loose: !!(p.scope_loose ?? p.scopeLoose),
                scope_bound: !!(p.scope_bound ?? p.scopeBound),
                scope_large_format: !!(p.scope_large_format ?? p.scopeLargeFormat),
            }));

            if (allowedProcessing && allowedProcessing.length > 0) {
                const allowedSet = new Set(allowedProcessing.map(String));
                processingOptions = processingOptions.filter((p: any) => allowedSet.has(String(p.id)));
            } else {
                processingOptions = [];
            }

            // ── Filter accessories strictly by allowed list ──
            let accessories = (data.accessories || this.pricingAccessoriesCache).map((a: any) => ({
                id: a.id, code: a.code, name: a.name, price: a.price, unit: a.unit,
            }));
            if (allowedAccessories && allowedAccessories.length > 0) {
                const allowedSet = new Set(allowedAccessories.map(String));
                accessories = accessories.filter((a: any) => allowedSet.has(String(a.id)));
            } else {
                accessories = [];
            }

            return {
                has_config: data.has_config ?? (data.config != null),
                materials,
                paperSizes,
                processingOptions,
                accessories,
                formOptions: data.form_options || this.pricingFormOptionsCache || {},
                config: productConfig || data.config || undefined,
            };
        } catch (err: any) {
            this.logger.warn(`⚠️ Product master data failed for product_id=${productId}: ${err.message}`);
            // Fallback to unfiltered cache
            return this.getMasterData();
        }
    }

    /** Parse a JSON column that could be string, array, or null */
    private parseJsonArray(val: any): string[] | null {
        if (!val) return null;
        if (Array.isArray(val)) return val.map(String);
        if (typeof val === 'string') {
            try { 
                const parsed = JSON.parse(val);
                return Array.isArray(parsed) ? parsed.map(String) : null;
            } catch { return null; }
        }
        return null;
    }

    /**
     * Calculate price via Pricing API (same engine as manual quote form)
     * Returns error if Pricing is offline — no local fallback
     */
    async calculateMiniQuote(input: any) {
        // Live health check
        const isHealthy = await this.pricingApi.isHealthy();
        this.pricingHealthy = isHealthy;
        if (!isHealthy) {
            return { requiresManualQuote: true, reason: 'Pricing offline — vui lòng dùng báo giá thủ công' };
        }

        const productType = input.product_type || input.type || 'loose';

        // ─── Common validation ───
        if (!input.quantity || input.quantity <= 0) {
            return { requiresManualQuote: true, reason: 'Chưa nhập số lượng' };
        }

        // Normalize print_side (Vietnamese label → Pricing value)
        const normalizePrintSide = (ps: string) => {
            if (ps === '1 mặt' || ps === '1') return 'single';
            if (ps === '2 mặt' || ps === '2') return 'double';
            return ps || 'single';
        };

        try {
            // ─── Route by product type ───
            if (productType === 'bound') {
                // Bound: needs page_count, binding_type, cover{}, inner[]
                const pageCount = input.page_count || 24;
                const bindingType = input.binding_type || 'ghim_long';

                const calcPayload: any = {
                    type: 'bound',
                    quantity: input.quantity,
                    page_count: pageCount,
                    binding_type: bindingType,
                    product_code: input.product_code,
                };

                if (input.cover) {
                    calcPayload.cover = {
                        material_id: input.cover.material_id,
                        paper_size_id: input.cover.paper_size_id || this.getDefaultPaperSizeId(),
                        print_side: normalizePrintSide(input.cover.print_side || 'double'),
                        ...(input.cover.print_type ? { print_type: input.cover.print_type } : {}),
                        ...(input.cover.processing ? { processing: input.cover.processing } : {}),
                    };
                }

                if (input.inner && Array.isArray(input.inner)) {
                    calcPayload.inner = input.inner.map((i: any) => ({
                        material_id: i.material_id,
                        paper_size_id: i.paper_size_id || this.getDefaultPaperSizeId(),
                        print_side: normalizePrintSide(i.print_side || 'double'),
                        // Giữ thông tin do FE cung cấp để parity với /pricing/calculate (Req 10)
                        ...(i.page_count != null ? { page_count: i.page_count } : {}),
                        ...(i.print_type ? { print_type: i.print_type } : {}),
                        ...(i.processing ? { processing: i.processing } : {}),
                    }));
                }

                if (input.accessories) calcPayload.accessories = input.accessories;

                const result = await this.pricingApi.calculatePrice(calcPayload);
                return result;
            }

            if (productType === 'large_format') {
                // Large format: needs width, height (mm), material_id
                if (!input.material_id || input.material_id <= 0) {
                    return { requiresManualQuote: true, reason: 'Chưa chọn vật liệu' };
                }
                if ((!input.width || input.width <= 0) || (!input.height || input.height <= 0)) {
                    return { requiresManualQuote: true, reason: 'Chưa nhập kích thước (mm)' };
                }

                const calcPayload: any = {
                    type: 'large_format',
                    material_id: input.material_id,
                    quantity: input.quantity,
                    width: input.width,
                    height: input.height,
                    print_type: input.print_type || 'uv',
                    product_code: input.product_code,
                };

                if (input.processing) calcPayload.processing = input.processing;
                if (input.accessories) calcPayload.accessories = input.accessories;

                const result = await this.pricingApi.calculatePrice(calcPayload);
                return result;
            }

            // ─── Default: LOOSE ───
            if (!input.material_id || input.material_id <= 0) {
                return { requiresManualQuote: true, reason: 'Chưa chọn vật liệu' };
            }
            if ((!input.item_width || input.item_width <= 0) || (!input.item_height || input.item_height <= 0)) {
                return { requiresManualQuote: true, reason: 'Chưa nhập kích thước' };
            }

            let paperSizeId = input.paper_size_id;
            if (!paperSizeId && this.pricingPaperSizesCache.length > 0) {
                paperSizeId = this.pricingPaperSizesCache[0].id;
            }

            const result = await this.pricingApi.calculatePrice({
                type: 'loose',
                material_id: input.material_id,
                paper_size_id: paperSizeId || 1,
                quantity: input.quantity,
                item_width: input.item_width,
                item_height: input.item_height,
                print_side: normalizePrintSide(input.print_side),
                print_type: input.print_type || '4c',
                shape: input.shape,
                gap_h: input.gap_h ?? 2,
                gap_v: input.gap_v ?? 2,
                processing: input.processing || [],
                accessories: input.accessories || [],
                product_code: input.product_code,
            });

            return result;
        } catch (err: any) {
            this.logger.warn(`⚠️ Pricing calculate failed: ${err.message}`);
            return { requiresManualQuote: true, reason: `Lỗi tính giá Pricing: ${err.message}` };
        }
    }

    async createQuoteFromChat(session_id: string, quoteData: any, customerInfo: any): Promise<any> {
        if (!session_id || !quoteData || !quoteData.product || !quoteData.quantity) throw new Error('Invalid input');
        if (!customerInfo || !customerInfo.name || !customerInfo.phone) throw new Error('Customer info missing');

        // Guard: các raw query bên dưới dùng cú pháp Postgres ($1, NOW() - INTERVAL, RETURNING).
        // Nếu chạy trên dialect khác (SQLite fallback) sẽ lỗi cú pháp khó hiểu → fail rõ ràng.
        if (this.dataSource.options.type !== 'postgres') {
            throw new Error('createQuoteFromChat yêu cầu PostgreSQL (DB_TYPE=postgres).');
        }

        const quoteDataForHash = {
            product: quoteData.product,
            quantity: quoteData.quantity,
            price: quoteData.price || null,
            size: quoteData.size || null,
            material: quoteData.material || null
        };
        const quoteHash = crypto.createHash('md5').update(session_id + JSON.stringify(quoteDataForHash)).digest('hex');

        // Idempotency check: DB uses `code` column (not `quote_number`)
        // Postgres dialect ($1 placeholders, interval syntax)
        const existingQuote = await this.dataSource.query(
            `SELECT id, code FROM quotes WHERE quote_hash = $1 AND created_at > NOW() - INTERVAL '5 minutes' LIMIT 1`,
            [quoteHash]
        );
        
        if (existingQuote && existingQuote.length > 0) {
            return { 
                success: true, 
                quoteId: existingQuote[0].id, 
                quoteNumber: existingQuote[0].code, 
                idempotent: true, 
                message: 'Báo giá đã được tạo trước đó' 
            };
        }

        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            await applyTenantToConnection(queryRunner, this.tenantCtx);
            const phone = customerInfo.phone.trim();
            let customerId;
            const custRes = await queryRunner.query('SELECT id FROM customers WHERE phone = $1 LIMIT 1', [phone]);
            if (custRes && custRes.length > 0) customerId = custRes[0].id;
            else {
                const insertCust = await queryRunner.query(
                    'INSERT INTO customers (name, phone, company, source) VALUES ($1, $2, $3, $4) RETURNING id',
                    [customerInfo.name, phone, customerInfo.company || null, 'website_chatbot']
                );
                customerId = insertCust[0].id;
            }
            
            const total = (quoteData.quantity || 1) * (quoteData.price || 0);
            
            // Generate quote code first (DB `code` is NOT NULL)
            // Use temporary code, will update with actual ID after insert
            const tempCode = `Q-${new Date().getFullYear()}-TEMP`;
            
            // DB `quotes` has: customer_id, code, total, status, source, quote_hash, customer_name, customer_phone
            // DB does NOT have: notes, quote_number
            const insertQuote = await queryRunner.query(
                `INSERT INTO quotes (customer_id, code, total, status, source, quote_hash, customer_name, customer_phone, customer_note)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [customerId, tempCode, total, 'new', 'website_chatbot', quoteHash, customerInfo.name, phone, 'Created via AI Chatbot']
            );
            const quoteId = insertQuote[0].id;
            
            // Update code with actual ID
            const quoteCode = `Q-${new Date().getFullYear()}-${String(quoteId).padStart(5, '0')}`;
            await queryRunner.query('UPDATE quotes SET code = $1 WHERE id = $2', [quoteCode, quoteId]);
            
            // Build processing_details JSON (DB does NOT have `unit_price` or `specifications`)
            const processingDetails = JSON.stringify({
                size: quoteData.size || null,
                material: quoteData.material || null,
                printSides: quoteData.printSides || null,
                finishing: quoteData.finishing || [],
                source: 'ai_chatbot'
            });

            // DB `quote_items` columns: quote_id, product_name, quantity, item_total, product_type, processing_details
            await queryRunner.query(
                `INSERT INTO quote_items (quote_id, product_name, quantity, item_total, product_type, processing_details)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [quoteId, quoteData.product, quoteData.quantity || 1, total, quoteData.productType || 'loose', processingDetails]
            );

            // Link to AI conversation
            const convRes = await queryRunner.query('SELECT id FROM ai_conversations WHERE session_id = $1 LIMIT 1', [session_id]);
            if (convRes && convRes.length > 0) {
                await queryRunner.query('UPDATE ai_conversations SET customer_id = $1, quote_id = $2 WHERE id = $3', [customerId, quoteId, convRes[0].id]);
            } else {
                await queryRunner.query('INSERT INTO ai_conversations (session_id, customer_id, quote_id) VALUES ($1, $2, $3)', [session_id, customerId, quoteId]);
            }

            await queryRunner.commitTransaction();
            
            return { 
                success: true, 
                quoteId, 
                quoteNumber: quoteCode, 
                customerId, 
                message: 'Đã tạo báo giá thành công!',
                nextSteps: 'Sales team sẽ liên hệ bạn trong 24 giờ'
            };
        } catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        } finally {
            await queryRunner.release();
        }
    }
}
