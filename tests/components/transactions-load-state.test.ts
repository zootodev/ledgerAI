import { describe, expect, it } from "vitest";
import {
  summarizeTransactionLoads,
  TRANSACTIONS_LOAD_ERROR,
  type SettledLoad,
} from "@/components/transactions/transactions-load-state";

const ok = (): SettledLoad => ({ status: "fulfilled", value: [] });
const fail = (): SettledLoad => ({
  status: "rejected",
  reason: new Error("db down"),
});

describe("summarizeTransactionLoads", () => {
  it("reports no errors when every load succeeds", () => {
    expect(summarizeTransactionLoads(ok(), ok(), ok())).toEqual({
      loadError: null,
      accountsError: null,
      categoriesError: null,
    });
  });

  it("keeps the full error state when the transactions list itself fails", () => {
    expect(summarizeTransactionLoads(fail(), ok(), ok())).toEqual({
      loadError: TRANSACTIONS_LOAD_ERROR,
      accountsError: null,
      categoriesError: null,
    });
  });

  it("keeps the list visible with an accounts-only warning", () => {
    expect(summarizeTransactionLoads(ok(), fail(), ok())).toEqual({
      loadError: null,
      accountsError: "The account list couldn't be loaded.",
      categoriesError: null,
    });
  });

  it("keeps the list visible with a categories-only warning", () => {
    expect(summarizeTransactionLoads(ok(), ok(), fail())).toEqual({
      loadError: null,
      accountsError: null,
      categoriesError: "The category list couldn't be loaded.",
    });
  });

  it("reports both supporting-data failures without hiding the list", () => {
    expect(summarizeTransactionLoads(ok(), fail(), fail())).toEqual({
      loadError: null,
      accountsError: "The account list couldn't be loaded.",
      categoriesError: "The category list couldn't be loaded.",
    });
  });

  it("still reports supporting failures even when the list also failed", () => {
    const state = summarizeTransactionLoads(fail(), fail(), ok());
    expect(state.loadError).toBe(TRANSACTIONS_LOAD_ERROR);
    expect(state.accountsError).toBe("The account list couldn't be loaded.");
    // The view renders the full error panel (not the warning) in this case.
  });
});