import { z } from "zod";
import { CLAIM_TYPE_IDS, EVIDENCE_TYPE_IDS, POPULATION_IDS } from "./rubric";

export const DIMENSIONS = [
  { id: "journal", label: "Where it was published", question: "Does the size of the claim match the journal it appeared in?" },
  { id: "coi", label: "Conflicts of interest", question: "Could the authors benefit from a particular result?" },
  { id: "sample", label: "Who was studied", question: "How many people were studied, and were they chosen well?" },
  { id: "design", label: "How the study was set up", question: "Was the study set up to answer its question fairly?" },
  { id: "stats", label: "The math", question: "Were the numbers analysed correctly?" },
  { id: "figures", label: "Do the results back the claims?", question: "Do the tables and numbers support what the authors say?" },
  { id: "value", label: "Should it change what you do?", question: "Would you make a health decision based on this paper?" },
] as const;

export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id) as [string, ...string[]];

const dimensionId = z.enum(DIMENSION_IDS as [(typeof DIMENSIONS)[number]["id"], ...(typeof DIMENSIONS)[number]["id"][]]);

export const highlightSchema = z.object({
  id: z.string().min(1).describe("Short unique slug, e.g. h-attrition"),
  dimension: dimensionId,
  verdict: z.enum(["concern", "caution", "strength", "missing"]).describe("Use 'missing' when the passage promises something the paper never delivers"),
  page: z.number().int().min(1).describe("1-based PDF page number"),
  quote: z.string().min(1).describe("Copied VERBATIM from the PDF: 6-30 words, one contiguous passage, no ellipses"),
  title: z.string().describe("The takeaway in plain words, under 12 words"),
  explanation: z.string().describe("60-140 words, plain language"),
  check: z
    .object({
      reported: z.string().describe("What the paper reports, quoted or paraphrased exactly (for example 't = 3.3, df = 21, p = .022')"),
      inputs: z.string().describe("The numbers from the paper used to check it, with where they come from"),
      method: z.string().describe("How it was checked, in plain words (for example 'two-sided p-value from t = 3.3 with 21 degrees of freedom')"),
      recomputed: z.string().describe("The result of the check"),
      computed_with_code: z.boolean().describe("True only if you ran code to get this result in this response"),
    })
    .optional()
    .describe("Required whenever the note says a reported number is wrong, inconsistent or doesn't reproduce"),
  unverified: z.boolean().optional().describe("Set by the server when the quote could not be found in the PDF text"),
});

export type NumberCheck = NonNullable<z.infer<typeof highlightSchema>["check"]>;

export const barometerSchema = z.object({
  id: z.enum(["rigor", "bias", "effect", "value"]),
  label: z.string(),
  score: z.number().min(0).max(5).describe("0 to 5 in steps of 0.5"),
  max: z.number().default(5),
  higher_is: z.enum(["better", "worse"]),
  rating: z.string().describe("One to three words"),
  ends: z.array(z.string()).length(2).optional().describe("Labels for the low and high ends of the scale"),
  rationale: z.string(),
  /** Set by the server from the rubric for "evidence for the main claim". */
  cap: z.number().optional(),
  /** The model's score before the server applied the cap, when it was higher. */
  capped_from: z.number().optional(),
});

/** What the critique model returns for each rating; labels and scales come from the rubric. */
const modelRatingSchema = z.object({
  id: z.enum(["rigor", "bias", "effect", "value"]),
  score: z.number().min(0).max(5).describe("0 to 5 in steps of 0.5, using the rubric anchors"),
  rating: z.string().describe("One to three plain words, e.g. 'Low', 'High', 'Worth testing further'"),
  rationale: z.string().describe("Plain-language reason, naming the checklist items that drove the score"),
});

export const classificationSchema = z.object({
  evidence_type: z.enum(EVIDENCE_TYPE_IDS),
  claim_type: z.enum(CLAIM_TYPE_IDS),
  population: z.enum(POPULATION_IDS),
  main_claim: z.string().describe("The paper's central claim in one plain sentence, as the authors make it"),
  overreach: z.boolean().describe("True if the main claim goes beyond what this design can support"),
  overreach_note: z.string().describe("One sentence explaining the overreach, or an empty string"),
  /** Set by the server from the rubric. */
  cap: z.number().optional(),
});

export type Classification = z.infer<typeof classificationSchema>;

export const comparisonSchema = z.object({
  relation: z.enum(["agrees", "disagrees", "partly", "context"]),
  kind: z.string().describe("Plain description of the study type, e.g. 'Randomized trial'"),
  title: z.string(),
  finding: z.string().describe("1-3 sentences"),
  citation: z.string().describe("Author et al., Journal, Year"),
  url: z.string().describe("Working DOI, PubMed or PMC link"),
});

const contextSchema = z.object({
  fit: z.string().describe("2-4 words, e.g. 'Mostly out of step'"),
  summary: z.string(),
  comparisons: z.array(comparisonSchema).default([]),
  further_reading: z.array(z.object({ title: z.string(), why: z.string(), url: z.string() })).default([]),
});

const glossaryEntry = z.object({ term: z.string(), definition: z.string() });
const sourceSchema = z.object({ title: z.string(), url: z.string() });
const missingSchema = z.object({ dimension: dimensionId, title: z.string(), explanation: z.string() });

/* ---------- the three model stages ---------- */

const paperSchema = z.object({
  title: z.string(),
  authors: z.string(),
  journal: z.string(),
  year: z.number().int().optional(),
  doi: z.string().optional(),
});

/** Stage 1a (research model, quick web search): facts the critique needs before it starts. */
export const backgroundSchema = z.object({
  paper: paperSchema,
  background: z.object({
    author_interests: z
      .string()
      .describe("What you found about the authors' financial or professional stakes in the result (products, books, courses, companies, patents, funding), with where you found it. Say plainly if you found nothing."),
    journal_standing: z
      .string()
      .describe("The journal's field, publisher, reach (for example impact factor, with a point of comparison) and anything notable about it"),
    prior_work: z.string().describe("Earlier work by the same authors on this question, and any attempts by others to repeat the result"),
  }),
  sources: z.array(sourceSchema).default([]).describe("Pages you used for these notes"),
});

/** Stage 1b (research model, web search, runs alongside the critique): summary and scientific context. */
export const contextResearchSchema = z.object({
  summary: z.string().describe("One paragraph, 120-200 words: the topic and what the study did, with no judgement of quality"),
  context: contextSchema,
});

/** Stage 2 (critique model, no web search): the judgement. */
export const critiqueSchema = z.object({
  study_type: z.string().describe("One plain-language line describing the design, e.g. 'Patients chose their own group'"),
  tldr: z.object({
    findings: z.array(z.string()).min(1).max(4),
    implications: z.string(),
  }),
  classification: classificationSchema.omit({ cap: true }),
  highlights: z.array(highlightSchema.omit({ unverified: true })).min(1),
  missing: z.array(missingSchema).default([]),
  ratings: z
    .array(modelRatingSchema)
    .length(4)
    .refine((list) => new Set(list.map((r) => r.id)).size === 4, "Include each of rigor, bias, effect and value exactly once")
    .describe("One entry each for rigor, bias, effect and value"),
  would_you_act: z.string(),
});

/** Stage 3 (research model): definitions for terms used anywhere in the review. */
export const glossarySchema = z.object({
  glossary: z.array(glossaryEntry),
});

/* ---------- the stored review ---------- */

export const reviewSchema = z.object({
  paper: z.object({
    title: z.string(),
    authors: z.string(),
    journal: z.string(),
    year: z.number().int().optional(),
    doi: z.string().optional(),
    study_type: z.string().describe("One plain-language line describing the design"),
  }),
  tldr: z.object({
    findings: z.array(z.string()).min(1).max(4),
    implications: z.string(),
  }),
  summary: z.string(),
  highlights: z.array(highlightSchema).min(1),
  missing: z.array(missingSchema).default([]),
  barometers: z.array(barometerSchema).min(1),
  would_you_act: z.string(),
  context: contextSchema.optional(),
  glossary: z.array(glossaryEntry).default([]),
  sources: z.array(sourceSchema).default([]),
  classification: classificationSchema.optional(),
  publication_status: z
    .object({
      status: z.enum(["peer_reviewed", "preprint", "retracted", "concern", "corrected", "unknown"]),
      doi: z.string().optional(),
      notices: z
        .array(z.object({ type: z.string(), label: z.string(), date: z.string().optional(), doi: z.string().optional(), source: z.string().optional() }))
        .default([]),
      checked_at: z.string(),
      source: z.enum(["crossref", "none"]),
    })
    .optional(),
});

export type Highlight = z.infer<typeof highlightSchema>;
export type Barometer = z.infer<typeof barometerSchema>;
export type ReviewContent = z.infer<typeof reviewSchema>;
export type Background = z.infer<typeof backgroundSchema>;
export type ContextResearch = z.infer<typeof contextResearchSchema>;
export type Critique = z.infer<typeof critiqueSchema>;

/** Token use and estimated cost for one model across a review. */
export type ModelUsage = {
  model: string;
  calls: number;
  input_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  web_searches: number;
  cost_usd: number | null;
};

/** What gets stored and rendered: the models' output plus server-added metadata. */
export type StoredReview = ReviewContent & {
  id: string;
  dimensions: typeof DIMENSIONS | { id: string; label: string; question: string }[];
  pdf_url: string;
  file_name?: string;
  model?: string;
  models?: { research: string; critique: string };
  usage?: ModelUsage[];
  cost_usd?: number | null;
  created_at?: string;
  page_count?: number;
  schema_version?: string;
  rubric_version?: string;
};

/** JSON schema for a tool's input, generated from a zod schema. */
export function toolSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Events streamed from /api/review to the browser as newline-delimited JSON. */
export type ProgressEvent =
  | { type: "id"; id: string }
  | { type: "stage"; stage: "reading" | "searching" | "writing" | "checking" | "saving"; detail?: string }
  | { type: "search"; query: string }
  | { type: "preview"; title: string; summary: string }
  | { type: "warning"; message: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
