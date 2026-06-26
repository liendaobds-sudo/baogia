/**
 * Helper thực hiện Optimistic_Update có rollback cho Inbox_Hook.
 *
 * Trước đây các action như `toggleTag`, `togglePinConversation`, `markAsUnread`,
 * `markAllRead` cập nhật cache ngay (optimistic) nhưng KHÔNG hoàn tác khi request
 * thất bại → UI lệch so với máy chủ. `runOptimistic` chụp snapshot trước khi thay
 * đổi, áp optimistic, gọi API; nếu lỗi thì khôi phục snapshot và báo lỗi.
 *
 * _Requirements: 2.1, 2.2, 2.3_
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface OptimisticOptions<T> {
    queryClient: QueryClient;
    queryKey: QueryKey;
    /** Biến đổi dữ liệu cache hiện tại thành trạng thái optimistic. */
    apply: (prev: T | undefined) => T;
    /** Thao tác bất đồng bộ gọi API; ném lỗi nếu thất bại. */
    commit: () => Promise<void>;
    /** Gọi khi có lỗi để báo cho người dùng. */
    onError: (err: unknown) => void;
}

/**
 * Chụp snapshot cache tại `queryKey`, áp `apply` (optimistic), chạy `commit`.
 * - Nếu `commit` ném lỗi: khôi phục snapshot, gọi `onError`, trả về `false`.
 * - Nếu thành công: giữ trạng thái optimistic, trả về `true`.
 */
export async function runOptimistic<T>(opts: OptimisticOptions<T>): Promise<boolean> {
    const { queryClient, queryKey, apply, commit, onError } = opts;
    const snapshot = queryClient.getQueryData<T>(queryKey);
    queryClient.setQueryData<T>(queryKey, (prev) => apply(prev as T | undefined));
    try {
        await commit();
        return true;
    } catch (err) {
        queryClient.setQueryData<T>(queryKey, snapshot);
        onError(err);
        return false;
    }
}
