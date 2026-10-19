import { describe, expect, it, vi } from "vitest";
import { isTransientPrismaError, retryOnTransient } from "@/lib/db/transient";

describe("isTransientPrismaError", () => {
  it("recognises the connection error codes we retry", () => {
    for (const code of ["P1001", "P1002", "P1017", "P2024"]) {
      expect(isTransientPrismaError({ code })).toBe(true);
    }
  });

  it("recognises a pool / connection message even without a code", () => {
    expect(
      isTransientPrismaError(
        new Error("Timed out fetching a new connection from the connection pool"),
      ),
    ).toBe(true);
    expect(isTransientPrismaError(new Error("Server has closed the connection"))).toBe(true);
    expect(isTransientPrismaError(new Error("connect ETIMEDOUT 1.2.3.4:5432"))).toBe(true);
  });

  it("looks through an error cause chain (driver adapter)", () => {
    const wrapped = { message: "DriverAdapterError", cause: { code: "P1017" } };
    expect(isTransientPrismaError(wrapped)).toBe(true);
  });

  it("does NOT treat a real query/validation error as transient", () => {
    expect(isTransientPrismaError({ code: "P2002" })).toBe(false);
    expect(isTransientPrismaError(new Error("Unique constraint failed"))).toBe(false);
    expect(isTransientPrismaError(null)).toBe(false);
    expect(isTransientPrismaError("boom")).toBe(false);
  });
});

describe("retryOnTransient", () => {
  it("retries once and returns the second result", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ code: "P1017" })
      .mockResolvedValueOnce("ok");

    await expect(retryOnTransient(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-transient error without retrying", async () => {
    const error = new Error("Unique constraint failed");
    const operation = vi.fn().mockRejectedValue(error);

    await expect(retryOnTransient(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured attempts and rethrows", async () => {
    const operation = vi.fn().mockRejectedValue({ code: "P1001" });

    await expect(retryOnTransient(operation, { attempts: 2 })).rejects.toEqual({
      code: "P1001",
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("reports the retry through onRetry", async () => {
    const onRetry = vi.fn();
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ code: "P1001" })
      .mockResolvedValueOnce(1);

    await retryOnTransient(operation, { onRetry });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
