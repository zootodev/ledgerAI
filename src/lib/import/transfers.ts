// ============================================================
// LedgerAI — internal transfer detection
// ------------------------------------------------------------
// Statements describe the same money move from both sides: a wallet
// withdrawal sweeping into savings, an OWealth transfer, a reversal, or a
// transfer from the holder's own account at another bank. Treating those as
// income/expense inflates the ledger; treating both sides as fresh
// transactions imports the same move twice.
//
// Detection is deliberately conservative and never alters an amount. It only
// changes a row's TYPE and, for a mirror pair, sets it aside.
// ============================================================

import type {
  ImportSection,
  ImportTransferInfo,
  NormalizedImportRow,
} from "./types";

export interface TransferDetectionOptions {
  /** Profile/holder name, used to recognise own-account transfers. */
  holderName?: string | null;
  /** PDF sections carry the printed account holder/name. */
  sections?: ImportSection[];
  /** Business profile name can be different from the account holder. */
  businessName?: string | null;
}

export interface TransferSummary {
  /** Rows skipped as one side of a mirrored internal move. */
  mirrored: number;
  /** Rows marked Transfer (own account) but kept selectable. */
  selfTransfers: number;
  /** Rows marked as a reversal/refund pair. */
  reversals: number;
  /** Savings interest rows explicitly protected from sweep pairing. */
  interest: number;
  /** Total mirror rows skipped. */
  skipped: number;
}

export interface TransferDetectionResult {
  rows: NormalizedImportRow[];
  summary: TransferSummary;
}

const SWEEP_WORDS =
  /\b(auto[\s-]?save|savings?|vault|target|owealth|spend\s+and\s+save|piggy|sweep|internal\s+transfer|wallet\s+transfer|transfer\s+to\s+(?:wallet|savings)|withdrawal\s*\(?\s*transaction\s+payment|reversal|reversed)\b/i;

const INTEREST_WORDS = /\binterest\b/i;

const REVERSAL_WORDS = /\b(reversal|reversed|refund|refunded|chargeback)\b/i;

const NAME_STOPWORDS = new Set([
  "mr",
  "mrs",
  "miss",
  "ms",
  "dr",
  "prof",
  "chief",
  "alhaji",
  "hajia",
  "limited",
  "ltd",
  "plc",
  "enterprise",
  "enterprises",
  "ventures",
  "company",
  "services",
  "bank",
  "account",
  "acct",
]);

function canonicalNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !NAME_STOPWORDS.has(token));
}

function descriptionNameMatches(description: string, tokens: string[]): number {
  if (tokens.length < 2) return 0;
  const words = new Set(
    description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
  return tokens.filter((token) => words.has(token)).length;
}

function amountNumber(row: NormalizedImportRow): number | null {
  const amount = Number(row.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function timeSeconds(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function isCloseInTime(a: NormalizedImportRow, b: NormalizedImportRow): boolean {
  if (a.date !== b.date) return false;
  const aSeconds = timeSeconds(a.time);
  const bSeconds = timeSeconds(b.time);
  if (aSeconds !== null && bSeconds !== null) {
    return Math.abs(aSeconds - bSeconds) <= 120;
  }
  // Without a time, only pair same-day rows when there is another strong
  // signal (sweep wording or an identical reference).
  return (
    SWEEP_WORDS.test(a.description) ||
    SWEEP_WORDS.test(b.description) ||
    (!!a.reference && a.reference === b.reference)
  );
}

function isCandidate(row: NormalizedImportRow): boolean {
  return (
    row.errors.length === 0 &&
    !row.skipped &&
    amountNumber(row) !== null &&
    !INTEREST_WORDS.test(row.description)
  );
}

function markTransfer(
  row: NormalizedImportRow,
  transfer: ImportTransferInfo,
  skip: boolean,
): void {
  row.type = "transfer";
  row.transfer = transfer;
  if (!row.warnings.includes(transfer.reason)) row.warnings.push(transfer.reason);
  if (skip) {
    row.skipped = true;
    row.skipReason = transfer.kind === "mirrored" ? "internal transfer" : transfer.reason;
  }
}

/**
 * Detect mirrored moves, own-account transfers, reversals and interest.
 * Rows are not re-ordered and the returned array shares row objects with the
 * input (callers pass an already-copied working set).
 */
export function detectInternalTransfers(
  rows: NormalizedImportRow[],
  options: TransferDetectionOptions = {},
): TransferDetectionResult {
  const summary: TransferSummary = {
    mirrored: 0,
    selfTransfers: 0,
    reversals: 0,
    interest: 0,
    skipped: 0,
  };

  const holderNames: string[][] = [];
  for (const name of [
    options.holderName,
    options.businessName,
    ...(options.sections ?? []).map((section) => section.header.accountName),
  ]) {
    if (!name) continue;
    const tokens = canonicalNameTokens(name);
    if (tokens.length >= 2) holderNames.push(tokens);
  }

  // Interest is income, never a sweep. Protect it before mirror pairing.
  for (const row of rows) {
    if (row.errors.length > 0 || row.skipped) continue;
    if (!INTEREST_WORDS.test(row.description)) continue;
    summary.interest += 1;
    row.transfer = { kind: "interest", reason: "interest income" };
    if (!row.warnings.includes("interest income")) row.warnings.push("interest income");
  }

  // Own-account transfers stay visible (the user can switch them to Income),
  // but they are excluded from mirror pairing so a genuine incoming transfer
  // from the holder's own Kuda account is not discarded as a duplicate.
  const selfRows = new Set<number>();
  for (const row of rows) {
    if (row.errors.length > 0 || row.skipped) continue;
    if (row.transfer?.kind === "interest") continue;
    const description = row.description.toLowerCase();
    const ownWording =
      /\bown\s+account\b|\bself\s+transfer\b|\btransfer\s+from\s+(?:my|own)\b/.test(description);
    const transferWording = /\btransfer|\btrf\b|\bremittance\b/.test(description);
    const nameMatches = holderNames.map((tokens) => ({
      tokens,
      matched: descriptionNameMatches(row.description, tokens),
    }));
    const exactHolder = nameMatches.some(({ tokens, matched }) => matched >= tokens.length);
    // Statements often omit a middle name or print only the first/last name.
    // Accept one missing word when a bank/own-account cue is present.
    const bankCue = /bank\b|\bmfb\b|microfinance|\bpsb\b|fintech/i.test(row.description);
    const partialHolder = nameMatches.some(
      ({ tokens, matched }) =>
        tokens.length >= 3 && matched >= Math.max(2, tokens.length - 1),
    );
    if (ownWording || (transferWording && (exactHolder || (partialHolder && bankCue)))) {
      markTransfer(row, { kind: "self", reason: "Transfer (own account)" }, false);
      selfRows.add(row.rowIndex);
      summary.selfTransfers += 1;
    }
  }

  // Reversals/refunds first: the same reference and opposite sign is strong
  // evidence, but transfer wording must not be stolen by this pass. They stay
  // visible as transfers so neither side hits income/expense.
  const reversalCandidates = rows.filter(
    (row) => isCandidate(row) && !selfRows.has(row.rowIndex),
  );
  const reversalUsed = new Set<number>();
  for (let i = 0; i < reversalCandidates.length; i += 1) {
    const first = reversalCandidates[i];
    if (reversalUsed.has(first.rowIndex) || !first.reference) continue;
    const firstAmount = amountNumber(first);
    if (firstAmount === null) continue;
    for (let j = i + 1; j < reversalCandidates.length; j += 1) {
      const second = reversalCandidates[j];
      if (reversalUsed.has(second.rowIndex) || !second.reference) continue;
      if (first.reference !== second.reference) continue;
      if (first.type === second.type) continue;
      if (amountNumber(second) !== firstAmount) continue;
      if (
        !REVERSAL_WORDS.test(first.description) &&
        !REVERSAL_WORDS.test(second.description)
      ) {
        continue;
      }
      reversalUsed.add(first.rowIndex);
      reversalUsed.add(second.rowIndex);
      markTransfer(
        first,
        { kind: "reversal", reason: "reversal/refund of an earlier row" },
        false,
      );
      markTransfer(
        second,
        { kind: "reversal", reason: "reversal/refund of an earlier row" },
        false,
      );
      summary.reversals += 2;
      break;
    }
  }

  // Mirror pairs: same amount, opposite direction, close in time. A
  // reversal/refund pair is deliberately excluded. When the statement has
  // multiple sections, a pair that crosses sections is much stronger evidence
  // than two unrelated rows inside one account.
  const candidates = rows.filter(
    (row) => isCandidate(row) && !selfRows.has(row.rowIndex) && !reversalUsed.has(row.rowIndex),
  );

  interface MirrorPair {
    first: NormalizedImportRow;
    second: NormalizedImportRow;
    score: number;
  }
  const pairs: MirrorPair[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const first = candidates[i];
    const firstAmount = amountNumber(first);
    if (firstAmount === null) continue;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const second = candidates[j];
      if (first.type === second.type) continue;
      if (amountNumber(second) !== firstAmount) continue;
      if (!isCloseInTime(first, second)) continue;

      let score = 0;
      if (
        first.sectionId &&
        second.sectionId &&
        first.sectionId !== second.sectionId
      ) {
        score += 100;
      }
      if (
        SWEEP_WORDS.test(first.description) ||
        SWEEP_WORDS.test(second.description)
      ) {
        score += 20;
      }
      if (first.reference && first.reference === second.reference) score += 10;
      const firstSeconds = timeSeconds(first.time);
      const secondSeconds = timeSeconds(second.time);
      if (firstSeconds !== null && secondSeconds !== null) {
        score -= Math.abs(firstSeconds - secondSeconds) / 60;
      }
      pairs.push({ first, second, score });
    }
  }

  // Best evidence first: cross-section matches, then sweep wording, then the
  // closest timestamps. This prevents an earlier same-section coincidence from
  // consuming a row that should mirror the other section.
  pairs.sort(
    (a, b) =>
      b.score - a.score ||
      a.first.rowIndex - b.first.rowIndex ||
      a.second.rowIndex - b.second.rowIndex,
  );

  const used = new Set<number>();
  for (const pair of pairs) {
    if (used.has(pair.first.rowIndex) || used.has(pair.second.rowIndex)) continue;
    used.add(pair.first.rowIndex);
    used.add(pair.second.rowIndex);
    markTransfer(
      pair.first,
      { kind: "mirrored", reason: "internal transfer (mirrored entry)" },
      true,
    );
    markTransfer(
      pair.second,
      { kind: "mirrored", reason: "internal transfer (mirrored entry)" },
      true,
    );
    summary.mirrored += 2;
    summary.skipped += 2;
  }

  return { rows, summary };
}
