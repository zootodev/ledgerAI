// Pure, testable history grouping. Buckets are calendar-day based in the
// viewer's local timezone so "Today" reflects what the reader sees.

export interface RecencyBucket<T> {
  label: "Today" | "Yesterday" | "Earlier";
  items: T[];
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Group a newest-first conversation list into Today / Yesterday / Earlier. */
export function groupConversationsByRecency<T extends { updatedAt: string }>(
  items: T[],
  now: Date = new Date(),
): RecencyBucket<T>[] {
  if (items.length === 0) return [];

  const today = localDayKey(now);
  const yesterday = localDayKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );

  const buckets: RecencyBucket<T>[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const item of items) {
    const day = localDayKey(new Date(item.updatedAt));
    if (day === today) buckets[0].items.push(item);
    else if (day === yesterday) buckets[1].items.push(item);
    else buckets[2].items.push(item);
  }

  return buckets.filter((b) => b.items.length > 0);
}