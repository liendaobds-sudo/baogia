/**
 * Scope Registry — bản dữ liệu runtime của artefact phân loại phạm vi.
 *
 * Artefact nguồn (nguồn sự thật) nằm tại
 * `.kiro/specs/product-rescope-cskh-quote/scope-registry.json`. Vì thư mục `.kiro`
 * nằm ngoài project Next.js (`frontend/`) nên không thể import trực tiếp; file
 * `./scope-registry.json` ở cạnh module này là bản sao đồng bộ dùng cho runtime
 * của hai app (App_CSKH, App_BaoGia) khi suy dẫn menu qua IA Resolver.
 *
 * Khi cập nhật phân loại, sửa artefact nguồn rồi đồng bộ lại file JSON ở đây.
 *
 * _Requirements: 4.1, 4.2, 4.3, 4.4_
 */

import type { ScopeRegistry } from './types';
import registryData from './scope-registry.json';

/** Đăng_Ký_Phạm_Vi dùng cho runtime, ép kiểu về `ScopeRegistry`. */
export const scopeRegistry = registryData as unknown as ScopeRegistry;
