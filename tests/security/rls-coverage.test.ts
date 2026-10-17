import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// RLS coverage guard (launch hardening)
// ------------------------------------------------------------
// Every table Prisma knows about must have Row-Level Security turned on in
// prisma/rls.sql, and every table that holds per-tenant/user rows must have at
// least one policy. This test fails the moment a new model is added without
// accompanying RLS — the whole point is that direct DB access can never
// silently become cross-tenant.
//
// Tables that are intentionally policy-less (deny-all, service-role only) must
// be listed explicitly below with a reason.
// ============================================================

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const RLS = readFileSync(path.join(ROOT, "prisma/rls.sql"), "utf8");

/** Tables that hold no tenant data and are deliberately deny-all (no policy). */
const DENY_ALL_TABLES = new Set<string>([
  // SHA-256 key digests only; written/read by the service role which bypasses
  // RLS. No PII, no financial data.
  "rate_limit_buckets",
]);

/** Extract every Prisma model's mapped table name. */
function schemaTables(): string[] {
  const tables: string[] = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = modelRe.exec(SCHEMA)) !== null) {
    const body = match[2];
    const map = /@@map\("([^"]+)"\)/.exec(body);
    if (!map) {
      throw new Error(`Model ${match[1]} is missing @@map("...").`);
    }
    tables.push(map[1]);
  }
  return tables;
}

/** Tables with `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY`. */
function rlsEnabledTables(): Set<string> {
  const enabled = new Set<string>();
  const re = /ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(RLS)) !== null) {
    enabled.add(match[1]);
  }
  return enabled;
}

/** Tables that have at least one CREATE POLICY. */
function tablesWithPolicies(): Set<string> {
  const withPolicies = new Set<string>();
  const re = /CREATE POLICY "[\s\S]*?" ON "(\w+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(RLS)) !== null) {
    withPolicies.add(match[1]);
  }
  return withPolicies;
}

describe("RLS coverage", () => {
  const tables = schemaTables();

  it("finds every Prisma model", () => {
    expect(tables.length).toBeGreaterThanOrEqual(11);
    expect(tables).toContain("users");
    expect(tables).toContain("imports");
    expect(tables).toContain("rate_limit_buckets");
    expect(tables).toContain("assistant_conversations");
    expect(tables).toContain("assistant_messages");
  });

  it("enables RLS on every table (no table may be left unprotected)", () => {
    const enabled = rlsEnabledTables();
    const missing = tables.filter((table) => !enabled.has(table));
    expect(missing, `Tables missing ENABLE ROW LEVEL SECURITY: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every tenant-data table at least one policy", () => {
    const withPolicies = tablesWithPolicies();
    const missing = tables.filter(
      (table) => !DENY_ALL_TABLES.has(table) && !withPolicies.has(table),
    );
    expect(
      missing,
      `Tenant tables without any RLS policy: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the deny-all list honest (each listed table is RLS-enabled, policy-less)", () => {
    const enabled = rlsEnabledTables();
    const withPolicies = tablesWithPolicies();
    for (const table of DENY_ALL_TABLES) {
      expect(tables, `${table} is not a real model`).toContain(table);
      expect(enabled.has(table), `${table} must still have RLS enabled`).toBe(true);
      expect(
        withPolicies.has(table),
        `${table} is listed as deny-all, so it must not define a policy`,
      ).toBe(false);
    }
  });

  it("does not reference tables that don't exist in the schema", () => {
    const known = new Set(tables);
    const referenced = new Set([...rlsEnabledTables(), ...tablesWithPolicies()]);
    referenced.delete("users"); // sanity: users is a real table
    const ghosts = [...referenced].filter((table) => !known.has(table));
    expect(ghosts, `rls.sql references unknown tables: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("re-enables RLS idempotently (ENABLE, never DISABLE)", () => {
    expect(RLS).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });
});
