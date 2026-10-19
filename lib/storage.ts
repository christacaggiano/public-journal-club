import "server-only";
import { copy, del, get, head, put } from "@vercel/blob";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sample from "@/data/sample-review.json";
import { STALE_AFTER_MS, config, useBlob } from "./config";
import { DIMENSIONS, type StoredReview } from "./schema";

/**
 * Storage layout, identical for Vercel Blob and the local .data folder:
 *   reviews/{id}/paper.pdf     the uploaded paper
 *   reviews/{id}/started.json  written when a review begins
 *   reviews/{id}/failed.json   written if it fails
 *   reviews/{id}/review.json   the finished review
 * A review's state is read from which of these files exist, so no file is ever rewritten
 * in place except when a failed review is retried.
 */

export const SAMPLE_ID = "sample";

export type ReviewStatus =
  | { state: "done" }
  | { state: "processing"; startedAt: number }
  | { state: "failed"; message: string }
  | { state: "missing" };

type StartedInfo = { fileName?: string; startedAt: number };

const LOCAL_ROOT = path.join(process.cwd(), ".data");
const key = (id: string, file: string) => `reviews/${id}/${file}`;

export function isValidId(id: string): boolean {
  return id === SAMPLE_ID || /^[a-f0-9]{20}$/.test(id);
}

function assertWritableStorage() {
  if (!useBlob && config.onVercel) {
    throw new Error("Storage isn't set up. Connect a Vercel Blob store to this project so BLOB_READ_WRITE_TOKEN is available.");
  }
}

/* ---------- low-level helpers ---------- */

async function exists(file: string): Promise<{ uploadedAt: Date } | null> {
  if (useBlob) {
    try {
      const info = await head(file);
      return { uploadedAt: info.uploadedAt };
    } catch {
      return null;
    }
  }
  try {
    const s = await stat(path.join(LOCAL_ROOT, file));
    return { uploadedAt: s.mtime };
  } catch {
    return null;
  }
}

async function readJson<T>(file: string): Promise<T | null> {
  if (useBlob) {
    const res = await get(file, { access: config.blobAccess, useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const text = await new Response(res.stream).text();
    return JSON.parse(text) as T;
  }
  try {
    return JSON.parse(await readFile(path.join(LOCAL_ROOT, file), "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeFileAt(file: string, body: string | Uint8Array, contentType: string) {
  assertWritableStorage();
  if (useBlob) {
    await put(file, typeof body === "string" ? body : Buffer.from(body), {
      access: config.blobAccess,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
    return;
  }
  const full = path.join(LOCAL_ROOT, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function remove(file: string) {
  if (useBlob) {
    try {
      const info = await head(file);
      await del(info.url);
    } catch {
      /* already gone */
    }
    return;
  }
  await rm(path.join(LOCAL_ROOT, file), { force: true });
}

/* ---------- public API ---------- */

export async function getStatus(id: string): Promise<ReviewStatus> {
  if (id === SAMPLE_ID) return { state: "done" };
  if (await exists(key(id, "review.json"))) return { state: "done" };
  const failed = await exists(key(id, "failed.json"));
  const started = await exists(key(id, "started.json"));
  if (failed && (!started || failed.uploadedAt >= started.uploadedAt)) {
    const info = await readJson<{ message?: string }>(key(id, "failed.json"));
    return { state: "failed", message: info?.message || "The review could not be completed." };
  }
  if (started) {
    const startedAt = started.uploadedAt.getTime();
    if (Date.now() - startedAt > STALE_AFTER_MS) {
      return { state: "failed", message: "This review took too long and was stopped before it finished." };
    }
    return { state: "processing", startedAt };
  }
  return { state: "missing" };
}

export async function getReview(id: string): Promise<StoredReview | null> {
  if (id === SAMPLE_ID) {
    return {
      ...(sample as unknown as StoredReview),
      id: SAMPLE_ID,
      dimensions: DIMENSIONS,
      pdf_url: "/sample/paper.pdf",
      file_name: "fishman-2021-yoga-scoliosis.pdf",
    };
  }
  return readJson<StoredReview>(key(id, "review.json"));
}

/** Moves a client upload (Vercel Blob) into the review's folder. */
export async function adoptUploadedPaper(id: string, uploadUrl: string) {
  await copy(uploadUrl, key(id, "paper.pdf"), {
    access: config.blobAccess,
    contentType: "application/pdf",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  await del(uploadUrl).catch(() => undefined);
}

export async function savePaper(id: string, bytes: Uint8Array) {
  await writeFileAt(key(id, "paper.pdf"), bytes, "application/pdf");
}

/** Reads an uploaded blob by URL (used before the paper has an id). */
export async function readUpload(url: string, maxBytes: number): Promise<Uint8Array> {
  const res = await get(url, { access: config.blobAccess, useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) throw new Error("The uploaded file could not be found. Please upload it again.");
  if (res.blob.size > maxBytes) throw new Error("This PDF is too large.");
  return new Uint8Array(await new Response(res.stream).arrayBuffer());
}

export async function discardUpload(url: string) {
  await del(url).catch(() => undefined);
}

/** Streams the stored PDF for /api/papers/[id]. */
export async function openPaper(id: string): Promise<{ body: ReadableStream<Uint8Array> | Uint8Array; size?: number } | null> {
  if (useBlob) {
    const res = await get(key(id, "paper.pdf"), { access: config.blobAccess });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return { body: res.stream, size: res.blob.size };
  }
  try {
    const bytes = await readFile(path.join(LOCAL_ROOT, key(id, "paper.pdf")));
    return { body: new Uint8Array(bytes), size: bytes.byteLength };
  } catch {
    return null;
  }
}

export async function markStarted(id: string, info: Omit<StartedInfo, "startedAt">) {
  await remove(key(id, "failed.json"));
  const started: StartedInfo = { ...info, startedAt: Date.now() };
  await writeFileAt(key(id, "started.json"), JSON.stringify(started), "application/json");
}

export async function markFailed(id: string, message: string) {
  await writeFileAt(key(id, "failed.json"), JSON.stringify({ message, failedAt: Date.now() }), "application/json");
}

export async function saveReview(review: StoredReview) {
  await writeFileAt(key(review.id, "review.json"), JSON.stringify(review), "application/json");
}
