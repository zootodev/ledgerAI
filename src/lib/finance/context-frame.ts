// ============================================================
// LedgerAI — Financial context frame layer (Ask LedgerAI)
// ------------------------------------------------------------
// A "context frame" is a deterministic, structured re-reading of one OWNED
// persisted (question, answer) exchange in a conversation. The follow-up
// resolver reasons over frames about what the conversation previously
// established — which intent ran, over which period, against which verified
// figures — WITHOUT an LLM, without trusting arbitrary user text, and without
// any schema change: every field is re-derived from the recorded question and
// from OUR OWN canonical narration templates (answerFromMetrics), never from
// anything invented.
//
// Derivation rules (all pure; no I/O, clock only via the injected `now`):
//   - classification + query: deterministic classifyAssistantQuestion
//   - reported figures:       readNarration parses our own narration
//   - period:                 query.period  ->  narration label  ->
//                             explicit period in the question  ->
//                             savings default ("this month").
//
// Resolution ranks candidates across frames (newest-first) by evidence
// quality: explicit exact (a figure the user cited matching our own) >
// semantic relationship (register-only references to a narrated spending
// total) > continuity (period / hypothetical inheritance).
// ============================================================

import {
  classifyAssistantQuestion,
  toAssistantPeriod,
  resolvePeriod,
  priorPeriodLabel,
  SAVINGS_CLARIFICATION_ANSWER,
  type AssistantIntent,
  type AssistantQuery,
  type ClarificationReason,
  type ResolvedPeriod,
} from "@/lib/finance/assistant";
import {
  detectCategory,
  parsePeriod,
  type FollowUpAnalysis,
  type HypotheticalGoal,
} from "@/lib/ask/understanding";

/* ------------------------------------------------------------
 * Frame model
 * ------------------------------------------------------------ */

export type ReportedMetric =
  | "expenses"
  | "income"
  | "profit"
  | "balance"
  | "category";

/**
 * The financial figures a previous exchange's narration CITED, recovered only
 * from our own deterministic narration templates. `metric` is the category of
 * figure the narration reported ("category" for category-scoped answers),
 * `total` the narrated money figure (null when the narration cited none),
 * `periodLabel` the narrated period label, `categoryName` a single cited
 * category, and `categories` any listed set of category names.
 */
export interface ReportedFigures {
  metric: ReportedMetric | null;
  total: number | null;
  periodLabel: string | null;
  categoryName: string | null;
  categories: string[];
}

const NO_REPORT: ReportedFigures = {
  metric: null,
  total: null,
  periodLabel: null,
  categoryName: null,
  categories: [],
};

/**
 * One derived re-reading of an owned exchange. Frames are recomputed on every
 * follow-up from the persisted text — they carry no DB identity of their own.
 * `exchangeIndex` orders the conversation's exchanges (0 = the newest turn).
 */
export interface FinancialContextFrame {
  conversationId: string;
  businessId: string;
  createdAt: string;
  exchangeIndex: number;
  question: string;
  answer: string | null;
  classification: "answer" | "clarification" | "unsupported";
  clarificationReason: ClarificationReason | null;
  query: AssistantQuery | null;
  period: AssistantQuery["period"] | null;
  resolved: ResolvedPeriod | null;
  reported: ReportedFigures;
}

export interface BuildContextFrameInput {
  conversationId: string;
  businessId: string;
  question: string;
  answer: string | null;
  createdAt: string;
  exchangeIndex: number;
  now: Date;
}

/* ------------------------------------------------------------
 * Narration readers (our own templates only)
 * ------------------------------------------------------------ */

/** "en-NG" money figures use commas as thousands separators. */
function toNumber(cited: string): number {
  return Number(cited.replace(/,/g, ""));
}

/** "rent" -> "Rent" (title-cased like the finance narration layer). */
function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function readBalance(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/cash balance across all accounts is ₦([\d,]+)/i);
  return m ? { metric: "balance", total: toNumber(m[1]) } : null;
}

function readIncome(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/income in ([^()]+?) was ₦([\d,]+)/i);
  return m
    ? { metric: "income", total: toNumber(m[2]), periodLabel: m[1].trim() }
    : null;
}

function readExpenses(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/spending in ([^()]+?) was ₦([\d,]+)/i);
  return m
    ? { metric: "expenses", total: toNumber(m[2]), periodLabel: m[1].trim() }
    : null;
}

function readProfit(text: string): Partial<ReportedFigures> | null {
  const gained = text.match(/net profit in ([^()]+?) was ₦([\d,]+)/i);
  if (gained) {
    return {
      metric: "profit",
      total: toNumber(gained[2]),
      periodLabel: gained[1].trim(),
    };
  }
  const loss = text.match(/ran at a loss of ₦([\d,]+) in ([^()]+?)\s*\(/i);
  if (loss) {
    return {
      metric: "profit",
      total: -toNumber(loss[1]),
      periodLabel: loss[2].trim(),
    };
  }
  return null;
}

function readProfitMargin(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/profit margin in ([^()]+?) was .+? — ₦([\d,]+) profit on/i);
  return m
    ? { metric: "profit", total: toNumber(m[2]), periodLabel: m[1].trim() }
    : null;
}

function readTopCategory(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/top expense category in ([^()]+?) was ([^—–]+?) at ₦([\d,]+)/i);
  if (!m) return null;
  return {
    metric: "category",
    total: toNumber(m[3]),
    periodLabel: m[1].trim(),
    categoryName: cap(m[2].trim()),
  };
}

/** "fuel and maintenance, at ₦5,000 each, July 2026" -> names + label. */
function splitNames(listing: string): string[] {
  return listing
    .split(/,|\band\b/)
    .map((n) => n.trim())
    .filter(Boolean);
}

function readLowestCategory(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/spent the least on ([^,]+), at ₦([\d,]+)(?: each)?,?\s*([^()]*?)\.?$/i);
  if (!m) return null;
  const names = splitNames(m[1]);
  return {
    metric: "category",
    total: toNumber(m[2]),
    periodLabel: m[3]?.trim() || null,
    categoryName: names.length === 1 ? cap(names[0]) : null,
    categories: names,
  };
}

function readCategorySpend(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/spending on ([a-z][a-z0-9 ]*?) in ([^()]+?) was ₦([\d,]+)/i);
  if (!m) return null;
  return {
    metric: "category",
    total: toNumber(m[3]),
    periodLabel: m[2].trim(),
    categoryName: cap(m[1].trim()),
  };
}

function readBreakdown(text: string): Partial<ReportedFigures> | null {
  const byTitle = text.match(/of the ₦([\d,]+) you asked about in ([^,.]+)/i);
  if (byTitle) {
    return {
      metric: "expenses",
      total: toNumber(byTitle[1]),
      periodLabel: byTitle[2].trim(),
    };
  }
  const yours = text.match(/of your ₦([\d,]+) spending in ([^,.]+)/i);
  if (yours) {
    return {
      metric: "expenses",
      total: toNumber(yours[1]),
      periodLabel: yours[2].trim(),
    };
  }
  return null;
}

function readSpendingDistribution(text: string): Partial<ReportedFigures> | null {
  const label = text.match(/in ([^()]+?) your spending broke down as/i)?.[1];
  if (!label) return null;
  const names = [...text.matchAll(/([a-z][a-z0-9 ]*?)\s*\(\d[\d,.]*%\)/gi)].map((m) =>
    m[1].trim(),
  );
  const total = text.match(/rest of the ₦([\d,]+) total/i)?.[1];
  return {
    metric: "expenses",
    total: total ? toNumber(total) : null,
    periodLabel: label.trim(),
    categories: names,
  };
}

function readIncomeVsExpenses(text: string): Partial<ReportedFigures> | null {
  const m = text.match(/in ([^()]+?) you brought in ₦([\d,]+) and spent ₦([\d,]+), leaving ₦([\d,]+) profit/i);
  if (!m) return null;
  return {
    metric: "profit",
    total: toNumber(m[4]),
    periodLabel: m[1].trim(),
  };
}

const NARRATION_READERS: Record<
  string,
  (text: string) => Partial<ReportedFigures> | null
> = {
  balance: readBalance,
  income: readIncome,
  expenses: readExpenses,
  profit: readProfit,
  profitMargin: readProfitMargin,
  topCategory: readTopCategory,
  lowestCategory: readLowestCategory,
  categorySpend: readCategorySpend,
  spendingDistribution: readSpendingDistribution,
  incomeVsExpenses: readIncomeVsExpenses,
  expenseBreakdown: readBreakdown,
};

/**
 * Fail-safe for frames that were classified as clarifications but whose
 * narration does carry a spending total (e.g. an expense breakdown that was
 * stored as an ambiguous_amount clarification). Breakdown templates first,
 * then the plain expense template.
 */
function readGeneric(text: string): Partial<ReportedFigures> | null {
  return readBreakdown(text) ?? readExpenses(text) ?? null;
}

/**
 * Recover the financial figures our own deterministic narration cited from an
 * exchange's answer text. `intent` scopes parsing to the matching template;
 * the generic fallback is used when the frame carries no query (null intent).
 */
export function readNarration(
  answerText: string | null,
  intent: AssistantIntent | null,
): ReportedFigures {
  if (!answerText) return NO_REPORT;
  const reader = intent ? NARRATION_READERS[intent] : readGeneric;
  const found = reader ? reader(answerText) : null;
  if (!found) return NO_REPORT;
  return {
    metric: found.metric ?? null,
    total: found.total ?? null,
    periodLabel: found.periodLabel ?? null,
    categoryName: found.categoryName ?? null,
    categories: found.categories ?? [],
  };
}

/* ------------------------------------------------------------
 * Period mapping helpers
 * ------------------------------------------------------------ */

const MONTH_LABEL_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Map a period label from our own narration ("August 2026", "2026",
 * "all time", "last 30 days") onto an engine period. Returns null when
 * unknown.
 */
export function periodFromNarrationLabel(
  label: string | null,
): AssistantQuery["period"] | null {
  if (!label) return null;
  const s = label.toLowerCase().trim();
  if (s === "all time") return { kind: "allTime" };
  const days = s.match(/^last\s+(\d+)\s+days$/);
  if (days) return { kind: "recent", days: Number(days[1]) };
  const month = s.match(/^([a-z]+)\s+(\d{4})$/);
  if (month && MONTH_LABEL_MAP[month[1]] !== undefined) {
    return { kind: "month", month: MONTH_LABEL_MAP[month[1]], year: Number(month[2]) };
  }
  const year = s.match(/^\d{4}$/);
  if (year) {
    return {
      kind: "custom",
      from: `${year[0]}-01-01`,
      to: `${year[0]}-12-31`,
      label: year[0],
    };
  }
  return null;
}

/**
 * The period an "ambiguous savings" clarification implies, replicating the
 * original service-layer hint: only explicit this/last month or year phrases;
 * otherwise the savings reading defaults to "this month".
 */
function savingsPeriodHint(text: string): AssistantQuery["period"] {
  const prepared = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\blast month\b/.test(prepared)) return { kind: "lastMonth" };
  if (/\bthis month\b/.test(prepared)) return { kind: "thisMonth" };
  if (/\bthis year\b/.test(prepared)) return { kind: "thisYear" };
  if (/\blast year\b/.test(prepared)) return { kind: "lastYear" };
  return { kind: "thisMonth" };
}

/** Any explicit period named in the question itself. */
function periodFromQuestion(question: string, now: Date): AssistantQuery["period"] | null {
  const parsed = parsePeriod(question, now);
  return parsed ? toAssistantPeriod(parsed) : null;
}

/* ------------------------------------------------------------
 * Frame derivation
 * ------------------------------------------------------------ */

export function buildContextFrame(input: BuildContextFrameInput): FinancialContextFrame {
  const classification = classifyAssistantQuestion(input.question, input.now);
  const query = classification.kind === "query" ? classification.query : null;
  const clarificationReason =
    classification.kind === "clarification" ? classification.reason : null;

  const reported = readNarration(input.answer, query?.intent ?? null);

  const period =
    query?.period ??
    periodFromNarrationLabel(reported.periodLabel) ??
    (clarificationReason === "ambiguous_savings"
      ? savingsPeriodHint(input.question)
      : periodFromQuestion(input.question, input.now)) ??
    null;

  return {
    conversationId: input.conversationId,
    businessId: input.businessId,
    createdAt: input.createdAt,
    exchangeIndex: input.exchangeIndex,
    question: input.question,
    answer: input.answer,
    classification: classification.kind === "query" ? "answer" : classification.kind,
    clarificationReason,
    query,
    period,
    resolved: period ? resolvePeriod(period, input.now) : null,
    reported,
  };
}

/* ------------------------------------------------------------
 * Resolution
 * ------------------------------------------------------------ */

/** Which financial metric an intent is primarily about (for goal fallback). */
export function goalOfIntent(query: AssistantQuery): HypotheticalGoal | null {
  switch (query.intent) {
    case "profit":
    case "profitMargin":
    case "incomeVsExpenses":
    case "expenseImpact":
      return "profit";
    case "expenses":
    case "categorySpend":
    case "spendingDistribution":
    case "topCategory":
    case "lowestCategory":
      return "expenses";
    case "income":
      return "income";
    case "balance":
      return "balance";
    default:
      return null;
  }
}

/** Shift an inclusive [from, to] range one full span back (prior period). */
export function shiftRangeBack(from: string, to: string): [string, string] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const lengthMs = Math.max(end.getTime() - start.getTime(), 0);
  const priorEnd = new Date(start.getTime() - 1);
  const priorStart = new Date(priorEnd.getTime() - lengthMs);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [iso(priorStart), iso(priorEnd)];
}

/**
 * Why a follow-up was resolved against a particular frame. Frames are already
 * newest-first, so a first match also implies recency.
 */
export type ReferenceEvidence =
  | { kind: "explicit_exact"; frame: FinancialContextFrame }
  | { kind: "semantic_relationship"; frame: FinancialContextFrame }
  | { kind: "continuity"; frame: FinancialContextFrame };

export type FrameResolution =
  | { kind: "resolved"; query: AssistantQuery; evidence: ReferenceEvidence }
  | {
      kind: "savingsSelection";
      period: AssistantQuery["period"];
      frame: FinancialContextFrame;
    }
  | { kind: "ambiguousAmount" }
  | { kind: "none" };

/** Only spending-scoped reported totals may anchor a breakdown/confirm. */
function isAnchorable(frame: FinancialContextFrame): boolean {
  return (
    frame.reported.total !== null &&
    (frame.reported.metric === "expenses" || frame.reported.metric === "category")
  );
}

/** The engine's own tolerance when the user cites a figure we narrated. */
function matchesCited(fragmentAmount: number, cited: number): boolean {
  return Math.abs(fragmentAmount - cited) <= Math.max(fragmentAmount * 0.005, 0.01);
}

/** A stable identity for a frame's window (a figure can only live in one). */
function periodIdentity(frame: FinancialContextFrame): string {
  const r = frame.resolved;
  if (r && r.from && r.to) return `${r.from}|${r.to}`;
  return JSON.stringify(frame.period);
}

/** Period-only follow-up: inherit intent/category/target, override period. */
function resolvePeriodFollowUp(
  fragment: Extract<FollowUpAnalysis, { kind: "period" }>,
  frames: FinancialContextFrame[],
): FrameResolution {
  const targetPeriod = toAssistantPeriod(fragment.period);
  if (!targetPeriod) return { kind: "none" };
  for (const frame of frames) {
    if (!frame.query) continue;
    return {
      kind: "resolved",
      query: { ...frame.query, period: targetPeriod },
      evidence: { kind: "continuity", frame },
    };
  }
  return { kind: "none" };
}

/** "What about before?": repeat the prior subject one window earlier. */
function resolvePriorWindow(
  frames: FinancialContextFrame[],
  now: Date,
): FrameResolution {
  for (const frame of frames) {
    if (!frame.query || !frame.resolved?.from || !frame.resolved?.to) continue;
    const [from, to] = shiftRangeBack(frame.resolved.from, frame.resolved.to);
    const label = priorPeriodLabel(frame.query.period, now) ?? "the prior period";
    return {
      kind: "resolved",
      query: { ...frame.query, period: { kind: "custom", from, to, label } },
      evidence: { kind: "continuity", frame },
    };
  }
  return { kind: "none" };
}

/**
 * Hypothetical fragment: inherit category/amount/period from the previous
 * query; the goal falls back through the fragment, the previous query's
 * effectGoal, and the intent default, ending at profit. Uses only what the
 * user stated plus owned context — never invents an amount.
 */
function resolveHypotheticalFragment(
  question: string,
  fragment: Extract<FollowUpAnalysis, { kind: "hypothetical" }>,
  frames: FinancialContextFrame[],
): FrameResolution {
  for (const frame of frames) {
    if (!frame.query) continue;
    const goal =
      fragment.goal ??
      frame.query.effectGoal ??
      goalOfIntent(frame.query) ??
      "profit";
    const category =
      detectCategory(question) ??
      frame.query.category ??
      frame.reported.categoryName ??
      null;
    const operation = fragment.operation ?? frame.query.operation ?? "decrease";
    const hypotheticalAmount = fragment.amount ?? frame.query.hypotheticalAmount;

    return {
      kind: "resolved",
      query: {
        intent: "expenseImpact",
        category,
        period: frame.query.period,
        mode: "hypothetical",
        effectGoal: goal,
        operation,
        hypotheticalAmount,
      },
      evidence: { kind: "continuity", frame },
    };
  }
  return { kind: "none" };
}

/** Resolve a category object pronoun only from an owned category-bearing turn. */
function resolveCategorySpendReference(frames: FinancialContextFrame[]): FrameResolution {
  for (const frame of frames) {
    if (!frame.query?.category) continue;
    return {
      kind: "resolved",
      query: {
        intent: "categorySpend",
        category: frame.query.category,
        period: frame.query.period,
      },
      evidence: { kind: "semantic_relationship", frame },
    };
  }
  return { kind: "none" };
}

/** Direction-only follow-ups are valid only against a prior owned comparison. */
function resolveComparisonDirection(frames: FinancialContextFrame[]): FrameResolution {
  for (const frame of frames) {
    if (frame.query?.intent !== "periodComparison") continue;
    return { kind: "resolved", query: frame.query, evidence: { kind: "continuity", frame } };
  }
  return { kind: "none" };
}

/**
 * Amount anchor / register continuation: only against an anchored spending
 * total we ourselves narrated, within the engine's tolerance when the user
 * cited a figure. Walks newest-first, skipping frames that don't carry (or
 * don't match) a spending total. A CITED figure that matches owned totals in
 * MORE THAN ONE distinct period cannot be disambiguated from the text alone —
 * that is an explicit ambiguousAmount, never a guess. A register-only
 * reference (no figure) may match any narrated spending total, so it keeps
 * the newest-first-wins behaviour.
 */
function resolveAmountAnchor(
  fragment: Extract<FollowUpAnalysis, { kind: "expenseBreakdown" | "amountConfirmation" }>,
  frames: FinancialContextFrame[],
): FrameResolution {
  if (fragment.amount !== null) {
    const matches: { frame: FinancialContextFrame; periodKey: string }[] = [];
    const seen = new Set<string>();
    for (const frame of frames) {
      if (!isAnchorable(frame)) continue;
      const cited = frame.reported.total as number;
      if (!matchesCited(fragment.amount, cited)) continue;
      if (!frame.period) continue;
      const key = periodIdentity(frame);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ frame, periodKey: key });
      }
    }
    if (matches.length === 0) return { kind: "none" };
    if (matches.length > 1) return { kind: "ambiguousAmount" };
    const frame = matches[0].frame;
    const cited = frame.reported.total as number;
    const period = frame.period as NonNullable<AssistantQuery["period"]>;
    return {
      kind: "resolved",
      query: {
        intent: "expenseBreakdown",
        category: null,
        period,
        amountReference: { value: cited, source: "previous_answer" },
      },
      evidence: { kind: "explicit_exact", frame },
    };
  }

  for (const frame of frames) {
    if (!isAnchorable(frame)) continue;
    const period = frame.period;
    if (!period) continue;
    return {
      kind: "resolved",
      query: {
        intent: "expenseBreakdown",
        category: null,
        period,
        amountReference: { value: frame.reported.total as number, source: "previous_answer" },
      },
      evidence: { kind: "semantic_relationship", frame },
    };
  }
  return { kind: "none" };
}

/**
 * Savings two-option selection ("Both", "The two") is only meaningful against
 * the immediately preceding OWNED "ambiguous savings" clarification — the
 * frame must carry that exact reason and the exact clarification text, and
 * must imply a usable period.
 */
function resolveClarificationSelection(
  frames: FinancialContextFrame[],
): FrameResolution {
  for (const frame of frames) {
    if (frame.clarificationReason !== "ambiguous_savings") continue;
    if (frame.answer !== SAVINGS_CLARIFICATION_ANSWER) continue;
    if (!frame.period) continue;
    return { kind: "savingsSelection", period: frame.period, frame };
  }
  return { kind: "none" };
}

/**
 * Resolve a conversational follow-up fragment against the bounded set of OWNED
 * context frames. Returns an explicit "none" when nothing resolves, so the
 * caller can fall back to normal classification (the reference turn is then
 * almost certainly a clarification or unsupported) instead of inventing a
 * meaning.
 */
export function resolveAgainstFrames(
  question: string,
  fragment: FollowUpAnalysis,
  frames: FinancialContextFrame[],
  now: Date,
): FrameResolution {
  switch (fragment.kind) {
    case "period":
      return resolvePeriodFollowUp(fragment, frames);
    case "priorPeriod":
      return resolvePriorWindow(frames, now);
    case "hypothetical":
      return resolveHypotheticalFragment(question, fragment, frames);
    case "expenseBreakdown":
    case "amountConfirmation":
      return resolveAmountAnchor(fragment, frames);
    case "clarificationSelection":
      return resolveClarificationSelection(frames);
    case "categorySpend":
      return resolveCategorySpendReference(frames);
    case "comparisonDirection":
      return resolveComparisonDirection(frames);
    case "none":
      return { kind: "none" };
  }
}
