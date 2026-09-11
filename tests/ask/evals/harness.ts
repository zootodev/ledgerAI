import { expect } from "vitest";

export interface EvalCase {
  label: string;
  question: string;
  expected: { kind: "answer" | "clarification" | "unsupported"; contains?: string[]; absent?: string[] };
}

export interface EvalFixture {
  improved: string;
  gating: string;
  fallback: string;
  clarity: string;
}

export interface EvalRunnerResult {
  label: string;
  kind: string;
  text: string;
  generatedBy: "deterministic" | "fixture";
}

/** One evaluated turn: the runner resolves whether the fixture won. */
export function assertCase(result: EvalRunnerResult, case_: EvalCase) {
  const { label, expected } = case_;
  expect(result.kind, label).toBe(expected.kind);
  if (result.kind === "answer") {
    for (const needle of expected.contains ?? []) {
      expect(result.text, `${label} should cite ${needle}`).toContain(needle);
    }
    for (const needle of expected.absent ?? []) {
      expect(result.text, `${label} must not cite ${needle}`).not.toContain(needle);
    }
  }
}

/** Assert a fixture's proposal conforms to the trusted interpreter contract. */
export function assertFixtureContract(fixture: EvalFixture) {
  expect(fixture.improved.length).toBeGreaterThan(0);
  expect(fixture.gating.length).toBeGreaterThan(0);
  expect(fixture.fallback.length).toBeGreaterThan(0);
  expect(fixture.clarity.length).toBeGreaterThan(0);
}