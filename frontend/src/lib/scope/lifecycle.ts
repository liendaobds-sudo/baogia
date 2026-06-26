/**
 * Vòng đời phân loại tính năng — state machine cho các chuyển trạng thái giữa
 * ba nhóm phạm vi `core | frozen | removed`.
 *
 * Bất biến cốt lõi (Req 5.1): KHÔNG tồn tại chuyển trực tiếp `core → removed`.
 * Mọi tính năng phải đi qua Trạng_Thái_Đóng_Băng (`frozen`) trước khi được
 * Gỡ_Bỏ (`removed`); và một tính năng đã gỡ chỉ quay lại được qua `frozen`
 * (hoàn tác từ sao lưu — Req 7.5).
 *
 * Đồ thị chuyển trạng thái hợp lệ (theo state machine trong design.md):
 *
 *   core   → frozen            (đóng băng: hết phục vụ trục Lõi)
 *   frozen → core              (bật lại — Req 5.4)
 *   frozen → removed           (gỡ bỏ sau khi sao lưu + verify — Req 5.1, 5.7)
 *   removed → frozen           (hoàn tác từ sao lưu — Req 7.5)
 *
 * Mọi cạnh khác (đặc biệt `core → removed`) đều KHÔNG hợp lệ.
 *
 * Tài liệu thiết kế: `.kiro/specs/product-rescope-cskh-quote/design.md`
 * (mục "Vòng đời phân loại tính năng (state machine)" và Correctness Property 6).
 *
 * File này được thiết kế để mở rộng: task 4.3 sẽ bổ sung `apply(step, registry)`
 * và `undo(...)` dựa trên các định nghĩa hành động vòng đời ở đây.
 *
 * _Requirements: 5.1_
 */

import type { ScopeClass } from './types';

/**
 * Đồ thị các chuyển trạng thái hợp lệ: với mỗi trạng thái nguồn, liệt kê các
 * trạng thái đích có thể đến trực tiếp.
 *
 * Lưu ý bất biến (Req 5.1): `core` KHÔNG có cạnh tới `removed`.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<ScopeClass, readonly ScopeClass[]>> = {
  core: ['frozen'],
  frozen: ['core', 'removed'],
  removed: ['frozen'],
};

/**
 * Hành động vòng đời rút gọn — mỗi hành động ứng với đúng một cạnh chuyển trạng thái.
 *
 * Dùng cho lớp apply/undo sẽ được bổ sung ở task 4.3:
 * - `freeze`   : `core → frozen`   (ẩn tính năng, giữ code/route/dữ liệu).
 * - `unfreeze` : `frozen → core`   (bật lại — Req 5.4).
 * - `remove`   : `frozen → removed`(gỡ bỏ sau sao lưu + verify — Req 5.1, 5.7).
 * - `restore`  : `removed → frozen`(hoàn tác từ sao lưu — Req 7.5).
 */
export type LifecycleAction = 'freeze' | 'unfreeze' | 'remove' | 'restore';

/** Một cạnh chuyển trạng thái: từ `from` sang `to`. */
export interface ScopeTransition {
  from: ScopeClass;
  to: ScopeClass;
}

/**
 * Ánh xạ mỗi hành động vòng đời tới cạnh chuyển trạng thái tương ứng.
 *
 * Là nền tảng để task 4.3 hiện thực `apply`/`undo` (mỗi hành động có hành động đảo).
 */
export const ACTION_TRANSITIONS: Readonly<Record<LifecycleAction, ScopeTransition>> = {
  freeze: { from: 'core', to: 'frozen' },
  unfreeze: { from: 'frozen', to: 'core' },
  remove: { from: 'frozen', to: 'removed' },
  restore: { from: 'removed', to: 'frozen' },
};

/**
 * Một chuyển trạng thái `from → to` có hợp lệ theo state machine hay không.
 *
 * Trả về `false` cho mọi cạnh không có trong `ALLOWED_TRANSITIONS`, bao gồm:
 * - cạnh bị cấm trực tiếp `core → removed` (Req 5.1);
 * - các chuyển không thay đổi trạng thái (`from === to`), vì state machine
 *   không có cạnh tự lặp (no-op không phải một bước chuyển hợp lệ).
 *
 * _Requirements: 5.1_
 */
export function isValidTransition(from: ScopeClass, to: ScopeClass): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Các trạng thái có thể đến trực tiếp từ `from`. */
export function nextStates(from: ScopeClass): readonly ScopeClass[] {
  return ALLOWED_TRANSITIONS[from];
}

/** Kết quả kiểm chứng một dãy chuyển trạng thái. */
export interface TransitionSequenceResult {
  /** `true` khi mọi cặp trạng thái liên tiếp đều là chuyển hợp lệ. */
  valid: boolean;
  /** Danh sách thông điệp vi phạm (rỗng khi `valid === true`). */
  errors: string[];
}

/**
 * Kiểm chứng một dãy trạng thái phân loại: trạng thái khởi đầu phải hợp lệ VÀ
 * mọi cặp liên tiếp `states[i] → states[i+1]` phải là một chuyển trạng thái hợp lệ.
 *
 * Trạng thái khởi đầu (ứng với pseudo-state `[*]` trong state machine) chỉ được
 * phép là `core` hoặc `frozen`. Một dãy mở đầu bằng `removed` là KHÔNG hợp lệ vì
 * `[*] → removed` bị cấm: một tính năng phải khởi đầu ở trục Lõi (`core`) hoặc đã
 * Đóng_Băng (`frozen`), không thể "sinh ra" đã ở trạng thái Gỡ_Bỏ.
 *
 * Vì `removed` chỉ đến được từ `frozen` trong `ALLOWED_TRANSITIONS` VÀ `removed`
 * không được phép làm trạng thái khởi đầu, mọi dãy hợp lệ mà đạt tới `removed`
 * đều bảo đảm trạng thái ngay trước đó là `frozen` — đúng bất biến "không gỡ bỏ
 * khi chưa qua đóng băng" (Req 5.1). Nói cách khác:
 *   validateTransitionSequence(states).valid ⇒ removedAlwaysPrecededByFrozen(states).
 *
 * Dãy rỗng được coi là hợp lệ (không có trạng thái nào để kiểm). Dãy một phần tử
 * hợp lệ khi và chỉ khi phần tử đó là trạng thái khởi đầu hợp lệ (`core`/`frozen`).
 *
 * _Requirements: 5.1_
 */
export function validateTransitionSequence(states: readonly ScopeClass[]): TransitionSequenceResult {
  const errors: string[] = [];

  // Trạng thái khởi đầu `[*]` chỉ được tới `core` hoặc `frozen`; `removed` bị cấm.
  if (states.length > 0 && states[0] === 'removed') {
    errors.push(
      "Trạng thái khởi đầu 'removed' không hợp lệ: tính năng phải khởi đầu ở 'core' hoặc 'frozen'.",
    );
  }

  for (let i = 0; i + 1 < states.length; i += 1) {
    const from = states[i];
    const to = states[i + 1];
    if (!isValidTransition(from, to)) {
      errors.push(`Bước ${i}: chuyển '${from}' → '${to}' không hợp lệ.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Trong một dãy trạng thái, mọi lần đạt tới `removed` đều có trạng thái ngay
 * trước đó là `frozen` hay không.
 *
 * Hiện thực trực tiếp bất biến Property 6 (Req 5.1): một tính năng chỉ có thể
 * bị gỡ bỏ sau khi đã đi qua đóng băng. Phần tử đầu tiên không thể là `removed`
 * (không có trạng thái trước đó để bảo chứng đã đóng băng → `[*] → removed` bị cấm).
 *
 * _Requirements: 5.1_
 */
export function removedAlwaysPrecededByFrozen(states: readonly ScopeClass[]): boolean {
  for (let i = 0; i < states.length; i += 1) {
    if (states[i] === 'removed') {
      if (i === 0 || states[i - 1] !== 'frozen') {
        return false;
      }
    }
  }
  return true;
}

/* -------------------------------------------------------------------------- *
 * Task 4.3 — freeze / unfreeze / remove-with-backup dạng apply + undo
 *
 * Mỗi "bước rút gọn" (LifecycleStep) áp một LifecycleAction lên đúng một entry
 * của registry. `apply(step, registry)` trả về registry MỚI (không đột biến đầu
 * vào) với entry mục tiêu đã chuyển trạng thái; `undo(step, registry)` đảo ngược
 * bước đó.
 *
 * Bất biến khả nghịch (Req 5.4, 7.5 — Property 7): với mọi bước hợp lệ,
 *   undo(step, apply(step, registry)) ≡ registry (tương đương sâu).
 *
 * Trường hợp đặc biệt (Req 5.4): `unfreeze(freeze(entry))` đưa entry về `core`
 * mà KHÔNG cần khôi phục dữ liệu từ sao lưu ngoài — thông tin để hoàn tác nằm
 * trọn trong chính bước (`step`), không phụ thuộc nguồn ngoài.
 * -------------------------------------------------------------------------- */

import type { BackupRecord, ReenablePlan, ScopeEntry, ScopeRegistry } from './types';

/**
 * Một bước rút gọn khả nghịch: áp `action` lên entry `targetId`.
 *
 * Bước mang theo TOÀN BỘ payload mà nó chạm tới, để vừa áp dụng vừa hoàn tác
 * được mà không cần nguồn dữ liệu ngoài:
 * - `reenable`: khối điều kiện bật lại, BẮT BUỘC cho bước có liên quan trạng
 *   thái `frozen` (freeze, unfreeze, remove, restore — vì cả bốn đều đi vào
 *   hoặc đi ra khỏi `frozen`).
 * - `backup`: bản sao lưu đã kiểm chứng, BẮT BUỘC cho bước có liên quan trạng
 *   thái `removed` (remove, restore).
 */
export interface LifecycleStep {
  /** Hành động vòng đời cần áp dụng. */
  action: LifecycleAction;
  /** `id` của entry mục tiêu trong registry. */
  targetId: string;
  /** Khối bật lại gắn với trạng thái `frozen` của entry (xem mô tả ở trên). */
  reenable?: ReenablePlan;
  /** Bản sao lưu gắn với trạng thái `removed` của entry (xem mô tả ở trên). */
  backup?: BackupRecord;
}

/**
 * Hành động đảo của mỗi hành động vòng đời. Nhờ tính đối xứng của state machine,
 * hoàn tác một bước đơn giản là áp dụng bước với hành động đảo và cùng payload.
 */
export const INVERSE_ACTION: Readonly<Record<LifecycleAction, LifecycleAction>> = {
  freeze: 'unfreeze',
  unfreeze: 'freeze',
  remove: 'restore',
  restore: 'remove',
};

/**
 * Dựng entry mới sau khi chuyển sang trạng thái đích, đặt/xoá payload theo đúng
 * bất biến phân loại (core: không reenable/backup; frozen: có reenable; removed:
 * có backup). Mọi trường khác của entry được giữ nguyên.
 */
function withTargetScope(entry: ScopeEntry, step: LifecycleStep): ScopeEntry {
  const to = ACTION_TRANSITIONS[step.action].to;
  // Sao chép nông rồi loại bỏ hai payload có điều kiện để dựng lại theo trạng thái đích.
  const { reenable: _r, backup: _b, ...rest } = entry;

  switch (to) {
    case 'core':
      return { ...rest, scope: 'core' };
    case 'frozen':
      if (!step.reenable) {
        throw new Error(
          `Bước '${step.action}' tới 'frozen' cho '${step.targetId}' thiếu khối 'reenable'.`,
        );
      }
      return { ...rest, scope: 'frozen', reenable: step.reenable };
    case 'removed':
      if (!step.backup) {
        throw new Error(
          `Bước '${step.action}' tới 'removed' cho '${step.targetId}' thiếu khối 'backup'.`,
        );
      }
      return { ...rest, scope: 'removed', backup: step.backup };
    /* c8 ignore next 2 */
    default:
      throw new Error(`Trạng thái đích không hợp lệ: '${String(to)}'.`);
  }
}

/**
 * Áp một bước rút gọn lên registry, trả về registry MỚI (đầu vào không bị đột biến).
 *
 * Ràng buộc:
 * - entry `step.targetId` phải tồn tại;
 * - trạng thái hiện tại của entry phải khớp `from` của hành động (chuyển hợp lệ
 *   theo `ALLOWED_TRANSITIONS`), nếu không sẽ ném lỗi — qua đó cấm `core → removed`
 *   (Req 5.1) vì không có hành động nào có cạnh đó;
 * - payload bắt buộc (`reenable`/`backup`) phải hiện diện theo trạng thái đích.
 *
 * _Requirements: 5.4, 7.5_
 */
export function apply(step: LifecycleStep, registry: ScopeRegistry): ScopeRegistry {
  const index = registry.entries.findIndex((e) => e.id === step.targetId);
  if (index === -1) {
    throw new Error(`Không tìm thấy entry '${step.targetId}' trong registry.`);
  }

  const current = registry.entries[index];
  const { from, to } = ACTION_TRANSITIONS[step.action];

  if (current.scope !== from) {
    throw new Error(
      `Bước '${step.action}' yêu cầu trạng thái '${from}' nhưng '${step.targetId}' đang ở '${current.scope}'.`,
    );
  }
  if (!isValidTransition(from, to)) {
    throw new Error(`Chuyển '${from}' → '${to}' không hợp lệ.`);
  }

  const nextEntry = withTargetScope(current, step);
  const entries = registry.entries.slice();
  entries[index] = nextEntry;

  return { ...registry, entries };
}

/**
 * Hoàn tác một bước rút gọn: áp dụng hành động đảo với cùng payload.
 *
 * Vì bước mang theo đủ thông tin payload (`reenable`/`backup`) cho cả hai chiều,
 * hoàn tác không cần nguồn dữ liệu ngoài. Cụ thể `undo(freeze-step)` chính là
 * `unfreeze` đưa entry về `core` (Req 5.4); `undo(remove-step)` là `restore` đưa
 * entry về `frozen` từ thông tin sao lưu trong bước (Req 7.5).
 *
 * Bất biến: `undo(step, apply(step, registry))` tương đương sâu với `registry`.
 *
 * _Requirements: 5.4, 7.5_
 */
export function undo(step: LifecycleStep, registry: ScopeRegistry): ScopeRegistry {
  return apply({ ...step, action: INVERSE_ACTION[step.action] }, registry);
}
