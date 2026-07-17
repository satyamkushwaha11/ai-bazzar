import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

/**
 * Rate limiting is optional, so this must never be able to break the app.
 *
 * `url && token` was not a real check: any non-empty string passed it. A
 * placeholder value of "a" in the deploy env therefore reached `new Redis()`,
 * which throws UrlError at MODULE SCOPE — taking down `next build` itself with
 * "Failed to collect page data for /api/trpc/[trpc]". A misconfigured optional
 * dependency should cost you rate limiting, not the entire deployment.
 *
 * So: validate the shape, and treat construction failure as "not configured".
 */
function makeRedis(): Redis | null {
  if (!url || !token) return null;
  if (!/^https:\/\/.+/i.test(url)) {
    console.warn(
      `[redis] UPSTASH_REDIS_REST_URL is not an https URL (got "${url}") — rate limiting is DISABLED.`,
    );
    return null;
  }
  try {
    return new Redis({ url, token });
  } catch (err) {
    console.warn('[redis] could not initialise, rate limiting is DISABLED:', err);
    return null;
  }
}

export const redis = makeRedis();

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
