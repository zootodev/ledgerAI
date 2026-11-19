import { describe, expect, it } from "vitest";
import {
  extractCounterpartyKey,
  normalizeNarration,
} from "@/lib/import/narration";

describe("normalizeNarration", () => {
  it("strips NIP/NIBSS/TRF/FT plumbing and keeps the counterparty", () => {
    expect(normalizeNarration("NIP CREDIT FROM JOHN DOE 0123456789")).toBe("JOHN DOE");
    expect(normalizeNarration("NIBSS FT TRF TO ADA OKAFOR REF 20261119/8871")).toBe(
      "ADA OKAFOR",
    );
  });

  it("strips references, session numbers, terminal ids and card masks", () => {
    expect(
      normalizeNarration("POS TERMINAL 12345678 CHOWDECK SESSION ABC-9981 06NOV2026"),
    ).toBe("POS CHOWDECK");
    expect(normalizeNarration("VIA OPAY ****1711 1234-5678-9012-3456")).toBe("");
  });

  it("strips VIA/FROM/TO wrappers but keeps the merchant word", () => {
    expect(normalizeNarration("VIA FROM TO GLovo 09/11/2026")).toBe("GLOVO");
  });

  it("keeps financial signal words that the merchant-key stopwords remove", () => {
    expect(normalizeNarration("SALARY PAYMENT")).toBe("SALARY PAYMENT");
    expect(normalizeNarration("INTEREST EARNED")).toBe("INTEREST EARNED");
    expect(normalizeNarration("AIRTIME PURCHASE")).toBe("AIRTIME PURCHASE");
    expect(normalizeNarration("POS WITHDRAWAL")).toBe("POS WITHDRAWAL");
  });
});

describe("extractCounterpartyKey", () => {
  it("is stable for the same person across different bank wordings", () => {
    const gtbank = extractCounterpartyKey("GTBANK TRF FROM MR JOHN DOE REF 20261119/8871");
    const opay = extractCounterpartyKey("OPAY NIP CREDIT FROM JOHN DOE ****1711");
    expect(gtbank).toBe("JOHN");
    expect(opay).toBe("JOHN");
    expect(gtbank).toBe(opay);
  });

  it("returns null when only plumbing survives", () => {
    expect(extractCounterpartyKey("NIP TRANSFER REF 12345678")).toBeNull();
    expect(extractCounterpartyKey("OPAY OWEALTH WALLET ****1711")).toBe("OWEALTH");
  });
});
