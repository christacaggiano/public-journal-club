import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { RATING_IDS, rubric } from "@/lib/rubric";

export const metadata: Metadata = {
  title: "How we rate papers",
  description: "The rubric Public Journal Club uses to rate scientific papers, with the appraisal tools it is based on.",
};

function Cite({ id }: { id: string }) {
  const c = rubric.citations[id];
  if (!c) return null;
  return (
    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
      {c.short}
    </a>
  );
}

function CiteList({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 ? ", " : ""}
          <Cite id={id} />
        </span>
      ))}
    </>
  );
}

export default function MethodsPage() {
  const claims = rubric.claim_types;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">Methods · rubric version {rubric.version}</p>
          <h1 className="font-display text-4xl leading-tight font-semibold">How we rate papers</h1>
          <p className="max-w-[65ch] text-[1.02rem] text-muted">
            Every review is written by AI, but the ratings follow a fixed rubric based on the tools scientists use to appraise
            studies. Different kinds of studies can show different things, so a paper is judged against the best version of its own
            design, and the strength of its main claim is capped by what that design can support.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">1. What kind of claim is it?</h2>
          <p className="max-w-[65ch]">
            Each review starts by naming the paper&apos;s main claim and what kind of claim it is. A study can be excellent and still
            claim more than it can show. When that happens, the review says the paper overreaches.
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {claims.map((c) => (
              <div key={c.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                <dt className="font-semibold">{c.label}</dt>
                <dd className="text-[0.9rem] text-muted">{c.description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">2. How strong can the evidence be?</h2>
          <p className="max-w-[65ch]">
            The table shows the highest score, out of 5, that &quot;evidence for the main claim&quot; can get for each study design
            and kind of claim. The review starts from this cap and lowers it for problems it finds. The cap is applied
            automatically, so it can&apos;t be exceeded. This follows the approach of <Cite id="grade" /> and the{" "}
            <Cite id="ocebm" />.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[720px] text-[0.85rem]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-3 py-2 font-semibold">Study design</th>
                  {claims.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-center font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rubric.evidence_types.map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{t.label}</span>
                      <span className="block text-[0.78rem] text-muted">{t.examples}</span>
                    </td>
                    {claims.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-center font-mono tabular">
                        {t.caps[c.id]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">3. Was the study done well?</h2>
          <p className="max-w-[65ch]">
            Study quality is judged against a short checklist for each design, drawn from the established appraisal tool for that
            design. These are plain-language summaries, not the full tools.
          </p>
          <div className="flex flex-col gap-2">
            {rubric.evidence_types.map((t) => (
              <details key={t.id} className="rounded-lg border border-line bg-surface px-4 py-3">
                <summary className="cursor-pointer font-semibold">{t.label}</summary>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[0.9rem]">
                  {t.checklist.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.8rem] text-muted">
                  Based on <CiteList ids={t.tools} />.{t.cap_note ? ` ${t.cap_note}` : ""}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">4. The four ratings</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {RATING_IDS.map((id) => {
              const r = rubric.ratings[id];
              return (
                <div key={id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3">
                  <p className="font-display text-lg font-semibold">{r.label}</p>
                  <p className="text-[0.88rem] text-muted">
                    {r.definition}
                    {r.tools.length ? (
                      <>
                        {" "}
                        See <CiteList ids={r.tools} />.
                      </>
                    ) : null}
                  </p>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.85rem]">
                    {(["5", "4", "3", "2", "1", "0"] as const)
                      .filter((k) => r.anchors[k])
                      .map((k) => (
                        <div key={k} className="contents">
                          <dt className="font-mono tabular">{k}</dt>
                          <dd>{r.anchors[k]}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">Other checks</h2>
          <ul className="flex max-w-[65ch] list-disc flex-col gap-2 pl-5">
            <li>
              <span className="font-medium">Retractions and corrections.</span> Each paper&apos;s DOI is checked against Crossref,
              which includes the Retraction Watch database (<Cite id="crossref_rw" />). Retracted papers carry a warning at the
              top of the review, and preprints are labelled as not yet peer-reviewed.
            </li>
            <li>
              <span className="font-medium">Showing our work on numbers.</span> Reporting errors can be caught by recomputing a
              paper&apos;s statistics from its own numbers (<Cite id="statcheck" />; <Cite id="grim" />). Before a review says a
              number is wrong, it recomputes it, using code where needed, and shows how under &quot;How we checked&quot;.
            </li>
            <li>
              <span className="font-medium">Quotes.</span> Every highlighted passage is matched against the PDF&apos;s own text.
              Passages that can&apos;t be found aren&apos;t highlighted, and the note says so.
            </li>
            <li>
              <span className="font-medium">Balance.</span> Each review must name at least {rubric.min_strengths} genuine
              strengths.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">Limitations</h2>
          <p className="max-w-[65ch]">
            The ratings are AI judgments guided by this rubric. They have not yet been compared against independent expert raters,
            and the caps reflect our judgment informed by the frameworks cited here. Reviews can contain mistakes. They are a
            teaching aid, not medical advice.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold">References</h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[0.85rem]">
            {Object.entries(rubric.citations).map(([id, c]) => (
              <li key={id}>
                {c.full}{" "}
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline underline-offset-2">
                  {c.url}
                </a>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
