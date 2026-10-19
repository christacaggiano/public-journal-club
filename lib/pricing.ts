import "server-only";
import type { ModelUsage } from "./schema";

/**
 * USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
 * (October 2026). Used only to log and store an estimated cost per review; update it when
 * prices change. Models not listed get a null cost.
 */
const PRICES: Record<string, { input: number; cacheWrite5m: number; cacheRead: number; output: number }> = {
  "claude-opus-5-5": { input: 4, cacheWrite5m: 5, cacheRead: 0.2, output: 20 },
  "claude-sonnet-5-5": { input: 2, cacheWrite5m: 2.5, cacheRead: 0.1, output: 10 },
  "claude-sonnet-5": { input: 2, cacheWrite5m: 2.5, cacheRead: 0.2, output: 10 },
  "claude-opus-5": { input: 5, cacheWrite5m: 6.25, cacheRead: 0.5, output: 25 },
  // Fast mode (premium pricing; caching multipliers stack on top).
  "claude-opus-5-5:fast": { input: 8, cacheWrite5m: 10, cacheRead: 0.4, output: 40 },
};

/** Web search is billed per search, on top of tokens. */
const WEB_SEARCH_USD = 10 / 1000;

export function estimateCost(u: Omit<ModelUsage, "cost_usd">): number | null {
  const p = PRICES[u.model];
  if (!p) return null;
  const tokens =
    u.input_tokens * p.input + u.cache_write_tokens * p.cacheWrite5m + u.cache_read_tokens * p.cacheRead + u.output_tokens * p.output;
  return Math.round((tokens / 1_000_000 + u.web_searches * WEB_SEARCH_USD) * 10000) / 10000;
}
