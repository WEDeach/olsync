export interface RateLimiterConfig {
    concurrency: number;
    pre_min_limit: number;
}

export class RateLimiter {
    private _hostTokenBuckets: Map<
        string,
        { tokens: number; lastRefill: number; queue: Array<() => void>; draining: boolean }
    > = new Map();
    private _hostSlots: Map<string, { active: number; pending: Array<() => void> }> = new Map();

    constructor(private _getConfig: () => RateLimiterConfig) {}

    acquire_rate_limit(hostname: string): Promise<void> {
        const bucket = this._get_or_create_token_bucket(hostname);
        this._refill_token_bucket(bucket);

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
            bucket.queue.push(resolve);
            this._drain_token_bucket(hostname, bucket);
        });
    }

    acquire_host_slot(hostname: string): Promise<void> {
        const limit = this._getConfig().concurrency;
        let slot = this._hostSlots.get(hostname);
        if (!slot) {
            slot = { active: 0, pending: [] };
            this._hostSlots.set(hostname, slot);
        }
        const s = slot;
        if (s.active < limit) {
            s.active++;
            return Promise.resolve();
        }
        return new Promise((resolve) => s.pending.push(resolve));
    }

    release_host_slot(hostname: string): void {
        const slot = this._hostSlots.get(hostname);
        if (!slot) return;
        const next = slot.pending.shift();
        if (next) {
            next();
        } else {
            slot.active = Math.max(0, slot.active - 1);
        }
    }

    get_rate_status(): Array<{ hostname: string; count: number; limit: number }> {
        const limit = this._getConfig().pre_min_limit;
        const result: Array<{ hostname: string; count: number; limit: number }> = [];
        for (const [hostname, bucket] of this._hostTokenBuckets) {
            const used = Math.round(limit - bucket.tokens);
            if (used > 0 || bucket.queue.length > 0) {
                result.push({ hostname, count: Math.max(0, used), limit });
            }
        }
        return result;
    }

    private _get_or_create_token_bucket(hostname: string) {
        let bucket = this._hostTokenBuckets.get(hostname);
        if (!bucket) {
            const limit = this._getConfig().pre_min_limit;
            bucket = { tokens: limit, lastRefill: Date.now(), queue: [], draining: false };
            this._hostTokenBuckets.set(hostname, bucket);
        }
        return bucket;
    }

    private _refill_token_bucket(bucket: {
        tokens: number;
        lastRefill: number;
        queue: Array<() => void>;
        draining: boolean;
    }): void {
        const limit = this._getConfig().pre_min_limit;
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        const refillRate = limit / 60000;
        bucket.tokens = Math.min(limit, bucket.tokens + elapsed * refillRate);
        bucket.lastRefill = now;
    }

    private _drain_token_bucket(
        hostname: string,
        bucket: { tokens: number; lastRefill: number; queue: Array<() => void>; draining: boolean },
    ): void {
        if (bucket.draining) return;
        if (bucket.queue.length === 0) return;

        this._refill_token_bucket(bucket);

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            const resolve = bucket.queue.shift();
            if (!resolve) return;
            resolve();
            const limit = this._getConfig().pre_min_limit;
            const msPerToken = 60000 / limit;
            bucket.draining = true;
            setTimeout(() => {
                bucket.draining = false;
                this._drain_token_bucket(hostname, bucket);
            }, msPerToken);
        } else {
            const limit = this._getConfig().pre_min_limit;
            const msPerToken = 60000 / limit;
            const waitMs = (1 - bucket.tokens) * msPerToken;
            bucket.draining = true;
            setTimeout(() => {
                bucket.draining = false;
                this._drain_token_bucket(hostname, bucket);
            }, waitMs);
        }
    }
}
