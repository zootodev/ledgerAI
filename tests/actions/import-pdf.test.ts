import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/services/auth-context", () => ({
  requireAuthContext: vi.fn(),
}));

const rateLimitMocks = vi.hoisted(() => ({
  consumeConfiguredLimit: vi.fn(async () => ({
    ok: true,
    remaining: 10,
    retryAfterSeconds: 0,
  })),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  ...rateLimitMocks,
  RATE_LIMIT_EXCEEDED_MESSAGE:
    "Too many requests. Please slow down and try again shortly.",
}));

vi.mock("@/lib/import/parse-pdf", () => ({
  PDF_IMPORT_HEADERS: ["Date", "Description", "Debit", "Credit"],
  parsePdf: vi.fn(),
}));

import { requireAuthContext } from "@/lib/services/auth-context";
import { consumeConfiguredLimit } from "@/lib/security/rate-limit";
import { parsePdf } from "@/lib/import/parse-pdf";
import { parsePdfImportAction } from "@/lib/actions/imports";
import { PDF_IMPORT_HEADERS } from "@/lib/import/parse-pdf";
import { MAX_IMPORT_FILE_BYTES, type RawImportRow } from "@/lib/import/types";

function pdfFile(name = "statement.pdf", bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

function fileForm(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set("file", file);
  return fd;
}

const SAMPLE_ROWS: RawImportRow[] = [
  {
    sourceRow: 2,
    values: {
      Date: "2026-01-05",
      Description: "POS SHOP",
      Debit: "1,250.00",
      Credit: "",
    },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
    ok: true,
    remaining: 10,
    retryAfterSeconds: 0,
  });
  vi.mocked(requireAuthContext).mockResolvedValue({
    user: { id: "auth-user-a", email: "a@example.com" },
    business: { id: "biz-a", name: "A Ltd", currency: "NGN" },
    prisma: {} as never,
  });
  vi.mocked(parsePdf).mockResolvedValue({
    headers: [...PDF_IMPORT_HEADERS],
    rows: SAMPLE_ROWS,
  });
});

describe("parsePdfImportAction", () => {
  it("returns an error when no file is provided", async () => {
    const result = await parsePdfImportAction(fileForm(null));
    expect(result.error).toBe("No file was provided.");
    expect(result.ok).toBeUndefined();
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("rejects files that are not PDFs", async () => {
    const result = await parsePdfImportAction(fileForm(pdfFile("statement.csv")));
    expect(result.error).toBe("This action only accepts PDF files.");
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("rejects oversized files before touching auth or parsing", async () => {
    const big = new File(
      [new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)],
      "big.pdf",
      { type: "application/pdf" },
    );
    const result = await parsePdfImportAction(fileForm(big));
    expect(result.error).toBe("This file is larger than 5 MB. Split it and try again.");
    expect(requireAuthContext).not.toHaveBeenCalled();
  });

  it("returns the rate-limit message when the preview bucket is exhausted", async () => {
    rateLimitMocks.consumeConfiguredLimit.mockResolvedValue({
      ok: false,
      remaining: 0,
      retryAfterSeconds: 30,
    });
    const result = await parsePdfImportAction(fileForm(pdfFile()));
    expect(result.error).toBe(
      "Too many requests. Please slow down and try again shortly.",
    );
    expect(parsePdf).not.toHaveBeenCalled();
  });

  it("parses the uploaded PDF and returns headers and rows", async () => {
    const result = await parsePdfImportAction(fileForm(pdfFile("bank.pdf")));
    expect(result.ok).toBe(true);
    expect(result.fileName).toBe("bank.pdf");
    expect(result.headers).toEqual([...PDF_IMPORT_HEADERS]);
    expect(result.rows).toEqual(SAMPLE_ROWS);
    expect(consumeConfiguredLimit).toHaveBeenCalledWith("import:preview", "biz-a");
    expect(parsePdf).toHaveBeenCalledTimes(1);
    const bytes = vi.mocked(parsePdf).mock.calls[0][0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(4);
  });

  it("surfaces the parser's actionable error message", async () => {
    vi.mocked(parsePdf).mockRejectedValue(
      new Error("We couldn't find any transactions in this PDF."),
    );
    const result = await parsePdfImportAction(fileForm(pdfFile()));
    expect(result.ok).toBeUndefined();
    expect(result.error).toBe("We couldn't find any transactions in this PDF.");
  });
});
