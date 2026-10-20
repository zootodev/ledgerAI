import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMPORT_LOAD_RETRY_DELAY_MS,
  retryImportLoad,
} from "@/lib/import/load-retry";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("retryImportLoad", () => {
  it("retries once after the 300ms delay, then returns the value", async () => {
    expect(IMPORT_LOAD_RETRY_DELAY_MS).toBe(300);
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ code: "P1001" })
      .mockResolvedValueOnce("ok");

    const result = retryImportLoad(operation);
    const assertion = expect(result).resolves.toBe("ok");
    // Let the first rejection settle and the retry timer be scheduled.
    await vi.advanceTimersByTimeAsync(0);
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(IMPORT_LOAD_RETRY_DELAY_MS - 1);
    expect(operation).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries a session-pool exhaustion error", async () => {
    const error = new Error(
      "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15",
    );
    const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(42);

    const result = retryImportLoad(operation);
    const assertion = expect(result).resolves.toBe(42);
    await vi.advanceTimersByTimeAsync(IMPORT_LOAD_RETRY_DELAY_MS);

    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-transient error", async () => {
    const error = new Error("Unique constraint failed");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryImportLoad(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry and rethrows the last error", async () => {
    const operation = vi.fn().mockRejectedValue({ code: "P1017" });

    const result = retryImportLoad(operation);
    const assertion = expect(result).rejects.toEqual({ code: "P1017" });
    await vi.advanceTimersByTimeAsync(IMPORT_LOAD_RETRY_DELAY_MS);

    await assertion;
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
