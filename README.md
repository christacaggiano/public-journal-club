# Public Journal Club

[![CI](https://github.com/christacaggiano/public-journal-club/actions/workflows/ci.yml/badge.svg)](https://github.com/christacaggiano/public-journal-club/actions/workflows/ci.yml)

Upload a scientific paper and get a plain-language review. The paper sits on the left with key passages highlighted. On the right are a TL;DR, a summary, trust ratings, an explanation of every highlight, and the paper's scientific context.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, react-pdf, the Claude API and Vercel Blob.

**For scientists checking our work:** the full rating method, with the appraisal tools it draws on and references, is in [`docs/METHODS.md`](docs/METHODS.md). The same information is on the site at `/methods`.

## How it works

1. **Upload.** On Vercel, the browser uploads the PDF directly to Vercel Blob, which avoids the 4.5 MB request limit on functions. Locally, the PDF is posted to the API.
2. **Review.** `POST /api/review` hashes the PDF. If the same paper has already been reviewed with the same prompt version, rubric version and models, the saved review opens instantly. Otherwise it streams progress back to the page as newline-delimited JSON while it works:
   - **Publication status (no AI):** the DOI printed in the PDF is looked up in Crossref, which includes Retraction Watch data. Retractions, expressions of concern, corrections and preprints are shown as a badge, and retractions as a warning at the top of the review.
   - **Background check (Sonnet 5.5, 2 web searches):** paper details, plus short notes on the authors' interests, the journal, and earlier or repeat studies. This is quick, because the critique waits for it.
   - **Critique and context, at the same time.** Opus 5.5 (no web search, with a code sandbox for recomputing statistics) reads the PDF and the background notes. It classifies the paper, writes the highlights, and scores the four ratings with the rubric in `config/rubric.json`. Any note that says a number is wrong includes a "How we checked" section with the inputs, method and recomputed result. Meanwhile Sonnet 5.5 (2 web searches) writes the summary and the Scientific context section. The summary is shown on the progress screen as soon as it's ready, and the number of flagged passages updates as Opus writes.
   - **Glossary (Sonnet 5.5):** defines the terms used anywhere in the finished review.

   Each step returns its part through a tool whose input schema comes from `lib/schema.ts`. Each review stores its token use and estimated cost per model (`usage` and `cost_usd` in `review.json`), and the server log prints the total. Set `CRITIQUE_FAST_MODE=true` to run the critique in Opus fast mode, which writes much faster at twice the per-token price.
3. **Check.** Every quoted passage is matched against the PDF's own text (`unpdf`). The research model gets one chance to repair any quotes that don't match. Quotes that still don't match are flagged, not highlighted. The cap on "evidence for the main claim" is applied in code, and "recomputed with code" labels are kept only if the critique actually ran code.
4. **Save and share.** The review is saved under `reviews/{id}/` and lives at `/r/{id}`. The work runs inside `after()`, so it finishes and saves even if the reader closes the tab. Visiting the link while it's still running shows a waiting page that opens the review when it's ready.

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Home page and uploader |
| `app/r/[id]/` | Review page, loading state and social share image |
| `app/api/review/route.ts` | Starts a review and streams progress |
| `app/api/review/[id]/route.ts` | Status check for the waiting page |
| `app/api/upload/route.ts` | Issues Vercel Blob client-upload tokens |
| `app/api/papers/[id]/route.ts` | Serves stored PDFs from the site's own origin |
| `config/rubric.json` | **The rating rubric:** evidence types, caps, checklists, score anchors and citations |
| `lib/rubric.ts` | Loads and validates the rubric, builds its prompt text, looks up caps |
| `app/methods/page.tsx` | Public "How we rate papers" page, rendered from the rubric |
| `docs/METHODS.md` | Methods for scientists, generated from the rubric (`npm run docs`) |
| `lib/crossref.ts` | Retraction, correction and preprint lookup |
| `lib/prompt.ts` | Prompts for each step (bump `PROMPT_VERSION` in `lib/config.ts` when you change them) |
| `lib/schema.ts` | Review schema (zod) used for the tool definition and validation |
| `lib/review-runner.ts` | Background, critique, context and glossary steps, quote repair, usage tracking |
| `lib/pricing.ts` | Per-model prices used for the cost estimate |
| `lib/storage.ts` | Vercel Blob or local `.data/` storage |
| `components/review/` | Split view, PDF viewer with highlights, review panel, glossary pop-ups |
| `data/sample-review.json` | The hand-written example review at `/r/sample` |

## Changing the rubric

Everything about how papers are rated lives in `config/rubric.json`:
- the claim types and evidence types,
- the cap for each evidence type and claim type,
- each design's checklist,
- the definition and 0–5 anchors for each rating,
- the citations.

To change it:

1. Edit `config/rubric.json`.
2. Bump its `version`. Reviews are keyed on this, so every paper gets a fresh review the next time it's uploaded.
3. Run `npm run docs` to regenerate `docs/METHODS.md`. The `/methods` page updates on its own.

The app checks the file when it starts and refuses to run if something is inconsistent, for example an evidence type missing a cap or citing an unknown reference.

## Run locally

```bash
npm install            # also copies the PDF.js worker into public/
cp .env.example .env.local
# add ANTHROPIC_API_KEY to .env.local
npm run dev            # http://localhost:3000
```

Without `BLOB_READ_WRITE_TOKEN`, papers and reviews are saved in `./.data`.

## Deploy to Vercel

1. Put this folder in a GitHub repository and import it at vercel.com/new. Or run `npx vercel` from this folder.
2. In the project, open **Storage → Create → Blob**. Choose **private** access and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`. If you create a public store instead, also set `BLOB_ACCESS=public`.
3. In **Settings → Environment Variables**, add `ANTHROPIC_API_KEY`.
4. Recommended: add **Upstash Redis** from the Vercel Marketplace (Storage → Create → Upstash). Rate limits are then shared across all server instances. Without it, the limit is counted per instance only.
5. Redeploy.

Reviews usually take 2 to 4 minutes. `app/api/review/route.ts` sets `maxDuration = 300`, the Hobby-plan maximum. On Pro you can raise it if long papers time out.

## Environment variables

| Name | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Claude API key |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Critique model (highlights, ratings, TL;DR) |
| `ANTHROPIC_RESEARCH_MODEL` | `claude-sonnet-5-5` | Research, summary, context, glossary and quote repair |
| `ENABLE_WEB_SEARCH` | `true` | Literature search for the Scientific context section |
| `WEB_SEARCH_MAX_USES` | `4` | Most web searches per review, split between the background check and the context search |
| `CRITIQUE_FAST_MODE` | `false` | Opus fast mode for the critique (faster, twice the per-token price) |
| `BLOB_READ_WRITE_TOKEN` | (set by Vercel) | Vercel Blob storage |
| `BLOB_ACCESS` | `private` | Match your Blob store's access setting |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`) | (unset) | Shared rate limiting |
| `REVIEWS_PER_DAY` | `5` | New reviews per visitor per day (cached reviews don't count) |
| `MAX_PDF_MB` | `20` | Largest accepted PDF |
| `MAX_PAGES` | `60` | Most pages accepted |
| `CROSSREF_MAILTO` | (unset) | Your email, sent to Crossref so requests use its faster "polite" pool |

## Notes

- Each new review makes four or five Claude calls. Check `cost_usd` in a few saved reviews (or the server log) to see real costs, keep the daily limit low on a public site, and watch usage in the Anthropic Console. Update `lib/pricing.ts` if prices change.
- Uploaded papers are stored privately and served only through `/api/papers/{id}`. Anyone with a review link can open its paper.
- The PDF viewer renders only pages near the screen, so long papers stay responsive.

## Example paper

The example review at `/r/sample` uses Fishman LM. "Isometric Yoga-Like Maneuvers Improve Adolescent Idiopathic Scoliosis: A Nonrandomized Control Trial." *Global Advances in Health and Medicine* 2021;10:2164956120988259, [doi:10.1177/2164956120988259](https://doi.org/10.1177/2164956120988259). The PDF in `public/sample/` is redistributed unmodified under its [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) license. The review of it in `data/sample-review.json` was written for this project.

## License

Code: [MIT](LICENSE). The example paper keeps its own CC BY-NC 4.0 license (see above).
