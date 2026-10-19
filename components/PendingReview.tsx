"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "./SiteHeader";

type Status = { state: "processing"; startedAt: number } | { state: "failed"; message: string };

/** Shown at /r/[id] while a review is still being written, or after it failed. */
export function PendingReview({ id, initial }: { id: string; initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status.state !== "processing") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/review/${id}`, { cache: "no-store" });
        const next = (await res.json()) as { state: string; startedAt?: number; message?: string };
        if (next.state === "done") router.refresh();
        else if (next.state === "failed") setStatus({ state: "failed", message: next.message ?? "The review could not be completed." });
      } catch {
        /* try again on the next tick */
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [id, router, status.state]);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
        {status.state === "processing" ? (
          <>
            <Loader2 className="size-7 animate-spin text-accent" aria-hidden />
            <h1 className="font-display text-3xl font-semibold">Your review is being written</h1>
            <p className="text-muted" aria-live="polite">
              Started {formatElapsed(now - status.startedAt)} ago. Most reviews take 2 to 4 minutes. This page will open the review
              as soon as it&apos;s ready, so you can leave it open or come back to this link later.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="size-7 text-concern" aria-hidden />
            <h1 className="font-display text-3xl font-semibold">This review didn&apos;t finish</h1>
            <p className="text-muted">{status.message}</p>
            <p className="text-muted">Upload the same PDF again to try again.</p>
            <Link href="/" className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:opacity-90">
              Upload a paper
            </Link>
          </>
        )}
      </main>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
