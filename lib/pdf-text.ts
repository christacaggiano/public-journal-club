import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { findDoi } from "./crossref";
import { normalizeForMatch } from "./text";

export type PdfText = {
  pageCount: number;
  /** Normalized text per page, for quote matching. */
  pages: string[];
  /** Total number of letters and digits; near zero means a scanned PDF without a text layer. */
  textLength: number;
  /** The paper's DOI if it is printed on the first two pages. */
  doi?: string;
};

export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js takes ownership of the buffer it is given, so pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((t) => normalizeForMatch(t));
    const doi = findDoi(text.slice(0, 2).join("\n"));
    return { pageCount: totalPages, pages, textLength: pages.reduce((n, p) => n + p.length, 0), doi };
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

/** Finds the page holding a quote, checking the suggested page first. Returns null if absent. */
export function findQuotePage(quote: string, pages: string[], preferred?: number): number | null {
  const q = normalizeForMatch(quote);
  if (q.length < 8) return null;
  const order = pages.map((_, i) => i).sort((a, b) => Number(b + 1 === preferred) - Number(a + 1 === preferred) || a - b);
  for (const i of order) {
    if (pages[i].includes(q)) return i + 1;
  }
  return null;
}
