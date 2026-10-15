import { describe, expect, it } from "vitest";
import {
  IMPORT_DRAFT_VERSION,
  IMPORT_DRAFT_TTL_MS,
  IMPORT_MEMO_TTL_MS,
  IMPORT_OWNER_KEY,
  parseDraft,
  serializeDraft,
  parseMappingMemo,
  serializeMappingMemo,
  parseAccountMemo,
  serializeAccountMemo,
  purgeImportCaches,
  claimImportOwner,
  draftMatchesFile,
  headerSignature,
  fileSignature,
  draftKey,
  accountKey,
  mappingKey,
  type ImportDraft,
} from "@/lib/import/draft";

const SAVED_AT = "2026-06-01T00:00:00.000Z";
const NOW = Date.parse(SAVED_AT);

function draft(overrides: Partial<ImportDraft> = {}): ImportDraft {
  return {
    v: IMPORT_DRAFT_VERSION,
    fileName: "statement.csv",
    fileSize: 1234,
    fileLastModified: 1_700_000_000_000,
    fileType: "csv",
    mapping: { date: "Date", description: "Description", amount: "Amount" },
    accountId: "acc-1",
    step: 3,
    selections: { "0": true, "2": true },
    overrides: { "0": "cat-a" },
    savedAt: SAVED_AT,
    ...overrides,
  };
}

/** Minimal in-memory Storage so purge/owner rules can be asserted directly. */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("key builders", () => {
  it("namespaces every key by business id", () => {
    expect(draftKey("biz-a")).toBe("ledgerai:import-draft:biz-a");
    expect(accountKey("biz-a")).toBe("ledgerai:import-account:biz-a");
    expect(mappingKey("biz-a", ["Date", "Amount"])).toBe(
      "ledgerai:import-mapping:biz-a:date|amount",
    );
  });

  it("builds a normalized, order-sensitive header signature", () => {
    expect(headerSignature([" Date ", "Amount"])).toBe("date|amount");
    expect(headerSignature(["Amount", "Date"])).not.toBe(headerSignature(["Date", "Amount"]));
  });

  it("builds a file signature from name, size and mtime", () => {
    expect(fileSignature({ name: "a.csv", size: 5, lastModified: 9 })).toBe("a.csv::5::9");
  });
});

describe("serializeDraft / parseDraft round-trip", () => {
  it("round-trips a well-formed draft", () => {
    const original = draft();
    const parsed = parseDraft(serializeDraft(original), NOW);
    expect(parsed).toEqual(original);
  });

  it("returns null for empty, malformed or foreign-version input", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("")).toBeNull();
    expect(parseDraft("{not json")).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 999 }))).toBeNull();
    expect(parseDraft(JSON.stringify("a string"))).toBeNull();
  });

  it("rejects a draft missing required file identity", () => {
    expect(parseDraft(JSON.stringify({ v: IMPORT_DRAFT_VERSION }))).toBeNull();
    expect(
      parseDraft(
        JSON.stringify({
          v: IMPORT_DRAFT_VERSION,
          fileName: "",
          fileSize: 1,
          fileLastModified: 2,
          fileType: "csv",
          savedAt: SAVED_AT,
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it("drops malformed mapping/selections/overrides entries rather than throwing", () => {
    const parsed = parseDraft(
      JSON.stringify({
        v: IMPORT_DRAFT_VERSION,
        fileName: "x.csv",
        fileSize: 1,
        fileLastModified: 2,
        fileType: "csv",
        mapping: { date: "Date", bad: 5, empty: "" },
        accountId: 7,
        step: "3",
        selections: { "0": true, "1": "yes" },
        overrides: { "0": "cat-a", "1": 9, "2": "" },
        savedAt: SAVED_AT,
      }),
      NOW,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.mapping).toEqual({ date: "Date" });
    expect(parsed?.selections).toEqual({ "0": true });
    expect(parsed?.overrides).toEqual({ "0": "cat-a" });
    expect(parsed?.accountId).toBe("");
    expect(parsed?.step).toBe(2);
  });

  it("rejects an unknown file type", () => {
    expect(
      parseDraft(serializeDraft(draft({ fileType: "doc" as never })), NOW),
    ).toBeNull();
  });

  it("persists only known fields — never raw rows or server identifiers", () => {
    const parsed = parseDraft(
      JSON.stringify({
        ...draft(),
        rows: [{ description: "Coffee", amount: 4500 }],
        rawBytes: "date,amount\n...",
        businessId: "biz-secret",
        userId: "user-secret",
        authToken: "token-secret",
      }),
      NOW,
    );

    expect(parsed).not.toBeNull();
    for (const leak of ["rows", "rawBytes", "businessId", "userId", "authToken"]) {
      expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty(leak);
    }
  });
});

describe("draft TTL", () => {
  it("accepts a draft inside the TTL window", () => {
    const savedAt = new Date(NOW - IMPORT_DRAFT_TTL_MS + 60_000).toISOString();
    expect(parseDraft(serializeDraft(draft({ savedAt })), NOW)).not.toBeNull();
  });

  it("rejects a draft older than the TTL", () => {
    const savedAt = new Date(NOW - IMPORT_DRAFT_TTL_MS - 1).toISOString();
    expect(parseDraft(serializeDraft(draft({ savedAt })), NOW)).toBeNull();
  });

  it("rejects a missing or unparseable savedAt", () => {
    const withoutSavedAt: Record<string, unknown> = { ...draft() };
    delete withoutSavedAt.savedAt;
    expect(parseDraft(JSON.stringify(withoutSavedAt), NOW)).toBeNull();
    expect(parseDraft(JSON.stringify({ ...draft(), savedAt: "not-a-date" }), NOW)).toBeNull();
  });

  it("rejects a draft dated implausibly far in the future", () => {
    const savedAt = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(parseDraft(serializeDraft(draft({ savedAt })), NOW)).toBeNull();
  });
});

describe("mapping/account memory hints", () => {
  it("round-trips a mapping hint", () => {
    const mapping = { date: "Date", amount: "Amount" };
    expect(parseMappingMemo(serializeMappingMemo(mapping), Date.now())).toEqual(mapping);
  });

  it("returns null for absent, malformed or expired mapping hints", () => {
    expect(parseMappingMemo(null)).toBeNull();
    expect(parseMappingMemo("{not json")).toBeNull();
    expect(parseMappingMemo(JSON.stringify({ date: "Date" }))).toBeNull(); // no envelope
    expect(
      parseMappingMemo(serializeMappingMemo({ date: "Date" }), Date.now() + IMPORT_MEMO_TTL_MS + 1),
    ).toBeNull();
  });

  it("round-trips an account hint and rejects expired/malformed ones", () => {
    const raw = serializeAccountMemo("acc-1");
    expect(parseAccountMemo(raw, Date.now())).toBe("acc-1");
    expect(parseAccountMemo(raw, Date.now() + IMPORT_MEMO_TTL_MS + 1)).toBeNull();
    expect(parseAccountMemo(JSON.stringify({ v: 1, savedAt: Date.now(), memo: 7 }))).toBeNull();
    expect(parseAccountMemo(null)).toBeNull();
  });
});

describe("purgeImportCaches", () => {
  it("removes every import key from both storages, leaving other data intact", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem("ledgerai:import-draft:biz-a", "{}");
    local.setItem("ledgerai:import-account:biz-a", "{}");
    local.setItem("ledgerai:theme", "dark");
    local.setItem("unrelated", "keep");
    session.setItem("ledgerai:import-draft:biz-a", "{}");
    session.setItem("ledgerai:import-mapping:biz-a:x", "{}");
    session.setItem("keep", "yes");

    purgeImportCaches([local, session]);

    expect(local.getItem("ledgerai:import-draft:biz-a")).toBeNull();
    expect(local.getItem("ledgerai:import-account:biz-a")).toBeNull();
    expect(session.getItem("ledgerai:import-draft:biz-a")).toBeNull();
    expect(session.getItem("ledgerai:import-mapping:biz-a:x")).toBeNull();
    expect(local.getItem("ledgerai:theme")).toBe("dark");
    expect(local.getItem("unrelated")).toBe("keep");
    expect(session.getItem("keep")).toBe("yes");
  });

  it("tolerates null storages and denied access", () => {
    expect(() => purgeImportCaches([null, sessionStorageDenied()])).not.toThrow();
  });
});

function sessionStorageDenied(): Storage {
  return {
    get length(): number {
      throw new Error("denied");
    },
    clear: () => undefined,
    getItem: () => null,
    key: () => null,
    removeItem: () => undefined,
    setItem: () => undefined,
  };
}

describe("claimImportOwner", () => {
  it("claims ownership on first use and records the owner", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();

    expect(claimImportOwner(local, session, "biz-a")).toBe(false);
    expect(local.getItem(IMPORT_OWNER_KEY)).toBe("biz-a");
  });

  it("keeps its own caches when the same business returns", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    claimImportOwner(local, session, "biz-a");
    local.setItem("ledgerai:import-account:biz-a", "keep-me");

    expect(claimImportOwner(local, session, "biz-a")).toBe(true);
    expect(local.getItem("ledgerai:import-account:biz-a")).toBe("keep-me");
  });

  it("purges a different business's caches on switch", () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    claimImportOwner(local, session, "biz-a");
    local.setItem("ledgerai:import-account:biz-a", "other-tenant");
    session.setItem("ledgerai:import-draft:biz-a", "other-tenant");

    expect(claimImportOwner(local, session, "biz-b")).toBe(false);
    expect(local.getItem("ledgerai:import-account:biz-a")).toBeNull();
    expect(session.getItem("ledgerai:import-draft:biz-a")).toBeNull();
    expect(local.getItem(IMPORT_OWNER_KEY)).toBe("biz-b");
  });
});

describe("draftMatchesFile", () => {
  it("matches on name, size and mtime", () => {
    const d = draft();
    expect(draftMatchesFile(d, { name: "statement.csv", size: 1234, lastModified: 1_700_000_000_000 })).toBe(true);
    expect(draftMatchesFile(d, { name: "other.csv", size: 1234, lastModified: 1_700_000_000_000 })).toBe(false);
    expect(draftMatchesFile(d, { name: "statement.csv", size: 1, lastModified: 1_700_000_000_000 })).toBe(false);
  });
});
