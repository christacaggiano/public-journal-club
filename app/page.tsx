import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { Uploader } from "@/components/Uploader";
import { config, useBlob } from "@/lib/config";
import { DIMENSIONS } from "@/lib/schema";

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16">
          <section className="flex min-w-0 flex-col gap-6">
            <p className="eyebrow">Plain-language paper reviews</p>
            <h1 className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl">Read the study, not just the headline.</h1>
            <p className="max-w-[58ch] text-[1.05rem] text-muted">
              Upload a scientific paper. You&apos;ll get a plain-language summary, the passages worth questioning highlighted right in
              the paper, a rating of how much to trust it, and how it fits with other research.
            </p>
            <Uploader useBlob={useBlob} blobAccess={config.blobAccess} maxMb={Math.round(config.maxPdfBytes / 1024 / 1024)} />
            <Link href="/r/sample" className="inline-flex items-center gap-1.5 self-start font-medium text-accent hover:underline">
              See an example review: yoga for teen scoliosis
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/methods" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted hover:text-accent hover:underline">
              How we rate papers
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </section>

          <aside className="flex min-w-0 flex-col gap-4" aria-labelledby="questions-heading">
            <h2 id="questions-heading" className="font-display text-xl font-semibold">
              Seven questions every review asks
            </h2>
            <p className="text-sm text-muted">
              Scientists learn to read papers critically by asking the same questions every time. Each one gets its own
              highlighter colour in the paper.
            </p>
            <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
              {DIMENSIONS.map((d) => (
                <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className="mt-1 h-3.5 w-6 shrink-0 rounded-[3px]"
                    style={{ background: `rgba(var(--d-${d.id}), 0.45)` }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="font-medium">{d.label}</p>
                    <p className="text-sm text-muted">{d.question}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section className="mt-16 border-t border-line pt-10" aria-labelledby="how-heading">
          <h2 id="how-heading" className="font-display text-xl font-semibold">
            How it works
          </h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            {[
              ["Upload a PDF", "Any research paper with selectable text works best. Your file is stored privately so your review can be shown."],
              ["The AI reads it", "Claude reads the full paper, searches for related studies, and checks every quoted passage against the PDF."],
              ["Read side by side", "The paper sits on the left with passages highlighted. Click any highlight to see what a careful reader would ask."],
            ].map(([title, body], i) => (
              <li key={title} className="flex flex-col gap-1.5">
                <span className="font-mono text-sm text-accent tabular">Step {i + 1}</span>
                <p className="font-medium">{title}</p>
                <p className="text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted sm:px-6">
          Reviews are written by AI to help you weigh evidence. They can contain mistakes and are not medical advice. Talk with your
          doctor before changing any treatment. Please don&apos;t upload confidential documents.
        </p>
      </footer>
    </div>
  );
}
