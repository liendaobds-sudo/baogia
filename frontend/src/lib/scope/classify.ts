/**
 * Classifier soundness — gán phân loại phạm vi cho một tính năng dựa trên bề mặt
 * mà nó phục vụ, theo các tiêu chí acceptance criteria 2.2 / 2.3 / 2.4.
 *
 * Quy tắc (Req 2.2, 2.3):
 * - Bề mặt Lõi (Inbox, Contacts/CRM, Knowledge Base, AI suggestions, mini báo giá,
 *   engine tính giá digital/offset/large-format/bound, vòng đời báo giá ↔ đơn hàng
 *   qua `/erp/orders`) ⇒ `core` (tiêu chí 2.2).
 * - ERP nâng cao (kho/phiếu nhập-xuất, RFM scoring, production-cost, setup-fee,
 *   plate-pricing, cấu hình máy offset nâng cao) ⇒ `frozen` (tiêu chí 2.3).
 * - SaaS (Multi_Tenant, super-admin, subscription plans, payments) ⇒ `frozen`
 *   (tiêu chí 2.4 — đi kèm classifier vì cũng là ứng viên đóng băng).
 *
 * Hàm thuần, không phụ thuộc trạng thái ngoài; là đầu vào cho việc dựng
 * `scope-registry.json` và cho property test (Property 2).
 *
 * _Requirements: 2.2, 2.3_
 */

import type { Axis, ClassificationRule, ScopeClass } from './types';

/**
 * Kết quả phân loại cho một tính năng: nhóm phạm vi, tiêu chí áp dụng và trục phục vụ.
 */
export interface Classification {
  scope: ScopeClass;
  rule: ClassificationRule;
  axis: Axis;
}

/**
 * Bề mặt Lõi thuộc trục CSKH — phục vụ trực tiếp Chủ_Shop/NV_CSKH (Req 2.2).
 */
export const CSKH_CORE_SURFACES = [
  'inbox',
  'contacts-crm',
  'knowledge-base',
  'ai-suggestions',
  'mini-quote',
] as const;

/**
 * Bề mặt Lõi thuộc trục Báo giá — engine tính giá và vòng đời báo giá ↔ đơn hàng (Req 2.2).
 */
export const BAOGIA_CORE_SURFACES = [
  'pricing-engine',
  'quote-order-lifecycle',
] as const;

/**
 * Nhóm ERP nâng cao — ứng viên Trạng_Thái_Đóng_Băng (Req 2.3).
 */
export const ERP_ADVANCED_SURFACES = [
  'inventory',
  'rfm-scoring',
  'production-cost',
  'setup-fee',
  'plate-pricing',
  'offset-machine-advanced',
] as const;

/**
 * Nhóm SaaS — ứng viên Trạng_Thái_Đóng_Băng (Req 2.4).
 */
export const SAAS_SURFACES = [
  'multi-tenant',
  'super-admin',
  'subscription-plans',
  'payments',
] as const;

export type CskhCoreSurface = (typeof CSKH_CORE_SURFACES)[number];
export type BaogiaCoreSurface = (typeof BAOGIA_CORE_SURFACES)[number];
export type ErpAdvancedSurface = (typeof ERP_ADVANCED_SURFACES)[number];
export type SaasSurface = (typeof SAAS_SURFACES)[number];

/** Mọi bề mặt mà classifier nhận diện được. */
export type KnownSurface =
  | CskhCoreSurface
  | BaogiaCoreSurface
  | ErpAdvancedSurface
  | SaasSurface;

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/** Bề mặt có phải Lõi trục CSKH không (Req 2.2). */
export function isCskhCoreSurface(surface: string): surface is CskhCoreSurface {
  return includes(CSKH_CORE_SURFACES, surface);
}

/** Bề mặt có phải Lõi trục Báo giá không (Req 2.2). */
export function isBaogiaCoreSurface(surface: string): surface is BaogiaCoreSurface {
  return includes(BAOGIA_CORE_SURFACES, surface);
}

/** Bề mặt có phải Lõi (CSKH hoặc Báo giá) không (Req 2.2). */
export function isCoreSurface(surface: string): boolean {
  return isCskhCoreSurface(surface) || isBaogiaCoreSurface(surface);
}

/** Bề mặt có thuộc nhóm ERP nâng cao không (Req 2.3). */
export function isErpAdvancedSurface(surface: string): surface is ErpAdvancedSurface {
  return includes(ERP_ADVANCED_SURFACES, surface);
}

/** Bề mặt có thuộc nhóm SaaS không (Req 2.4). */
export function isSaasSurface(surface: string): surface is SaasSurface {
  return includes(SAAS_SURFACES, surface);
}

/**
 * Phân loại một bề mặt tính năng thành nhóm phạm vi kèm tiêu chí và trục.
 *
 * - Bề mặt Lõi CSKH ⇒ `{ scope: 'core', rule: '2.2', axis: 'cskh' }`.
 * - Bề mặt Lõi Báo giá ⇒ `{ scope: 'core', rule: '2.2', axis: 'baogia' }`.
 * - ERP nâng cao ⇒ `{ scope: 'frozen', rule: '2.3', axis: 'none' }`.
 * - SaaS ⇒ `{ scope: 'frozen', rule: '2.4', axis: 'none' }`.
 *
 * Trả về `null` cho bề mặt không nhận diện được (cần Người_Quy_Hoạch quyết định thủ công).
 *
 * _Requirements: 2.2, 2.3_
 */
export function classify(surface: string): Classification | null {
  if (isCskhCoreSurface(surface)) {
    return { scope: 'core', rule: '2.2', axis: 'cskh' };
  }
  if (isBaogiaCoreSurface(surface)) {
    return { scope: 'core', rule: '2.2', axis: 'baogia' };
  }
  if (isErpAdvancedSurface(surface)) {
    return { scope: 'frozen', rule: '2.3', axis: 'none' };
  }
  if (isSaasSurface(surface)) {
    return { scope: 'frozen', rule: '2.4', axis: 'none' };
  }
  return null;
}
