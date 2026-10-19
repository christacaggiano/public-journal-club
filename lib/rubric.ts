import { z } from "zod";
import raw from "@/config/rubric.json";

/**
 * Loads config/rubric.json and validates it, so a mistake in the rubric fails loudly at
 * startup instead of producing odd reviews. Everything that rates papers (the critique
 * prompt, the cap enforcement, the /methods page and docs/METHODS.md) reads from here.
 */

const RATING_IDS = ["rigor", "bias", "effect", "value"] as const;
export type RatingId = (typeof RATING_IDS)[number];

const anchorsSchema = z.partialRecord(z.enum(["0", "1", "2", "3", "4", "5"]), z.string());

const ratingSchema = z.object({
  label: z.string(),
  higher_is: z.enum(["better", "worse"]),
  ends: z.tuple([z.string(), z.string()]),
  definition: z.string(),
  tools: z.array(z.string()),
  anchors: anchorsSchema,
  /** Short words for each whole-number level, used when the server changes a score (for example to apply a cap). */
  level_labels: anchorsSchema.optional(),
});

const rubricSchema = z.object({
  version: z.string().min(1),
  notes: z.string().optional(),
  min_strengths: z.number().int().min(0),
  claim_types: z.array(z.object({ id: z.string(), label: z.string(), description: z.string() })).min(1),
  populations: z.array(z.object({ id: z.string(), label: z.string() })).min(1),
  evidence_types: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        badge: z.string(),
        examples: z.string(),
        tools: z.array(z.string()),
        checklist: z.array(z.string()).min(1),
        caps: z.record(z.string(), z.number().min(0).max(5)),
        cap_note: z.string().optional(),
        effect_label: z.string().optional(),
      }),
    )
    .min(1),
  ratings: z.object({ rigor: ratingSchema, bias: ratingSchema, effect: ratingSchema, value: ratingSchema }),
  citations: z.record(z.string(), z.object({ short: z.string(), full: z.string(), url: z.string().url() })),
});

export type RatingDef = {
  label: string;
  higher_is: "better" | "worse";
  ends: [string, string];
  definition: string;
  tools: string[];
  anchors: Partial<Record<"0" | "1" | "2" | "3" | "4" | "5", string>>;
};

export type Rubric = z.infer<typeof rubricSchema>;
export type EvidenceType = Rubric["evidence_types"][number];

function load(): Rubric {
  const parsed = rubricSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`config/rubric.json is invalid at ${issue?.path.join(".")}: ${issue?.message}`);
  }
  const r = parsed.data;
  const claimIds = new Set(r.claim_types.map((c) => c.id));
  for (const t of r.evidence_types) {
    for (const c of claimIds) {
      if (typeof t.caps[c] !== "number") throw new Error(`config/rubric.json: evidence type "${t.id}" has no cap for claim type "${c}".`);
    }
    for (const tool of t.tools) {
      if (!r.citations[tool]) throw new Error(`config/rubric.json: evidence type "${t.id}" cites unknown tool "${tool}".`);
    }
  }
  for (const id of RATING_IDS) {
    for (const tool of r.ratings[id].tools) {
      if (!r.citations[tool]) throw new Error(`config/rubric.json: rating "${id}" cites unknown tool "${tool}".`);
    }
  }
  return r;
}

export const rubric: Rubric = load();
export const RUBRIC_VERSION = rubric.version;

export const EVIDENCE_TYPE_IDS = rubric.evidence_types.map((t) => t.id) as [string, ...string[]];
export const CLAIM_TYPE_IDS = rubric.claim_types.map((c) => c.id) as [string, ...string[]];
export const POPULATION_IDS = rubric.populations.map((p) => p.id) as [string, ...string[]];
export { RATING_IDS };

export function evidenceType(id: string | undefined): EvidenceType | undefined {
  return rubric.evidence_types.find((t) => t.id === id);
}

export function claimTypeLabel(id: string | undefined): string | undefined {
  return rubric.claim_types.find((c) => c.id === id)?.label;
}

export function populationLabel(id: string | undefined): string | undefined {
  return rubric.populations.find((p) => p.id === id)?.label;
}

/** Highest score "evidence for the main claim" can get for this design and type of claim. */
export function capFor(evidenceTypeId: string, claimTypeId: string): number {
  const t = evidenceType(evidenceTypeId) ?? evidenceType("other");
  return t?.caps[claimTypeId] ?? 5;
}

/** Short word for a score, from the rating's level labels (rounded down to a whole level). */
export function levelLabel(ratingId: RatingId, score: number): string | undefined {
  const key = String(Math.max(0, Math.min(5, Math.floor(score)))) as "0" | "1" | "2" | "3" | "4" | "5";
  return rubric.ratings[ratingId].level_labels?.[key];
}

/** Label for the effect rating, which some evidence types rename (for example reviews). */
export function effectLabel(evidenceTypeId: string | undefined): string {
  return evidenceType(evidenceTypeId)?.effect_label ?? rubric.ratings.effect.label;
}

function anchorsText(anchors: RatingDef["anchors"]): string {
  return (["5", "4", "3", "2", "1", "0"] as const)
    .filter((k) => anchors[k])
    .map((k) => `    ${k}: ${anchors[k]}`)
    .join("\n");
}

/** The rubric as instructions for the critique model. */
export function rubricPrompt(): string {
  const claims = rubric.claim_types.map((c) => `- ${c.id}: ${c.label}. ${c.description}`).join("\n");
  const populations = rubric.populations.map((p) => p.id).join(", ");
  const types = rubric.evidence_types
    .map((t) => {
      const caps = rubric.claim_types.map((c) => `${c.id} ${t.caps[c.id]}`).join(", ");
      const tools = t.tools.map((id) => rubric.citations[id].short).join(", ");
      return [
        `- ${t.id}: ${t.label}. ${t.examples}`,
        `  Checklist (based on ${tools}):`,
        ...t.checklist.map((q) => `    * ${q}`),
        `  Caps on "evidence for the main claim" by claim type: ${caps}.`,
        t.cap_note ? `  ${t.cap_note}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
  const ratings = RATING_IDS.map((id) => {
    const r = rubric.ratings[id];
    return `- ${id} ("${r.label}", higher is ${r.higher_is}): ${r.definition}\n  Anchors:\n${anchorsText(r.anchors)}`;
  }).join("\n");

  return `RATING RUBRIC (version ${rubric.version})

Step 1. Classify the paper.
- evidence_type: the design, one of the ids below.
- main_claim: the paper's central claim, in one plain sentence, as the authors make it.
- claim_type: the kind of claim, one of:
${claims}
- population: who or what was studied, one of: ${populations}.
- overreach: true if the main claim goes beyond what this design can support (for example a causal claim from an observational design, or a human-treatment claim from an animal study), with a one-sentence overreach_note.

Evidence types, with the checklist to apply and the caps:
${types}

Step 2. Score the four ratings from 0 to 5 in steps of 0.5, using these definitions and anchors.
${ratings}

Rules:
- Score study quality against the best version of the paper's own design, using its checklist.
- "Evidence for the main claim" can never exceed the cap for the paper's evidence type and claim type. Start from the cap and lower it for flaws, imprecision, or conflict with other research.
- Include at least ${rubric.min_strengths} genuine strengths among the highlights (verdict "strength"). Fewer only if the paper truly has none, and say so.
- In each rating's rationale, refer to the checklist items that drove the score, in plain words.`;
}
