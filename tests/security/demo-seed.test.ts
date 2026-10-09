import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD_ENV,
  demoPasswordFromEnv,
  demoSeedAllowed,
} from "@/lib/security/demo-seed";

describe("demoSeedAllowed (SG1-01 gate)", () => {
  it("blocks seeding outright when NODE_ENV=production", () => {
    expect(demoSeedAllowed({ NODE_ENV: "production", SEED_ALLOW: "development" }).allowed).toBe(
      false,
    );
  });

  it("is opt-in: refuses without an explicit SEED_ALLOW=development", () => {
    expect(demoSeedAllowed({ NODE_ENV: "development" }).allowed).toBe(false);
    expect(demoSeedAllowed({}).allowed).toBe(false);
    expect(demoSeedAllowed({ NODE_ENV: "give-me-data" }).allowed).toBe(false);
  });

  it("refuses any SEED_ALLOW value other than development", () => {
    expect(demoSeedAllowed({ SEED_ALLOW: "staging" }).allowed).toBe(false);
    expect(demoSeedAllowed({ SEED_ALLOW: "production" }).allowed).toBe(false);
  });

  it("allows only an explicit development intent", () => {
    expect(demoSeedAllowed({ NODE_ENV: "test", SEED_ALLOW: "development" }).allowed).toBe(true);
    expect(demoSeedAllowed({ SEED_ALLOW: "development" }).allowed).toBe(true);
  });
});

describe("demoPasswordFromEnv", () => {
  it("uses the stable demo tenant email", () => {
    expect(DEMO_EMAIL).toBe("demo@zooto.local");
  });

  it("returns null when unset or empty", () => {
    expect(demoPasswordFromEnv({})).toBeNull();
    expect(demoPasswordFromEnv({ SEED_DEMO_PASSWORD: "" })).toBeNull();
    expect(demoPasswordFromEnv({ SEED_DEMO_PASSWORD: "   " })).toBe("   ");
  });

  it("returns the runtime-provided value when present", () => {
    const value = "runtime-provided-dev-password";
    expect(demoPasswordFromEnv({ [DEMO_PASSWORD_ENV]: value })).toBe(value);
  });
});

describe("prisma/seed.ts guard", () => {
  const seedSource = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");

  it("does not embed any credential in source", () => {
    expect(seedSource).not.toMatch(/Demo@Zooto/);
    expect(seedSource).not.toMatch(/DEMO_PASSWORD\s*=\s*["']/);
  });

  it("reads the demo password from the environment at runtime", () => {
    expect(seedSource).toContain(DEMO_PASSWORD_ENV);
    expect(seedSource).toContain("demoPasswordFromEnv(process.env)");
  });

  it("enforces the development-only gate before any seeding happens", () => {
    const gateIndex = seedSource.indexOf("demoSeedAllowed(process.env)");
    const createUserIndex = seedSource.indexOf("admin.auth.admin.createUser");
    const lookupsIndex = seedSource.indexOf("admin.auth.admin.listUsers");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(lookupsIndex);
    expect(gateIndex).toBeLessThan(createUserIndex);
  });

  it("never prints the password", () => {
    const passwordLabelLines = seedSource
      .split(/\r?\n/)
      .filter((line) => line.includes("Sign-in pass"));
    expect(passwordLabelLines.length).toBeGreaterThan(0);
    for (const line of passwordLabelLines) {
      expect(line).toMatch(/\$\{DEMO_PASSWORD_ENV\}/);
      expect(line).not.toMatch(/\$\{demoPassword\}|\$\{password\}/i);
    }
    expect(seedSource).not.toMatch(/DEMO_PASSWORD\b[^\n]*\$\{/);
  });

  it("targets the demo tenant by the stable dev email identifier", () => {
    expect(seedSource).toMatch(/\bDEMO_EMAIL\b/);
  });
});