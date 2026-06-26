import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { PricingData, QuoteResult, OffsetPricingError } from './pricing-data';
import { chuanHoaKho } from './lookups';
import { loadDefaultPricingData } from './default-data';
import { ConfigStore } from './config-store.service';
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
            await this.configStore.seedDefaults();
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
     * Kiểm tra giá trị gửi lên có nằm trong whitelist của loại sản phẩm (`productConfig`) không —
     * để cấu hình nhà in là NGUỒN QUYỀN LỰC kể cả khi gọi API trực tiếp (không qua UI đã lọc).
     * Mảng allowed* rỗng/thiếu = cho phép tất cả. Giá trị rỗng / 'Không' luôn hợp lệ.
     */
    private validateAgainstConfig(input: OffsetEngineInput, d: PricingData): void {
        const cfg = d.productConfig?.[input.type];
        if (!cfg) return;
        const v = input as any;
        const check = (val: any, allowed: string[] | undefined, label: string, normalize = false) => {
            if (!allowed || allowed.length === 0) return;
            if (val == null || val === '' || val === 'Không') return;
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
            this.validateAgainstConfig(input, d);
            switch (input.type) {
                case 'to_roi': return { success: true, data: tinhToRoi(input, d) };
                case 'bi_thu_folder': return { success: true, data: tinhBiThuFolder(input, d) };
                case 'sp_khac': return { success: true, data: tinhSpKhac(input, d) };
                case 'hop_giay': return { success: true, data: tinhHopGiay(input, d) };
                case 'tui_giay': return { success: true, data: tinhTuiGiay(input, d) };
                default:
                    return { success: false, error: `Loại sản phẩm offset không được hỗ trợ: ${(input as any).type}` };
            }
        } catch (err) {
            if (err instanceof OffsetPricingError) {
                return { success: false, error: err.message };
            }
            this.logger.error('Offset engine error', err as any);
            return { success: false, error: err instanceof Error ? err.message : 'Lỗi tính giá offset' };
        }
    }
}
