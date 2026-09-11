import { describe, expect, it } from "vitest";
import { groupConversationsByRecency } from "@/lib/ask/group-history";

interface Item {
  id: string;
  updatedAt: string;
}

// Clock set to a fixed LOCAL time; helpers derive local calendar days so the
// bucket boundaries hold regardless of the test machine's timezone.
const NOW = new Date();
NOW.setHours(14, 0, 0, 0);

function isoDaysAgo(daysAgo: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 12, 0, 0);
  return d.toISOString();
}

function item(id: string, updatedAt: string): Item {
  return { id, updatedAt };
}

describe("groupConversationsByRecency", () => {
  it("returns empty buckets for an empty list", () => {
    expect(groupConversationsByRecency([], NOW)).toEqual([]);
  });

  it("groups by local calendar day into Today, Yesterday, Earlier", () => {
    const items = [
      item("earlier", isoDaysAgo(9)),
      item("yesterday", isoDaysAgo(1)),
      item("today", isoDaysAgo(0)),
    ];

    const buckets = groupConversationsByRecency(items, NOW);
    expect(buckets.map((b) => b.label)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(buckets[0].items.map((i) => i.id)).toEqual(["today"]);
    expect(buckets[1].items.map((i) => i.id)).toEqual(["yesterday"]);
    expect(buckets[2].items.map((i) => i.id)).toEqual(["earlier"]);
  });

  it("preserves input order within a bucket", () => {
    const items = [item("a", isoDaysAgo(2)), item("b", isoDaysAgo(1)), item("c", isoDaysAgo(0))];
    const buckets = groupConversationsByRecency(items, NOW);
    expect(buckets[0].items.map((i) => i.id)).toEqual(["c"]);
    expect(buckets[1].items.map((i) => i.id)).toEqual(["b"]);
    expect(buckets[2].items.map((i) => i.id)).toEqual(["a"]);
  });

  it("collapses empty buckets", () => {
    const sameDay = [item("a", isoDaysAgo(0)), item("b", isoDaysAgo(0))];
    const buckets = groupConversationsByRecency(sameDay, NOW);
    expect(buckets.map((b) => b.label)).toEqual(["Today"]);
    expect(buckets[0].items).toHaveLength(2);
  });

  it("treats earlier-than-yesterday as Earlier regardless of depth", () => {
    const buckets = groupConversationsByRecency([item("old", isoDaysAgo(400))], NOW);
    expect(buckets.map((b) => b.label)).toEqual(["Earlier"]);
  });
});