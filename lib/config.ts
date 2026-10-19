import "server-only";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Writes the critique, highlights and ratings. */
  model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  /** Does the literature search, summary, scientific context, glossary and quote repair. */
  researchModel: process.env.ANTHROPIC_RESEARCH_MODEL || "claude-sonnet-5-5",
  webSearch: process.env.ENABLE_WEB_SEARCH !== "false",
  /** Total web searches per review, split between the background check and the context search. */
  webSearchMaxUses: intFromEnv("WEB_SEARCH_MAX_USES", 4),
  /** Opus fast mode for the critique: much faster writing at twice the per-token price. */
  critiqueFastMode: process.env.CRITIQUE_FAST_MODE === "true",
  maxPdfBytes: intFromEnv("MAX_PDF_MB", 20) * 1024 * 1024,
  maxPages: intFromEnv("MAX_PAGES", 60),
  reviewsPerDay: intFromEnv("REVIEWS_PER_DAY", 5),
  blobToken: process.env.BLOB_READ_WRITE_TOKEN ?? "",
  blobAccess: (process.env.BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private",
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
  onVercel: Boolean(process.env.VERCEL),
};

export const useBlob = Boolean(config.blobToken);

/** A review that has been running longer than this is treated as failed (function timed out). */
export const STALE_AFTER_MS = 8 * 60 * 1000;

/** Bump when the prompt or schema changes so identical PDFs get a fresh review. */
export const PROMPT_VERSION = "5";
