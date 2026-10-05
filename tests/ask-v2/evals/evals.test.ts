// ============================================================
// LedgerAI — Ask v2 Phase 6 evaluation suite
// ------------------------------------------------------------
// Scenarios A–G, DB-gated (skipped when DATABASE_URL or the
// seeded demo tenant is unavailable so `npm test` stays green
// in DB-less CI). Uses production pipeline functions through a
// scripted fake provider; no production /ask-v2 changes.
//
// Output safety: assertions use real values, report logs are
// masked (amounts/ids). No API keys, DB credentials, or tenant
// identifiers are printed.
// ============================================================

import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getPrismaClient } from "@/lib/db/client";
import { transactionFingerprint } from "@/lib/finance/engine";
import { askV2ProposalSchema } from "@/lib/ask-v2/contracts";
import { askV2PolicyDecision } from "@/lib/ask-v2/policy";
import {
  createScriptedRuntime,
  runTurn,
  DEMO_EMAIL,
  type TurnEvidence,
} from "./harness";
import type { ScenarioFixture, TurnFixture } from "./fixtures";
import {
  scenarioA,
  scenarioB,
  scenarioC,
  scenarioD,
  scenarioE,
  scenarioF,
  scenarioFConvo2,
  scenarioFConvo2FollowUp,
  scenarioG,
  scenarioH,
  scenarioI,
  scenarioJ,
  scenarioK,
} from "./fixtures";

const prisma = getPrismaClient();

vi.setConfig({ testTimeout: 120000 });

interface DemoTenant {
  user: { id: string };
  business: { id: string; currency: string };
}

async function resolveDemoTenant(): Promise<DemoTenant | null> {
  if (!prisma) return null;
  const user = await prisma.user.findFirst({
    where: { email: DEMO_EMAIL },
    select: { id: true },
  });
  if (!user) return null;
  const business = await prisma.business.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, currency: true },
  });
  if (!business) return null;
  return { user, business };
}

const tenantPromise = resolveDemoTenant();
const tenant = await tenantPromise;
const dbReady = Boolean(prisma && tenant);

const createdConversations = new Set<string>();

async function cleanupCreatedConversations(): Promise<void> {
  if (!prisma || createdConversations.size === 0) return;
  const ids = [...createdConversations];
  createdConversations.clear();
  await prisma.assistantConversation.deleteMany({
    where: { id: { in: ids } },
  });
}

/* ------------------------------------------------------------
 * Phase 9B golden decision oracle (pure, Groq-free).
 * Asserts the STRUCTURED interpreter decision boundary, not the
 * downstream finance result. This is a deterministic expected-
 * decision oracle for the prompt-hardening contract.
 * ------------------------------------------------------------ */

interface GoldenDecision {
  tool: string;
  periodKind: string;
  category?: string;
}

const GOLDEN_DECISIONS: GoldenDecision[] = [
  { tool: "expense_breakdown", periodKind: "thisYear" },
  { tool: "expense_breakdown", periodKind: "thisYear", category: "inventory" },
  { tool: "expense_breakdown", periodKind: "thisYear" },
  { tool: "expense_breakdown", periodKind: "thisYear" },
  { tool: "expense_summary", periodKind: "lastMonth" },
] as const;

function decisionValues(scripted: unknown): {
  kind: string;
  tool?: string;
  periodKind?: string;
  category?: string;
  reason?: string;
} | null {
  if (!scripted || typeof scripted !== "object") return null;
  const o = scripted as { kind?: string; proposal?: unknown; reason?: unknown };
  if (o.kind === "proposal" && o.proposal && typeof o.proposal === "object") {
    const p = o.proposal as { tool?: string; period?: { kind?: string }; category?: unknown };
    return {
      kind: "proposal",
      tool: p.tool,
      periodKind: p.period?.kind,
      category: typeof p.category === "string" ? p.category.toLowerCase() : undefined,
    };
  }
  if (o.kind === "clarification" || o.kind === "unsupported") {
    return { kind: o.kind, reason: typeof o.reason === "string" ? o.reason : undefined };
  }
  return null;
}

function matchesGolden(
  scripted: unknown,
  expected: GoldenDecision,
): boolean {
  const d = decisionValues(scripted);
  if (!d || d.kind !== "proposal") return false;
  if (d.tool !== expected.tool) return false;
  if (d.periodKind !== expected.periodKind) return false;
  if (expected.category !== undefined) {
    if (typeof d.category !== "string") return false;
    if (!d.category.includes(expected.category)) return false;
  } else if (d.category !== undefined) {
    // An aggregate request must NOT carry a category (strict omission guard).
    return false;
  }
  return true;
}

describe("Phase 9B golden decision oracle (structured proposal boundary)", () => {
  it("accepts the exact five-turn correct decisions", () => {
    expect(scenarioH.turns.length).toBe(5);
    scenarioH.turns.forEach((turn, i) => {
      const scripted = turn.script({} as never);
      expect(
        matchesGolden(scripted, GOLDEN_DECISIONS[i]),
        `turn ${i + 1} must match golden decision`,
      ).toBe(true);
    });
  });

  it("rejects transactions selected for T3", () => {
    const wrong = { kind: "proposal", proposal: { tool: "transactions", period: { kind: "thisYear" } } };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[2])).toBe(false);
  });

  it("rejects clarification selected for T4", () => {
    const wrong = { kind: "clarification", reason: "ambiguous_financial_metric" };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[3])).toBe(false);
  });

  it("rejects category omitted for T2", () => {
    const wrong = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "thisYear" } } };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[1])).toBe(false);
  });

  it("rejects a category enriched onto the aggregate T3 (strict omission guard)", () => {
    const wrong = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "inventory" } };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[2])).toBe(false);
  });

  it("rejects a category enriched onto the aggregate T4", () => {
    const wrong = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "rent" } };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[3])).toBe(false);
  });

  it("rejects expense_breakdown selected for T5", () => {
    const wrong = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "lastMonth" } } };
    expect(matchesGolden(wrong, GOLDEN_DECISIONS[4])).toBe(false);
  });
});

describe("Phase 14 — category_ranking decision oracle (golden, no DB)", () => {
  it("treats 'What did I spend the most on?' as category_ranking, never clarification", () => {
    const ranking = { kind: "proposal", proposal: { tool: "category_ranking", period: { kind: "thisYear" } } };
    expect(matchesGolden(ranking, { tool: "category_ranking", periodKind: "thisYear" })).toBe(true);

    const clarified = { kind: "clarification", reason: "needs_category" };
    expect(matchesGolden(clarified, { tool: "category_ranking", periodKind: "thisYear" })).toBe(false);

    const legacyBreakdown = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "thisYear" } } };
    expect(matchesGolden(legacyBreakdown, { tool: "category_ranking", periodKind: "thisYear" })).toBe(false);
  });

  it("ranks a period with no category and no limit argument", () => {
    expect(askV2ProposalSchema.safeParse({ tool: "category_ranking", period: { kind: "lastMonth" } }).success).toBe(true);
    expect(askV2ProposalSchema.safeParse({ tool: "category_ranking", period: { kind: "thisYear" }, limit: 3 }).success).toBe(false);
  });

  it("policy answers a ranking proposal through spendingDistribution (never clarification/unsupported)", () => {
    const decision = askV2PolicyDecision({ tool: "category_ranking", period: { kind: "thisYear" } }, { categorySet: new Set() });
    expect(decision).not.toMatchObject({ kind: "clarification" });
    expect(decision).not.toMatchObject({ kind: "unsupported" });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "spendingDistribution", category: null });
      expect(decision.toolKeys).toEqual(["summary.get", "categories.listSpending", "categories.distribution"]);
    }
  });

  it("regression: existing summary/breakdown golden decisions are unchanged", () => {
    const summary = { kind: "proposal", proposal: { tool: "expense_summary", period: { kind: "lastMonth" } } };
    expect(matchesGolden(summary, GOLDEN_DECISIONS[4])).toBe(true);
    expect(askV2PolicyDecision({ tool: "expense_summary", period: { kind: "lastMonth" } })).toMatchObject({
      kind: "answer",
      query: { intent: "expenses", category: null, period: { kind: "lastMonth" } },
    });

    const aggregate = { kind: "proposal", proposal: { tool: "expense_breakdown", period: { kind: "thisYear" } } };
    expect(matchesGolden(aggregate, GOLDEN_DECISIONS[0])).toBe(true);
  });
});

describe("Phase 17 — category share decision oracle (golden, no DB)", () => {
  const OWNED = new Set(["Inventory", "Rent", "Salaries", "Equipment", "Marketing"]);

  it("T1: a fresh explicit share becomes an answer with the exact allow-listed keys", () => {
    const p = { tool: "category_share", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "explicit" } as const;
    expect(askV2ProposalSchema.safeParse(p).success).toBe(true);
    const decision = askV2PolicyDecision(p, { categorySet: new Set() });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toEqual({ intent: "categoryShare", category: "Inventory", period: { kind: "thisYear" } });
      expect(decision.toolKeys).toEqual(["summary.get", "categories.listSpending", "categories.distribution"]);
    }
  });

  it("T2: a referenced share must come from the verified owned set — never the user's bare claim", () => {
    const p = { tool: "category_share", period: { kind: "thisYear" }, category: "rent", categoryOrigin: "referenced" } as const;
    expect(askV2PolicyDecision(p, { categorySet: OWNED })).toMatchObject({
      kind: "answer",
      query: { intent: "categoryShare", category: "Rent", period: { kind: "thisYear" } },
    });
    expect(askV2PolicyDecision(p, { categorySet: new Set() })).toEqual({
      kind: "clarification",
      reason: "needs_subject",
    });
  });

  it("T3: an amount question is NEVER coerced into a share", () => {
    const p = { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Inventory", categoryOrigin: "referenced" } as const;
    expect(askV2PolicyDecision(p, { categorySet: OWNED })).toMatchObject({
      kind: "answer",
      query: { intent: "categorySpend", category: "Inventory" },
    });
  });

  it("T4: the excluding complement still resolves against a share-established category set", () => {
    const p = { tool: "expense_breakdown", period: { kind: "thisYear" }, category: "Rent", categoryOrigin: "referenced", scope: "complement" } as const;
    expect(askV2PolicyDecision(p, { categorySet: OWNED })).toMatchObject({
      kind: "answer",
      query: { intent: "spendingDistribution", category: null, complement: { kind: "excluding", category: "Rent" } },
    });
  });

  it("T5: a literal 'other' share stays a category share, never the remainder", () => {
    const p = { tool: "category_share", period: { kind: "thisYear" }, category: "Other", categoryOrigin: "explicit" } as const;
    const decision = askV2PolicyDecision(p, { categorySet: OWNED });
    expect(decision.kind).toBe("answer");
    if (decision.kind === "answer") {
      expect(decision.query).toMatchObject({ intent: "categoryShare", category: "Other" });
      expect(decision.query.complement).toBeUndefined();
    }
  });

  it("a category_share contract may never carry a derived figure, complement, or scope", () => {
    for (const bad of [
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", percent: 29 } as const,
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", share: 29 } as const,
      { tool: "category_share", period: { kind: "thisYear" }, category: "Rent", scope: "complement" } as const,
    ]) {
      expect(askV2ProposalSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

function maskedEvidence(e: TurnEvidence) {
  return {
    scenario: e.scenario,
    turn: e.turn,
    message: e.message,
    conversationIdIn: e.conversationIdIn ? `…${e.conversationIdIn.slice(-6)}` : null,
    conversationIdOut: e.conversationIdOut ? `…${e.conversationIdOut.slice(-6)}` : null,
    created: e.created,
    continuity: e.continuity,
    historyTurns: e.historyTurns,
    historyPreview: e.historyPreview,
    interpreterKind: e.interpreterKind,
    schemaValid: e.schemaValid,
    policyDisposition: e.policyDisposition,
    executorIntent: e.executorIntent,
    executorPeriod: e.executorPeriod,
    executorTotalExpenses: e.executorTotalExpenses,
    executorTopCategories: e.executorTopCategories,
    manifestFacts: e.manifestFacts,
    moneyFactId: e.moneyFactId,
    narratorOutcome: e.narratorOutcome,
    grounding: e.grounding,
    anchorPersistedValid: e.anchorPersistedValid,
    anchorIntent: e.anchorIntent,
    anchorCategory: e.anchorCategory,
    anchorTopCategory: e.anchorTopCategory,
    anchorCategoryCount: e.anchorCategoryCount,
    pass: e.pass,
    failureLayer: e.failureLayer,
    note: e.note,
  };
}

describe.skipIf(!dbReady)("ask-v2 Phase 6 evaluation (DB-backed)", () => {
  let tenantContext: DemoTenant | null = tenant;

  beforeAll(async () => {
    // Ensure the tenant is still resolvable at suite start.
    if (!tenantContext) tenantContext = await resolveDemoTenant();
  });

  afterAll(async () => {
    await cleanupCreatedConversations();
  });

  async function runScenario(fixture: ScenarioFixture) {
    if (!tenantContext) throw new Error("tenant required");
    const runtime = createScriptedRuntime();
    let conversationId: string | null = null;
    const turnEvidence: TurnEvidence[] = [];

    for (let i = 0; i < fixture.turns.length; i++) {
      const turn = fixture.turns[i];
      runtime.setTurn(turn.script, turn.narratorMode);
      const evidence = await runTurn({
        scenario: fixture.id,
        turn: i + 1,
        message: turn.message,
        conversationId,
        ctx: {
          prisma: prisma!,
          businessId: tenantContext.business.id,
          currency: tenantContext.business.currency,
        },
        runtime: runtime.runtime,
      });
      if (evidence.conversationIdOut) {
        createdConversations.add(evidence.conversationIdOut);
        conversationId = evidence.conversationIdOut;
      }
      turnEvidence.push(evidence);
      console.log(
        `[eval:${fixture.id}:T${i + 1}] ${JSON.stringify(maskedEvidence(evidence))}`,
      );
    }
    return turnEvidence;
  }

  function assertTurn(
    evidence: TurnEvidence,
    expected: TurnFixture,
    label: string,
  ) {
    expect(
      evidence.finalResponse.length,
      `${label}: non-empty response`,
    ).toBeGreaterThan(0);
    expect(evidence.interpreterKind, `${label}: interpreter kind`).not.toBe(
      "invalid_provider_output",
    );
    expect(evidence.schemaValid, `${label}: schema valid`).toBe(
      expected.expectedSchemaValid,
    );
    expect(evidence.policyDisposition, `${label}: disposition`).toBe(
      expected.expectedDisposition,
    );
    expect(evidence.continuity, `${label}: continuity`).toBe(
      expected.expectedContinuity,
    );
    expect(evidence.pass, `${label}: pipeline pass`).toBe(true);
  }

  it("Scenario A — five-turn original sequence", async () => {
    const ev = await runScenario(scenarioA);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioA.turns[i], `A-T${i + 1}`);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    const t3 = ev[2];
    const t4 = ev[3];
    const t5 = ev[4];

    expect(t1.continuity).toBe("new");
    expect(t1.executorIntent).toBe("spendingDistribution");
    expect(t1.executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(t1.executorTotalExpenses ?? 0).toBeGreaterThan(0);
    expect(t1.manifestFactSummary.some((f) => f.startsWith("category:"))).toBe(
      true,
    );

    expect(t2.continuity).toBe("continued");
    expect(t2.conversationIdOut).toBe(t1.conversationIdOut);
    expect(t2.policyDisposition).toBe("answer");
    expect(t2.executorIntent).toBe("spendingDistribution");
    expect(t2.executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    // Phase 15: the complement answer is real, begins from the same ledger,
    // and speaks about the remaining categories.
    expect(t2.finalResponse).toMatch(/remaining/i);
    expect(t2.manifestFactSummary.some((f) => f.startsWith("category:"))).toBe(
      true,
    );

    expect(t3.continuity).toBe("continued");
    expect(t3.conversationIdOut).toBe(t1.conversationIdOut);
    expect(t3.historyTurns).toBeGreaterThan(0);
    expect(t3.executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));

    expect(t4.continuity).toBe("continued");
    const top = t4.executorTopCategories[0];
    expect(top).toBeDefined();
    expect(top!.amount).toBeGreaterThan(0);
    expect(
      t4.manifestFactSummary.some((f) => f.includes(top!.name)),
      `A-T4: top category ${top!.name} in manifest`,
    ).toBe(true);

    expect(t5.executorPeriod).toBe(JSON.stringify({ kind: "lastMonth" }));
    expect(t5.finalResponse).toContain("July 2026");
  });

  it("Scenario B — explicit period continuity", async () => {
    const ev = await runScenario(scenarioB);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioB.turns[i], `B-T${i + 1}`);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    expect(t1.executorPeriod).toBe(JSON.stringify({ kind: "month", month: 6, year: 2026 }));
    expect(t2.continuity).toBe("continued");
    expect(t2.executorPeriod).toBe(JSON.stringify({ kind: "month", month: 6, year: 2026 }));
    expect(t2.finalResponse).toContain("July 2026");
    expect(t2.executorTotalExpenses).toBe(t1.executorTotalExpenses);
  });

  it("Scenario C — period change uses newest period", async () => {
    const ev = await runScenario(scenarioC);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioC.turns[i], `C-T${i + 1}`);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    const t3 = ev[2];
    expect(t1.executorPeriod).toBe(JSON.stringify({ kind: "month", month: 5, year: 2026 }));
    expect(t2.executorPeriod).toBe(JSON.stringify({ kind: "month", month: 6, year: 2026 }));
    expect(t3.executorPeriod).toBe(JSON.stringify({ kind: "month", month: 6, year: 2026 }));
    expect(t3.historyTurns).toBeGreaterThanOrEqual(2);
    expect(t3.continuity).toBe("continued");
    expect(t2.executorTotalExpenses).not.toBe(t1.executorTotalExpenses);
  });

  it("Scenario D — category follow-up top category", async () => {
    const ev = await runScenario(scenarioD);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioD.turns[i], `D-T${i + 1}`);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    const top1 = t1.executorTopCategories[0];
    const top2 = t2.executorTopCategories[0];
    expect(top1).toBeDefined();
    expect(top2).toBeDefined();
    expect(top2!.name).toBe(top1!.name);
    expect(top2!.amount).toBe(top1!.amount);
    expect(t2.finalResponse).toContain(top1!.name);
  });

  it("Scenario E — clarification turns are not persisted (context loss)", async () => {
    const ev = await runScenario(scenarioE);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioE.turns[i], `E-T${i + 1}`);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    expect(t1.continuity).toBe("none");
    expect(t1.conversationIdOut).toBeNull();
    expect(t1.policyDisposition).toBe("clarification");
    expect(t2.historyTurns).toBe(0);
    expect(t2.conversationIdOut).toBeNull();
    expect(t2.policyDisposition).toBe("clarification");
  });

  it("Scenario F — conversation isolation (independent histories)", async () => {
    if (!tenantContext) throw new Error("tenant required");
    const runtime = createScriptedRuntime();

    // Convo 1
    runtime.setTurn(scenarioF.turns[0].script, scenarioF.turns[0].narratorMode);
    const c1t1 = await runTurn({
      scenario: "F",
      turn: 1,
      message: scenarioF.turns[0].message,
      conversationId: null,
      ctx: {
        prisma: prisma!,
        businessId: tenantContext.business.id,
        currency: tenantContext.business.currency,
      },
      runtime: runtime.runtime,
    });
    createdConversations.add(c1t1.conversationIdOut!);
    assertTurn(c1t1, scenarioF.turns[0], "F-C1-T1");

    // Convo 2 begins fresh — must NOT see convo1 history.
    runtime.setTurn(scenarioFConvo2.script, scenarioFConvo2.narratorMode);
    const c2t1 = await runTurn({
      scenario: "F",
      turn: 1,
      message: scenarioFConvo2.message,
      conversationId: null,
      ctx: {
        prisma: prisma!,
        businessId: tenantContext.business.id,
        currency: tenantContext.business.currency,
      },
      runtime: runtime.runtime,
    });
    createdConversations.add(c2t1.conversationIdOut!);
    assertTurn(c2t1, scenarioFConvo2, "F-C2-T1");

    expect(c2t1.conversationIdOut).not.toBe(c1t1.conversationIdOut);
    expect(c2t1.historyTurns).toBe(0);

    // Convo2 follow-up sees only ITS OWN history.
    runtime.setTurn(
      scenarioFConvo2FollowUp.script,
      scenarioFConvo2FollowUp.narratorMode,
    );
    const c2t2 = await runTurn({
      scenario: "F",
      turn: 2,
      message: scenarioFConvo2FollowUp.message,
      conversationId: c2t1.conversationIdOut,
      ctx: {
        prisma: prisma!,
        businessId: tenantContext.business.id,
        currency: tenantContext.business.currency,
      },
      runtime: runtime.runtime,
    });
    assertTurn(c2t2, scenarioFConvo2FollowUp, "F-C2-T2");

    expect(c2t2.historyTurns).toBeGreaterThan(0);
    // Convo2's history must contain only its own exchange. The June figure
    // legitimately appears inside convo2's July assistant reply as a period
    // comparison, so assert leaks at the user-message boundary instead.
    expect(
      c2t2.historyPreview
        .filter((h) => h.role === "user")
        .every((h) => !h.content.includes("June")),
      "convo2 user-role history must not leak convo1's June question",
    ).toBe(true);
    expect(c2t2.finalResponse).toContain("July 2026");
  });

  it("Scenario G — tenant isolation (multi-tenant)", async () => {
    if (!prisma || !tenantContext) throw new Error("tenant required");

    // Create a temp second business under the demo user with a single
    // known expense so isolation is assertable.
    const tempBusiness = await prisma.business.create({
      data: {
        userId: tenantContext.user.id,
        name: "Eval Temp Business",
        type: "retail",
        country: "NG",
        currency: "NGN",
        size: "small",
        goals: [],
      },
      select: { id: true, currency: true },
    });

    try {
      const signature = {
        date: "2026-07-15",
        description: "EVAL TEMP BUSINESS EXPENSE ONLY",
        amount: "123456.00",
        type: "expense" as const,
        reference: "eval-g-001",
      };
      await prisma.transaction.create({
        data: {
          businessId: tempBusiness.id,
          date: new Date("2026-07-15T00:00:00Z"),
          description: signature.description,
          amount: signature.amount,
          type: signature.type,
          source: "manual",
          reference: signature.reference,
          fingerprint: transactionFingerprint({
            date: signature.date,
            type: signature.type,
            description: signature.description,
            amount: signature.amount,
            reference: signature.reference,
          }),
        },
      });

      const runtime = createScriptedRuntime();
      runtime.setTurn(scenarioG.turns[0].script, scenarioG.turns[0].narratorMode);
      const evidence = await runTurn({
        scenario: "G",
        turn: 1,
        message: scenarioG.turns[0].message,
        conversationId: null,
        ctx: {
          prisma,
          businessId: tempBusiness.id,
          currency: tempBusiness.currency,
        },
        runtime: runtime.runtime,
      });
      createdConversations.add(evidence.conversationIdOut!);
      assertTurn(evidence, scenarioG.turns[0], "G-T1");
      expect(evidence.executorTotalExpenses).toBe(123456);
      expect(evidence.finalResponse).toContain("123,456");

      // Cross-business ownership: the demo business's conversation id must
      // NOT be owned by the temp business.
      const probe = await runTurn({
        scenario: "G",
        turn: 2,
        message: "What did I spend last month?",
        conversationId: evidence.conversationIdOut,
        ctx: {
          prisma,
          businessId: tenantContext.business.id,
          currency: tenantContext.business.currency,
        },
        runtime: runtime.runtime,
      });
      expect(probe.interpreterKind).toBe("gone");
      expect(probe.pass).toBe(true);
    } finally {
      await prisma.assistantConversation.deleteMany({
        where: { businessId: tempBusiness.id },
      });
      await prisma.transaction.deleteMany({
        where: { businessId: tempBusiness.id },
      });
      await prisma.business.delete({ where: { id: tempBusiness.id } });
    }
  });

  it("Scenario H — golden transcript (Phase 9B expected decisions)", async () => {
    const ev = await runScenario(scenarioH);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioH.turns[i], `H-T${i + 1}`);
    }
    expect(ev[0].continuity).toBe("new");
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i].continuity).toBe("continued");
    }
    expect(ev[0].executorIntent).toBe("spendingDistribution");
    expect(ev[0].executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(ev[1].executorIntent).toBe("categorySpend");
    expect(ev[1].executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(ev[2].executorIntent).toBe("spendingDistribution");
    expect(ev[2].executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(ev[3].executorIntent).toBe("spendingDistribution");
    expect(ev[3].executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(ev[4].executorIntent).toBe("expenses");
    expect(ev[4].executorPeriod).toBe(JSON.stringify({ kind: "lastMonth" }));

    // Phase 9E: every golden answer turn persisted a VALID verified anchor,
    // and T2's referenced category resolved from T1's verified category set
    // (not from narrator text).
    for (let i = 0; i < ev.length; i++) {
      expect(ev[i].anchorPersistedValid, `H-T${i + 1}: verified anchor persisted`).toBe(true);
    }
    expect(ev[0].anchorIntent).toBe("spendingDistribution");
    expect(ev[0].anchorCategory).toBeNull();
    expect(ev[0].anchorCategoryCount).toBeGreaterThan(0);
    expect(ev[0].anchorTopCategory).toBe(ev[0].executorTopCategories[0]?.name ?? null);
    expect(ev[1].anchorIntent).toBe("categorySpend");
    expect(ev[1].anchorCategory?.toLowerCase()).toBe("inventory");
    expect(ev[2].anchorIntent).toBe("spendingDistribution");
    expect(ev[2].anchorCategory).toBeNull();
    expect(ev[4].anchorIntent).toBe("expenses");
  });

  it("Scenario I — Phase 15 category-complement golden transcript", async () => {
    const ev = await runScenario(scenarioI);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioI.turns[i], `I-T${i + 1}`);
    }
    expect(ev[0].continuity).toBe("new");
    // Every complement turn is a REAL answer on the SAME conversation.
    for (let i = 1; i < ev.length; i++) {
      expect(ev[i].continuity).toBe("continued");
      expect(ev[i].conversationIdOut).toBe(ev[0].conversationIdOut);
      expect(ev[i].policyDisposition).toBe("answer");
    }
    // All five persist a verified spendingDistribution anchor.
    for (let i = 0; i < ev.length; i++) {
      expect(ev[i].anchorPersistedValid, `I-T${i + 1}: verified anchor persisted`).toBe(true);
      expect(ev[i].anchorIntent).toBe("spendingDistribution");
      expect(ev[i].executorIntent).toBe("spendingDistribution");
    }
    // T4 (excluding) resolved 'rent' against the verified anchor category set.
    expect(ev[3].anchorCategory).toBeNull(); // spendingDistribution anchor has no category
    expect(ev[3].finalResponse).toMatch(/Apart from Rent/i);
    expect(ev[1].finalResponse).toMatch(/remaining/i);
    expect(ev[2].finalResponse).toMatch(/remaining|other/i);
    // The complement manifest carries the combined figure + members (grounded).
    expect(ev[1].grounding).toBe("grounded");
    expect(ev[1].manifestFacts).toBeGreaterThanOrEqual(3);
  });

  it("Scenario J — literal category Other stays a normal category", async () => {
    const ev = await runScenario(scenarioJ);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioJ.turns[i], `J-T${i + 1}`);
    }
    expect(ev[0].continuity).toBe("new");
    expect(ev[0].executorIntent).toBe("categorySpend");
    expect(ev[0].executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(ev[0].anchorCategory?.toLowerCase()).toBe("other");
    expect(ev[0].finalResponse).toMatch(/Other/i);
    expect(ev[0].grounding).toBe("grounded");
    // T2 proves the complement NEVER leaks into a fresh non-distribution
    // conversation: with no shown aggregate the policy asks for clarification
    // instead of inventing a remainder.
    expect(ev[1].policyDisposition).toBe("clarification");
    expect(ev[1].continuity).toBe("none");
    expect(ev[1].conversationIdOut).toBeNull();
    expect(ev[1].finalResponse.length).toBeGreaterThan(0);
  });

  it("Scenario K — Phase 17 category share transcript", async () => {
    const ev = await runScenario(scenarioK);
    for (let i = 0; i < ev.length; i++) {
      assertTurn(ev[i], scenarioK.turns[i], `K-T${i + 1}`);
    }

    function expectedSharePct(idx: number, name: string): number {
      // The manifest percent fact is the single certified share for this answer
      // ("percent:2%") — the truth the deterministic narration must display.
      const fact = ev[idx].manifestFactSummary.find((f) => f.startsWith("percent:"));
      const m = fact ? /^percent:(\d+)%$/.exec(fact) : null;
      if (m) return Number(m[1]);
      // Fallback (no percent fact, e.g. zero-share on an empty period): derive
      // from the verified category totals the same way the engine does.
      const total = ev[idx].executorTotalExpenses ?? 0;
      const cat = ev[idx].executorTopCategories.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (total <= 0) return 0;
      return Math.round(((cat?.amount ?? 0) / total) * 100);
    }

    const t1 = ev[0];
    const t2 = ev[1];
    const t3 = ev[2];
    const t4 = ev[3];
    const t5 = ev[4];

    // T1 — a FRESH explicit share of this year's spending: categoryShare intent,
    // a trusted % of 2026 spending, verified anchor carrying the category.
    expect(t1.executorIntent).toBe("categoryShare");
    expect(t1.executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(t1.anchorPersistedValid).toBe(true);
    expect(t1.anchorIntent).toBe("categoryShare");
    expect(t1.anchorCategory?.toLowerCase()).toBe("inventory");
    expect(t1.anchorCategoryCount).toBeGreaterThan(0);
    const t1Share = expectedSharePct(0, "Inventory");
    expect(t1.finalResponse).toMatch(/Spending on inventory in 2026 was/i);
    expect(t1.finalResponse).toContain(`${t1Share}% of 2026 spending`);
    expect(t1.grounding).toBe("grounded");

    // T2 — the referenced "rent" share resolved from T1's VERIFIED anchor set and
    // reports rent's own trusted share, on the SAME conversation.
    expect(t2.continuity).toBe("continued");
    expect(t2.conversationIdOut).toBe(t1.conversationIdOut);
    expect(t2.executorIntent).toBe("categoryShare");
    expect(t2.executorPeriod).toBe(JSON.stringify({ kind: "thisYear" }));
    expect(t2.anchorPersistedValid).toBe(true);
    expect(t2.anchorIntent).toBe("categoryShare");
    expect(t2.anchorCategory?.toLowerCase()).toBe("rent");
    const t2Share = expectedSharePct(1, "Rent");
    expect(t2.finalResponse).toMatch(/Spending on rent in 2026 was/i);
    expect(t2.finalResponse).toContain(`${t2Share}% of 2026 spending`);
    expect(t2.grounding).toBe("grounded");

    // T3 — an AMOUNT follow-up must stay a trusted figure (categorySpend), never
    // silently become a share.
    expect(t3.continuity).toBe("continued");
    expect(t3.executorIntent).toBe("categorySpend");
    expect(t3.anchorCategory?.toLowerCase()).toBe("inventory");
    expect(t3.finalResponse).toMatch(/Spending on inventory in 2026 was/i);
    expect(t3.finalResponse).not.toContain("% of 2026 spending");
    expect(t3.grounding).toBe("grounded");

    // T4 — the excluding complement still runs against the share-established
    // verified category set (never a guess).
    expect(t4.continuity).toBe("continued");
    expect(t4.executorIntent).toBe("spendingDistribution");
    expect(t4.finalResponse).toMatch(/Apart from Rent/i);
    expect(t4.grounding).toBe("grounded");

    // T5 — a literal "other" share stays a category share with its own verified
    // percent (tiny but real), never the complement remainder.
    expect(t5.continuity).toBe("continued");
    expect(t5.executorIntent).toBe("categoryShare");
    expect(t5.anchorCategory?.toLowerCase()).toBe("other");
    const t5Share = expectedSharePct(4, "Other");
    expect(t5.finalResponse).toMatch(/other/i);
    expect(t5.finalResponse).toContain(`${t5Share}% of 2026 spending`);
    expect(t5.grounding).toBe("grounded");
  });
});

// Print masked scenario evidence for the report when running the suite
// directly with the DB available.
if (dbReady) {
  console.log("ask-v2 Phase 6 evaluation: DB-backed suite enabled.");
} else {
  console.log(
    "ask-v2 Phase 6 evaluation: skipped (DATABASE_URL or demo tenant unavailable).",
  );
}