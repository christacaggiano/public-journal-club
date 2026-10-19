import { isValidId, openPaper, SAMPLE_ID } from "@/lib/storage";

export const runtime = "nodejs";

/** Serves a stored paper to the viewer from this site's own origin. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id) || id === SAMPLE_ID) return new Response("Not found", { status: 404 });
  const paper = await openPaper(id);
  if (!paper) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline",
    // A paper's bytes never change for a given id.
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  if (paper.size) headers["Content-Length"] = String(paper.size);
  return new Response(paper.body as BodyInit, { headers });
}
