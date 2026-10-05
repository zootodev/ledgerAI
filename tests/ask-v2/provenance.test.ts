import { describe, expect, it } from "vitest";
import { verifyGoalImpactDeltaProvenance } from "@/lib/ask-v2/provenance";

const NOW = new Date("2026-08-15T12:00:00Z");

function verify(message: string, delta: number) {
  return verifyGoalImpactDeltaProvenance({ message, delta, now: NOW });
}

describe("verifyGoalImpactDeltaProvenance — F-1 delta provenance", () => {
  it("accepts an explicit matching decrease (currency-formatted)", () => {
    const result = verify("What if I spent ₦50,000 less on Food this month?", -50000);
    expect(result).toEqual({ ok: true, amount: 50000, operation: "decrease" });
  });

  it("accepts an explicit matching increase", () => {
    const result = verify("What if I spent ₦120,000 more on Rent this year?", 120000);
    expect(result).toEqual({ ok: true, amount: 120000, operation: "increase" });
  });

  it("rejects a delta whose magnitude differs from the user's stated amount", () => {
    const result = verify("What if I spent ₦10,000 less on Food this month?", -50000);
    expect(result).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("rejects an invented delta when the user stated no amount at all", () => {
    const result = verify("What if I spent less on Food this month?", -50000);
    expect(result).toEqual({ ok: false, reason: "no_user_amount" });
  });

  it("locates the change amount among multiple figures (cut part, not base)", () => {
    const proposal = "If I cut Rent by 20,000 from the 120,000 I spent last month, what happens?";
    expect(verify(proposal, -20000)).toEqual({ ok: true, amount: 20000, operation: "decrease" });
    expect(verify(proposal, -120000)).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("localizes the change amount by sentence, not 'first number wins'", () => {
    const reversed = "I spent 120000 last month. What if I spent 5000 less?";
    expect(verify(reversed, -5000)).toEqual({ ok: true, amount: 5000, operation: "decrease" });
    expect(verify(reversed, -120000)).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("accepts currency spellings and suffixes", () => {
    expect(verify("What if I spent ₦5k less on Food?", -5000)).toEqual({ ok: true, amount: 5000, operation: "decrease" });
    expect(verify("What if I spent NGN 40,000 less on Food?", -40000)).toEqual({ ok: true, amount: 40000, operation: "decrease" });
    expect(verify("What if I spent more on Rent by 3 thousand this year?", 3000)).toEqual({ ok: true, amount: 3000, operation: "increase" });
  });

  it("accepts a decimal amount cents-exactly", () => {
    const result = verify("What if I spent 5,000.50 less on Food?", -5000.5);
    expect(result).toEqual({ ok: true, amount: 5000.5, operation: "decrease" });
  });

  it("rejects a decrease claim carrying a positive delta", () => {
    const result = verify("What if I spent ₦50,000 less on Food this month?", 50000);
    expect(result).toEqual({ ok: false, reason: "direction_mismatch" });
  });

  it("rejects an increase claim carrying a negative delta", () => {
    const result = verify("What if I spent ₦120,000 more on Rent?", -120000);
    expect(result).toEqual({ ok: false, reason: "direction_mismatch" });
  });

  it("does not take a comparative/current figure as the change amount", () => {
    const result = verify("What if I spent less on Food? I currently spend ₦80,000 there.", -80000);
    expect(result).toEqual({ ok: false, reason: "no_user_amount" });
  });

  it("rejects non-goal-impact wording entirely", () => {
    expect(verify("How much did I spend last month?", -50000)).toEqual({ ok: false, reason: "not_goal_impact" });
    expect(verify("What if I spent 50,000 on rent instead?", -50000)).toEqual({ ok: false, reason: "not_goal_impact" });
  });

  it("treats a missing message as unprovable", () => {
    expect(verify("", -50000)).toEqual({ ok: false, reason: "no_user_amount" });
  });
});