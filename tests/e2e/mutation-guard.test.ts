import { describe, expect, it } from "vitest";
import { mutationTargetAllowed } from "../../e2e/mutation-guard";

describe("mutationTargetAllowed", () => {
  it("skips without the explicit opt-in, even on localhost", () => {
    expect(mutationTargetAllowed({ BASE_URL: "http://localhost:3000" })).toBe(false);
  });

  it("allows an opted-in localhost or loopback target", () => {
    expect(
      mutationTargetAllowed({ E2E_ALLOW_MUTATION: "1", BASE_URL: "http://localhost:3000" }),
    ).toBe(true);
    expect(
      mutationTargetAllowed({ E2E_ALLOW_MUTATION: "1", BASE_URL: "http://127.0.0.1:3000" }),
    ).toBe(true);
  });

  it("never allows a production host via the opt-in alone", () => {
    expect(
      mutationTargetAllowed({
        E2E_ALLOW_MUTATION: "1",
        BASE_URL: "https://ledgerai-zootodev.vercel.app",
      }),
    ).toBe(false);
  });

  it("allows only exact hosts named in E2E_SAFE_HOSTS", () => {
    const env = {
      E2E_ALLOW_MUTATION: "1",
      BASE_URL: "https://seeded-test.local:3000",
      E2E_SAFE_HOSTS: "https://seeded-test.local, other-test.local",
    };
    expect(mutationTargetAllowed(env)).toBe(true);
    expect(
      mutationTargetAllowed({ ...env, BASE_URL: "https://seeded-test.local.evil.example" }),
    ).toBe(false);
  });

  it("rejects a malformed BASE_URL", () => {
    expect(mutationTargetAllowed({ E2E_ALLOW_MUTATION: "1", BASE_URL: "not-a-url" })).toBe(false);
  });
});
