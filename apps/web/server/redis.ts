import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

function makeLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  if (!redis) return null;
  return new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(requests, window), analytics: true });
}

export const ratelimits = {
  ai: makeLimiter(20, '1 m'),         // 20 AI calls / minute / user
  negotiate: makeLimiter(60, '1 h'),  // 60 negotiation turns / hour / user
  auth: makeLimiter(10, '15 m'),      // 10 login attempts / 15min / IP
  search: makeLimiter(30, '1 m'),
};

/** No-op fallback when Redis isn't configured (local dev). */
export async function checkLimit(
  limiter: Ratelimit | null,
  key: string,
): Promise<{ success: boolean; remaining: number }> {
  if (!limiter) return { success: true, remaining: Infinity };
  const r = await limiter.limit(key);
  return { success: r.success, remaining: r.remaining };
}
