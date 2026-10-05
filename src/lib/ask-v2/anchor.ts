// ============================================================
// LedgerAI — Ask v2 verified turn anchor (Phase 9E)
// ------------------------------------------------------------
// A STRICT, server-only structured record of what a VERIFIED v2 turn
// established, persisted on the assistant message row it belongs to
// (`assistant_messages.metadata`). It replaces re-parsing the narrator's
// prose for future follow-up reference resolution.
//
// Invariants held here:
//   - every field is derived EXCLUSIVELY from trusted execution data: the
//     canonical `AssistantQuery`, the verified `AssistantMetrics`, the
//     allow-listed `toolKeys`, and the server clock. NEVER narrator prose,
//     user wording, or model-authored figures;
//   - the intent vocabulary is the existing canonical `AssistantIntent`
//     (reused from `assistantQuerySchema`) — no second vocabulary;
//   - `categorySet` contains ONLY verified engine category names
//     (`metrics.categoryTotals`), in the engine's canonical casing;
//   - no tenant-identifying or database-id fields are representable —
//     ownership lives on the owning assistant_message row;
//   - monetary totals are intentionally omitted (amount anchors are a
//     deferred phase).
//
// Helpers are PURE: building is a function of verified inputs; parsing
// safely ignores absent/invalid metadata so a bad row can never break a turn.
// ============================================================

import { z } from "zod";
import {
  assistantPeriodSchema,
  assistantQuerySchema,
} from "@/lib/ask/contracts";
import type {
  AssistantIntent,
  AssistantMetrics,
  AssistantQuery,
} from "@/lib/finance/assistant";
import { askV2ToolKeysSchema, type AskV2ToolKeys } from "./contracts";

export const ASK_V2_ANCHOR_SCHEMA_VERSION = 1 as const;

/**
 * Canonical verified intent vocabulary, REUSED from the trusted
 * `assistantQuerySchema` discriminated union so no second vocabulary can
 * drift from the engine's `AssistantIntent`.
 */
export const askV2AnchorIntentSchema = z.enum(
  assistantQuerySchema.options.map(
    (branch) => branch.shape.intent.value,
  ) as [AssistantIntent, ...AssistantIntent[]],
);
export type AskV2AnchorIntent = z.infer<typeof askV2AnchorIntentSchema>;

/**
 * Strict anchor contract. `.strict()` makes unknown keys (tenant fields,
 * narrator prose, arbitrary extras) a validation failure, so a malformed
 * object can never be treated as authoritative context.
 */
export const askV2AnchorSchema = z
  .object({
    schemaVersion: z.literal(ASK_V2_ANCHOR_SCHEMA_VERSION),
    /** "verified" = a trusted answer established this anchor. "clarification"
     * is reserved for a future clarification-state anchor; the current v2
     * pipeline does not persist clarification turns, so stored anchors are
     * always "verified". */
    kind: z.enum(["verified", "clarification"]),
    intent: askV2AnchorIntentSchema.nullable(),
    period: assistantPeriodSchema.nullable(),
    category: z.string().trim().min(1).max(80).nullable(),
    topCategory: z.string().trim().min(1).max(80).nullable(),
    categorySet: z.array(z.string().trim().min(1).max(80)).max(200),
    toolKeys: askV2ToolKeysSchema,
    verifiedAt: z.iso.datetime(),
  })
  .strict();
export type AskV2TurnAnchor = z.infer<typeof askV2AnchorSchema>;

/* ------------------------------------------------------------
 * Building (verified inputs only)
 * ------------------------------------------------------------ */

export interface BuildAskV2AnchorInput {
  /** Canonical trusted query that was executed. */
  query: AssistantQuery;
  /** Verified metrics produced by the deterministic engine. */
  metrics: AssistantMetrics;
  /** Allow-listed canonical tool keys that ran. */
  toolKeys: AskV2ToolKeys;
  /** Server clock at verification time. */
  verifiedAt: Date;
}

/**
 * Intents whose verified answer RANKS categories, so a verified top
 * category exists to record. Other intents answer with `topCategory: null`.
 */
const RANKING_INTENTS: ReadonlySet<AssistantIntent> = new Set([
  "topCategory",
  "spendingDistribution",
  "expenseBreakdown",
]);

/**
 * Build the anchor from verified execution data. Throws only if the inputs
 * are structurally malformed (a programmer error — the canonical query always
 * validates); it never reads narrator text.
 */
export function buildAskV2Anchor(
  input: BuildAskV2AnchorInput,
): AskV2TurnAnchor {
  const { query, metrics, toolKeys, verifiedAt } = input;

  const categorySet = [
    ...new Set(
      metrics.categoryTotals
        .map((c) => c.categoryName.trim())
        .filter((name) => name.length > 0 && name.length <= 80),
    ),
  ].slice(0, 200);

  const topCategory = RANKING_INTENTS.has(query.intent)
    ? (metrics.categoryTotals[0]?.categoryName.trim() ?? null)
    : null;

  return askV2AnchorSchema.parse({
    schemaVersion: ASK_V2_ANCHOR_SCHEMA_VERSION,
    kind: "verified",
    intent: query.intent,
    period: query.period,
    category: query.category ?? null,
    topCategory,
    categorySet,
    toolKeys,
    verifiedAt: verifiedAt.toISOString(),
  });
}

/* ------------------------------------------------------------
 * Reading (safe, never throws)
 * ------------------------------------------------------------ */

/**
 * Validate a raw persisted metadata value against the strict anchor schema.
 * Returns null for absent/legacy/invalid/foreign objects — a bad or unknown
 * row is IGNORED, never trusted and never fatal.
 */
export function parseAskV2Anchor(raw: unknown): AskV2TurnAnchor | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const parsed = askV2AnchorSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** An owned conversation exchange with its raw (unvalidated) metadata. */
export interface OwnedExchangeWithMetadata {
  answer: string | null;
  /** Raw persisted assistant-message metadata (null when absent). */
  metadata?: unknown;
}

/** The valid anchors carried by an owned, newest-first exchange window. */
export function anchorsFromExchanges(
  exchanges: ReadonlyArray<OwnedExchangeWithMetadata>,
): AskV2TurnAnchor[] {
  const anchors: AskV2TurnAnchor[] = [];
  for (const exchange of exchanges) {
    const anchor = parseAskV2Anchor(exchange.metadata);
    if (anchor) anchors.push(anchor);
  }
  return anchors;
}

/**
 * Union of the VERIFIED category names carried by the given anchors, in the
 * engine's canonical casing. Used only for trusted membership validation of a
 * model-claimed referenced category — never as a pronoun resolver.
 */
export function anchorCategorySet(
  anchors: ReadonlyArray<AskV2TurnAnchor>,
): ReadonlySet<string> {
  const set = new Set<string>();
  for (const anchor of anchors) {
    for (const name of anchor.categorySet) set.add(name);
  }
  return set;
}
