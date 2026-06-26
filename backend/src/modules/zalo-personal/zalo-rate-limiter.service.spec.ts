import { ZaloRateLimiterService } from './zalo-rate-limiter.service';

describe('ZaloRateLimiterService', () => {
    let service: ZaloRateLimiterService;

    beforeEach(() => {
        service = new ZaloRateLimiterService();
    });

    describe('checkLimits', () => {
        it('should allow first message', () => {
            const result = service.checkLimits('acc-1');
            expect(result.allowed).toBe(true);
        });

        it('should block after daily limit reached', () => {
            // Simulate 200 sends
            for (let i = 0; i < 200; i++) {
                service.recordSend('acc-1');
            }

            const result = service.checkLimits('acc-1');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('200');
        });

        it('should block burst (>5 msgs in 30s)', () => {
            // Send 5 messages rapidly
            for (let i = 0; i < 5; i++) {
                service.recordSend('acc-1');
            }

            const result = service.checkLimits('acc-1');
            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('nhanh');
        });

        it('should track accounts independently', () => {
            // Fill quota for acc-1
            for (let i = 0; i < 200; i++) {
                service.recordSend('acc-1');
            }

            // acc-2 should still be allowed
            const result = service.checkLimits('acc-2');
            expect(result.allowed).toBe(true);
        });
    });

    describe('getDailyCount', () => {
        it('should return 0 for unknown account', () => {
            expect(service.getDailyCount('unknown')).toBe(0);
        });

        it('should track sends correctly', () => {
            service.recordSend('acc-1');
            service.recordSend('acc-1');
            service.recordSend('acc-1');
            expect(service.getDailyCount('acc-1')).toBe(3);
        });
    });

    describe('getRemainingQuota', () => {
        it('should return 200 for fresh account', () => {
            expect(service.getRemainingQuota('acc-1')).toBe(200);
        });

        it('should decrease as messages are sent', () => {
            service.recordSend('acc-1');
            expect(service.getRemainingQuota('acc-1')).toBe(199);
        });
    });

    describe('getRandomDelay', () => {
        it('should return delay between 1500-5000ms', () => {
            const delay = service.getRandomDelay();
            expect(delay).toBeGreaterThanOrEqual(1500);
            expect(delay).toBeLessThanOrEqual(5000);
        });
    });

    describe('getAllStats', () => {
        it('should return stats for all tracked accounts', () => {
            service.recordSend('acc-1');
            service.recordSend('acc-2');
            service.recordSend('acc-2');

            const stats = service.getAllStats();
            expect(stats['acc-1'].dailyCount).toBe(1);
            expect(stats['acc-2'].dailyCount).toBe(2);
        });
    });
});
