import { Injectable, Logger } from '@nestjs/common';

/**
 * ZaloRateLimiterService — Per-account rate limiting to prevent Zalo from blocking accounts.
 * Tracks daily send counts and burst windows.
 *
 * 3-layer protection system from ZaloCRM:
 *   Layer 1: Daily limit (200 msgs/day/account)
 *   Layer 2: Burst limit (5 msgs/30s)
 *   Layer 3: Random delay between messages (human-like behavior)
 */

const DAILY_LIMIT = 200;
const BURST_LIMIT = 5; // max messages in BURST_WINDOW_MS
const BURST_WINDOW_MS = 30_000; // 30 seconds
const MIN_DELAY_MS = 1_500; // minimum 1.5s between messages
const MAX_DELAY_MS = 5_000; // maximum 5s between messages

interface DailyCount {
    count: number;
    date: string; // YYYY-MM-DD
}

@Injectable()
export class ZaloRateLimiterService {
    private readonly logger = new Logger(ZaloRateLimiterService.name);

    private dailyCounts = new Map<string, DailyCount>();
    private recentSends = new Map<string, number[]>(); // timestamps per account
    private lastSendTime = new Map<string, number>(); // last send timestamp per account

    /**
     * Check if sending is allowed for accountId.
     * Returns { allowed, reason, waitMs }
     */
    checkLimits(accountId: string): {
        allowed: boolean;
        reason?: string;
        waitMs?: number;
    } {
        const today = new Date().toISOString().split('T')[0];

        // Layer 1: Daily limit
        const daily = this.dailyCounts.get(accountId);
        if (daily && daily.date === today && daily.count >= DAILY_LIMIT) {
            return {
                allowed: false,
                reason: `Đã đạt giới hạn ${DAILY_LIMIT} tin/ngày`,
            };
        }

        // Layer 2: Burst limit
        const now = Date.now();
        const recent = (this.recentSends.get(accountId) || []).filter(
            (t) => now - t < BURST_WINDOW_MS,
        );
        if (recent.length >= BURST_LIMIT) {
            const waitMs = BURST_WINDOW_MS - (now - recent[0]);
            return {
                allowed: false,
                reason: `Gửi quá nhanh (>${BURST_LIMIT} tin/30s). Đợi ${Math.ceil(waitMs / 1000)}s`,
                waitMs,
            };
        }

        // Layer 3: Minimum delay between messages (human-like)
        const lastSend = this.lastSendTime.get(accountId);
        if (lastSend && now - lastSend < MIN_DELAY_MS) {
            const waitMs = MIN_DELAY_MS - (now - lastSend);
            return {
                allowed: false,
                reason: `Đợi ${Math.ceil(waitMs / 1000)}s giữa các tin`,
                waitMs,
            };
        }

        return { allowed: true };
    }

    /**
     * Record a successful send for rate tracking.
     */
    recordSend(accountId: string): void {
        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];

        // Update burst window timestamps (keep 60s window for cleanup)
        const recent = (this.recentSends.get(accountId) || []).filter(
            (t) => now - t < 60_000,
        );
        recent.push(now);
        this.recentSends.set(accountId, recent);

        // Update daily count
        const daily = this.dailyCounts.get(accountId);
        if (daily && daily.date === today) {
            daily.count++;
        } else {
            this.dailyCounts.set(accountId, { count: 1, date: today });
        }

        // Record last send time
        this.lastSendTime.set(accountId, now);

        this.logger.debug(
            `[${accountId}] Recorded send. Daily: ${this.getDailyCount(accountId)}/${DAILY_LIMIT}`,
        );
    }

    /**
     * Get today's send count for an account.
     */
    getDailyCount(accountId: string): number {
        const today = new Date().toISOString().split('T')[0];
        const daily = this.dailyCounts.get(accountId);
        return daily && daily.date === today ? daily.count : 0;
    }

    /**
     * Get a human-like delay based on message length.
     * Use this before sending to simulate typing speed.
     */
    getRandomDelay(contentLength: number = 0): number {
        // Human typing speed: ~250 CPM (Chars Per Minute) -> ~240ms per char
        // Plus a base variable reaction time (1.5s to 2.5s)
        const baseReactionMs = MIN_DELAY_MS + Math.random() * 1000;

        if (contentLength === 0) return baseReactionMs;

        // Simulate reading & typing time but cap at MAX_DELAY_MS to remain responsive
        const simulatedTypingMs = Math.min(contentLength * 30, 3000); // max 3 seconds for typing
        const totalDelay = baseReactionMs + simulatedTypingMs;

        return Math.min(totalDelay, MAX_DELAY_MS);
    }

    /**
     * Get remaining daily quota for an account.
     */
    getRemainingQuota(accountId: string): number {
        return Math.max(0, DAILY_LIMIT - this.getDailyCount(accountId));
    }

    /**
     * Get stats for all tracked accounts.
     */
    getAllStats(): Record<string, { dailyCount: number; remaining: number }> {
        const stats: Record<string, { dailyCount: number; remaining: number }> = {};
        const today = new Date().toISOString().split('T')[0];

        for (const [id, daily] of this.dailyCounts) {
            if (daily.date === today) {
                stats[id] = {
                    dailyCount: daily.count,
                    remaining: Math.max(0, DAILY_LIMIT - daily.count),
                };
            }
        }
        return stats;
    }
}
