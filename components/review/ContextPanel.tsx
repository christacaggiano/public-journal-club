"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { claimTypeLabel, evidenceType } from "@/lib/rubric";
import type { Barometer, NumberCheck, StoredReview } from "@/lib/schema";
import { safeUrl } from "@/lib/text";
import { Rich, RichGroup } from "./Glossary";

const VERDICT_LABEL: Record<string, string> = { concern: "Concern", caution: "Caution", strength: "Strength", missing: "Not reported" };
const VERDICT_COLOR: Record<string, string> = {
  concern: "var(--concern)",
  caution: "var(--caution)",
  strength: "var(--strength)",
  missing: "var(--missing)",
};
const REL_LABEL: Record<string, string> = { agrees: "Agrees", disagrees: "Disagrees", partly: "Partly agrees", context: "Background" };
const REL_COLOR: Record<string, string> = {
  agrees: "var(--strength)",
  disagrees: "var(--concern)",
  partly: "var(--caution)",
  context: "var(--missing)",
};

const dimColor = (id: string) => `var(--d-${id}, var(--d-other))`;

type Props = {
  review: StoredReview;
  filter: string;
  onFilter: (dim: string) => void;
  selectedId: string | null;
  hotId: string | null;
  unplaced: Set<string>;
  /** Changes whenever a highlight in the paper is clicked. */
  revealNote: { id: string; nonce: number } | null;
  onSelectNote: (id: string) => void;
  onHover: (id: string | null) => void;
};

export function ContextPanel({ review, filter, onFilter, selectedId, hotId, unplaced, revealNote, onSelectNote, onHover }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!revealNote) return;
    const el = noteRefs.current.get(revealNote.id);
    const pane = scrollRef.current;
    if (!el || !pane) return;
    const y = el.offsetTop - pane.clientHeight * 0.2;
    pane.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }, [revealNote]);

  const highlights = review.highlights;
  const missing = review.missing ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of [...highlights, ...missing]) c[x.dimension] = (c[x.dimension] ?? 0) + 1;
    return c;
  }, [highlights, missing]);
  const total = highlights.length + missing.length;
  const dims = review.dimensions.filter((d) => counts[d.id]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    const pane = scrollRef.current;
    if (el && pane) pane.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
  };

  const nav = [
    ["s-tldr", "TL;DR"],
    ["s-summary", "Summary"],
    ["s-verdict", "Verdict"],
    ["s-notes", `Highlights explained (${total})`],
    ...(review.context ? [["s-context", "Scientific context"]] : []),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <nav aria-label="Review sections" className="flex flex-wrap gap-1 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur sm:px-5">
        {nav.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => scrollTo(id)}
            className="rounded-full px-2.5 py-0.5 text-[0.8rem] font-medium text-muted hover:bg-accent-soft hover:text-ink"
          >
            {label}
          </button>
        ))}
      </nav>
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex max-w-[760px] flex-col gap-9 px-4 pt-5 pb-16 sm:px-5">
          <StatusBanner review={review} />

          {/* TL;DR */}
          <section id="s-tldr" className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-[0.9rem]">
            <p className="eyebrow !text-accent">TL;DR</p>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              <RichGroup texts={review.tldr.findings}>{(nodes, i) => <li key={i}>{nodes}</li>}</RichGroup>
            </ul>
            <p className="text-muted">
              <Rich text={review.tldr.implications} />
            </p>
          </section>

          {/* Summary */}
          <section id="s-summary" className="flex flex-col gap-3">
            <p className="eyebrow">Summary</p>
            <h2 className="font-display text-[1.35rem] leading-tight font-semibold">What the study did</h2>
            <p className="max-w-[65ch]">
              <Rich text={review.summary} />
            </p>
          </section>

          {/* Verdict */}
          <section id="s-verdict" className="flex flex-col gap-3">
            <p className="eyebrow">Verdict</p>
            <h2 className="font-display text-[1.35rem] leading-tight font-semibold">How much should you trust this paper?</h2>
            {review.classification ? <ClaimBox c={review.classification} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {review.barometers.map((m) => (
                <Meter key={m.id} m={m} />
              ))}
            </div>
            <div className="flex flex-col gap-1 rounded-r-md border-l-[3px] border-accent bg-accent-soft px-4 py-3">
              <p className="text-[0.78rem] font-semibold tracking-wider text-accent uppercase">Would you act on it?</p>
              <p>
                <Rich text={review.would_you_act} />
              </p>
            </div>
            <p className="text-[0.8rem] text-muted">
              Ratings follow a published rubric.{" "}
              <Link href="/methods" className="font-medium text-accent underline underline-offset-2">
                How we rate papers
              </Link>
            </p>
          </section>

          {/* Highlights explained */}
          <section id="s-notes" className="flex flex-col gap-3">
            <p className="eyebrow">Highlights explained</p>
            <h2 className="font-display text-[1.35rem] leading-tight font-semibold">What a careful reader would question</h2>
            <p className="max-w-[65ch] text-[0.8rem] text-muted">
              Each colour marks a different question to ask of a study. Click a note to find its passage in the paper, or click a
              highlight in the paper to read its note. Underlined words have short definitions.
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show one topic">
              <Chip active={filter === "all"} onClick={() => onFilter("all")} label="All" count={total} />
              {dims.map((d) => (
                <Chip key={d.id} active={filter === d.id} onClick={() => onFilter(d.id)} label={d.label} count={counts[d.id]} color={dimColor(d.id)} />
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-7">
              {review.dimensions.map((d) => {
                const items = highlights.filter((h) => h.dimension === d.id);
                const gaps = missing.filter((m) => m.dimension === d.id);
                if (!items.length && !gaps.length) return null;
                if (filter !== "all" && filter !== d.id) return null;
                const c = dimColor(d.id);
                return (
                  <div key={d.id} className="flex flex-col gap-2.5" style={{ "--c": c } as React.CSSProperties}>
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line pb-1.5">
                      <span className="size-3 shrink-0 self-center rounded-[2px]" style={{ background: `rgba(${c}, 0.75)` }} aria-hidden />
                      <h3 className="font-display text-[1.05rem] font-semibold">{d.label}</h3>
                      <span className="text-[0.85rem] text-muted italic">{d.question}</span>
                    </div>
                    {items.map((h) => (
                      <Note
                        key={h.id}
                        ref={(el) => {
                          if (el) noteRefs.current.set(h.id, el);
                          else noteRefs.current.delete(h.id);
                        }}
                        color={c}
                        verdict={h.verdict}
                        page={h.page}
                        title={h.title}
                        quote={h.quote}
                        explanation={h.explanation}
                        check={h.check}
                        selected={selectedId === h.id}
                        hot={hotId === h.id}
                        notPlaced={Boolean(h.unverified) || unplaced.has(h.id)}
                        onClick={() => onSelectNote(h.id)}
                        onHover={(on) => onHover(on ? h.id : null)}
                      />
                    ))}
                    {gaps.map((g, i) => (
                      <Note key={`gap-${i}`} color={c} verdict="missing" title={g.title} explanation={g.explanation} />
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Scientific context */}
          {review.context ? (
            <section id="s-context" className="flex flex-col gap-3">
              <p className="eyebrow">Scientific context</p>
              <h2 className="font-display text-[1.35rem] leading-tight font-semibold">How does this fit with other research?</h2>
              {review.context.fit ? (
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="text-[0.78rem] font-semibold tracking-wider text-muted uppercase">Compared with other studies</span>
                  <span className="font-display text-[1.15rem] font-semibold text-caution">{review.context.fit}</span>
                </div>
              ) : null}
              <p className="max-w-[65ch]">
                <Rich text={review.context.summary} />
              </p>
              {review.context.comparisons.length ? (
                <>
                  <h3 className="mt-2 font-display text-[1.05rem] font-semibold">Related studies</h3>
                  <ul className="flex flex-col gap-2.5">
                    {review.context.comparisons.map((s, i) => {
                      const href = safeUrl(s.url);
                      const rel = REL_LABEL[s.relation] ? s.relation : "context";
                      return (
                        <li key={i} className="grid gap-x-3.5 gap-y-1 border-t border-line pt-2.5 sm:grid-cols-[110px_minmax(0,1fr)]">
                          <span
                            className="flex items-start gap-1.5 pt-0.5 text-[0.68rem] font-semibold tracking-widest uppercase"
                            style={{ color: REL_COLOR[rel] }}
                          >
                            <span className="mt-[3px] size-2 shrink-0 rounded-full" style={{ background: REL_COLOR[rel] }} aria-hidden />
                            {REL_LABEL[rel]}
                          </span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-[0.72rem] text-muted">
                              <Rich text={s.kind} />
                            </span>
                            <h4 className="text-[0.95rem] leading-snug font-semibold">{s.title}</h4>
                            <p className="max-w-[65ch] text-[0.88rem]">
                              <Rich text={s.finding} />
                            </p>
                            <cite className="text-[0.78rem] text-muted not-italic">
                              {href ? (
                                <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                                  {s.citation}
                                </a>
                              ) : (
                                s.citation
                              )}
                            </cite>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              {review.context.further_reading.length ? (
                <>
                  <h3 className="mt-2 font-display text-[1.05rem] font-semibold">Further reading</h3>
                  <ul className="flex flex-col gap-2.5">
                    {review.context.further_reading.map((r, i) => {
                      const href = safeUrl(r.url);
                      return href ? (
                        <li key={i} className="flex flex-col gap-0.5">
                          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
                            {r.title}
                          </a>
                          <span className="max-w-[65ch] text-[0.85rem] text-muted">{r.why}</span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          {review.glossary.length ? (
            <details className="group">
              <summary className="cursor-pointer text-[0.9rem] font-semibold">Key terms ({review.glossary.length})</summary>
              <dl className="mt-2.5 flex flex-col gap-2">
                {[...review.glossary]
                  .sort((a, b) => a.term.localeCompare(b.term))
                  .map((g) => (
                    <div key={g.term}>
                      <dt className="text-[0.88rem] font-semibold">{g.term}</dt>
                      <dd className="max-w-[65ch] text-[0.85rem] text-muted">{g.definition}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          ) : null}

          {review.sources.length ? (
            <section className="flex flex-col gap-2">
              <p className="eyebrow">Other sources used in this review</p>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-[0.85rem]">
                {review.sources.map((s, i) => {
                  const href = safeUrl(s.url);
                  return href ? (
                    <li key={i}>
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                        {s.title}
                      </a>
                    </li>
                  ) : null;
                })}
              </ol>
            </section>
          ) : null}

          <p className="max-w-[65ch] text-[0.78rem] text-muted">
            This review was written by AI as a teaching aid that models how scientists weigh evidence. It can contain mistakes and
            is not medical advice. Talk with your doctor before changing any treatment, and check this review against the paper
            itself.
            {review.models ? ` Research by ${review.models.research}; critique by ${review.models.critique}.` : review.model ? ` Model: ${review.model}.` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, count, color }: { active: boolean; onClick: () => void; label: string; count: number; color?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.8rem]",
        active ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:border-accent",
      )}
    >
      {color ? <span className="size-2.5 rounded-[2px]" style={{ background: `rgb(${color})` }} aria-hidden /> : null}
      {label}
      <span className="font-mono text-[0.72rem] opacity-70 tabular">{count}</span>
    </button>
  );
}

function Meter({ m }: { m: Barometer }) {
  const max = m.max || 5;
  const goodness = m.higher_is === "worse" ? max - m.score : m.score;
  const frac = goodness / max;
  const tone = frac < 0.35 ? "var(--concern)" : frac < 0.65 ? "var(--caution)" : "var(--strength)";
  const ends = m.ends ?? (m.higher_is === "worse" ? ["Low", "Very high"] : ["Very low", "High"]);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.75rem] font-semibold tracking-wider text-muted uppercase">{m.label}</span>
        <span className="font-mono text-[0.75rem] text-muted tabular">
          {m.score} / {max}
        </span>
      </div>
      <p className="font-display text-[1.2rem] leading-tight font-semibold" style={{ color: tone }}>
        {m.rating}
      </p>
      <div className="grid h-2.5 grid-cols-5 gap-[3px]" role="img" aria-label={`${m.label}: ${m.rating}, ${m.score} of ${max}`}>
        {Array.from({ length: 5 }, (_, i) => {
          const v = (m.score / max) * 5 - i;
          return (
            <i
              key={i}
              className="rounded-[2px]"
              style={{
                background: v >= 1 ? tone : v >= 0.5 ? `linear-gradient(90deg, ${tone} 50%, var(--line) 50%)` : "var(--line)",
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[0.7rem] text-muted">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
      {typeof m.cap === "number" ? (
        <p className="text-[0.75rem] text-muted">
          Highest possible for this design and claim: <span className="font-mono tabular">{m.cap}</span>
          {typeof m.capped_from === "number" ? ` (lowered from ${m.capped_from} to fit)` : ""}
        </p>
      ) : null}
      <p className="text-[0.83rem] leading-snug text-muted">
        <Rich text={m.rationale} />
      </p>
    </div>
  );
}

function ClaimBox({ c }: { c: NonNullable<StoredReview["classification"]> }) {
  const type = evidenceType(c.evidence_type);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-[0.75rem] font-semibold tracking-wider text-muted uppercase">What the paper claims</p>
      <p className="font-display text-[1.05rem] leading-snug font-semibold">{c.main_claim}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[0.85rem]">
        <dt className="text-muted">Type of claim</dt>
        <dd>{claimTypeLabel(c.claim_type) ?? c.claim_type}</dd>
        <dt className="text-muted">Study design</dt>
        <dd>{type?.label ?? c.evidence_type}</dd>
        {typeof c.cap === "number" ? (
          <>
            <dt className="text-muted">Strongest evidence possible</dt>
            <dd>
              <span className="font-mono tabular">{c.cap}</span> of 5 for this kind of claim from this design
            </dd>
          </>
        ) : null}
      </dl>
      {c.overreach ? (
        <p className="mt-1 rounded-md bg-accent-soft px-3 py-2 text-[0.85rem]">
          <span className="font-semibold text-concern">Claims more than the design can show. </span>
          <Rich text={c.overreach_note} />
        </p>
      ) : null}
      {type?.cap_note ? <p className="text-[0.78rem] text-muted">{type.cap_note}</p> : null}
    </div>
  );
}

const STATUS_COPY: Record<string, { title: string; body: string; tone: string } | undefined> = {
  retracted: {
    title: "This paper has been retracted",
    body: "The journal or authors withdrew it, usually because of serious errors or misconduct. Its findings should not be relied on.",
    tone: "var(--concern)",
  },
  concern: {
    title: "The journal has raised concerns about this paper",
    body: "An expression of concern means the publisher is investigating possible problems. Treat the findings with extra caution.",
    tone: "var(--caution)",
  },
  preprint: {
    title: "This is a preprint",
    body: "It has been shared publicly but has not yet been checked by other scientists through peer review.",
    tone: "var(--caution)",
  },
  corrected: {
    title: "A correction has been published",
    body: "The journal published a correction to this paper. Check whether the PDF you uploaded includes it.",
    tone: "var(--missing)",
  },
};

function StatusBanner({ review }: { review: StoredReview }) {
  const s = review.publication_status;
  const copy = s ? STATUS_COPY[s.status] : undefined;
  if (!s || !copy) return null;
  return (
    <section
      role={s.status === "retracted" ? "alert" : undefined}
      className="flex flex-col gap-1 rounded-lg border-2 bg-surface px-4 py-3"
      style={{ borderColor: copy.tone }}
    >
      <p className="font-display text-[1.1rem] font-semibold" style={{ color: copy.tone }}>
        {copy.title}
      </p>
      <p className="text-[0.9rem]">{copy.body}</p>
      {s.notices.length ? (
        <ul className="text-[0.8rem] text-muted">
          {s.notices.map((n, i) => (
            <li key={i}>
              {n.label}
              {n.date ? `, ${n.date}` : ""}
              {n.doi ? (
                <>
                  {" · "}
                  <a href={`https://doi.org/${n.doi}`} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                    notice
                  </a>
                </>
              ) : null}
              {n.source === "retraction-watch" ? " · via Retraction Watch" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CheckDetails({ check }: { check: NumberCheck }) {
  return (
    <details className="group rounded-md border border-line px-3 py-2 text-[0.82rem]" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer font-medium text-accent">
        How we checked{check.computed_with_code ? " (recomputed with code)" : " (checked by hand)"}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-muted">The paper says</dt>
        <dd>{check.reported}</dd>
        <dt className="text-muted">Using</dt>
        <dd>{check.inputs}</dd>
        <dt className="text-muted">Method</dt>
        <dd>{check.method}</dd>
        <dt className="text-muted">Result</dt>
        <dd className="font-medium">{check.recomputed}</dd>
      </dl>
    </details>
  );
}

type NoteProps = {
  color: string;
  verdict: string;
  page?: number;
  title: string;
  quote?: string;
  explanation: string;
  check?: NumberCheck;
  selected?: boolean;
  hot?: boolean;
  notPlaced?: boolean;
  onClick?: () => void;
  onHover?: (on: boolean) => void;
};

const Note = forwardRef<HTMLElement, NoteProps>(function Note(p, ref) {
  const interactive = Boolean(p.onClick);
  const v = VERDICT_COLOR[p.verdict] ?? "var(--caution)";
  return (
    <article
      ref={ref}
      tabIndex={interactive ? 0 : undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".term, a")) return;
        p.onClick?.();
      }}
      onKeyDown={(e) => {
        if (interactive && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          p.onClick?.();
        }
      }}
      onMouseEnter={() => p.onHover?.(true)}
      onMouseLeave={() => p.onHover?.(false)}
      className={clsx(
        "relative flex flex-col gap-1.5 rounded-lg border bg-surface py-3 pr-3.5 pl-4 transition-[border-color,box-shadow]",
        interactive ? "cursor-pointer" : "border-dashed",
        p.hot ? "border-[rgba(var(--c),0.9)]" : "border-line",
        interactive && "hover:border-[rgba(var(--c),0.9)]",
        p.selected && "shadow-[0_0_0_2px_rgba(var(--c),0.7)]",
      )}
    >
      <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-[2px]" style={{ background: `rgba(${p.color}, 0.8)` }} aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-widest uppercase" style={{ color: v }}>
          <span
            className="size-[7px] rounded-full"
            style={p.verdict === "missing" ? { border: `1.5px solid ${v}` } : { background: v }}
            aria-hidden
          />
          {VERDICT_LABEL[p.verdict] ?? p.verdict}
        </span>
        {p.page ? <span className="ml-auto font-mono text-[0.72rem] text-muted">p. {p.page}</span> : null}
      </div>
      <h4 className="text-[0.97rem] leading-snug font-semibold">{p.title}</h4>
      {p.quote ? (
        <blockquote className="border-l-2 border-line pl-2.5 font-display text-[0.92rem] leading-snug text-muted italic">
          “{p.quote.replace(/\s+/g, " ")}”
        </blockquote>
      ) : null}
      <p className="max-w-[65ch] text-[0.9rem]">
        <Rich text={p.explanation} />
      </p>
      {p.check ? <CheckDetails check={p.check} /> : null}
      {p.notPlaced ? <p className="text-[0.75rem] text-caution">This exact passage couldn&apos;t be found in the PDF, so it isn&apos;t highlighted.</p> : null}
    </article>
  );
});
