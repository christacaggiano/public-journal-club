"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-4 py-16">
      <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
      <p className="text-muted">The page couldn&apos;t be loaded. Try again, and if it keeps happening, come back in a few minutes.</p>
      <button type="button" onClick={reset} className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:opacity-90">
        Try again
      </button>
    </main>
  );
}
