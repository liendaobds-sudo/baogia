import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PricingData, QuoteResult, OffsetPricingError } from './pricing-data';
import { chuanHoaKho, docKichThuocCm } from './lookups';
import { loadDefaultPricingData } from './default-data';
import { ConfigStore } from './config-store.service';
import { tenantRlsEnabled } from '../../../common/tenant/tenant-background';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { tinhToRoi, ToRoiInput } from './products/to-roi';
import { tinhBiThuFolder, BiThuFolderInput } from './products/bi-thu-folder';
import { tinhSpKhac, SpKhacInput } from './products/sp-khac';
import { tinhHopGiay, HopGiayInput } from './products/hop-giay';
import { tinhTuiGiay, TuiGiayInput } from './products/tui-giay';

export type OffsetEngineInput =
    | ToRoiInput | BiThuFolderInput | SpKhacInput | HopGiayInput | TuiGiayInput;

export interface OffsetEngineResult {
    success: boolean;
    data?: QuoteResult;
    error?: string;
}

/**
 * EngineOffsetService — wrapper NestJS cho engine tính giá offset thuần.
 *
 * Nạp PricingData (mặc định từ `default-data`; sẽ override từ ConfigStore/DB khi có), định tuyến
 * theo `type` tới 1 trong 5 hàm sản phẩm. Lõi tính giá vẫn là hàm thuần, dễ test.
 *
 * _Requirements: 17.2, 17.4_
 */
@Injectable()
export class EngineOffsetService implements OnModuleInit {
    private readonly logger = new Logger(EngineOffsetService.name);

    /**
     * Cache PricingData (bảng giá offset) — CÔ LẬP THEO TENANT (audit 2026-07-25).
     *
     * Bảng giá offset (`offset_cfg_*`, `pricing_config`, vật tư) là dữ liệu org-scoped, nhưng
     * trước đây được cache trong MỘT field singleton nạp một lần lúc boot ⇒ khi bật
     * `TENANT_RLS_ENABLED`, mọi tenant dùng chung bảng giá của lần nạp đầu ⇒ SAI TIỀN.
     *
     * Khi flag TẮT (mặc định) hoặc ngoài tenant context: khoá `'default'` ⇒ đúng một ô,
     * hành vi byte-for-byte như trước (golden `offset-price-preservation` không đổi).
     */
    private cachedByTenant = new Map<string, PricingData>();

    /**
     * ConfigStore là tùy chọn: khi chạy trong NestJS sẽ được inject để nạp cấu hình từ DB;
     * khi dùng trong test thuần (`new EngineOffsetService()`) thì bỏ qua, dùng JSON đóng gói.
     * TenantContextService cũng tùy chọn (test thuần không có DI).
     */
    constructor(
        @Optional() private readonly configStore?: ConfigStore,
        @Optional() private readonly tenantCtx?: TenantContextService,
    ) {}

    /** Khoá ô cache bảng giá theo tenant (chỉ khi RLS bật + có context), ngược lại 'default'. */
    private cacheKey(): string {
        if (tenantRlsEnabled()) {
            const tenantId = this.tenantCtx?.currentTenantId?.();
            if (tenantId != null) return `t${tenantId}`;
        }
        return 'default';
    }

    private get cached(): PricingData | null {
        return this.cachedByTenant.get(this.cacheKey()) ?? null;
    }

    private set cached(data: PricingData | null) {
        const key = this.cacheKey();
        if (data == null) this.cachedByTenant.delete(key);
        else this.cachedByTenant.set(key, data);
    }

    /** Lúc khởi động: seed cấu hình mặc định (idempotent) rồi nạp PricingData từ DB. */
    async onModuleInit(): Promise<void> {
        if (!this.configStore) return;
        try {
            // Sau khi bật RLS (TENANT_RLS_ENABLED): KHÔNG seed lúc boot. Lý do:
            //  1) seedDefaults() chạy NGOÀI tenant context (onModuleInit) → INSERT vào materials/
            //     paper_sizes (đã SET NOT NULL tenant_id) sẽ vỡ vì trigger không có app.current_tenant.
            //  2) ALTER TABLE trong seed cần quyền OWNER — app role NOSUPERUSER bị từ chối.
            // Dữ liệu offset đã seed 1 lần (lúc còn superuser); seed/DDL mới thuộc maintenance
            // window chạy bằng owner role (xem TENANT-RLS-RUNBOOK). Vẫn nạp PricingData như thường.
            if (!tenantRlsEnabled()) {
                await this.configStore.seedDefaults();
            }
            await this.refreshFromConfigStore();
        } catch (err) {
            this.logger.warn(`Không nạp được cấu hình offset từ DB, dùng mặc định JSON: ${(err as Error)?.message}`);
        }
    }

    /** Nạp lại PricingData từ ConfigStore (DB) và làm mới cache của tenant hiện hành. */
    async refreshFromConfigStore(): Promise<void> {
        if (!this.configStore) return;
        this.cached = await this.configStore.loadPricingData();
    }

    /**
     * Xoá cache bảng giá của MỌI tenant (dùng khi admin sửa cấu hình offset).
     * Lần tính kế tiếp sẽ nạp lại từ ConfigStore theo đúng tenant của request.
     */
    invalidateAllPricingData(): void {
        this.cachedByTenant.clear();
    }

    /** Khi Danh Mục Giấy hoặc Định mức thay đổi, xoá cache và nạp lại PricingData. */
    @OnEvent('pricing.changed')
    async onPricingChanged(): Promise<void> {
        this.invalidateAllPricingData();
        try {
            await this.refreshFromConfigStore();
        } catch (err) {
            this.logger.warn(`Không làm mới được cấu hình offset sau sự kiện pricing.changed: ${(err as Error)?.message}`);
        }
    }

    /** Nguồn dữ liệu hiện hành (mặc định JSON đóng gói; có cache). */
    getPricingData(): PricingData {
        if (!this.cached) this.cached = loadDefaultPricingData();
        return this.cached;
    }

    /** Cho phép override (vd. ConfigStore nạp từ DB) và làm mới cache. */
    setPricingData(data: PricingData): void {
        this.cached = data;
    }

    /**
     * Kiểm tra giá trị gửi lên so với whitelist của loại sản phẩm (`productConfig`).
     *
     * HÀNH VI THỰC TẾ (audit 2026-08-29 — doc cũ ghi NGƯỢC nghĩa, nói "fail-closed / chưa
     * cấu hình thì KHÔNG ra giá" trong khi code allow-all; doc sai kiểu này dẫn tới kết luận
     * audit sai, nên viết lại đúng theo code):
     *
     *  - Loại sản phẩm CHƯA có `productConfig[type]` → CHO PHÉP tất cả. Lý do: seed JSON mặc
     *    định không kèm whitelist; enforce ở đây sẽ làm mọi báo giá offset chết khi DB chưa
     *    cấu hình "Cấu Hình Sản Phẩm Offset".
     *  - Field đang dùng nhưng `allowed*` rỗng/thiếu → CHO PHÉP (khớp docs OffsetProductConfig).
     *  - Field đang dùng + whitelist khai tường minh + giá trị NGOÀI danh sách → CHẶN.
     *  - Field bỏ trống / 'Không' → bỏ qua.
     *
     * Fail-closed thật sự cho vật tư/khổ/số con nằm ở chỗ khác: `giaGiay`, `timKhoIn` và các
     * guard `soCon > 0` trong `products/*` đều ném `OffsetPricingError` khi thiếu dữ liệu.
     */
    private validateAgainstConfig(input: OffsetEngineInput, d: PricingData): void {
        const cfg = d.productConfig?.[input.type];
        // Không có productConfig (seed JSON mặc định / DB chưa cấu hình loại) → cho phép tất cả.
        // Chỉ enforce khi admin đã khai whitelist cho loại này trong "Cấu Hình Sản Phẩm Offset".
        // (Khớp pricing-data: productConfig optional; thiếu = form đầy đủ, engine vẫn tính được.)
        if (!cfg) {
            return;
        }
        const v = input as any;
        const check = (val: any, allowed: string[] | undefined, label: string, normalize = false) => {
            // Field không dùng (bỏ trống / "Không") → bỏ qua.
            if (val == null || val === '' || val === 'Không') return;
            // allowed* rỗng/thiếu = cho phép TẤT CẢ (khớp OffsetProductConfig docs).
            // Chỉ chặn khi whitelist được khai tường minh và giá trị nằm ngoài.
            if (!allowed || allowed.length === 0) return;
            const norm = (s: string) => (normalize ? chuanHoaKho(s) : String(s));
            const target = norm(String(val));
            if (!allowed.some((a) => norm(a) === target)) {
                throw new OffsetPricingError(`${label} "${val}" không nằm trong danh sách cho phép của loại sản phẩm`);
            }
        };
        check(v.materialCode, cfg.allowedMaterials, 'Giấy in');
        check(v.khoIn, cfg.allowedKhoIn, 'Khổ in', true);
        check(v.kichThuoc, cfg.allowedKichThuoc, 'Kích thước');
        check(v.epKimViTri, cfg.allowedEpKim, 'Ép kim');
        check(v.vatTuBeMat, cfg.allowedVatTuBeMat, 'Vật tư bề mặt');
        check(v.boxType, cfg.allowedBoxTypes, 'Loại khuôn');
    }

    calculate(input: OffsetEngineInput): OffsetEngineResult {
        try {
            const d = this.getPricingData();
            this.validateAgainstConfig(input, d); // fail-closed: ném nếu chưa cấu hình
            let data: QuoteResult;
            switch (input.type) {
                case 'to_roi': data = tinhToRoi(input, d); break;
                case 'bi_thu_folder': data = tinhBiThuFolder(input, d); break;
                case 'sp_khac': data = tinhSpKhac(input, d); break;
                case 'hop_giay': data = tinhHopGiay(input, d); break;
                case 'tui_giay': data = tinhTuiGiay(input, d); break;
                default:
                    return { success: false, error: `Loại sản phẩm offset không được hỗ trợ: ${(input as any).type}` };
            }
            const matCode = (input as any).materialCode;
            const khoGiayLon = data.meta?.khoGiayLon;
            if (matCode && khoGiayLon) {
                const mat = d.materials.find((m) => m.code === matCode);
                const parentCfg = docKichThuocCm(String(khoGiayLon));
                if (mat && mat.sheetWidth && mat.sheetHeight && parentCfg) {
                    const mW = Math.min(mat.sheetWidth, mat.sheetHeight);
                    const mH = Math.max(mat.sheetWidth, mat.sheetHeight);
                    const pW = Math.min(parentCfg.w, parentCfg.h);
                    const pH = Math.max(parentCfg.w, parentCfg.h);
                    if ((Math.abs(mW - pW) > 1 || Math.abs(mH - pH) > 1) && data.meta?.parentSheetMismatch === undefined) {
                        data.meta = { ...data.meta, parentSheetMismatch: true };
                        data.warnings = [
                            ...(data.warnings ?? []),
                            `Khổ giấy lớn của khổ in (${khoGiayLon}) khác với khổ gốc của giấy "${mat.materialName}" (${mat.sheetWidth}×${mat.sheetHeight}cm). Hãy kiểm tra tương thích khổ giấy.`,
                        ];
                    }
                }
            }
            return { success: true, data };
        } catch (err) {
            if (err instanceof OffsetPricingError) {
                return { success: false, error: err.message };
            }
            this.logger.error('Offset engine error', err as any);
            return { success: false, error: err instanceof Error ? err.message : 'Lỗi tính giá offset' };
        }
    }
}
