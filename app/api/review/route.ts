import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { PROMPT_VERSION, config, useBlob } from "@/lib/config";
import { RUBRIC_VERSION } from "@/lib/rubric";
import { readPdfText } from "@/lib/pdf-text";
import { checkReviewLimit, clientIdentifier } from "@/lib/rate-limit";
import { runReview } from "@/lib/review-runner";
import type { ProgressEvent } from "@/lib/schema";
import {
  adoptUploadedPaper,
  discardUpload,
  getStatus,
  markFailed,
  markStarted,
  readUpload,
  savePaper,
  saveReview,
} from "@/lib/storage";

export const runtime = "nodejs";
// Reviews with literature search usually take 2-4 minutes. 300 s is the Vercel Hobby maximum;
// raise it on Pro if long papers time out.
export const maxDuration = 300;

type Incoming = { bytes: Uint8Array; fileName?: string; uploadUrl?: string };

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

async function readIncoming(request: Request): Promise<Incoming> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const { url, fileName } = (await request.json()) as { url?: string; fileName?: string };
    if (!useBlob || typeof url !== "string") throw new Error("Missing upload.");
    const host = new URL(url).hostname;
    if (!host.endsWith(".blob.vercel-storage.com") || !new URL(url).pathname.startsWith("/uploads/")) {
      throw new Error("That upload address isn't allowed.");
    }
    return { bytes: await readUpload(url, config.maxPdfBytes), fileName, uploadUrl: url };
  }
  if (type.includes("multipart/form-data")) {
    if (useBlob) throw new Error("Upload the file through the upload endpoint first.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("No file was attached.");
    if (file.size > config.maxPdfBytes) throw new Error("This PDF is too large.");
    return { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
  }
  throw new Error("Unsupported request.");
}

export async function POST(request: Request) {
  if (!config.anthropicApiKey) {
    return jsonError("This site isn't fully set up yet: the server is missing its ANTHROPIC_API_KEY.", 503);
  }
  let incoming: Incoming;
  try {
    incoming = await readIncoming(request);
  } catch (error) {
    return jsonError((error as Error).message, 400);
  }
  const { bytes, fileName, uploadUrl } = incoming;

  if (bytes.byteLength > config.maxPdfBytes) {
    if (uploadUrl) await discardUpload(uploadUrl);
    return jsonError(`This PDF is larger than ${Math.round(config.maxPdfBytes / 1024 / 1024)} MB.`, 413);
  }
  if (Buffer.from(bytes.subarray(0, 1024)).toString("latin1").indexOf("%PDF-") === -1) {
    if (uploadUrl) await discardUpload(uploadUrl);
    return jsonError("That file doesn't look like a PDF.", 415);
  }

  // Same PDF + same prompt and rubric versions + same models = same review, so repeat uploads are instant.
  const id = createHash("sha256").update(bytes).update(`|${PROMPT_VERSION}|r${RUBRIC_VERSION}|${config.researchModel}|${config.model}`).digest("hex").slice(0, 20);

  const status = await getStatus(id);
  if (status.state === "done" || status.state === "processing") {
    if (uploadUrl) await discardUpload(uploadUrl);
    return NextResponse.json({ id, status: status.state });
  }

  let text;
  try {
    text = await readPdfText(bytes);
  } catch {
    if (uploadUrl) await discardUpload(uploadUrl);
    return jsonError("This PDF couldn't be opened. It may be damaged or password-protected.", 422);
  }
  if (text.pageCount > config.maxPages) {
    if (uploadUrl) await discardUpload(uploadUrl);
    return jsonError(`This PDF has ${text.pageCount} pages. The limit is ${config.maxPages}.`, 413);
  }

  const limit = await checkReviewLimit(clientIdentifier(request.headers));
  if (!limit.ok) {
    if (uploadUrl) await discardUpload(uploadUrl);
    const hours = Math.ceil(limit.retryAfterSeconds / 3600);
    return jsonError(
      `You've reached today's limit of ${config.reviewsPerDay} new reviews. Try again in about ${hours} hour${hours === 1 ? "" : "s"}.`,
      429,
      { "Retry-After": String(limit.retryAfterSeconds) },
    );
  }

  try {
    if (uploadUrl) await adoptUploadedPaper(id, uploadUrl);
    else await savePaper(id, bytes);
    await markStarted(id, { fileName });
  } catch (error) {
    return jsonError((error as Error).message, 500);
  }

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      // The browser left. The review keeps running in the background and is saved when done.
      controller = null;
    },
  });
  const emit = (event: ProgressEvent) => {
    if (!controller) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
    } catch {
      controller = null;
    }
  };
  const close = () => {
    try {
      controller?.close();
    } catch {
      /* already closed */
    }
    controller = null;
  };

  const work = (async () => {
    emit({ type: "id", id });
    emit({ type: "stage", stage: "reading", detail: `${text.pageCount} page${text.pageCount === 1 ? "" : "s"}` });
    if (text.textLength < 200) {
      emit({ type: "warning", message: "This PDF has little or no selectable text, so passages may not be highlighted." });
    }
    try {
      const review = await runReview({ id, bytes, text, fileName, emit });
      emit({ type: "stage", stage: "saving" });
      await saveReview(review);
      emit({ type: "done", id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong while writing the review.";
      await markFailed(id, friendlyError(message)).catch(() => undefined);
      emit({ type: "error", message: friendlyError(message) });
    } finally {
      close();
    }
  })();

  // Keep the function alive until the review is saved, even if the browser disconnects.
  after(() => work);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

function friendlyError(message: string): string {
  if (/overloaded|529/i.test(message)) return "The AI service is busy right now. Please try again in a few minutes.";
  if (/rate.?limit|429/i.test(message)) return "The AI service is handling too many requests. Please try again shortly.";
  if (/credit|billing/i.test(message)) return "The AI service account needs attention. Please let the site owner know.";
  return message;
}
