// ============================================================
// Pre-apply JSON snapshots for one-off production repairs
// ------------------------------------------------------------
// Snapshots live OUTSIDE the repository. A failed or partial write throws
// before any transaction starts, so an apply can never outlive its backup.
// ============================================================

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const BACKUP_DIR = String.raw`C:\Users\HP\ledgerai-backups`;

export interface SnapshotRow {
  id: string;
  type: string;
  categoryId: string | null;
  aiConfidence: string | null;
  updatedAt: string;
}

export function snapshotFileName(scriptName: string, when: Date): string {
  return `${scriptName}-${when.toISOString().replace(/[:.]/g, "-")}.json`;
}

export interface SnapshotOptions {
  directory?: string;
  now?: Date;
}

/** Write and verify a snapshot; throws before apply if anything fails. */
export async function writeRowSnapshot(
  scriptName: string,
  businessId: string,
  rows: SnapshotRow[],
  options: SnapshotOptions = {},
): Promise<string> {
  const directory = options.directory ?? BACKUP_DIR;
  const when = options.now ?? new Date();
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, snapshotFileName(scriptName, when));
  const payload = {
    script: scriptName,
    businessId,
    capturedAt: when.toISOString(),
    rowCount: rows.length,
    rows,
  };

  // `wx` refuses to overwrite an existing file, so two applies in the same
  // millisecond cannot silently clobber a backup.
  await writeFile(file, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    flag: "wx",
  });
  const written = JSON.parse(await readFile(file, "utf8")) as { rowCount: number };
  if (written.rowCount !== rows.length) {
    throw new Error(`Snapshot verification failed: ${file}`);
  }
  return file;
}
