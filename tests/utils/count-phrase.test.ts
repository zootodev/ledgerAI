import { describe, expect, it } from "vitest";
import { countPhrase } from "@/lib/utils/pluralise";

describe("countPhrase", () => {
  it("agrees with a following verb for one and many", () => {
    expect(countPhrase(1, "transaction", { verb: ["has", "have"] })).toBe("1 transaction has");
    expect(countPhrase(2, "transaction", { verb: ["has", "have"] })).toBe("2 transactions have");
    expect(countPhrase(1, "transaction", { verb: ["was", "were"] })).toBe("1 transaction was");
    expect(countPhrase(3, "transaction", { verb: ["was", "were"] })).toBe("3 transactions were");
  });

  it("pluralises multi-word nouns", () => {
    expect(countPhrase(1, "invalid row")).toBe("1 invalid row");
    expect(countPhrase(2, "invalid row")).toBe("2 invalid rows");
  });

  it("accepts an explicit plural", () => {
    expect(countPhrase(1, "category", { plural: "categories" })).toBe("1 category");
    expect(countPhrase(2, "category", { plural: "categories" })).toBe("2 categories");
  });
});
