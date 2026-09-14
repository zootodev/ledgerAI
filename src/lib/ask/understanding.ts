// ============================================================
// LedgerAI — Deterministic Semantic Understanding (Ask LedgerAI)
// ------------------------------------------------------------
// Turns a natural-language question into the validated SemanticQuestion
// model (ask/semantics.ts) using a COMPACT conceptual vocabulary:
//   - synonym groups per concept (income/revenue/earn/…),
//   - one generic spelling-tolerance mechanism (token-level edit-distance
//     against the vocabulary + a tiny known-typo map),
//   - a time-expression parser,
//   - composition rules over the concepts (not a giant phrase dictionary).
//
// This layer understands MEANING. It never sees data, fetches nothing, and
// never computes a financial figure — the resolver + engine do that. The
// provider seam (ai/understanding.ts) shares the same output contract, so
// a configured LLM can fill gaps the vocabulary misses.
// ============================================================

import type {
  SemanticPeriod,
  SemanticQuestion,
} from "./semantics";

/* ------------------------------------------------------------
 * Concept vocabulary (synonym groups)
 * ------------------------------------------------------------ */

const BALANCE_PHRASES = [
  "balance", "cash balance", "cash position", "bank balance",
  "account balance", "cash", "funds", "wallet",
];

const INCOME_PHRASES = [
  "income", "revenue", "revenues", "earn", "earning", "earned", "earnings",
  "received", "receive", "receipts", "sales", "sold", "came in", "comes in",
  "got paid", "get paid", "paid in", "inflow", "inflows", "brought in",
  "took in", "take in",
];

const EXPENSE_PHRASES = [
  "spent", "spend", "spending", "expense", "expenses", "expenditure",
  "expenditures", "cost", "costs", "costing", "paid", "paying", "outgoing",
  "outflow", "outflows", "purchase", "purchases", "purchased", "bought",
  "buying", "used",
];

const PROFIT_PHRASES = [
  "profit", "profits", "profitability", "net profit", "net", "made money",
  "make money", "making money", "profitable", "how profitable",
];

const MARGIN_PHRASES = ["margin", "margins", "profit margin", "net margin"];

const TOP_PHRASES = ["top", "topmost", "biggest", "largest", "highest", "greatest", "most", "maximum"];
const LOW_PHRASES = ["least", "lowest", "smallest", "minimum", "minimal", "cheapest"];

const COUNT_HOW_PHRASES = ["how many", "number of"];
const COUNT_SUBJECT_PHRASES = ["transactions", "transaction", "purchases", "payments", "items"];

const IMPACT_PHRASES = [
  "impact", "impacts", "impacted", "affect", "affected", "affects", "why",
  "reason", "because", "resulted", "resulting", "driven", "made", "lesser",
  "less", "lower", "reduced", "reduce", "decrease", "decreased", "decline",
  "dropped", "hurt", "squeezed",
];

const DISTRIBUTION_PHRASES = [
  "breakdown", "spread", "split", "by category", "by categories",
  "across categories", "across the categories", "which categories",
  "what categories", "categories did i", "category by category",
  "broken down", "spent across", "split across", "how is my spending",
  "how was my spending", "spending breakdown", "allocation", "allocated",
];

const COMPARE_PHRASES = [
  "compare", "compared", "comparing", "versus", "vs", "vs.",
  "over last", "vs last", "than last", "than before", "than previous",
  "from last", "month over month", "compared to", "worse", "better than",
  "worse than", "improved", "change", "changed", "changes", "increase",
  "increased", "decreased", "grew", "growth", "went up", "went down",
  "up from", "down from", "higher than", "lower than",
];

const FOLLOWUP_PHRASES = ["what about", "how about", "and", "then", "compared to", "versus", "vs"];

/** Hypothetical spending-change markers: positing a REDUCTION in spending. */
const SPENDING_CUT_PHRASES = [
  "spend less", "spends less", "spent less", "spending less", "less on",
  "spend less on", "spent less on", "cut", "cuts", "cutting", "reduce",
  "reduces", "reduced", "reducing", "save", "saving",
];

/**
 * Savings markers ("save", "saved", …). On their own these are AMBIGUOUS —
 * "how much did I save?" could mean spend-reduction or money-left-after-
 * expenses, so they are never mapped to a metric; they produce a
 * clarification unless the conversation context resolves the meaning.
 */
const SAVINGS_PHRASES = ["save", "saves", "saved", "saving", "savings"];

/** Hypothetical spending-change markers: positing an INCREASE in spending. */
const SPENDING_RAISE_PHRASES = [
  "spend more", "spends more", "spent more", "spending more",
  "spend more on", "spent more on",
];

/** Conditional openings that frame an imagined scenario. */
const CONDITIONAL_PHRASES = [
  "if i", "if we", "if my", "if the", "what if", "suppose", "assuming",
  "what would happen", "what happens if",
];

/** Change verbs a relational "does X change Y?" question can carry. */
const CHANGE_VERB =
  /\b(reduce|reduces|reducing|decrease|decreases|decreasing|increase|increases|increasing|affect|affects|affecting|impact|impacts|impacting|change|changes|changing|improve|improves|improving|raise|raises|raising|lower|lowers|lowering|grow|grows|growing|rise|rises|rising)\b/;

/** The metric a relational question may be positing a change to. */
const TARGET_METRIC =
  /\b(expense|expenses|cost|costs|profit|profits|revenue|income|earnings|balance|spending|margin)\b/;

/**
 * True when a change idiom ("spending less", "reduce my expenses", "cut
 * costs") appears BEFORE a change verb in the same turn. This is the
 * compositional signal for a relational hypothetical ("Does spending less
 * reduce my expenses?") and keeps factual retrospective turns out — there the
 * metric, not the change, is the subject arriving before the verb
 * ("did my expenses reduce last month?").
 */
function hasSpendChangeBeforeVerb(text: string, verbRegex: RegExp): boolean {
  const verbMatch = text.match(verbRegex);
  if (!verbMatch || verbMatch.index === undefined) return false;
  const before = text.slice(0, verbMatch.index);
  return containsAny(before, SPENDING_CUT_PHRASES);
}

/** Named period flavours (kept in the same precedence as the Phase 8B engine). */
const THIS_MONTH_PHRASES = ["this month", "current month"];
const LAST_MONTH_PHRASES = ["last month", "previous month", "prior month"];
const THIS_YEAR_PHRASES = ["this year", "this financial year", "ytd", "year to date"];
const LAST_YEAR_PHRASES = ["last year", "previous year", "prior year", "the year before"];
const ALL_TIME_PHRASES = [
  "all time", "all-time", "in total", "overall", "ever recorded",
  "since started", "since i started", "since we started", "since the beginning",
  "everything recorded", "of all time", "to date",
];
const RECENT_90_PHRASES = [
  "past few months", "past couple of months", "last few months",
  "last couple of months", "in the past few months", "past few years", "few months",
];
const RECENT_30_PHRASES = [
  "recently", "lately", "recent", "past few weeks", "last few weeks",
  "past few days", "last few days", "in the last few days",
];

const MONTH_TOKEN =
  /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/;
const YEAR_TOKEN = /\b(19|20)\d{2}\b/;
const MONTH_VALUE: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7,
  september: 8, sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10,
  december: 11, dec: 11,
};

/** Category keyword groups mapped to canonical app category names. */
export const CATEGORY_KEYWORDS: { canonical: string; keywords: string[] }[] = [
  { canonical: "Rent", keywords: ["rent", "shop rent", "rental"] },
  { canonical: "Software", keywords: ["software", "subscription", "subscriptions", "saas"] },
  { canonical: "Transportation", keywords: ["transport", "transportation", "uber", "bolt", "logistics", "delivery", "fuel", "rides"] },
  { canonical: "Marketing", keywords: ["marketing", "advert", "advertising", "ads", "instagram ads", "facebook", "meta ads", "boost", "sponsorship"] },
  { canonical: "Inventory", keywords: ["inventory", "stock", "fabric", "supplier", "suppliers", "materials", "supplies", "goods"] },
  { canonical: "Salaries", keywords: ["salary", "salaries", "wages", "payroll", "staff", "employees"] },
  { canonical: "Utilities", keywords: ["utilities", "utility", "electric", "electricity", "power", "internet", "data", "airtime", "phone"] },
  { canonical: "Banking", keywords: ["bank", "banking", "charges", "fees", "stamp duty"] },
  { canonical: "Food", keywords: ["food", "meals", "snacks", "groceries"] },
  { canonical: "Equipment", keywords: ["equipment", "machine", "sewing machine", "tools", "furniture"] },
  { canonical: "Other", keywords: ["miscellaneous", "uncategorized"] },
];

/**
 * "spent less on other(s)" names the fallback "Other" bucket. The bare word
 * "other" is deliberately NOT a keyword (too common); only the "on other"
 * phrase maps to it, so questions like "any other expenses?" stay untouched.
 */
const OTHER_CATEGORY_REFERENCE = /\bon\s+(other|others)\b/;

/* ------------------------------------------------------------
 * Normalization + one generic spelling-tolerance mechanism
 * ------------------------------------------------------------ */

interface ConceptWord {
  word: string;
  group: string;
}

/** Ordinary English/function words that must NEVER be spell-corrected. */
const NON_CORRECTABLE = [
  "i", "we", "you", "me", "my", "the", "a", "an", "to", "on", "in", "of",
  "for", "and", "with", "from", "at", "by", "or", "but", "than", "then",
  "before", "after", "since", "about", "did", "does", "do", "is", "was",
  "were", "are", "have", "has", "had", "be", "been", "this", "that", "these",
  "those", "it", "its", "how", "what", "which", "where", "when", "why",
  "who", "much", "many", "number", "all", "overall", "out", "off", "into",
  "onto", "up", "down", "go", "goes", "went", "going", "make", "made",
  "getting", "get", "got", "recent", "recently", "lately", "last", "first",
  "next", "again", "also", "too", "just", "not", "no", "yes", "please",
  "both", "two", "them", "options", "readings", "meanings", "mean",
  "tell", "show", "see", "try", "say", "says", "shows", "things", "thing",
  "business", "better", "worse", "improved", "happening", "happened",
  "happen", "working", "doing", "done", "well", "long", "little", "lot",
  "time", "today", "yesterday", "tomorrow", "week", "weeks", "day", "days", "thread",
  "numbers", "number", "performance", "summary", "overview", "finances",
  "finance", "results", "result",
  // Time-phrase tokens: never spell-corrected, or "few" becomes "feb" and
  // "past" becomes "last", silently breaking the phrase lists these feed.
  "year", "years", "month", "months", "couple", "few", "past", "started",
  "beginning", "ever", "recorded", "everything", "total", "date", "to date",
  "january", "february", "march", "april", "june", "july", "august",
  "september", "october", "november", "december", "jan", "feb", "mar", "apr",
  "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "may",
  // Hypothetical-framing tokens: never spell-corrected.
  "would", "could", "should", "might", "if", "more", "suppose", "maybe",
  // Comparative adjectives: ordinary words that must not be respelled into
  // their concepty superlatives ("higher" -> "highest" would fire top_category
  // and swallow "would my profit be higher?" before the hypothetical branch).
  "higher", "lower", "better",
];

function conceptWords(): ConceptWord[] {
  const out: ConceptWord[] = [];
  const push = (group: string, phrases: string[]) => {
    for (const p of phrases) {
      for (const w of p.split(/\s+/)) {
        if (w.length > 1 && !out.some((e) => e.word === w)) out.push({ word: w, group });
      }
    }
  };
  push("word", NON_CORRECTABLE);
  push("balance", BALANCE_PHRASES);
  push("income", INCOME_PHRASES);
  push("expense", EXPENSE_PHRASES);
  push("profit", PROFIT_PHRASES);
  push("margin", MARGIN_PHRASES);
  push("top", TOP_PHRASES);
  push("low", LOW_PHRASES);
  push("time", [
    "month", "this", "last", "year", "previous", "prior", "current", "all_time",
    ...ALL_TIME_PHRASES, ...THIS_YEAR_PHRASES, ...LAST_YEAR_PHRASES,
    ...THIS_MONTH_PHRASES, ...LAST_MONTH_PHRASES,
  ]);
  for (const k of Object.keys(MONTH_VALUE)) push("time", [k]);
  push("savings", SAVINGS_PHRASES);
  for (const g of CATEGORY_KEYWORDS) push("category", g.keywords);
  return out;
}
const CONCEPT_WORDS = conceptWords();

/** Tiny curated typo map for high-frequency misspellings the vocabulary covers. */
const KNOWN_TYPOS: Record<string, string> = {
  lest: "least",
  wat: "what",
  expences: "expenses",
  expence: "expense",
  revnue: "revenue",
  balence: "balance",
  recieved: "received",
  tranactions: "transactions",
  categoris: "categories",
  wich: "which",
  wot: "what",
};

/** Damerau–Levenshtein distance (adjacent transposition counts as one edit). */
export function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) d[i] = [i];
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[n][m];
}

/** Correct a token against the concept vocabulary if it is close enough. */
function correctToken(token: string): string {
  const known = KNOWN_TYPOS[token];
  if (known) return known;
  // Only pure-letter words are candidates: numbers, currency-amounts and
  // mixed-symbol tokens ("₦50,000", "all-time") must never be respelled into
  // financial concepts.
  if (token.length < 3 || !/^[a-z]+$/.test(token)) return token;
  const tolerance = token.length <= 5 ? 1 : 2;
  let best: string | null = token;
  let bestDistance = Infinity;
  let tie = false;
  for (const { word } of CONCEPT_WORDS) {
    if (word === token) return token;
    const d = editDistance(token, word);
    if (d < bestDistance) {
      bestDistance = d;
      best = word;
      tie = false;
    } else if (d === bestDistance) {
      tie = true;
    }
  }
  if (bestDistance <= tolerance && best !== null && !tie) return best;
  if (bestDistance <= tolerance && best !== null && tie) return token;
  return token;
}

/** Lowercase, punctuation-insensitive, whitespace-collapsed text. */
export function normalizeQuestion(question: string): string {
  return (question ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[?!,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized + spelling-tolerant text ready for concept scanning. */
export function prepareQuestion(text: string): string {
  return normalizeQuestion(text)
    .split(" ")
    .map(correctToken)
    .join(" ");
}

/* ------------------------------------------------------------
 * Concept scanning helpers
 * ------------------------------------------------------------ */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAny(text: string, phrases: string[]): boolean {
  for (const phrase of phrases) {
    if (phrase.includes(" ")) {
      if (new RegExp(`\\b${escapeRegExp(phrase).replace(/\\s/g, "\\s+")}\\b`).test(text)) {
        return true;
      }
    } else if (new RegExp(`\\b${escapeRegExp(phrase)}\\b`).test(text)) {
      return true;
    }
  }
  return false;
}

/** Which category the question names, if any. */
export function detectCategory(text: string): string | null {
  const prepared = prepareQuestion(text);
  for (const group of CATEGORY_KEYWORDS) {
    if (containsAny(prepared, group.keywords)) return group.canonical;
  }
  if (OTHER_CATEGORY_REFERENCE.test(prepared)) return "Other";
  return null;
}

function hasMoneyishScope(text: string): boolean {
  return /money|spend|spent|spending|expense|expenses|cost|costs|categor(y|ies)|amount|figure|sum/.test(text);
}

/**
 * Subject words that make a turn a plausible spending-change scenario. Broader
 * than hasMoneyishScope because a posited change can target revenue/profit
 * without ever saying "spend": "if I reduced that", "would that affect my
 * profit?". Bare "reduce"/"save" questions are kept factual by the framing
 * requirement in detectHypothetical.
 */
function isHypotheticalScope(text: string): boolean {
  return /money|spent|spend|spending|expense|expenses|cost|costs|save|saving|cut|cuts|reduc|profit|revenue|income|earn|balance|funds|increase|categor(y|ies)/.test(text);
}

/** A turn that names one of the actual financial metrics ("profit", "cost"). */
function hasFinancialMetricNamed(text: string): boolean {
  return (
    containsAny(text, BALANCE_PHRASES) ||
    containsAny(text, INCOME_PHRASES) ||
    containsAny(text, EXPENSE_PHRASES) ||
    containsAny(text, PROFIT_PHRASES) ||
    containsAny(text, MARGIN_PHRASES)
  );
}

/**
 * A bare conversational reference: a pronoun/"what about …" turn that names
 * NO financial subject of its own ("what about before?", "what about that?",
 * "what did that change?"). Without the previous turn these need the subject
 * spelled out — so they clarify instead of guessing or calling it out of
 * scope. Turns that name a metric, category, or extreme are never treated as
 * bare references (they carry their own subject).
 */
export function isBareReference(text: string): boolean {
  if (hasFinancialMetricNamed(text)) return false;
  // Pronoun/antecedent patterns are checked BEFORE the category guard because
  // category keywords can false-positive on function words ("change" inside
  // "what did that change?" maps to Banking; "that"/"it" are never categories).
  if (/(what|how)\s+about\s+(that|it|this|then|before|earlier|previously|prior)\b/.test(text)) return true;
  if (/(what|how)\s+about\s+(the\s+)?(all time|overall|to date|in total|this month|this year)\b/.test(text)) return true;
  if (/(what|how)\s+about\s+(the\s+)?(last|previous|prior|past)\s+(month|year|week|quarter)\b/.test(text)) return true;
  if (/\b(what|how)\s+(did|does|would|will)\s+(that|it|this)\s+/.test(text)) return true;
  if (detectCategory(text)) return false;
  return false;
}

/**
 * "save"/"savings" phrasing on its own is a financial question whose operation
 * is ambiguous (spend-reduction vs leftover-after-expenses). This is the
 * classification signal; the DRY engine never invents a definition of
 * "savings" (the service layer resolves only what owned context disambiguates).
 */
export function isSavingsQuestion(question: string): boolean {
  const text = prepareQuestion(question);
  return containsAny(text, SAVINGS_PHRASES);
}

/* ------------------------------------------------------------
 * Time-expression parser
 * ------------------------------------------------------------ */

export function parsePeriod(textValue: string, now: Date): SemanticPeriod | null {
  const text = prepareQuestion(textValue);
  if (containsAny(text, LAST_MONTH_PHRASES)) return { kind: "last_month" };
  if (containsAny(text, THIS_MONTH_PHRASES)) return { kind: "this_month" };
  if (containsAny(text, LAST_YEAR_PHRASES)) return { kind: "last_year" };
  if (containsAny(text, THIS_YEAR_PHRASES)) return { kind: "this_year" };
  if (containsAny(text, ALL_TIME_PHRASES)) return { kind: "all_time" };
  if (containsAny(text, RECENT_90_PHRASES)) return { kind: "recent", days: 90 };
  if (containsAny(text, RECENT_30_PHRASES)) return { kind: "recent", days: 30 };

  const monthMatch = text.match(MONTH_TOKEN);
  if (monthMatch) {
    const month = MONTH_VALUE[monthMatch[1]];
    const yearMatch = text.match(YEAR_TOKEN);
    if (yearMatch) return { kind: "month", month, year: Number(yearMatch[0]) };
    const previousSubject = /\b(last|previous)\s+(?:of\s+)?(year|yr)\b/.test(text);
    const last =
      /(^|\s)last\s/.test(text.slice(0, monthMatch.index ?? 0) + " ");
    return {
      kind: "month",
      month,
      year: last || previousSubject ? now.getUTCFullYear() - 1 : now.getUTCFullYear(),
    };
  }
  return null;
}

/**
 * Read both sides of an explicit comparison. Keeping the windows separate is
 * essential: "this month vs last month" must never become "last month vs its
 * mechanically-derived prior range".
 */
function parseComparisonPeriods(textValue: string, now: Date): {
  period: SemanticPeriod;
  comparisonPeriod: SemanticPeriod;
} | null {
  const text = prepareQuestion(textValue);

  const bothNamedSides = (
    left: SemanticPeriod | null,
    right: SemanticPeriod | null,
  ): { period: SemanticPeriod; comparisonPeriod: SemanticPeriod } | null => {
    if (!left || !right) return null;
    if (
      left.kind === "conversation_reference" ||
      right.kind === "conversation_reference"
    ) {
      return null;
    }
    return { period: left, comparisonPeriod: right };
  };

  // 1. "vs" / "versus" junctions are position-independent.
  const spread = /\b(?:versus|vs\.?)\b/.exec(text);
  if (spread && spread.index !== undefined) {
    const pair = bothNamedSides(
      parsePeriod(text.slice(0, spread.index), now),
      parsePeriod(text.slice(spread.index + spread[0].length), now),
    );
    if (pair) return pair;
  }

  // 2. Verb-first "compare X with/to Y": the connector may occur after the
  //    metric/entity phrase ("Compare my spending this month with last month",
  //    "Compare June to May"). Both sides must still name concrete periods.
  const verb = /\bcompare(?:d|ing)?\b/.exec(text);
  if (verb && verb.index !== undefined) {
    const sep = /\b(?:to|with)\b/.exec(text.slice(verb.index + verb[0].length));
    if (sep && sep.index !== undefined) {
      const junction = verb.index + verb[0].length + sep.index;
      const pair = bothNamedSides(
        parsePeriod(text.slice(0, junction), now),
        parsePeriod(text.slice(junction + sep[0].length), now),
      );
      if (pair) return pair;
    }
  }

  // 3. "than" comparisons ("Did I spend more this month than last month?").
  //    Both sides must name concrete periods so this is never a best guess.
  const than = /\bthan\b/.exec(text);
  if (than && than.index !== undefined) {
    const pair = bothNamedSides(
      parsePeriod(text.slice(0, than.index), now),
      parsePeriod(text.slice(than.index + 4), now),
    );
    if (pair) return pair;
  }

  return null;
}

/* ------------------------------------------------------------
 * Hypothetical / counterfactual reasoning ("If I spent less…")
 * ------------------------------------------------------------ */

export type HypotheticalGoal = "income" | "expenses" | "profit" | "balance";

export interface HypotheticalDetail {
  /** The metric the posited change is expected to move (null = solve for it). */
  goal: HypotheticalGoal | null;
  /** Direction of the posited spending change (null = undetermined). */
  operation: "increase" | "decrease" | null;
  /** A user-stated amount for the change (never invented by the system). */
  amount: number | null;
  /** True when the scenario refers to "that"/"it"/"this" from context. */
  referential: boolean;
  /** Base window the imagined change applies to (comparison tails removed). */
  basePeriod: SemanticPeriod;
}

/**
 * A user-stated amount inside a question, read from the raw text so
 * currency symbols and thousands separators survive normalization. A bare
 * 4-digit year (1900–2100) without a currency/suffix is never an amount.
 */
export function extractHypotheticalAmount(text: string): number | null {
  const lowered = (text ?? "").toLowerCase();
  const re = /(?:₦|ngn|#|naira)?\s*(\d[\d,._]*)\s*(k|thousand|million|m|b)?\b/g;
  for (const match of lowered.matchAll(re)) {
    const raw = match[1].replace(/[,_]/g, "");
    if (!/^\d+(\.\d+)?$/.test(raw)) continue;
    const base = Number(raw);
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = match[2] ?? "";
    const value =
      suffix === "k" || suffix === "thousand"
        ? base * 1_000
        : suffix === "million" || suffix === "m"
          ? base * 1_000_000
          : suffix === "b"
            ? base * 1_000_000_000
            : base;
    if (value > 1_000_000_000_000) continue;
    if (/^\d{4}$/.test(raw) && !suffix && value >= 1900 && value <= 2100) continue;
    return Math.round(value * 100) / 100;
  }
  return null;
}

/**
 * Composition verbs that describe a spending figure split across categories
 * ("made up", "consists of", "broken down", "divided", …). They make a turn an
 * expense breakdown request rather than a bare total.
 */
const COMPOSITION_VERB =
  /\b(made up|make up|makes up|consist|consists|consisted|comprised|comprises|composed of|composes of|break down|breakdown|broken down|divided|distributed)\b/;

/** An amount-register noun ("that amount", "this total", …) in the turn. */
const AMOUNT_ANCHOR =
  /\b(that|this|it|these|those)\s+(amount|total|spending|money|figure|sum)\b/;

/** "spend that on", "paid this for" — a category-less referential object. */
const SPEND_REFERENTIAL =
  /(?:spend|spent|spending|paid|cost)\s+(that|it|this)\b(?!\s+(?:month|year|week|day))/;

/** A category object supplied only by an owned prior turn ("spend on it"). */
const REFERENTIAL_CATEGORY_SPEND =
  /\b(?:spend|spent|spending|paid|paying|cost|costs)\s+(?:on|for)\s+(that|it|this)\b(?!\s+(?:month|year|week|day))/;

/** "the amount", "that figure", "this sum" — a register noun that names an
 *  amount figure without giving a number of its own. */
const THE_AMOUNT_NOUN = /\b(?:the|that|this|these|those)\s+(?:amount|figure|sum)\b/;

/** Passive mirror of SPEND_REFERENTIAL: "that was spent on", "it was paid
 *  for" — the referential figure is the grammatical SUBJECT, so the pronoun
 *  PRECEDES the spend verb. Requires a target preposition later in the turn
 *  ("on/for/toward/into"), which keeps "when was it spent?" out. */
const REFERENTIAL_PASSIVE =
  /\b(that|it|this|these|those)\s+(?:(?:was|were|is|are|have|has|had|been|being)\s+)*(?:spend|spent|spending|paid|paying|used)\b(?=[^.!?]*\b(?:on|for|toward|towards|into)\b)/;

/** Pronoun adjacent to a composition verb ("made up that expense", "break
 *  that down") — the figure being broken down is the pronoun antecedent. */
const COMPOSITION_REFERENTIAL =
  /\b(?:made up|make up|makes up|break down|breaks down|broken down|divided|distributed|comprised|comprises|consists? of|composed of)\s+(that|it|this|these|those)\b|\b(?:break|breaks|broke|split|splits)\s+(that|it|this|these|those)\s+down\b/;

/** "spent … on/for/toward" — names the object an amount was spent on. */
const SPENT_TARGET =
  /\b(?:spend|spent|spending|paid|paying)\s+[^.!?]*?\b(?:on|for|toward|towards)\b/;

/** "where did that amount go", "what did it go toward/into". */
function detectGoTarget(text: string): boolean {
  return (
    /\b(?:where\s+did|where\s+does|what\s+did)\b.*\b(?:amount|figure|sum|money|spending)\b.*\b(?:go|goes|going|went)\b/.test(
      text,
    ) || /\b(?:go|goes|going|went)\s+(?:to|toward|towards|into|on)\b/.test(text)
  );
}

/**
 * Compositional signal for an expense-breakdown question: the user asks WHAT a
 * spending total is made up of, category by category. Never fires on named
 * categories (those are category_spend), extremes (top/lowest), or the plain
 * "which categories did I spend on" distribution phrasing.
 */
function detectExpenseBreakdown(prepared: string, question: string): boolean {
  // "Break that down." carries no money word of its own — only the breakdown
  // structure — so the scope gate also accepts composition/referential/
  // spending-target structures without one.
  if (
    !hasMoneyishScope(prepared) &&
    !COMPOSITION_VERB.test(prepared) &&
    !COMPOSITION_REFERENTIAL.test(prepared) &&
    !SPENT_TARGET.test(prepared) &&
    !detectGoTarget(prepared) &&
    !REFERENTIAL_PASSIVE.test(prepared)
  ) {
    return false;
  }
  // Extremes keep their own branches ("top"/"least" win over a breakdown).
  if (containsAny(prepared, TOP_PHRASES) || containsAny(prepared, LOW_PHRASES)) {
    return false;
  }
  // "which categories did I spend on…" is the distribution phrasing, not an
  // expense breakdown (existing spendingDistribution intent stays untouched).
  if (/categor(y|ies)\s+(did|do|does|have|has)\s+(i|we|you|me)\s+spend/.test(prepared)) {
    return false;
  }
  // A named concrete category is a category_spend question.
  if (detectCategory(prepared) !== null) return false;

  const wordCategory = /\b(what|which)\s+categor(y|ies)\b/.test(prepared);
  const amount = extractHypotheticalAmount(question);
  const hasAmount = amount !== null;
  const composition = COMPOSITION_VERB.test(prepared);
  const expensePhrase =
    /spend|spent|spending|paid|cost|costs|expense|expenses/.test(prepared);
  const referential =
    AMOUNT_ANCHOR.test(prepared) ||
    SPEND_REFERENTIAL.test(prepared) ||
    REFERENTIAL_PASSIVE.test(prepared) ||
    COMPOSITION_REFERENTIAL.test(prepared);
  const whereMoneyGo = /where (does|did)\b.*money go/.test(prepared);
  const spendingTarget = SPENT_TARGET.test(prepared);
  // A determiner + amount-register noun names a figure from context without
  // giving a number ("that amount", "the figure").
  const registerNoun = AMOUNT_ANCHOR.test(prepared) || THE_AMOUNT_NOUN.test(prepared);
  // A spending SUBJECT plus a spending-target verb ("the August spending …
  // spent on") names the figure being broken down. The subject must be an
  // amount-register word or a SECOND spending word — "spending on X" (a
  // single spend phrase naming the on-object) stays a plain figure.
  const spendWordCount = (prepared.match(/\b(?:spend|spent|spending|paid|paying)\b/g) ?? [])
    .length;
  const namedFigure = /\b(?:amount|total|figure|sum)\b/.test(prepared);

  if (hasAmount && (wordCategory || expensePhrase)) return true;
  if (referential && (composition || expensePhrase)) return true;
  if (composition && expensePhrase) return true;
  // A pronominal composition/antecedent is itself the breakdown signal
  // ("What made up that expense?", "Break that down.").
  if (COMPOSITION_REFERENTIAL.test(prepared)) return true;
  // A passive referential figure ("that was spent on …") is where-the-figure-
  // went phrasing even without any other spend word.
  if (REFERENTIAL_PASSIVE.test(prepared)) return true;
  if (spendingTarget && (namedFigure || spendWordCount > 1)) return true;
  // "Where did my money go?" without an amount keeps the top-category reading.
  if (whereMoneyGo && hasAmount) return true;
  // A category word next to spending phrasing is a breakdown ask even without
  // a stated figure ("What category made my spending in August?").
  if (wordCategory && expensePhrase) return true;
  // An amount-register noun plus a spend/where-it-went framing is a breakdown
  // anchored on that figure ("where did that amount go", "what was the amount
  // spent on"). "spent money on X" (no register) keeps its impact reading.
  if (registerNoun && (spendingTarget || detectGoTarget(prepared))) return true;
  return false;
}

/** Vocabulary that may appear in a clarification-choice turn ("The two",
 *  "Both", "Both readings", "I want both together"). Only matched when the
 *  turn also says "both"/"two"; turns with their own subject ("both of my
 *  accounts") never match, and no-context turns fall through to
 *  classification. */
const SELECTION_VOCAB = new Set([
  "both", "two", "them", "those", "options", "readings", "meanings",
  "the", "i", "me", "mean", "want", "give", "all", "of", "together",
  "combined", "please", "yes",
]);

/** True when the whole turn is a pure "select both options" response. */
function isBothSelectionText(rawText: string): boolean {
  const tokens = normalizeQuestion(rawText).split(" ");
  if (tokens.length === 0) return false;
  if (!tokens.includes("both") && !tokens.includes("two")) return false;
  return tokens.every((token) => SELECTION_VOCAB.has(token));
}

/** A literal figure continuation ("the 187600", "₦187,600", "187600"). */
function extractBareAmount(rawText: string): number | null {
  if (!/^(?:the\s+)?(?:₦|ngn\s*)?[\d][\d,._]*$/i.test(rawText.trim())) return null;
  return extractHypotheticalAmount(rawText);
}

/** An amount-register continuation without a figure ("that amount", "the
 *  sum") — a full turn about an amount, never a financial claim on its own. */
function isAmountRegisterOnly(rawText: string): boolean {
  const t = normalizeQuestion(rawText);
  return (
    /^(?:the|that|this|these|those)?\s*(?:amount|figure|sum)\s*$/.test(t) ||
    /^(?:that|this|these|those)\s+(?:money|spending|total)\s*$/.test(t)
  );
}

/** True when the turn names an amount-register noun or "that/it/this" spending
 *  object — a breakdown whose missing period/total must come from context. */
function hasAmountAnchor(prepared: string): boolean {
  return (
    AMOUNT_ANCHOR.test(prepared) ||
    SPEND_REFERENTIAL.test(prepared) ||
    THE_AMOUNT_NOUN.test(prepared) ||
    REFERENTIAL_PASSIVE.test(prepared) ||
    COMPOSITION_REFERENTIAL.test(prepared)
  );
}

/** Which metric the posited change targets ("profit" phrasing wins last). */
function detectEffectGoal(text: string): HypotheticalGoal | null {
  // A metric that is itself being reduced/increased ("would my expenses fall").
  if (
    /\b(expense|expenses|spending|cost|costs)\b/.test(text) &&
    /(reduce|reduced|reducing|decrease|decreased|go(ds)? down|fall|fell|drop|dropped|lower|lowered|shrink)/.test(text)
  ) {
    return "expenses";
  }
  if (
    /\b(revenue|income|earnings)\s+(fall|fell|drop|dropped|reduce|reduced|decrease|decreased|rise|rose|grow|grew|increase|increases|increased)/.test(text)
  ) {
    return "income";
  }
  if (/\b(profit|profits|profitability|margin|net profit|made money|make money)\b/.test(text)) {
    return "profit";
  }
  if (/\b(balance|cash balance|funds)\b/.test(text)) {
    return "balance";
  }
  return null;
}

/** Strip a trailing "than/compared-to …" clause so it can't hijack the base period. */
function withoutComparisonTail(text: string): string {
  return text.replace(/\b(than|compared to|vs|versus|instead of)\b.*$/i, "").trim();
}

/**
 * True when the turn names a CONCRETE comparison window ("than last month",
 * "compared to May 2026"). A bare rhetorical "than before" is NOT a concrete
 * reference — the imagined change is already against the current baseline.
 */
function hasConcreteComparisonReference(text: string): boolean {
  const tail = text.match(/\b(than|compared to)\b[\s\S]*$/)?.[0] ?? "";
  return (
    /(last|previous|prior)\s+(month|year)\b/.test(tail) ||
    /\b(janu(ry)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/.test(tail) ||
    /\b(all time|overall|in total|to date)\b/.test(tail)
  );
}

/**
 * Detect a hypothetical spending-change question. Returns details when the
 * turn posits a change to spending ("spent less", "cut my expenses", "what
 * if I spent 50k…") or refers to such a change via a pronoun. Never fires on
 * ordinary factual questions.
 */
export function detectHypothetical(
  question: string,
  now: Date,
): HypotheticalDetail | null {
  const text = prepareQuestion(question);
  if (!text || !isHypotheticalScope(text)) return null;

  // Phrase scanning happens on a copy with money tokens removed so a stated
  // amount can sit inside the idiom ("spent ₦50,000 less" -> "spent less")
  // without breaking adjacency. The amount itself is still parsed from the
  // raw text below.
  const plain = text
    .split(" ")
    .filter((t) => t !== "₦" && !/^(?:₦|ngn)?[0-9]+$/.test(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const cut = containsAny(plain, SPENDING_CUT_PHRASES);
  const raise = containsAny(plain, SPENDING_RAISE_PHRASES);
  const conditional = containsAny(plain, CONDITIONAL_PHRASES);
  const modal = /\b(would|will|might|could)\b/.test(plain);
  // "that"/"it" are always referential; "this" only when NOT qualifying a
  // period ("this month", "this year") — otherwise "Reduce my expenses this
  // month" would look like a pronoun reference.
  const referential =
    /\b(that|it)\b/.test(plain) ||
    (/\bthis\b/.test(plain) &&
      !/(^|\s)this\s+(month|year|week|quarter|semester)\b/.test(plain));
  const amount = extractHypotheticalAmount(question);

  // A bare spending word ("how much did I save?", "reduce my expenses") is NOT
  // a scenario: it needs a frame — a conditional opening, a modal verb, a
  // referential pronoun, a stated amount, or a relational
  // (change-before-verb) question — to be read as hypothetical.
  const relational =
    hasSpendChangeBeforeVerb(plain, CHANGE_VERB) && TARGET_METRIC.test(plain);
  const framed = conditional || modal || referential || amount !== null || relational;
  if ((cut || raise) && !framed) return null;
  // A pure referential/modal turn ("would that affect…", "would it increase?")
  // is only valid while implying a change scenario; it must stay unsupported
  // on its own and rely on the service to resolve the subject from context.
  if (!cut && !raise && !(modal && referential) && !(modal && conditional)) {
    return null;
  }

  return {
    goal: detectEffectGoal(text),
    operation: raise ? "increase" : cut ? "decrease" : null,
    amount,
    referential,
    basePeriod:
      parsePeriod(withoutComparisonTail(text), now) ?? { kind: "this_month" },
  };
}

/* ------------------------------------------------------------
 * Follow-up (conversational reference) analysis
 * ------------------------------------------------------------ */

export type FollowUpAnalysis =
  | { kind: "period"; period: SemanticPeriod }
  | { kind: "priorPeriod" }
  | {
      kind: "hypothetical";
      goal: HypotheticalGoal | null;
      operation: "increase" | "decrease" | null;
      amount: number | null;
    }
  | {
      kind: "expenseBreakdown";
      /** A user-stated amount in the turn (null = referential only). */
      amount: number | null;
      /** True when the turn refers to "that"/"it"/"this" from context. */
      referential: boolean;
    }
  | { kind: "clarificationSelection"; selection: "both" }
  | { kind: "categorySpend" }
  | { kind: "comparisonDirection" }
  | {
      kind: "amountConfirmation";
      /** A user-stated figure in the turn (null = register-only reference). */
      amount: number | null;
    }
  | { kind: "none" };

function hasMetricOrSubject(text: string): boolean {
  return (
    containsAny(text, BALANCE_PHRASES) ||
    containsAny(text, INCOME_PHRASES) ||
    containsAny(text, EXPENSE_PHRASES) ||
    containsAny(text, PROFIT_PHRASES) ||
    containsAny(text, MARGIN_PHRASES) ||
    containsAny(text, TOP_PHRASES) ||
    containsAny(text, LOW_PHRASES) ||
    containsAny(text, COUNT_HOW_PHRASES) ||
    containsAny(text, COUNT_SUBJECT_PHRASES) ||
    containsAny(text, IMPACT_PHRASES) ||
    containsAny(text, DISTRIBUTION_PHRASES) ||
    containsAny(text, COMPARE_PHRASES) ||
    detectCategory(text) !== null
  );
}

/**
 * Detect a conversational reference that needs the previous turn to answer:
 *   - period-only ("What about last month?", "And last year?") — the turn
 *     names ONLY a time window, so it inherits the prior intent;
 *   - prior-window ("What about before?") — repeat the prior subject one
 *     period earlier;
 *   - hypothetical fragments ("what if I reduced that by ₦50,000?",
 *     "would it increase?") whose subject/category is "that"/"it"/"this" or
 *     is simply unspecified, so it borrows the previous turn's subject.
 * A turn that names its own metric/subject is never treated as a reference.
 */
export function analyzeFollowUp(question: string, now: Date): FollowUpAnalysis {
  const text = prepareQuestion(question);
  if (!text) return { kind: "none" };

  // A bare amount or amount-register continuation ("the 187600", "that
  // amount") names only a figure with no subject; the service anchors it
  // against owned narration. It is distinct from a clarification-choice turn.
  const bareAmount = extractBareAmount(question);
  if (bareAmount !== null) return { kind: "amountConfirmation", amount: bareAmount };
  if (isAmountRegisterOnly(question)) return { kind: "amountConfirmation", amount: null };

  // A pure clarification-choice turn ("The two", "Both", "Both readings") is
  // only meaningful right after the service's latest owned clarification; the
  // service resolves it, and WITHOUT that context it falls through to normal
  // classification (never invents meaning).
  if (isBothSelectionText(question)) {
    return { kind: "clarificationSelection", selection: "both" };
  }

  // "How much did I spend on it?" has a spending verb but no category of its
  // own. It is never permission to silently widen into total spending.
  if (REFERENTIAL_CATEGORY_SPEND.test(text)) return { kind: "categorySpend" };

  // A direction-only question is meaningful only after our owned comparison.
  if (/\b(?:was|is|were)\s+(?:that|it|this)\s+(?:higher|lower|more|less)\b/.test(text)) {
    return { kind: "comparisonDirection" };
  }

  // Prior-window reference: no period token, but explicitly asks for earlier.
  if (
    !hasMetricOrSubject(text) &&
    /(what|how)\s+about\s+(before|earlier|previously|prior)\b/.test(text)
  ) {
    return { kind: "priorPeriod" };
  }

  const period = parsePeriod(text, now);
  if (period) {
    if (!containsAny(text, FOLLOWUP_PHRASES)) return { kind: "none" };
    if (hasMetricOrSubject(text)) return { kind: "none" };
    return { kind: "period", period };
  }

  const hypothetical = detectHypothetical(question, now);
  if (
    hypothetical &&
    (hypothetical.referential ||
      (hypothetical.operation !== null && detectCategory(text) === null))
  ) {
    return {
      kind: "hypothetical",
      goal: hypothetical.goal,
      operation: hypothetical.operation,
      amount: hypothetical.amount,
    };
  }

  // An expense breakdown with no explicit period must anchor its amount (or
  // referential) against the previous exchange — "What did I spend 187,600
  // on?" after "Spending in August 2026 was ₦187,600."
  if (
    detectExpenseBreakdown(text, question) &&
    !parsePeriod(text, now) &&
    (extractHypotheticalAmount(question) !== null || hasAmountAnchor(text))
  ) {
    return {
      kind: "expenseBreakdown",
      amount: extractHypotheticalAmount(question),
      referential: hasAmountAnchor(text),
    };
  }
  return { kind: "none" };
}

/* ------------------------------------------------------------
 * Composition: concepts -> validated SemanticQuestion
 * ------------------------------------------------------------ */

export interface UnderstandingInput {
  question: string;
  now: Date;
}

/**
 * Deterministically classify a natural-language question into the constrained
 * semantic model. Returns a data query or an explicit "unsupported" — the
 * vague-finance clarification decision lives in classifyAssistantQuestion,
 * which uses this same normalized surface.
 */
export function understand(
  question: string,
  now: Date = new Date(),
): SemanticQuestion {
  const text = prepareQuestion(question);
  if (!text) return { classification: "unsupported", reason: "empty_or_gibberish" };
  const period = parsePeriod(text, now) ?? { kind: "this_month" };

  const balance =
    containsAny(text, BALANCE_PHRASES) ||
    /do i have|(in|on) my (bank|account|accounts|wallet|wallets)/.test(text);
  const count =
    containsAny(text, COUNT_HOW_PHRASES) && containsAny(text, COUNT_SUBJECT_PHRASES);
  const income = containsAny(text, INCOME_PHRASES);
  const expense = containsAny(text, EXPENSE_PHRASES);
  const profit = containsAny(text, PROFIT_PHRASES);
  const margin = containsAny(text, MARGIN_PHRASES);
  const top = containsAny(text, TOP_PHRASES);
  const low = containsAny(text, LOW_PHRASES);
  const impact = containsAny(text, IMPACT_PHRASES);
  const distribution = containsAny(text, DISTRIBUTION_PHRASES);
  const compare = containsAny(text, COMPARE_PHRASES);
  const comparisonPeriods = compare ? parseComparisonPeriods(question, now) : null;
  const whereMoneyGo = /where (does|did)\b.*money go/.test(text);
  const category = detectCategory(text);

  // 1. balance — cumulative position, always as-of.
  if (balance) {
    return { classification: "query", intent: "balance", period };
  }

  // 2. transaction count.
  if (count) {
    return { classification: "query", intent: "transaction_count", period };
  }

  // 3. hypothetical/counterfactual change — "If I spent less on X, would my
  //    profit/expenses…". Decomposed into the spending change (operation,
  //    amount) and the metric it moves (effectGoal) BEFORE any factual intent
  //    or extreme ("most"/"least") wording can swallow it. A referential turn
  //    ("how would that affect…") with no in-turn subject is a
  //    subject-clarification here; the service re-resolves it against owned
  //    conversation context when one exists.
  const hypothetical = detectHypothetical(question, now);
  if (hypothetical) {
    if (hypothetical.referential && !category) {
      return { classification: "clarification", reason: "needs_subject" };
    }
    const comparison = hasConcreteComparisonReference(text);
    return {
      classification: "query",
      intent: "expense_impact",
      period: hypothetical.basePeriod,
      entity: category ?? null,
      dimension: "category",
      mode: comparison ? "comparison" : "hypothetical",
      effectGoal: hypothetical.goal ?? "profit",
      operation: hypothetical.operation ?? "decrease",
      hypotheticalAmount: hypothetical.amount ?? undefined,
      comparison: comparison ? "previous_period" : undefined,
    };
  }

  // 4. bare conversational references ("what about before?", "what about
  //    that?", "what did that change?") name no financial subject of their
  //    own — the subject must come from the previous turn. Clarify rather
  //    than guess or call a financial turn out of scope; the service layer
  //    resolves these against owned conversation context when one exists.
  if (isBareReference(text)) {
    return { classification: "clarification", reason: "needs_subject" };
  }

  if (REFERENTIAL_CATEGORY_SPEND.test(text)) {
    return { classification: "clarification", reason: "needs_subject" };
  }

  // 4.5 expense breakdown — "What did I spend 187,600 on?", "What category
  //     made my spending in August 187,600?" ask what a spending total is
  //     made up of, category by category. An explicit period answers directly;
  //     an unanchored amount/referential names no period of its own, so it
  //     marks `conversation_reference` and the service resolves it against the
  //     owned previous exchange — standalone it is a clarification.
  const breakdown = detectExpenseBreakdown(text, question);
  if (breakdown) {
    const explicit = parsePeriod(text, now);
    const amount = extractHypotheticalAmount(question);
    const amountReference =
      amount === null
        ? undefined
        : { value: amount, source: "user_stated" as const };
    if (explicit) {
      return {
        classification: "query",
        intent: "expense_breakdown",
        period: explicit,
        entity: null,
        amountReference,
      };
    }
    if (amountReference || hasAmountAnchor(text)) {
      return {
        classification: "query",
        intent: "expense_breakdown",
        period: { kind: "conversation_reference" },
        amountReference,
      };
    }
    return {
      classification: "query",
      intent: "expense_breakdown",
      period: { kind: "this_month" },
    };
  }

  // 5. lowest expense category (the comparator flips "top" questions).
  if (low && hasMoneyishScope(text)) {
    return { classification: "query", intent: "lowest_category", period };
  }

  // 6. top expense category, including "where did my money go".
  if ((top || whereMoneyGo) && (hasMoneyishScope(text) || /expense/.test(text))) {
    return { classification: "query", intent: "top_category", period };
  }

  // 7. expense impact — "what made my revenue/profit lower" reasoning. An
  //     explicit two-window comparison ("Did I spend less this month than last
  //     month?") is a dual-window comparison, not causal reasoning, so it goes
  //     to the comparison branch instead.
  if (impact && (income || expense || profit) && !comparisonPeriods) {
    return {
      classification: "query",
      intent: "expense_impact",
      period,
      entity: category ?? null,
      dimension: "category",
    };
  }

  // 8. spending on one named category (only after extremes). "save on X" is
  //     NOT "spend on X" — savings keep their ambiguity (branch 16) instead of
  //     collapsing into a category-spend query just because "how much" matched.
  if (
    category &&
    !isSavingsQuestion(text) &&
    /spend|spent|spending|paid|cost|costs|on\s+the|how much|total|used/.test(text)
  ) {
    return { classification: "query", intent: "category_spend", period, entity: category };
  }

  // 9. spending distribution across categories.
  if (distribution && expense) {
    return {
      classification: "query",
      intent: "spending_distribution",
      period,
      entity: category ?? null,
      dimension: "category",
    };
  }

  // 10. explicit period comparison with a target metric when one is named — or
  //     with no metric at all when both periods themselves are named explicitly
  //     ("Compare June with May" needs no "spend"/"income" word).
  if (compare && (income || expense || profit || balance || hasMoneyishScope(text) || comparisonPeriods !== null)) {
    let comparisonTarget: "income" | "expenses" | "profit" | "balance" | null = null;
    if (income && !expense && !profit && !balance) comparisonTarget = "income";
    else if (expense && !income && !profit && !balance) comparisonTarget = "expenses";
    else if (profit && !income && !expense && !balance) comparisonTarget = "profit";
    else if (balance && !income && !expense && !profit) comparisonTarget = "balance";
    return {
      classification: "query",
      intent: "period_comparison",
      period: comparisonPeriods?.period ?? period,
      entity: category ?? null,
      target: comparisonTarget,
      comparison: "previous_period",
      comparisonPeriod: comparisonPeriods?.comparisonPeriod,
    };
  }

  // 11. profit margin is a distinct, narrowly-scoped intent.
  if (margin) return { classification: "query", intent: "profit_margin", period };

  // 12. profit.
  if (profit) return { classification: "query", intent: "profit", period };

  // 13. income vs expenses is only chosen when the question names both.
  if (income && expense && (compare || /\bvs\.?|versus|both|\band\b/.test(text))) {
    return { classification: "query", intent: "income_vs_expenses", period };
  }

  // 14 / 15. single-metric questions.
  if (income) return { classification: "query", intent: "income", period };
  if (expense) return { classification: "query", intent: "expenses", period };

  // 16. savings — "how much did I save?" names a genuinely ambiguous financial
  //     operation (spend-reduction vs money-left-after-expenses). We never
  //     invent a definition of "savings": clarify unless the conversation
  //     established one (the service layer resolves owned context when it can).
  if (isSavingsQuestion(question)) {
    return { classification: "clarification", reason: "ambiguous_savings" };
  }

  // 17. A bare amount or amount-register reference ("the 187600", "that
  //     amount", "the figure") names no subject of its own. It can only be
  //     re-anchored against owned context, so standalone it is an
  //     ambiguous_amount clarification rather than a non-financial turn (and
  //     the service never guesses a figure on its behalf).
  const amountOnly =
    extractHypotheticalAmount(question) !== null ||
    AMOUNT_ANCHOR.test(text) ||
    THE_AMOUNT_NOUN.test(text);
  const namesOwnSubject =
    hasFinancialMetricNamed(text) || category !== null || balance || count ||
    impact || distribution || compare || top || low || margin || profit ||
    income || expense || whereMoneyGo;
  if (amountOnly && !namesOwnSubject) {
    return { classification: "clarification", reason: "ambiguous_amount" };
  }

  return { classification: "unsupported", reason: "non_financial" };
}
