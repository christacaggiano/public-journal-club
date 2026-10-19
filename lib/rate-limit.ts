import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { config } from "./config";

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

const DAY_MS = 24 * 60 * 60 * 1000;

const redisLimiter =
  config.redisUrl && config.redisToken
    ? new Ratelimit({
        redis: new Redis({ url: config.redisUrl, token: config.redisToken }),
        limiter: Ratelimit.slidingWindow(config.reviewsPerDay, "1 d"),
        prefix: "pjc:reviews",
        analytics: false,
      })
    : null;

// Fallback when Redis isn't configured. Counts per server instance only, so it's a soft limit.
const memory = new Map<string, number[]>();

export async function checkReviewLimit(identifier: string): Promise<LimitResult> {
  if (redisLimiter) {
    const result = await redisLimiter.limit(identifier);
    return result.success ? { ok: true } : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)) };
  }
  const now = Date.now();
  const recent = (memory.get(identifier) ?? []).filter((t) => now - t < DAY_MS);
  if (recent.length >= config.reviewsPerDay) {
    return { ok: false, retryAfterSeconds: Math.ceil((recent[0] + DAY_MS - now) / 1000) };
  }
  recent.push(now);
  memory.set(identifier, recent);
  return { ok: true };
}

export function clientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "anonymous";
}
