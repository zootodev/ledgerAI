/**
 * Demo-seed safety gate (SG1-01 remediation).
 *
 * The demo credential must never be hard-coded and demo seeding must never be
 * able to run against a production environment. This module is the single
 * source of truth for both rules; the seed script (prisma/seed.ts) consults it
 * and refuses to run otherwise.
 */
export const DEMO_EMAIL = "demo@zooto.local";
export const DEMO_PASSWORD_ENV = "SEED_DEMO_PASSWORD";

export interface DemoSeedGate {
  allowed: boolean;
  reason?: string;
}

/**
 * Seeding requires an EXPLICIT development opt-in:
 *   - never when NODE_ENV=production;
 *   - only when SEED_ALLOW=development is set (an accidental `npm run db:seed`
 *     in any other shell or environment is refused, not "allowed by default").
 */
export type DemoSeedEnv = Record<string, string | undefined>;

export function demoSeedAllowed(env: DemoSeedEnv = process.env): DemoSeedGate {
  if (env.NODE_ENV === "production") {
    return {
      allowed: false,
      reason: "Demo seeding is development/test only; refusing to run with NODE_ENV=production.",
    };
  }
  if (env.SEED_ALLOW !== "development") {
    return {
      allowed: false,
      reason:
        "Demo seeding is opt-in: set SEED_ALLOW=development (and NODE_ENV to something other " +
        "than production) to run it. It will not seed by default.",
    };
  }
  return { allowed: true };
}

/**
 * Resolve the demo password from the environment. It is deliberately read at
 * runtime and never embedded in source; creating the demo auth user without it
 * is refused.
 */
export function demoPasswordFromEnv(env: DemoSeedEnv = process.env): string | null {
  const value = env[DEMO_PASSWORD_ENV];
  return value && value.length > 0 ? value : null;
}