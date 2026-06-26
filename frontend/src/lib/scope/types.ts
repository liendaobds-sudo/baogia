/**
 * Scope Registry types — nguồn sự thật cho việc phân loại tính năng của hệ ZeplaoPrint
 * vào ba nhóm `core | frozen | removed`.
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * Các kiểu ở đây hiện thực hoá artefact `scope-registry.json` và là đầu vào cho
 * IA Resolver (suy dẫn menu), validators (kiểm bất biến), và state machine vòng đời.
 *
 * _Requirements: 2.1, 2.4, 2.5, 5.7, 5.8, 7.3_
 */

/**
 * Phân loại phạm vi của một tính năng. Mỗi tính năng thuộc đúng MỘT trong ba nhóm.
 *
 * - `core`    : Tính_Năng_Lõi — phục vụ trực tiếp trục CSKH hoặc Báo giá, được giữ lại.
 * - `frozen`  : Trạng_Thái_Đóng_Băng — ẩn khỏi menu nhưng giữ nguyên code/route/dữ liệu, có thể bật lại.
 * - `removed` : Trạng_Thái_Gỡ_Bỏ — đã xoá khỏi codebase (chỉ sau khi đóng băng + sao lưu + verify).
 *
 * _Requirements: 2.1_
 */
export type ScopeClass = 'core' | 'frozen' | 'removed';

/**
 * Trục mà tính năng phục vụ.
 *
 * - `cskh`   : trục Chăm sóc khách hàng (App_CSKH).
 * - `baogia` : trục Báo giá (App_BaoGia).
 * - `shared` : dùng chung cho cả hai trục.
 * - `none`   : không thuộc trục Lõi nào (thường là ứng viên frozen/removed).
 */
export type Axis = 'cskh' | 'baogia' | 'shared' | 'none';

/**
 * Tiêu chí phân loại đã được áp dụng, tham chiếu trực tiếp tới acceptance criteria.
 *
 * - `2.2` : phục vụ bề mặt Lõi → `core`.
 * - `2.3` : ERP nâng cao → `frozen`.
 * - `2.4` : SaaS (Multi_Tenant, super-admin, subscription, payments) → `frozen` (cần `reenable`).
 *
 * _Requirements: 2.5_
 */
export type ClassificationRule = '2.2' | '2.3' | '2.4';

/**
 * Điều kiện và quy trình bật lại một tính năng đang ở Trạng_Thái_Đóng_Băng.
 *
 * BẮT BUỘC khi `ScopeEntry.scope === 'frozen'`.
 *
 * _Requirements: 2.4, 5.8_
 */
export interface ReenablePlan {
  /** Điều kiện kích hoạt việc bật lại, mô tả bằng tiêu chí có thể quan sát. */
  trigger: string;
  /** Các bước bật lại tính năng. */
  steps: string[];
  /** Kết quả mong đợi sau khi bật lại. */
  expected: string;
  /** Các bước bật lại cho từng tenant — BẮT BUỘC với tính năng Multi_Tenant. */
  perTenant?: string[];
}

/**
 * Bản sao lưu code và dữ liệu của một tính năng đã gỡ bỏ, kèm xác nhận khôi phục được.
 *
 * BẮT BUỘC khi `ScopeEntry.scope === 'removed'`.
 *
 * _Requirements: 5.7_
 */
export interface BackupRecord {
  /** Tham chiếu tới bản sao lưu code (ví dụ commit/branch/đường dẫn artefact). */
  codeBackupRef: string;
  /** Tham chiếu tới bản sao lưu dữ liệu liên quan. */
  dataBackupRef: string;
  /** Đã kiểm chứng bản sao lưu khôi phục được trước khi xoá hay chưa. */
  restoreVerified: boolean;
}

/** Mức rủi ro của một Endpoint_Không_Auth còn lại. _Requirements: 7.3_ */
export type UnauthEndpointRisk = 'high' | 'medium' | 'low';

/**
 * Định danh Phương_Pháp_In — quyết định công thức tính giá. Tập ban đầu gồm
 * `digital` (In_Nhanh) và `offset`; mở rộng được (vd. `large-format`) mà không
 * đổi định nghĩa Sản_Phẩm.
 *
 * Khớp với `MethodId` của tầng method-agnostic backend
 * (`backend/src/quote/types/method-plugin.types.ts`), được nhân bản ở frontend để
 * Scope Registry suy dẫn menu theo Cờ_Năng_Lực mà không phụ thuộc backend.
 *
 * _Requirements: 1.5, 2.3_
 */
export type MethodId = 'digital' | 'offset' | (string & {});

/**
 * Một bản ghi phân loại cho đúng một tính năng trong Đăng_Ký_Phạm_Vi.
 *
 * _Requirements: 2.1, 2.5, 2.6, 7.3_
 */
export interface ScopeEntry {
  /** Định danh duy nhất của tính năng trong registry. */
  id: string;
  /** Nhãn người đọc. */
  title: string;
  /** Đúng MỘT trong ba nhóm phân loại (Req 2.1). */
  scope: ScopeClass;
  /** Trục phục vụ. */
  axis: Axis;
  /** Tiêu chí phân loại đã áp dụng (Req 2.5). */
  rule: ClassificationRule;
  /** Lý do phân loại (Req 2.5). */
  reason: string;
  /** Tham chiếu tới code/route/menu của tính năng (Req 2.5). */
  featureRef: string;
  /** Mục menu tương ứng nếu có — dùng cho IA Resolver. */
  navItem?: string;
  /**
   * Phương_Pháp_In mà mục nav này gắn với, nếu có (vd. `offset`). Khi đặt, mục chỉ
   * hiển thị nếu Phương_Pháp_In đó thuộc tập Phương_Pháp_Khả_Dụng của Đơn_Vị; mục
   * không gắn `method` luôn giữ. Tái dùng `resolveMenu()`, không tạo cơ chế ẩn riêng
   * (Req 2.3).
   */
  method?: MethodId;
  /**
   * Các route liên quan tới tính năng, dùng để so khớp path điều hướng
   * (`candidateRoutesForEntry`) cho route guard. Thường là route backend (Req 6.6),
   * nhưng cũng có thể là các route frontend bổ sung của cùng tính năng/Phương_Pháp_In
   * (vd. các trang định mức theo phương pháp) khi một entry đại diện nhiều route.
   */
  backendRoutes?: string[];
  /** Phụ thuộc tới các thành phần Phụ đang ở frozen (Req 2.6). */
  dependsOnFrozen?: string[];
  /** Điều kiện/bước bật lại — BẮT BUỘC khi `scope === 'frozen'` (Req 2.4, 5.8). */
  reenable?: ReenablePlan;
  /** Sao lưu đã kiểm chứng — BẮT BUỘC khi `scope === 'removed'` (Req 5.7). */
  backup?: BackupRecord;
  /** Phân loại rủi ro nếu tính năng có Endpoint_Không_Auth (Req 7.3). */
  unauthEndpointRisk?: UnauthEndpointRisk;
}

/** Số mục menu chính baseline của một app trước khi rút gọn (Req 1.5). */
export interface BaselineEntry {
  app: 'cskh' | 'baogia';
  mainMenuCount: number;
}

/**
 * Toàn bộ Đăng_Ký_Phạm_Vi: baseline cho từng app + danh sách phân loại tính năng.
 *
 * _Requirements: 1.5, 2.1_
 */
export interface ScopeRegistry {
  /** Baseline số mục menu chính cho mỗi app, dùng để kiểm chứng menu nhỏ lại (Req 1.5). */
  baseline: BaselineEntry[];
  /** Danh sách đầy đủ các bản ghi phân loại. */
  entries: ScopeEntry[];
}

/**
 * Một mục menu hiển thị, suy dẫn từ registry bởi IA Resolver.
 */
export interface MenuItem {
  /** Định danh mục menu (khớp `ScopeEntry.navItem`). */
  navItem: string;
  /** Đường dẫn điều hướng. */
  href: string;
  /** Trục phục vụ. */
  axis: Axis;
}

/**
 * Khung nhìn trong màn hình "Danh sách BG" (Requirement 8).
 *
 * - `quote` : các trạng thái đầu vòng đời (báo giá).
 * - `order` : các trạng thái đã chốt (đơn hàng).
 * - `all`   : tất cả bản ghi, gồm trạng thái không ánh xạ (fallback Req 8.6).
 */
export type ViewKey = 'quote' | 'order' | 'all';
