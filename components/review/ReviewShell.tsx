"use client";

import clsx from "clsx";
import { FilePlus2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { evidenceType, populationLabel } from "@/lib/rubric";
import type { StoredReview } from "@/lib/schema";
import { Brand } from "../SiteHeader";
import { ThemeToggle } from "../ThemeToggle";
import { ContextPanel } from "./ContextPanel";
import { GlossaryProvider } from "./Glossary";
import { useMediaQuery } from "./useMediaQuery";

const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-reader text-muted">Loading the paper…</div>,
});

export function ReviewShell({ review }: { review: StoredReview }) {
  const wide = useMediaQuery("(min-width: 900px)");
  const [tab, setTab] = useState<"paper" | "review">("review");
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hotId, setHotId] = useState<string | null>(null);
  const [jumpTo, setJumpTo] = useState<{ id: string; nonce: number } | null>(null);
  const [revealNote, setRevealNote] = useState<{ id: string; nonce: number } | null>(null);
  const [showHighlights, setShowHighlights] = useState(true);
  const [unplaced, setUnplaced] = useState<Set<string>>(new Set());

  const viewerHighlights = useMemo(
    () => review.highlights.map((h) => ({ id: h.id, dimension: h.dimension, page: h.page, quote: h.quote, unverified: h.unverified })),
    [review.highlights],
  );

  const selectNote = useCallback(
    (id: string) => {
      setSelectedId(id);
      if (!wide) setTab("paper");
      // Let the paper pane become visible before measuring scroll positions.
      requestAnimationFrame(() => setJumpTo({ id, nonce: Date.now() }));
    },
    [wide],
  );

  const clickHighlight = useCallback(
    (id: string) => {
      const h = review.highlights.find((x) => x.id === id);
      if (h && filter !== "all" && h.dimension !== filter) setFilter("all");
      setSelectedId(id);
      if (!wide) setTab("review");
      requestAnimationFrame(() => setRevealNote({ id, nonce: Date.now() }));
    },
    [filter, review.highlights, wide],
  );

  const onPlacement = useCallback((_page: number, placed: string[], missing: string[]) => {
    setUnplaced((prev) => {
      const next = new Set(prev);
      placed.forEach((id) => next.delete(id));
      missing.forEach((id) => next.add(id));
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, []);

  const paper = (
    <PdfViewer
      url={review.pdf_url}
      highlights={viewerHighlights}
      filter={filter}
      hotId={hotId}
      jumpTo={jumpTo}
      showHighlights={showHighlights}
      onShowHighlightsChange={setShowHighlights}
      onHighlightClick={clickHighlight}
      onHover={setHotId}
      onPlacement={onPlacement}
    />
  );
  const panel = (
    <ContextPanel
      review={review}
      filter={filter}
      onFilter={setFilter}
      selectedId={selectedId}
      hotId={hotId}
      unplaced={unplaced}
      revealNote={revealNote}
      onSelectNote={selectNote}
      onHover={setHotId}
    />
  );

  const meta = [review.paper.authors, review.paper.journal, review.paper.year].filter(Boolean).join(" · ");

  return (
    <GlossaryProvider entries={review.glossary}>
      <div className="flex h-dvh flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2.5">
          <Brand />
          <div className="flex min-w-0 flex-[1_1_320px] flex-col">
            <h1 className="line-clamp-2 font-display text-base leading-snug font-medium">{review.paper.title}</h1>
            <p className="truncate text-[0.8rem] text-muted">
              {meta}
              {review.paper.study_type ? (
                <>
                  {" · "}
                  <span className="font-medium text-concern">{review.paper.study_type}</span>
                </>
              ) : null}
            </p>
            <Badges review={review} />
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[0.85rem] whitespace-nowrap hover:border-accent"
            >
              <FilePlus2 className="size-4" aria-hidden /> <span className="hidden sm:inline">Review a paper</span>
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {wide ? (
          <PanelGroup direction="horizontal" autoSaveId="pjc-split" className="min-h-0 flex-1">
            <Panel defaultSize={52} minSize={30} className="min-w-0">
              {paper}
            </Panel>
            <PanelResizeHandle className="group relative w-px bg-line outline-none data-[resize-handle-state=drag]:bg-accent data-[resize-handle-state=hover]:bg-accent">
              <span className="absolute inset-y-0 -left-1.5 -right-1.5" aria-hidden />
            </PanelResizeHandle>
            <Panel defaultSize={48} minSize={28} className="min-w-0">
              {panel}
            </Panel>
          </PanelGroup>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Show" className="grid grid-cols-2 border-b border-line bg-surface text-sm font-medium">
              {(["review", "paper"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={clsx("py-2.5", tab === t ? "border-b-2 border-accent text-ink" : "border-b-2 border-transparent text-muted")}
                >
                  {t === "review" ? "Review" : "Paper"}
                </button>
              ))}
            </div>
            <div className={clsx("min-h-0 flex-1", tab !== "paper" && "hidden")}>{paper}</div>
            <div className={clsx("min-h-0 flex-1", tab !== "review" && "hidden")}>{panel}</div>
          </div>
        )}
      </div>
    </GlossaryProvider>
  );
}

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  peer_reviewed: { label: "Peer-reviewed", tone: "var(--strength)" },
  preprint: { label: "Preprint, not peer-reviewed", tone: "var(--caution)" },
  retracted: { label: "Retracted", tone: "var(--concern)" },
  concern: { label: "Expression of concern", tone: "var(--concern)" },
  corrected: { label: "Correction issued", tone: "var(--caution)" },
};

function Badges({ review }: { review: StoredReview }) {
  const status = review.publication_status ? STATUS_BADGE[review.publication_status.status] : undefined;
  const design = evidenceType(review.classification?.evidence_type)?.badge;
  const population = populationLabel(review.classification?.population);
  if (!status && !design && !population) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="About this paper">
      {status ? (
        <li
          className="rounded-full border px-2 py-px text-[0.72rem] font-semibold"
          style={{ color: status.tone, borderColor: status.tone }}
        >
          {status.label}
        </li>
      ) : null}
      {[population, design].filter(Boolean).map((label) => (
        <li key={label} className="rounded-full border border-line bg-bg px-2 py-px text-[0.72rem] text-muted">
          {label}
        </li>
      ))}
    </ul>
  );
}
