"use client";

import "react-pdf/dist/Page/TextLayer.css";

import { Minus, Plus, ScanLine } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { normalizeForMatch } from "@/lib/text";
import type { ViewerHighlight } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const PAGE_GAP = 18;

type Rect = { id: string; left: number; top: number; width: number; height: number };

type Props = {
  url: string;
  highlights: ViewerHighlight[];
  filter: string;
  hotId: string | null;
  /** Changes whenever the reader asks to jump to a highlight. */
  jumpTo: { id: string; nonce: number } | null;
  showHighlights: boolean;
  onShowHighlightsChange: (show: boolean) => void;
  onHighlightClick: (id: string) => void;
  onHover: (id: string | null) => void;
  onPlacement: (pageNumber: number, placedIds: string[], missingIds: string[]) => void;
};

/* ---------- quote location inside a rendered text layer ---------- */

function buildIndex(layer: Element) {
  let str = "";
  const map: { node: Text; off: number }[] = [];
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const t = node.data;
    for (let i = 0; i < t.length; i++) {
      const c = normalizeForMatch(t[i]);
      for (let k = 0; k < c.length; k++) {
        str += c[k];
        map.push({ node, off: i });
      }
    }
  }
  return { str, map };
}

function mergeLines(rects: DOMRect[]) {
  const sorted = rects.filter((r) => r.width > 1 && r.height > 1).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.top - r.top) < r.height * 0.5 && r.left - last.right < r.height * 1.2) {
      last.left = Math.min(last.left, r.left);
      last.right = Math.max(last.right, r.right);
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.bottom);
    } else {
      lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
  }
  return lines;
}

function locateOnPage(pageEl: HTMLElement, items: ViewerHighlight[]) {
  const layer = pageEl.querySelector(".react-pdf__Page__textContent");
  if (!layer) return { rects: [] as Rect[], placed: [] as string[], missing: items.map((h) => h.id) };
  const index = buildIndex(layer);
  const base = pageEl.getBoundingClientRect();
  const rects: Rect[] = [];
  const placed: string[] = [];
  const missing: string[] = [];
  for (const h of items) {
    const q = normalizeForMatch(h.quote);
    const at = q ? index.str.indexOf(q) : -1;
    if (at < 0) {
      missing.push(h.id);
      continue;
    }
    const start = index.map[at];
    const end = index.map[at + q.length - 1];
    const range = document.createRange();
    range.setStart(start.node, start.off);
    range.setEnd(end.node, end.off + 1);
    for (const line of mergeLines([...range.getClientRects()])) {
      const padY = (line.bottom - line.top) * 0.12;
      rects.push({
        id: h.id,
        left: (line.left - base.left - 1) / base.width,
        top: (line.top - base.top - padY) / base.height,
        width: (line.right - line.left + 2) / base.width,
        height: (line.bottom - line.top + padY * 2) / base.height,
      });
    }
    placed.push(h.id);
  }
  return { rects, placed, missing };
}

/* ---------- one lazily rendered page ---------- */

type PageProps = {
  pageNumber: number;
  width: number;
  ratio: number;
  root: HTMLElement | null;
  items: ViewerHighlight[];
  rects: Rect[] | undefined;
  colorFor: Map<string, { color: string; dimmed: boolean }>;
  hotId: string | null;
  flash: { id: string; nonce: number } | null;
  onRects: (pageNumber: number, rects: Rect[], placed: string[], missing: string[]) => void;
  onHighlightClick: (id: string) => void;
  onHover: (id: string | null) => void;
  registerRef: (pageNumber: number, el: HTMLDivElement | null) => void;
};

const LazyPage = memo(function LazyPage(p: PageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(p.pageNumber <= 2);
  const height = Math.round(p.width * p.ratio);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !p.root) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: p.root, rootMargin: "1600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [p.root]);

  const handleText = useCallback(() => {
    const pageEl = wrapRef.current?.querySelector<HTMLElement>(".react-pdf__Page");
    if (!pageEl) return;
    const { rects, placed, missing } = locateOnPage(pageEl, p.items);
    p.onRects(p.pageNumber, rects, placed, missing);
  }, [p.items, p.onRects, p.pageNumber]);

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        p.registerRef(p.pageNumber, el);
      }}
      data-page={p.pageNumber}
      className="relative shrink-0 bg-white shadow-[0_1px_3px_rgba(10,20,35,0.18)]"
      style={{ width: p.width, height }}
    >
      {near ? (
        <Page
          pageNumber={p.pageNumber}
          width={p.width}
          renderAnnotationLayer={false}
          onRenderTextLayerSuccess={handleText}
          loading={null}
          className="!bg-white"
        />
      ) : null}
      {near && p.rects ? (
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 4 }}>
          {p.rects.map((r, i) => {
            const meta = p.colorFor.get(r.id);
            return (
              <div
                key={`${r.id}-${i}`}
                role="button"
                tabIndex={-1}
                aria-label="Open the note for this passage"
                className="hl"
                data-hot={p.hotId === r.id || undefined}
                data-dim={meta?.dimmed || undefined}
                data-flash={p.flash?.id === r.id ? "true" : undefined}
                style={
                  {
                    "--c": meta?.color ?? "var(--d-other)",
                    left: `${r.left * 100}%`,
                    top: `${r.top * 100}%`,
                    width: `${r.width * 100}%`,
                    height: `${r.height * 100}%`,
                  } as React.CSSProperties
                }
                onClick={() => p.onHighlightClick(r.id)}
                onMouseEnter={() => p.onHover(r.id)}
                onMouseLeave={() => p.onHover(null)}
              />
            );
          })}
        </div>
      ) : null}
      <span className="absolute top-full right-0 pt-0.5 font-mono text-[0.7rem] text-muted">p. {p.pageNumber}</span>
    </div>
  );
});

/* ---------- viewer ---------- */

export default function PdfViewer(props: Props) {
  const { url, highlights, filter, hotId, jumpTo, showHighlights, onShowHighlightsChange, onHighlightClick, onHover, onPlacement } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [numPages, setNumPages] = useState(0);
  const [ratios, setRatios] = useState<number[]>([]);
  const [availWidth, setAvailWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rectsByPage, setRectsByPage] = useState<Map<number, Rect[]>>(new Map());
  const [flash, setFlash] = useState<{ id: string; nonce: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pendingJump = useRef<string | null>(null);
  const scrollFrac = useRef<number | null>(null);

  // Track the pane width; ignore zero widths while the pane is hidden on small screens.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setAvailWidth((prev) => (Math.abs(prev - w) > 6 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseWidth = Math.max(240, Math.min(availWidth - 40, 1000));
  const pageWidth = Math.round(baseWidth * zoom);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrollFrac.current != null) {
      el.scrollTop = scrollFrac.current * el.scrollHeight;
      scrollFrac.current = null;
    }
  }, [pageWidth]);

  const changeZoom = (next: number) => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > 0) scrollFrac.current = el.scrollTop / el.scrollHeight;
    setZoom(next);
  };
  const step = (dir: 1 | -1) => {
    let i = ZOOM_STEPS.findIndex((z) => Math.abs(z - zoom) < 0.001);
    if (i < 0) i = ZOOM_STEPS.indexOf(1);
    changeZoom(ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + dir))]);
  };

  const byPage = useMemo(() => {
    const m = new Map<number, ViewerHighlight[]>();
    for (const h of highlights) {
      if (h.unverified) continue;
      const list = m.get(h.page) ?? [];
      list.push(h);
      m.set(h.page, list);
    }
    return m;
  }, [highlights]);

  const colorFor = useMemo(() => {
    const m = new Map<string, { color: string; dimmed: boolean }>();
    for (const h of highlights) m.set(h.id, { color: `var(--d-${h.dimension}, var(--d-other))`, dimmed: filter !== "all" && h.dimension !== filter });
    return m;
  }, [highlights, filter]);

  const scrollToRect = useCallback((id: string, rects: Rect[], pageNumber: number) => {
    const el = scrollRef.current;
    const pageEl = pageRefs.current.get(pageNumber);
    const r = rects.find((x) => x.id === id);
    if (!el || !pageEl || !r) return;
    const y = pageEl.offsetTop + r.top * pageEl.offsetHeight - el.clientHeight * 0.3;
    el.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    setFlash({ id, nonce: Date.now() });
  }, []);

  const handleRects = useCallback(
    (pageNumber: number, rects: Rect[], placed: string[], missing: string[]) => {
      setRectsByPage((prev) => {
        const next = new Map(prev);
        next.set(pageNumber, rects);
        return next;
      });
      onPlacement(pageNumber, placed, missing);
      if (pendingJump.current && placed.includes(pendingJump.current)) {
        const id = pendingJump.current;
        pendingJump.current = null;
        requestAnimationFrame(() => scrollToRect(id, rects, pageNumber));
      }
    },
    [onPlacement, scrollToRect],
  );

  // Jump to a highlight when a note is clicked.
  useEffect(() => {
    if (!jumpTo) return;
    const h = highlights.find((x) => x.id === jumpTo.id);
    if (!h || h.unverified) return;
    const rects = rectsByPage.get(h.page);
    const el = scrollRef.current;
    const pageEl = pageRefs.current.get(h.page);
    if (rects?.some((r) => r.id === h.id)) {
      scrollToRect(h.id, rects, h.page);
    } else if (el && pageEl) {
      pendingJump.current = h.id;
      el.scrollTo({ top: Math.max(0, pageEl.offsetTop - 20), behavior: "auto" });
    }
    // Only react to new jump requests, not to every highlight re-measure.
  }, [jumpTo]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  // Re-measure highlights after a zoom change (pages re-render their text layers).
  useEffect(() => {
    setRectsByPage(new Map());
  }, [pageWidth]);

  const registerRef = useCallback((n: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(n, el);
    else pageRefs.current.delete(n);
  }, []);

  const empty = useMemo(() => [] as ViewerHighlight[], []);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-reader">
      <div className="z-10 flex flex-wrap items-center gap-2 border-b border-line bg-reader/90 px-4 py-2 text-[0.82rem] text-muted backdrop-blur">
        <button type="button" onClick={() => step(-1)} className="inline-flex size-7 items-center justify-center rounded-md border border-line bg-surface hover:border-accent" aria-label="Zoom out">
          <Minus className="size-3.5" aria-hidden />
        </button>
        <span className="min-w-[3.5em] text-center font-mono tabular">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => step(1)} className="inline-flex size-7 items-center justify-center rounded-md border border-line bg-surface hover:border-accent" aria-label="Zoom in">
          <Plus className="size-3.5" aria-hidden />
        </button>
        <button type="button" onClick={() => changeZoom(1)} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 hover:border-accent">
          <ScanLine className="size-3.5" aria-hidden /> Fit width
        </button>
        <span className="flex-1" />
        {numPages ? <span className="font-mono tabular">{numPages} pages</span> : null}
        <label className="ml-2 flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={showHighlights} onChange={(e) => onShowHighlightsChange(e.target.checked)} />
          Highlights
        </label>
      </div>
      <div
        ref={(el) => {
          scrollRef.current = el;
          setRoot(el);
        }}
        className={`relative min-h-0 flex-1 overflow-auto ${showHighlights ? "" : "[&_.hl]:pointer-events-none [&_.hl]:opacity-0"}`}
      >
        {loadError ? (
          <p className="p-10 text-center text-muted">{loadError}</p>
        ) : (
          <Document
            file={url}
            onLoadSuccess={async (pdf) => {
              const sizes = await Promise.all(
                Array.from({ length: pdf.numPages }, async (_, i) => {
                  const page = await pdf.getPage(i + 1);
                  const vp = page.getViewport({ scale: 1 });
                  return vp.height / vp.width;
                }),
              );
              setRatios(sizes);
              setNumPages(pdf.numPages);
            }}
            onLoadError={() => setLoadError("The PDF couldn't be loaded. Try refreshing the page.")}
            loading={<p className="p-10 text-center text-muted">Loading the paper…</p>}
            className="flex flex-col items-center px-4 pt-[18px] pb-10"
          >
            {availWidth > 0 &&
              ratios.map((ratio, i) => (
                <div key={i + 1} style={{ marginBottom: PAGE_GAP }}>
                  <LazyPage
                    pageNumber={i + 1}
                    width={pageWidth}
                    ratio={ratio}
                    root={root}
                    items={byPage.get(i + 1) ?? empty}
                    rects={rectsByPage.get(i + 1)}
                    colorFor={colorFor}
                    hotId={hotId}
                    flash={flash}
                    onRects={handleRects}
                    onHighlightClick={onHighlightClick}
                    onHover={onHover}
                    registerRef={registerRef}
                  />
                </div>
              ))}
          </Document>
        )}
      </div>
    </div>
  );
}
