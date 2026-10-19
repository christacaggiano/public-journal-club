import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
        <h1 className="font-display text-3xl font-semibold">We couldn&apos;t find that review</h1>
        <p className="text-muted">The link may be mistyped, or the review may have been removed.</p>
        <Link href="/" className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface hover:opacity-90">
          Review a paper
        </Link>
      </main>
    </div>
  );
}
