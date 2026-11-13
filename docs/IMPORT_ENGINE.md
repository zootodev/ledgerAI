# Import engine

This document describes LedgerAI's statement-import pipeline, the failure modes
that made real bank statements unreliable, and the layout-agnostic design now
implemented behind `src/lib/import/`.

The guiding rule is simple: **never turn a guess into money.** A row is imported
only when its date, description, amount and direction can be derived from the
file itself. Anything else stays in review or is set aside.

## 1. Current flow

```
upload
  -> parse (CSV / XLSX / PDF)
  -> map columns
  -> normalize
  -> reconcile
  -> categorize
  -> dedupe
  -> preview
  -> commit
```

- **Upload/parse.** CSV is parsed with PapaParse, XLSX with SheetJS, and PDF on
  the server because the PDF toolchain is Node-only. CSV/XLSX are parsed in the
  browser for speed, but the original bytes are always sent to the server on
  commit.
- **Map.** `mapping.ts` detects date, description, amount/debit/credit, balance,
  reference, type and category columns from the header row. The user can correct
  the mapping in the wizard.
- **Normalize.** `normalize.ts` parses dates, amounts, balances and type labels.
  Debit means expense; credit means income. A single signed amount follows the
  accounting convention. Both debit and credit non-zero is ambiguous.
- **Reconcile.** `reconcile.ts` walks the running balance: previous balance plus
  credit minus debit must equal the printed balance. A single-row debit/credit
  mix-up may be corrected from the balance.
- **Categorize.** `categorize.ts` combines learned business rules with the
  deterministic rules engine and returns a suggested category + confidence.
- **Dedupe.** `dedupe.ts` fingerprints rows against the database and inside the
  file.
- **Preview.** `preview.ts` assembles rows, suggestions, duplicate tags and the
  reconciliation summary for review.
- **Commit.** `services/imports.ts` re-parses the original bytes, re-normalizes,
  re-reconciles, re-tags duplicates and re-categorizes. Only valid, selected,
  non-duplicate rows are written. The import ledger and transactions share one
  database transaction.

## 2. Failure modes found

1. **Flat PDF text.** `pdf-parse` returns reading-order text, not a table. OPay
   statements render each cell as a separate text fragment, so the first
   version only found 20 of 50 rows and invented the wrong direction for many
   of them.
2. **Column order by guesswork.** Five bank fingerprints and a few keyword
   pairs cannot cover Money In/Money Out, single Amount + Dr/Cr, Value Date,
   repeated page headers, wrapped descriptions or multiple sections. A guessed
   column order can silently import a balance as a transaction.
3. **Positive single amounts default to income.** Legacy normalization treated
   a positive value in a single amount column as a credit. A bank that prints
   all amounts positive therefore produced wrong income.
4. **No header cross-check.** The parsed rows were never compared with the
   statement's own totals/counts. A partial extraction looked successful.
5. **No transfer semantics.** Sweeps between wallet/savings/OWealth, reversals,
   mirror entries and self-transfers were left as income or expense. That
   inflated both sides of the ledger.
6. **No section model.** A PDF containing a wallet and a savings table was
   flattened into one list, and importing the second section could duplicate
   the first section's moves.
7. **No scanned-PDF message.** Image-only statements fell through to a generic
   "couldn't find transactions" error instead of telling the user to export a
   text PDF or CSV.
8. **Weak category evidence.** Suggestions had a confidence number but no
   reason, and local Nigerian merchants/keywords were missing.

## 3. Layout-agnostic PDF extraction

The new path lives in `parse-pdf-layout.ts` (pure geometry/table logic) and
`parse-pdf.ts` (pdfjs/pdf-parse orchestration).

1. **Text items, not flat text.** PDF pages are read with server-side
   `pdfjs-dist` `getTextContent()`. Every item keeps `x`, `y`, `width` and
   `height`.
2. **Line grouping.** Items on a page are grouped into lines when their baseline
   `y` values are within a small tolerance (derived from the font height).
   Within a line, items are sorted by `x`.
3. **Header detection.** A line is a table header when it scores on date,
   description, debit, credit, amount, balance and reference/channel keywords
   in English and common Nigerian bank wording. Header cells are merged across
   small gaps so `Money` + `In` becomes `Money In`.
4. **Column bands.** Each recognised header anchor gets an x-band. Boundaries
   are the mid-points between adjacent anchors, so an amount is assigned by
   overlap with its band, not by reading order. Bands repeat on every page and
   are carried across headerless continuation pages.
5. **Row start rules.** A row starts when the date band contains a real date.
   Continuation lines are merged into the current row: wrapped descriptions,
   split references, and rows broken by a page break all append to the row
   that is still open.
6. **Direction rules.** Direction is derived only from:
   - an explicit debit/credit (or Dr/Cr) column/marker, or
   - the balance delta (`new balance - previous balance`), or
   - an explicit signed value.
   A positive number in an unlabelled single amount column is **not** assumed
   to be income. If none of the above resolves it, the row carries a review
   error instead of a guessed direction.
7. **Sections.** Each header occurrence starts or continues a statement
   section. A new section title/account identity starts a new section; repeated
   headers for the same account continue the current one. Every raw row carries
   a stable `sectionId`. The first/main section is the default.
8. **Header summaries.** Opening/closing balance, total debit, total credit,
   debit/credit counts and transaction count are read from the statement text
   and attached to the section.
9. **Fallback.** The old `pdf-parse` line/fingerprint heuristics remain. When
   both paths produce rows, the one with more verified rows and fewer
   reconciliation mismatches wins. When neither produces rows and the text
   layer is extremely small, the user sees:
   `This PDF is a scan; export a text PDF or CSV from your bank app`.

## 4. Reconciliation and the review gate

Reconciliation applies to PDF, CSV and XLSX after normalization.

- **Running balance.** Every row with a balance is checked against the previous
  balance plus/minus the row movement, with a ₦0.01 tolerance. A single row
  whose debit/credit side only works when swapped is corrected and flagged
  `side corrected from balance`. A row that still fails marks itself and its
  neighbours as needing review.
- **Header totals/counts.** When the file prints total debit, total credit,
  debit/credit counts or transaction count, parsed values are compared with the
  header. A mismatch produces:
  `Parsed X of Y rows / totals differ by ₦Z. Review before importing`
  and blocks one-click import until the user acknowledges it.
- **Opening + credits - debits = closing.** When an opening and closing balance
  are available, they are checked independently of the row chain.
- **Review card.** The review step shows rows found, parsed totals, header
  totals, balance-chain result and the mismatch amount. The commit service
  re-derives the same checks and rejects an unacknowledged mismatch; the client
  checkbox is never trusted by itself.

## 5. Internal moves

`transfers.ts` runs after reconciliation and before categorization. It works on
normalized rows and never changes an amount.

- **Mirrored entries.** Same amount, opposite direction, within about two
  minutes (or same day with a sweep keyword/reference). Sweep words include
  auto-save, savings, vault, target, OWealth, spend and save, piggy, sweep,
  wallet transfer, internal transfer, withdrawal (transaction payment), and
  reversal. Both sides are set aside as `internal transfer` so one move is not
  imported twice. This also handles a second section that only mirrors the
  first.
- **Self-transfers.** A counterparty matching the statement account-holder or
  profile name, in any word order and ignoring commas/case, becomes
  `Transfer (own account)`. It stays selectable and the review table offers a
  one-tap change to Income.
- **Reversals/refunds.** Same amount and reference with opposite sign become
  transfers, never fresh income.
- **Interest.** Savings interest rows are income and are explicitly excluded
  from sweep pairing.
- **Direction.** Detected transfers are `type: "transfer"`; they never count as
  income or expense. Mirror rows are skipped by default.

## 6. Categorization

The order of authority is:

1. transfer sentinel,
2. the file's own category,
3. a learned business rule,
4. the Nigerian merchant/keyword dictionary,
5. the deterministic rules engine,
6. `Other` / `Other Income`.

The dictionary covers bank charges, airtime/data, utilities, food, transport,
POS/cash, online payments, betting, betting-like wallet services and
person-to-person transfers. Every suggestion carries a confidence and a reason
(`matched "uber"`, `learned rule`, `airtime keyword`), shown on hover in the
review table. Person-to-person transfers are suggested as low-confidence and
can be corrected; the correction becomes a learned merchant rule.

## 7. Synthetic corpus

`src/lib/import/dev/synthetic-statements.ts` is a dev/test-only generator
(paired with `pdf-writer.ts`) for at least these layouts:

- OPay two sections, non-table fragments
- Kuda
- Moniepoint (Money In before Money Out)
- GTBank
- Access
- Zenith
- UBA/First Bank (single amount + Dr/Cr)
- PalmPay
- an unknown odd-column layout

Each fixture declares its expected rows, debit/credit totals and internal-move
count. The corpus includes wrapped descriptions, a row split by a page break,
repeated headers, a scanned/image-only PDF, and CSV/XLSX variants. Tests assert
exact counts, totals, signs, reconciliation and header-mismatch warnings.
No real statement is committed.

## 8. Remaining gaps

- OCR is intentionally not used. Scanned PDFs are rejected with an actionable
  message.
- Header summaries are only as good as the statement's own labels; unusual
  wording falls back to the running-balance chain.
- PDF extraction can only assign an unlabelled single amount a direction when a
  balance delta or explicit marker exists.
- The OPay acceptance file is local-only and is never printed or committed.
