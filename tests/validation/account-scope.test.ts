import { describe, expect, it } from "vitest";
import {
  resolveAccountScope,
  urlWithoutAccountId,
} from "@/lib/validation/account-scope";

const OWNED = "11111111-1111-4111-8111-111111111111";
const OWNED_2 = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "99999999-9999-4999-8999-999999999999";

describe("resolveAccountScope", () => {
  it("treats an absent accountId as business-wide (not rejected)", () => {
    expect(resolveAccountScope(undefined, [OWNED])).toEqual({ rejected: false });
  });

  it("honours a single, well-formed, owned account id", () => {
    expect(resolveAccountScope(OWNED, [OWNED, OWNED_2])).toEqual({
      accountId: OWNED,
      rejected: false,
    });
  });

  it("rejects a foreign but well-formed account id", () => {
    expect(resolveAccountScope(FOREIGN, [OWNED])).toEqual({ rejected: true });
  });

  it("rejects a malformed account id", () => {
    expect(resolveAccountScope("not-a-uuid", [OWNED])).toEqual({ rejected: true });
  });

  it("rejects an empty account id", () => {
    expect(resolveAccountScope("", [OWNED])).toEqual({ rejected: true });
  });

  it("rejects a repeated account id param even when one value is owned", () => {
    expect(resolveAccountScope([OWNED, FOREIGN], [OWNED])).toEqual({ rejected: true });
  });

  it("rejects a repeated account id param even when both values are owned", () => {
    expect(resolveAccountScope([OWNED, OWNED_2], [OWNED, OWNED_2])).toEqual({
      rejected: true,
    });
  });
});

describe("urlWithoutAccountId", () => {
  it("drops only accountId and preserves the date range", () => {
    expect(
      urlWithoutAccountId("/reports", {
        from: "2026-09-01",
        to: "2026-09-30",
        accountId: FOREIGN,
      }),
    ).toBe("/reports?from=2026-09-01&to=2026-09-30");
  });

  it("returns the bare path when nothing else remains", () => {
    expect(urlWithoutAccountId("/transactions", { accountId: FOREIGN })).toBe(
      "/transactions",
    );
  });

  it("preserves repeated non-account params verbatim", () => {
    expect(
      urlWithoutAccountId("/transactions", {
        type: ["income", "expense"],
        accountId: FOREIGN,
      }),
    ).toBe("/transactions?type=income&type=expense");
  });

  it("skips empty string values", () => {
    expect(
      urlWithoutAccountId("/transactions", { search: "", accountId: FOREIGN }),
    ).toBe("/transactions");
  });
});
