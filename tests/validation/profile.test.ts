import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "@/lib/validation/profile";

describe("profileUpdateSchema", () => {
  it("accepts a trimmed non-empty name", () => {
    const parsed = profileUpdateSchema.parse({ name: "  Ada Lovelace  " });
    expect(parsed.name).toBe("Ada Lovelace");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(profileUpdateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(
      profileUpdateSchema.safeParse({ name: "x".repeat(121) }).success,
    ).toBe(false);
  });
});