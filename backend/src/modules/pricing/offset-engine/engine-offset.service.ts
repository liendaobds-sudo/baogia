import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { PricingData, QuoteResult, OffsetPricingError } from './pricing-data';
import { chuanHoaKho } from './lookups';
import { loadDefaultPricingData } from './default-data';
import { ConfigStore } from './config-store.service';
import { tenantRlsEnabled } from '../../../common/tenant/tenant-background';
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
    private cached: PricingData | null = null;

    /**
     * ConfigStore là tùy chọn: khi chạy trong NestJS sẽ được inject để nạp cấu hình từ DB;
     * khi dùng trong test thuần (`new EngineOffsetService()`) thì bỏ qua, dùng JSON đóng gói.
     */
    constructor(@Optional() private readonly configStore?: ConfigStore) {}

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

    /** Nạp lại PricingData từ ConfigStore (DB) và làm mới cache. */
    async refreshFromConfigStore(): Promise<void> {
        if (!this.configStore) return;
        this.cached = await this.configStore.loadPricingData();
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
     *  - Whitelist CÓ cấu hình + giá trị nằm NGOÀI  → lỗi cứng (chặn tính).
     *  - Whitelist RỖNG/chưa cấu hình nhưng trường đang dùng → KHÔNG chặn, trả cảnh báo
     *    để nhắc admin cấu hình (vẫn tính bình thường các mục khác).
     * Trả về danh sách cảnh báo (rỗng = không có).
     */
    private validateAgainstConfig(input: OffsetEngineInput, d: PricingData): string[] {
        const warnings: string[] = [];
        const cfg = d.productConfig?.[input.type];
        if (!cfg) return warnings;
        const v = input as any;
        const check = (val: any, allowed: string[] | undefined, label: string, normalize = false) => {
            if (val == null || val === '' || val === 'Không') return;
            if (!allowed || allowed.length === 0) {
                warnings.push(`${label} đang dùng nhưng loại sản phẩm này chưa cấu hình whitelist — vào "Cấu Hình Sản Phẩm Offset" để thiết lập.`);
                return;
            }
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
        return warnings;
    }

    calculate(input: OffsetEngineInput): OffsetEngineResult {
        try {
            const d = this.getPricingData();
            const cfgWarnings = this.validateAgainstConfig(input, d);
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
            if (cfgWarnings.length) data.warnings = [...(data.warnings ?? []), ...cfgWarnings];
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
