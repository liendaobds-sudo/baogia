/**
 * Nạp PricingData mặc định (đóng gói trong `./data/*.json`).
 *
 * Đây là NGUỒN MẶC ĐỊNH (seed) cho engine offset. ConfigStore (DB) sẽ override khi admin sửa;
 * khi chưa có DB hoặc DB rỗng, engine dùng dữ liệu mặc định này. Các file JSON khớp 1-1 với
 * cấu trúc PricingData (do script bóc dữ liệu sinh ra).
 *
 * Dùng `require` (CommonJS) để nạp JSON trực tiếp — tránh phụ thuộc esModuleInterop khi import default.
 *
 * _Requirements: 1.2, 1.5_
 */
import type {
    PricingData, OffsetMaterial, KhoIn, GiaCong, EpKimRow, HaoHutRow, PhiCoDinh, Params, KemRow, VatTuBeMat,
    FixedSizeToRoi, FixedSizeBiThu,
} from './pricing-data';

/* eslint-disable @typescript-eslint/no-var-requires */
const materials = require('./data/materials_clean.json') as OffsetMaterial[];
const khoIn = require('./data/kho_in.json') as KhoIn[];
const fixedSizes = require('./data/fixed_sizes.json') as { toRoi: FixedSizeToRoi[]; biThuFolder: FixedSizeBiThu[] };
const giaCong = require('./data/gia_cong.json') as GiaCong[];
const kem = require('./data/kem.json') as {
    kemNho: KemRow[]; kemLon: KemRow[]; vatTuBeMat: VatTuBeMat[]; donGia1Kem: { kemNho: number; kemLon: number };
};
const epKim = require('./data/ep_kim.json') as { tiers: string[]; rows: EpKimRow[] };
const tyLe = require('./data/ty_le.json') as { haoHut: HaoHutRow[]; params: Params; mocSoLuong: number[] };
const phiCoDinh = require('./data/phi_co_dinh.json') as PhiCoDinh[];

export function loadDefaultPricingData(): PricingData {
    return {
        materials,
        khoIn,
        fixedSizes: { toRoi: fixedSizes.toRoi, biThuFolder: fixedSizes.biThuFolder },
        giaCong,
        kem: {
            kemNho: kem.kemNho,
            kemLon: kem.kemLon,
            vatTuBeMat: kem.vatTuBeMat,
            donGia1Kem: kem.donGia1Kem,
        },
        epKim: { tiers: epKim.tiers, rows: epKim.rows },
        tyLe: { haoHut: tyLe.haoHut, params: tyLe.params, mocSoLuong: tyLe.mocSoLuong },
        phiCoDinh,
    };
}
