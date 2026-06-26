/**
 * Property test cho rollback optimistic.
 *
 * Feature: inbox-cskh-ux
 * - Property 3: Rollback optimistic khôi phục trạng thái khi thất bại
 */
import fc from 'fast-check';
import { QueryClient } from '@tanstack/react-query';

import { runOptimistic } from './optimistic';

describe('runOptimistic', () => {
    const arbState = fc.array(
        fc.record({ id: fc.string(), n: fc.integer() }),
        { maxLength: 8 },
    );

    it('Feature: inbox-cskh-ux, Property 3: commit lỗi → khôi phục đúng trạng thái ban đầu + onError được gọi', () => {
        fc.assert(
            fc.asyncProperty(arbState, async (initial) => {
                const qc = new QueryClient();
                const key = ['conversations', 'test'];
                qc.setQueryData(key, initial);

                let errorCalled = false;
                const ok = await runOptimistic<typeof initial>({
                    queryClient: qc,
                    queryKey: key,
                    apply: (prev) => [...(prev ?? []), { id: 'opt', n: 999 }],
                    commit: async () => {
                        throw new Error('boom');
                    },
                    onError: () => {
                        errorCalled = true;
                    },
                });

                expect(ok).toBe(false);
                expect(errorCalled).toBe(true);
                // Cache trở về đúng snapshot ban đầu.
                expect(qc.getQueryData(key)).toEqual(initial);
            }),
            { numRuns: 200 },
        );
    });

    it('Feature: inbox-cskh-ux, Property 3: commit thành công → cache bằng apply(trạng thái ban đầu)', () => {
        fc.assert(
            fc.asyncProperty(arbState, async (initial) => {
                const qc = new QueryClient();
                const key = ['conversations', 'ok'];
                qc.setQueryData(key, initial);

                const apply = (prev: typeof initial | undefined) => [
                    ...(prev ?? []),
                    { id: 'opt', n: 1 },
                ];
                const expected = apply(initial);

                let errorCalled = false;
                const ok = await runOptimistic<typeof initial>({
                    queryClient: qc,
                    queryKey: key,
                    apply,
                    commit: async () => {
                        /* thành công */
                    },
                    onError: () => {
                        errorCalled = true;
                    },
                });

                expect(ok).toBe(true);
                expect(errorCalled).toBe(false);
                expect(qc.getQueryData(key)).toEqual(expected);
            }),
            { numRuns: 200 },
        );
    });
});
