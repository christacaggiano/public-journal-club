import { NextResponse } from "next/server";
import { getStatus, isValidId } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight status check used by the "still working" page. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) return NextResponse.json({ state: "missing" }, { status: 404 });
  const status = await getStatus(id);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
