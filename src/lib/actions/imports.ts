"use server";

import { revalidatePath } from "next/cache";
import {
  commitImport,
  getExistingFingerprints,
  type ImportCommitServiceResult,
} from "@/lib/services/imports";
import { importCommitInputSchema } from "@/lib/validation/import";
import { MAX_IMPORT_FILE_BYTES, type RawImportRow } from "@/lib/import/types";
import { parsePdf } from "@/lib/import/parse-pdf";
import {
  consumeConfiguredLimit,
  RATE_LIMIT_EXCEEDED_MESSAGE,
} from "@/lib/security/rate-limit";
import { requireAuthContext } from "@/lib/services/auth-context";

export interface ImportActionState {
  ok?: boolean;
  error?: string;
  result?: ImportCommitServiceResult;
}

export interface PdfParseActionState {
  ok?: boolean;
  error?: string;
  headers?: string[];
  rows?: RawImportRow[];
  fileName?: string;
}

const IMPORT_PATHS = ["/transactions", "/income", "/expenses", "/overview", "/import"];

/**
 * Return the canonical fingerprints already recorded for the session
 * business, so the client preview can tag existing duplicates without a
 * round-trip per row.
 */
export async function getImportFingerprintsAction(): Promise<string[]> {
  try {
    const ctx = await requireAuthContext();
    const decision = await consumeConfiguredLimit("import:preview", ctx.business.id);
    if (!decision.ok) return [];
    return await getExistingFingerprints();
  } catch {
    return [];
  }
}

function readOptionalId(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseJsonArray(raw: string | null): unknown[] {
  if (!raw || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Parse a PDF statement on the server. pdf-parse is a Node-only library,
 * so unlike CSV/XLSX (which the wizard parses on-device) PDFs are read
 * here; the returned rows flow through the same client-side mapping and
 * review steps, and commit re-parses the original bytes deterministically.
 */
export async function parsePdfImportAction(
  formData: FormData,
): Promise<PdfParseActionState> {
  try {
    const rawFile = formData.get("file");
    if (!(rawFile instanceof File)) {
      return { error: "No file was provided." };
    }
    if (rawFile.size > MAX_IMPORT_FILE_BYTES) {
      return { error: "This file is larger than 5 MB. Split it and try again." };
    }
    if (rawFile.size === 0) {
      return { error: "The file is empty." };
    }
    if (!rawFile.name.toLowerCase().endsWith(".pdf")) {
      return { error: "This action only accepts PDF files." };
    }

    const ctx = await requireAuthContext();
    const decision = await consumeConfiguredLimit("import:preview", ctx.business.id);
    if (!decision.ok) {
      return { error: RATE_LIMIT_EXCEEDED_MESSAGE };
    }

    const bytes = new Uint8Array(await rawFile.arrayBuffer());
    const parsed = await parsePdf(bytes);
    return {
      ok: true,
      headers: parsed.headers,
      rows: parsed.rows,
      fileName: rawFile.name,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "This PDF could not be read." };
  }
}

/**
 * Commit an import. Runs entirely inside the service layer, which re-parses
 * the uploaded bytes and re-validates every decision.
 */
export async function commitImportAction(
  _prev: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  try {
    const rawFile = formData.get("file");
    if (!(rawFile instanceof File)) {
      return { error: "No file was provided." };
    }

    const fileName = String(formData.get("fileName") ?? "");
    const fileType = String(formData.get("fileType") ?? "");
    const rawMapping = String(formData.get("mapping") ?? "");
    const rawSelections = String(formData.get("selections") ?? "");
    const accountId = readOptionalId(String(formData.get("accountId") ?? ""));

    if (rawFile.size > MAX_IMPORT_FILE_BYTES) {
      return { error: "This file is larger than 5 MB. Split it and try again." };
    }
    if (rawFile.size === 0) {
      return { error: "The file is empty." };
    }

    const ctx = await requireAuthContext();
    const decision = await consumeConfiguredLimit("import:commit", ctx.business.id);
    if (!decision.ok) {
      return { error: RATE_LIMIT_EXCEEDED_MESSAGE };
    }

    const parsedMapping = parseJsonObject(rawMapping);
    const parsedSelections = parseJsonArray(rawSelections);

    const parsed = importCommitInputSchema.safeParse({
      fileName,
      fileType,
      mapping: parsedMapping,
      accountId,
      selections: parsedSelections,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid import request." };
    }

    const buffer = new Uint8Array(await rawFile.arrayBuffer());

    const result = await commitImport(buffer, parsed.data);
    IMPORT_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to import this file." };
  }
}