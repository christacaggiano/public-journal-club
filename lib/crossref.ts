import "server-only";

/**
 * Publication status from Crossref, which includes the Retraction Watch database.
 * Retractions, corrections and expressions of concern appear on the paper's own record
 * ("updated-by") and on the notices themselves ("update-to"); both are checked.
 * Docs: https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/
 */

export type NoticeType = "retraction" | "correction" | "expression_of_concern" | "withdrawal" | "other";

export type PublicationStatus = {
  status: "peer_reviewed" | "preprint" | "retracted" | "concern" | "corrected" | "unknown";
  doi?: string;
  notices: { type: NoticeType; label: string; date?: string; doi?: string; source?: string }[];
  checked_at: string;
  source: "crossref" | "none";
};

// Overridable for testing.
const API = process.env.CROSSREF_API_URL || "https://api.crossref.org";
const TIMEOUT_MS = 8000;

/** Finds the paper's own DOI in its first pages (publishers usually print it near the top). */
export function findDoi(text: string): string | undefined {
  const m = text.match(/\b(10\.\d{4,9}\/[^\s"<>]+)/i);
  if (!m) return undefined;
  return m[1].replace(/[).,;:\]]+$/, "");
}

function noticeType(t: string | undefined): NoticeType {
  const v = (t ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (v.includes("retraction")) return "retraction";
  if (v.includes("withdraw") || v.includes("removal")) return "withdrawal";
  if (v.includes("concern")) return "expression_of_concern";
  if (v.includes("correction") || v.includes("erratum") || v.includes("corrigendum")) return "correction";
  return "other";
}

type CrossrefUpdate = {
  DOI?: string;
  type?: string;
  label?: string;
  source?: string;
  updated?: { "date-time"?: string; "date-parts"?: number[][] };
};

function dateOf(u: CrossrefUpdate): string | undefined {
  if (u.updated?.["date-time"]) return u.updated["date-time"].slice(0, 10);
  const parts = u.updated?.["date-parts"]?.[0];
  return parts?.length ? parts.map((n) => String(n).padStart(2, "0")).join("-") : undefined;
}

async function getJson(url: string): Promise<unknown> {
  const mailto = process.env.CROSSREF_MAILTO;
  const res = await fetch(mailto ? `${url}${url.includes("?") ? "&" : "?"}mailto=${encodeURIComponent(mailto)}` : url, {
    headers: { "User-Agent": `PublicJournalClub/1.0${mailto ? ` (mailto:${mailto})` : ""}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Crossref returned ${res.status}`);
  return res.json();
}

export async function checkPublicationStatus(doi: string | undefined): Promise<PublicationStatus> {
  const checked_at = new Date().toISOString();
  if (!doi) return { status: "unknown", notices: [], checked_at, source: "none" };
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();

  try {
    const [work, updates] = await Promise.all([
      getJson(`${API}/works/${encodeURIComponent(clean)}`) as Promise<{ message?: Record<string, unknown> } | null>,
      getJson(`${API}/works?filter=updates:${encodeURIComponent(clean)}&rows=20&select=DOI,update-to`).catch(() => null) as Promise<{
        message?: { items?: { DOI?: string; "update-to"?: CrossrefUpdate[] }[] };
      } | null>,
    ]);
    if (!work?.message) return { status: "unknown", doi: clean, notices: [], checked_at, source: "crossref" };

    const msg = work.message;
    const seen = new Set<string>();
    const notices: PublicationStatus["notices"] = [];
    const add = (u: CrossrefUpdate, noticeDoi?: string) => {
      const type = noticeType(u.type);
      const key = `${type}|${noticeDoi ?? u.DOI ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      notices.push({ type, label: u.label ?? u.type ?? "Update", date: dateOf(u), doi: noticeDoi ?? u.DOI, source: u.source });
    };
    for (const u of (msg["updated-by"] as CrossrefUpdate[] | undefined) ?? []) add(u);
    for (const item of updates?.message?.items ?? []) {
      for (const u of item["update-to"] ?? []) {
        if ((u.DOI ?? "").toLowerCase() === clean) add(u, item.DOI);
      }
    }

    const has = (t: NoticeType) => notices.some((n) => n.type === t);
    const isPreprint = msg.type === "posted-content" || msg.subtype === "preprint";
    const status: PublicationStatus["status"] = has("retraction") || has("withdrawal")
      ? "retracted"
      : has("expression_of_concern")
        ? "concern"
        : isPreprint
          ? "preprint"
          : has("correction")
            ? "corrected"
            : "peer_reviewed";
    return { status, doi: clean, notices, checked_at, source: "crossref" };
  } catch {
    return { status: "unknown", doi: clean, notices: [], checked_at, source: "none" };
  }
}

/** One plain sentence about the status, for the critique model's notes. */
export function statusNote(s: PublicationStatus): string {
  const list = s.notices.map((n) => `${n.label}${n.date ? ` (${n.date})` : ""}`).join("; ");
  switch (s.status) {
    case "retracted":
      return `IMPORTANT: Crossref and Retraction Watch list this paper as retracted or withdrawn: ${list}. The review must say so prominently.`;
    case "concern":
      return `Crossref lists an expression of concern for this paper: ${list}. Mention it.`;
    case "corrected":
      return `Crossref lists corrections for this paper: ${list}. Note whether they affect the main results, if the PDF shows which version this is.`;
    case "preprint":
      return "Crossref lists this as a preprint: it has not been peer reviewed.";
    case "peer_reviewed":
      return "Crossref lists this as a published journal article with no retraction, correction or expression of concern.";
    default:
      return "Publication status could not be checked (no DOI found or Crossref unavailable).";
  }
}
