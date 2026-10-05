// ============================================================
// LedgerAI — Ask v2 grounding validator (Phase 4)
// ------------------------------------------------------------
// Deterministic, conservative grounding for LLM narrations. Checks that
// every figure, category name, and period reference in the narration is
// present in the VERIFIED fact manifest, and that the narration covers
// every fact the answer requires. Mirrors the canonical v1 fact-coverage
// semantics (finance/renderer.factCoverageOk) so both surfaces agree that
// the LLM may rewrite wording but never the numbers.
//
// This is NOT a truth engine and it does not calculate anything: it is
// pure set-membership validation against the canonical manifest. Any
// failure means the caller must serve the deterministic renderer instead
// of LLM wording — an over-strict check degrades safely to a correct,
// verified answer.
// ============================================================

import type { NarrationManifest } from "@/lib/ask/contracts";

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
] as const;

/** Strip all non-digit characters ("₦379,050" -> "379050"). */
function numericDigits(s: string): string {
  return s.replace(/[^\d]/g, "");
}

/** Every numeric-looking token in a narration ("12%", "₦379,050", "1,000"). */
function numericTokens(text: string): string[] {
  return (text.match(/[\d,.]+/g) ?? []).filter((t) => numericDigits(t).length > 0);
}

/** Distinct normalized digit sequences in a string ("prior June 2026: ₦170,000"
 * yields ["2026", "170000"], NOT a concatenated blob). */
function digitSequences(s: string): string[] {
  return [...new Set(numericTokens(s).map((t) => numericDigits(t)))];
}

/** Lowercase alphanumeric-with-spaces phrase ("Spending on Software" -> "spending on software"). */
function phrase(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
}

/** All verified digit sequences in the manifest (every fact kind). */
function allowedDigits(manifest: NarrationManifest): Set<string> {
  const allowed = new Set<string>();
  for (const fact of manifest.facts) {
    for (const d of digitSequences(fact.display)) allowed.add(d);
  }
  return allowed;
}

/** Closed set of verified category-name phrases from the manifest. */
function allowedCategories(manifest: NarrationManifest): Set<string> {
  const set = new Set<string>();
  for (const fact of manifest.facts) {
    if (fact.kind !== "category") continue;
    // A display can hold comma-separated names ("Transport, Food").
    for (const part of fact.display.split(",")) {
      const p = phrase(part);
      if (p.length > 0) set.add(p);
    }
  }
  return set;
}

/** Verified period label phrases from the manifest (periods + relations that
 * carry prior-period labels like "compared to July 2026"). */
function allowedPeriods(manifest: NarrationManifest): Set<string> {
  const set = new Set<string>();
  for (const fact of manifest.facts) {
    if (fact.kind === "period" || fact.kind === "relation") {
      const p = phrase(fact.display);
      if (p.length > 0) set.add(p);
    }
  }
  return set;
}

/// Words the narration may freely use that are NOT category names. Kept
/// deliberately broad so prose passes while an invented category subject
/// ("we moved to Salestream") is rejected. Numbers and years are skipped
/// separately.
const PROSE_WORDS = new Set([
  // function words
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "without", "by", "from", "at", "as", "is", "was", "were", "are", "has", "have",
  "had", "be", "been", "this", "that", "these", "those", "your", "you", "all",
  "it", "its", "than", "then", "so", "if", "how", "what", "when", "which",
  "about", "into", "over", "under", "between", "out", "up", "down", "around",
  "not", "no", "yes", "either", "neither", "both", "any", "anything", "some",
  "something", "nothing", "everything", "each", "every", "either",
  // pronouns
  "they", "them", "their", "theirs", "themselves", "we", "us", "our", "ours",
  "ourselves", "he", "she", "him", "her", "hers", "his", "himself", "herself",
  "itself", "myself", "yourself", "yourselves", "who", "whom", "whose",
  "someone", "somebody", "everyone", "everybody", "anyone", "anybody", "nobody",
  // finance prose
  "spending", "spent", "spend", "spends", "income", "revenue", "expenses",
  "expense", "profit", "balance", "cash", "account", "accounts", "savings",
  "saved", "total", "totals", "totaled", "totalled", "net", "margin", "prior",
  "previous", "current", "period", "months", "month", "year", "years", "week",
  "weeks", "day", "days", "compared", "comparison", "versus", "increase",
  "decrease", "increased", "decreased", "rose", "fell", "drop", "rise", "grew",
  "growth", "went", "made", "additional", "less", "more", "much", "many",
  "little", "least", "most", "remainder", "rest", "there", "here", "now",
  "today", "last", "next", "first", "second", "after", "before", "during",
  "within", "back", "again", "also", "too", "very", "quite", "just", "only",
  "late", "early", "new", "old", "big", "small", "same", "still", "yet",
  "while", "rather", "nearly", "almost", "roughly", "exactly", "especially",
  "particularly", "among", "because", "although", "despite", "since", "until",
  "unless", "suppose", "even", "evenly", "amount", "amounts", "figure",
  "figures", "value", "values", "worth", "number", "count", "rate", "price",
  "prices", "cost", "costs", "costs", "charged", "charge", "charges", "paid",
  "pays", "pay", "payment", "payments", "bills", "billed", "invoice",
  "invoices", "fees", "spending", "spent", "less", "more", "compared",
  // descriptive narration words (non-category)
  "top", "biggest", "largest", "main", "leading", "major", "primary", "highest",
  "lowest", "smallest", "minor", "notable", "significant", "great", "strong",
  "healthy", "solid", "good", "better", "best", "worse", "worst", "steady",
  "stable", "typical", "usual", "overall", "around", "entire", "whole", "full",
  "minus", "plus", "come", "comes", "going", "looking", "took", "take", "makes",
  "make", "say", "equals", "equal", "sum", "sums", "together", "adding",
  "adds", "added", "doubled", "half", "double", "came", "come", "going",
  "looking", "reached", "reaching", "stood", "counted", "heading", "toward",
  // connective/comparison glue used by the deterministic narrative templates
  // and natural restatement (bounded, non-figurative — a category SUBJECT must
  // still be a verified manifest category)
  "vs", "versus", "broke", "categories",
  // Phase 15 — complement (category remainder) prose. These are connective
  // words the deterministic complement answer and its natural restatements may
  // use when discussing "the remaining / other categories". They extend the
  // prose vocabulary only; every FIGURE and every CATEGORY SUBJECT they refer
  // to must still be a verified manifest fact, so grounding is not weakened.
  "remaining", "other", "others", "apart", "listed", "shown", "fully",
  "covered", "already", "earlier",
  // Phase 17 — category-share prose. Connective words a share answer and its
  // natural restatement may use ("accounted for", "made up", "percent",
  // "recorded"). They extend the prose vocabulary only; the SHARE FIGURE and
  // the CATEGORY SUBJECT must still be verified manifest facts, so grounding
  // is not weakened.
  "accounted", "accounting", "recorded", "percent", "percentage",
  "percentages", "share", "shares", "portion", "proportion", "comprised",
  "constituted",
]);

// Bind months into prose words too so "may", "march", "august" aren't treated
// as invented categories.
for (const m of MONTH_NAMES) PROSE_WORDS.add(m);

/**
 * 1) Figure + required-fact coverage check (mirrors factCoverageOk): every
 *    required fact must be represented by its figure or phrase, and every
 *    number the narration cites must be attributable to a manifest fact.
 */
function figuresAndCoverageOk(
  narration: string,
  manifest: NarrationManifest,
  allowed: Set<string>,
): boolean {
  const tokens = numericTokens(narration);

  // 1a) Every required fact must be represented by its figure or phrase.
  for (const fact of manifest.facts) {
    if (!fact.required) continue;
    const digits = digitSequences(fact.display);
    if (digits.length > 0) {
      const cited = digits.every((d) => tokens.some((t) => numericDigits(t) === d));
      if (!cited) return false;
    } else {
      const p = phrase(fact.display);
      if (p.length > 0 && !phrase(narration).includes(p)) return false;
    }
  }

  // 1b) Every figure the narration cites must be attributable to a manifest fact.
  for (const token of tokens) {
    const d = numericDigits(token);
    if (d.length > 0 && !allowed.has(d)) return false;
  }

  return true;
}

/**
 * 2) Category check: any word the narration uses that is NOT a month, a
 *    number, or prose glue is treated as a category subject and must be a
 *    verified manifest category. This rejects invented category names while
 *    letting natural narration flow. Multi-word category facts contribute
 *    each word ("software", "subscriptions") to the allowed vocabulary.
 */
function categoriesOk(narration: string, allowed: Set<string>): boolean {
  // Expand the closed category set to every word of every allowed phrase.
  const verify = new Set<string>();
  for (const c of allowed) {
    for (const w of c.split(" ")) {
      if (w.length >= 2) verify.add(w);
    }
  }

  const lower = narration.toLowerCase();
  // Collapse money/year-like runs ("379050", "2026") so they aren't parsed as
  // category subjects.
  const cleaned = lower
    .replace(/[\d,.]+/g, " ")
    .replace(/[^a-z\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((w) => w.length >= 2 && !PROSE_WORDS.has(w));
  for (const token of tokens) {
    if (!verify.has(token)) return false;
  }
  return true;
}

/** Month and month-year tokens the narration cites, lowercased. */
function monthTokens(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  for (const month of MONTH_NAMES) {
    if (new RegExp(`\\b${month}\\b`).test(lower)) tokens.push(month);
  }
  const m = lower.match(/\b(20\d{2})\b/g) ?? [];
  for (const y of m) tokens.push(y);
  return [...new Set(tokens)];
}

/**
 * 3) Period check: any month / year the narration cites must be consistent
 *    with the manifest's verified period fact (e.g. "august 2026").
 */
function periodsOk(narration: string, allowed: Set<string>): boolean {
  const tokens = monthTokens(narration);
  for (const token of tokens) {
    let matched = false;
    for (const a of allowed) {
      // allowed is "august 2026", "all time", "2026" ... token "august" or "2026".
      if (a.includes(token) || token.includes(a)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

/**
 * The full grounding check. Returns `{ok: true}` when the narration is fully
 * supported by the verified manifest. On failure the caller must fall back to
 * the deterministic renderer — never serve ungrounded LLM wording.
 */
export function isNarrationGrounded(
  narration: string,
  manifest: NarrationManifest,
): { ok: true } | { ok: false; reason: string } {
  const text = narration ?? "";
  if (text.trim().length === 0) {
    return { ok: false, reason: "empty_narration" };
  }

  if (!figuresAndCoverageOk(text, manifest, allowedDigits(manifest))) {
    return { ok: false, reason: "unsupported_figure_or_coverage" };
  }

  if (!categoriesOk(text, allowedCategories(manifest))) {
    return { ok: false, reason: "unsupported_category" };
  }

  const periods = allowedPeriods(manifest);
  if (periods.size > 0 && !periodsOk(text, periods)) {
    return { ok: false, reason: "unsupported_period" };
  }

  return { ok: true };
}