# Design Document: offset-pricebook-revamp

## Overview

Spec này thay ruột nhánh báo giá IN OFFSET bằng `EngineOffset` — một lớp **hàm thuần TypeScript**
hiện thực trung thành bảng giá thật của tiệm trong file Excel `Báo giá OFFSET v7.2`. Thiết kế tách
làm ba tầng rõ ràng:

1. **ConfigStore (lưu trữ cấu hình)** — bảng cấu hình offset mới trong PostgreSQL, seed từ
   `báo giá/data/*.json` qua migration SQL idempotent, cho admin override qua CRUD.
2. **EngineOffset (lõi tính giá thuần)** — nhận `PricingData`, không phụ thuộc NestJS/DB, dễ chạy
   golden test khớp Excel. Gồm các hàm tra cứu chung và 5 hàm sản phẩm.
3. **Tầng tích hợp** — `OffsetController` (giữ nguyên prefix `/pricing/offset/*`) và `OffsetQuoteConfigurator`
   (dựng lại 5 form theo input Excel).

Nguyên tắc chủ đạo:
- **Khớp Excel ±1đ** là chuẩn nghiệm thu cao nhất; port theo thứ tự Tờ rơi → Bì thư/Folder → SP khác → Hộp → Túi.
- **Hàm thuần tách khỏi I/O**: mọi logic giá nằm trong hàm thuần nhận `PricingData`, để property test và golden test chạy nhanh, không cần DB.
- **Chuyển đổi an toàn**: `EngineCu` (`offset-loose-calculator`, `offset-box-calculator`, `offset-helper`) giữ tạm sau `FeatureFlag` cho tới khi 5 golden test khớp, rồi mới gỡ.
- **Không đụng digital**: không đổi `unified_products`, `pricing_tiers`, không đổi `/pricing/calculate`.

### Nguồn dữ liệu (đã bóc từ Excel)

| File | Nội dung | Khóa |
|---|---|---|
| `materials_clean.json` | 26 vật liệu: code, aliases, gsm, khổ tờ (W×H), priceVAT/priceNoVAT | `code` (+`aliases`) |
| `kho_in.json` | 11 khổ in: số con bài, số con tờ lớn, khổ giấy lớn, diện tích m², loại kẽm | `khoIn` |
| `fixed_sizes.json` | Định mức tờ rơi + bì thư/folder (đã tính sẵn số con) | `kichThuoc` |
| `gia_cong.json` | 14 công đoạn × 16 bậc + `billingMode` + `minChargeParam` | `code` |
| `kem.json` | Kẽm nhỏ/lớn theo số kẽm (bình bài) + `donGia1Kem` + `vatTuBeMat` (đơn giá/kg, số mặt) | `soKem`/`ten` |
| `ep_kim.json` | Ép kim 3 vị trí × 4 bậc, đơn vị hỗn hợp (trọn gói/đơn giá) | `viTri` |
| `ty_le.json` | `haoHut[]`, `params.*` (VAT, chiết khấu, MOQ, GiaMin), `mocSoLuong[]` (17 mốc) | — |
| `phi_co_dinh.json` | Khuôn bế thường 400k, khuôn hộp 500k, thiết kế 500k | `code` |

### Quyết định lưu trữ cấu hình (đã chốt)

**Phương án: Bảng cấu hình offset mới trong DB + migration SQL idempotent + seed từ `data/*.json`.**

- Vì `synchronize=false`, tạo bảng mới bắt buộc kèm migration thủ công. Migration dùng
  `CREATE TABLE IF NOT EXISTS` và seed dùng `INSERT ... ON CONFLICT DO NOTHING` để idempotent.
- JSON là **nguồn mặc định để seed**; DB là **nguồn chân lý lúc chạy** và cho admin override.
- `EngineOffset` chỉ phụ thuộc cấu trúc `PricingData`. Lúc chạy, một adapter (`ConfigStore`) đọc DB →
  dựng `PricingData`. Khi golden test, một adapter khác đọc thẳng JSON → dựng `PricingData`. Nhờ vậy
  lõi tính giá không bị ràng buộc nguồn dữ liệu, và golden test luôn so với cùng bộ số gốc Excel.
- Lý do tối giản cho tiệm nhỏ: seed một lần, admin sửa được số nào cần; không phải bảo trì hai nguồn
  song song vì JSON chỉ dùng cho seed + test.

## Architecture

```mermaid
flowchart TD
    subgraph FE[Frontend]
        CFG[OffsetQuoteConfigurator\n5 form theo loại]
    end
    subgraph BE[Backend NestJS]
        CTRL[OffsetController\n/pricing/offset/*]
        FLAG{FeatureFlag\nengine?}
        ENGNEW[EngineOffset\nhàm thuần]
        ENGOLD[EngineCu\ngiữ tạm]
        CFGSTORE[ConfigStore\nDB adapter -> PricingData]
    end
    subgraph DB[(PostgreSQL)]
        T[(Bảng cấu hình offset mới)]
    end
    subgraph SEED[Seed/Test]
        JSON[data/*.json]
    end

    CFG -->|POST calculate type+input| CTRL
    CFG -->|GET master-data| CTRL
    CTRL --> FLAG
    FLAG -->|mới| ENGNEW
    FLAG -->|cũ tạm thời| ENGOLD
    ENGNEW --> CFGSTORE
    CFGSTORE --> T
    JSON -->|migration seed idempotent| T
    JSON -.->|golden test nạp trực tiếp| ENGNEW
```

### Luồng chính (tính giá)

1. `Configurator` gửi `POST /pricing/offset/calculate` với `{ type, ...input }`.
2. `OffsetController` đọc `FeatureFlag`; mặc định giai đoạn chuyển đổi → `EngineOffset`.
3. `EngineOffset` lấy `PricingData` từ `ConfigStore` (DB), định tuyến theo `type` tới 1 trong 5 hàm sản phẩm.
4. Hàm sản phẩm dựng `QuoteResult` (lines + tổng + donGia1SP) trả về `Controller` → `Configurator`.

### Cấu trúc thư mục đề xuất (backend)

```
backend/src/modules/pricing/offset-engine/
  data/                      # bản sao data/*.json đóng gói (seed + test)
  lookups.ts                 # giaGiay, pickRate, chiPhiGiaCong, chiPhiEpKim, kẽm, cán màng, haoHut, chuanHoaKho, soConTrenKho
  totals.ts                  # tổng chưa VAT, VAT, chiết khấu, khách trả, donGia1SP
  products/
    to-roi.ts                # tinhToRoi
    bi-thu-folder.ts         # tinhBiThuFolder
    sp-khac.ts               # tinhSpKhac
    hop-giay.ts              # tinhHopGiay
    tui-giay.ts              # tinhTuiGiay
  pricing-data.ts            # type PricingData + loader từ JSON (test) 
  engine-offset.service.ts   # NestJS wrapper: nạp PricingData từ ConfigStore, định tuyến theo type
  config-store.service.ts    # đọc/ghi bảng cấu hình offset (DB) -> PricingData
  __tests__/                 # property tests + golden tests
backend/migrations/
  offset_pricebook_config.sql   # migration idempotent + seed
```

## Components and Interfaces

### ConfigStore (config-store.service.ts)

```ts
interface ConfigStore {
  loadPricingData(): Promise<PricingData>;            // dựng PricingData từ DB
  // CRUD theo nhóm cấu hình (admin)
  listMaterials(): Promise<OffsetMaterial[]>;
  upsertMaterial(m: OffsetMaterial): Promise<OffsetMaterial>;
  deleteMaterial(code: string): Promise<void>;
  // ... tương tự cho kho_in, fixed_sizes, gia_cong, kem, ep_kim, params, phi_co_dinh
}
```

### EngineOffset (lõi thuần)

```ts
type ProductType = 'to_roi' | 'bi_thu_folder' | 'sp_khac' | 'hop_giay' | 'tui_giay';

interface QuoteLine { label: string; qty?: number; unitPrice?: number; amount: number; }
interface QuoteResult {
  lines: QuoteLine[];
  tongChuaVAT: number; haoHut: number; vat: number; tongGomVAT: number;
  chietKhau: number; khachTra: number; donGia1SP: number;
}

// Lookups (lookups.ts)
function giaGiay(code: string, d: PricingData): number;
function pickRate(sl: number, tiers: {price: number}[], mocSoLuong: number[]): number;
function chiPhiGiaCong(code: string, sl: number, d: PricingData): number;
function chiPhiEpKim(viTri: string, sl: number, d: PricingData): number;
function chiPhiLamKem(loaiKem: 'nho'|'lon', soKem: number, d: PricingData): number;
function chiPhiBinhBai(loaiKem: 'nho'|'lon', soKem: number, luotIn: number, d: PricingData): number;
function chiPhiCanMang(khoBinh: string, vatTuBeMat: string, soMatIn: number, soToLon: number, d: PricingData): number;
function haoHut(sl: number, d: PricingData): number;            // trả tỷ lệ
function chuanHoaKho(s: string): string;                        // "43 x 65cm" -> "43cm x 65cm"
function dienTichKho(khoBinh: string, d: PricingData): number;  // tra kho_in sau chuẩn hóa
function soConTrenKho(khoW: number, khoH: number, baiW: number, baiH: number, gap?: number): number;

// Totals (totals.ts)
function tongHopKetQua(lines: QuoteLine[], baseSXTK: number, sl: number, d: PricingData, chietKhauRate?: number): QuoteResult;

// Products (products/*.ts)
function tinhToRoi(input: ToRoiInput, d: PricingData): QuoteResult;
function tinhBiThuFolder(input: BiThuFolderInput, d: PricingData): QuoteResult;
function tinhSpKhac(input: SpKhacInput, d: PricingData): QuoteResult;
function tinhHopGiay(input: HopGiayInput, d: PricingData): QuoteResult;
function tinhTuiGiay(input: TuiGiayInput, d: PricingData): QuoteResult;
```

### OffsetController (giữ prefix)

- `POST /pricing/offset/calculate` — nhận `{ type, ...input }`, đọc `FeatureFlag`, định tuyến tới
  `EngineOffset` (hoặc `EngineCu` trong giai đoạn chuyển đổi), trả `QuoteResult`.
- `GET /pricing/offset/master-data` — trả cấu hình từ `ConfigStore` cho dropdown.
- CRUD admin (`AuthGuard('jwt')`) cho từng nhóm cấu hình offset mới.

## Data Models

### PricingData (cấu trúc nạp một lần)

```ts
interface OffsetMaterial { code: string; aliases: string[]; materialName: string; type: string; gsm: number; priceVAT: number; priceNoVAT: number; sheetWidth: number; sheetHeight: number; }
interface KhoIn { khoIn: string; chiaTo: string; soConBaiIn: number; soConToLon: number; khoGiayLon: string; dienTichM2: number; loaiKem: 'Kẽm nhỏ'|'Kẽm lớn'; }
interface FixedSizeToRoi { kichThuoc: string; khoIn: string; khoGiayLon: string; soConBaiIn: number; soConToLon: number; }
interface FixedSizeBiThu { kichThuoc: string; khoIn: string; khoGiayLon: string; soConBaiIn: number; soConKhoGiayLon: number; loai: 'bithu'|'folder'; }
interface GiaCongTier { min: number; max: number|null; price: number|null; }
interface GiaCong { code: string; congDoan: string; tiers: GiaCongTier[]; billingMode: 'minCharge'|'perUnit'|'external'; minChargeParam: string|null; moqParam: string; }
interface KemRow { soKem: number; donGia: number; }
interface VatTuBeMat { ten: string; donGiaKg: number; soMat: '1 mặt'|'2 mặt'|null; }
interface EpKimRow { viTri: string; duoi100: number; tu100_499: number; tu500_999: number; tren1000: number; }
interface HaoHutRow { mocSoLuong: number; tyLe: number; }
interface PhiCoDinh { code: string; ten: string; giaTri: number; }
interface Params { MOQ_GiaCong: number; MOQ_BinhBai_Nho: number; MOQ_BinhBai_Lon: number; GiaMin_XLBM: number; GiaMin_Be: number; GiaMin_DanHop: number; GiaMin_DongGoi: number; TyLe_VAT: number; TyLe_ChietKhau: number; TyLe_ChietKhau_Max: number; }

interface PricingData {
  materials: OffsetMaterial[];
  khoIn: KhoIn[];
  fixedSizes: { toRoi: FixedSizeToRoi[]; biThuFolder: FixedSizeBiThu[]; };
  giaCong: GiaCong[];
  kem: { kemNho: KemRow[]; kemLon: KemRow[]; vatTuBeMat: VatTuBeMat[]; donGia1Kem: { kemNho: number; kemLon: number }; };
  epKim: { tiers: string[]; rows: EpKimRow[]; };
  tyLe: { haoHut: HaoHutRow[]; params: Params; mocSoLuong: number[]; };
  phiCoDinh: PhiCoDinh[];
}
```

### Lược đồ bảng cấu hình offset (DB mới, migration idempotent)

Các bảng (prefix `offset_cfg_`) ánh xạ 1-1 với các nhóm JSON. Lưu cột giá trị phức hợp dạng `JSONB`
khi cần (vd `tiers`, `aliases`) để giữ tối giản cho tiệm nhỏ:

| Bảng | Cột chính |
|---|---|
| `offset_cfg_material` | `code` (PK), `aliases JSONB`, `material_name`, `type`, `gsm`, `price_vat`, `price_no_vat`, `sheet_w`, `sheet_h` |
| `offset_cfg_kho_in` | `kho_in` (PK), `chia_to`, `so_con_bai_in`, `so_con_to_lon`, `kho_giay_lon`, `dien_tich_m2`, `loai_kem` |
| `offset_cfg_fixed_size` | `id` (PK), `nhom` (`to_roi`/`bi_thu_folder`), `kich_thuoc`, `kho_in`, `kho_giay_lon`, `so_con_bai_in`, `so_con_to_lon`, `so_con_kho_giay_lon`, `loai` |
| `offset_cfg_gia_cong` | `code` (PK), `cong_doan`, `tiers JSONB`, `billing_mode`, `min_charge_param`, `moq_param` |
| `offset_cfg_kem` | `id` (PK), `bang` (`kemNho`/`kemLon`), `so_kem`, `don_gia` |
| `offset_cfg_vat_tu_be_mat` | `ten` (PK), `don_gia_kg`, `so_mat` |
| `offset_cfg_ep_kim` | `vi_tri` (PK), `duoi100`, `tu100_499`, `tu500_999`, `tren1000` |
| `offset_cfg_hao_hut` | `moc_so_luong` (PK), `ty_le` |
| `offset_cfg_param` | `ten` (PK), `gia_tri` |
| `offset_cfg_phi_co_dinh` | `code` (PK), `ten`, `gia_tri` |

Migration: `CREATE TABLE IF NOT EXISTS ...` + seed `INSERT ... ON CONFLICT (pk) DO NOTHING`. Engine cũ
(`offset_machine_config`, `plate_pricing`, `waste_rules`) **không bị xóa trong migration này**; chỉ gỡ
ở bước cuối sau khi golden test khớp (Requirement 21).

### Input model của 5 loại sản phẩm (tóm tắt)

```ts
interface ToRoiInput { type:'to_roi'; kichThuoc:string; materialCode:string; soMatIn:1|2; soLuong:number; soKemIn:number; vatTuBeMat:string; khuon:boolean; thanhPhamGap:'khong'|'tc'|'may'; catXen:boolean; dongGoi:boolean; thietKe:number; chietKhauRate?:number; }
interface BiThuFolderInput { type:'bi_thu_folder'; kichThuoc:string; materialCode:string; soMatIn:1|2; soLuong:number; soKemIn:number; vatTuBeMat:string; khuon:boolean; catXen:boolean; dongGoi:boolean; thietKe:number; chietKhauRate?:number; }
interface SpKhacInput { type:'sp_khac'; khoIn:string; materialCode:string; soMatIn:1|2; soLuong:number; soKemIn:number; vatTuBeMat:string; khuon:boolean; be:boolean; epKimViTri:string; thanhPhamGap:'khong'|'tc'|'may'; catXen:boolean; dongGoi:boolean; thietKe:number; chietKhauRate?:number; }
interface HopGiayInput { type:'hop_giay'; loaiHop:'day_thuong'|'day_gai_dan'; cao:number; rong:number; hong:number; materialCode:string; soMatIn:1|2; soLuong:number; soKemIn:number; vatTuBeMat:string; boi2Lop:boolean; danHop:boolean; thietKe:number; chietKhauRate?:number; }
interface TuiGiayInput { type:'tui_giay'; cao:number; rong:number; hong:number; mi:number; materialCode:string; soMatIn:1|2; soLuong:number; soKemIn:number; vatTuBeMat:string; danNoi:boolean; dayXach:{sl:number;donGia:number}; thungCaton:{sl:number;donGia:number}; thietKe:number; chietKhauRate?:number; }
```

## Correctness Properties

*Một thuộc tính (property) là đặc trưng hoặc hành vi phải đúng trên mọi lần thực thi hợp lệ của hệ
thống — một phát biểu hình thức về việc hệ thống phải làm gì. Các thuộc tính là cầu nối giữa đặc tả
đọc được bởi con người và đảm bảo đúng đắn kiểm chứng được bằng máy.*

EngineOffset là tập hàm thuần xử lý dữ liệu giá, có nhiều thuộc tính phổ quát (round-trip, bất biến,
đơn điệu, đơn vị hỗn hợp) nên rất phù hợp property-based testing. Các thuộc tính dưới đây được rút từ
phần Prework và đã loại bỏ trùng lặp.

### Property 1: pickRate chọn đúng bậc theo MocSoLuong

*Với mọi* số lượng không âm và mọi dãy `tiers` không rỗng, `pickRate` SHALL trả về phần tử tại vị trí
của ngưỡng lớn nhất trong `MocSoLuong` nhỏ hơn hoặc bằng số lượng, giới hạn tại phần tử cuối của `tiers`;
và kết quả là đơn điệu không tăng theo bậc khi `tiers` là dãy đơn giá không tăng.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 2: chiPhiGiaCong đúng theo BillingMode

*Với mọi* công đoạn và số lượng dương: nếu `billingMode` là `minCharge` và số lượng dưới `MOQ_GiaCong`
thì kết quả bằng giá tối thiểu theo `minChargeParam`, ngược lại bằng đơn giá bậc nhân số lượng; nếu
`perUnit` thì luôn bằng đơn giá bậc nhân số lượng.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 3: chiPhiEpKim tôn trọng đơn vị hỗn hợp

*Với mọi* vị trí ép kim hợp lệ và số lượng dương: khi số lượng dưới 100 kết quả bằng đúng giá trọn gói
`duoi100` (không phụ thuộc số lượng); khi số lượng từ 100 trở lên kết quả bằng đơn giá bậc tương ứng
nhân số lượng; khi vị trí là "Không" kết quả bằng 0.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 4: chiPhiBinhBai scale theo lượt in quanh MOQ

*Với mọi* loại kẽm, số kẽm hợp lệ và số lượt in dương: khi lượt in nhỏ hơn hoặc bằng `MOQ_BinhBai` kết
quả bằng giá gốc bình bài; khi lớn hơn kết quả bằng giá gốc nhân lượt in chia `MOQ_BinhBai`; và kết quả
là hàm không giảm theo lượt in.

**Validates: Requirements 5.2, 5.3, 5.4**

### Property 5: soConTrenKho không âm, đối xứng hai chiều và đơn điệu theo khổ

*Với mọi* khổ giấy lớn và kích thước con bài dương: `soConTrenKho` trả về số nguyên không âm; hoán đổi
chiều rộng và chiều cao của khổ giấy lớn không làm đổi kết quả (đối xứng); và khi phóng to khổ giấy lớn
theo cả hai chiều, kết quả không giảm. Khi một chiều con bài lớn hơn cả hai chiều khổ, kết quả bằng 0.

**Validates: Requirements 10.1, 10.3**

### Property 6: chuẩn hóa khổ giúp tra cứu nhất quán (round-trip)

*Với mọi* bản ghi `kho_in`, áp dụng `chuanHoaKho` lên chuỗi khổ của bản ghi đó rồi tra cứu SHALL trả về
đúng bản ghi ban đầu; và hai chuỗi khổ cùng kích thước nhưng khác định dạng SHALL chuẩn hóa về cùng một
chuỗi.

**Validates: Requirements 9.1, 9.2**

### Property 7: haoHut chọn đúng bậc và đơn điệu không tăng theo số lượng

*Với mọi* số lượng dương, `haoHut` SHALL trả về tỷ lệ ứng với ngưỡng lớn nhất trong bảng hao hụt nhỏ
hơn hoặc bằng số lượng; và tỷ lệ là hàm không tăng theo số lượng.

**Validates: Requirements 8.1**

### Property 8: chiết khấu chỉ áp trên chi phí sản xuất và thiết kế, có trần

*Với mọi* QuoteResult dựng từ các dòng chi phí và một base sản xuất+thiết kế: chiết khấu bằng base nhân
tỷ lệ chiết khấu (đã giới hạn ở `TyLe_ChietKhau_Max`), độc lập với chi phí giấy, kẽm và vật tư; và khách
trả bằng tổng gồm VAT trừ chiết khấu.

**Validates: Requirements 11.3, 11.4, 11.5**

### Property 9: tra giá vật liệu theo code và alias là nhất quán

*Với mọi* bản ghi vật liệu, tra theo `code` và tra theo bất kỳ phần tử nào trong `aliases` SHALL trả về
cùng một `priceVAT`.

**Validates: Requirements 2.1, 2.2**

### Property 10: chiPhiCanMang tỷ lệ với diện tích, số mặt và số tờ

*Với mọi* khổ in hợp lệ, vật tư bề mặt khác "Không", số mặt và số tờ lớn dương: `chiPhiCanMang` bằng
diện tích mét vuông nhân đơn giá theo kg nhân số mặt nhân số tờ lớn; và bằng 0 khi vật tư bề mặt là "Không".

**Validates: Requirements 7.1, 7.2**

## Error Handling

- **Thiếu/sai dữ liệu cấu hình**: `ConfigStore.loadPricingData` ném lỗi mô tả nhóm cấu hình bị thiếu; migration không seed đè dữ liệu đã có.
- **Mã vật liệu không tồn tại**: `giaGiay` ném lỗi nêu rõ mã (Requirement 2.3).
- **Khổ không tra được**: sau `chuanHoaKho` nếu không khớp `kho_in`, ném lỗi nêu chuỗi khổ (Requirement 9.3).
- **Loại sản phẩm không hợp lệ**: `OffsetController` trả lỗi 400 mô tả `type` không hỗ trợ (Requirement 17.4).
- **Input số âm/0 ở trường bắt buộc** (soLuong, kích thước): hàm sản phẩm trả lỗi xác thực trước khi tính.
- **Số lượng bằng 0 khi chia donGia1SP**: chặn bằng xác thực `soLuong >= 1`.
- **CRUD admin không xác thực**: chặn bằng `AuthGuard('jwt')` (Requirement 18.4).

## Testing Strategy

### Cách tiếp cận kép
- **Property tests (fast-check, ≥100 iteration)** cho các hàm thuần phổ quát: Property 1–10 ở trên.
- **Golden tests** so `donGia1SP` với Excel (±1đ) cho 5 loại sản phẩm — chuẩn nghiệm thu cao nhất, đặt làm checkpoint chặn giữa các loại.
- **Unit tests** cho ví dụ cụ thể, biên và lỗi (mã vật liệu sai, khổ không tra được, type không hợp lệ).
- **Integration test** mỏng cho `OffsetController` (định tuyến theo `type`, master-data, CRUD) và migration idempotent (chạy 2 lần không nhân bản ghi).

### Thư viện và quy ước
- PBT dùng **fast-check** (đã dùng trong repo, vd `quote-page-ux`). Không tự hiện thực PBT.
- Mỗi property test cấu hình tối thiểu 100 iteration.
- Mỗi property test gắn tag: `Feature: offset-pricebook-revamp, Property {số}: {tiêu đề}`.
- Mỗi correctness property hiện thực bằng **một** property test.
- Golden test: với mỗi loại, lấy bộ input mặc định của sheet Excel tương ứng; nếu chưa rút được con số kỳ vọng, tạo khung test kèm `TODO` để điền sau (Requirement 20.3).
- ConfigStore/Controller test dùng mock hoặc DB test, không thuộc PBT (thuần CRUD/IaC).

### Sáu "bẫy" khi port (kiểm trong golden + unit test)
1. Chuẩn hóa định dạng khổ trước khi tra diện tích (`"43 x 65cm"` vs `"43cm x 65cm"`).
2. Đơn vị hỗn hợp: không nhân SL với giá trọn gói (ép kim `duoi100`, các công đoạn `minCharge` dưới MOQ).
3. Alias vật liệu (vd "Duplex 250" → `D250`).
4. Phạm vi chiết khấu chỉ trên sản xuất + thiết kế.
5. Mục "(dán nối)" của túi không có trong `kho_in` — xử lý khổ ghép thủ công riêng.
6. Công thức khổ trải túi/hộp theo PRICING_SPEC mục 4.
