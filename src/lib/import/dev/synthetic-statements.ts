// ============================================================
// LedgerAI — synthetic statement corpus
// ------------------------------------------------------------
// A DEVELOPMENT/TEST-ONLY generator for statement layouts. It never reads a
// real statement and every name/account below is fictional. The corpus exists
// so the import engine can be checked against many bank shapes without
// committing customer data.
//
// Layouts cover: OPay-style two sections (wallet + savings), Kuda, Moniepoint
// money-in-first, GTBank, Access, Zenith, UBA/First Bank single-amount Dr/Cr,
// PalmPay, and one deliberately odd column order.
// ============================================================

import * as XLSX from "xlsx";
import type { ColumnMapping, ImportFileFormat } from "../types";
import { buildSyntheticPdf, type PdfTextRun } from "./pdf-writer";

export type SyntheticField =
  | "date"
  | "time"
  | "description"
  | "reference"
  | "debit"
  | "credit"
  | "amount"
  | "balance"
  | "type";

export interface SyntheticColumn {
  field: SyntheticField;
  header: string;
  x: number;
  align?: "left" | "right";
}

export interface SyntheticRowInput {
  date: string;
  time?: string;
  description: string;
  reference?: string;
  debit?: number;
  credit?: number;
  /** Absolute amount; direction comes from `marker` or the sign. */
  amount?: number;
  marker?: "Dr" | "Cr";
  /** Wrapped description line printed under the main row. */
  continuation?: string;
  /** Split reference line printed under the main row. */
  referenceContinuation?: string;
  /** Start a new page after the main line, before the continuation. */
  breakBeforeContinuation?: boolean;
  /** Expected internal-transfer classification (used by tests). */
  tag?: "internal" | "self" | "interest" | "reversal";
}

export interface SyntheticRow extends SyntheticRowInput {
  /** Running balance after this row (computed). */
  balanceValue: number;
}

export interface SyntheticSectionInput {
  title?: string;
  accountName: string;
  accountNumber: string;
  openingBalance: number;
  rows: SyntheticRowInput[];
  /** Deliberately wrong printed totals, for the acknowledgement gate. */
  headerTotalsOverride?: {
    totalDebit?: number;
    totalCredit?: number;
    transactionCount?: number;
  };
}

export interface SyntheticSection {
  title?: string;
  accountName: string;
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  debitCount: number;
  creditCount: number;
  rows: SyntheticRow[];
  expected: {
    rows: number;
    debits: number;
    credits: number;
    debitCount: number;
    creditCount: number;
    openingBalance: number;
    closingBalance: number;
    internalRows: number;
    selfRows: number;
    reversalRows: number;
    interestRows: number;
  };
  headerTotalsOverride?: SyntheticSectionInput["headerTotalsOverride"];
}

export interface SyntheticLayout {
  id: string;
  name: string;
  columns: SyntheticColumn[];
  sections: SyntheticSection[];
  statementPeriod: string;
  rowsPerPage?: number;
  /** A scanned PDF has no text layer and must produce the scan message. */
  scanned?: boolean;
  /** Extra cover/letterhead pages shown before the tables. */
  introPage?: string[];
  /** Print identity labels and values on separate baselines. */
  splitIdentity?: boolean;
  /** Print summary labels and values on separate baselines. */
  splitSummary?: boolean;
  /** Put the summary block before the first table header, as OPay does. */
  summaryBeforeTable?: boolean;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** CSV/XLSX dates must be unambiguous; PDF keeps the bank-style display date. */
function isoDate(display: string): string {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(display.trim());
  if (!match) return display;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(match[2].toLowerCase()) + 1;
  if (month === 0) return display;
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function movementOf(row: SyntheticRowInput): number {
  if (row.marker) {
    return row.marker === "Dr" ? -(row.amount ?? 0) : row.amount ?? 0;
  }
  if (row.debit !== undefined) return -row.debit;
  if (row.credit !== undefined) return row.credit;
  return row.amount ?? 0;
}

function buildSection(input: SyntheticSectionInput): SyntheticSection {
  let running = roundMoney(input.openingBalance);
  let totalDebit = 0;
  let totalCredit = 0;
  let debitCount = 0;
  let creditCount = 0;
  let internalRows = 0;
  let selfRows = 0;
  let reversalRows = 0;
  let interestRows = 0;

  const rows = input.rows.map((row) => {
    const movement = movementOf(row);
    running = roundMoney(running + movement);
    if (movement < 0) {
      totalDebit = roundMoney(totalDebit + Math.abs(movement));
      debitCount += 1;
    } else if (movement > 0) {
      totalCredit = roundMoney(totalCredit + movement);
      creditCount += 1;
    }
    if (row.tag === "internal") internalRows += 1;
    if (row.tag === "self") selfRows += 1;
    if (row.tag === "reversal") reversalRows += 1;
    if (row.tag === "interest") interestRows += 1;
    return { ...row, balanceValue: running };
  });

  return {
    title: input.title,
    accountName: input.accountName,
    accountNumber: input.accountNumber,
    openingBalance: roundMoney(input.openingBalance),
    closingBalance: roundMoney(running),
    totalDebit,
    totalCredit,
    debitCount,
    creditCount,
    rows,
    expected: {
      rows: rows.length,
      debits: totalDebit,
      credits: totalCredit,
      debitCount,
      creditCount,
      openingBalance: roundMoney(input.openingBalance),
      closingBalance: roundMoney(running),
      internalRows,
      selfRows,
      reversalRows,
      interestRows,
    },
    headerTotalsOverride: input.headerTotalsOverride,
  };
}

function columns(pairs: [SyntheticField, string, number, ("left" | "right")?][]): SyntheticColumn[] {
  return pairs.map(([field, header, x, align]) => ({ field, header, x, align }));
}

const SINGLE_AMOUNT_COLUMNS = columns([
  ["date", "Date", 30],
  ["description", "Narration", 110],
  ["reference", "Ref", 330],
  ["type", "Dr/Cr", 420],
  ["amount", "Amount", 470, "right"],
  ["balance", "Balance", 570, "right"],
]);

const OPWALLET_COLUMNS = columns([
  ["date", "Date", 30],
  ["time", "Time", 92],
  ["description", "Description", 130],
  ["reference", "Reference", 330],
  ["debit", "Money Out", 430, "right"],
  ["credit", "Money In", 510, "right"],
  ["balance", "Balance", 600, "right"],
]);

const KUDA_COLUMNS = columns([
  ["date", "Value Date", 30],
  ["time", "Time", 100],
  ["description", "Narration", 140],
  ["reference", "Ref", 340],
  ["debit", "Debit", 430, "right"],
  ["credit", "Credit", 510, "right"],
  ["balance", "Running Bal", 600, "right"],
]);

const MONIEPOINT_COLUMNS = columns([
  ["date", "Date", 30],
  ["time", "Time", 92],
  ["description", "Details", 130],
  ["reference", "Reference", 330],
  ["credit", "Money In", 430, "right"],
  ["debit", "Money Out", 510, "right"],
  ["balance", "Balance", 600, "right"],
]);

const GTBANK_COLUMNS = columns([
  ["date", "Value Date", 30],
  ["description", "Narration", 120],
  ["reference", "Reference", 330],
  ["debit", "Withdrawal", 430, "right"],
  ["credit", "Deposit", 510, "right"],
  ["balance", "Balance", 600, "right"],
]);

const ODD_COLUMNS = columns([
  ["date", "Posting Date", 30],
  ["description", "Narration", 120],
  ["reference", "Channel", 330],
  ["balance", "Running Bal", 420, "right"],
  ["amount", "Amount", 515, "right"],
  ["type", "Dr/Cr", 600],
]);

const PALMPAY_COLUMNS = columns([
  ["date", "Date", 30],
  ["time", "Time", 92],
  ["description", "Description", 130],
  ["reference", "Transaction Ref", 330],
  ["debit", "Debit", 430, "right"],
  ["credit", "Credit", 510, "right"],
  ["balance", "Balance", 600, "right"],
]);

function layout(
  id: string,
  name: string,
  columnSet: SyntheticColumn[],
  sections: SyntheticSectionInput[],
  extra: Partial<SyntheticLayout> = {},
): SyntheticLayout {
  return {
    id,
    name,
    columns: columnSet,
    sections: sections.map(buildSection),
    statementPeriod: "01 Nov 2026 to 30 Nov 2026",
    rowsPerPage: 10,
    ...extra,
  };
}

function opayRealisticLayout(): SyntheticLayout {
  const walletRows: SyntheticRowInput[] = [];
  const savingsRows: SyntheticRowInput[] = [];

  const internalCredits = [
    900, 700, 9000, 1000, 500, 1500, 1020, 800, 1500, 700, 700, 200, 1000,
    700, 1000, 13300, 50, 2000,
  ];
  internalCredits.forEach((amount, index) => {
    const day = String((index % 9) + 1).padStart(2, "0");
    const time = `${String(8 + Math.floor(index / 6)).padStart(2, "0")}:${String((index % 6) * 7).padStart(2, "0")}:00`;
    const reference = `SWP-C-${index + 1}`;
    walletRows.push({
      date: `${day} Nov 2026`,
      time,
      description: "Transfer from savings wallet",
      reference,
      credit: amount,
      tag: "internal",
    });
    savingsRows.push({
      date: `${day} Nov 2026`,
      time,
      description: "Transfer to wallet",
      reference,
      debit: amount,
      tag: "internal",
    });
  });

  const internalDebits = [10000, 6737, 14950, 1950, 1000, 1000];
  internalDebits.forEach((amount, index) => {
    const day = String((index % 5) + 2).padStart(2, "0");
    const time = `${String(10 + index).padStart(2, "0")}:15:00`;
    const reference = `SWP-D-${index + 1}`;
    walletRows.push({
      date: `${day} Nov 2026`,
      time,
      description: "Transfer to savings wallet",
      reference,
      debit: amount,
      tag: "internal",
    });
    savingsRows.push({
      date: `${day} Nov 2026`,
      time,
      description: "Transfer from wallet",
      reference,
      credit: amount,
      tag: "internal",
    });
  });

  const realDebits: Array<[number, string, string, string]> = [
    [1500, "10 Nov 2026", "12:00:00", "REV-1500"],
    [900, "01 Nov 2026", "09:13:00", "RD-01"],
    [700, "01 Nov 2026", "10:17:00", "RD-02"],
    [10000, "08 Nov 2026", "11:19:00", "RD-03"],
    [1000, "02 Nov 2026", "12:23:00", "RD-04"],
    [500, "02 Nov 2026", "13:29:00", "RD-05"],
    [500, "03 Nov 2026", "14:31:00", "RD-06"],
    [1020, "03 Nov 2026", "15:37:00", "RD-07"],
    [800, "04 Nov 2026", "16:41:00", "RD-08"],
    [700, "04 Nov 2026", "17:43:00", "RD-09"],
    [700, "05 Nov 2026", "08:47:00", "RD-10"],
    [200, "05 Nov 2026", "09:53:00", "RD-11"],
    [1000, "06 Nov 2026", "10:59:00", "RD-12"],
    [700, "06 Nov 2026", "11:01:00", "RD-13"],
    [1000, "07 Nov 2026", "12:07:00", "RD-14"],
    [500, "07 Nov 2026", "13:11:00", "RD-15"],
    [13300, "08 Nov 2026", "14:13:00", "RD-16"],
    [50, "09 Nov 2026", "15:17:00", "RD-17"],
    [10000, "08 Nov 2026", "16:19:00", "RD-18"],
    [50, "09 Nov 2026", "17:23:00", "RD-19"],
    [2000, "09 Nov 2026", "18:29:00", "RD-20"],
  ];
  for (const [amount, date, time, reference] of realDebits) {
    const reversal = reference === "REV-1500";
    walletRows.push({
      date,
      time,
      description: reversal ? "POS purchase pending" : "POS purchase at market",
      reference,
      debit: amount,
      tag: reversal ? "reversal" : undefined,
    });
  }

  const realCredits: Array<[number, string, string, string, string, boolean]> = [
    [1500, "10 Nov 2026", "12:03:00", "REV-1500", "Reversal of POS purchase", true],
    [10000, "09 Nov 2026", "09:00:00", "RC-01", "Incoming transfer from customer", false],
    [14950, "05 Nov 2026", "10:00:00", "RC-02", "Transfer from KUDA MFB - ADA OKAFOR", false],
    [12000, "07 Nov 2026", "11:00:00", "RC-03", "Loan disbursement", false],
    [6737, "06 Nov 2026", "12:00:00", "RC-04", "Transfer from GTBank - ADA OKAFOR", false],
  ];
  for (const [amount, date, time, reference, description, reversal] of realCredits) {
    walletRows.push({
      date,
      time,
      description,
      reference,
      credit: amount,
      tag: reversal ? "reversal" : /ADA OKAFOR/.test(description) ? "self" : undefined,
    });
  }

  const interestAmounts = [0.51, 0.51, 0.12, 0.12, 0.24, 0.09, 0.09, 0.2, 0.2, 0.18];
  interestAmounts.forEach((amount, index) => {
    savingsRows.push({
      date: `${String(index + 1).padStart(2, "0")} Nov 2026`,
      time: "23:00:00",
      description: "Savings interest",
      reference: `INT-${index + 1}`,
      credit: amount,
      tag: "interest",
    });
  });

  const order = (a: SyntheticRowInput, b: SyntheticRowInput) =>
    new Date(`${a.date} ${a.time ?? "00:00:00"}`).getTime() -
    new Date(`${b.date} ${b.time ?? "00:00:00"}`).getTime();
  walletRows.sort(order);
  savingsRows.sort(order);

  return layout(
    "opay-realistic",
    "OPay-style realistic wallet + savings (cover page, split headers, 50 + 34 rows)",
    OPWALLET_COLUMNS,
    [
      {
        title: "Wallet Account",
        accountName: "ADA CHINWE OKAFOR",
        accountNumber: "1234567890",
        openingBalance: 1000,
        rows: walletRows,
      },
      {
        title: "Savings Account",
        accountName: "ADA CHINWE OKAFOR",
        accountNumber: "1234567890",
        openingBalance: 1490.05,
        rows: savingsRows,
      },
    ],
    {
      rowsPerPage: 12,
      introPage: [
        "OPay Statement",
        "Statement Period: 01 Nov 2026 to 10 Nov 2026",
        "This cover page intentionally contains no transactions.",
      ],
      splitIdentity: true,
      splitSummary: true,
      summaryBeforeTable: true,
    },
  );
}

export const SYNTHETIC_LAYOUTS: SyntheticLayout[] = [
  opayRealisticLayout(),
  layout(
    "kuda",
    "Kuda",
    KUDA_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "2001234567",
        openingBalance: 25000,
        rows: [
          {
            date: "01 Nov 2026",
            time: "08:00",
            description: "Uber trip",
            reference: "KD-1001",
            debit: 3200,
          },
          {
            date: "02 Nov 2026",
            time: "09:00",
            description: "Salary payment",
            reference: "KD-1002",
            credit: 150000,
          },
          {
            date: "03 Nov 2026",
            time: "10:00",
            description: "Netflix subscription",
            reference: "KD-1003",
            debit: 4400,
          },
          {
            date: "04 Nov 2026",
            time: "11:00",
            description: "Transfer from KUDA - ADA OKAFOR",
            reference: "KD-1004",
            credit: 10000,
            tag: "self",
          },
          {
            date: "05 Nov 2026",
            time: "12:00",
            description: "Bet9ja wallet funding",
            reference: "KD-1005",
            debit: 2000,
          },
          {
            date: "06 Nov 2026",
            time: "13:00",
            description: "Interest earned",
            reference: "KD-1006",
            credit: 25.5,
            tag: "interest",
          },
        ],
      },
    ],
  ),
  layout(
    "moniepoint-money-in-first",
    "Moniepoint (Money In before Money Out)",
    MONIEPOINT_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR ENTERPRISE",
        accountNumber: "3012345678",
        openingBalance: 10000,
        rows: [
          {
            date: "01 Nov 2026",
            time: "08:00",
            description: "POS settlement",
            reference: "MP-1001",
            credit: 25000,
          },
          {
            date: "02 Nov 2026",
            time: "09:00",
            description: "Transfer to supplier",
            reference: "MP-1002",
            debit: 12000,
          },
          {
            date: "03 Nov 2026",
            time: "10:00",
            description: "Customer transfer",
            reference: "MP-1003",
            credit: 8000,
          },
          {
            date: "04 Nov 2026",
            time: "11:00",
            description: "Bank charge",
            reference: "MP-1004",
            debit: 100,
          },
          {
            date: "05 Nov 2026",
            time: "12:00",
            description: "Transfer to OWealth savings",
            reference: "MP-1005",
            debit: 5000,
          },
          {
            date: "06 Nov 2026",
            time: "13:00",
            description: "Interest credit",
            reference: "MP-1006",
            credit: 12.75,
            tag: "interest",
          },
        ],
      },
    ],
  ),
  layout(
    "gtbank",
    "GTBank (wrapped description + page split)",
    GTBANK_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "0123456789",
        openingBalance: 50000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "POS PURCHASE CHICKEN REPUBLIC",
            reference: "GT-1001",
            debit: 8500,
            continuation: "LEKKI PHASE 1 LAGOS",
            referenceContinuation: "GT-1001-A",
            breakBeforeContinuation: true,
          },
          {
            date: "02 Nov 2026",
            description: "SALARY PAYMENT",
            reference: "GT-1002",
            credit: 200000,
          },
          {
            date: "03 Nov 2026",
            description: "TRANSFER TO SAVINGS",
            reference: "GT-1003",
            debit: 25000,
          },
          {
            date: "04 Nov 2026",
            description: "DSTV SUBSCRIPTION",
            reference: "GT-1004",
            debit: 12500,
          },
          {
            date: "05 Nov 2026",
            description: "REFUND FROM MERCHANT",
            reference: "GT-1005",
            credit: 2000,
          },
        ],
      },
    ],
    { rowsPerPage: 3 },
  ),
  layout(
    "access",
    "Access Bank",
    columns([
      ["date", "Date", 30],
      ["description", "Details", 110],
      ["reference", "Ref", 330],
      ["debit", "Debit", 430, "right"],
      ["credit", "Credit", 510, "right"],
      ["balance", "Balance", 600, "right"],
    ]),
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "0441234567",
        openingBalance: 100000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "ATM WITHDRAWAL",
            reference: "AC-1001",
            debit: 20000,
          },
          {
            date: "02 Nov 2026",
            description: "TRANSFER FROM FRIEND",
            reference: "AC-1002",
            credit: 15000,
          },
          {
            date: "03 Nov 2026",
            description: "MTN AIRTIME",
            reference: "AC-1003",
            debit: 1000,
          },
          {
            date: "04 Nov 2026",
            description: "TRANSFER TO SAVINGS",
            reference: "AC-1004",
            debit: 5000,
          },
          {
            date: "05 Nov 2026",
            description: "SMS ALERT CHARGE",
            reference: "AC-1005",
            debit: 50,
          },
        ],
      },
    ],
  ),
  layout(
    "zenith",
    "Zenith Bank",
    columns([
      ["date", "Trans Date", 30],
      ["description", "Narration", 110],
      ["reference", "Ref", 330],
      ["debit", "Debit", 430, "right"],
      ["credit", "Credit", 510, "right"],
      ["balance", "Balance", 600, "right"],
    ]),
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "5071234567",
        openingBalance: 12000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "POS PURCHASE SHOPRITE",
            reference: "ZN-1001",
            debit: 9500,
          },
          {
            date: "02 Nov 2026",
            description: "INWARD TRANSFER",
            reference: "ZN-1002",
            credit: 30000,
          },
          {
            date: "03 Nov 2026",
            description: "ELECTRICITY TOKEN",
            reference: "ZN-1003",
            debit: 7500,
          },
          {
            date: "04 Nov 2026",
            description: "BANK CHARGE",
            reference: "ZN-1004",
            debit: 100,
          },
          {
            date: "05 Nov 2026",
            description: "REFUND",
            reference: "ZN-1005",
            credit: 1250,
          },
        ],
      },
    ],
  ),
  layout(
    "uba-first-single-amount",
    "UBA / First Bank single amount with Dr/Cr",
    SINGLE_AMOUNT_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "1012345678",
        openingBalance: 15000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "TRANSFER TO JOHN DOE",
            reference: "UB-1001",
            amount: 5000,
            marker: "Dr",
          },
          {
            date: "02 Nov 2026",
            description: "TRANSFER FROM JOHN DOE",
            reference: "UB-1002",
            amount: 8000,
            marker: "Cr",
          },
          {
            date: "03 Nov 2026",
            description: "POS WITHDRAWAL",
            reference: "UB-1003",
            amount: 3000,
            marker: "Dr",
          },
          {
            date: "04 Nov 2026",
            description: "LOAN REPAYMENT",
            reference: "UB-1004",
            amount: 2500,
            marker: "Dr",
          },
          {
            date: "05 Nov 2026",
            description: "INTEREST CREDIT",
            reference: "UB-1005",
            amount: 15,
            marker: "Cr",
            tag: "interest",
          },
        ],
      },
    ],
  ),
  layout(
    "palmpay",
    "PalmPay",
    PALMPAY_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "8112345678",
        openingBalance: 3000,
        rows: [
          {
            date: "01 Nov 2026",
            time: "08:00",
            description: "Airtime purchase MTN",
            reference: "PP-1001",
            debit: 1000,
          },
          {
            date: "02 Nov 2026",
            time: "09:00",
            description: "Transfer from bank",
            reference: "PP-1002",
            credit: 12000,
          },
          {
            date: "03 Nov 2026",
            time: "10:00",
            description: "POS withdrawal",
            reference: "PP-1003",
            debit: 4000,
          },
          {
            date: "04 Nov 2026",
            time: "11:00",
            description: "Data bundle",
            reference: "PP-1004",
            debit: 1500,
          },
          {
            date: "05 Nov 2026",
            time: "12:00",
            description: "Transfer to wallet",
            reference: "PP-1005",
            debit: 2000,
          },
          {
            date: "06 Nov 2026",
            time: "13:00",
            description: "Cashback reward",
            reference: "PP-1006",
            credit: 75,
          },
        ],
      },
    ],
  ),
  layout(
    "odd-columns",
    "Unknown bank with odd column order",
    ODD_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "9091234567",
        openingBalance: 7000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "TRANSFER TO SUPPLIER",
            reference: "ODD-1001",
            amount: 2500,
            marker: "Dr",
          },
          {
            date: "02 Nov 2026",
            description: "INCOMING PAYMENT",
            reference: "ODD-1002",
            amount: 5000,
            marker: "Cr",
          },
          {
            date: "03 Nov 2026",
            description: "POS CHARGE",
            reference: "ODD-1003",
            amount: 200,
            marker: "Dr",
          },
          {
            date: "04 Nov 2026",
            description: "REFUND",
            reference: "ODD-1004",
            amount: 500,
            marker: "Cr",
          },
        ],
      },
    ],
  ),
  layout(
    "zero-closing",
    "Account drawn down to exactly zero",
    GTBANK_COLUMNS,
    [
      {
        accountName: "ADA OKAFOR",
        accountNumber: "9090000001",
        openingBalance: 5000,
        rows: [
          {
            date: "01 Nov 2026",
            description: "FULL WITHDRAWAL",
            reference: "ZC-1001",
            debit: 5000,
          },
        ],
      },
    ],
  ),
];

/** A layout whose printed totals disagree with its rows (gate fixture). */
export const HEADER_MISMATCH_LAYOUT: SyntheticLayout = layout(
  "header-mismatch",
  "Header totals disagree with rows",
  GTBANK_COLUMNS,
  [
    {
      accountName: "ADA OKAFOR",
      accountNumber: "0123456789",
      openingBalance: 10000,
      headerTotalsOverride: {
        totalDebit: 50000,
        totalCredit: 80000,
        transactionCount: 99,
      },
      rows: [
        {
          date: "01 Nov 2026",
          description: "POS PURCHASE",
          reference: "HM-1001",
          debit: 2000,
        },
        {
          date: "02 Nov 2026",
          description: "TRANSFER FROM FRIEND",
          reference: "HM-1002",
          credit: 5000,
        },
      ],
    },
  ],
);

export function findLayout(id: string): SyntheticLayout {
  const found =
    id === HEADER_MISMATCH_LAYOUT.id
      ? HEADER_MISMATCH_LAYOUT
      : SYNTHETIC_LAYOUTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown synthetic layout: ${id}`);
  return found;
}

function headerRuns(layout: SyntheticLayout, y: number): PdfTextRun[] {
  return layout.columns.map((column) => ({
    text: column.header,
    x: column.x,
    y,
    size: 8,
  }));
}

function metadataRuns(
  section: SyntheticSection,
  layout: SyntheticLayout,
  y: number,
): { runs: PdfTextRun[]; nextY: number } {
  const runs: PdfTextRun[] = [];
  if (layout.splitIdentity) {
    runs.push(
      { text: "Account Name", x: 30, y },
      { text: "Account Number", x: 230, y },
      { text: section.accountName, x: 30, y: y + 10 },
      { text: section.accountNumber, x: 230, y: y + 10 },
      { text: `Statement period: ${layout.statementPeriod}`, x: 30, y: y + 24 },
    );
    return { runs, nextY: y + 36 };
  }
  runs.push(
    { text: `Account name: ${section.accountName}`, x: 30, y },
    { text: `Account number: ${section.accountNumber}`, x: 30, y: y + 12 },
    { text: `Statement period: ${layout.statementPeriod}`, x: 30, y: y + 24 },
  );
  return { runs, nextY: y + 36 };
}

function rowRuns(row: SyntheticRow, layout: SyntheticLayout, y: number): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  for (const column of layout.columns) {
    let text: string | null = null;
    switch (column.field) {
      case "date":
        text = row.date;
        break;
      case "time":
        text = row.time ?? "";
        break;
      case "description":
        text = row.description;
        break;
      case "reference":
        text = row.reference ?? "";
        break;
      case "debit":
        text = row.debit !== undefined ? money(row.debit) : "";
        break;
      case "credit":
        text = row.credit !== undefined ? money(row.credit) : "";
        break;
      case "amount":
        if (row.amount !== undefined) {
          const signed = row.marker ? row.amount : movementOf(row);
          text = signed < 0 ? `-${money(Math.abs(signed))}` : money(signed);
        }
        break;
      case "balance":
        text = money(row.balanceValue);
        break;
      case "type":
        text = row.marker ?? "";
        break;
    }
    if (text === null || text === "") continue;
    const columnWidth = Math.max(4, column.field === "description" ? 7 : 5.5);
    const textWidth = text.length * columnWidth;
    const x =
      column.align === "right" ? Math.max(column.x, column.x + 45 - textWidth) : column.x;
    runs.push({ text, x, y });
  }
  return runs;
}

function summaryRuns(
  section: SyntheticSection,
  layout: SyntheticLayout,
  y: number,
): PdfTextRun[] {
  const totals = section.headerTotalsOverride ?? {};
  const totalDebit = money(totals.totalDebit ?? section.totalDebit);
  const totalCredit = money(totals.totalCredit ?? section.totalCredit);
  const transactionCount = totals.transactionCount ?? section.rows.length;

  if (layout.splitSummary) {
    return [
      { text: "Opening Balance", x: 30, y },
      { text: "Total Debit", x: 220, y },
      { text: "Debit Count", x: 400, y },
      { text: `NGN ${money(section.openingBalance)}`, x: 30, y: y + 10 },
      { text: `NGN ${totalDebit}`, x: 220, y: y + 10 },
      { text: String(section.debitCount), x: 400, y: y + 10 },
      { text: "Closing Balance", x: 30, y: y + 24 },
      { text: "Total Credit", x: 220, y: y + 24 },
      { text: "Credit Count", x: 400, y: y + 24 },
      { text: `NGN ${money(section.closingBalance)}`, x: 30, y: y + 34 },
      { text: `NGN ${totalCredit}`, x: 220, y: y + 34 },
      { text: String(section.creditCount), x: 400, y: y + 34 },
      { text: `Total transactions: ${transactionCount}`, x: 30, y: y + 48 },
    ];
  }

  return [
    { text: `Closing balance: ${money(section.closingBalance)}`, x: 30, y },
    { text: `Total debits: ${totalDebit}`, x: 30, y: y + 12 },
    { text: `Total credits: ${totalCredit}`, x: 30, y: y + 24 },
    { text: `Total transactions: ${transactionCount}`, x: 30, y: y + 36 },
  ];
}

function paginateSection(section: SyntheticSection, layout: SyntheticLayout): PdfTextRun[][] {
  const pages: PdfTextRun[][] = [];
  let page: PdfTextRun[] = [];
  let y = 40;

  const flush = () => {
    if (page.length > 0) pages.push(page);
    page = [];
  };

  const startPage = (repeatIdentity: boolean) => {
    flush();
    y = 40;
    if (repeatIdentity) {
      const meta = metadataRuns(section, layout, y);
      page.push(...meta.runs);
      y = meta.nextY;
      page.push(...headerRuns(layout, y));
      y += 14;
    }
  };

  if (layout.summaryBeforeTable) {
    page.push(...summaryRuns(section, layout, y));
    y += layout.splitSummary ? 60 : 48;
  }
  if (section.title) {
    page.push({ text: section.title, x: 30, y, size: 12 });
    y += 20;
  }
  const meta = metadataRuns(section, layout, y);
  page.push(...meta.runs);
  y = meta.nextY;
  page.push(...headerRuns(layout, y));
  y += 14;
  if (!layout.summaryBeforeTable) {
    page.push({ text: `Opening balance: ${money(section.openingBalance)}`, x: 30, y });
    y += 14;
  }

  let rowsOnPage = 0;
  for (const row of section.rows) {
    page.push(...rowRuns(row, layout, y));
    y += 12;
    rowsOnPage += 1;

    if (row.continuation || row.referenceContinuation) {
      if (row.breakBeforeContinuation) {
        startPage(true);
        rowsOnPage = 0;
      }
      const continuationRuns: PdfTextRun[] = [];
      if (row.continuation) {
        continuationRuns.push({ text: row.continuation, x: 130, y });
      }
      if (row.referenceContinuation) {
        continuationRuns.push({ text: row.referenceContinuation, x: 330, y });
      }
      page.push(...continuationRuns);
      y += 12;
    }

    if (rowsOnPage >= (layout.rowsPerPage ?? 10)) {
      startPage(true);
      rowsOnPage = 0;
    }
  }

  if (!layout.summaryBeforeTable) {
    page.push(...summaryRuns(section, layout, y));
  }
  flush();
  return pages;
}

/** Render a synthesized statement as a text PDF. */
export function statementPdf(layout: SyntheticLayout): Uint8Array {
  if (layout.scanned) {
    // A page with no text runs: the parser must return the scan message.
    return buildSyntheticPdf([[]]);
  }
  const pages: PdfTextRun[][] = [];
  if (layout.introPage && layout.introPage.length > 0) {
    pages.push(
      layout.introPage.map((text, index) => ({
        text,
        x: 40,
        y: 90 + index * 22,
        size: index === 0 ? 16 : 10,
      })),
    );
  }
  for (const section of layout.sections) {
    const sectionPages = paginateSection(section, layout);
    pages.push(...sectionPages);
  }
  return buildSyntheticPdf(pages);
}

/** A blank, image-only-style PDF with no text layer. */
export function scannedStatementPdf(): Uint8Array {
  return buildSyntheticPdf([[]]);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function pdfMappingFor(): ColumnMapping {
  // The PDF extractor always emits the same synthetic headers, regardless of
  // the bank's printed header wording.
  return {
    date: "Date",
    description: "Description",
    reference: "Reference",
    debit: "Debit",
    credit: "Credit",
    balance: "Balance",
  };
}

export function mappingFor(layout: SyntheticLayout): ColumnMapping {
  const fields = new Set(layout.columns.map((column) => column.field));
  const mapping: ColumnMapping = {
    date: "Date",
    description: "Description",
  };
  if (fields.has("reference")) mapping.reference = "Reference";
  if (fields.has("balance")) mapping.balance = "Balance";
  if (fields.has("type")) mapping.type = "Type";
  if (fields.has("debit") && fields.has("credit")) {
    mapping.debit = "Debit";
    mapping.credit = "Credit";
  } else {
    mapping.amount = "Amount";
  }
  return mapping;
}

export function statementTable(layout: SyntheticLayout): string[][] {
  const section = layout.sections[0];
  const fields = new Set(layout.columns.map((column) => column.field));
  const headers = ["Date", "Description", "Reference"];
  if (fields.has("time")) headers.push("Time");
  if (fields.has("debit") || fields.has("credit")) {
    headers.push("Debit", "Credit");
  } else {
    headers.push("Amount");
  }
  if (fields.has("balance")) headers.push("Balance");
  if (fields.has("type")) headers.push("Type");

  const rows: string[][] = [headers];
  for (const row of section.rows) {
    const values = [isoDate(row.date), row.description, row.reference ?? ""];
    if (fields.has("time")) values.push(row.time ?? "");
    if (fields.has("debit") || fields.has("credit")) {
      values.push(
        row.debit !== undefined ? money(row.debit) : "",
        row.credit !== undefined ? money(row.credit) : "",
      );
    } else {
      const signed = movementOf(row);
      values.push(signed.toFixed(2));
    }
    if (fields.has("balance")) values.push(money(row.balanceValue));
    if (fields.has("type")) values.push(row.marker ?? "");
    rows.push(values);
  }
  // Summary lines are non-transactions; the preview sets them aside and
  // uses their figures for header reconciliation.
  rows.push(["", `Opening balance: ${money(section.openingBalance)}`, ""]);
  rows.push(["", `Closing balance: ${money(section.closingBalance)}`, ""]);
  const totals = section.headerTotalsOverride ?? {};
  rows.push(["", `Total debits: ${money(totals.totalDebit ?? section.totalDebit)}`, ""]);
  rows.push(["", `Total credits: ${money(totals.totalCredit ?? section.totalCredit)}`, ""]);
  rows.push([
    "",
    `Total transactions: ${totals.transactionCount ?? section.rows.length}`,
    "",
  ]);
  return rows;
}

export function statementCsv(layout: SyntheticLayout): string {
  return statementTable(layout)
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
}

export function statementXlsx(layout: SyntheticLayout): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(statementTable(layout));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Statement");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function formatForFileType(layout: SyntheticLayout, fileType: ImportFileFormat): Uint8Array | ArrayBuffer {
  if (fileType === "pdf") return statementPdf(layout);
  if (fileType === "xlsx") return statementXlsx(layout);
  return new TextEncoder().encode(statementCsv(layout));
}
