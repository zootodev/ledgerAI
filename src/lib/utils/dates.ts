/** Date display helpers. Stored values stay ISO; only presentation changes. */

const DATE_FORMAT = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-NG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-10-01" -> "1 Oct 2026". Invalid values pass through unchanged. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (!ISO_DAY.test(iso)) return iso;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** "2026-10-01T09:15:00Z" -> "1 Oct 2026, 9:15 am" in en-NG. */
export function formatIsoDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME_FORMAT.format(date);
}

/** ISO day for a text input: "2026-10-01" -> "01/10/2026". */
export function formatIsoDateInput(iso: string | null | undefined): string {
  if (!iso || !ISO_DAY.test(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Parse "1/10/2026" or "01/10/2026" into "2026-10-01"; null when invalid. */
export function parseDisplayDate(value: string): string | null {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return ISO_DAY.test(iso) ? iso : null;
}
