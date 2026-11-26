import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { restoreApplyAllowed, restoreApplyBlockReason } from "../../scripts/confirmation";
import { BACKUP_DIR, snapshotFileName, writeRowSnapshot } from "../../scripts/snapshot";

const temporaryDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ledgerai-snapshot-test-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("restore confirmation flag", () => {
  it("blocks an ambiguous apply unless the owner confirms no accepts", () => {
    expect(restoreApplyAllowed(true, false)).toBe(false);
    expect(restoreApplyBlockReason(true, false)).toMatch(/--confirm-no-owner-accepts/);

    expect(restoreApplyAllowed(true, true)).toBe(true);
    expect(restoreApplyBlockReason(true, true)).toBeNull();
  });

  it("allows an unambiguous apply without the flag", () => {
    expect(restoreApplyAllowed(false, false)).toBe(true);
    expect(restoreApplyBlockReason(false, false)).toBeNull();
  });
});

describe("pre-apply row snapshot", () => {
  it("writes a verified JSON snapshot outside the repo with the exact row fields", async () => {
    const dir = await tempDir();
    const when = new Date("2026-11-26T15:30:00.000Z");
    const rows = [
      {
        id: "txn-1",
        type: "income",
        categoryId: "cat-1",
        aiConfidence: null,
        updatedAt: "2026-11-26T11:45:00.000Z",
      },
      {
        id: "txn-2",
        type: "expense",
        categoryId: null,
        aiConfidence: "0.9400",
        updatedAt: "2026-11-26T12:05:00.000Z",
      },
    ];

    const file = await writeRowSnapshot(
      "restore-test-accepted-review",
      "biz-1",
      rows,
      { directory: dir, now: when },
    );

    expect(file).toBe(path.join(dir, snapshotFileName("restore-test-accepted-review", when)));
    expect(path.basename(file)).toContain("restore-test-accepted-review-2026-11-26T15-30-00-000Z.json");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      script: "restore-test-accepted-review",
      businessId: "biz-1",
      capturedAt: when.toISOString(),
      rowCount: 2,
      rows,
    });
    expect(BACKUP_DIR).toBe(String.raw`C:\Users\HP\ledgerai-backups`);
  });

  it("throws before apply when the snapshot cannot be written", async () => {
    const dir = await tempDir();
    const blocker = path.join(dir, "not-a-directory");
    await writeFile(blocker, "occupied", "utf8");

    await expect(
      writeRowSnapshot("fix-airtime-type", "biz-1", [], { directory: blocker }),
    ).rejects.toThrow();
  });
});
