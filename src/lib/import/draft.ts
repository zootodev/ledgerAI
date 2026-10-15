// ============================================================
// LedgerAI — Import draft & mapping memory
// ------------------------------------------------------------
// Client-side, best-effort persistence so mapping/review work is not
// silently lost and a regular file format maps itself next time.
//
// Safety model:
//   - Everything here is a CONVENIENCE cache only. The commit path
//     re-parses, re-validates and re-categorizes from the original
//     bytes server-side, so a stale or forged cache can never change
//     what is written.
//   - Keys are namespaced by business id, so a shared browser never
//     surfaces one tenant's draft to another.
//   - Draft data lives in sessionStorage (per-tab, cleared on close);
//     only the tiny account/mapping hints use localStorage.
//   - No raw transaction rows, monetary amounts, or sensitive credentials
//     are persisted here. The only retained metadata is limited UX state:
//     row indexes, column names, mapping hints, and category ids. Category
//     ids ARE server identifiers, but storing one is harmless — the commit
//     path re-derives the category server-side and validates ownership, so
//     this cache is never authoritative.
//   - Every cache is BOUNDED: an unfinished draft expires after
//     IMPORT_DRAFT_TTL_MS and the account/mapping hints after
//     IMPORT_MEMO_TTL_MS; a stale or future timestamp is treated as absent.
//   - Sign-out and an account/business switch purge every import cache on
//     this browser (see purgeImportCaches / claimImportOwner).
// ============================================================

import type { ColumnMapping, ImportFileFormat } from "./types";

export const IMPORT_DRAFT_VERSION = 1;

/** Bounded lifetime for an unfinished review draft (in-flight work). */
export const IMPORT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/** Bounded lifetime for the long-lived account/mapping memory hints. */
export const IMPORT_MEMO_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Tolerance for client clock skew when checking a saved timestamp. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Version stamped on the wrapped account/mapping memo envelopes. */
const IMPORT_MEMO_VERSION = 1;

/** Every browser key this module owns shares this prefix (see purge). */
export const IMPORT_STORAGE_PREFIX = "ledgerai:import-";

/** Which business claimed the import caches on this browser. */
export const IMPORT_OWNER_KEY = `${IMPORT_STORAGE_PREFIX}owner`;

/** Persisted wizard decisions for a single, re-selectable file. */
export interface ImportDraft {
  v: number;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  fileType: ImportFileFormat;
  mapping: ColumnMapping;
  accountId: string;
  step: number;
  selections: Record<string, boolean>;
  overrides: Record<string, string>;
  savedAt: string;
}

/** Stable identity of a chosen file (name + size + mtime), for matching. */
export function fileSignature(file: {
  name: string;
  size: number;
  lastModified: number;
}): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

/** Normalized, order-sensitive header signature for mapping memory. */
export function headerSignature(headers: string[]): string {
  return headers.map((h) => h.trim().toLowerCase()).join("|");
}

export function draftKey(businessId: string): string {
  return `ledgerai:import-draft:${businessId}`;
}

export function accountKey(businessId: string): string {
  return `ledgerai:import-account:${businessId}`;
}

export function mappingKey(businessId: string, headers: string[]): string {
  return `ledgerai:import-mapping:${businessId}:${headerSignature(headers)}`;
}

/** True when a draft was saved for exactly this file. */
export function draftMatchesFile(
  draft: ImportDraft,
  file: { name: string; size: number; lastModified: number },
): boolean {
  return (
    draft.fileName === file.name &&
    draft.fileSize === file.size &&
    draft.fileLastModified === file.lastModified
  );
}

export function serializeDraft(draft: ImportDraft): string {
  return JSON.stringify(draft);
}

/**
 * Wrap a long-lived memo value with its own bounded saved-at timestamp, so a
 * hint left on a shared browser cannot be trusted forever.
 */
function serializeMemo<T>(value: T): string {
  return JSON.stringify({ v: IMPORT_MEMO_VERSION, savedAt: Date.now(), memo: value });
}

/**
 * Unwrap a memo envelope, returning the inner value only when it is
 * well-formed and within IMPORT_MEMO_TTL_MS of `now`. A stale, future-skewed
 * or malformed envelope is treated as absent.
 */
function parseMemo(raw: string | null, now: number): unknown {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Record<string, unknown>;
  if (env.v !== IMPORT_MEMO_VERSION) return null;
  if (typeof env.savedAt !== "number") return null;
  const age = now - env.savedAt;
  if (age > IMPORT_MEMO_TTL_MS || age < -CLOCK_SKEW_MS) return null;
  return env.memo;
}

/** Serialize a column-mapping memory hint with a bounded lifetime. */
export function serializeMappingMemo(mapping: ColumnMapping): string {
  return serializeMemo(mapping);
}

/**
 * Parse a remembered column mapping (header-signature keyed). Returns null
 * for absent/expired/malformed/empty input so the caller falls back to
 * detection.
 */
export function parseMappingMemo(
  raw: string | null,
  now: number = Date.now(),
): ColumnMapping | null {
  const mapping = sanitizeMapping(parseMemo(raw, now));
  return Object.keys(mapping).length > 0 ? mapping : null;
}

/** Serialize the last-used account hint with a bounded lifetime. */
export function serializeAccountMemo(accountId: string): string {
  return serializeMemo(accountId);
}

/** Parse a last-used account hint; null when absent/expired/malformed. */
export function parseAccountMemo(
  raw: string | null,
  now: number = Date.now(),
): string | null {
  const value = parseMemo(raw, now);
  return typeof value === "string" && value !== "" ? value : null;
}

const VALID_FILE_TYPES: readonly ImportFileFormat[] = ["csv", "xlsx", "pdf"];

/**
 * Parse a serialized draft defensively: any malformed/foreign shape yields
 * null rather than throwing, so a bad cache can never break the wizard. A
 * draft is also rejected once it is older than IMPORT_DRAFT_TTL_MS (or dated
 * beyond a small clock-skew tolerance in the future).
 */
export function parseDraft(raw: string | null, now: number = Date.now()): ImportDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const d = value as Record<string, unknown>;
  if (d.v !== IMPORT_DRAFT_VERSION) return null;
  if (typeof d.fileName !== "string" || d.fileName === "") return null;
  if (typeof d.fileSize !== "number" || typeof d.fileLastModified !== "number") return null;
  if (typeof d.fileType !== "string" || !VALID_FILE_TYPES.includes(d.fileType as ImportFileFormat)) {
    return null;
  }
  const savedAtMs = typeof d.savedAt === "string" ? Date.parse(d.savedAt) : NaN;
  if (!Number.isFinite(savedAtMs)) return null;
  const age = now - savedAtMs;
  if (age > IMPORT_DRAFT_TTL_MS || age < -CLOCK_SKEW_MS) return null;
  return {
    v: IMPORT_DRAFT_VERSION,
    fileName: d.fileName,
    fileSize: d.fileSize,
    fileLastModified: d.fileLastModified,
    fileType: d.fileType as ImportFileFormat,
    mapping: sanitizeMapping(d.mapping),
    accountId: typeof d.accountId === "string" ? d.accountId : "",
    step: typeof d.step === "number" ? d.step : 2,
    selections: sanitizeBoolMap(d.selections),
    overrides: sanitizeStringMap(d.overrides),
    savedAt: new Date(savedAtMs).toISOString(),
  };
}

function sanitizeMapping(value: unknown): ColumnMapping {
  if (!value || typeof value !== "object") return {};
  const out: ColumnMapping = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v !== "") {
      (out as Record<string, string>)[k] = v;
    }
  }
  return out;
}

function sanitizeBoolMap(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function sanitizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v !== "") out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storage wrappers — every access is guarded; a failure is always non-fatal.
// ---------------------------------------------------------------------------

export function readStorage(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(storage: Storage | null, key: string, value: string): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    // Quota/security errors are ignored — the cache is best-effort.
  }
}

export function removeStorage(storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

/** sessionStorage for drafts (per-tab, cleared on close); null outside a browser. */
export function sessionStore(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

/** localStorage for the tiny account/mapping hints; null outside a browser. */
export function localStore(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/**
 * Remove every browser cache this module owns from the given storages —
 * used on sign-out and on an account/business switch. Iterates keys in
 * reverse index order so removals never skip an entry; always best-effort.
 */
export function purgeImportCaches(storages: Array<Storage | null>): void {
  for (const storage of storages) {
    if (!storage) continue;
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (key && key.startsWith(IMPORT_STORAGE_PREFIX)) storage.removeItem(key);
      }
    } catch {
      // A locked/denied storage must never block sign-out.
    }
  }
}

/**
 * Claim the import caches for `businessId`. Returns true when this business
 * already owned them; false when a different business's caches were purged
 * first (an account/business switch on a shared browser). Best-effort: any
 * storage failure degrades to "not the owner" without throwing.
 */
export function claimImportOwner(
  local: Storage | null,
  session: Storage | null,
  businessId: string,
): boolean {
  if (readStorage(local, IMPORT_OWNER_KEY) === businessId) return true;
  purgeImportCaches([local, session]);
  writeStorage(local, IMPORT_OWNER_KEY, businessId);
  return false;
}
