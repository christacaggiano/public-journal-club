/**
 * Quote matching shared by the server (verification) and the browser (highlight placement).
 * Only letters and digits are compared, so hyphenation, line breaks, ligatures and odd glyph
 * encodings don't break matches. Vulgar fractions are dropped because some publisher fonts
 * (for example SAGE) encode "=" as "¼" in the PDF text layer.
 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/[¼-¾⅐-⅟]/g, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Returns a URL only if it is an absolute http(s) URL; anything else becomes undefined. */
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
