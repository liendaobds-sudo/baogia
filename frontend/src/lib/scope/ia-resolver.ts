/**
 * IA Resolver — suy dẫn kiến trúc thông tin (menu) của hai app từ Scope Registry.
 *
 * Đây là cầu nối giữa `scope-registry.json` (nguồn sự thật phân loại) và sidebar
 * của `App_CSKH` / `App_BaoGia`. Mọi hàm ở đây là hàm thuần (pure): không side
 * effect, không I/O, để thuận tiện kiểm thử bằng property-based testing.
 *
 * Cung cấp:
 * - `resolveMenu(registry, app)` — danh sách mục menu hiển thị: chỉ giữ entry `core`
 *   có `navItem` thuộc đúng trục của app; loại bỏ mọi entry `frozen`/`removed`
 *   (Req 4.1, 4.2, 4.3, 4.4).
 * - `isFrozenRoute(registry, path)` — route guard: một path có trỏ tới tính năng đang
 *   ở Trạng_Thái_Đóng_Băng hay không (Req 4.6).
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_
 */

import type { Axis, MenuItem, MethodId, ScopeEntry, ScopeRegistry } from './types';

/** App đích khi suy dẫn menu. */
export type AppKind = 'cskh' | 'baogia';

/**
 * Tuỳ chọn cho `resolveMenu`.
 *
 * Mặc định href của một mục được suy từ `navItem` (`/<navItem>`). Khi sidebar có
 * sẵn bảng ánh xạ route riêng, truyền `hrefFor` để ghi đè (giữ Resolver thuần và
 * không phụ thuộc chi tiết route của từng app).
 */
export interface ResolveMenuOptions {
  /** Suy ra href hiển thị cho một entry. Mặc định: `/<navItem>`. */
  hrefFor?: (entry: ScopeEntry) => string;
}

/**
 * Một entry có khớp trục của app đang xét không.
 *
 * Trục `shared` phục vụ cả hai app nên khớp với mọi app; `cskh`/`baogia` chỉ khớp
 * app cùng tên; `none` không bao giờ khớp (Req 4.1, 4.2).
 */
export function axisMatchesApp(axis: Axis, app: AppKind): boolean {
  return axis === app || axis === 'shared';
}

/** Một chuỗi "có nghĩa" khi sau khi bỏ khoảng trắng vẫn còn ký tự. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** href mặc định của một entry, suy từ `navItem`. */
function defaultHrefFor(entry: ScopeEntry): string {
  return `/${entry.navItem}`;
}

/**
 * Suy dẫn danh sách mục menu hiển thị cho một app từ Scope Registry.
 *
 * Quy tắc (Req 4.1–4.4):
 * 1. Chỉ giữ entry có `scope === 'core'` (ẩn toàn bộ `frozen`/`removed`).
 * 2. Chỉ giữ entry có `navItem` không rỗng (tính năng trong-hội-thoại như
 *    `ai-suggestions`, `mini-quote` không có mục menu chính riêng → bị loại).
 * 3. Chỉ giữ entry có trục khớp app (`shared` khớp cả hai).
 *
 * Hàm thuần: không sửa đổi `registry`, luôn trả về mảng mới.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param app      App đích (`cskh` hoặc `baogia`).
 * @param options  Tuỳ chọn (vd. `hrefFor` để ghi đè cách suy href).
 * @returns Danh sách `MenuItem` đã lọc theo đúng trục, chỉ gồm Tính_Năng_Lõi.
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4_
 */
export function resolveMenu(
  registry: ScopeRegistry,
  app: AppKind,
  options: ResolveMenuOptions = {},
): MenuItem[] {
  const hrefFor = options.hrefFor ?? defaultHrefFor;
  const entries = registry?.entries ?? [];

  return entries
    .filter((entry) => entry?.scope === 'core')
    .filter((entry) => isNonEmptyString(entry?.navItem))
    .filter((entry) => axisMatchesApp(entry.axis, app))
    .map((entry) => ({
      navItem: entry.navItem as string,
      href: hrefFor(entry),
      axis: entry.axis,
    }));
}

/**
 * Suy ra Phương_Pháp_In mà một mục nav gắn với, dựa trên Scope Registry.
 *
 * Tra cứu entry đầu tiên có `navItem` khớp và trả về trường tuỳ chọn `method` của
 * nó; trả `null` khi mục không gắn phương pháp nào (mục dùng chung, vd. `dashboard`)
 * hoặc khi không tìm thấy entry tương ứng.
 *
 * Đây là nguồn ánh xạ navItem → Phương_Pháp_In cho lớp lọc menu theo Cờ_Năng_Lực
 * (`filterMenuByCapability`), tái dùng Scope Registry hiện có thay vì xây cơ chế ẩn
 * menu riêng (Req 2.3). Hàm thuần, an toàn với input rỗng.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param navItem  Định danh mục menu cần tra (khớp `ScopeEntry.navItem`).
 * @returns `MethodId` nếu mục gắn một Phương_Pháp_In, ngược lại `null`.
 *
 * _Requirements: 2.3_
 */
export function methodOfNavItem(
  registry: ScopeRegistry,
  navItem: string,
): MethodId | null {
  if (!isNonEmptyString(navItem)) return null;
  const entries = registry?.entries ?? [];
  const entry = entries.find((e) => e?.navItem === navItem);
  return isNonEmptyString(entry?.method) ? (entry.method as MethodId) : null;
}

/**
 * Lọc danh sách mục menu theo tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành.
 *
 * Chạy như một bước thuần phía sau `resolveMenu()` (Design — IA capability
 * filtering): với mỗi mục, tra Phương_Pháp_In gắn với nó qua `methodOfNavItem`.
 *
 * Quy tắc (Req 2.1, 2.2, 2.6):
 * - Mục KHÔNG gắn Phương_Pháp_In (`methodOfNavItem` trả `null`) luôn được giữ —
 *   đây là các mục dùng chung (vd. `dashboard`).
 * - Mục có gắn Phương_Pháp_In chỉ được giữ khi phương pháp đó thuộc
 *   `enabledMethods`; ngược lại bị loại khỏi menu.
 *
 * `methodOfNavItem` được truyền vào như một callback `(navItem) => MethodId | null`
 * để giữ hàm này thuần và không phụ thuộc trực tiếp Scope Registry; caller thường
 * dựng nó từ `methodOfNavItem(registry, navItem)`. Hàm thuần: không sửa đổi đầu
 * vào, luôn trả về mảng mới; an toàn với danh sách rỗng.
 *
 * @param items          Menu đã suy dẫn (thường là kết quả của `resolveMenu`).
 * @param enabledMethods Tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành.
 * @param methodOfNavItem Ánh xạ navItem → Phương_Pháp_In (hoặc `null` nếu không gắn).
 * @returns Danh sách `MenuItem` chỉ gồm mục dùng chung và mục thuộc phương pháp khả dụng.
 *
 * _Requirements: 2.1, 2.2, 2.6_
 */
export function filterMenuByCapability(
  items: MenuItem[],
  enabledMethods: MethodId[],
  methodOfNavItem: (navItem: string) => MethodId | null,
): MenuItem[] {
  const enabled = enabledMethods ?? [];
  return (items ?? []).filter((item) => {
    const method = methodOfNavItem(item.navItem);
    // Mục không gắn method luôn giữ; mục có method chỉ giữ khi method khả dụng.
    return method === null || enabled.includes(method);
  });
}

/** Chuẩn hoá một route: bỏ khoảng trắng, bỏ dấu `/` thừa ở cuối (giữ root `/`). */
function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (trimmed.length <= 1) return trimmed;
  return trimmed.replace(/\/+$/, '');
}

/**
 * Suy ra một route frontend từ `featureRef` (nếu có thể).
 *
 * `featureRef` thường có dạng đường dẫn nguồn, ví dụ:
 *   - `frontend/src/app/(app)/settings/ai-quote/`     → `/settings/ai-quote`
 *   - `frontend/src/app/pricing/layout.tsx (title-map)` → `/pricing`
 *
 * Quy ước Next.js App Router: thư mục nhóm `(app)` không xuất hiện trong URL nên
 * được loại bỏ; phần file (`*.tsx`) và mọi ghi chú trong ngoặc bị cắt.
 *
 * @returns route đã chuẩn hoá, hoặc `null` nếu không suy ra được.
 */
function frontendRouteFromFeatureRef(featureRef: unknown): string | null {
  if (!isNonEmptyString(featureRef)) return null;

  // Chỉ lấy token đường dẫn đầu tiên (bỏ ghi chú phía sau khoảng trắng).
  // Chỉ tách theo khoảng trắng — KHÔNG tách theo '(' để giữ nguyên các segment
  // nhóm route Next.js dạng `(app)`; chúng được loại bỏ ở bước lọc segment phía dưới.
  const firstToken = featureRef.trim().split(/\s+/)[0];
  const marker = 'frontend/src/app';
  const idx = firstToken.indexOf(marker);
  if (idx === -1) return null;

  let rest = firstToken.slice(idx + marker.length);
  // Bỏ tên file cuối (vd. layout.tsx, page.tsx).
  rest = rest.replace(/\/[^/]*\.[a-z]+$/i, '');
  // Bỏ các segment nhóm route dạng `(group)` — không xuất hiện trong URL.
  rest = rest
    .split('/')
    .filter((seg) => seg.length > 0 && !/^\(.*\)$/.test(seg))
    .join('/');

  if (rest.length === 0) return null;
  return normalizeRoute(`/${rest}`);
}

/**
 * Tập các route ứng viên gắn với một entry, dùng để so khớp với path điều hướng.
 *
 * Gồm: href suy từ `navItem`, các `backendRoutes`, và route frontend suy từ
 * `featureRef`. Hàm được export để phục vụ kiểm thử và mở rộng về sau.
 */
export function candidateRoutesForEntry(entry: ScopeEntry): string[] {
  const routes = new Set<string>();

  if (isNonEmptyString(entry?.navItem)) {
    routes.add(normalizeRoute(`/${entry.navItem}`));
  }

  if (Array.isArray(entry?.backendRoutes)) {
    for (const route of entry.backendRoutes) {
      if (isNonEmptyString(route)) routes.add(normalizeRoute(route));
    }
  }

  const feRoute = frontendRouteFromFeatureRef(entry?.featureRef);
  if (feRoute) routes.add(feRoute);

  return [...routes];
}

/** Một path có khớp một route ứng viên không: trùng khít hoặc là route con. */
function pathMatchesRoute(path: string, route: string): boolean {
  if (route.length === 0) return false;
  if (path === route) return true;
  // Route con: `/settings/ai-quote` khớp khi path là `/settings/ai-quote/...`.
  return path.startsWith(`${route}/`);
}

/**
 * Một path điều hướng có trỏ tới tính năng đang ở Trạng_Thái_Đóng_Băng không.
 *
 * Dùng cho route guard (Req 4.6): khi người dùng điều hướng trực tiếp tới route của
 * một tính năng `frozen`, tầng guard hiển thị thông báo "tính năng không khả dụng",
 * giữ nguyên session và không ném lỗi chưa xử lý.
 *
 * Path được coi là frozen khi khớp (trùng khít hoặc là route con) với một route ứng
 * viên của bất kỳ entry nào có `scope === 'frozen'`. Hàm thuần, an toàn với input rỗng.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param path     Path điều hướng cần kiểm (vd. `/settings/api-keys`).
 * @returns `true` nếu path thuộc một tính năng đang đóng băng.
 *
 * _Requirements: 4.6_
 */
export function isFrozenRoute(registry: ScopeRegistry, path: string): boolean {
  if (!isNonEmptyString(path)) return false;
  const normalizedPath = normalizeRoute(path);
  const entries = registry?.entries ?? [];

  return entries
    .filter((entry) => entry?.scope === 'frozen')
    .some((entry) =>
      candidateRoutesForEntry(entry).some((route) =>
        pathMatchesRoute(normalizedPath, route),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Route guard theo Phương_Pháp_In (Req 2.4, 2.5)                             */
/* -------------------------------------------------------------------------- */

/**
 * Route mặc định của Cổng_Tạo_Báo_Giá hợp nhất — đích redirect khi guard chặn truy
 * cập một Phương_Pháp_In không khả dụng.
 *
 * Khớp namespace method-agnostic của backend (`/quote/*`). Có thể ghi đè qua
 * `MethodRouteGuardOptions.quoteEntryPoint` để khớp route thực tế của frontend
 * (Cổng_Tạo_Báo_Giá được dựng ở Task 7.3) mà không phải sửa hàm guard.
 */
export const QUOTE_ENTRY_POINT_ROUTE = '/quote';

/**
 * Suy ra Phương_Pháp_In mà một path điều hướng trỏ tới, dựa trên Scope Registry.
 *
 * Tái dùng đúng mẫu so khớp của `isFrozenRoute`: một path khớp một entry khi trùng
 * khít hoặc là route con của một route ứng viên của entry đó
 * (`candidateRoutesForEntry`). Chỉ xét các entry có gắn trường `method`; trả về
 * `method` của entry khớp đầu tiên, hoặc `null` khi path không thuộc Phương_Pháp_In
 * nào (route dùng chung) hoặc không khớp entry nào.
 *
 * Hàm thuần, an toàn với input rỗng — không side effect, không I/O.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param path     Path điều hướng cần kiểm (vd. `/pricing/quotes/offset`).
 * @returns `MethodId` nếu path thuộc một Phương_Pháp_In, ngược lại `null`.
 *
 * _Requirements: 2.4, 2.5_
 */
export function isMethodRoute(
  registry: ScopeRegistry,
  path: string,
): MethodId | null {
  if (!isNonEmptyString(path)) return null;
  const normalizedPath = normalizeRoute(path);
  const entries = registry?.entries ?? [];

  for (const entry of entries) {
    if (!isNonEmptyString(entry?.method)) continue;
    const matches = candidateRoutesForEntry(entry).some((route) =>
      pathMatchesRoute(normalizedPath, route),
    );
    if (matches) return entry.method as MethodId;
  }

  return null;
}

/**
 * Quyết định của route guard theo Phương_Pháp_In cho một path điều hướng.
 *
 * - `allowed`    : `true` khi được phép truy cập (path không gắn phương pháp, hoặc
 *   phương pháp thuộc tập Phương_Pháp_Khả_Dụng).
 * - `method`     : Phương_Pháp_In mà path trỏ tới, hoặc `null` nếu path dùng chung.
 * - `redirectTo` : đích redirect khi `allowed === false` (Cổng_Tạo_Báo_Giá); `null`
 *   khi được phép truy cập.
 *
 * _Requirements: 2.4, 2.5_
 */
export interface MethodRouteGuardDecision {
  allowed: boolean;
  method: MethodId | null;
  redirectTo: string | null;
}

/** Tuỳ chọn cho `guardMethodRoute`. */
export interface MethodRouteGuardOptions {
  /** Route đích khi chặn truy cập. Mặc định: `QUOTE_ENTRY_POINT_ROUTE`. */
  quoteEntryPoint?: string;
}

/**
 * Route guard theo Phương_Pháp_In: quyết định cho phép hay chuyển hướng một path.
 *
 * Tái dùng `isMethodRoute` (mẫu `isFrozenRoute`) để suy ra Phương_Pháp_In của path,
 * rồi đối chiếu với tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành:
 *
 * - Path không gắn Phương_Pháp_In (route dùng chung) ⇒ luôn cho phép (Req 2.5: guard
 *   chỉ chặn tại điểm sử dụng một Phương_Pháp_In cụ thể).
 * - Path gắn Phương_Pháp_In `m`: cho phép khi và chỉ khi `m` thuộc `enabledMethods`;
 *   ngược lại chặn và redirect về Cổng_Tạo_Báo_Giá (Req 2.4).
 *
 * Bất biến (Property 5): với mọi path và mọi tập Phương_Pháp_Khả_Dụng, guard cho
 * phép truy cập khi và chỉ khi `method === null` hoặc `method ∈ enabledMethods`;
 * ngược lại trả `allowed === false` kèm `redirectTo` là Cổng_Tạo_Báo_Giá.
 *
 * Hàm thuần, an toàn với input rỗng.
 *
 * @param registry       Đăng_Ký_Phạm_Vi.
 * @param path           Path điều hướng cần kiểm.
 * @param enabledMethods Tập Phương_Pháp_Khả_Dụng của Đơn_Vị hiện hành.
 * @param options        Tuỳ chọn (vd. ghi đè `quoteEntryPoint`).
 * @returns Quyết định `MethodRouteGuardDecision`.
 *
 * _Requirements: 2.4, 2.5_
 */
export function guardMethodRoute(
  registry: ScopeRegistry,
  path: string,
  enabledMethods: readonly MethodId[],
  options: MethodRouteGuardOptions = {},
): MethodRouteGuardDecision {
  const quoteEntryPoint = options.quoteEntryPoint ?? QUOTE_ENTRY_POINT_ROUTE;
  const method = isMethodRoute(registry, path);

  // Route dùng chung (không gắn phương pháp) luôn được phép.
  if (method === null) {
    return { allowed: true, method: null, redirectTo: null };
  }

  const allowed = (enabledMethods ?? []).includes(method);
  return {
    allowed,
    method,
    redirectTo: allowed ? null : quoteEntryPoint,
  };
}

/* -------------------------------------------------------------------------- */
/* Route guard theo Trục_Ứng_Dụng CSKH (tenant-app-scope)                     */
/* -------------------------------------------------------------------------- */

/**
 * Route mặc định của Trục Báo_Giá (lõi bất khả tắt) — đích redirect khi guard chặn
 * một route thuộc Trục CSKH mà tenant đã TẮT CSKH.
 */
export const QUOTE_HOME_ROUTE = '/pricing';

/**
 * Một path điều hướng có thuộc Trục CSKH không, dựa trên Scope Registry.
 *
 * Tái dùng đúng mẫu so khớp của `isMethodRoute`/`isFrozenRoute`: path khớp một entry
 * khi trùng khít hoặc là route con của một route ứng viên (`candidateRoutesForEntry`).
 * Chỉ xét entry có `axis === 'cskh'` (KHÔNG tính `shared` — trang dùng chung như
 * settings/profile phải luôn vào được kể cả khi CSKH tắt). Trả `true` nếu path thuộc
 * một entry CSKH, ngược lại `false`.
 *
 * Hàm thuần, an toàn với input rỗng — không side effect, không I/O.
 */
export function isCskhRoute(registry: ScopeRegistry, path: string): boolean {
  if (!isNonEmptyString(path)) return false;
  const normalizedPath = normalizeRoute(path);
  const entries = registry?.entries ?? [];

  return entries
    .filter((entry) => entry?.axis === 'cskh')
    .some((entry) =>
      candidateRoutesForEntry(entry).some((route) =>
        pathMatchesRoute(normalizedPath, route),
      ),
    );
}

/** Quyết định của route guard theo Trục CSKH cho một path điều hướng. */
export interface CskhRouteGuardDecision {
  allowed: boolean;
  redirectTo: string | null;
}

/** Tuỳ chọn cho `guardCskhRoute`. */
export interface CskhRouteGuardOptions {
  /** Route đích khi chặn truy cập. Mặc định: `QUOTE_HOME_ROUTE`. */
  quoteHome?: string;
}

/**
 * Route guard theo Trục CSKH: quyết định cho phép hay chuyển hướng một path.
 *
 * - Path KHÔNG thuộc Trục CSKH (Báo_Giá/shared) ⇒ luôn cho phép.
 * - Path thuộc Trục CSKH: cho phép khi và chỉ khi `cskhEnabled === true`; ngược lại
 *   chặn và redirect về Trang Báo_Giá (Trục lõi luôn bật).
 *
 * Hàm thuần, an toàn với input rỗng.
 */
export function guardCskhRoute(
  registry: ScopeRegistry,
  path: string,
  cskhEnabled: boolean,
  options: CskhRouteGuardOptions = {},
): CskhRouteGuardDecision {
  const quoteHome = options.quoteHome ?? QUOTE_HOME_ROUTE;

  // Route không thuộc Trục CSKH luôn được phép.
  if (!isCskhRoute(registry, path)) {
    return { allowed: true, redirectTo: null };
  }

  return cskhEnabled
    ? { allowed: true, redirectTo: null }
    : { allowed: false, redirectTo: quoteHome };
}

/* -------------------------------------------------------------------------- */
/* Đánh giá rò rỉ Tính_Năng_Phụ trên menu (Req 1.7)                            */
/* -------------------------------------------------------------------------- */

/** Phán quyết của một lần đánh giá rút gọn. */
export type LeakVerdict = 'ĐẠT' | 'KHÔNG ĐẠT';

/**
 * Kết quả đánh giá rò rỉ Tính_Năng_Phụ trên menu chính.
 *
 * - `pass`    : `true` khi không có mục Tính_Năng_Phụ nào lọt lên menu.
 * - `verdict` : `'ĐẠT'` khi `pass === true`, ngược lại `'KHÔNG ĐẠT'` (Req 1.7).
 * - `leaks`   : danh sách đầy đủ các mục vi phạm — đúng tập các entry không thuộc
 *   `core` xuất hiện trên menu. Khi `pass === true`, mảng rỗng.
 *
 * _Requirements: 1.7_
 */
export interface MenuLeakReport {
  pass: boolean;
  verdict: LeakVerdict;
  leaks: ScopeEntry[];
}

/**
 * Đánh giá một danh sách mục menu (dưới dạng các `ScopeEntry` đang hiển thị) xem
 * có rò rỉ Tính_Năng_Phụ hay không.
 *
 * Một mục bị coi là rò rỉ khi `scope !== 'core'` (tức thuộc `frozen`/`removed` hoặc
 * bất kỳ giá trị nào không phải Tính_Năng_Lõi). Theo Req 1.7: nếu còn ít nhất một
 * mục Tính_Năng_Phụ hiển thị trên menu chính, kết quả là `KHÔNG ĐẠT` và phải lập
 * danh sách các mục vi phạm.
 *
 * Bất biến (Property 10): với mọi danh sách mục menu, hàm trả `KHÔNG ĐẠT` khi và
 * chỉ khi tồn tại ít nhất một mục không thuộc `core`, và `leaks` bằng đúng tập các
 * mục không thuộc `core` (giữ nguyên thứ tự xuất hiện).
 *
 * Hàm thuần: không sửa đổi đầu vào, an toàn với `null`/`undefined`.
 *
 * @param menuEntries Các entry đang hiển thị trên menu chính (có thể là menu "rò rỉ").
 * @returns Báo cáo `MenuLeakReport` với phán quyết và danh sách mục vi phạm.
 *
 * _Requirements: 1.7_
 */
export function evaluateMenuLeaks(
  menuEntries: readonly ScopeEntry[] | null | undefined,
): MenuLeakReport {
  const leaks = (menuEntries ?? []).filter(
    (entry) => entry?.scope !== 'core',
  );
  const pass = leaks.length === 0;
  return {
    pass,
    verdict: pass ? 'ĐẠT' : 'KHÔNG ĐẠT',
    leaks,
  };
}

/**
 * Các entry "có khả năng hiển thị" trên menu chính của một registry: những entry
 * có `navItem` không rỗng — bất kể phân loại `scope`.
 *
 * Khác với `resolveMenu` (đã lọc sẵn về `core` đúng trục), hàm này cố tình KHÔNG
 * lọc theo `scope` để có thể phát hiện cấu hình registry "rò rỉ" (đặt nhầm một
 * Tính_Năng_Phụ kèm `navItem`, khiến nó có nguy cơ lọt lên menu).
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param app      Nếu truyền, chỉ xét các entry khớp trục của app đó.
 * @returns Danh sách entry mang `navItem`, dùng làm đầu vào cho `evaluateMenuLeaks`.
 */
export function menuCandidateEntries(
  registry: ScopeRegistry,
  app?: AppKind,
): ScopeEntry[] {
  const entries = registry?.entries ?? [];
  return entries
    .filter((entry) => isNonEmptyString(entry?.navItem))
    .filter((entry) => (app ? axisMatchesApp(entry.axis, app) : true));
}

/**
 * Đánh giá rò rỉ Tính_Năng_Phụ trực tiếp trên một registry (tiện ích kiểm toán).
 *
 * Lấy mọi entry mang `navItem` (ứng viên hiển thị trên menu) rồi áp dụng
 * `evaluateMenuLeaks`. Nếu registry được phân loại đúng, mọi entry mang `navItem`
 * đều là `core` ⇒ `ĐẠT`; nếu một Tính_Năng_Phụ bị đặt nhầm kèm `navItem` ⇒ `KHÔNG ĐẠT`.
 *
 * @param registry Đăng_Ký_Phạm_Vi.
 * @param app      Nếu truyền, chỉ kiểm trục của app đó.
 * @returns Báo cáo `MenuLeakReport`.
 *
 * _Requirements: 1.7_
 */
export function evaluateRegistryMenuLeaks(
  registry: ScopeRegistry,
  app?: AppKind,
): MenuLeakReport {
  return evaluateMenuLeaks(menuCandidateEntries(registry, app));
}
