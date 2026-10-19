import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageStream } from "@anthropic-ai/sdk/lib/MessageStream";
import { z } from "zod";
import { PROMPT_VERSION, config } from "./config";
import { checkPublicationStatus, statusNote, type PublicationStatus } from "./crossref";
import { findQuotePage, type PdfText } from "./pdf-text";
import { estimateCost } from "./pricing";
import {
  BACKGROUND_PROMPT,
  CONTEXT_PROMPT,
  CRITIQUE_PROMPT,
  FIX_QUOTES_TOOL,
  GLOSSARY_PROMPT,
  REPAIR_SYSTEM,
  SUBMIT_BACKGROUND_TOOL,
  SUBMIT_CONTEXT_TOOL,
  SUBMIT_CRITIQUE_TOOL,
  SUBMIT_GLOSSARY_TOOL,
  critiqueRequest,
  glossaryRequest,
  repairPrompt,
  researchRequest,
} from "./prompt";
import {
  DIMENSIONS,
  backgroundSchema,
  contextResearchSchema,
  critiqueSchema,
  glossarySchema,
  reviewSchema,
  toolSchema,
  type Background,
  type Barometer,
  type ContextResearch,
  type Critique,
  type ModelUsage,
  type ProgressEvent,
  type ReviewContent,
  type StoredReview,
} from "./schema";
import { RATING_IDS, RUBRIC_VERSION, capFor, effectLabel, levelLabel, rubric } from "./rubric";
import { safeUrl } from "./text";

type Emit = (event: ProgressEvent) => void;

const MAX_TURNS = 8;
const FAST_MODE_BETA = "fast-mode-2026-02-01";

/* ---------- usage accounting ---------- */

class UsageLedger {
  private byModel = new Map<string, Omit<ModelUsage, "cost_usd">>();

  add(model: string, usage: Anthropic.Messages.Usage) {
    const row = this.byModel.get(model) ?? {
      model,
      calls: 0,
      input_tokens: 0,
      cache_write_tokens: 0,
      cache_read_tokens: 0,
      output_tokens: 0,
      web_searches: 0,
    };
    row.calls += 1;
    row.input_tokens += usage.input_tokens ?? 0;
    row.cache_write_tokens += usage.cache_creation_input_tokens ?? 0;
    row.cache_read_tokens += usage.cache_read_input_tokens ?? 0;
    row.output_tokens += usage.output_tokens ?? 0;
    row.web_searches += usage.server_tool_use?.web_search_requests ?? 0;
    this.byModel.set(model, row);
  }

  summary(): { rows: ModelUsage[]; total: number | null } {
    const rows = [...this.byModel.values()].map((r) => ({ ...r, cost_usd: estimateCost(r) }));
    const total = rows.every((r) => r.cost_usd != null)
      ? Math.round(rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0) * 10000) / 10000
      : null;
    return { rows, total };
  }
}

/* ---------- API helpers ---------- */

function client() {
  if (!config.anthropicApiKey) throw new Error("The server is missing ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3 });
}

/**
 * The paper as a document block. `cache` marks it for prompt caching, which pays off when
 * the same model reads it more than once (web-search iterations, continuations, quote repair).
 */
function pdfBlock(bytes: Uint8Array, cache: boolean): Anthropic.Messages.DocumentBlockParam {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") },
    ...(cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  };
}

type CallOptions<S extends z.ZodType> = {
  api: Anthropic;
  ledger: UsageLedger;
  model: string;
  system: string;
  content: Anthropic.Messages.ContentBlockParam[];
  toolName: string;
  toolDescription: string;
  schema: S;
  /** Web searches allowed in this call; 0 or undefined means no web search tool. */
  searches?: number;
  maxTokens: number;
  emit?: Emit;
  /** Use fast mode (premium pricing) for faster output. */
  fast?: boolean;
  /** Called with the partially parsed tool input as it streams in. */
  onPartial?: (snapshot: unknown) => void;
  /** Give the model a sandboxed code execution tool (for recomputing statistics). */
  codeExecution?: boolean;
  /** Called each time the model runs code. */
  onCodeRun?: () => void;
};


/**
 * Runs one model until it calls the named tool with input that passes the schema.
 * Handles paused server-side tool loops, a model that stops without calling the tool,
 * and one round of fixing invalid tool input.
 *
 * tool_choice is always "auto": Claude Opus 5.5 and Sonnet 5.5 reject forced tool choice
 * ("tool" or "any"), so the prompts ask for the tool call and a follow-up turn asks again
 * if the model answers without it.
 */
async function callForTool<S extends z.ZodType>(opts: CallOptions<S>): Promise<z.infer<S>> {
  const { api, ledger, model, system, toolName, schema, emit, onPartial } = opts;
  const ledgerModel = opts.fast ? `${model}:fast` : model;
  const tools: Anthropic.Messages.ToolUnion[] = [
    { name: toolName, description: opts.toolDescription, input_schema: toolSchema(schema) as Anthropic.Messages.Tool.InputSchema },
  ];
  if (opts.searches) tools.unshift({ type: "web_search_20250305", name: "web_search", max_uses: opts.searches });
  if (opts.codeExecution) tools.unshift({ type: "code_execution_20250825", name: "code_execution" });

  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.content }];
  let fixAttempts = 0;
  let nudges = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const params: Anthropic.Messages.MessageStreamParams = {
      model,
      max_tokens: opts.maxTokens,
      system,
      tools,
      tool_choice: { type: "auto" },
      messages,
    };
    // Fast mode is a beta parameter; the beta stream has the same events and final message shape.
    const stream: MessageStream = opts.fast
      ? (api.beta.messages.stream({ ...params, speed: "fast", betas: [FAST_MODE_BETA] } as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) as unknown as MessageStream)
      : api.messages.stream(params);
    stream.on("contentBlock", (block) => {
      if (block.type !== "server_tool_use") return;
      if (block.name === "web_search" && emit) {
        const query = (block.input as { query?: unknown })?.query;
        if (typeof query === "string") emit({ type: "search", query });
      } else if (block.name !== "web_search") {
        // Code execution runs as bash_code_execution / text_editor_code_execution server tools.
        opts.onCodeRun?.();
      }
    });
    if (onPartial) stream.on("inputJson", (_delta, snapshot) => onPartial(snapshot));

    const message = await stream.finalMessage();
    ledger.add(ledgerModel, message.usage);

    if (message.stop_reason === "max_tokens") {
      throw new Error("The review was too long to finish. Try a shorter paper.");
    }

    const call = message.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === toolName);
    if (call) {
      const parsed = schema.safeParse(call.input);
      if (parsed.success) return parsed.data;
      if (fixAttempts >= 1) {
        const issue = parsed.error.issues[0];
        throw new Error(`The review came back in an unexpected format (${issue?.path.join(".") || "root"}: ${issue?.message}).`);
      }
      fixAttempts += 1;
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: `The input didn't match the schema: ${parsed.error.issues
              .slice(0, 5)
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}. Call ${toolName} again with corrected input.`,
          },
        ],
      });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue;

    // Stopped without calling the tool: close out any other tool calls, then ask again.
    if (nudges >= 2) break;
    nudges += 1;
    const followUp: Anthropic.Messages.ContentBlockParam[] = message.content
      .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ type: "tool_result", tool_use_id: b.id, content: `Not available. Call ${toolName}.`, is_error: true }));
    followUp.push({ type: "text", text: `Please call the ${toolName} tool now with your complete answer. Don't reply in plain text.` });
    messages.push({ role: "user", content: followUp });
  }
  throw new Error("The model didn't return a review.");
}

/* ---------- stages ---------- */

/** Splits the search budget: the background check gets the larger half. */
function searchBudget() {
  if (!config.webSearch) return { background: 0, context: 0 };
  const total = Math.max(1, config.webSearchMaxUses);
  const background = Math.max(1, Math.ceil(total / 2));
  return { background, context: Math.max(1, total - background) };
}

/** Stage 1a: a quick background check the critique needs before it starts. */
function background(api: Anthropic, ledger: UsageLedger, bytes: Uint8Array, emit: Emit): Promise<Background> {
  return callForTool({
    api,
    ledger,
    model: config.researchModel,
    system: BACKGROUND_PROMPT,
    content: [pdfBlock(bytes, true), { type: "text", text: researchRequest(config.webSearch, SUBMIT_BACKGROUND_TOOL) }],
    toolName: SUBMIT_BACKGROUND_TOOL,
    toolDescription: "Submit the paper details and background notes. Call exactly once, at the end.",
    schema: backgroundSchema,
    searches: searchBudget().background,
    maxTokens: 4000,
    emit,
  });
}

/** Stage 1b: summary and scientific context, written while the critique runs. */
function contextResearch(api: Anthropic, ledger: UsageLedger, bytes: Uint8Array, emit: Emit): Promise<ContextResearch> {
  return callForTool({
    api,
    ledger,
    model: config.researchModel,
    system: CONTEXT_PROMPT,
    content: [pdfBlock(bytes, true), { type: "text", text: researchRequest(config.webSearch, SUBMIT_CONTEXT_TOOL) }],
    toolName: SUBMIT_CONTEXT_TOOL,
    toolDescription: "Submit the summary and scientific context. Call exactly once, at the end.",
    schema: contextResearchSchema,
    searches: searchBudget().context,
    maxTokens: 10000,
    emit,
  });
}

function notesForCritique(b: Background, status: PublicationStatus): string {
  return [
    `Publication status: ${statusNote(status)}`,
    `Author interests: ${b.background.author_interests}`,
    `Journal: ${b.background.journal_standing}`,
    `Prior work and attempts to repeat the result: ${b.background.prior_work}`,
  ].join("\n\n");
}

/** Stage 2: the strongest model writes the critique, using the research notes. */
async function critique(
  api: Anthropic,
  ledger: UsageLedger,
  bytes: Uint8Array,
  notes: string,
  emit: Emit,
): Promise<{ result: Critique; codeRuns: number }> {
  let flagged = 0;
  let codeRuns = 0;
  const result = await callForTool({
    api,
    ledger,
    model: config.model,
    system: CRITIQUE_PROMPT,
    content: [pdfBlock(bytes, false), { type: "text", text: critiqueRequest(notes) }],
    toolName: SUBMIT_CRITIQUE_TOOL,
    toolDescription: "Submit the finished critique: classification, highlights, ratings and TL;DR. Call exactly once.",
    schema: critiqueSchema,
    maxTokens: 24000,
    fast: config.critiqueFastMode,
    codeExecution: true,
    onCodeRun: () => {
      codeRuns += 1;
      if (codeRuns === 1) emit({ type: "stage", stage: "writing", detail: "recomputing the paper's numbers" });
    },
    onPartial: (snapshot) => {
      // Report progress as highlights stream in (the last one may still be partial).
      const count = Math.max(0, ((snapshot as { highlights?: unknown[] })?.highlights?.length ?? 0) - 1);
      if (count > flagged) {
        flagged = count;
        emit({ type: "stage", stage: "writing", detail: `${count} passage${count === 1 ? "" : "s"} flagged so far` });
      }
    },
  });
  return { result, codeRuns };
}

/** Builds the four ratings from the model's scores and the rubric, enforcing the evidence cap. */
function buildRatings(judged: Critique, cap: number): Barometer[] {
  return RATING_IDS.map((id) => {
    const def = rubric.ratings[id];
    const given = judged.ratings.find((r) => r.id === id);
    if (!given) throw new Error(`The review is missing the "${def.label}" rating.`);
    const score = Math.round(given.score * 2) / 2;
    const bar: Barometer = {
      id,
      label: id === "effect" ? effectLabel(judged.classification.evidence_type) : def.label,
      score,
      max: 5,
      higher_is: def.higher_is,
      rating: given.rating,
      ends: [...def.ends],
      rationale: given.rationale,
    };
    if (id === "effect") {
      bar.cap = cap;
      if (score > cap) {
        bar.capped_from = score;
        bar.score = cap;
        bar.rating = levelLabel("effect", cap) ?? bar.rating;
      }
    }
    return bar;
  });
}

function reviewText(r: ReviewContent): string {
  return [
    r.tldr.findings.join(" "),
    r.tldr.implications,
    r.summary,
    ...r.barometers.map((b) => b.rationale),
    r.would_you_act,
    ...r.highlights.map((h) => `${h.title}. ${h.explanation}`),
    ...r.missing.map((m) => `${m.title}. ${m.explanation}`),
    r.context?.summary ?? "",
    ...(r.context?.comparisons ?? []).map((c) => `${c.kind}. ${c.finding}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Stage 3: research model writes definitions for terms used anywhere in the review. */
async function glossary(api: Anthropic, ledger: UsageLedger, review: ReviewContent) {
  try {
    const result = await callForTool({
      api,
      ledger,
      model: config.researchModel,
      system: GLOSSARY_PROMPT,
      content: [{ type: "text", text: glossaryRequest(reviewText(review)) }],
      toolName: SUBMIT_GLOSSARY_TOOL,
      toolDescription: "Submit glossary terms and plain definitions.",
      schema: glossarySchema,
      maxTokens: 3000,
    });
    review.glossary = result.glossary.filter((g) => g.term.trim() && g.definition.trim());
  } catch {
    // A missing glossary shouldn't sink the review.
    review.glossary = [];
  }
}

const fixQuotesSchema = z.object({
  fixes: z.array(z.object({ id: z.string(), quote: z.string(), page: z.number().int().min(1) })),
});

/** Checks each quote against the PDF text and asks the research model once to repair misses. */
async function verifyQuotes(api: Anthropic, ledger: UsageLedger, bytes: Uint8Array, review: ReviewContent, text: PdfText, emit: Emit) {
  const unmatched = review.highlights.filter((h) => {
    const page = findQuotePage(h.quote, text.pages, h.page);
    if (page) h.page = page;
    return !page;
  });
  if (!unmatched.length) return;
  if (text.textLength < 200) {
    unmatched.forEach((h) => (h.unverified = true));
    return;
  }

  emit({ type: "stage", stage: "checking", detail: `Re-checking ${unmatched.length} quote${unmatched.length === 1 ? "" : "s"}` });
  try {
    const result = await callForTool({
      api,
      ledger,
      model: config.researchModel,
      system: REPAIR_SYSTEM,
      content: [pdfBlock(bytes, true), { type: "text", text: repairPrompt(unmatched.map((h) => `${h.id} (page ${h.page}): "${h.quote}"`).join("\n")) }],
      toolName: FIX_QUOTES_TOOL,
      toolDescription: "Return corrected verbatim quotes.",
      schema: fixQuotesSchema,
      maxTokens: 4000,
    });
    for (const fix of result.fixes) {
      const h = unmatched.find((x) => x.id === fix.id);
      if (!h || !fix.quote.trim()) continue;
      const page = findQuotePage(fix.quote, text.pages, fix.page);
      if (page) {
        h.quote = fix.quote;
        h.page = page;
      }
    }
  } catch {
    // Repair is best-effort; unmatched quotes are flagged below.
  }
  for (const h of unmatched) {
    if (!findQuotePage(h.quote, text.pages, h.page)) h.unverified = true;
  }
}

function cleanLinks(review: ReviewContent) {
  if (review.context) {
    review.context.comparisons = review.context.comparisons.map((c) => ({ ...c, url: safeUrl(c.url) ?? "" }));
    review.context.further_reading = review.context.further_reading.filter((r) => safeUrl(r.url));
  }
  review.sources = review.sources.filter((s) => safeUrl(s.url));
  const seen = new Set<string>();
  review.highlights = review.highlights.map((h, i) => {
    let id = h.id.replace(/[^a-zA-Z0-9_-]/g, "-") || `h-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { ...h, id };
  });
}

/* ---------- pipeline ---------- */

export async function runReview(opts: {
  id: string;
  bytes: Uint8Array;
  text: PdfText;
  fileName?: string;
  emit: Emit;
}): Promise<StoredReview> {
  const { id, bytes, text, fileName, emit } = opts;
  const api = client();
  const ledger = new UsageLedger();

  emit({ type: "stage", stage: "searching" });
  // Publication status (retractions, corrections, preprints) is a free lookup; run it alongside.
  const statusFromPdf = text.doi ? checkPublicationStatus(text.doi) : null;
  const bg = await background(api, ledger, bytes, emit);
  const status = await (statusFromPdf ?? checkPublicationStatus(bg.paper.doi));
  if (status.status === "retracted") emit({ type: "warning", message: "This paper has been retracted. The review will say so." });

  // The critique and the context search run at the same time; only the critique needs the background notes.
  emit({ type: "stage", stage: "writing" });
  const contextP = contextResearch(api, ledger, bytes, emit).then((found) => {
    emit({ type: "preview", title: bg.paper.title, summary: found.summary });
    return found;
  });
  const [found, { result: judged, codeRuns }] = await Promise.all([
    contextP,
    critique(api, ledger, bytes, notesForCritique(bg, status), emit),
  ]);

  const cap = capFor(judged.classification.evidence_type, judged.classification.claim_type);
  // Only trust "computed with code" if the model actually ran code.
  if (codeRuns === 0) {
    for (const h of judged.highlights) if (h.check) h.check.computed_with_code = false;
  }
  const strengths = judged.highlights.filter((h) => h.verdict === "strength").length;
  if (strengths < rubric.min_strengths) {
    console.warn(`[review ${id}] only ${strengths} strength(s); the rubric asks for at least ${rubric.min_strengths}.`);
  }

  const parsed = reviewSchema.safeParse({
    paper: { ...bg.paper, doi: bg.paper.doi || status.doi, study_type: judged.study_type },
    tldr: judged.tldr,
    summary: found.summary,
    highlights: judged.highlights,
    missing: judged.missing,
    barometers: buildRatings(judged, cap),
    would_you_act: judged.would_you_act,
    context: found.context,
    glossary: [],
    sources: bg.sources,
    classification: { ...judged.classification, cap },
    publication_status: status,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`The review came back in an unexpected format (${issue?.path.join(".") || "root"}: ${issue?.message}).`);
  }
  const review = parsed.data;

  emit({ type: "stage", stage: "checking" });
  await Promise.all([glossary(api, ledger, review), verifyQuotes(api, ledger, bytes, review, text, emit)]);
  cleanLinks(review);

  const { rows, total } = ledger.summary();
  console.info(`[review ${id}] estimated cost ${total == null ? "unknown" : `$${total.toFixed(3)}`}`, JSON.stringify(rows));

  return {
    ...review,
    id,
    dimensions: DIMENSIONS,
    pdf_url: `/api/papers/${id}`,
    file_name: fileName,
    model: config.model,
    models: { research: config.researchModel, critique: config.critiqueFastMode ? `${config.model} (fast mode)` : config.model },
    usage: rows,
    cost_usd: total,
    created_at: new Date().toISOString(),
    page_count: text.pageCount,
    schema_version: `0.4+p${PROMPT_VERSION}`,
    rubric_version: RUBRIC_VERSION,
  };
}
