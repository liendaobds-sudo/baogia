# Design Document: offset-pricebook-engine

## Overview

Engine báo giá IN OFFSET được làm mới hoàn toàn theo **Phương án A**: thay engine loose/box generic
bằng engine "bảng giá tiệm" bám sát file Excel `Báo giá OFFSET v7.2`. Engine cốt lõi là **lớp hàm thuần
TypeScript** (không phụ thuộc NestJS/DB), nhận dữ liệu từ `PricingData` (nạp các file JSON đóng gói) và
trả về `QuoteResult`. Controller NestJS chỉ là lớp mỏng định tuyến theo `type` rồi gọi Engine.

Mục tiêu nghiệm thu: với bộ input mặc định của từng sheet Excel, `donGia1SP` khớp Excel (±1đ).

### Quyết định kiến trúc (đã chốt)

| Quyết định | Lựa chọn | Lý do |
|---|---|---|
| Mô hình giá | Bảng giá tiệm theo Excel | Engine cũ lệch giá, làm sơ sài |
| Khổ tùy chỉnh (túi/hộp/SP khác) | Hàm xếp con tối ưu (`soConTrenKho`) | Thay mô hình máy generic, bám Excel mục 5.2 |
| Tương thích đơn cũ | Không cần | Đơn offset cũ mới sơ sài |
| Endpoint & FE | Giữ prefix `/pricing/offset/*` và `OffsetQuoteConfigurator` | Không vỡ định tuyến |
| Nguồn dữ liệu (GĐ1) | JSON bundled trong backend | Không đổi schema DB, `synchronize=false`, không seed |
| Tách lớp | Engine = hàm thuần; Controller = lớp mỏng | Test khớp Excel dễ dàng |
| Admin sửa cấu hình DB | Giai đoạn 2 (ngoài phạm vi) | Tập trung khớp giá trước |

### Ngoài phạm vi (ghi nhận)

- Màn admin sửa cấu hình bằng DB (giai đoạn 2).
- Tích hợp lưu đơn vào `/erp/orders`.
- Đối chiếu/di trú dữ liệu với engine offset cũ.

## Architecture

```mermaid
flowchart TD
    FE[OffsetQuoteConfigurator (frontend)] -->|POST /pricing/offset/calculate {type, ...}| CTRL[OffsetController (lớp mỏng)]
    CTRL -->|route theo type| ENGINE[offset-pricebook engine (hàm thuần)]
    ENGINE --> DATA[(PricingData: JSON bundled)]
    subgraph Engine thuần TS
      ENGINE --> LK[Tầng lookups thuần]
      LK --> P1[tinhToRoi]
      LK --> P2[tinhBiThuFolder]
      LK --> P3[tinhSpKhac]
      LK --> P4[tinhHopGiay]
      LK --> P5[tinhTuiGiay]
    end
    P1 & P2 & P3 & P4 & P5 --> RESULT[QuoteResult]
    RESULT --> CTRL --> FE
```

Cấu trúc thư mục đề xuất (backend):

```
backend/src/modules/pricing/offset-pricebook/
  data/                         # copy báo giá/data/*.json (bundled, GĐ1)
    materials_clean.json, vat_tu.json, kho_in.json, fixed_sizes.json,
    gia_cong.json, kem.json, ep_kim.json, ty_le.json, phi_co_dinh.json
  pricing-data.ts               # PricingData: nạp JSON 1 lần + lookups dữ liệu thô
  lookups.ts                    # hàm thuần: giaGiay, pickRate, chiPhiGiaCong, chiPhiEpKim, kẽm, XLBM, haoHut, chuanHoaKho, soConTrenKho
  types.ts                      # QuoteLine, QuoteResult, *Input
  products/
    to-roi.ts                   # tinhToRoi
    bi-thu-folder.ts            # tinhBiThuFolder
    sp-khac.ts                  # tinhSpKhac
    hop-giay.ts                 # tinhHopGiay
    tui-giay.ts                 # tinhTuiGiay
  index.ts                      # export engine + dispatch theo type
```

Controller hiện tại (`controllers/offset.controller.ts`) giữ prefix `/pricing/offset`; route
`POST /pricing/offset/calculate` được trỏ sang engine mới qua một service mỏng
(`offset-pricebook.service.ts`) thay cho `OffsetCalculatorService` cũ. Các endpoint CRUD master-data
giữ nguyên (giai đoạn 2 mới dùng tới); không xoá để tránh vỡ định tuyến.

## Components and Interfaces

### PricingData

- `loadPricingData(): PricingData` — nạp toàn bộ JSON một lần (module-level singleton/cache).
- Trường: `materials`, `vatTu`, `khoIn`, `fixedSizes`, `giaCong`, `kem`, `epKim`, `tyLe`, `phiCoDinh`.

### Tầng lookups thuần (`lookups.ts`)

```ts
giaGiay(code: string, data: PricingData): number
pickRate(sl: number, tiers: { price: number }[], mocSoLuong: number[]): number
chiPhiGiaCong(code: string, sl: number, data: PricingData): number   // theo billingMode
chiPhiEpKim(viTri: string, sl: number, data: PricingData): number    // đơn vị hỗn hợp
chiPhiLamKem(soKem: number, loaiKem: 'Kẽm nhỏ' | 'Kẽm lớn', data: PricingData): number
chiPhiBinhBai(soKem: number, loaiKem: string, luotIn: number, data: PricingData): number
chiPhiVatTuBeMat(khoBinh: string, vatTu: string, soToLon: number, data: PricingData): number
haoHut(sl: number, data: PricingData): number
chuanHoaKho(kho: string): string                                     // chuẩn hóa định dạng khổ
traKhoIn(kho: string, data: PricingData): KhoInRecord                // dùng chuanHoaKho
soConTrenKho(khoW: number, khoH: number, baiW: number, baiH: number, gap?: number): number
chonKhoToiUu(baiW: number, baiH: number, data: PricingData): { khoGiayLon: string; soCon: number }
```

### Hàm sản phẩm (`products/*.ts`)

```ts
tinhToRoi(input: ToRoiInput, data: PricingData): QuoteResult
tinhBiThuFolder(input: BiThuFolderInput, data: PricingData): QuoteResult
tinhSpKhac(input: SpKhacInput, data: PricingData): QuoteResult
tinhHopGiay(input: HopGiayInput, data: PricingData): QuoteResult
tinhTuiGiay(input: TuiGiayInput, data: PricingData): QuoteResult
```

### Khung tổng cuối dùng chung (`lookups.ts` hoặc `index.ts`)

```ts
// Nhận các dòng chi phí đã phân loại, áp khoản 14→20 (tổng, hao hụt, VAT, chiết khấu, khách trả, donGia1SP)
finalize(params: {
  lines: QuoteLine[];
  sl: number;
  chiPhiSanXuatVaThietKe: number;   // cơ sở tính chiết khấu (KHÔNG gồm giấy/kẽm/vật tư)
  data: PricingData;
}): QuoteResult
```

### Controller / Service mỏng

```ts
// offset-pricebook.service.ts
calculate(input: { type: ProductType } & Record<string, unknown>): QuoteResult
// dispatch: to_roi → tinhToRoi, bi_thu_folder → tinhBiThuFolder, sp_khac → tinhSpKhac,
//           hop_giay → tinhHopGiay, tui_giay → tinhTuiGiay
```

## Data Models

```ts
type ProductType = 'to_roi' | 'bi_thu_folder' | 'sp_khac' | 'hop_giay' | 'tui_giay';

interface QuoteLine {
  label: string;
  qty?: number;
  unitPrice?: number;
  amount: number;
  group?: 'giay' | 'kem' | 'vatTu' | 'sanXuat' | 'thietKe'; // dùng để tính cơ sở chiết khấu
}

interface QuoteResult {
  lines: QuoteLine[];
  tongChuaVAT: number;
  haoHut: number;
  vat: number;
  tongGomVAT: number;
  chietKhau: number;
  khachTra: number;
  donGia1SP: number;
}

interface ToRoiInput {
  kichThuoc: string;            // từ fixed_sizes.toRoi
  materialCode: string;
  soMatIn: 1 | 2;
  soLuong: number;
  soKemIn: number;
  vatTuBeMat: string;           // từ kem.vatTuBeMat[].ten
  khuon: 'Có' | 'Không';
  thanhPhamGap: 'Không' | 'TP thủ công' | 'TP máy';
  catXen: 'Có' | 'Không';
  dongGoi: 'Có' | 'Không';
  be?: 'Có' | 'Không';
  thietKe: number;
}

interface BiThuFolderInput {
  kichThuoc: string;            // từ fixed_sizes.biThuFolder
  materialCode: string;
  soMatIn: 1 | 2;
  soLuong: number;
  soKemIn: number;
  vatTuBeMat: string;
  khuon: 'Có' | 'Không';
  dongGoi: 'Có' | 'Không';
  thietKe: number;
}

interface SpKhacInput {
  khoIn: string;                // từ kho_in
  materialCode: string;
  soMatIn: 1 | 2;
  soLuong: number;
  soKemIn: number;
  vatTuBeMat: string;
  khuon: 'Có' | 'Không';
  be?: 'Có' | 'Không';
  epKimViTri: 'Không' | '1 vị trí' | '2 vị trí' | '3 vị trí';
  catXen: 'Có' | 'Không';
  dongGoi: 'Có' | 'Không';
  thietKe: number;
}

interface HopGiayInput {
  loaiHop: 'day_thuong' | 'day_gai' | 'day_dan';
  cao: number; rong: number; hong: number;
  materialCode: string;
  soMatIn: 1 | 2;
  soLuong: number;
  soKemIn: number;
  vatTuBeMat: string;
  boi2Lop?: boolean;
  danHop?: 'Có' | 'Không';
  dongGoi: 'Có' | 'Không';
  thietKe: number;
}

interface TuiGiayInput {
  cao: number; rong: number; hong: number; mi: number;
  materialCode: string;
  soMatIn: 1 | 2;
  soLuong: number;
  soKemIn: number;
  vatTuBeMat: string;
  danNoi?: boolean;             // khổ ghép thủ công, không tra kho_in
  dayXach?: { soLuong: number; donGia: number };
  thungCaton?: { soLuong: number; donGia: number };
  thietKe?: number;             // mặc định Gia_ThietKe
}
```

Bảng dữ liệu (chỉ đọc) theo các file JSON đã khảo sát: `materials_clean.json` (code, aliases, priceVAT,
gsm, sheetWidth/Height), `kho_in.json` (khoIn, soConBaiIn, soConToLon, khoGiayLon, dienTichM2, loaiKem),
`fixed_sizes.json` (toRoi[], biThuFolder[]), `gia_cong.json` (code, tiers[16], billingMode, minChargeParam),
`kem.json` (kemNho[], kemLon[], vatTuBeMat[], donGia1Kem), `ep_kim.json` (rows[]), `ty_le.json`
(haoHut[], params, mocSoLuong[17]), `phi_co_dinh.json` (Gia_Khuon, Gia_Khuon_Hop, Gia_ThietKe).
