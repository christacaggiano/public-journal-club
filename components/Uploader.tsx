"use client";

import { upload } from "@vercel/blob/client";
import clsx from "clsx";
import { Check, FileText, Loader2, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import type { ProgressEvent } from "@/lib/schema";

type StageKey = "uploading" | "reading" | "searching" | "writing" | "checking" | "saving";

const STAGES: { key: StageKey; label: string }[] = [
  { key: "uploading", label: "Uploading the paper" },
  { key: "reading", label: "Reading the paper" },
  { key: "searching", label: "Checking the authors and journal" },
  { key: "writing", label: "Writing the critique and finding related studies" },
  { key: "checking", label: "Adding definitions and checking quotes" },
  { key: "saving", label: "Saving" },
];

type Phase =
  | { kind: "idle" }
  | { kind: "working"; fileName: string }
  | { kind: "error"; message: string };

export function Uploader({ useBlob, blobAccess, maxMb }: { useBlob: boolean; blobAccess: "public" | "private"; maxMb: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [stage, setStage] = useState<StageKey>("uploading");
  const [uploadPct, setUploadPct] = useState(0);
  const [details, setDetails] = useState<Partial<Record<StageKey, string>>>({});
  const [queries, setQueries] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ title: string; summary: string } | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    if (phase.kind !== "working") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase.kind]);

  const reset = () => {
    setPhase({ kind: "idle" });
    setStage("uploading");
    setUploadPct(0);
    setDetails({});
    setQueries([]);
    setPreview(null);
    setReviewId(null);
    finished.current = false;
  };

  const handleEvent = useCallback(
    (event: ProgressEvent) => {
      switch (event.type) {
        case "id":
          setReviewId(event.id);
          break;
        case "stage":
          setStage(event.stage);
          if (event.detail) setDetails((d) => ({ ...d, [event.stage]: event.detail }));
          break;
        case "search":
          setQueries((q) => (q.includes(event.query) ? q : [...q, event.query]));
          break;
        case "preview":
          setPreview({ title: event.title, summary: event.summary });
          break;
        case "warning":
          toast.warning(event.message);
          break;
        case "done":
          finished.current = true;
          router.push(`/r/${event.id}`);
          break;
        case "error":
          finished.current = true;
          setPhase({ kind: "error", message: event.message });
          break;
      }
    },
    [router],
  );

  const start = useCallback(
    async (file: File) => {
      reset();
      setPhase({ kind: "working", fileName: file.name });
      setStartedAt(Date.now());
      setNow(Date.now());
      try {
        let response: Response;
        if (useBlob) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "paper.pdf";
          const blob = await upload(`uploads/${safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`}`, file, {
            access: blobAccess,
            handleUploadUrl: "/api/upload",
            contentType: "application/pdf",
            multipart: file.size > 5 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => setUploadPct(Math.round(percentage)),
          });
          setUploadPct(100);
          response = await fetch("/api/review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: blob.url, fileName: file.name }),
          });
        } else {
          const form = new FormData();
          form.append("file", file);
          setUploadPct(100);
          response = await fetch("/api/review", { method: "POST", body: form });
        }

        const type = response.headers.get("content-type") ?? "";
        if (type.includes("application/json")) {
          const data = (await response.json()) as { id?: string; status?: string; error?: string };
          if (!response.ok || !data.id) throw new Error(data.error || "The review couldn't be started.");
          if (data.status === "done") toast.success("This paper was already reviewed. Opening it now.");
          router.push(`/r/${data.id}`);
          return;
        }
        if (!response.ok || !response.body) throw new Error("The review couldn't be started.");

        setStage("reading");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastId: string | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as ProgressEvent;
            if (event.type === "id") lastId = event.id;
            handleEvent(event);
          }
        }
        // The connection closed early (for example a network change). The review keeps running on
        // the server, so send the reader to its page, which waits for it to finish.
        if (!finished.current && lastId) router.push(`/r/${lastId}`);
      } catch (error) {
        setPhase({ kind: "error", message: (error as Error).message || "Something went wrong." });
      }
    },
    [blobAccess, handleEvent, router, useBlob],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    maxSize: maxMb * 1024 * 1024,
    multiple: false,
    noClick: phase.kind === "working",
    noDrag: phase.kind === "working",
    onDropAccepted: (files) => void start(files[0]),
    onDropRejected: (rejections) => {
      const code = rejections[0]?.errors[0]?.code;
      toast.error(
        code === "file-too-large"
          ? `That file is larger than ${maxMb} MB.`
          : code === "file-invalid-type"
            ? "Please choose a PDF file."
            : "Please choose a single PDF file.",
      );
    },
  });

  if (phase.kind === "working") {
    const current = STAGES.findIndex((s) => s.key === stage);
    const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
    return (
      <div className="rounded-xl border border-line bg-surface p-5 sm:p-6" aria-live="polite">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{phase.fileName}</p>
            <p className="text-sm text-muted tabular">
              {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} elapsed · most reviews take 2 to 4 minutes
            </p>
          </div>
        </div>
        <ol className="mt-5 flex flex-col gap-3">
          {STAGES.map((s, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            const detail = s.key === "uploading" && state === "active" && useBlob ? `${uploadPct}%` : details[s.key];
            return (
              <li key={s.key} className="flex flex-col gap-1.5">
                <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm", state === "todo" && "text-muted")}>
                  <span
                    className={clsx(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      state === "done" && "border-strength bg-strength text-surface",
                      state === "active" && "border-accent text-accent",
                      state === "todo" && "border-line",
                    )}
                    aria-hidden
                  >
                    {state === "done" ? <Check className="size-3" /> : state === "active" ? <Loader2 className="size-3 animate-spin" /> : null}
                  </span>
                  <span className={clsx(state === "active" && "font-medium")}>{s.label}</span>
                  {detail ? <span className="whitespace-nowrap text-muted tabular">· {detail}</span> : null}
                  <span className="sr-only">{state === "done" ? "(done)" : state === "active" ? "(in progress)" : ""}</span>
                </div>
                {s.key === stage && (s.key === "searching" || s.key === "writing") && queries.length > 0 ? (
                  <ul className="ml-8 flex flex-col gap-1 text-[0.82rem] text-muted">
                    {queries.slice(-5).map((q) => (
                      <li key={q} className="truncate">
                        “{q}”
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
        {preview ? (
          <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
            <p className="eyebrow">While you wait: what the study did</p>
            <p className="font-display font-semibold leading-snug">{preview.title}</p>
            <p className="text-sm text-muted">{preview.summary}</p>
          </div>
        ) : null}
        {reviewId ? (
          <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
            You can leave this page. Your review will be saved at{" "}
            <Link className="font-medium text-accent underline underline-offset-2" href={`/r/${reviewId}`}>
              this link
            </Link>
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={clsx(
          "group flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          isDragActive ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent",
        )}
      >
        <input {...getInputProps()} aria-label="Choose a paper PDF" />
        <UploadCloud className="size-8 text-accent" aria-hidden />
        <div>
          <p className="font-display text-lg font-semibold">{isDragActive ? "Drop the PDF here" : "Drop a paper PDF here"}</p>
          <p className="text-sm text-muted">or click to choose a file · up to {maxMb} MB</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          className="mt-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:opacity-90"
        >
          Choose PDF
        </button>
      </div>
      {phase.kind === "error" ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-concern/40 bg-surface p-3 text-sm">
          <X className="mt-0.5 size-4 shrink-0 text-concern" aria-hidden />
          <div className="flex-1">
            <p className="font-medium">The review didn&apos;t finish</p>
            <p className="text-muted">{phase.message}</p>
          </div>
          <button type="button" onClick={reset} className="text-sm font-medium text-accent">
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}
